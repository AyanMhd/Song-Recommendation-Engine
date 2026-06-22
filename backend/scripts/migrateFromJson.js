require("../src/config");

const { readJson } = require("../shared/fs");
const { songsPath, processedSongsPath } = require("../shared/paths");
const pool = require("../src/db/connection");
const {
  findArtistByName,
  saveProcessedSong,
  upsertArtist,
  upsertLyrics,
  upsertSong,
} = require("../src/db/queries");

async function importSongsJson(client) {
  let songsData;

  try {
    songsData = await readJson(songsPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("No data/songs.json found — skipping raw song import.");
      return null;
    }

    throw error;
  }

  if (!songsData?.artist || !Array.isArray(songsData.songs)) {
    console.log("data/songs.json is empty or invalid — skipping.");
    return null;
  }

  const artist = await upsertArtist(client, { name: songsData.artist });
  let imported = 0;

  for (const song of songsData.songs) {
    const saved = await upsertSong(client, artist.id, song);

    if (song.lyrics) {
      await upsertLyrics(client, saved.id, { rawLyrics: song.lyrics });
    }

    imported += 1;
  }

  console.log(`Imported ${imported} songs for ${artist.name} from songs.json`);
  return artist;
}

async function importProcessedJson(client, artistFromSongs) {
  let processedSongs;

  try {
    processedSongs = await readJson(processedSongsPath, []);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("No data/processed_songs.json found — skipping embedding import.");
      return;
    }

    throw error;
  }

  if (!Array.isArray(processedSongs) || !processedSongs.length) {
    console.log("data/processed_songs.json is empty — skipping.");
    return;
  }

  const artistName = processedSongs[0]?.artist || artistFromSongs?.name;

  if (!artistName) {
    throw new Error("Could not determine artist for processed_songs.json import.");
  }

  const artist = artistFromSongs || (await upsertArtist(client, { name: artistName }));
  let imported = 0;

  for (const song of processedSongs) {
    const saved = await upsertSong(client, artist.id, song);

    if (song.clean_lyrics || song.lyrics) {
      await upsertLyrics(client, saved.id, {
        rawLyrics: song.lyrics || song.clean_lyrics || "",
      });
    }

    if (!song.embedding || !Array.isArray(song.chunks)) {
      continue;
    }

    await saveProcessedSong(client, artist.id, saved.id, {
      cleanLyrics: song.clean_lyrics || "",
      chunks: song.chunks.map((chunk) => ({
        text: chunk.text,
        embedding: chunk.embedding || [],
      })),
      embedding: song.embedding,
      themes: song.themes || {},
    });

    imported += 1;
  }

  console.log(`Imported ${imported} embedded songs from processed_songs.json`);
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const artist = await importSongsJson(client);
    await importProcessedJson(client, artist);
    await client.query("COMMIT");
    console.log("JSON migration complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
