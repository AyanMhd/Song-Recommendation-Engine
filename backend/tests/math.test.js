const test = require("node:test");
const assert = require("node:assert/strict");
const { blendVectors, cosineSimilarity, roundScore } = require("../src/utils/math");

test("cosineSimilarity returns 1 for identical vectors", () => {
  const vector = [1, 0, 0];
  assert.equal(cosineSimilarity(vector, vector), 1);
});

test("cosineSimilarity returns 0 for mismatched lengths", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
});

test("cosineSimilarity returns 0 for zero vectors", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("blendVectors mixes primary and secondary weights", () => {
  assert.deepEqual(blendVectors([1, 0], [0, 1], 0.7, 0.3), [0.7, 0.3]);
});

test("blendVectors falls back when one vector is empty", () => {
  assert.deepEqual(blendVectors([], [2, 4]), [2, 4]);
  assert.deepEqual(blendVectors([2, 4], []), [2, 4]);
});

test("roundScore keeps four decimal places", () => {
  assert.equal(roundScore(0.123456), 0.1235);
});
