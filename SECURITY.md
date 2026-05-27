# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main`  | Yes       |

## Reporting a vulnerability

Please report security issues privately (do not open a public issue with exploit details).

- Email: security@example.com (replace with your contact)
- Or: GitHub **Private security advisory** on this repository

We aim to acknowledge reports within 5 business days.

## Security model (current)

- **Authentication:** shared `x-api-key` (min. 32 characters). This is service-to-service / team secret, not per-user identity.
- **Authorization:** single tenant; all authenticated clients share the same data scope.
- **Network:** restrict `/metrics` and admin endpoints via firewall or reverse proxy where possible.

## Mitigations in place

| Threat | Mitigation |
|--------|------------|
| Path traversal on uploads | Filename validation + `resolveUploadPath` |
| Unrestricted uploads | Multer MIME/extension checks, 25 MB limit |
| CORS abuse | `FRONTEND_ORIGIN` whitelist |
| DoS / LLM cost burn | Rate limits + daily `AI_BUDGET_USD_PER_DAY` |
| Error detail leakage | Central error handler (no stack traces to clients) |
| PII in agent traces | Scrubbing before write (`piiScrubber`) |

## Known limitations

- No per-user RBAC or SSO in the application layer (use reverse proxy auth if needed).
- LLM prompt injection is mitigated best-effort (tagged `user_instructions`); not a guarantee.
