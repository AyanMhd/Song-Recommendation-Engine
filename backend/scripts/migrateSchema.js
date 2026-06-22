require("../src/config");

const fs = require("fs/promises");
const path = require("path");
const pool = require("../src/db/connection");

const sqlDir = path.join(__dirname, "..", "sql");

async function runSqlFile(fileName) {
  const filePath = path.join(sqlDir, fileName);
  const sql = await fs.readFile(filePath, "utf8");
  await pool.query(sql);
  console.log(`Applied ${fileName}`);
}

async function main() {
  await runSqlFile("upgrade.sql");
  await runSqlFile("schema.sql");
  await runSqlFile("indexes.sql");

  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name`
  );

  console.log("Tables:", tables.rows.map((row) => row.table_name).join(", "));
  await pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
