const dotenv = require("dotenv");
const { envPath, frontendDistDir, queryEmbedScriptPath } = require("../shared/paths");

dotenv.config({ path: envPath });

module.exports = {
  frontendDistDir,
  port: Number(process.env.PORT) || 3001,
  pythonBin: process.env.PYTHON_BIN || "python",
  queryEmbedScriptPath,
  searchResultLimit: Number(process.env.SEARCH_RESULT_LIMIT) || 10,
  hnswEfSearch: Number(process.env.HNSW_EF_SEARCH) || 100,
  // Free Render tier has no Python — vibe uses keyword theme matching instead.
  enablePythonVibe: !["0", "false", "no"].includes(
    String(process.env.ENABLE_PYTHON_VIBE || "true").toLowerCase()
  ),
};
