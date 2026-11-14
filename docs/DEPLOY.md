# Deployment & Local Compose Guide

Verified against `compose.yaml`, `compose.db.yaml`, `compose.vector.yaml`, and `.env.example` on `main` (`0e646c3c50ad665c34013415809e951e489a3b0f`).

## Compose Profiles

### 1. API + Rust Engine (Standalone)
```bash
cp .env.example .env
docker compose up -d --build
```
- Builds `Dockerfile` (Go API + Rust `braspace-lunar-engine` binary).
- Exposes `127.0.0.1:${BRASPACE_PORT:-8080}:8080`.
- Runs with `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`, `mem_limit: 256m`, and a `32m` `tmpfs` at `/var/cache/braspace`.
- Healthcheck: `curl -fsS http://127.0.0.1:8080/readyz`.

### 2. API + PostgreSQL (`compose.db.yaml`)
```bash
docker compose -f compose.yaml -f compose.db.yaml up -d --build
```
- Adds PostgreSQL 16 service with persistent volume.

### 3. API + PostgreSQL + pgvector (`compose.vector.yaml`)
```bash
docker compose -f compose.yaml -f compose.db.yaml -f compose.vector.yaml up -d --build
```
- Enables optional metadata-only vector search (`/api/vector/status`, `/api/vector/search`). Disabled by default.

## Environment Variables (by Name)

| Variable | Purpose | Default / Example |
|---|---|---|
| `BRASPACE_PORT` | Host port mapped to container `:8080` | `8080` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact origins allowed for browser requests (wildcard rejected) | `http://localhost:5173` |
| `POSTGRES_PASSWORD` | PostgreSQL password used by `compose.db.yaml` | (set in `.env`, never commit) |
