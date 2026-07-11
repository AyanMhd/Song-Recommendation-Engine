// Fetches an artist photo URL from the Deezer API (free, no key required)
// and stores it on the artists row. Only the URL is stored, not the image.
require("../src/config");

const pool = require("../src/db/connection");
const { findArtistByName } = require("../src/db/queries");
const { normalizeKey } = require("../shared/text");

async function lookupDeezerImage(artistName) {
  const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Deezer request failed with status ${response.status}`);
  }

  const data = await response.json();
  const candidates = data.data || [];

  if (!candidates.length) {
    return null;
  }

  const wanted = normalizeKey(artistName);
  const exact = candidates.find((item) => normalizeKey(item.name || "") === wanted);
  const match = exact || candidates[0];

  return match.picture_xl || match.picture_big || match.picture_medium || null;
}

async function saveArtistImage(client, artistName) {
  const artist = await findArtistByName(client, artistName);

  if (!artist) {
    throw new Error(`Artist "${artistName}" not found in the database.`);
  }

  const imageUrl = await lookupDeezerImage(artist.name);

  if (!imageUrl) {
    console.log(`No Deezer image found for ${artist.name}.`);
    return null;
  }

  await client.query(
    `UPDATE artists SET image_url = $2, updated_at = NOW() WHERE id = $1`,
    [artist.id, imageUrl]
  );

  console.log(`Saved image for ${artist.name}: ${imageUrl}`);
  return imageUrl;
}

async function runFetchArtistImage(artistName) {
  const client = await pool.connect();

  try {
    return await saveArtistImage(client, artistName);
  } finally {
    client.release();
  }
}

async function main() {
  const artistName = process.argv.slice(2).join(" ").trim();

  if (!artistName) {
    throw new Error('Usage: node scripts/fetchArtistImage.js "Artist Name"');
  }

  await runFetchArtistImage(artistName);
  await pool.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { runFetchArtistImage };
