# Lyric Vibe Recommender

A full-stack app that recommends songs from a single artist by comparing lyrics, vibe text, and an optional example song.

**Architecture docs:** see [ARCHITECTURE.md](./ARCHITECTURE.md) for HLD diagrams, data flow, database design, and pipeline details.

## Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: PostgreSQL (Neon) + pgvector
- Data collection: Node.js + MusicBrainz + Genius API + Cheerio
- ML / preprocessing: Python + `sentence-transformers` (`all-MiniLM-L6-v2`)

## Folder Structure

```text
personalised_songs/
├── backend/
│   ├── scripts/           # ingestion + DB migration scripts
│   ├── sql/               # schema, indexes, upgrade SQL
│   ├── shared/
│   └── src/
│       ├── db/            # connection + queries
│       └── services/      # recommender, python bridge
├── frontend/
│   └── src/
├── ml/
│   ├── common.py
│   ├── embed_query.py
│   ├── preprocess.py
│   └── requirements.txt
└── .env.example
```

## What It Does

1. Fetches an artist's official release tracks from MusicBrainz.
2. Searches Genius for each song and scrapes lyrics.
3. Cleans lyrics, chunks them, and generates 384-dim embeddings with `all-MiniLM-L6-v2`.
4. Stores artists, songs, lyrics, chunks, embeddings, and theme scores in PostgreSQL.
5. Serves a `/search` API that ranks songs using:

```text
final_score = 0.7 * semantic_similarity + 0.3 * theme_alignment
```

If an example song is provided, the backend blends:

```text
query_embedding = 0.7 * example_song_embedding + 0.3 * vibe_embedding
```

It also includes:

- chunk-level lyric matching for better verse-level similarity
- artist-scoped pgvector similarity search
- a light diversity reranker to avoid near-duplicate recommendations

## Setup

### 1. Add your settings and API keys

Create a root `.env` file from `.env.example` and fill in:

```env
PORT=3001
PYTHON_BIN=python
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
GENIUS_ACCESS_TOKEN=your_genius_access_token
MUSICBRAINZ_APP_NAME=LyricVibeRecommender
MUSICBRAINZ_APP_VERSION=1.0.0
MUSICBRAINZ_CONTACT_EMAIL=you@example.com
SEARCH_RESULT_LIMIT=10
HNSW_EF_SEARCH=100
```

Notes:

- `DATABASE_URL` must point to a PostgreSQL instance with the `vector` extension enabled (Neon supports this).
- MusicBrainz does not need an API key, but it expects a proper identifying `User-Agent`, so the contact email is recommended.

### 2. Install Node dependencies

Backend:

```powershell
cd backend
npm install
```

Frontend:

```powershell
cd frontend
npm install
```

### 3. Install Python dependencies

From the project root:

```powershell
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r ml\requirements.txt
```

### 4. Initialize the database

From `backend/`:

```powershell
npm run db:migrate
npm run db:test
```

## Run the Data Pipeline

From `backend/`:

### Step 1: Fetch MusicBrainz songs

```powershell
npm run pipeline:fetch -- "J. Cole"
```

### Step 2: Fetch Genius lyrics

```powershell
npm run pipeline:lyrics -- "J. Cole"
```

Refresh existing lyrics:

```powershell
npm run pipeline:lyrics -- "J. Cole" --refresh
```

### Or run both together

```powershell
npm run pipeline:collect -- "J. Cole"
```

### Step 3: Preprocess + embed

From the project root:

```powershell
python ml\preprocess.py "J. Cole"
```

Re-embed an artist after lyric changes:

```powershell
python ml\preprocess.py "J. Cole" --reembed
```

## Start the App

### Start backend

From `backend/`:

```powershell
npm run dev
```

Backend API:

- `POST http://localhost:3001/search`
- `GET http://localhost:3001/health`

### Start frontend

From `frontend/`:

```powershell
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

## API Example

`POST /search`

```json
{
  "artist": "J. Cole",
  "vibe_text": "uplifting songs about struggle",
  "example_song": "Love Yourz"
}
```

Example response:

```json
{
  "results": [
    {
      "title": "Love Yourz",
      "artist": "J. Cole",
      "score": 0.82,
      "semantic_similarity": 0.84,
      "theme_alignment": 0.77,
      "youtube_url": "https://www.youtube.com/results?search_query=J.%20Cole%20Love%20Yourz",
      "themes": {
        "struggle": 0.63,
        "uplifting": 0.76,
        "introspective": 0.69,
        "love": 0.22,
        "party": 0.11
      }
    }
  ]
}
```

## Useful Database Commands

From `backend/`:

```powershell
npm test
npm run db:migrate   # apply schema + indexes
npm run db:test      # connection + table check
```

## Notes

- PostgreSQL is the source of truth for songs, lyrics, embeddings, and theme scores.
- The backend calls Python on each search request to embed `vibe_text`.
- The first query can be slower because the embedding model has to load.
- MusicBrainz requests are throttled to roughly 1 request per second to respect their official API guidance.
- If the frontend is built with `npm run build`, the Express server can serve the production bundle.

## Suggested Workflow

1. Add your `.env` values.
2. Run `npm run db:migrate` from `backend/`.
3. Run `npm run pipeline:collect -- "Artist Name"` from `backend/`.
4. Run `python ml\preprocess.py "Artist Name"` from the project root.
5. Start backend with `npm run dev`.
6. Start frontend with `npm run dev`.
