<<<<<<< HEAD
# Lyric Vibe Recommender

A local full-stack app that recommends songs from a single artist by comparing lyrics, vibe text, and an optional example song.

## Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Data collection: Node.js + MusicBrainz + Genius API + Cheerio
- ML / preprocessing: Python + `sentence-transformers` (`all-MiniLM-L6-v2`)
- Storage: JSON files in `data/`

## Folder Structure

```text
personalised_songs/
├── backend/
│   ├── scripts/
│   │   ├── collectArtistData.js
│   │   ├── fetchLyrics.js
│   │   └── fetchSongs.js
│   └── src/
│       ├── services/
│       └── utils/
├── data/
│   ├── processed_songs.json
│   └── songs.json
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
3. Cleans lyrics and generates embeddings with `all-MiniLM-L6-v2`.
4. Scores each song against fixed themes like `struggle`, `uplifting`, and `introspective`.
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
- a light diversity reranker to avoid near-duplicate recommendations

## Setup

### 1. Add your settings and API keys

Create a root `.env` file from `.env.example` and fill in:

```env
PORT=3001
PYTHON_BIN=python
MUSICBRAINZ_APP_NAME=LyricVibeRecommender
MUSICBRAINZ_APP_VERSION=1.0.0
MUSICBRAINZ_CONTACT_EMAIL=you@example.com
GENIUS_ACCESS_TOKEN=your_genius_access_token
SEARCH_RESULT_LIMIT=10
```

MusicBrainz does not need an API key, but it does expect a proper identifying `User-Agent`, so the contact email is recommended.

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

## Run the Data Pipeline

From `backend/`:

### Step 1: Fetch MusicBrainz songs

```powershell
node scripts/fetchSongs.js "J Cole"
```

This writes song titles to `data/songs.json`.

### Step 2: Fetch Genius lyrics

```powershell
node scripts/fetchLyrics.js
```

If you want to refresh existing lyrics:

```powershell
node scripts/fetchLyrics.js --refresh
```

### Or run both together

```powershell
node scripts/collectArtistData.js "J Cole"
```

### Step 3: Preprocess + embed

From the project root:

```powershell
python ml\preprocess.py
```

This writes processed vectors and theme scores to `data/processed_songs.json`.

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
  "artist": "J Cole",
  "vibe_text": "uplifting songs about struggle",
  "example_song": "Before I'm Gone"
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
      "matched_chunk": "No such thing as a life that's better than yours",
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

## Notes

- The backend calls Python on each search request to embed `vibe_text`.
- The first query can be slower because the embedding model has to load.
- No database is used; all storage lives in JSON files under `data/`.
- MusicBrainz requests are throttled to roughly 1 request per second to respect their official API guidance.
- If the frontend is built with `npm run build`, the Express server can serve the production bundle.

## Suggested Workflow

1. Add your `.env` values.
2. Run `node scripts/collectArtistData.js "Artist Name"` from `backend/`.
3. Run `python ml\preprocess.py` from the project root.
4. Start backend with `npm run dev`.
5. Start frontend with `npm run dev`.

## Next Step

If you want, I can also help tune the MusicBrainz fetcher for deluxe editions, collaborations, or alternate versions.
=======
# Song-Recommendation-Engine
Helps me find relevant songs efficiently
>>>>>>> b6c6132185365030654ed19d267b7d270a4ca652
