const { readJson } = require("../../shared/fs");
const { normalizeKey, normalizeSongTitle } = require("../../shared/text");
const { processedSongsPath, searchResultLimit } = require("../config");
const { embedText } = require("./pythonBridge");
const { blendVectors, cosineSimilarity, roundScore } = require("../utils/math");

const THEME_NAMES = ["struggle", "uplifting", "introspective", "love", "party"];

function buildYouTubeSearchUrl(artist, title) {
  const query = encodeURIComponent(`${artist} ${title}`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

function getThemeVector(themeMap = {}) {
  return THEME_NAMES.map((theme) => Number(themeMap[theme] || 0));
}

function findArtistMatches(songs, artistName) {
  const target = normalizeKey(artistName);
  const exact = songs.filter((song) => normalizeKey(song.artist) === target);

  if (exact.length) {
    return exact;
  }

  return songs.filter((song) => normalizeKey(song.artist).includes(target));
}

function findExampleSong(songs, title) {
  const normalized = normalizeSongTitle(title);
  return (
    songs.find((song) => normalizeSongTitle(song.title) === normalized) ||
    songs.find((song) => normalizeSongTitle(song.title).includes(normalized)) ||
    null
  );
}

function getBestChunkMatch(queryEmbedding, song) {
  const chunks = Array.isArray(song.chunks) ? song.chunks : [];

  return chunks.reduce(
    (best, chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding || []);
      if (score > best.score) {
        return {
          score,
          text: chunk.text || "",
        };
      }

      return best;
    },
    { score: 0, text: "" }
  );
}

function applyDiversityRerank(scoredSongs, limit) {
  const remaining = [...scoredSongs].sort((left, right) => right.finalScore - left.finalScore);
  const selected = [];

  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestAdjustedScore = -Infinity;

    remaining.forEach((candidate, index) => {
      const maxSimilarity = selected.length
        ? Math.max(...selected.map((picked) => cosineSimilarity(candidate.embedding || [], picked.embedding || [])))
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
  const processedSongs = await readJson(processedSongsPath, []);

  if (!Array.isArray(processedSongs) || !processedSongs.length) {
    const error = new Error("No processed data found. Run the data collection and preprocessing pipeline first.");
    error.statusCode = 400;
    throw error;
  }

  const artistSongs = findArtistMatches(processedSongs, artist);

  if (!artistSongs.length) {
    const error = new Error(`No processed songs found for artist "${artist}".`);
    error.statusCode = 404;
    throw error;
  }

  const vibeFeatures = await embedText(vibeText);
  let queryEmbedding = vibeFeatures.embedding || [];
  let exampleEntry = null;

  if (exampleSong) {
    exampleEntry = findExampleSong(artistSongs, exampleSong);

    if (!exampleEntry) {
      const error = new Error(`Example song "${exampleSong}" was not found in the processed library for ${artist}.`);
      error.statusCode = 404;
      throw error;
    }

    queryEmbedding = blendVectors(exampleEntry.embedding || [], vibeFeatures.embedding || [], 0.7, 0.3);
  }

  const queryThemeVector = getThemeVector(vibeFeatures.themes || {});
  const excludedTitle = exampleEntry ? normalizeSongTitle(exampleEntry.title) : null;

  const scoredSongs = artistSongs
    .filter((song) => !excludedTitle || normalizeSongTitle(song.title) !== excludedTitle)
    .map((song) => {
      const wholeSongSimilarity = cosineSimilarity(queryEmbedding, song.embedding || []);
      const bestChunk = getBestChunkMatch(queryEmbedding, song);
      const semanticSimilarity = Math.max(0, wholeSongSimilarity, bestChunk.score);
      const themeAlignment = Math.max(0, cosineSimilarity(queryThemeVector, getThemeVector(song.themes || {})));
      const finalScore = 0.7 * semanticSimilarity + 0.3 * themeAlignment;

      return {
        title: song.title,
        artist: song.artist,
        embedding: song.embedding,
        matchedChunk: bestChunk.text,
        semanticSimilarity,
        themeAlignment,
        finalScore,
        themes: song.themes || {},
      };
    });

  const rerankedSongs = applyDiversityRerank(scoredSongs, Math.min(Number(limit) || searchResultLimit, 10));

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
}

module.exports = {
  searchSongs,
};
