const path = require("path");

const rootDir = path.resolve(__dirname, "../..");
const envPath = path.join(rootDir, ".env");
const frontendDistDir = path.join(rootDir, "frontend", "dist");
const queryEmbedScriptPath = path.join(rootDir, "ml", "embed_query.py");

module.exports = {
  rootDir,
  envPath,
  frontendDistDir,
  queryEmbedScriptPath,
};
