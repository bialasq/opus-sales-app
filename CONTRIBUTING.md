# Contributing

## Branch naming

- `fix/*` — bug fixes and security
- `feat/*` — features
- `chore/*` — tooling, docs, deps
- `ci/*` — CI/CD only

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: …`
- `fix: …`
- `docs: …`
- `test: …`
- `chore: …`

## Pull request checklist

- [ ] `cd backend && npm run typecheck && npm test`
- [ ] `cd frontend && npm run typecheck` (and `npm run build` if UI changed)
- [ ] `.env.example` updated for new variables
- [ ] Docs updated when behavior or deployment changes

## Local development

See [README.md](README.md) and [docs/deployment.md](docs/deployment.md).
