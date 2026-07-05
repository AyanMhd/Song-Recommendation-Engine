import { useEffect, useMemo, useState } from "react";

async function fetchAvailableArtists() {
  const response = await fetch("/artists");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load artists.");
  }

  return data.artists || [];
}

export default function ArtistsPage({ onBack, onSelectArtist }) {
  const [artists, setArtists] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetchAvailableArtists()
      .then((items) => {
        if (active) {
          setArtists(items);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredArtists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return artists;
    }

    return artists.filter((artist) => artist.name.toLowerCase().includes(normalized));
  }, [artists, query]);

  return (
    <div className="app-shell">
      <header className="hero hero-compact">
        <div className="hero-topline">
          <button className="text-button" onClick={onBack} type="button">
            Back to search
          </button>
        </div>
        <p className="eyebrow">Catalog</p>
        <h1>Available artists</h1>
        <p className="hero-copy">
          These artists are in the database with embedded lyrics and ready for similarity search.
        </p>
      </header>

      <main className="artists-layout">
        <section className="panel artists-panel">
          <label className="field">
            <span>Search artists</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type to filter by name..."
              type="search"
              value={query}
            />
          </label>

          <p className="artists-meta">
            {loading
              ? "Loading artists..."
              : `${filteredArtists.length} of ${artists.length} artists shown`}
          </p>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="artist-grid">
            {filteredArtists.map((artist) => (
              <button
                className="artist-card"
                key={artist.id}
                onClick={() => onSelectArtist(artist.name)}
                type="button"
              >
                <div className="artist-card-top">
                  <span className="artist-initial">{artist.name.charAt(0).toUpperCase()}</span>
                  <div>
                    <h3>{artist.name}</h3>
                  </div>
                </div>
                <span className="artist-card-action">Use this artist</span>
              </button>
            ))}
          </div>

          {!loading && !error && !filteredArtists.length ? (
            <p className="empty-state">
              {artists.length
                ? "No artists match your search."
                : "No artists are available yet. Run the collection and preprocessing pipeline first."}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
