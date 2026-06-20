const path = require("path");

const rootDir = path.resolve(__dirname, "../..");
const dataDir = path.join(rootDir, "data");
const songsPath = path.join(dataDir, "songs.json");
const processedSongsPath = path.join(dataDir, "processed_songs.json");
const envPath = path.join(rootDir, ".env");
const frontendDistDir = path.join(rootDir, "frontend", "dist");
const queryEmbedScriptPath = path.join(rootDir, "ml", "embed_query.py");

module.exports = {
  rootDir,
  dataDir,
  envPath,
  frontendDistDir,
  songsPath,
  processedSongsPath,
  queryEmbedScriptPath,
};
