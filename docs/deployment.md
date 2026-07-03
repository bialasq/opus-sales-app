# Production deployment

## Prerequisites

- Docker and Docker Compose v2
- PostgreSQL — bundled in `docker-compose.prod.yml`, or an external managed instance (RDS / Neon / Supabase / Cloud SQL)
- Optional: Redis (included in `docker-compose.prod.yml`) — required only for multi-replica scale-out
- Optional: S3-compatible storage (MinIO in compose, or AWS S3 / R2 / B2)
- API keys: OpenAI and/or Anthropic
- A 32+ character `JWT_SECRET` (primary auth). `API_KEY` is only needed for the optional legacy `x-api-key` mode.

## Quick start (Docker Compose)

```bash
git clone https://github.com/bialasq/opus-sales-app.git
cd opus-sales-app

# 1. Compose-level secrets (Postgres, MinIO, optional external DATABASE_URL)
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, MINIO_ROOT_USER/PASSWORD, FRONTEND_ORIGIN

# 2. Backend app config (JWT_SECRET, LLM keys, optional S3/REDIS)
cp backend/.env.example backend/.env
# Edit backend/.env: set JWT_SECRET (32+ chars), LLM keys. Leave DATABASE_URL as-is
#   (it is overridden by compose to point at the bundled Postgres).

docker compose -f docker-compose.prod.yml up --build -d
```

Database migrations run **automatically** on backend container start (`prisma migrate deploy`
via `docker-entrypoint.sh`). Set `RUN_MIGRATIONS=false` to disable (e.g. when a separate
CI/CD job applies migrations).

Verify:

```bash
curl -s http://localhost:3000/api/healthz
curl -s http://localhost:3000/api/readyz   # 200 only when DB + Redis reachable
curl -I http://localhost:8080/
```

### Using an external (managed) database

1. Set `DATABASE_URL` in the **root `.env`** (e.g. `postgresql://user:pass@host:5432/opus?schema=public&sslmode=require`).
2. Don't start the bundled Postgres, e.g. start only the services you need, or remove
   `postgres` from the backend `depends_on`. The backend will migrate and connect to the external DB.

## Environment variables

Two layers — see [.env.example](../.env.example) (compose) and [backend/.env.example](../backend/.env.example) (app).

### Compose-level (root `.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes (bundled DB) | Postgres password; prod compose refuses to start without it |
| `POSTGRES_USER` / `POSTGRES_DB` | No | Default `opus` / `opus` |
| `DATABASE_URL` | Only for external DB | Overrides bundled Postgres; leave empty to use the container |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Yes (if using MinIO) | No defaults — compose refuses to start without them |
| `FRONTEND_ORIGIN` | Yes | CORS + UI link (e.g. `https://sales.example.com`) |

### Backend app (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | 32+ char secret signing access tokens — **primary auth** |
| `DATABASE_URL` | Yes (non-Docker) | In Docker it is supplied by compose; outside Docker set it here |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | For AI | At least one LLM provider |
| `LEGACY_API_KEY_ENABLED` | No | `false` (default/recommended). `true` enables legacy `x-api-key` |
| `API_KEY` | Only if legacy enabled | 32+ char shared secret for `x-api-key` header |
| `REDIS_URL` | For scale-out | e.g. `redis://redis:6379` |
| `S3_BUCKET` | Optional | Object storage; empty = local volume |
| `METRICS_TOKEN` | Recommended | Protects `GET /metrics`; in production an unset token blocks the endpoint |

Frontend container (runtime):

| Variable | Description |
|----------|-------------|
| `API_URL` | Public API base (e.g. `https://api.example.com/api`) |
| `SENTRY_DSN` | Optional frontend errors |

> Auth note: the app uses **JWT** (register/login in the UI). The access token lives in memory;
> the refresh token is stored in an **httpOnly, Secure, SameSite cookie** set by the API — it is
> never exposed to JavaScript. Ensure the API is served over HTTPS in production so the `Secure`
> cookie is accepted, and that the frontend and API share a parent domain (or use the same origin
> via the reverse proxy) so the cookie is sent on `/api/auth/refresh`.

## Reverse proxy (TLS)

Terminate TLS at nginx, Caddy, or Traefik. Example nginx location:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
location / {
  proxy_pass http://127.0.0.1:8080;
}
```

> The backend sets `app.set("trust proxy", 1)` in production so rate limiting and the `Secure`
> cookie work correctly behind a TLS-terminating proxy. Make sure the proxy sets
> `X-Forwarded-Proto`.

Protect `/metrics` (Prometheus) with `METRICS_TOKEN` in backend `.env` (Bearer or `?token=`).

## CI/CD

- **CI** (`.github/workflows/ci.yml`): lint + typecheck + tests + build + prod-deps `npm audit` (blocking) for backend and frontend on every push/PR.
- **Image build** (`.github/workflows/docker.yml`): validates Docker builds on PRs; pushes branch/sha images to GHCR on `main`.
- **Release & deploy** (`.github/workflows/deploy.yml`): on a version tag (`vX.Y.Z`) or manual dispatch, builds and pushes versioned images to GHCR, then deploys to the VPS over SSH (`docker compose pull && up -d`).

### Configuring VPS deploy

On the server: clone the repo to a directory, create root `.env` and `backend/.env`, and ensure Docker + Compose v2 are installed. Then add these GitHub Actions secrets:

| Secret | Purpose |
|--------|---------|
| `SSH_HOST` / `SSH_USER` / `SSH_KEY` | SSH access to the VPS (private key in `SSH_KEY`) |
| `SSH_PORT` | Optional, defaults to 22 |
| `DEPLOY_PATH` | Path to the repo checkout on the server |
| `GHCR_PAT` | Optional PAT (`read:packages`) for the server to pull **private** images |

The deploy job exports `BACKEND_IMAGE` / `FRONTEND_IMAGE` (GHCR refs for the released tag) before
`docker compose pull`, so the bundled `image:` defaults are overridden with the published images.
Tag a release to ship:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## Database backups

The bundled Postgres stores data in the `postgres_data` volume. Use the provided script,
which dumps to `./backups/*.sql.gz`, rejects empty dumps and rotates old files:

```bash
./scripts/backup-db.sh                    # RETENTION_DAYS / BACKUP_DIR overridable

# Schedule daily at 03:00 (cron on the host):
0 3 * * * cd /opt/opus-sales-app && ./scripts/backup-db.sh >> /var/log/opus-backup.log 2>&1

# Restore a dump:
gunzip -c backups/opus-opus-YYYY-MM-DD_HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U "${POSTGRES_USER:-opus}" "${POSTGRES_DB:-opus}"
```

A managed database (RDS/Neon/etc.) provides automated backups out of the box — prefer it for
production if you don't want to operate Postgres yourself.

## Monitoring

- Prometheus scrape: `http://backend:3000/metrics` (with `Authorization: Bearer <METRICS_TOKEN>`)
- Sentry: set `SENTRY_DSN` (backend) and `VITE_SENTRY_DSN` in frontend build / container `SENTRY_DSN`
- Health: `/api/healthz` (liveness), `/api/readyz` (readiness — checks DB + Redis)

## Scaling

Horizontal backend replicas require:

1. **Redis** (`REDIS_URL`) — agent jobs, AI cache, **and the shared rate-limit store**
2. **S3** (`S3_BUCKET`) — shared uploads across replicas
3. External or single shared **Postgres** (don't run one Postgres per replica)

## Maintenance scripts

```bash
cd backend
npm run gc:uploads   # delete uploads older than UPLOAD_RETENTION_DAYS
npm run gc:logs      # delete trace files older than LOG_RETENTION_DAYS
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Backend exits on boot | `POSTGRES_PASSWORD` / `DATABASE_URL` set; Postgres healthy; check `migrate deploy` logs |
| 401 on API | Logged in? JWT expired → refresh; or `JWT_SECRET` mismatch between restarts |
| CORS errors | `FRONTEND_ORIGIN` matches browser URL |
| Refresh fails / logged out instantly | API not on HTTPS (Secure cookie dropped) or cross-site cookie blocked |
| AI always rules-only | LLM keys + `AI_BUDGET_USD_PER_DAY` |
| 503 on readyz | DB or Redis unreachable; check container health |
| MinIO/compose won't start | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` unset in root `.env` |
