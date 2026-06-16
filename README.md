# Opus Sales — Sales analytics

[![CI](https://github.com/bialasq/opus-sales-app/actions/workflows/ci.yml/badge.svg)](https://github.com/bialasq/opus-sales-app/actions/workflows/ci.yml)

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

**API auth (production):** set `API_KEY` in `backend/.env` and the same value as `VUE_APP_API_KEY` in `frontend/.env.local` (header `x-api-key` on `/api/*`). See `backend/.env.example`.

Frontend: see **`frontend/.env.example`** (proxy vs full API URL).

### Excel ingestion & validation

Uploaded workbooks are parsed **asynchronously** (`fs.promises` + `XLSX.read` on a buffer — no blocking `readFileSync` on the event loop).

After parse, rows are mapped to strict domain types in **`backend/types/excelTypes.ts`**:

| Type | Sheets (examples) |
|------|-------------------|
| `VisitRow` | `Wizyty` — `region`, `salesperson`, `isSalesVisit`, `distanceKm`, … |
| `SalesRow` | `Sprzedaż` / `Sprzedaz` — `productName`, `revenue`, `quantity`, `customerNip`, … |
| `PaymentRow` | `Faktury` — `invoiceNumber`, `amount`, `dueDate`, … |

Validation runs in **`backend/services/excelRowValidation.ts`**. Missing required columns or wrong types → **`ValidationError`** (HTTP 400 on analytics routes) with **filename, sheet name, and Excel row number**.

The AI insights flow treats validation like other guardrails: **`meta.partial`**, **`partialReason: "validation_error"`**, and a user-facing **`guardrailMessage`** instead of sending bad data to the LLM.

Core Excel/report logic lives in TypeScript: **`excelService.ts`**, **`reportService.ts`** (legacy `.js` removed).

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

### Production

- **Deploy:** [docs/deployment.md](docs/deployment.md) — `docker-compose.prod.yml`, Redis, optional S3/MinIO
- **Architecture:** [docs/architecture.md](docs/architecture.md)
- **Security:** [SECURITY.md](SECURITY.md)
- **Privacy / RODO:** [docs/privacy.md](docs/privacy.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **License:** [LICENSE](LICENSE) (MIT)

### Useful scripts

| Location | Command | Purpose |
|----------|---------|---------|
| `backend/` | `npm run dev` | API with nodemon |
| `backend/` | `npm run start` | API without watcher |
| `backend/` | `npm run typecheck` | TypeScript check |
| `backend/` | `npm test` | Vitest (path resolver, auth, budget, Excel validation, HTTP smoke) |
| `backend/` | `npm run generate-test-data` | Creates `backend/dane_testowe.xlsx` — Warmia-Mazury sample data (Olsztyn region; generate locally) |
| `backend/` | `npm run gc:logs` | Delete trace JSON older than `LOG_RETENTION_DAYS` (default 30) |
| `backend/` | `npm run test:agent` | Agent unit tests (if configured) |
| `frontend/` | `npm run dev` | Dev server + HMR |
| `frontend/` | `npm run build` | Production build (typecheck + webpack) |
| `frontend/` | `npm run typecheck` | TS + `@shared` alias |

### Repo layout

```
backend/          Express, /api/* routes, services (Excel, AI, reports)
  types/          Domain types (e.g. excelTypes.ts — SalesRow, VisitRow)
  services/       excelService.ts, excelRowValidation.ts, agentOrchestrator.ts, …
  shared/         Shared API types (also imported in frontend as @shared)
frontend/         Vue 3, views, ECharts panels
docker-compose.yml
```

Shared types: **`backend/shared/api-types.ts`** — wired in `vue.config.js` as `@shared`.

### Sales Route Optimizer (logistics)

- **POST `/api/ai/plan-route`** — day plan from Olsztyn (Warmia-Mazury), 8h budget including return leg, fuel estimate, `meta.route_plan` for the map.
- **UI:** Comprehensive analysis → **Plan trasy (Olsztyn)** — dialog with `RouteMap.vue` (SVG loop + table).

### Agentic workflow & debugging

#### High-level pipeline

Dashboard AI suggestions use **`getAiInsightsForFile`** in `backend/services/aiService.ts`. When an LLM provider is configured (`chooseProvider()` from `llmInvoke.ts`), the flow is:

1. **Cache** — key = uploaded filename + optional user instructions (`agentCache.ts`). On hit, the cached `AiInsightsResponse` is returned and a trace row is still logged with `from_cache: true`.
2. **Empty workbook** — if the workbook yields no product rows, the API returns an empty suggestion list with `meta.emptyDataset`.
3. **Orchestration** — `runAgenticInsightsWorkflow` in `agentOrchestrator.ts` runs the two-agent pipeline below.
4. **Post-processing** — `finalizeResponse` in `aiService.ts` runs **grounding eval**, optional **Judge**, writes an async **trace JSON**, and stores the result in the short-lived cache.

If no API keys exist, `getAiInsightsForFile` skips the orchestrator and returns **rule-based** suggestions (`orchestration: rules-only`) with the same eval pass where applicable.

#### Step 1 — Analyst (`runAnalystPass`)

- **Purpose:** produce **structured facts only** (no business recommendations): `summary`, `anomalies`, `metrics`, optional `toolSnapshots`.
- **Implementation:** before the LLM call, the backend always runs **`getLowStockAlerts`** on the workbook (`executeAgentTool` / `SalesWorkbookContext`). That snapshot is embedded in the Analyst user payload and again attached to `facts.toolSnapshots`.
- **Model:** `invokeLlmJsonObject` with `ANALYST_SYSTEM_PROMPT` from the active prompt pack (`backend/prompts/` via `AGENT_PROMPT_VERSION`). Model override: `AI_ANALYST_MODEL`, defaults: OpenAI `gpt-4o-mini`, Anthropic `claude-haiku-4-5-20251001`.
- **Failure handling:** if the Analyst LLM call throws, `buildAnalystUnavailableFacts` builds synthetic facts (error in `anomalies`, optional alerts snapshot) so the Strategist can still run.

#### Expert persona routing (`resolveExpertPersona`)

After facts exist, the Strategist gets an **expert persona** appended to the system prompt:

| Persona | When chosen (heuristic) |
|---------|-------------------------|
| `regional_logistics_manager` | Keywords about routes / visits / Olsztyn / region; wins if score ≥2 and beats finance & supply |
| `financial_controller` | Payment / receivables / margin language; wins if score > supply and ≥2 |
| `supply_chain_manager` | Stock / rotation / overstock language; extra weight if `getLowStockAlerts` reports risks |
| `store_manager` | default |

Persona blocks live in `agent_v2.ts` (`STRATEGIST_PERSONA_*`). The Strategist system prompt also includes **`buildStrategistKnowledgeContext`** (`knowledgeService.ts`): short RLHF-style excerpts from prior **approved** feedback and **rejects** for the same file family, so the model avoids repeating rejected patterns.

#### Step 2 — Strategist (ReAct + tools)

- **Input:** Analyst `AnalystFacts` JSON + product count + optional **Direct User Constraint** (`userInstructions` from the API query/body).
- **System prompt:** `STRATEGIST_SYSTEM_PROMPT` + persona block + knowledge context + product name hints from the workbook.
- **Loop:** separate implementations for **OpenAI** (`runStrategistReActOpenAI`) and **Anthropic** (`runStrategistReActAnthropic`):
  - Each round the model may return **tool_calls** (OpenAI) or tool-use blocks (Anthropic). The server executes matching entries in **`SALES_AGENT_TOOLS`** (`aiAgentTools.ts`), appends `thought` / `action` / `actionInput` / `observation` (truncated) to **`reactTrace`**, and feeds tool results back as the next message.
  - **Stopping when the model returns plain assistant text** that parses as JSON containing `suggestions` (and optionally `reactTrace`): suggestions are validated (title, description, priority) and capped (e.g. up to 12).
  - If JSON is invalid, the server appends **`STRATEGIST_RETRY_HINT`** and continues until limits hit.

**Strategist model:** `AI_STRATEGIST_MODEL` or `AI_MODEL` (OpenAI) / `ANTHROPIC_MODEL` (Anthropic), with code defaults (`gpt-4o`, `claude-sonnet-4-6`).

#### Guardrails (`agentGuardrails.ts`)

| Control | Meaning |
|---------|---------|
| `MAX_ITERATIONS` | Max ReAct rounds (default **5**, env `AGENT_MAX_ITERATIONS`) |
| `SESSION_TOKEN_LIMIT` | Cumulative tokens for the session (default **28_000**, env `AGENT_SESSION_TOKEN_LIMIT`) |
| Tool budget | `shouldStopForToolBudget`: stops when the number of tool steps in `reactTrace` reaches `MAX_ITERATIONS` |

On stop, **`buildPartialAgenticResult`** returns partial suggestions + `meta.partial` / `partialReason` / `guardrailMessage`.

`partialReason` values include `max_iterations`, `token_limit`, `budget_exceeded`, and **`validation_error`** (invalid Excel structure before or during workbook load).

#### Post-orchestration (`finalizeResponse` in `aiService.ts`)

1. **`evaluateAllSuggestions`** (`agentEval.ts`) — fuzzy-matches product names mentioned in each suggestion against the **Analyst facts** and the **product catalog**; attaches `eval` flags (`verified`, `potential_hallucination`, etc.) and an `evalSummary`.
2. **`runJudgeReview`** (`judgeService.ts`) — optional second LLM pass over facts + suggestions; result in **`meta.judge_review`** (per-item consistency / risk / `approved`).
3. **`logAgentTraceAsync`** — persists a JSON trace under `backend/logs/traces/` (ignored except `.gitkeep`) with models, tokens, cost estimate, eval summary, judge output.
4. **`setCachedInsights`** — stores the response for repeat requests with the same cache key.

#### Async jobs

`POST /api/ai/insights/run` creates an in-memory job (`agentJobStore.ts`) that runs the same workflow in the background; the client polls **`GET /api/ai/insights/job/:sessionId`** for `status`, `current_step` (driven by `WorkflowHooks.onStep` from the orchestrator), and the final `result`.

#### RLHF feedback

`POST /api/ai/insights/feedback` appends structured feedback; `knowledgeService.ts` ranks prior **approve** lines for injection into future Strategist prompts.

#### Trace log fields (reference)

| Field | Meaning |
|-------|---------|
| `sessionID` | Same as `meta.sessionId` in the API |
| `full_trace` | ReAct steps: `thought`, `action`, `actionInput`, `observation` |
| `analyst_facts` | Analyst JSON payload |
| `eval_summary` | Counts from `evaluateAllSuggestions` |
| `judge_review` | Output of `runJudgeReview` when present |

**Prompt pack switch:** `AGENT_PROMPT_VERSION` → `backend/prompts/index.ts` maps to `agent_v1` or `agent_v2`.

**Adding a tool:** register in **`backend/services/aiAgentTools.ts`** (`name`, `description`, `parameters`, `execute`). OpenAI uses JSON Schema–like `parameters`; the Strategist discovers tools by description. Run `npm run typecheck` in `backend/`.

**Related (not the main insights loop):** `runAgentToolInsightLoop` in `agentOrchestrator.ts` is a lighter ReAct loop used by legacy analytics endpoints that expect a single `insights` string. **Sales Route Optimizer** uses a separate planner in `routePlannerService.ts` with a reduced tool set (`getRoutePlannerTools`).

### Troubleshooting

1. **404 on `/api/...`** — ensure axios base URL ends with `/api` or set `VUE_APP_API_URL` correctly.
2. **`ECONNREFUSED`** — backend not running or wrong proxy port.
3. **Empty dashboard** — column names may not match the Excel parser (e.g. missing `Sprzedaż` / `Wizyty` sheets).
4. **AI shows rules / fallback** — missing or invalid API key / model; check backend logs and `.env`.
5. **400 on upload / analysis — Excel validation** — message names sheet and row; fix columns (`Nazwa_Produktu`, `Wartość`, `Województwo`, `Opiekun`, …) or regenerate test data with `npm run generate-test-data`.
6. **401 on `/api/*`** — set matching `API_KEY` (backend) and `VUE_APP_API_KEY` (frontend).

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

**Auth API:** `API_KEY` w `backend/.env` oraz `VUE_APP_API_KEY` we frontendzie (nagłówek `x-api-key`).

### Walidacja Excela

Pliki są czytane **asynchronicznie** (bufor + `XLSX.read`, bez blokującego I/O na event loop).

Wiersze trafiają do typów z **`backend/types/excelTypes.ts`** (`VisitRow`, `SalesRow`, `PaymentRow`). Walidacja: **`excelRowValidation.ts`**. Błąd struktury → **`ValidationError`** (HTTP 400) z nazwą pliku, arkusza i numerem wiersza.

Pipeline AI przy błędzie walidacji zwraca wynik częściowy: **`partialReason: "validation_error"`** (bez wysyłania `undefined` do LLM).

Serwisy Excel/raportów: **`excelService.ts`**, **`reportService.ts`** (TypeScript).

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
| `backend/` | `npm test` | Vitest (m.in. walidacja Excel, auth, smoke HTTP) |
| `backend/` | `npm run generate-test-data` | `dane_testowe.xlsx` — dane testowe **woj. warmińsko-mazurskie** (baza Olsztyn) |
| `backend/` | `npm run gc:logs` | GC starych trace w `logs/traces/` |
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

### Orkiestracja agentów (szczegółowo)

Poniżej ten sam przepływ co w sekcji angielskiej — **kolejność i pliki źródłowe**.

#### Wejście API

Sugestie AI z dashboardu obsługuje **`getAiInsightsForFile`** (`backend/services/aiService.ts`).

1. **Cache** (`agentCache.ts`) — klucz: nazwa pliku w `uploads/` + opcjonalne `userInstructions`. Trafienie → natychmiastowy zwrot wyniku, w logu trace flaga `from_cache`.
2. **Brak produktów** w Excelu → pusta lista, `meta.emptyDataset`.
3. **Brak klucza LLM** → tryb **`rules-only`** (heurystyki z rotacji), bez `runAgenticInsightsWorkflow`.
4. **Pełny pipeline** → `runAgenticInsightsWorkflow` (`agentOrchestrator.ts`), potem `finalizeResponse` (`aiService.ts`).

#### Krok 1 — Analityk (`runAnalystPass`)

- Zwraca wyłącznie **fakty**: `summary`, `anomalies`, `metrics`, opcjonalnie `toolSnapshots` — bez gotowych rekomendacji biznesowych.
- **Zawsze** przed LLM wywoływane jest narzędzie **`getLowStockAlerts`** na kontekście pliku; wynik trafia do payloadu dla modelu i do `facts.toolSnapshots`.
- Wywołanie: **`invokeLlmJsonObject`** z `ANALYST_SYSTEM_PROMPT` z aktywnego pakietu promptów (`backend/prompts/`, wybór przez `AGENT_PROMPT_VERSION`). Model: `AI_ANALYST_MODEL` lub domyślny (OpenAI: `gpt-4o-mini`, Anthropic: Haiku z `.env.example`).
- **Błąd Analityka** — budowane są sztuczne fakty (`buildAnalystUnavailableFacts`), Strateg kontynuuje z komunikatem w `anomalies` i ewentualnym snapshotem alertów.

#### Routing persony Stratega (`resolveExpertPersona`)

Na podstawie tekstu faktów + snapshotu `getLowStockAlerts` wybierana jest jedna z person:

- **`regional_logistics_manager`** — słowa kluczowe trasy / wizyt / Olsztyn / region (logistyka).
- **`financial_controller`** — płatności, należności, marże (wyższy score niż supply, próg ≥2).
- **`supply_chain_manager`** — magazyn, rotacja, stockout/overstock (+ bonus za niepuste listy ryzyka z narzędzia).
- **`store_manager`** — domyślnie.

Bloki person w **`backend/prompts/agent_v2.ts`**. Do promptu Stratega doklejany jest też kontekst z **`knowledgeService.ts`** (krótkie cytaty z wcześniejszego feedbacku **approve** oraz lista **reject** dla podobnych plików).

#### Krok 2 — Strateg (ReAct + narzędzia)

- **Wejście:** JSON faktów Analityka + liczba produktów + opcjonalne wytyczne użytkownika (Direct User Constraint).
- **Pętla:** osobna implementacja **OpenAI** (`runStrategistReActOpenAI`) i **Anthropic** (`runStrategistReActAnthropic`): function calling / tool use → **`executeAgentTool`** dla wpisów z **`SALES_AGENT_TOOLS`** (`aiAgentTools.ts`) → dopisanie kroku do **`reactTrace`** (`thought`, `action`, `actionInput`, `observation` skrócone) → zwrot wyniku narzędzia jako kolejna wiadomość.
- **Zakończenie:** odpowiedź tekstowa modelu parsowana jako JSON z tablicą **`suggestions`** (i opcjonalnie własnym `reactTrace`). Błąd parsowania → hint **`STRATEGIST_RETRY_HINT`** i kolejna runda, aż limity.

**Model Stratega:** `AI_STRATEGIST_MODEL` lub `AI_MODEL` / `ANTHROPIC_MODEL` (domyślnie mocniejszy model niż Analityk).

#### Guardrails (`agentGuardrails.ts`)

- **`AGENT_MAX_ITERATIONS`** (domyślnie 5) — maks. rund pętli ReAct.
- **`AGENT_SESSION_TOKEN_LIMIT`** (domyślnie 28000) — sumaryczny budżet tokenów na sesję Analityk+Strateg.
- **Budżet narzędzi** — `shouldStopForToolBudget`: po `MAX_ITERATIONS` krokach z narzędziami przerywamy z wynikiem częściowym (`meta.partial`, `partialReason`).
- **`validation_error`** — nieprawidłowa struktura Excela (komunikat w UI zamiast wysyłania błędnych danych do LLM).

#### Po orkiestracji (`finalizeResponse`)

1. **`evaluateAllSuggestions`** (`agentEval.ts`) — dopasowanie nazw produktów w sugestiach do katalogu i faktów (m.in. fuzzy); pola `eval` na każdej sugestii + `evalSummary`.
2. **`runJudgeReview`** (`judgeService.ts`) — drugi LLM audytuje spójność z faktami; wynik w **`meta.judge_review`**.
3. **`logAgentTraceAsync`** — zapis JSON do `backend/logs/traces/` (w repo tylko `.gitkeep`).
4. **`setCachedInsights`** — cache odpowiedzi.

#### Tryb asynchroniczny

`POST /api/ai/insights/run` → zadanie w `agentJobStore.ts` → to samo workflow w tle; front **polluje** `GET /api/ai/insights/job/:sessionId` (`current_step` aktualizowany przez hooki `onStep` z orkiestratora).

#### RLHF

`POST /api/ai/insights/feedback` zapisuje werdykt; `knowledgeService.ts` wczytuje historię i wstrzykuje ją do kolejnych promptów Stratega.

#### Inne pętle (nie = główny dashboard)

- **`runAgentToolInsightLoop`** — uproszczony ReAct zwracający jeden blok tekstowy `insights` (endpointy legacy w `aiAgents` / analytics).
- **`routePlannerService.ts`** — osobny agent planu trasy z **węższym zestawem narzędzi** (`getRoutePlannerTools`), nie mylić z główną orkiestrą insightów.

#### Pliki „ścieżka krytyczna”

| Plik | Rola |
|------|------|
| `aiService.ts` | Cache, wejście/wyjście API, `finalizeResponse`, joby |
| `agentOrchestrator.ts` | Analityk, Strateg, ReAct OpenAI/Anthropic |
| `aiAgentTools.ts` | Rejestr narzędzi + `SalesWorkbookContext` |
| `agentGuardrails.ts` | Limity iteracji i tokenów |
| `agentEval.ts` | Grounding sugestii |
| `judgeService.ts` | Judge LLM |
| `knowledgeService.ts` | RLHF / kontekst z logów |
| `prompts/agent_v*.ts` | Prompty Analityka i Stratega |

### Typowe problemy

1. **404 na `/api`** — sprawdź bazę URL axios (`/api`).
2. **`ECONNREFUSED`** — backend wyłączony lub zły port.
3. **Pusty dashboard** — inne nazwy kolumn / arkuszy w Excelu.
4. **Tryb regułowy AI** — brak lub błędny klucz API / model w `.env`.
5. **400 — walidacja Excela** — komunikat wskazuje arkusz i wiersz; popraw kolumny lub `npm run generate-test-data`.
6. **401 na `/api/*`** — ustaw `API_KEY` i `VUE_APP_API_KEY`.

### Pierwszy push na GitHub

```bash
git remote add origin https://github.com/TWOJ_USER/TWOJE_REPO.git
git push -u origin main
```

### Licencja / kontakt

Uzupełnij pod swój zespół.

---

*If something is missing in either language, extend this README and open a PR.*
