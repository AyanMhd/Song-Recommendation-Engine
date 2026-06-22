CREATE INDEX IF NOT EXISTS idx_artists_name_normalized ON artists (name_normalized);

CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs (artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_artist_title ON songs (artist_id, title_normalized);
CREATE INDEX IF NOT EXISTS idx_songs_processing_status ON songs (artist_id, processing_status);

CREATE INDEX IF NOT EXISTS idx_lyrics_song_id ON lyrics (song_id);

CREATE INDEX IF NOT EXISTS idx_lyric_chunks_song_id ON lyric_chunks (song_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_song_embeddings_artist ON song_embeddings (artist_id);
CREATE INDEX IF NOT EXISTS idx_song_embeddings_hnsw
ON song_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_artist ON chunk_embeddings (artist_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_song ON chunk_embeddings (song_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_hnsw
ON chunk_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_song_theme_scores_song ON song_theme_scores (song_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_artist ON ingestion_runs (artist_id, stage);
