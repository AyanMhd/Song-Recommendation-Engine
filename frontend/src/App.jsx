import { useState } from "react";

const THEME_LABELS = {
  struggle: "Struggle",
  uplifting: "Uplifting",
  introspective: "Introspective",
  love: "Love",
  party: "Party",
};

async function searchSongs({ artist, vibeText, exampleSong }) {
  const response = await fetch("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artist,
      vibe_text: vibeText,
      ...(exampleSong ? { example_song: exampleSong } : {}),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Search failed.");
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
  const [artist, setArtist] = useState("");
  const [vibeText, setVibeText] = useState("");
  const [exampleSong, setExampleSong] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setHasSearched(true);
    setResults([]);

    try {
      const songs = await searchSongs({
        artist: artist.trim(),
        vibeText: vibeText.trim(),
        exampleSong: exampleSong.trim(),
      });
      setResults(songs);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">Lyric Vibe Recommender</p>
        <h1>Find songs that match the feeling.</h1>
        <p className="hero-copy">
          Search within one artist&apos;s catalog using a vibe description and an optional example song.
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
              <span>Vibe</span>
              <textarea
                name="vibeText"
                onChange={(event) => setVibeText(event.target.value)}
                placeholder="uplifting songs about struggle and gratitude"
                required
                rows={4}
                value={vibeText}
              />
            </label>

            <label className="field">
              <span>Example song (optional)</span>
              <input
                name="exampleSong"
                onChange={(event) => setExampleSong(event.target.value)}
                placeholder="Love Yourz"
                type="text"
                value={exampleSong}
              />
            </label>

            <button className="submit-button" disabled={loading} type="submit">
              {loading ? "Searching..." : "Find songs"}
            </button>
          </form>

          {error ? <p className="error-banner">{error}</p> : null}
        </section>

        <section className="panel results-panel">
          <div className="results-header">
            <h2>Recommendations</h2>
            <p>
              {loading
                ? "Embedding your vibe and ranking songs..."
                : results.length
                  ? `${results.length} songs ranked for ${artist.trim()}`
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
