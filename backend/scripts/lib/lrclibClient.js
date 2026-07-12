const axios = require("axios");
const { normalizeKey, normalizeSongTitle } = require("../../shared/text");

const BASE_URL = "https://lrclib.net/api";
const USER_AGENT = "LyricVibeRecommender/1.0.0 (https://github.com/AyanMhd/Song-Recommendation-Engine)";
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  const status = error.response?.status;
  return (
    !status ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    error.code === "ECONNRESET" ||
    error.code === "ETIMEDOUT"
  );
}

async function requestWithRetry(requestFn) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      await sleep(400 * attempt);
    }
  }

  throw lastError;
}

function pickLyrics(record) {
  if (!record || record.instrumental) {
    return "";
  }

  return (record.plainLyrics || "").trim();
}

async function getExactMatch(artistName, trackName) {
  try {
    const response = await requestWithRetry(() =>
      axios.get(`${BASE_URL}/get`, {
        params: { artist_name: artistName, track_name: trackName },
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
      })
    );
    return pickLyrics(response.data);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return "";
    }
    throw error;
  }
}

async function searchBestMatch(artistName, trackName) {
  const response = await requestWithRetry(() =>
    axios.get(`${BASE_URL}/search`, {
      params: { artist_name: artistName, track_name: trackName },
      headers: { "User-Agent": USER_AGENT },
      timeout: 15000,
    })
  );

  const results = Array.isArray(response.data) ? response.data : [];

  if (!results.length) {
    return "";
  }

  const wantedArtist = normalizeKey(artistName);
  const wantedTitle = normalizeSongTitle(trackName);

  const scored = results
    .map((record) => {
      const recordArtist = normalizeKey(record.artistName || "");
      const recordTitle = normalizeSongTitle(record.trackName || "");
      let score = 0;

      if (recordTitle === wantedTitle) {
        score += 6;
      } else if (recordTitle.includes(wantedTitle) || wantedTitle.includes(recordTitle)) {
        score += 3;
      }

      if (recordArtist === wantedArtist) {
        score += 5;
      } else if (recordArtist.includes(wantedArtist) || wantedArtist.includes(recordArtist)) {
        score += 3;
      }

      if (!pickLyrics(record)) {
        score = -1;
      }

      return { record, score };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  return best && best.score >= 5 ? pickLyrics(best.record) : "";
}

function stripVersionSuffix(title = "") {
  return title
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\s*\[[^\]]*\]/g, " ")
    .replace(/\s+-\s+.+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleVariants(trackName) {
  const variants = [trackName];
  const stripped = stripVersionSuffix(trackName);

  if (stripped && stripped !== trackName) {
    variants.push(stripped);
  }

  return [...new Set(variants)];
}

async function fetchLyricsFromLrclib(artistName, trackName) {
  for (const variant of titleVariants(trackName)) {
    const exact = await getExactMatch(artistName, variant);

    if (exact) {
      return exact;
    }

    const fuzzy = await searchBestMatch(artistName, variant);

    if (fuzzy) {
      return fuzzy;
    }
  }

  return "";
}

module.exports = {
  fetchLyricsFromLrclib,
};
