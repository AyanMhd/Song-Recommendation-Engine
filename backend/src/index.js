const fs = require("fs");
const path = require("path");
const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const { frontendDistDir, port } = require("./config");
const { searchSongs } = require("./services/recommender");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", async (_request, response) => {
  try {
    const pool = require("./db/connection");
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "connected" });
  } catch (error) {
    response.status(503).json({ ok: false, database: "disconnected", error: error.message });
  }
});

app.post("/search", async (request, response) => {
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
    });
  }
});

if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));

  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/search") || request.path.startsWith("/health")) {
      next();
      return;
    }

    const indexPath = path.join(frontendDistDir, "index.html");
    response.sendFile(indexPath);
  });
}

app.listen(port, () => {
  console.log(`Lyric vibe backend listening on http://localhost:${port}`);
});
