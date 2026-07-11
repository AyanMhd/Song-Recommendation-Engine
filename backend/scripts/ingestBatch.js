// Batch-ingests a list of artists end to end:
//   collect (songs + image + lyrics) -> preprocess (embeddings) -> size check.
// Stops (and removes the last artist) if the database would exceed the
// free-tier storage budget.
require("../src/config");

const path = require("path");
const { spawnSync } = require("child_process");
const pool = require("../src/db/connection");
const { removeArtist } = require("./removeArtist");
const { findArtistByName } = require("../src/db/queries");

// Resume unfinished artists first, then the rest of the list.
const ARTISTS = [
  "Kid Cudi",
  "Travis Scott",
  "A$AP Rocky",
  "Kanye West",
  "The Strokes",
  "Drake",
  "Pink Floyd",
  "JAY-Z",
  "Nas",
  "André 3000",
  "Kendrick Lamar",
  "Snoop Dogg",
  "50 Cent",
  "Rick Ross",
  "Pusha T",
  "Future",
  "Eminem",
];

const BYTE_LIMIT = 480 * 1024 * 1024; // stay under Neon's 512 MB free tier
const ROOT_DIR = path.join(__dirname, "..", "..");
const BACKEND_DIR = path.join(__dirname, "..");
const PYTHON_BIN = path.join(ROOT_DIR, ".venv", "Scripts", "python.exe");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  return result.status === 0;
}

async function dbBytes() {
  const result = await pool.query(
    "select pg_database_size(current_database())::bigint as bytes"
  );
  return Number(result.rows[0].bytes);
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

async function getArtistProgress(artistName) {
  const client = await pool.connect();

  try {
    const artist = await findArtistByName(client, artistName);

    if (!artist) {
      return null;
    }

    const result = await client.query(
      `SELECT
         COUNT(s.id)::int AS total,
         COUNT(s.id) FILTER (WHERE s.processing_status = 'embedded')::int AS embedded,
         COUNT(s.id) FILTER (
           WHERE COALESCE(l.raw_lyrics, '') <> ''
             AND s.processing_status <> 'embedded'
         )::int AS needs_embed
       FROM songs s
       LEFT JOIN lyrics l ON l.song_id = s.id
       WHERE s.artist_id = $1`,
      [artist.id]
    );

    return { name: artist.name, ...result.rows[0] };
  } finally {
    client.release();
  }
}

async function main() {
  const summary = [];

  for (const artist of ARTISTS) {
    console.log(`\n================ BATCH: ${artist} ================`);

    const progress = await getArtistProgress(artist);

    if (progress && progress.embedded > 0 && progress.needs_embed === 0) {
      console.log(
        `BATCH: skipping ${progress.name} (${progress.embedded}/${progress.total} songs already embedded).`
      );
      summary.push({ artist: progress.name, status: "skipped_done", db_mb: null });
      continue;
    }

    if (progress) {
      console.log(
        `BATCH: resuming ${progress.name} (${progress.embedded} embedded, ${progress.needs_embed} need embed, ${progress.total} total songs).`
      );
    }

    const collected = run(
      process.execPath,
      [path.join(BACKEND_DIR, "scripts", "collectArtistData.js"), artist],
      BACKEND_DIR
    );

    if (!collected) {
      console.error(`BATCH: collection had errors for ${artist}, will still try preprocess if songs exist.`);
    }

    const embedded = run(PYTHON_BIN, [path.join(ROOT_DIR, "ml", "preprocess.py"), artist], ROOT_DIR);

    if (!embedded) {
      console.error(`BATCH: preprocessing FAILED for ${artist}.`);
      summary.push({ artist, status: "embed_failed" });
      continue;
    }

    const bytes = await dbBytes();
    console.log(`BATCH: database now ${mb(bytes)} MB after ${artist}.`);

    if (bytes > BYTE_LIMIT) {
      console.error(
        `BATCH: limit exceeded (${mb(bytes)} MB > ${mb(BYTE_LIMIT)} MB). Removing ${artist} and stopping.`
      );
      await removeArtist(artist);
      summary.push({ artist, status: "removed_over_limit" });
      break;
    }

    summary.push({ artist, status: "done", db_mb: mb(bytes) });
  }

  console.log("\n================ BATCH SUMMARY ================");
  for (const item of summary) {
    console.log(`${item.artist}: ${item.status}${item.db_mb ? ` (db ${item.db_mb} MB)` : ""}`);
  }
  console.log("BATCH: COMPLETE");

  await pool.end();
}

main().catch((error) => {
  console.error("BATCH: fatal error:", error.message);
  process.exit(1);
});
