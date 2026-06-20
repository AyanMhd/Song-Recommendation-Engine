const { readJson, writeJson } = require("../shared/fs");
const { songsPath } = require("../shared/paths");
const { searchSongOnGenius } = require("./lib/geniusClient");
const { scrapeLyricsFromGenius } = require("./lib/lyricsScraper");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFetchLyrics(options = {}) {
  const refresh = Boolean(options.refresh);
  const songsData = await readJson(songsPath, { artist: "", songs: [] });

  if (!songsData.artist || !Array.isArray(songsData.songs) || !songsData.songs.length) {
    throw new Error("data/songs.json is empty. Run fetchSongs first.");
  }

  let completed = 0;

  for (const song of songsData.songs) {
    if (!refresh && song.lyrics) {
      completed += 1;
      continue;
    }

    try {
      const result = await searchSongOnGenius(songsData.artist, song.title);

      if (!result?.url) {
        song.lyrics = "";
      } else {
        song.lyrics = await scrapeLyricsFromGenius(result.url);
      }
    } catch (error) {
      console.warn(`Failed to fetch lyrics for "${song.title}": ${error.message}`);
      song.lyrics = "";
    }

    completed += 1;
    await writeJson(songsPath, songsData);
    await sleep(350);
    console.log(`[${completed}/${songsData.songs.length}] Processed "${song.title}"`);
  }

  return songsData;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const songsData = await runFetchLyrics({ refresh });
  const withLyrics = songsData.songs.filter((song) => song.lyrics).length;
  console.log(`Fetched lyrics for ${withLyrics} of ${songsData.songs.length} songs.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  runFetchLyrics,
};
