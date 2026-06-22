const pool = require("../src/db/connection");
const {
  finishIngestionRun,
  startIngestionRun,
  upsertArtist,
  upsertSongs,
} = require("../src/db/queries");
const { fetchSongsForArtist } = require("./lib/musicbrainzClient");

async function runFetchSongs(artistName) {
  if (!artistName) {
    throw new Error('Usage: node scripts/fetchSongs.js "Artist Name"');
  }

  const songsData = await fetchSongsForArtist(artistName);
  const client = await pool.connect();
  let runId = null;

  try {
    await client.query("BEGIN");

    const artist = await upsertArtist(client, {
      name: songsData.artist,
      musicbrainzId: songsData.musicbrainz_id,
    });

    runId = await startIngestionRun(client, artist.id, "fetch_songs");
    await upsertSongs(client, artist.id, songsData.songs);
    await finishIngestionRun(client, runId, "completed", {
      song_count: songsData.songs.length,
    });

    await client.query("COMMIT");

    return {
      artist: artist.name,
      artist_id: artist.id,
      songs: songsData.songs,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (runId) {
      await finishIngestionRun(client, runId, "failed", { error: error.message });
    }

    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const artistName = process.argv.slice(2).join(" ").trim();
  const songsData = await runFetchSongs(artistName);
  console.log(`Saved ${songsData.songs.length} songs for ${songsData.artist} to PostgreSQL`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  runFetchSongs,
};
