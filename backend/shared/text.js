function normalizeWhitespace(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeKey(text = "") {
  return normalizeWhitespace(
    text
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
  );
}

function normalizeSongTitle(title = "") {
  const stripped = title
    .replace(/\((?:[^)]*(?:live|remaster|version|edit|mix|bonus|clean|explicit|feat|ft)\b[^)]*)\)/gi, " ")
    .replace(/\[(?:[^\]]*(?:live|remaster|version|edit|mix|bonus|clean|explicit|feat|ft)\b[^\]]*)\]/gi, " ")
    .replace(/\s+-\s+(?:live|remaster(?:ed)?|version|edit|mix|bonus track|clean|explicit).*$/gi, " ")
    .replace(/\s+(?:feat\.?|ft\.?)\s+.+$/gi, " ");

  return normalizeKey(stripped);
}

function stripSectionMarkers(text = "") {
  return text.replace(/\[[^\]]+\]/g, " ");
}

module.exports = {
  normalizeKey,
  normalizeSongTitle,
  normalizeWhitespace,
  stripSectionMarkers,
};
