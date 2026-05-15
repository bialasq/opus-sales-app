# Opus Sales — Sales analytics

This README is bilingual: **English first**, then Polish.

---

## English

Get the project running locally in about **10 minutes** — without guessing why the proxy fails or where the API lives.

### What it is (one sentence)

**Vue 3 + Element Plus** frontend and **Express + TypeScript** backend. Upload an Excel with visits / sales / invoices, get dashboards, analyses, customer profiles, and an **AI layer** (OpenAI or Anthropic — or rule-based mode without API keys).

### TL;DR — local run without Docker

**Terminal 1** (API, default port **3000**):

```bash
cd backend
cp .env.example .env   # Windows: copy .env.example .env
npm install
npm run dev
```

**Terminal 2** (UI, default **http://localhost:8080**):

```bash
cd frontend
npm install
npm run dev
```

Then in the browser: **upload an `.xlsx`** to run analytics. The backend stores files under `backend/uploads/` (ignored by git so user spreadsheets are not pushed).

**Important:** the frontend talks to the API via **`/api`** and the proxy in `vue.config.js` (default target `http://127.0.0.1:3000`). If the backend is down you will see network errors — start `backend` first.

### Environment variables (AI and ports)

Template: **`backend/.env.example`**. Minimum for AI:

- `AI_PROVIDER` — `openai` or `anthropic` (optional; if unset, a key-based fallback is used)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — **only** in local `backend/.env`, never commit secrets
- `AI_MODEL`, `ANTHROPIC_MODEL`, `AI_ANALYST_MODEL`, `AI_STRATEGIST_MODEL` — optional; see `.env.example` for current Claude model IDs (older `claude-3-5-*` snapshots may return 404)

Without keys, the app still runs — some modules use **heuristics / fallback** instead of an LLM.

Frontend: see **`frontend/.env.example`** (proxy vs full API URL).

### Docker

From the repo root:

```bash
cp backend/.env.example backend/.env   # Windows: copy ...
docker compose build
docker compose up
```

- UI: **http://localhost:8080**
- API: **http://localhost:3000**

Ports and proxy are documented in `docker-compose.yml` and `frontend/.env.example`.

### Useful scripts

| Location | Command | Purpose |
|----------|---------|---------|
| `backend/` | `npm run dev` | API with nodemon |
| `backend/` | `npm run start` | API without watcher |
| `backend/` | `npm run typecheck` | TypeScript check |
| `backend/` | `npm run generate-test-data` | Creates `backend/dane_testowe.xlsx` — Warmia-Mazury sample data (Olsztyn region; generate locally) |
| `backend/` | `npm run test:agent` | Agent unit tests (if configured) |
| `frontend/` | `npm run dev` | Dev server + HMR |
| `frontend/` | `npm run build` | Production build (typecheck + webpack) |
| `frontend/` | `npm run typecheck` | TS + `@shared` alias |

### Repo layout

```
backend/          Express, /api/* routes, services (Excel, AI, reports)
  shared/         Shared API types (also imported in frontend as @shared)
frontend/         Vue 3, views, ECharts panels
docker-compose.yml
```

Shared types: **`backend/shared/api-types.ts`** — wired in `vue.config.js` as `@shared`.

### Sales Route Optimizer (logistics)

- **POST `/api/ai/plan-route`** — day plan from Olsztyn (Warmia-Mazury), 8h budget including return leg, fuel estimate, `meta.route_plan` for the map.
- **UI:** Comprehensive analysis → **Plan trasy (Olsztyn)** — dialog with `RouteMap.vue` (SVG loop + table).

### Agentic workflow & debugging

Pipeline: **Analyst** (facts) → **Strategist** (ReAct + tools) → **eval** (grounding) → API response.

**Trace logs (backend):** each `GET /api/ai/insights?filename=...` can write JSON under `backend/logs/traces/<ISO>_<sessionId>.json` (see `.gitignore` — only `.gitkeep` is tracked).

| Field | Meaning |
|-------|---------|
| `sessionID` | Session UUID (same as `meta.sessionId` in API) |
| `full_trace` | ReAct steps: `thought`, `action`, `observation` |
| `analyst_facts` | Facts and `anomalies` from the Analyst step |
| `eval_summary` | Verified vs `potential_hallucination` counts |

**Prompt versioning:** `backend/prompts/agent_v2.ts` (default via `AGENT_PROMPT_VERSION`).

**Adding a tool:** register in **`backend/services/aiAgentTools.ts`** (`name`, `description`, `parameters`, `execute`). Run `npm run typecheck` in `backend/`.

**Production-style features:** guardrails (`MAX_ITERATIONS`, token limits), rate-limit retry, short-lived cache, async job polling (`POST /api/ai/insights/run`), RLHF feedback (`POST /api/ai/insights/feedback`), optional Judge review.

### Troubleshooting

1. **404 on `/api/...`** — ensure axios base URL ends with `/api` or set `VUE_APP_API_URL` correctly.
2. **`ECONNREFUSED`** — backend not running or wrong proxy port.
3. **Empty dashboard** — column names may not match the Excel parser (e.g. missing `Sprzedaż` / `Wizyty` sheets).
4. **AI shows rules / fallback** — missing or invalid API key / model; check backend logs and `.env`.

### First push to GitHub

```bash
cd opus-sales-app-main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

### License / contact

Fill in for your team or company.

---

## Polski

Ten sam projekt — **krótki przewodnik po polsku**. Szczegóły techniczne i tabele są analogiczne do sekcji angielskiej powyżej.

### Czym to jest

Aplikacja **Vue 3 + Element Plus** + **Express + TypeScript**. Wgrywasz Excel (wizyty, sprzedaż, faktury), dostajesz dashboard, analizy, profile klientów i warstwę **AI** (OpenAI / Anthropic albo tryb regułowy bez kluczy).

### TL;DR — lokalnie bez Dockera

**Terminal 1** (API, port **3000**):

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

**Terminal 2** (UI, **http://localhost:8080**):

```bash
cd frontend
npm install
npm run dev
```

W przeglądarce **wgraj plik `.xlsx`**. Backend zapisuje pliki w `backend/uploads/` (folder w `.gitignore`).

**Ważne:** frontend łączy się z API przez **`/api`** i proxy z `vue.config.js` (domyślnie `http://127.0.0.1:3000`). Bez backendu pojawią się błędy sieciowe — najpierw uruchom `backend`.

### Zmienne środowiskowe

Szablon: **`backend/.env.example`**. Klucze **tylko** w lokalnym `backend/.env` — nie commituj sekretów. Aktualne ID modeli Claude są w przykładzie (starsze `claude-3-5-*` mogą zwracać 404).

Frontend: **`frontend/.env.example`**.

### Docker

Z katalogu głównego:

```bash
copy backend\.env.example backend\.env
docker compose build
docker compose up
```

- UI: **http://localhost:8080**
- API: **http://localhost:3000**

### Przydatne skrypty

| Gdzie | Komenda | Po co |
|--------|---------|--------|
| `backend/` | `npm run dev` | API (nodemon) |
| `backend/` | `npm run typecheck` | TypeScript |
| `backend/` | `npm run generate-test-data` | `dane_testowe.xlsx` — dane testowe **woj. warmińsko-mazurskie** (baza Olsztyn) |
| `frontend/` | `npm run dev` | Serwer dev + HMR |
| `frontend/` | `npm run build` | Build produkcyjny |

### Struktura repo

```
backend/          Express, trasy /api/*, serwisy
  shared/         Wspólne typy API (@shared w Vue)
frontend/         Vue 3, panele (ECharts)
```

### Sales Route Optimizer

- **POST `/api/ai/plan-route`** — plan dnia z Olsztyna, budżet czasu z powrotem do bazy, szacunek paliwa, `meta.route_plan` pod mapę.
- **UI:** Kompleksowa analiza → **Plan trasy (Olsztyn)** — mapa SVG + tabela.

### Agent AI — debug

Pipeline: **Analityk** → **Strateg** (ReAct + narzędzia) → **eval** → odpowiedź.

Logi trace: `backend/logs/traces/` (szczegóły jak w sekcji angielskiej). Prompty: **`backend/prompts/agent_v2.ts`**. Narzędzia: **`backend/services/aiAgentTools.ts`**.

### Typowe problemy

1. **404 na `/api`** — sprawdź bazę URL axios (`/api`).
2. **`ECONNREFUSED`** — backend wyłączony lub zły port.
3. **Pusty dashboard** — inne nazwy kolumn / arkuszy w Excelu.
4. **Tryb regułowy AI** — brak lub błędny klucz API / model w `.env`.

### Pierwszy push na GitHub

```bash
git remote add origin https://github.com/TWOJ_USER/TWOJE_REPO.git
git push -u origin main
```

### Licencja / kontakt

Uzupełnij pod swój zespół.

---

*If something is missing in either language, extend this README and open a PR.*
