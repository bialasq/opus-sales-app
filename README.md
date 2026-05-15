# Opus Sales — analityka sprzedaży

Hej. Ten README jest po to, żebyś **w 10 minut** odpalił projekt u siebie, bez zgadywania „czemu proxy nie działa” albo „gdzie jest API”.

## Czym to jest (jednym zdaniem)

Aplikacja **Vue 3 + Element Plus** na froncie i **Express + TypeScript** na backendzie. Wgrywasz Excel z wizytami / sprzedażą / fakturami, dostajesz dashboard, analizy, profile klientów i warstwę **AI** (OpenAI albo Anthropic — albo tryb regułowy bez kluczy).

---

## TL;DR — lokalnie bez Dockera

Terminal 1 (API, domyślnie port **3000**):

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

Terminal 2 (UI, domyślnie **http://localhost:8080**):

```bash
cd frontend
npm install
npm run dev
```

Potem w przeglądarce: **wgraj `.xlsx`**, żeby coś policzyć. Backend zapisuje pliki w `backend/uploads/` (ten folder jest u nas w `.gitignore`, żeby przypadkiem nie wypchnąć czyjegoś Excela na GitHub).

**Ważne:** frontend gada z API przez **`/api`** i proxy z `vue.config.js` (domyślnie na `http://127.0.0.1:3000`). Jeśli backend nie stoi — dostaniesz błędy sieciowe; to normalne, odpal najpierw `backend`.

---

## Zmienne środowiskowe (AI i porty)

Szablon jest w **`backend/.env.example`**. Minimum sensowne pod AI:

- `AI_PROVIDER` — `openai` albo `anthropic`
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — wklejasz klucz **tylko** do lokalnego `backend/.env`, nie do repo
- `AI_MODEL`, `ANTHROPIC_MODEL` — opcjonalnie, są domyślne

Bez kluczy appka dalej działa — część modułów użyje **heurystyk / fallbacku** zamiast LLM.

Frontend: patrz **`frontend/.env.example`** (proxy vs pełny URL API).

---

## Docker (jak wolisz kontenery)

Z głównego katalogu:

```bash
copy backend\.env.example backend\.env
docker compose build
docker compose up
```

- UI: **http://localhost:8080**
- API: **http://localhost:3000**

Szczegóły portów / proxy są opisane w `docker-compose.yml` i w `frontend/.env.example`.

---

## Przydatne skrypty

| Gdzie | Komenda | Po co |
|--------|---------|--------|
| `backend/` | `npm run dev` | API z autorestartem (nodemon) |
| `backend/` | `npm run start` | API „na produkcyjnie”, bez watchera |
| `backend/` | `npm run typecheck` | TypeScript bez emit |
| `backend/` | `npm run generate-test-data` | Tworzy `backend/dane_testowe.xlsx` — wizyty/sprzedaż z woj. warmińsko-mazurskiego (baza Olsztyn; wygeneruj lokalnie) |
| `frontend/` | `npm run dev` | Dev server + HMR |
| `frontend/` | `npm run build` | Produkcja (typecheck + webpack) |
| `frontend/` | `npm run typecheck` | TS dla frontu + alias `@shared` |

---

## Struktura repo (orientacja)

```
backend/          Express, trasy /api/*, serwisy (Excel, AI, raporty)
  shared/         Wspólne typy API (importowane też w frontendzie jako @shared)
frontend/         Vue 3, widoki, panele z ECharts
docker-compose.yml
```

Typy współdzielone: **`backend/shared/api-types.ts`** — frontend łączy je przez alias z `vue.config.js` (`@shared`).

---

## Agentic Workflow Debugging

Pipeline AI: **Analityk** (fakty) → **Strateg** (ReAct + narzędzia) → **eval** (grounding) → odpowiedź API.

### Logi trace (backend)

Każde wywołanie `GET /api/ai/insights?filename=...` zapisuje JSON w:

`backend/logs/traces/<ISO-timestamp>_<sessionID>.json`

Przykładowe pola:

| Pole | Znaczenie |
|------|-----------|
| `sessionID` | UUID sesji (to samo w `meta.sessionId` w API) |
| `full_trace` | Kroki ReAct: `thought`, `action`, `observation` |
| `analyst_facts` | Fakty i `anomalies` z kroku Analityka |
| `total_tokens` / `cost_usd` / `latency_ms` | Observability (szacunek kosztu z `aiLogger.ts`) |
| `eval_summary` | Liczba sugestii zweryfikowanych vs `potential_hallucination` |
| `prompt_version` | np. `agent_v1` — patrz `backend/prompts/agent_v1.ts` |

**Jak czytać log:** otwórz plik po odświeżeniu sugestii na dashboardzie; porównaj `full_trace` z tym, co widzisz w UI („Proces myślowy AI”). Jeśli `potential_hallucination` > 0, sprawdź czy nazwy produktów w sugestii są w `analyst_facts`.

### Wersjonowanie promptów

Instrukcje systemowe Analityka i Stratega: **`backend/prompts/agent_v1.ts`**. Przy zmianie zachowania modelu skopiuj plik do `agent_v2.ts`, podnieś `PROMPT_VERSION` i podłącz w `agentOrchestrator.ts`.

### Dodawanie narzędzia (function calling)

1. W **`backend/services/aiAgentTools.ts`** dodaj wpis do tablicy `SALES_AGENT_TOOLS`:
   - `name`, `description`, `parameters` (JSON Schema),
   - `execute(ctx, args)` — logika na `SalesWorkbookContext`.
2. Model (Strateg) sam zdecyduje, kiedy wywołać narzędzie — nie trzeba zmieniać promptu, o ile opis jest jasny.
3. Uruchom `npm run typecheck` w `backend/` i przetestuj trace w `backend/logs/traces/`.

Zmienne opcjonalne w `backend/.env`: `AI_ANALYST_MODEL`, `AI_STRATEGIST_MODEL` (patrz `.env.example`).

### Production-grade (guardrails, cache, feedback)

| Mechanizm | Opis |
|-----------|------|
| **Guardrails** | `MAX_ITERATIONS` (dom. 5), `SESSION_TOKEN_LIMIT` (dom. 28k) — przy przekroczeniu `meta.partial: true` i częściowe sugestie |
| **Rate limit** | Linear backoff 1s/2s/3s przy HTTP 429 (OpenAI / Anthropic) |
| **Cache** | Ten sam plik + hash → wynik z pamięci przez 10 min (`meta.from_cache: true`) |
| **Polling** | `POST /api/ai/insights/run` → `GET /api/ai/insights/job/:sessionId` (`current_step`) |
| **RLHF** | `POST /api/ai/insights/feedback` → `backend/logs/traces/<sessionId>-feedback.jsonl` |
| **Prompty v2** | `AGENT_PROMPT_VERSION=agent_v2` (domyślnie) — ton sklepowy w `backend/prompts/agent_v2.ts` |

Nowe narzędzie: `compareWithPreviousPeriod()` — porównanie z poprzednim plikiem w `uploads/`.

### Pętla uczenia (RLHF + knowledge)

- **Vector-less RAG**: `knowledgeService.ts` czyta `logs/traces/*-feedback.jsonl` (zatwierdzenia = `approve`) i wstrzykuje 2–3 przykłady do promptu Stratega.
- **Auto-korekta**: odrzucenia (`reject`) dla tego samego pliku trafiają do instrukcji „nie powtarzaj tych pomysłów”.
- **Prognoza**: narzędzie `predictFutureSales()` — regresja liniowa, horyzont 30 dni.
- **Dashboard → AI Performance**: koszt, skuteczność %, halucynacje, przycisk „Wyczyść cache AI”.
- **Benchmark**: `cd backend && npm run benchmark -- plik.xlsx`
- **Docker**: wolumen `./backend/logs/traces` — feedback przetrwa restart kontenera.

---

## Typowe „dlaczego nie działa”

1. **404 na `/api/...`** — sprawdź, czy axios ma bazę z `/api` (albo `VUE_APP_API_URL` z końcówką `/api`).
2. **`ECONNREFUSED`** — backend nie działa albo zły port w proxy.
3. **Pusty dashboard / zera** — arkusz może mieć inne nazwy kolumn niż oczekuje parser (np. brak `Sprzedaż` / `Wizyty`).
4. **AI pokazuje „reguły / fallback”** — brak klucza w `backend/.env` albo zły model — zerknij w log backendu po kliknięciu analizy.

---

## Jak wypchnąć na GitHub (pierwszy raz)

W tym folderze **nie było wcześniej `.git`** — zrobiliśmy `git init` i pierwszy commit (`main`). Żeby zrobić **push**, musisz mieć **puste repo** na GitHubie (bez README z UI) albo istniejące, do którego masz dostęp.

```bash
cd opus-sales-app-main
git remote add origin https://github.com/TWOJ_USER/TWOJE_REPO.git
git push -u origin main
```

Zamiast HTTPS możesz użyć SSH: `git@github.com:TWOJ_USER/TWOJE_REPO.git`.

Jeśli GitHub krzyczy o dużym pushu — to normalne przy pierwszym commicie; ewentualnie dodaj [Git LFS](https://git-lfs.com/) tylko jeśli kiedyś wrzucisz duże binaria świadomie.

---

## Licencja / kontakt

Uzupełnij pod swój zespół lub firmę.

---

*README pisane z myślą o kolejnym człowieku przy klawiaturze — jak coś pominęliśmy, dopisz sekcję i zrób PR.*
