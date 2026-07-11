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
const { fetchLyricsFromLrclib } = require("./lib/lrclibClient");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withClient(callback, { retries = 3 } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const client = await pool.connect();

    client.on("error", (error) => {
      console.warn(`Postgres client error: ${error.message}`);
    });

    try {
      return await callback(client);
    } catch (error) {
      lastError = error;
      const retryable =
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        /Connection terminated|connection terminated/i.test(error.message || "");

      if (!retryable || attempt === retries) {
        throw error;
      }

      console.warn(`DB retry ${attempt}/${retries}: ${error.message}`);
      await sleep(500 * attempt);
    } finally {
      client.release();
    }
  }

  throw lastError;
}

async function runFetchLyrics(options = {}) {
  const refresh = Boolean(options.refresh);
  const artistName = options.artistName?.trim();

  if (!artistName) {
    throw new Error('Artist name is required. Usage: node scripts/fetchLyrics.js "Artist Name"');
  }

  const artist = await withClient((client) => findArtistByName(client, artistName));

  if (!artist) {
    throw new Error(`Artist "${artistName}" was not found in PostgreSQL. Run fetchSongs first.`);
  }

  const songs = await withClient((client) => getSongsNeedingLyrics(client, artist.id, { refresh }));

  if (!songs.length) {
    return { artist: artist.name, processed: 0, withLyrics: 0 };
  }

  const runId = await withClient((client) => startIngestionRun(client, artist.id, "fetch_lyrics"));
  let withLyrics = 0;
  let completed = 0;

  try {
    for (const song of songs) {
      let rawLyrics = "";
      let geniusUrl = null;

      try {
        rawLyrics = await fetchLyricsFromLrclib(artist.name, song.title);
      } catch (error) {
        console.warn(`lrclib failed for "${song.title}": ${error.message}`);
      }

      if (!rawLyrics) {
        try {
          const result = await searchSongOnGenius(artist.name, song.title);

          if (result?.url) {
            geniusUrl = result.url;
            rawLyrics = await scrapeLyricsFromGenius(result.url);
          }
        } catch (error) {
          console.warn(`Genius fallback failed for "${song.title}": ${error.message}`);
        }
      }

      try {
        await withClient((client) => upsertLyrics(client, song.id, { rawLyrics, geniusUrl }));

        if (rawLyrics) {
          withLyrics += 1;
        }
      } catch (error) {
        console.warn(`DB save failed for "${song.title}": ${error.message}`);
      }

      completed += 1;
      await sleep(350);
      console.log(`[${completed}/${songs.length}] Processed "${song.title}"`);
    }

    await withClient((client) =>
      finishIngestionRun(client, runId, "completed", {
        processed: songs.length,
        with_lyrics: withLyrics,
      })
    );

    return { artist: artist.name, processed: songs.length, withLyrics };
  } catch (error) {
    await withClient((client) =>
      finishIngestionRun(client, runId, "failed", { error: error.message })
    ).catch(() => {});

    throw error;
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
