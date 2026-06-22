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
};
