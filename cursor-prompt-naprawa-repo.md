PROMPT DLA CURSORA — naprawa repozytorium opus-sales-app
=========================================================
(Wklej całość poniżej do czatu agenta w Cursorze, w otwartym folderze projektu.)

---

Jesteś w folderze mojego projektu `opus-sales-app` (to mój pierwszy projekt, więc
git był prowadzony chaotycznie). Repo na GitHubie ma tylko 2 commity i przez pomyłkę
wrzucony `node_modules`. Chcę to uporządkować. Wykonaj poniższe zadania DOKŁADNIE
w tej kolejności, używając terminala. Po każdym kroku pokaż mi output i czekaj na
moją zgodę przed przejściem dalej.

## ZASADY BEZPIECZEŃSTWA (KRYTYCZNE — nie łam ich pod żadnym pozorem)
1. NIGDY nie używaj `git push --force` ani `git push -f`. Tylko zwykły `git push`.
2. NIGDY nie nadpisuj ani nie usuwaj istniejących 2 commitów. Mają zostać.
3. NIGDY nie usuwaj plików z dysku. `node_modules` ma zostać na dysku — usuwamy go
   TYLKO ze śledzenia gita przez `git rm --cached` (flaga --cached jest obowiązkowa).
4. NIE rób `git reset --hard`, `git rebase`, `git filter-branch` ani niczego, co
   przepisuje historię.
5. NIE wykonuj `git push` samodzielnie na końcu — przygotuj wszystko, pokaż mi
   `git log --oneline`, i pozwól MNIE nacisnąć push ręcznie.
6. Jeśli którakolwiek komenda zwróci błąd, ZATRZYMAJ SIĘ i pokaż mi błąd zamiast
   próbować go obejść.

## KROK 0 — Diagnoza (tylko odczyt, nic nie zmieniaj)
Uruchom i pokaż mi:
- `pwd` (potwierdź, że jesteśmy w folderze projektu)
- `git status`
- `git log --oneline`
- `git branch --show-current`  (zapamiętaj nazwę gałęzi — użyjemy jej przy pushu)
Potwierdź, że widzisz folder `.git` i plik `README.md`. Jeśli nie — zatrzymaj się.

## KROK 1 — Popraw .gitignore
Nadpisz plik `.gitignore` w głównym folderze następującą zawartością:

```
# Zależności
node_modules/
**/node_modules/

# Build
frontend/dist/
*.log
npm-debug.log*

# Sekrety i env (NIGDY nie commituj kluczy API)
.env
.env.*
!.env.example
backend/.env
frontend/.env.local

# Uploady użytkowników — lokalnie tylko
backend/uploads/*
!backend/uploads/.gitkeep

# Wygenerowane lokalnie
backend/dane_testowe.xlsx

# Instalatory
*.msi

# OS / IDE
.DS_Store
Thumbs.db
.idea/
.vscode/
*.sw?

# Cache
frontend/node_modules/.cache/

# Trace logi agentów AI (lokalnie)
backend/logs/traces/*
!backend/logs/traces/.gitkeep
```

## KROK 2 — Usuń node_modules ze śledzenia (pliki na dysku ZOSTAJĄ)
Uruchom (każda linia osobno; jeśli któraś zgłosi "did not match any files",
to OK — zignoruj i jedź dalej):
- `git rm -r --cached node_modules`
- `git rm -r --cached backend/node_modules`
- `git rm -r --cached frontend/node_modules`

Następnie pierwszy czysty commit:
- `git add .gitignore`
- `git commit -m "chore: remove node_modules from tracking, fix .gitignore"`

## KROK 3 — Dołóż logiczne commity NA WIERZCH (nie ruszaj starych)
Cel: zamiast jednego wielkiego commita, podziel aktualny kod na tematyczne grupy.
Wszystkie będą miały dzisiejszą datę — to jest OK, nie fałszujemy dat.
Dla każdej grupy: `git add <ścieżki>` a potem `git commit -m "<wiadomość>"`.
Jeśli `git add` na jakiejś ścieżce zgłosi, że nie istnieje — pomiń ją i kontynuuj.
Jeśli `git commit` zgłosi "nothing to commit" — pomiń ten commit i jedź dalej.

Commit A — dokumentacja, CI/CD, docker:
  git add LICENSE README.md CONTRIBUTING.md SECURITY.md docs/ docker-compose.yml docker-compose.prod.yml .github/ package-lock.json
  git commit -m "docs: project setup, CI/CD, Docker, documentation"

Commit B — backend: szkielet, baza, typy:
  git add backend/package.json backend/package-lock.json backend/tsconfig*.json backend/vitest.config.ts backend/Dockerfile* backend/loadEnv.ts backend/server.ts backend/prisma/ backend/types/ backend/schemas/ backend/shared/
  git commit -m "feat(backend): server skeleton, Prisma schema, domain types"

Commit C — backend: warstwa agentowa AI (rdzeń):
  git add backend/services/ backend/prompts/ backend/routes/ backend/middleware/ backend/observability/ backend/utils/ backend/errors/ backend/scripts/
  git commit -m "feat(backend): agentic AI layer, routes, guardrails, observability"

Commit D — backend: testy:
  git add backend/tests/
  git commit -m "test(backend): unit tests for auth, validation, budget, isolation"

Commit E — frontend: aplikacja Vue:
  git add frontend/
  git commit -m "feat(frontend): Vue 3 app, dashboards, ECharts panels"

Commit F — reszta (cokolwiek zostało):
  Sprawdź `git status`. Jeśli coś jest niezacommitowane:
  git add -A
  git commit -m "chore: remaining project files"
  Jeśli nic nie zostało — pomiń ten commit.

## KROK 4 — Pokaż wynik i ZATRZYMAJ SIĘ
- Uruchom `git log --oneline` i pokaż mi pełną listę commitów
  (powinno być: 2 stare na dole + nowe na górze).
- Uruchom `git status` (powinno być "working tree clean").
- NIE pushuj. Napisz mi dokładnie tę komendę do ręcznego uruchomienia, podstawiając
  prawdziwą nazwę gałęzi z KROKU 0:
      git push origin <nazwa-gałęzi>
- Jeśli push zostanie odrzucony z błędem "non-fast-forward" / "rejected" —
  NIE proponuj force push. Zamiast tego zatrzymaj się i powiedz mi, że zdalne repo
  ma zmiany, których nie mam lokalnie, i poczekaj na moją decyzję.

Na koniec przypomnij mi, żebym ręcznie ustawił na stronie repo (sekcja "About"):
opis projektu i topics (np. agentic-ai, typescript, vue, llm, express).
