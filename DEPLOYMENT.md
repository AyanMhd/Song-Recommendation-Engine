# Deployment Guide

Deploy the Lyric Vibe Recommender as a public website with **automatic redeploys on every push to `main`**.

## Architecture (production)

```text
Visitor
  → Render web service (Docker)
      → Express serves frontend/dist + API (/search, /artists, /health)
      → Neon PostgreSQL + pgvector (DATABASE_URL)
      → Python venv (optional vibe embedding via embed_query.py)
```

Your database stays on **Neon**. The app server is deployed to **Render** from GitHub.

---

## Prerequisites

1. GitHub repo pushed: `https://github.com/AyanMhd/Song-Recommendation-Engine`
2. **Neon** project with `DATABASE_URL` (pgvector enabled)
3. **Render** account: https://render.com
4. Artist data already ingested + embedded in Neon (run pipeline locally against the same DB)

---

## One-time setup (Render + GitHub)

### 1. Push deployment files

Commit and push `Dockerfile`, `render.yaml`, and this guide:

```powershell
git add Dockerfile .dockerignore render.yaml DEPLOYMENT.md
git commit -m "Add Render Docker deployment with auto-deploy"
git push origin main
```

### 2. Create the web service on Render

1. Open https://dashboard.render.com → **New** → **Blueprint**
2. Connect your GitHub account and select **Song-Recommendation-Engine**
3. Render reads `render.yaml` and creates the web service
4. When prompted, set secrets:
   - `DATABASE_URL` — your Neon connection string
   - `MUSICBRAINZ_CONTACT_EMAIL` — your email (for MusicBrainz User-Agent if you run ingestion later)

### 3. Wait for the first deploy

- First build takes **10–20 minutes** (Python ML dependencies + model download)
- When status is **Live**, open the URL Render gives you (e.g. `https://lyric-vibe-recommender.onrender.com`)

### 4. Verify

- `GET /health` → `{ "ok": true, "database": "connected" }`
- Open the site → search with an artist in your DB (e.g. J. Cole)

---

## Auto-deploy on every update

Render is configured with `autoDeploy: true` in `render.yaml`.

**Workflow:**

```text
You change code locally
  → git commit
  → git push origin main
  → Render rebuilds Docker image and redeploys automatically
```

No extra CI step required. Check deploy progress in the Render dashboard **Events** tab.

---

## Environment variables (Render dashboard)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Same Neon URL you use locally |
| `MUSICBRAINZ_CONTACT_EMAIL` | Recommended | For ingestion scripts |
| `GENIUS_ACCESS_TOKEN` | No* | Only needed if you run lyrics fetch on the server |
| `PORT` | Auto | Set by Render — do not override |
| `PYTHON_BIN` | Auto | Set in `render.yaml` to venv Python |

\* Ingestion (fetch lyrics, preprocess) is usually run **locally** against Neon, not on the web server.

---

## Ingesting new artists (after deploy)

The live site only **searches** data in Neon. To add artists:

```powershell
# From your machine (same DATABASE_URL as production)
cd backend
npm run pipeline:collect -- "Artist Name"
cd ..
python ml/preprocess.py "Artist Name"
```

Push to GitHub is **not** required for new artist data — only the database changes.

---

## Plan & performance notes

| Topic | Recommendation |
|-------|----------------|
| **Render plan** | **Starter ($7/mo)** or higher — free tier (512 MB RAM) may fail when loading the embedding model |
| **Region** | `singapore` in `render.yaml` — change in Render dashboard if you prefer another region |
| **Cold starts** | Free/starter services spin down after inactivity; first visit may be slow |
| **Vibe searches** | Load Python + model — slower first request; example-song-only search is faster |

---

## Manual deploy (without push)

Render dashboard → your service → **Manual Deploy** → **Deploy latest commit**.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on pip/torch | Retry deploy; ensure Dockerfile uses the Python venv path |
| `database: disconnected` | Check `DATABASE_URL` in Render env vars; Neon must allow external connections |
| Artist not found | Data not in Neon — run pipeline locally |
| Port crash on start | Another process — on Render, only use their `PORT` (handled automatically) |
| Site loads but search 500 | Check Render **Logs** tab for Python or DB errors |

---

## Alternative platforms

The same `Dockerfile` works on **Railway**, **Fly.io**, or any host that runs Docker. Connect the GitHub repo and enable **deploy on push** in that platform’s settings.
