# Deployment Guide (Free tier on Render)

Deploy the Lyric Vibe Recommender **for free** with automatic redeploys on every push to `main`.

## What you get on free

| Feature | Free deploy |
|---------|-------------|
| Public website URL | Yes |
| Search by **example song** (lyric similarity) | Yes |
| Browse available artists | Yes |
| Optional **vibe** text steering | No on free* |
| Auto-redeploy on `git push` | Yes |
| Payment card required | **No** |

\* Vibe embedding needs Python + ML (~1 GB RAM). The free Render plan has 512 MB, so the Docker image is Node-only. Leave the vibe field empty when searching.

---

## Architecture

```text
Visitor → Render free web service (Docker, Node only)
            → Express + frontend/dist
            → Neon PostgreSQL (DATABASE_URL)
```

---

## One-time setup

### 1. Push to GitHub

```powershell
git add Dockerfile render.yaml DEPLOYMENT.md
git commit -m "Switch to Render free tier deployment"
git push origin main
```

### 2. Create on Render (no payment)

**Option A — Blueprint (recommended)**

1. https://dashboard.render.com → **New** → **Blueprint**
2. Connect **AyanMhd/Song-Recommendation-Engine**
3. Set only:
   - `DATABASE_URL` — your Neon connection string
   - `MUSICBRAINZ_CONTACT_EMAIL` — your email (optional)
4. **Apply** — no card needed for `plan: free`

**Option B — If Blueprint shows an error**

1. **New** → **Web Service** (not Blueprint)
2. Connect the same GitHub repo
3. Settings:
   - **Language:** Docker
   - **Instance type:** Free
   - **Branch:** main
   - **Health check path:** `/health`
4. Add env var `DATABASE_URL`
5. **Create Web Service**

### 3. First deploy

- Build takes about **3–5 minutes** (no Python ML)
- When **Live**, open your `*.onrender.com` URL

### 4. Verify

- `/health` → database connected
- Search with **artist + example song** (leave vibe empty)

---

## Auto-updates

Push to `main` → Render rebuilds and redeploys automatically (`autoDeployTrigger: commit` in `render.yaml`).

---

## Free tier limits (Render)

- **Spins down** after ~15 minutes idle — first visit after that may take 30–60s to wake up
- **512 MB RAM** — enough for API + Postgres queries, not for ML
- **750 free instance hours/month** — enough for one always-on hobby project if traffic is low

---

## Add artist data

Run locally against the same Neon `DATABASE_URL`:

```powershell
cd backend
npm run pipeline:collect -- "Artist Name"
cd ..
python ml/preprocess.py "Artist Name"
```

No redeploy needed — only the database changes.

---

## Upgrade later (optional vibe search)

To enable vibe text on the server, upgrade to **Starter ($7/mo)** and use a Docker image that includes Python + `sentence-transformers` (see git history or ask to restore the full Dockerfile).
