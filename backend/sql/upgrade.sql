-- Upgrade path from the initial scaffold schema to the full schema.

CREATE TABLE IF NOT EXISTS lyrics (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
    raw_lyrics TEXT NOT NULL DEFAULT '',
    clean_lyrics TEXT,
    genius_url TEXT,
    fetched_at TIMESTAMPTZ
);

ALTER TABLE artists ADD COLUMN IF NOT EXISTS name_normalized TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS musicbrainz_id UUID;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE artists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE artists
SET name_normalized = lower(regexp_replace(regexp_replace(name, '&', ' and ', 'gi'), '[^a-z0-9\s]', ' ', 'gi'))
WHERE name_normalized IS NULL;

ALTER TABLE artists ALTER COLUMN name_normalized SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artists_name_normalized_key'
  ) THEN
    ALTER TABLE artists ADD CONSTRAINT artists_name_normalized_key UNIQUE (name_normalized);
  END IF;
END $$;

ALTER TABLE songs ADD COLUMN IF NOT EXISTS title_normalized TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS source_release TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS source_artist_credit TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE songs ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending_lyrics';
ALTER TABLE songs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE songs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE songs
SET title_normalized = lower(regexp_replace(title, '[^a-z0-9\s]', ' ', 'gi'))
WHERE title_normalized IS NULL;

ALTER TABLE songs ALTER COLUMN title_normalized SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'songs' AND column_name = 'lyrics'
  ) THEN
    INSERT INTO lyrics (song_id, raw_lyrics, fetched_at)
    SELECT id, COALESCE(lyrics, ''), NOW()
    FROM songs
    WHERE COALESCE(lyrics, '') <> ''
    ON CONFLICT (song_id) DO NOTHING;

    ALTER TABLE songs DROP COLUMN IF EXISTS lyrics;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'songs_artist_id_title_normalized_key'
  ) THEN
    ALTER TABLE songs ADD CONSTRAINT songs_artist_id_title_normalized_key UNIQUE (artist_id, title_normalized);
  END IF;
END $$;

-- Rename legacy song_embeddings if present without artist_id
ALTER TABLE song_embeddings ADD COLUMN IF NOT EXISTS artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE;
ALTER TABLE song_embeddings ADD COLUMN IF NOT EXISTS model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2';
ALTER TABLE song_embeddings ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE song_embeddings se
SET artist_id = s.artist_id
FROM songs s
WHERE se.song_id = s.id AND se.artist_id IS NULL;

DO $$
BEGIN
  IF to_regclass('public.song_embeddings') IS NOT NULL
     AND to_regclass('public.song_embeddings_legacy') IS NULL
     AND EXISTS (
       SELECT 1 FROM song_embeddings WHERE artist_id IS NULL
     ) THEN
    NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS song_embedding_hnsw;
DROP INDEX IF EXISTS idx_artist_name;
DROP INDEX IF EXISTS idx_song_artist;
