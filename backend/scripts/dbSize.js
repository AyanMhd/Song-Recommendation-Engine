// Quick utility: report Neon database size, per-table sizes, and row counts.
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const size = await pool.query(
    "select pg_size_pretty(pg_database_size(current_database())) as total, pg_database_size(current_database())::bigint as bytes"
  );
  const tables = await pool.query(
    "select relname, pg_size_pretty(pg_total_relation_size(relid)) as size, pg_total_relation_size(relid)::bigint as bytes from pg_catalog.pg_statio_user_tables order by bytes desc"
  );
  const counts = await pool.query(
    "select (select count(*) from artists) as artists, (select count(*) from songs) as songs, (select count(*) from lyrics) as lyrics, (select count(*) from song_embeddings) as song_embeddings, (select count(*) from chunk_embeddings) as chunk_embeddings"
  );

  console.log("Total database size:", size.rows[0].total);
  console.log("\nRow counts:", counts.rows[0]);
  console.log("\nLargest tables (incl. indexes):");
  for (const t of tables.rows) {
    console.log(`  ${t.relname.padEnd(24)} ${t.size}`);
  }
  await pool.end();
})().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
