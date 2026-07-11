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
  keepAlive: true,
});

// Neon closes idle/long-lived connections; without this handler a dropped
// connection crashes the whole process via an unhandled 'error' event.
pool.on("error", (error) => {
  console.warn(`Postgres pool error (connection will be re-created): ${error.message}`);
});

module.exports = pool;
