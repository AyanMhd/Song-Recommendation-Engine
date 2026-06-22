CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS artists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_normalized TEXT NOT NULL UNIQUE,
    musicbrainz_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS songs (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_normalized TEXT NOT NULL,
    source_release TEXT,
    source_artist_credit TEXT[] NOT NULL DEFAULT '{}',
    processing_status TEXT NOT NULL DEFAULT 'pending_lyrics',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (artist_id, title_normalized)
);

CREATE TABLE IF NOT EXISTS lyrics (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
    raw_lyrics TEXT NOT NULL DEFAULT '',
    clean_lyrics TEXT,
    genius_url TEXT,
    fetched_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lyric_chunks (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    UNIQUE (song_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS song_embeddings (
    song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    embedding VECTOR(384) NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunk_embeddings (
    chunk_id INTEGER PRIMARY KEY REFERENCES lyric_chunks(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    embedding VECTOR(384) NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS song_theme_scores (
    song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    struggle REAL NOT NULL,
    uplifting REAL NOT NULL,
    introspective REAL NOT NULL,
    love REAL NOT NULL,
    party REAL NOT NULL,
    theme_model_version TEXT NOT NULL DEFAULT 'theme_definitions_v1',
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
