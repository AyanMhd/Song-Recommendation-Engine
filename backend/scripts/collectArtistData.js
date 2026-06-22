const { runFetchSongs } = require("./fetchSongs");
const { runFetchLyrics } = require("./fetchLyrics");

async function main() {
  const artistName = process.argv.slice(2).join(" ").trim();

  if (!artistName) {
    throw new Error('Usage: node scripts/collectArtistData.js "Artist Name"');
  }

  const songsData = await runFetchSongs(artistName);
  console.log(`Fetched ${songsData.songs.length} unique tracks for ${songsData.artist}.`);

  const lyricsResult = await runFetchLyrics({ artistName: songsData.artist, refresh: false });
  console.log(
    `Lyrics pipeline complete for ${lyricsResult.artist}: ${lyricsResult.withLyrics || 0} songs with lyrics.`
  );
  console.log('Run preprocessing next: python ml/preprocess.py "' + songsData.artist + '"');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
