FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend
RUN cd frontend && npm run build

COPY backend ./backend

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

WORKDIR /app/backend
CMD ["sh", "-c", "node scripts/migrateSchema.js && node src/index.js"]
