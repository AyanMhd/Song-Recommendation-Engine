const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeKey, normalizeSongTitle, normalizeWhitespace, stripSectionMarkers } = require("../shared/text");

test("normalizeWhitespace collapses repeated spaces", () => {
  assert.equal(normalizeWhitespace("  hello   world  "), "hello world");
});

test("normalizeKey lowercases and strips punctuation", () => {
  assert.equal(normalizeKey("J. Cole"), "j cole");
  assert.equal(normalizeKey("Earth, Wind & Fire"), "earth wind and fire");
});

test("normalizeSongTitle removes version and feature suffixes", () => {
  assert.equal(normalizeSongTitle("Love Yourz (Live)"), "love yourz");
  assert.equal(normalizeSongTitle("No Role Modelz - feat. Kendrick Lamar"), "no role modelz");
});

test("stripSectionMarkers removes bracketed section labels", () => {
  assert.equal(stripSectionMarkers("Line one [Chorus] line two"), "Line one   line two");
});
