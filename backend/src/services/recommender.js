const pool = require("../db/connection");
const { normalizeSongTitle } = require("../../shared/text");
const { searchResultLimit } = require("../config");
const { embedText } = require("./pythonBridge");
const { blendVectors, cosineSimilarity, roundScore } = require("../utils/math");
const {
  THEME_NAMES,
  findArtistByName,
  findSongByTitle,
  getEmbeddedSongCount,
  getSongEmbedding,
  getSongsByIds,
  getThemeScoresForSongs,
  searchChunkEmbeddings,
  searchSongEmbeddings,
} = require("../db/queries");

function buildYouTubeSearchUrl(artist, title) {
  const query = encodeURIComponent(`${artist} ${title}`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

function getThemeVector(themeMap = {}) {
  return THEME_NAMES.map((theme) => Number(themeMap[theme] || 0));
}

function mergeCandidates(songHits, chunkHits) {
  const merged = new Map();

  for (const hit of songHits) {
    merged.set(hit.song_id, {
      song_id: hit.song_id,
      title: hit.title,
      artist: hit.artist,
      embedding: hit.embedding,
      semanticSimilarity: hit.similarity,
      matchedChunk: "",
    });
  }

  for (const hit of chunkHits) {
    const existing = merged.get(hit.song_id);

    if (!existing) {
      merged.set(hit.song_id, {
        song_id: hit.song_id,
        title: null,
        artist: null,
        embedding: null,
        semanticSimilarity: hit.similarity,
        matchedChunk: hit.chunk_text,
      });
      continue;
    }

    if (hit.similarity > existing.semanticSimilarity) {
      existing.semanticSimilarity = hit.similarity;
      existing.matchedChunk = hit.chunk_text;
    } else if (!existing.matchedChunk) {
      existing.matchedChunk = hit.chunk_text;
    }
  }

  return merged;
}

function applyDiversityRerank(scoredSongs, limit) {
  const remaining = [...scoredSongs].sort((left, right) => right.finalScore - left.finalScore);
  const selected = [];

  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestAdjustedScore = -Infinity;

    remaining.forEach((candidate, index) => {
      const maxSimilarity = selected.length
        ? Math.max(
            ...selected.map((picked) => cosineSimilarity(candidate.embedding || [], picked.embedding || []))
          )
        : 0;
      const adjustedScore = candidate.finalScore - 0.08 * maxSimilarity;

      if (adjustedScore > bestAdjustedScore) {
        bestIndex = index;
        bestAdjustedScore = adjustedScore;
      }
    });

    const [chosen] = remaining.splice(bestIndex, 1);
    chosen.score = bestAdjustedScore;
    selected.push(chosen);
  }

  return selected;
}

async function searchSongs({ artist, vibeText, exampleSong, limit = searchResultLimit }) {
  const client = await pool.connect();

  try {
    const artistRow = await findArtistByName(client, artist);

    if (!artistRow) {
      const error = new Error(`No processed songs found for artist "${artist}".`);
      error.statusCode = 404;
      throw error;
    }

    const embeddedCount = await getEmbeddedSongCount(client, artistRow.id);

    if (!embeddedCount) {
      const error = new Error(
        "No embedded songs found. Run the data collection and preprocessing pipeline first."
      );
      error.statusCode = 400;
      throw error;
    }

    const vibeFeatures = await embedText(vibeText);
    let queryEmbedding = vibeFeatures.embedding || [];
    let exampleEntry = null;

    if (exampleSong) {
      exampleEntry = await findSongByTitle(client, artistRow.id, exampleSong);

      if (!exampleEntry) {
        const error = new Error(
          `Example song "${exampleSong}" was not found in the processed library for ${artist}.`
        );
        error.statusCode = 404;
        throw error;
      }

      const exampleEmbedding = await getSongEmbedding(client, exampleEntry.id);

      if (!exampleEmbedding) {
        const error = new Error(`Example song "${exampleSong}" has no embedding yet.`);
        error.statusCode = 404;
        throw error;
      }

      queryEmbedding = blendVectors(exampleEmbedding.embedding || [], vibeFeatures.embedding || [], 0.7, 0.3);
      exampleEntry = {
        ...exampleEntry,
        embedding: exampleEmbedding.embedding,
      };
    }

    const candidateLimit = Math.max(Number(limit) || searchResultLimit, 10) * 5;
    const [songHits, chunkHits] = await Promise.all([
      searchSongEmbeddings(client, artistRow.id, queryEmbedding, candidateLimit),
      searchChunkEmbeddings(client, artistRow.id, queryEmbedding, candidateLimit * 2),
    ]);

    const merged = mergeCandidates(songHits, chunkHits);
    const songIds = [...merged.keys()];
    const [themeMap, songMeta] = await Promise.all([
      getThemeScoresForSongs(client, songIds),
      getSongsByIds(client, songIds),
    ]);
    const queryThemeVector = getThemeVector(vibeFeatures.themes || {});
    const excludedTitle = exampleEntry ? normalizeSongTitle(exampleEntry.title) : null;

    const scoredSongs = [];

    for (const candidate of merged.values()) {
      const meta = songMeta.get(candidate.song_id);
      const title = candidate.title || meta?.title;
      const artistName = candidate.artist || meta?.artist;

      if (!title || !artistName) {
        continue;
      }

      if (excludedTitle && normalizeSongTitle(title) === excludedTitle) {
        continue;
      }

      const themes = themeMap.get(candidate.song_id) || {};
      const themeAlignment = Math.max(0, cosineSimilarity(queryThemeVector, getThemeVector(themes)));
      const semanticSimilarity = Math.max(0, candidate.semanticSimilarity || 0);
      const finalScore = 0.7 * semanticSimilarity + 0.3 * themeAlignment;

      if (!candidate.embedding) {
        const songEmbedding = await getSongEmbedding(client, candidate.song_id);
        candidate.embedding = songEmbedding?.embedding || [];
      }

      scoredSongs.push({
        title,
        artist: artistName,
        embedding: candidate.embedding,
        matchedChunk: candidate.matchedChunk,
        semanticSimilarity,
        themeAlignment,
        finalScore,
        themes,
      });
    }

    if (!scoredSongs.length) {
      const error = new Error(`No processed songs found for artist "${artist}".`);
      error.statusCode = 404;
      throw error;
    }

    const rerankedSongs = applyDiversityRerank(
      scoredSongs,
      Math.min(Number(limit) || searchResultLimit, 10)
    );

    return rerankedSongs.map((song) => ({
      title: song.title,
      artist: song.artist,
      score: roundScore(song.score ?? song.finalScore),
      semantic_similarity: roundScore(song.semanticSimilarity),
      theme_alignment: roundScore(song.themeAlignment),
      youtube_url: buildYouTubeSearchUrl(song.artist, song.title),
      themes: Object.fromEntries(
        Object.entries(song.themes || {}).map(([key, value]) => [key, roundScore(Number(value || 0))])
      ),
    }));
  } finally {
    client.release();
  }
}

module.exports = {
  searchSongs,
};
