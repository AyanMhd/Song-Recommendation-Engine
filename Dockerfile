FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend
RUN cd frontend && npm run build

COPY ml/requirements.txt ./ml/
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/venv/bin/pip install --no-cache-dir -r ml/requirements.txt \
  && /opt/venv/bin/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY backend ./backend
COPY ml ./ml

ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/venv/bin/python
ENV PORT=10000

EXPOSE 10000

WORKDIR /app/backend
CMD ["sh", "-c", "node scripts/migrateSchema.js && node src/index.js"]
