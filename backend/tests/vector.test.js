process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseEmbedding, toVectorLiteral } = require("../src/db/queries");

test("toVectorLiteral formats embedding arrays for pgvector", () => {
  assert.equal(toVectorLiteral([1, 0.5, -2]), "[1,0.5,-2]");
});

test("toVectorLiteral rejects empty arrays", () => {
  assert.throws(() => toVectorLiteral([]), /non-empty array/);
});

test("parseEmbedding handles string and array forms", () => {
  assert.deepEqual(parseEmbedding([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(parseEmbedding("[1,2,3]"), [1, 2, 3]);
  assert.deepEqual(parseEmbedding(null), []);
});
