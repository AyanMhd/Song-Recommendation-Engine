const { runFetchSongs } = require("./fetchSongs");
const { runFetchLyrics } = require("./fetchLyrics");

async function main() {
  const artistName = process.argv.slice(2).join(" ").trim();

  if (!artistName) {
    throw new Error('Usage: node scripts/collectArtistData.js "Artist Name"');
  }

  const songsData = await runFetchSongs(artistName);
  console.log(`Fetched ${songsData.songs.length} unique tracks for ${songsData.artist}.`);
  await runFetchLyrics({ refresh: false });
  console.log("Saved merged song + lyrics data to data/songs.json");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
