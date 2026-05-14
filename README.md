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
| `backend/` | `npm run generate-test-data` | Tworzy `backend/dane_testowe.xlsx` (nie trzymamy go w repo — wygeneruj lokalnie) |
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
