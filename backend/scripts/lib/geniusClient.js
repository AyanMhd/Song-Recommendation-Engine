const axios = require("axios");
const { normalizeKey, normalizeSongTitle } = require("../../shared/text");
const { requireEnv } = require("./config");

function scoreHit(hit, artistName, songTitle) {
  const targetArtist = normalizeKey(artistName);
  const targetTitle = normalizeSongTitle(songTitle);
  const hitArtist = normalizeKey(hit.result?.primary_artist?.name || "");
  const hitTitle = normalizeSongTitle(hit.result?.title || "");
  const fullTitle = normalizeKey(hit.result?.full_title || "");

  let score = 0;

  if (hitTitle === targetTitle) {
    score += 6;
  } else if (hitTitle.includes(targetTitle) || targetTitle.includes(hitTitle)) {
    score += 4;
  }

  if (hitArtist === targetArtist) {
    score += 5;
  } else if (hitArtist.includes(targetArtist) || targetArtist.includes(hitArtist)) {
    score += 3;
  }

  if (fullTitle.includes(targetArtist) && fullTitle.includes(targetTitle)) {
    score += 2;
  }

  return score;
}

async function searchSongOnGenius(artistName, songTitle) {
  const accessToken = requireEnv("GENIUS_ACCESS_TOKEN");
  const response = await axios.get("https://api.genius.com/search", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      q: `${artistName} ${songTitle}`,
    },
  });

  const hits = response.data.response?.hits || [];

  if (!hits.length) {
    return null;
  }

  const bestHit = hits
    .map((hit) => ({ hit, score: scoreHit(hit, artistName, songTitle) }))
    .sort((left, right) => right.score - left.score)[0];

  return bestHit?.hit?.result?.url ? bestHit.hit.result : null;
}

module.exports = {
  searchSongOnGenius,
};
