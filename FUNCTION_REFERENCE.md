# Function Reference

A map of every significant function in this codebase. Each function name links to its source file and line number — **Ctrl+Click** (or **Cmd+Click** on Mac) the link in Cursor/VS Code to jump straight to the definition.

---

## How to navigate quickly

| Method | What it does |
|---|---|
| **Ctrl+Click a link in this file** | Opens the source file at that line |
| **Ctrl+T** (Go to Symbol in Workspace) | Type a function name (e.g. `searchSongs`) to jump to it anywhere in the project |
| **F12** (Go to Definition) | Works inside `.js` / `.py` files when your cursor is on a function call |
| **Outline panel** (Explorer sidebar) | Lists all functions in the currently open file |
| **Ctrl+P** then `@symbol`** | Go to a symbol within the current file |

> **Tip:** This markdown file is great for reading context. For day-to-day coding, **Ctrl+T** is usually faster than scrolling a doc — but this file helps when you want the full picture of what calls what.

---

## Architecture at a glance

```
Frontend (React)
  searchSongs() ──POST /search──► recommender.searchSongs()
                                       ├── queries.* (PostgreSQL + pgvector)
                                       └── pythonBridge.embedText() ──► ml/embed_query.py

Ingestion pipeline (scripts)
  collectArtistData ──► fetchSongs (MusicBrainz)
                     ──► fetchArtistImage (Deezer)
                     ──► fetchLyrics (LRCLIB → Genius fallback)
  preprocess.py ──► embed lyrics, chunks, themes ──► PostgreSQL
```

---

## backend/src — API server

### [`backend/src/index.js`](backend/src/index.js)

Express entry point. Defines routes and optionally serves the built frontend.

| Route | Method | What it does |
|---|---|---|
| `/health` | GET | Returns `{ ok: true }` and a DB ping |
| `/artists` | GET | Lists artists with at least one embedded song via [`listAvailableArtists`](backend/src/db/queries.js#L450) |
| `/search` | POST | Runs the recommendation pipeline via [`searchSongs`](backend/src/services/recommender.js#L122) |
| `*` | GET | SPA fallback — serves `index.html` for client-side routing |

---

### [`backend/src/config.js`](backend/src/config.js)

Loads `.env` and exports configuration constants.

| Export | Description |
|---|---|
| `frontendDistDir` | Path to `frontend/dist` |
| `port` | HTTP port (default `3001`) |
| `pythonBin` | Python executable (default `"python"`) |
| `queryEmbedScriptPath` | Path to `ml/embed_query.py` |
| `searchResultLimit` | Max search results returned (default `10`) |
| `hnswEfSearch` | pgvector HNSW `ef_search` param (default `100`) |

---

### [`backend/src/db/connection.js`](backend/src/db/connection.js)

| Export | Description |
|---|---|
| `pool` (default) | PostgreSQL connection pool with keep-alive and error logging |

---

### [`backend/src/db/queries.js`](backend/src/db/queries.js)

All database read/write operations. Uses a `client` (from the pool or a transaction) for every function.

**Constants:** [`THEME_NAMES`](backend/src/db/queries.js#L3) — `["struggle", "uplifting", "introspective", "love", "party"]`

#### Internal helpers

| Function | Line | Description |
|---|---|---|
| [`toVectorLiteral`](backend/src/db/queries.js#L7) | 7 | Converts a float array to a pgvector literal string `[1,2,3]` |
| [`parseEmbedding`](backend/src/db/queries.js#L15) | 15 | Parses a pgvector query result into a `number[]` |
| [`clearSongDerivedData`](backend/src/db/queries.js#L189) | 189 | Deletes chunks, embeddings, and theme scores for a song before re-embedding |
| [`setVectorSearchParams`](backend/src/db/queries.js#L345) | 345 | Sets `hnsw.ef_search` on the DB session for vector queries |

#### Artist & song CRUD

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`upsertArtist`](backend/src/db/queries.js#L35) | 35 | `{ name, musicbrainzId }` → artist row | Insert or update artist by normalized name |
| [`findArtistByName`](backend/src/db/queries.js#L51) | 51 | `artistName` → row or `null` | Exact match first, then fuzzy `ILIKE` fallback |
| [`upsertSong`](backend/src/db/queries.js#L77) | 77 | `artistId, song` → song row | Insert/update a single song; status starts as `pending_lyrics` |
| [`upsertSongs`](backend/src/db/queries.js#L104) | 104 | `artistId, songs[]` → rows | Batch wrapper around `upsertSong` |
| [`getSongsForArtist`](backend/src/db/queries.js#L114) | 114 | `artistId` → rows | All songs for an artist, joined with lyrics |
| [`findSongByTitle`](backend/src/db/queries.js#L295) | 295 | `artistId, title` → row or `null` | Exact then fuzzy song lookup within one artist |
| [`getSongsByIds`](backend/src/db/queries.js#L423) | 423 | `songIds[]` → `Map` | Song metadata keyed by ID |

#### Lyrics

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`upsertLyrics`](backend/src/db/queries.js#L129) | 129 | `songId, { rawLyrics, geniusUrl }` → row | Saves lyrics; advances song status to `pending_embed` or back to `pending_lyrics` |
| [`getSongsNeedingLyrics`](backend/src/db/queries.js#L156) | 156 | `artistId, { refresh }` → rows | Songs missing lyrics (`refresh=true` re-fetches all) |

#### Embedding pipeline

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`getSongsNeedingEmbed`](backend/src/db/queries.js#L171) | 171 | `artistId, { reembed }` → rows | Songs with lyrics but not yet embedded |
| [`saveProcessedSong`](backend/src/db/queries.js#L200) | 200 | `artistId, songId, payload` → void | Full write: clean lyrics, chunks, song + chunk embeddings, theme scores |
| [`markSongSkipped`](backend/src/db/queries.js#L285) | 285 | `songId` → void | Sets `processing_status = 'skipped_no_lyrics'` |
| [`getSongEmbedding`](backend/src/db/queries.js#L322) | 322 | `songId` → row or `null` | Fetches a song-level embedding with title/artist metadata |
| [`getEmbeddedSongCount`](backend/src/db/queries.js#L439) | 439 | `artistId` → number | Count of songs with `processing_status = 'embedded'` |

#### Vector search

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`searchSongEmbeddings`](backend/src/db/queries.js#L350) | 350 | `artistId, queryEmbedding, limit` → hits | Cosine-distance search on `song_embeddings` |
| [`searchChunkEmbeddings`](backend/src/db/queries.js#L375) | 375 | `artistId, queryEmbedding, limit` → hits | Cosine-distance search on `chunk_embeddings` |
| [`getThemeScoresForSongs`](backend/src/db/queries.js#L396) | 396 | `songIds[]` → `Map` | Theme scores keyed by song ID |

#### Ingestion tracking & utilities

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`listAvailableArtists`](backend/src/db/queries.js#L450) | 450 | — → rows | Artists with ≥1 embedded song (for the `/artists` endpoint) |
| [`startIngestionRun`](backend/src/db/queries.js#L474) | 474 | `artistId, stage` → `runId` | Creates an `ingestion_runs` row with status `running` |
| [`finishIngestionRun`](backend/src/db/queries.js#L485) | 485 | `runId, status, metadata` → void | Finalizes an ingestion run |
| [`withTransaction`](backend/src/db/queries.js#L496) | 496 | `callback(client)` → result | BEGIN / COMMIT / ROLLBACK wrapper |

---

### [`backend/src/services/recommender.js`](backend/src/services/recommender.js)

The core recommendation engine.

#### Internal helpers

| Function | Line | Description |
|---|---|---|
| [`buildYouTubeSearchUrl`](backend/src/services/recommender.js#L18) | 18 | Builds a YouTube search URL from artist + title |
| [`getThemeVector`](backend/src/services/recommender.js#L23) | 23 | Converts a theme score object to an ordered vector matching `THEME_NAMES` |
| [`mergeCandidates`](backend/src/services/recommender.js#L27) | 27 | Merges song-level and chunk-level vector hits by `song_id`, keeping best similarity |
| [`applyDiversityRerank`](backend/src/services/recommender.js#L67) | 67 | Greedy MMR-style rerank — penalizes songs too similar to already-picked results |
| [`resolveArtistForSearch`](backend/src/services/recommender.js#L97) | 97 | Validates artist exists and has embedded songs; throws 404/400 if not |

#### Exported

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`searchSongs`](backend/src/services/recommender.js#L122) | 122 | `{ artist, vibeText, exampleSong, limit }` → results[] | **Main pipeline:** resolve artist → build query embedding (vibe text + optional example song) → vector search (song + chunk level) → theme alignment scoring → diversity rerank → return top N with YouTube links |

**Returns per result:** `{ title, artist, score, semantic_similarity, theme_alignment, youtube_url, themes }`

**Calls:** `embedText`, `blendVectors`, `cosineSimilarity`, `roundScore`, and many `queries.*` functions.

---

### [`backend/src/services/pythonBridge.js`](backend/src/services/pythonBridge.js)

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`embedText`](backend/src/services/pythonBridge.js#L4) | 4 | `text: string` → `{ text, embedding, themes }` | Spawns `ml/embed_query.py`, sends JSON on stdin, parses JSON from stdout |

---

### [`backend/src/utils/math.js`](backend/src/utils/math.js)

| Function | Line | Exported | Description |
|---|---|---|---|
| `dot` | 1 | No | Dot product of two vectors |
| `magnitude` | 5 | No | L2 norm of a vector |
| [`cosineSimilarity`](backend/src/utils/math.js#L9) | 9 | Yes | Cosine similarity; returns `0` for mismatched or empty vectors |
| [`blendVectors`](backend/src/utils/math.js#L23) | 23 | Yes | Weighted element-wise blend (default 70% primary / 30% secondary) |
| [`roundScore`](backend/src/utils/math.js#L35) | 35 | Yes | Rounds a number to 4 decimal places |

---

## backend/shared — shared utilities

### [`backend/shared/paths.js`](backend/shared/paths.js)

| Export | Description |
|---|---|
| `rootDir` | Project root directory |
| `envPath` | Path to `.env` |
| `frontendDistDir` | Path to `frontend/dist` |
| `queryEmbedScriptPath` | Path to `ml/embed_query.py` |

---

### [`backend/shared/text.js`](backend/shared/text.js)

Text normalization used for artist/song matching across JS and Python.

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`normalizeWhitespace`](backend/shared/text.js#L1) | 1 | `text` → string | Collapses runs of whitespace and trims |
| [`normalizeKey`](backend/shared/text.js#L6) | 6 | `text` → string | Lowercase, strip punctuation, `&` → `and` |
| [`normalizeSongTitle`](backend/shared/text.js#L15) | 15 | `title` → string | Strips live/remaster/feat suffixes, then normalizes |
| [`stripSectionMarkers`](backend/shared/text.js#L25) | 25 | `text` → string | Removes `[Verse]`, `[Chorus]`, etc. markers |

---

## backend/scripts — data ingestion

### [`backend/scripts/collectArtistData.js`](backend/scripts/collectArtistData.js)

| Function | Line | Description |
|---|---|---|
| `main()` | — | CLI orchestrator: runs fetch songs → fetch image → fetch lyrics for one artist |

---

### [`backend/scripts/fetchSongs.js`](backend/scripts/fetchSongs.js)

| Function | Line | Exported | Params → Returns | Description |
|---|---|---|---|---|
| [`runFetchSongs`](backend/scripts/fetchSongs.js) | — | **Yes** | `artistName` → `{ artist, artist_id, songs }` | Fetches MusicBrainz discography, upserts artist + songs in a transaction |
| `main()` | — | No | — | CLI wrapper |

---

### [`backend/scripts/fetchLyrics.js`](backend/scripts/fetchLyrics.js)

| Function | Line | Exported | Params → Returns | Description |
|---|---|---|---|---|
| `sleep` | — | No | `ms` → Promise | Delay helper |
| `withClient` | — | No | `callback, { retries }` → result | DB client with connection retry |
| [`runFetchLyrics`](backend/scripts/fetchLyrics.js) | — | **Yes** | `{ artistName, refresh }` → stats | Fetches lyrics via LRCLIB, falls back to Genius scraping |
| `main()` | — | No | — | CLI with optional `--refresh` flag |

---

### [`backend/scripts/fetchArtistImage.js`](backend/scripts/fetchArtistImage.js)

| Function | Line | Exported | Description |
|---|---|---|---|
| `lookupDeezerImage` | — | No | Searches Deezer API for best-matching artist photo URL |
| `saveArtistImage` | — | No | Updates `artists.image_url` in the DB |
| [`runFetchArtistImage`](backend/scripts/fetchArtistImage.js) | — | **Yes** | Public entry: fetch and save Deezer image |
| `main()` | — | No | CLI wrapper |

---

### [`backend/scripts/removeArtist.js`](backend/scripts/removeArtist.js)

| Function | Line | Exported | Params → Returns | Description |
|---|---|---|---|---|
| [`removeArtist`](backend/scripts/removeArtist.js) | — | **Yes** | `artistName` → boolean | Transactional delete of artist and all related data (cascade) |
| `main()` | — | No | — | CLI wrapper |

---

### [`backend/scripts/ingestBatch.js`](backend/scripts/ingestBatch.js)

| Function | Description |
|---|---|
| `run(command, args, cwd)` | Runs a subprocess synchronously; returns `true` on exit 0 |
| `dbBytes()` | Current PostgreSQL database size in bytes |
| `mb(bytes)` | Formats bytes as an MB string |
| `getArtistProgress(artistName)` | Returns `{ total, embedded, needs_embed }` counts for an artist |
| `main()` | Batch-ingests a hardcoded `ARTISTS` list; stops if DB exceeds 480 MB |

---

### Other scripts (no reusable exports)

| Script | Description |
|---|---|
| [`artistStatus.js`](backend/scripts/artistStatus.js) | One-shot diagnostic — prints per-artist song/lyrics/embedded counts as JSON |
| [`dbSize.js`](backend/scripts/dbSize.js) | One-shot diagnostic — reports total DB size, per-table sizes, row counts |
| [`migrateSchema.js`](backend/scripts/migrateSchema.js) | Applies `upgrade.sql`, `schema.sql`, `indexes.sql` |
| [`testconnection.js`](backend/scripts/testconnection.js) | Verifies DB connection, pgvector extension, tables, and row counts |

---

### [`backend/scripts/lib/config.js`](backend/scripts/lib/config.js)

| Function | Exported | Description |
|---|---|---|
| [`requireEnv(name)`](backend/scripts/lib/config.js) | **Yes** | Returns an env var or throws if missing |

---

### [`backend/scripts/lib/musicbrainzClient.js`](backend/scripts/lib/musicbrainzClient.js)

MusicBrainz API client with rate limiting (1.1 s between requests).

| Function | Exported | Description |
|---|---|---|
| `sleep` | No | Rate-limit delay |
| `getUserAgent` | No | MusicBrainz-compliant User-Agent string |
| `waitForRateLimit` | No | Enforces minimum gap between requests |
| `musicBrainzGet` | No | GET with rate limit and 502/503/504 retry |
| `pickBestArtistMatch` | No | Best artist from search results |
| `findArtist` | No | MusicBrainz artist search |
| `browseAllReleases` | No | Paginated official releases with recordings |
| `browseAllRecordings` | No | Paginated standalone recordings |
| `extractTrackArtistNames` | No | Artist credit names from track/release |
| `isTrackByArtist` | No | Whether track credits match the target artist |
| `collectSongsFromReleases` | No | Deduped song list from release tracklists |
| `collectSongsFromRecordings` | No | Deduped songs from recording browse fallback |
| [`fetchSongsForArtist`](backend/scripts/lib/musicbrainzClient.js) | **Yes** | Full discography fetch — releases first, recordings as fallback |

> [`spotifyClient.js`](backend/scripts/lib/spotifyClient.js) is a passthrough re-export of `musicbrainzClient.js`.

---

### [`backend/scripts/lib/lrclibClient.js`](backend/scripts/lib/lrclibClient.js)

LRCLIB lyrics API client with retry logic.

| Function | Exported | Description |
|---|---|---|
| `sleep` | No | Delay helper |
| `isRetryable` | No | Whether an HTTP/network error warrants retry |
| `requestWithRetry` | No | Retries up to 3 times on retryable errors |
| `pickLyrics` | No | Extracts `plainLyrics` unless the track is instrumental |
| `getExactMatch` | No | LRCLIB `/get` exact lookup |
| `searchBestMatch` | No | LRCLIB `/search` with scored best match |
| [`fetchLyricsFromLrclib`](backend/scripts/lib/lrclibClient.js) | **Yes** | Exact match first, then search fallback |

---

### [`backend/scripts/lib/geniusClient.js`](backend/scripts/lib/geniusClient.js)

| Function | Exported | Description |
|---|---|---|
| `scoreHit` | No | Scores a Genius search hit against target artist/title |
| [`searchSongOnGenius`](backend/scripts/lib/geniusClient.js) | **Yes** | Genius API search; returns best-scoring result with URL |

---

### [`backend/scripts/lib/lyricsScraper.js`](backend/scripts/lib/lyricsScraper.js)

| Function | Exported | Description |
|---|---|---|
| [`scrapeLyricsFromGenius(url)`](backend/scripts/lib/lyricsScraper.js) | **Yes** | Scrapes lyrics HTML from a Genius page using Cheerio |

---

## frontend/src — React UI

### [`frontend/src/main.jsx`](frontend/src/main.jsx)

Bootstraps the React root. No custom functions.

---

### [`frontend/src/App.jsx`](frontend/src/App.jsx)

| Function / Component | Line | Description |
|---|---|---|
| [`searchSongs`](frontend/src/App.jsx#L12) | 12 | POST `/search` API client; throws with `.code` on error |
| `formatScore` | — | Formats a number to 2 decimal places |
| `ThemeBars` | — | Renders theme score progress bars |
| `ResultCard` | — | Single recommendation card (title, score, themes, YouTube link) |
| `App` (default export) | — | Main search page — form state, submit handler, results list, artists view toggle |
| `openArtistsPage` | — | Switches view to the artists catalog |
| `handleSelectArtist` | — | Selects an artist from catalog and returns to search form |
| `handleSubmit` | — | Form submit — calls API and updates results/error state |

---

### [`frontend/src/ArtistsPage.jsx`](frontend/src/ArtistsPage.jsx)

| Function / Component | Description |
|---|---|
| `fetchAvailableArtists` | GET `/artists` API client |
| `ArtistsPage` (default export) | Browse/filter grid of embedded artists; props: `onBack`, `onSelectArtist` |

---

## ml — Python embedding pipeline

### [`ml/theme_definitions.py`](ml/theme_definitions.py)

| Name | Description |
|---|---|
| `THEME_DESCRIPTIONS` | Dict mapping theme names to descriptive text used for embedding-based theme scoring |

---

### [`ml/common.py`](ml/common.py)

Shared ML utilities. Uses a lazy-loaded `SentenceTransformer("all-MiniLM-L6-v2")` singleton.

| Function | Line | Params → Returns | Description |
|---|---|---|---|
| [`get_model`](ml/common.py#L25) | 25 | — → `SentenceTransformer` | Lazy-loads the embedding model |
| [`clean_lyrics`](ml/common.py#L32) | 32 | `str` → `str` | Strips section markers, normalizes whitespace |
| [`flatten_whitespace`](ml/common.py#L45) | 45 | `str` → `str` | Collapses whitespace runs |
| [`split_into_chunks`](ml/common.py#L49) | 49 | `str` → `List[str]` | Splits lyrics into paragraph/chunk blocks |
| [`embed_texts`](ml/common.py#L71) | 71 | `List[str]` → `np.ndarray` | Batch embedding with L2 normalization |
| [`cosine_similarity`](ml/common.py#L79) | 79 | arrays → `float` | NumPy cosine similarity |
| [`get_theme_embeddings`](ml/common.py#L88) | 88 | — → `Dict[str, ndarray]` | Cached embeddings of `THEME_DESCRIPTIONS` values |
| [`compute_theme_scores`](ml/common.py#L99) | 99 | embedding → `Dict[str, float]` | Cosine similarity vs each theme (clamped ≥ 0) |
| [`vector_to_list`](ml/common.py#L107) | 107 | vector → `List[float]` | Converts numpy vector to Python float list |

---

### [`ml/embed_query.py`](ml/embed_query.py)

CLI script invoked by Node [`embedText`](backend/src/services/pythonBridge.js#L4). Reads JSON from stdin.

| Function | Line | Description |
|---|---|---|
| [`main`](ml/embed_query.py#L7) | 7 | stdin: `{ "text": "..." }` → stdout: `{ text, embedding, themes }` |

---

### [`ml/preprocess.py`](ml/preprocess.py)

Batch embedding script — processes all pending songs for one artist.

| Function | Line | Description |
|---|---|---|
| [`load_dotenv`](ml/preprocess.py#L23) | 23 | Parses `.env` into `os.environ` |
| [`normalize_key`](ml/preprocess.py#L36) | 36 | JS-compatible key normalization |
| [`get_connection`](ml/preprocess.py#L43) | 43 | psycopg2 connection from `DATABASE_URL` |
| [`find_artist`](ml/preprocess.py#L50) | 50 | Exact then fuzzy artist lookup |
| [`get_songs_needing_embed`](ml/preprocess.py#L77) | 77 | Songs pending embedding |
| [`get_raw_lyrics`](ml/preprocess.py#L97) | 97 | Fetches raw lyrics for a song |
| [`log`](ml/preprocess.py#L110) | 110 | Flushed print |
| [`clear_song_derived_data`](ml/preprocess.py#L114) | 114 | Deletes derived embed data before re-write |
| [`to_vector_literal`](ml/preprocess.py#L121) | 121 | pgvector literal string |
| [`save_processed_song`](ml/preprocess.py#L125) | 125 | Writes clean lyrics, chunks, embeddings, themes |
| [`mark_song_skipped`](ml/preprocess.py#L223) | 223 | Sets `skipped_no_lyrics` status |
| [`main`](ml/preprocess.py#L235) | 235 | CLI: embed all pending songs for one artist; optional `--reembed` |

---

## Key call chains

### Search request (user-facing)

1. [`App.handleSubmit`](frontend/src/App.jsx) → [`searchSongs`](frontend/src/App.jsx#L12) (frontend)
2. `POST /search` in [`index.js`](backend/src/index.js) → [`searchSongs`](backend/src/services/recommender.js#L122) (recommender)
3. [`resolveArtistForSearch`](backend/src/services/recommender.js#L97) → [`findArtistByName`](backend/src/db/queries.js#L51) + [`getEmbeddedSongCount`](backend/src/db/queries.js#L439)
4. [`embedText`](backend/src/services/pythonBridge.js#L4) → [`embed_query.main`](ml/embed_query.py#L7) → [`common.embed_texts`](ml/common.py#L71) + [`common.compute_theme_scores`](ml/common.py#L99)
5. [`searchSongEmbeddings`](backend/src/db/queries.js#L350) + [`searchChunkEmbeddings`](backend/src/db/queries.js#L375)
6. [`applyDiversityRerank`](backend/src/services/recommender.js#L67) → return results

### Ingestion pipeline (admin)

1. [`collectArtistData.main`](backend/scripts/collectArtistData.js) orchestrates:
2. [`runFetchSongs`](backend/scripts/fetchSongs.js) → [`fetchSongsForArtist`](backend/scripts/lib/musicbrainzClient.js) (MusicBrainz)
3. [`runFetchArtistImage`](backend/scripts/fetchArtistImage.js) → Deezer API
4. [`runFetchLyrics`](backend/scripts/fetchLyrics.js) → [`fetchLyricsFromLrclib`](backend/scripts/lib/lrclibClient.js) → [`searchSongOnGenius`](backend/scripts/lib/geniusClient.js) → [`scrapeLyricsFromGenius`](backend/scripts/lib/lyricsScraper.js)
5. [`preprocess.main`](ml/preprocess.py#L235) → [`save_processed_song`](ml/preprocess.py#L125) (embed + store)

---

*Generated for the personalised_songs project. Update this file when you add or rename functions.*
