# Production deployment

## Prerequisites

- Docker and Docker Compose v2
- Optional: Redis (included in `docker-compose.prod.yml`)
- Optional: S3-compatible storage (MinIO in compose, or AWS S3 / R2 / B2)
- API keys: OpenAI and/or Anthropic, plus a 32+ character `API_KEY`

## Quick start (Docker Compose)

```bash
git clone https://github.com/bialasq/opus-sales-app.git
cd opus-sales-app
cp backend/.env.example backend/.env
# Edit backend/.env: API_KEY, FRONTEND_ORIGIN, LLM keys, optional REDIS_URL / S3_*

docker compose -f docker-compose.prod.yml up --build -d
```

Verify:

```bash
curl -s http://localhost:3000/api/healthz
curl -I http://localhost:8080/
```

## Environment variables

See [backend/.env.example](../backend/.env.example). Required for production:

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | Yes | Shared secret for `x-api-key` header |
| `FRONTEND_ORIGIN` | Yes | CORS + UI link (e.g. `https://sales.example.com`) |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | For AI | At least one LLM provider |
| `REDIS_URL` | For scale-out | e.g. `redis://redis:6379` |
| `S3_BUCKET` | Optional | Object storage; empty = local volume |

Frontend container (runtime):

| Variable | Description |
|----------|-------------|
| `API_URL` | Public API base (e.g. `https://api.example.com/api`) |
| `API_KEY` | Same as backend (injected into `config.js`) |
| `SENTRY_DSN` | Optional frontend errors |

## Reverse proxy (TLS)

Terminate TLS at nginx, Caddy, or Traefik. Example nginx location:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
location / {
  proxy_pass http://127.0.0.1:8080;
}
```

Protect `/metrics` (Prometheus) at the network layer — it is not behind API key auth.

## Backups

- **Uploads:** S3 versioning, or rsync `uploads/` / MinIO bucket
- **Redis:** RDB snapshots (Redis service volume `redis_data`)
- **Traces:** `logs/traces/` — run `npm run gc:logs` (default 30 days retention)

## Monitoring

- Prometheus scrape: `http://backend:3000/metrics`
- Sentry: set `SENTRY_DSN` (backend) and `VUE_APP_SENTRY_DSN` / container `SENTRY_DSN`
- Health: `/api/healthz`, readiness: `/api/readyz`

## Scaling

Horizontal backend replicas require:

1. **Redis** (`REDIS_URL`) for agent jobs and AI cache
2. **S3** (`S3_BUCKET`) for shared uploads

## Maintenance scripts

```bash
cd backend
npm run gc:uploads   # delete uploads older than UPLOAD_RETENTION_DAYS
npm run gc:logs      # delete trace files older than LOG_RETENTION_DAYS
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 401 on API | `x-api-key` matches `API_KEY` in `.env` |
| CORS errors | `FRONTEND_ORIGIN` matches browser URL |
| AI always rules-only | LLM keys + `AI_BUDGET_USD_PER_DAY` |
| 503 on readyz | Container still starting; check backend logs |
