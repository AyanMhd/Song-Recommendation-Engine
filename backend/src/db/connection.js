const { Pool } = require("pg");
const dotenv = require("dotenv");
const { envPath } = require("../../shared/paths");

dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to your .env file.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX) || 10,
});

module.exports = pool;
