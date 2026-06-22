const pool = require("../src/db/connection");
const {
  findArtistByName,
  finishIngestionRun,
  getSongsNeedingLyrics,
  startIngestionRun,
  upsertLyrics,
} = require("../src/db/queries");
const { searchSongOnGenius } = require("./lib/geniusClient");
const { scrapeLyricsFromGenius } = require("./lib/lyricsScraper");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFetchLyrics(options = {}) {
  const refresh = Boolean(options.refresh);
  const artistName = options.artistName?.trim();

  if (!artistName) {
    throw new Error('Artist name is required. Usage: node scripts/fetchLyrics.js "Artist Name"');
  }

  const client = await pool.connect();
  let runId = null;

  try {
    const artist = await findArtistByName(client, artistName);

    if (!artist) {
      throw new Error(`Artist "${artistName}" was not found in PostgreSQL. Run fetchSongs first.`);
    }

    const songs = await getSongsNeedingLyrics(client, artist.id, { refresh });

    if (!songs.length) {
      return { artist: artist.name, songs: [] };
    }

    runId = await startIngestionRun(client, artist.id, "fetch_lyrics");
    let withLyrics = 0;
    let completed = 0;

    for (const song of songs) {
      let rawLyrics = "";
      let geniusUrl = null;

      try {
        const result = await searchSongOnGenius(artist.name, song.title);

        if (result?.url) {
          geniusUrl = result.url;
          rawLyrics = await scrapeLyricsFromGenius(result.url);
        }
      } catch (error) {
        console.warn(`Failed to fetch lyrics for "${song.title}": ${error.message}`);
      }

      await upsertLyrics(client, song.id, { rawLyrics, geniusUrl });

      if (rawLyrics) {
        withLyrics += 1;
      }

      completed += 1;
      await sleep(350);
      console.log(`[${completed}/${songs.length}] Processed "${song.title}"`);
    }

    await finishIngestionRun(client, runId, "completed", {
      processed: songs.length,
      with_lyrics: withLyrics,
    });

    return { artist: artist.name, processed: songs.length, withLyrics };
  } catch (error) {
    if (runId) {
      await finishIngestionRun(client, runId, "failed", { error: error.message });
    }

    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const artistName = process.argv
    .slice(2)
    .filter((arg) => arg !== "--refresh")
    .join(" ")
    .trim();
  const result = await runFetchLyrics({ artistName, refresh });
  console.log(
    `Fetched lyrics for ${result.withLyrics || 0} of ${result.processed || 0} songs for ${result.artist}.`
  );
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
