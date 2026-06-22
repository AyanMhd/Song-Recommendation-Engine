const { normalizeKey, normalizeSongTitle } = require("../../shared/text");

const THEME_NAMES = ["struggle", "uplifting", "introspective", "love", "party"];
const EMBEDDING_MODEL = "all-MiniLM-L6-v2";
const THEME_MODEL_VERSION = "theme_definitions_v1";

function toVectorLiteral(values) {
  if (!Array.isArray(values) || !values.length) {
    throw new Error("Embedding must be a non-empty array.");
  }

  return `[${values.map((value) => Number(value)).join(",")}]`;
}

function parseEmbedding(row) {
  if (!row) {
    return [];
  }

  if (Array.isArray(row)) {
    return row.map(Number);
  }

  if (typeof row === "string") {
    return row
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map(Number);
  }

  return [];
}

async function upsertArtist(client, { name, musicbrainzId = null }) {
  const nameNormalized = normalizeKey(name);
  const result = await client.query(
    `INSERT INTO artists (name, name_normalized, musicbrainz_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (name_normalized) DO UPDATE
       SET name = EXCLUDED.name,
           musicbrainz_id = COALESCE(EXCLUDED.musicbrainz_id, artists.musicbrainz_id),
           updated_at = NOW()
     RETURNING id, name, name_normalized`,
    [name, nameNormalized, musicbrainzId]
  );

  return result.rows[0];
}

async function findArtistByName(client, artistName) {
  const normalized = normalizeKey(artistName);
  const exact = await client.query(
    `SELECT id, name, name_normalized
     FROM artists
     WHERE name_normalized = $1`,
    [normalized]
  );

  if (exact.rows.length) {
    return exact.rows[0];
  }

  const fuzzy = await client.query(
    `SELECT id, name, name_normalized
     FROM artists
     WHERE name_normalized LIKE '%' || $1 || '%'
     ORDER BY LENGTH(name)
     LIMIT 1`,
    [normalized]
  );

  return fuzzy.rows[0] || null;
}

async function upsertSong(client, artistId, song) {
  const title = song.title || "";
  const titleNormalized = normalizeSongTitle(title);
  const sourceCredits = Array.isArray(song.source_artist_credit) ? song.source_artist_credit : [];

  const result = await client.query(
    `INSERT INTO songs (
       artist_id, title, title_normalized, source_release,
       source_artist_credit, processing_status
     )
     VALUES ($1, $2, $3, $4, $5, 'pending_lyrics')
     ON CONFLICT (artist_id, title_normalized) DO UPDATE
       SET title = EXCLUDED.title,
           source_release = COALESCE(EXCLUDED.source_release, songs.source_release),
           source_artist_credit = CASE
             WHEN cardinality(EXCLUDED.source_artist_credit) > 0
             THEN EXCLUDED.source_artist_credit
             ELSE songs.source_artist_credit
           END,
           updated_at = NOW()
     RETURNING id, title, title_normalized, processing_status`,
    [artistId, title, titleNormalized, song.source_release || null, sourceCredits]
  );

  return result.rows[0];
}

async function upsertSongs(client, artistId, songs) {
  const saved = [];

  for (const song of songs) {
    saved.push(await upsertSong(client, artistId, song));
  }

  return saved;
}

async function getSongsForArtist(client, artistId) {
  const result = await client.query(
    `SELECT s.id, s.title, s.title_normalized, s.processing_status,
            s.source_release, s.source_artist_credit,
            l.raw_lyrics, l.clean_lyrics, l.genius_url
     FROM songs s
     LEFT JOIN lyrics l ON l.song_id = s.id
     WHERE s.artist_id = $1
     ORDER BY s.title`,
    [artistId]
  );

  return result.rows;
}

async function upsertLyrics(client, songId, { rawLyrics = "", geniusUrl = null }) {
  const hasLyrics = Boolean(rawLyrics && rawLyrics.trim());
  const result = await client.query(
    `INSERT INTO lyrics (song_id, raw_lyrics, genius_url, fetched_at)
     VALUES ($1, $2, $3, CASE WHEN $4 THEN NOW() ELSE NULL END)
     ON CONFLICT (song_id) DO UPDATE
       SET raw_lyrics = EXCLUDED.raw_lyrics,
           genius_url = COALESCE(EXCLUDED.genius_url, lyrics.genius_url),
           fetched_at = CASE WHEN $4 THEN NOW() ELSE lyrics.fetched_at END
     RETURNING id, song_id, raw_lyrics`,
    [songId, rawLyrics || "", geniusUrl, hasLyrics]
  );

  await client.query(
    `UPDATE songs
     SET processing_status = CASE
           WHEN $2 THEN 'pending_embed'
           ELSE 'pending_lyrics'
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [songId, hasLyrics]
  );

  return result.rows[0];
}

async function getSongsNeedingLyrics(client, artistId, { refresh = false } = {}) {
  const result = await client.query(
    `SELECT s.id, s.title, s.title_normalized,
            COALESCE(l.raw_lyrics, '') AS raw_lyrics
     FROM songs s
     LEFT JOIN lyrics l ON l.song_id = s.id
     WHERE s.artist_id = $1
       AND ($2 OR COALESCE(l.raw_lyrics, '') = '')
     ORDER BY s.title`,
    [artistId, refresh]
  );

  return result.rows;
}

async function getSongsNeedingEmbed(client, artistId, { reembed = false } = {}) {
  const result = await client.query(
    `SELECT s.id, s.title, a.name AS artist,
            COALESCE(l.raw_lyrics, '') AS raw_lyrics
     FROM songs s
     JOIN artists a ON a.id = s.artist_id
     JOIN lyrics l ON l.song_id = s.id
     WHERE s.artist_id = $1
       AND COALESCE(l.raw_lyrics, '') <> ''
       AND ($2 OR s.processing_status IN ('pending_embed', 'pending_lyrics')
            OR NOT EXISTS (SELECT 1 FROM song_embeddings se WHERE se.song_id = s.id))
     ORDER BY s.title`,
    [artistId, reembed]
  );

  return result.rows;
}

async function clearSongDerivedData(client, songId) {
  await client.query(`DELETE FROM chunk_embeddings WHERE song_id = $1`, [songId]);
  await client.query(
    `DELETE FROM lyric_chunks
     WHERE song_id = $1`,
    [songId]
  );
  await client.query(`DELETE FROM song_embeddings WHERE song_id = $1`, [songId]);
  await client.query(`DELETE FROM song_theme_scores WHERE song_id = $1`, [songId]);
}

async function saveProcessedSong(client, artistId, songId, payload) {
  const { cleanLyrics, chunks, embedding, themes } = payload;

  await clearSongDerivedData(client, songId);

  await client.query(
    `INSERT INTO lyrics (song_id, raw_lyrics, clean_lyrics, fetched_at)
     VALUES ($1, COALESCE((SELECT raw_lyrics FROM lyrics WHERE song_id = $1), ''), $2, NOW())
     ON CONFLICT (song_id) DO UPDATE
       SET clean_lyrics = EXCLUDED.clean_lyrics`,
    [songId, cleanLyrics]
  );

  const chunkRows = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const inserted = await client.query(
      `INSERT INTO lyric_chunks (song_id, chunk_index, text)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [songId, index, chunk.text]
    );
    chunkRows.push({
      id: inserted.rows[0].id,
      embedding: chunk.embedding,
    });
  }

  await client.query(
    `INSERT INTO song_embeddings (song_id, artist_id, embedding, model_name)
     VALUES ($1, $2, $3::vector, $4)
     ON CONFLICT (song_id) DO UPDATE
       SET artist_id = EXCLUDED.artist_id,
           embedding = EXCLUDED.embedding,
           model_name = EXCLUDED.model_name,
           embedded_at = NOW()`,
    [songId, artistId, toVectorLiteral(embedding), EMBEDDING_MODEL]
  );

  for (const chunk of chunkRows) {
    await client.query(
      `INSERT INTO chunk_embeddings (chunk_id, song_id, artist_id, embedding, model_name)
       VALUES ($1, $2, $3, $4::vector, $5)
       ON CONFLICT (chunk_id) DO UPDATE
         SET embedding = EXCLUDED.embedding,
             model_name = EXCLUDED.model_name,
             embedded_at = NOW()`,
      [chunk.id, songId, artistId, toVectorLiteral(chunk.embedding), EMBEDDING_MODEL]
    );
  }

  await client.query(
    `INSERT INTO song_theme_scores (
       song_id, struggle, uplifting, introspective, love, party, theme_model_version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (song_id) DO UPDATE
       SET struggle = EXCLUDED.struggle,
           uplifting = EXCLUDED.uplifting,
           introspective = EXCLUDED.introspective,
           love = EXCLUDED.love,
           party = EXCLUDED.party,
           theme_model_version = EXCLUDED.theme_model_version,
           computed_at = NOW()`,
    [
      songId,
      Number(themes.struggle) || 0,
      Number(themes.uplifting) || 0,
      Number(themes.introspective) || 0,
      Number(themes.love) || 0,
      Number(themes.party) || 0,
      THEME_MODEL_VERSION,
    ]
  );

  await client.query(
    `UPDATE songs
     SET processing_status = 'embedded',
         updated_at = NOW()
     WHERE id = $1`,
    [songId]
  );
}

async function markSongSkipped(client, songId) {
  await client.query(
    `UPDATE songs
     SET processing_status = 'skipped_no_lyrics',
         updated_at = NOW()
     WHERE id = $1`,
    [songId]
  );
}

async function findSongByTitle(client, artistId, title) {
  const normalized = normalizeSongTitle(title);
  const exact = await client.query(
    `SELECT s.id, s.title, a.name AS artist
     FROM songs s
     JOIN artists a ON a.id = s.artist_id
     WHERE s.artist_id = $1 AND s.title_normalized = $2`,
    [artistId, normalized]
  );

  if (exact.rows.length) {
    return exact.rows[0];
  }

  const fuzzy = await client.query(
    `SELECT s.id, s.title, a.name AS artist
     FROM songs s
     JOIN artists a ON a.id = s.artist_id
     WHERE s.artist_id = $1 AND s.title_normalized LIKE '%' || $2 || '%'
     ORDER BY LENGTH(s.title)
     LIMIT 1`,
    [artistId, normalized]
  );

  return fuzzy.rows[0] || null;
}

async function getSongEmbedding(client, songId) {
  const result = await client.query(
    `SELECT se.song_id, se.embedding, s.title, a.name AS artist
     FROM song_embeddings se
     JOIN songs s ON s.id = se.song_id
     JOIN artists a ON a.id = se.artist_id
     WHERE se.song_id = $1`,
    [songId]
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  return {
    song_id: row.song_id,
    title: row.title,
    artist: row.artist,
    embedding: parseEmbedding(row.embedding),
  };
}

async function setVectorSearchParams(client) {
  const efSearch = Number(process.env.HNSW_EF_SEARCH) || 100;
  await client.query(`SET hnsw.ef_search = ${efSearch}`);
}

async function searchSongEmbeddings(client, artistId, queryEmbedding, limit = 50) {
  await setVectorSearchParams(client);
  const vector = toVectorLiteral(queryEmbedding);
  const result = await client.query(
    `SELECT s.id AS song_id, s.title, a.name AS artist,
            1 - (se.embedding <=> $1::vector) AS similarity,
            se.embedding
     FROM song_embeddings se
     JOIN songs s ON s.id = se.song_id
     JOIN artists a ON a.id = se.artist_id
     WHERE se.artist_id = $2
     ORDER BY se.embedding <=> $1::vector
     LIMIT $3`,
    [vector, artistId, limit]
  );

  return result.rows.map((row) => ({
    song_id: row.song_id,
    title: row.title,
    artist: row.artist,
    similarity: Number(row.similarity),
    embedding: parseEmbedding(row.embedding),
  }));
}

async function searchChunkEmbeddings(client, artistId, queryEmbedding, limit = 100) {
  await setVectorSearchParams(client);
  const vector = toVectorLiteral(queryEmbedding);
  const result = await client.query(
    `SELECT ce.song_id, lc.text AS chunk_text,
            1 - (ce.embedding <=> $1::vector) AS similarity
     FROM chunk_embeddings ce
     JOIN lyric_chunks lc ON lc.id = ce.chunk_id
     WHERE ce.artist_id = $2
     ORDER BY ce.embedding <=> $1::vector
     LIMIT $3`,
    [vector, artistId, limit]
  );

  return result.rows.map((row) => ({
    song_id: row.song_id,
    chunk_text: row.chunk_text,
    similarity: Number(row.similarity),
  }));
}

async function getThemeScoresForSongs(client, songIds) {
  if (!songIds.length) {
    return new Map();
  }

  const result = await client.query(
    `SELECT song_id, struggle, uplifting, introspective, love, party
     FROM song_theme_scores
     WHERE song_id = ANY($1::int[])`,
    [songIds]
  );

  const themeMap = new Map();

  for (const row of result.rows) {
    themeMap.set(row.song_id, {
      struggle: Number(row.struggle),
      uplifting: Number(row.uplifting),
      introspective: Number(row.introspective),
      love: Number(row.love),
      party: Number(row.party),
    });
  }

  return themeMap;
}

async function getSongsByIds(client, songIds) {
  if (!songIds.length) {
    return new Map();
  }

  const result = await client.query(
    `SELECT s.id AS song_id, s.title, a.name AS artist
     FROM songs s
     JOIN artists a ON a.id = s.artist_id
     WHERE s.id = ANY($1::int[])`,
    [songIds]
  );

  return new Map(result.rows.map((row) => [row.song_id, row]));
}

async function getEmbeddedSongCount(client, artistId) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM songs
     WHERE artist_id = $1 AND processing_status = 'embedded'`,
    [artistId]
  );

  return result.rows[0]?.count || 0;
}

async function startIngestionRun(client, artistId, stage) {
  const result = await client.query(
    `INSERT INTO ingestion_runs (artist_id, stage, status)
     VALUES ($1, $2, 'running')
     RETURNING id`,
    [artistId, stage]
  );

  return result.rows[0].id;
}

async function finishIngestionRun(client, runId, status, metadata = {}) {
  await client.query(
    `UPDATE ingestion_runs
     SET status = $2,
         metadata = $3,
         finished_at = NOW()
     WHERE id = $1`,
    [runId, status, metadata]
  );
}

async function withTransaction(callback) {
  const pool = require("./connection");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  THEME_NAMES,
  toVectorLiteral,
  parseEmbedding,
  upsertArtist,
  findArtistByName,
  upsertSong,
  upsertSongs,
  getSongsForArtist,
  upsertLyrics,
  getSongsNeedingLyrics,
  getSongsNeedingEmbed,
  saveProcessedSong,
  markSongSkipped,
  findSongByTitle,
  getSongEmbedding,
  searchSongEmbeddings,
  searchChunkEmbeddings,
  getThemeScoresForSongs,
  getSongsByIds,
  getEmbeddedSongCount,
  startIngestionRun,
  finishIngestionRun,
  withTransaction,
};
