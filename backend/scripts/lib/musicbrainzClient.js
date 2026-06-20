const axios = require("axios");
const { normalizeKey, normalizeSongTitle } = require("../../shared/text");

const MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2";
const RATE_LIMIT_DELAY_MS = 1100;

let nextAllowedRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUserAgent() {
  const appName = process.env.MUSICBRAINZ_APP_NAME || "LyricVibeRecommender";
  const appVersion = process.env.MUSICBRAINZ_APP_VERSION || "1.0.0";
  const contact =
    process.env.MUSICBRAINZ_CONTACT_EMAIL ||
    process.env.MUSICBRAINZ_CONTACT_URL ||
    "local-personal-use";

  return `${appName}/${appVersion} (${contact})`;
}

async function waitForRateLimit() {
  const waitTime = nextAllowedRequestAt - Date.now();
  if (waitTime > 0) {
    await sleep(waitTime);
  }

  nextAllowedRequestAt = Date.now() + RATE_LIMIT_DELAY_MS;
}

async function musicBrainzGet(endpoint, params = {}, attempt = 0) {
  await waitForRateLimit();

  try {
    const response = await axios.get(`${MUSICBRAINZ_BASE_URL}${endpoint}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": getUserAgent(),
      },
      params: {
        ...params,
        fmt: "json",
      },
    });

    return response.data;
  } catch (error) {
    const status = error.response?.status;

    if ((status === 502 || status === 503 || status === 504) && attempt < 2) {
      await sleep((attempt + 1) * RATE_LIMIT_DELAY_MS);
      return musicBrainzGet(endpoint, params, attempt + 1);
    }

    throw error;
  }
}

function pickBestArtistMatch(artists, artistName) {
  const normalizedTarget = normalizeKey(artistName);

  return (
    artists.find((artist) => normalizeKey(artist.name) === normalizedTarget) ||
    artists.find((artist) => normalizeKey(artist.name).includes(normalizedTarget)) ||
    artists
      .slice()
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0] ||
    null
  );
}

async function findArtist(artistName) {
  const data = await musicBrainzGet("/artist", {
    query: artistName,
    limit: 10,
  });

  return pickBestArtistMatch(data.artists || [], artistName);
}

async function browseAllReleases(artistId) {
  const releases = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const data = await musicBrainzGet("/release", {
      artist: artistId,
      inc: "recordings+media+artist-credits",
      limit: 100,
      offset,
      status: "official",
      type: "album|single|ep",
    });

    const page = data.releases || [];
    total = Number(data["release-count"] || page.length || 0);

    if (!page.length) {
      break;
    }

    releases.push(...page);
    offset += page.length;
  }

  return releases;
}

async function browseAllRecordings(artistId) {
  const recordings = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const data = await musicBrainzGet("/recording", {
      artist: artistId,
      inc: "artist-credits",
      limit: 100,
      offset,
    });

    const page = data.recordings || [];
    total = Number(data["recording-count"] || page.length || 0);

    if (!page.length) {
      break;
    }

    recordings.push(...page);
    offset += page.length;
  }

  return recordings;
}

function extractTrackArtistNames(track, release) {
  const trackCredits =
    track["artist-credit"] ||
    track.recording?.["artist-credit"] ||
    release?.["artist-credit"] ||
    [];

  return trackCredits.map((entry) => entry.artist?.name || "").filter(Boolean);
}

function isTrackByArtist(track, release, artistName, artistId) {
  const trackCredits =
    track["artist-credit"] ||
    track.recording?.["artist-credit"] ||
    release?.["artist-credit"] ||
    [];

  if (!trackCredits.length) {
    return true;
  }

  const normalizedArtist = normalizeKey(artistName);

  return trackCredits.some((entry) => {
    const creditArtist = entry.artist;
    return (
      creditArtist?.id === artistId ||
      normalizeKey(creditArtist?.name || "") === normalizedArtist ||
      normalizeKey(creditArtist?.name || "").includes(normalizedArtist)
    );
  });
}

function collectSongsFromReleases(releases, artist) {
  const seenSongs = new Set();
  const songs = [];

  for (const release of releases) {
    for (const medium of release.media || []) {
      for (const track of medium.tracks || []) {
        const rawTitle = track.title || track.recording?.title || "";
        const normalizedTitle = normalizeSongTitle(rawTitle);

        if (!normalizedTitle || seenSongs.has(normalizedTitle)) {
          continue;
        }

        if (!isTrackByArtist(track, release, artist.name, artist.id)) {
          continue;
        }

        seenSongs.add(normalizedTitle);
        songs.push({
          title: rawTitle,
          lyrics: "",
          source_release: release.title,
          source_artist_credit: extractTrackArtistNames(track, release),
        });
      }
    }
  }

  return songs;
}

function collectSongsFromRecordings(recordings, artist) {
  const seenSongs = new Set();
  const songs = [];
  const normalizedArtist = normalizeKey(artist.name);

  for (const recording of recordings) {
    const rawTitle = recording.title || "";
    const normalizedTitle = normalizeSongTitle(rawTitle);

    if (!normalizedTitle || seenSongs.has(normalizedTitle)) {
      continue;
    }

    const creditNames = (recording["artist-credit"] || [])
      .map((entry) => entry.artist?.name || "")
      .filter(Boolean);

    const belongsToArtist =
      !creditNames.length ||
      creditNames.some((name) => normalizeKey(name) === normalizedArtist || normalizeKey(name).includes(normalizedArtist));

    if (!belongsToArtist) {
      continue;
    }

    seenSongs.add(normalizedTitle);
    songs.push({
      title: rawTitle,
      lyrics: "",
      source_artist_credit: creditNames,
    });
  }

  return songs;
}

async function fetchSongsForArtist(artistName) {
  const artist = await findArtist(artistName);

  if (!artist) {
    throw new Error(`Could not find artist on MusicBrainz: ${artistName}`);
  }

  const releases = await browseAllReleases(artist.id);
  let songs = collectSongsFromReleases(releases, artist);

  if (!songs.length) {
    const recordings = await browseAllRecordings(artist.id);
    songs = collectSongsFromRecordings(recordings, artist);
  }

  return {
    artist: artist.name,
    songs,
  };
}

module.exports = {
  fetchSongsForArtist,
};
