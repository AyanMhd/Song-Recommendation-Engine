const { writeJson } = require("../shared/fs");
const { songsPath } = require("../shared/paths");
const { fetchSongsForArtist } = require("./lib/musicbrainzClient");

async function runFetchSongs(artistName) {
  if (!artistName) {
    throw new Error('Usage: node scripts/fetchSongs.js "Artist Name"');
  }

  const songsData = await fetchSongsForArtist(artistName);
  await writeJson(songsPath, songsData);
  return songsData;
}

async function main() {
  const artistName = process.argv.slice(2).join(" ").trim();
  const songsData = await runFetchSongs(artistName);
  console.log(`Saved ${songsData.songs.length} songs for ${songsData.artist} to data/songs.json`);
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
