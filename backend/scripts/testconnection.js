require("../src/config");

const pool = require("../src/db/connection");
const { getEmbeddedSongCount } = require("../src/db/queries");

async function main() {
  const now = await pool.query("SELECT NOW() AS now");
  console.log("Connected:", now.rows[0].now);

  const extension = await pool.query(
    `SELECT extname FROM pg_extension WHERE extname = 'vector'`
  );
  console.log("pgvector installed:", extension.rows.length > 0);

  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name`
  );
  console.log("Tables:", tables.rows.map((row) => row.table_name).join(", ") || "(none)");

  const client = await pool.connect();
  try {
    const artists = await client.query(`SELECT COUNT(*)::int AS count FROM artists`);
    const songs = await client.query(`SELECT COUNT(*)::int AS count FROM songs`);
    const embedded = await client.query(
      `SELECT COUNT(*)::int AS count FROM songs WHERE processing_status = 'embedded'`
    );
    console.log(`Artists: ${artists.rows[0].count}, Songs: ${songs.rows[0].count}, Embedded: ${embedded.rows[0].count}`);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
