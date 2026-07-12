const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inferThemeWeightsFromText,
  isPythonUnavailable,
} = require("../src/services/vibeFallback");

test("inferThemeWeightsFromText detects introspective vibe", () => {
  const weights = inferThemeWeightsFromText("introspective");
  assert.ok(weights.introspective > 0.9);
  assert.ok(weights.party < 0.1);
});

test("isPythonUnavailable matches spawn ENOENT", () => {
  const error = new Error("spawn python ENOENT");
  error.code = "ENOENT";
  assert.equal(isPythonUnavailable(error), true);
});
