// Deletes an artist and all related rows. Cascades via FKs; also clears
// any leftover song rows if an older schema lacked ON DELETE CASCADE.
require("../src/config");

const pool = require("../src/db/connection");
const { findArtistByName } = require("../src/db/queries");

async function removeArtist(artistName) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const artist = await findArtistByName(client, artistName);

    if (!artist) {
      await client.query("ROLLBACK");
      console.log(`Artist "${artistName}" not found; nothing to remove.`);
      return false;
    }

    await client.query(`DELETE FROM songs WHERE artist_id = $1`, [artist.id]);
    await client.query(`DELETE FROM artists WHERE id = $1`, [artist.id]);
    await client.query("COMMIT");
    console.log(`Removed ${artist.name} and all related data.`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const artistName = process.argv.slice(2).join(" ").trim();

  if (!artistName) {
    throw new Error('Usage: node scripts/removeArtist.js "Artist Name"');
  }

  await removeArtist(artistName);
  await pool.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { removeArtist };
