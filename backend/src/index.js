const fs = require("fs");
const path = require("path");
const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const { frontendDistDir, port } = require("./config");
const { searchSongs } = require("./services/recommender");
const pool = require("./db/connection");
const { listAvailableArtists } = require("./db/queries");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "connected" });
  } catch (error) {
    response.status(503).json({ ok: false, database: "disconnected", error: error.message });
  }
});

app.get("/artists", async (_request, response) => {
  const client = await pool.connect();

  try {
    const artists = await listAvailableArtists(client);
    response.json({ artists });
  } catch (error) {
    response.status(500).json({
      error: error.message || "Failed to load artists.",
    });
  } finally {
    client.release();
  }
});

app.post("/search", async (request, response) => { 
  //extract the data from the request body
  //trim - removes extra whitespace from the beginning and end of the string
  const artist = request.body?.artist?.trim();
  const vibeText = request.body?.vibe_text?.trim();
  const exampleSong = request.body?.example_song?.trim();
  const limit = request.body?.limit;

  if (!artist || !exampleSong) {
    response.status(400).json({
      error: "`artist` and `example_song` are required.",
    });
    return;
  }

  try {
    const results = await searchSongs({
      artist,
      vibeText,
      exampleSong,
      limit,
    });

    response.json({ results });
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || "Unexpected server error.",
      code: error.code || undefined,
    });
  }
});

if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));

  app.get("*", (request, response, next) => {
    if (
      request.path.startsWith("/search") ||
      request.path.startsWith("/health") ||
      request.path.startsWith("/artists")
    ) {
      next();
      return;
    }

    const indexPath = path.join(frontendDistDir, "index.html");
    response.sendFile(indexPath);
  });
}

const server = app.listen(port, () => {
  console.log(`Lyric vibe backend listening on http://localhost:${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Close the other backend terminal or run: netstat -ano | findstr :${port}`
    );
    process.exit(1);
  }

  throw error;
});
