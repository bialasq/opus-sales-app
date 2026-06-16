# Privacy & data handling

## Data we process

- Excel files (visits, sales, invoices) uploaded by users
- LLM prompts and responses (cached temporarily)
- Application logs and agent traces (PII-scrubbed)

## Where data lives

| Data | Location | Retention |
|------|----------|-----------|
| Uploads | Local `uploads/` or S3 bucket | `UPLOAD_RETENTION_DAYS` (default 90), GC via `npm run gc:uploads` |
| Agent traces | `logs/traces/*.json` | `LOG_RETENTION_DAYS` (default 30), GC via `npm run gc:logs` |
| AI response cache | Redis or in-memory | TTL ~10–30 min |

## LLM provider policies

- **Anthropic:** API data is not used for model training by default. See [Anthropic Usage Policy](https://www.anthropic.com/legal/aup).
- **OpenAI:** Opt out of training in [Data Controls](https://platform.openai.com/account/data-controls). Enterprise tiers have stricter defaults.

Configure keys only on servers you control; do not commit `.env` files.

## PII in logs

Before writing agent traces, we scrub:

- Email → `[EMAIL]`
- Phone → `[PHONE]`
- PESEL / NIP → `[PESEL]` / `[NIP]`
- IBAN → `[IBAN]`
- Card-like numbers → `[CARD]`

Original Excel files retain customer data as uploaded (required for analysis).

## User rights (GDPR / RODO)

- **Access:** contact administrator to export uploads and traces
- **Erasure:** request deletion of uploads and derived cache
- **Rectification:** re-upload corrected spreadsheets

## Contact

Replace with your DPO / privacy contact: privacy@example.com
