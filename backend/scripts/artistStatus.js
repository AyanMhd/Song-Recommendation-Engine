require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const pool = require("../src/db/connection");

(async () => {
  const result = await pool.query(`
    SELECT
      a.name,
      a.image_url IS NOT NULL AS has_image,
      COUNT(s.id)::int AS total_songs,
      COUNT(s.id) FILTER (WHERE COALESCE(l.raw_lyrics, '') <> '')::int AS with_lyrics,
      COUNT(s.id) FILTER (WHERE s.processing_status = 'embedded')::int AS embedded
    FROM artists a
    LEFT JOIN songs s ON s.artist_id = a.id
    LEFT JOIN lyrics l ON l.song_id = s.id
    GROUP BY a.id, a.name, a.image_url
    ORDER BY a.name
  `);
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
