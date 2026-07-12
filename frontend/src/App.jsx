import { useState } from "react";
import ArtistsPage from "./ArtistsPage";

const THEME_LABELS = {
  struggle: "Struggle",
  uplifting: "Uplifting",
  introspective: "Introspective",
  love: "Love",
  party: "Party",
};

async function searchSongs({ artist, exampleSong, vibeText }) {
  const body = {
    artist,
    example_song: exampleSong,
  };

  if (vibeText) {
    body.vibe_text = vibeText;
  }

  const response = await fetch("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || "Search failed.");
    error.code = data.code;
    throw error;
  }

  return data.results || [];
}

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

function ThemeBars({ themes = {} }) {
  return (
    <div className="theme-bars">
      {Object.entries(THEME_LABELS).map(([key, label]) => {
        const value = Number(themes[key] || 0);
        return (
          <div className="theme-row" key={key}>
            <span className="theme-label">{label}</span>
            <div className="theme-track">
              <div className="theme-fill" style={{ width: `${Math.round(value * 100)}%` }} />
            </div>
            <span className="theme-value">{formatScore(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ResultCard({ song, rank }) {
  return (
    <article className="result-card">
      <div className="result-header">
        <div>
          <p className="result-rank">#{rank}</p>
          <h3>{song.title}</h3>
          <p className="result-artist">{song.artist}</p>
        </div>
        <div className="score-badge">
          <span>Match</span>
          <strong>{formatScore(song.score)}</strong>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric">
          <span>Semantic</span>
          <strong>{formatScore(song.semantic_similarity)}</strong>
        </div>
        <div className="metric">
          <span>Theme</span>
          <strong>{formatScore(song.theme_alignment)}</strong>
        </div>
      </div>

      <ThemeBars themes={song.themes} />

      {song.youtube_url ? (
        <a className="youtube-link" href={song.youtube_url} rel="noreferrer" target="_blank">
          Listen on YouTube
        </a>
      ) : null}
    </article>
  );
}

export default function App() {
  const [view, setView] = useState("search");
  const [artist, setArtist] = useState("");
  const [exampleSong, setExampleSong] = useState("");
  const [vibeText, setVibeText] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  function openArtistsPage() {
    setView("artists");
  }

  function handleSelectArtist(name) {
    setArtist(name);
    setView("search");
    setError("");
    setErrorCode("");
    setResults([]);
    setHasSearched(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setErrorCode("");
    setLoading(true);
    setHasSearched(true);
    setResults([]);

    try {
      const songs = await searchSongs({
        artist: artist.trim(),
        exampleSong: exampleSong.trim(),
        vibeText: vibeText.trim(),
      });
      setResults(songs);
    } catch (submitError) {
      setError(submitError.message);
      setErrorCode(submitError.code || "");
    } finally {
      setLoading(false);
    }
  }

  if (view === "artists") {
    return <ArtistsPage onBack={() => setView("search")} onSelectArtist={handleSelectArtist} />;
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-topline">
          <button className="text-button" onClick={openArtistsPage} type="button">
            Browse available artists
          </button>
        </div>
        <p className="eyebrow">Lyric Vibe Recommender</p>
        <h1>Find songs with similar lyrics.</h1>
        <p className="hero-copy">
          Pick an artist and an example song. We match other tracks by lyric similarity. Add an optional
          vibe to steer the results further.
        </p>
      </header>

      <main className="layout">
        <section className="panel search-panel">
          <form className="search-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Artist</span>
              <input
                name="artist"
                onChange={(event) => setArtist(event.target.value)}
                placeholder="J. Cole"
                required
                type="text"
                value={artist}
              />
            </label>

            <label className="field">
              <span>Example song</span>
              <input
                name="exampleSong"
                onChange={(event) => setExampleSong(event.target.value)}
                placeholder="Love Yourz"
                required
                type="text"
                value={exampleSong}
              />
            </label>

            <label className="field">
              <span>Vibe (optional)</span>
              <textarea
                name="vibeText"
                onChange={(event) => setVibeText(event.target.value)}
                placeholder="introspective, love, party, uplifting, struggle"
                rows={4}
                value={vibeText}
              />
            </label>

            <button className="submit-button" disabled={loading} type="submit">
              {loading ? "Searching..." : "Find similar songs"}
            </button>
          </form>

          {error ? (
            <div className="error-banner">
              <p>{error}</p>
              {errorCode === "ARTIST_NOT_IN_DB" ? (
                <button className="inline-link-button" onClick={openArtistsPage} type="button">
                  Browse available artists
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel results-panel">
          <div className="results-header">
            <h2>Recommendations</h2>
            <p>
              {loading
                ? "Matching lyrics and ranking songs..."
                : results.length
                  ? `${results.length} songs similar to "${exampleSong.trim()}"`
                  : hasSearched
                    ? "No songs matched this search."
                    : "Run a search to see ranked songs."}
            </p>
          </div>

          <div className="results-list">
            {results.map((song, index) => (
              <ResultCard key={`${song.title}-${index}`} rank={index + 1} song={song} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
