# Architecture

## High-level

```mermaid
flowchart TB
  Browser[Browser]
  FE[nginx / Vue frontend]
  BE[Express API]
  PG[(PostgreSQL)]
  Redis[(Redis)]
  Store[(S3 or local uploads)]
  LLM[OpenAI / Anthropic]

  Browser --> FE
  FE -->|/api + Bearer JWT<br/>refresh: httpOnly cookie| BE
  BE --> PG
  BE --> Redis
  BE --> Store
  BE --> LLM
```

Auth: users log in per organization (JWT, 15-min access token in memory; 30-day refresh
token as an httpOnly cookie, hashed in PostgreSQL, rotated on use). All tenant data is
scoped by `organizationId`. Legacy `x-api-key` exists only behind
`LEGACY_API_KEY_ENABLED` (default off) — see [SECURITY.md](../SECURITY.md).

## Multi-agent insights flow

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant Job as agentJobStore
  participant Analyst
  participant Strategist
  participant LLM

  UI->>API: POST /api/ai/insights/run
  API->>Job: createJob(sessionId)
  API-->>UI: 202 sessionId
  loop poll
    UI->>API: GET /api/ai/insights/job/:id
    API->>Job: getJob
    API-->>UI: status + current_step
  end
  API->>Analyst: runAnalystPass
  Analyst->>LLM: JSON facts
  API->>Strategist: ReAct loop
  Strategist->>LLM: tools + suggestions
  API->>Job: completeJob(result)
```

## Data flow (Excel)

1. User uploads `.xlsx` → validated → `StorageProvider`
2. Routes read workbook via `readWorkbookFromUpload`
3. Dashboards / AI tools consume parsed sheets (Wizyty, Sprzedaż, Faktury)
4. Agent cache key = filename mtime + size + prompt version + provider

## Security layers

- API key on `/api/*` (except health)
- CORS whitelist
- Per-route rate limits + daily LLM budget
- Path traversal protection on filenames
- PII scrubbing in trace logs only (not in business logic)
