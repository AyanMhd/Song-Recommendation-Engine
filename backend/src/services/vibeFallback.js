const { THEME_NAMES } = require("../db/queries");

const THEME_KEYWORDS = {
  struggle: ["struggle", "hardship", "pain", "fight", "resilien", "grit", "surviv", "loss", "pressure"],
  uplifting: ["uplift", "hope", "encourag", "motivat", "heal", "victor", "empower", "positive"],
  introspective: ["introspect", "reflect", "thought", "philosoph", "inner", "self", "deep", "honest"],
  love: ["love", "heartbreak", "romance", "affection", "desire", "intim", "devotion", "relationship"],
  party: ["party", "hype", "club", "celebrat", "nightlife", "dance", "flex", "turn up"],
};

function inferThemeWeightsFromText(vibeText = "") {
  const normalized = vibeText.toLowerCase();
  const weights = Object.fromEntries(THEME_NAMES.map((theme) => [theme, 0]));

  for (const theme of THEME_NAMES) {
    for (const keyword of THEME_KEYWORDS[theme]) {
      if (normalized.includes(keyword)) {
        weights[theme] += 1;
      }
    }
  }

  const total = THEME_NAMES.reduce((sum, theme) => sum + weights[theme], 0);

  if (!total) {
    // No keyword hit — spread evenly so vibe still nudges theme alignment slightly.
    const even = 1 / THEME_NAMES.length;
    return Object.fromEntries(THEME_NAMES.map((theme) => [theme, even]));
  }

  return Object.fromEntries(THEME_NAMES.map((theme) => [theme, weights[theme] / total]));
}

function isPythonUnavailable(error) {
  return (
    error?.code === "ENOENT" ||
    /spawn.*enoent/i.test(error?.message || "") ||
    /python process exited/i.test(error?.message || "")
  );
}

module.exports = {
  inferThemeWeightsFromText,
  isPythonUnavailable,
};
