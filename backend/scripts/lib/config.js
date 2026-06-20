const dotenv = require("dotenv");
const { envPath } = require("../../shared/paths");

dotenv.config({ path: envPath });

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

module.exports = {
  requireEnv,
};
