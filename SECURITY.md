# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main`  | Yes       |

## Reporting a vulnerability

Please report security issues privately (do not open a public issue with exploit details).

- Preferred: open a **GitHub private security advisory** on this repository
  (Security → Advisories → *Report a vulnerability*).
- Alternatively, contact the repository owner privately via their GitHub profile.

We aim to acknowledge reports within 5 business days.

## Security model (current)

- **Authentication (primary): JWT.** Users register/login per organization; the short-lived
  access token (15 min) is held in memory on the frontend, and the 30-day refresh token is
  stored **hashed in the database** and delivered to the browser only as an
  **httpOnly + Secure + SameSite cookie** (scoped to `/api/auth`), so JavaScript/XSS cannot
  read it. Refresh tokens rotate on every use and can be revoked (logout).
- **Authorization: multi-tenant.** Every user belongs to an `Organization`; all data
  (uploads, analysis jobs) is scoped by `organizationId` and role (`OWNER`/`ADMIN`/`MEMBER`,
  enforced by `requireOrg`/`requireRole`).
- **Legacy `x-api-key`** (shared secret, no per-user identity, no org scope) exists only
  behind `LEGACY_API_KEY_ENABLED` (default **false**) for backward-compatible dev setups.
  Routes touching tenant data reject it via `requireOrg`.
- **Network:** `/metrics` requires `METRICS_TOKEN` (fail-closed in production); restrict
  admin endpoints via reverse proxy where possible.

## Mitigations in place

| Threat | Mitigation |
|--------|------------|
| Refresh-token theft via XSS | httpOnly cookie (not readable from JS); access token in memory only |
| Password brute force | Dedicated limiter on `/api/auth/login` + `/register` (failed attempts only), bcrypt cost 12, constant-time comparisons, account enumeration-safe errors |
| Path traversal on uploads | Filename validation + `resolveUploadPath` |
| Unrestricted uploads | Multer MIME/extension checks, 25 MB limit |
| CORS abuse | `FRONTEND_ORIGIN` whitelist (supports a comma-separated list) |
| XSS via API responses | CSP (helmet on the API, CSP header in the SPA's nginx); LLM output is HTML-escaped before rendering |
| DoS / LLM cost burn | Rate limits (Redis-shared across replicas when `REDIS_URL` set) + daily `AI_BUDGET_USD_PER_DAY` |
| Error detail leakage | Central error handler (no stack traces to clients) |
| PII in agent traces | Scrubbing before write (`piiScrubber`) |

## Known limitations

- No SSO/MFA in the application layer (use reverse proxy auth if needed).
- LLM prompt injection is mitigated best-effort (tagged `user_instructions`); not a guarantee.
- The `Secure` cookie flag requires HTTPS in production; without TLS the session will not persist.
