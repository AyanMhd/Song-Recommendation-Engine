const { spawn } = require("child_process");
const { pythonBin, queryEmbedScriptPath } = require("../config");

async function embedText(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [queryEmbedScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python process exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse Python response: ${error.message}`));
      }
    });

    child.stdin.write(JSON.stringify({ text }));
    child.stdin.end();
  });
}

module.exports = {
  embedText,
};
