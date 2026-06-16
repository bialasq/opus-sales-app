# Plan promptów dla Cursora — usprawnienie Opus Sales (multi-tenancy + reszta)

Ten dokument to **gotowe prompty do wklejania w Cursor**, w kolejności wykonania.
Każdy prompt jest samowystarczalny: ma kontekst, zadanie i kryterium akceptacji.
Wykonuj je **po kolei** — każdy zakłada, że poprzedni przeszedł.

**Zasada ogólna do każdego promptu:** po zmianach uruchom `npm run typecheck`
w `backend/` (oraz `npm test`, gdy są testy danego obszaru) i nie przechodź dalej,
dopóki nie jest zielone.

> **Uwaga dot. PowerShell:** w terminalu Cursora na Windows używaj `;` zamiast `&&`
> do łączenia komend (np. `cd backend; npx tsc --noEmit`). To była przyczyna błędu
> „The token '&&' is not a valid statement separator".

---

## FAZA 0 — Pre-flight (poprawki przed wpięciem)

Te trzy rzeczy wychwycił przegląd archiwum. Bez nich wpięcie się wyłoży.
Robimy je PRZED Fazą 1.

### Prompt 0.1 — Naprawa storage pod podkatalogi per-organizacja

```
KONTEKST:
Plik backend/services/orgStorage.ts wysyła do storage klucze z prefiksem,
np. "org_abc123/plik.xlsx". Ale obecny backend/services/storage.ts w klasie
LocalStorage ma resolveSafe(), które robi path.basename(key) i RZUCA błąd,
gdy klucz zawiera slash:

  private resolveSafe(key: string): string {
    const safe = path.basename(key);
    if (safe !== key) throw new Error(`Invalid storage key: ${key}`);
    return path.join(this.baseDir, safe);
  }

Analogicznie S3Storage.keyFor() robi path.basename(key), więc obcina prefiks
organizacji. Efekt: izolacja plików per-organizacja NIE działa.

ZADANIE:
Przerób backend/services/storage.ts tak, by bezpiecznie obsługiwał JEDEN poziom
podkatalogu w formacie "org_{alfanumeryczne}/{nazwaPliku}":
1. W LocalStorage.resolveSafe: dopuść klucz pasujący do wzorca
   /^org_[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/. Rozłóż na segment katalogu i nazwę
   pliku, zwaliduj OBA segmenty osobno przez path.basename (segment === basename),
   odrzuć wszystko z ".." lub backslashem, i złóż ścieżkę przez path.join(baseDir,
   orgDir, fileName). Dla kluczy bez slasha zachowaj dotychczasowe zachowanie
   (kompatybilność wstecz).
2. W LocalStorage.putFile: utwórz katalog org (fs.mkdir recursive) przed zapisem.
3. W S3Storage.keyFor: NIE rób path.basename na całym kluczu. Zamiast tego
   zwaliduj ten sam wzorzec i przekaż pełny klzaucz (z prefiksem org) do S3,
   doklejając tylko this.prefix z przodu. S3 obsługuje "/" natywnie.
4. listFiles musi działać z prefiksem zawierającym slash (org_x/).

WYMAGANIA:
- Nie psuj istniejących wywołań z kluczem bez slasha (np. dane testowe).
- Zachowaj ochronę przed path traversal (".." musi być odrzucone w każdym segmencie).
- Dodaj zwięzłe komentarze PL tłumaczące walidację.

AKCEPTACJA:
- npm run typecheck zielone.
- Dopisz test w backend/tests/storage.test.ts: putFile("org_test1/a.xlsx", ...)
  → getFile zwraca to samo; getFile("org_test1/../b.xlsx") rzuca błąd;
  klucz bez slasha nadal działa.
- npm test -- storage zielone.
```

### Prompt 0.2 — CORS: dopuść nagłówek Authorization

```
KONTEKST:
W backend/server.ts konfiguracja cors() ma:
  allowedHeaders: ["Content-Type", "x-api-key", "x-request-id"]
Nowe uwierzytelnianie używa nagłówka Authorization (Bearer JWT). Bez dodania go
do allowedHeaders przeglądarka zablokuje żądania frontu z tokenem (błąd CORS).

ZADANIE:
Dodaj "Authorization" do tablicy allowedHeaders w konfiguracji cors() w server.ts.
Zostaw pozostałe nagłówki bez zmian (x-api-key potrzebny w trybie legacy).

AKCEPTACJA:
- allowedHeaders zawiera: Content-Type, Authorization, x-api-key, x-request-id.
- npm run typecheck zielone.
```

### Prompt 0.3 — logout dostępny po wygaśnięciu access tokenu

```
KONTEKST:
backend/routes/auth.ts ma POST /logout, który unieważnia refresh token. Ale
trasa /api/auth/logout NIE jest na liście publicznych ścieżek w
backend/middleware/session.ts (PUBLIC_PATHS), więc sessionAuth ją zablokuje,
gdy access token wygasł — a to typowy moment wylogowania.

ZADANIE:
W backend/middleware/session.ts dodaj "/api/auth/logout" do zbioru PUBLIC_PATHS.
Logout i tak wymaga prawidłowego refresh tokenu w body, więc jest bezpieczny
bez access tokenu.

AKCEPTACJA:
- PUBLIC_PATHS zawiera /api/auth/logout.
- npm run typecheck zielone.
```

---

## FAZA 1 — Fundament (zależności, env, migracja, wpięcie auth)

### Prompt 1.1 — Zależności i zmienne środowiskowe

```
KONTEKST:
Dodajemy warstwę kont. Brakuje pakietów i zmiennych środowiskowych.

ZADANIE:
1. W backend/ zainstaluj zależności:
   npm install @prisma/client bcryptjs jsonwebtoken
   npm install -D prisma @types/bcryptjs @types/jsonwebtoken
2. Dopisz do backend/.env.example (na końcu, w nowej sekcji "Konta / baza"):
   DATABASE_URL=postgresql://opus:opus@localhost:5432/opus?schema=public
   JWT_SECRET=replace-me-with-32-plus-char-random-string
   LEGACY_API_KEY_ENABLED=true
   Dodaj komentarz PL przy JWT_SECRET z komendą generowania:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

AKCEPTACJA:
- package.json zawiera nowe zależności.
- .env.example zawiera trzy nowe zmienne z komentarzami.
```

### Prompt 1.2 — Migracja bazy danych

```
KONTEKST:
backend/prisma/schema.prisma jest już w repo (modele Organization, User,
RefreshToken, UploadedFile, AnalysisJob). Trzeba zainicjować bazę.

ZADANIE:
Zakładając lokalny PostgreSQL pod DATABASE_URL z .env (jeśli nie ma, podaj
komendę docker run dla postgres:16), wykonaj:
   cd backend
   npx prisma migrate dev --name init_accounts
   npx prisma generate
Jeśli baza nie jest dostępna, NIE zgaduj — wypisz dokładną komendę docker run
i przerwij, prosząc o uruchomienie bazy.

AKCEPTACJA:
- Powstał katalog backend/prisma/migrations z migracją init_accounts.
- npx prisma generate przeszło bez błędu (klient w node_modules/@prisma/client).
- npm run typecheck zielone (typy Prisma się rozwiązują).
```

### Prompt 1.3 — Wpięcie auth w server.ts

```
KONTEKST:
Nowe pliki middleware/session.ts i routes/auth.ts istnieją, ale server.ts wciąż
używa starego apiKeyAuth i nie rejestruje tras auth.

ZADANIE:
W backend/server.ts:
1. Dodaj importy:
   import authRoutes from "./routes/auth";
   import { sessionAuth } from "./middleware/session";
2. Znajdź linię: app.use("/api", apiKeyAuth);
   Zamień ją na DWIE linie (kolejność ważna — auth routes przed globalnym authem):
   app.use("/api/auth", authRoutes);
   app.use("/api", sessionAuth);
3. Usuń teraz nieużywany import apiKeyAuth, JEŚLI nie jest używany nigdzie indziej
   (sprawdź — constantTimeEqual z tego samego pliku jest importowany przez
   session.ts, więc plik middleware/auth.ts MUSI zostać; usuwamy tylko import
   samego apiKeyAuth w server.ts, jeśli zbędny).

AKCEPTACJA:
- server.ts rejestruje /api/auth i używa sessionAuth.
- npm run typecheck zielone.
- npm test zielone (testy auth.test.ts i server.test.ts mogą wymagać aktualizacji —
  jeśli padają przez zmianę nagłówka, zaktualizuj je tak, by używały Bearer tokenu
  lub trybu legacy x-api-key; opisz każdą zmianę w teście).
```

---

## FAZA 2 — Izolacja tras po organizationId (NAJWAŻNIEJSZE)

To jest sedno multi-tenancy. Robimy trasa po trasie, żeby dało się testować.

### Prompt 2.1 — Upload z izolacją

```
KONTEKST:
Endpoint POST /api/upload w backend/server.ts zapisuje plik do storage pod
losowym kluczem, ale bez powiązania z organizacją. Mamy już orgStorage(orgId)
i model Prisma UploadedFile.

ZADANIE:
Przerób handler /api/upload (handleUpload w server.ts):
1. Dodaj middleware requireOrg przed multer: 
   app.post("/api/upload", requireOrg, upload.single("file"), handleUpload)
2. W handlerze pobierz orgId = req.auth!.organizationId.
3. Zamiast getStorage() użyj orgStorage(orgId).putFile(key, buffer).
4. Po zapisie utwórz rekord w bazie:
   prisma.uploadedFile.create({ data: { organizationId: orgId,
     uploadedById: req.auth!.userId, storageKey: key,
     originalName: file.originalname, sizeBytes: file.size } })
5. Zaimportuj requireOrg z ./middleware/session, orgStorage z ./services/orgStorage,
   oraz instancję prisma (z services/authService lub osobnego services/prisma.ts —
   jeśli nie ma wspólnego klienta, UTWÓRZ backend/services/prisma.ts eksportujący
   pojedynczą instancję PrismaClient i użyj jej wszędzie, zamiast tworzyć nową
   w authService; zrefaktoruj authService, by importował z services/prisma.ts).

WYMAGANIA:
- Jedna współdzielona instancja PrismaClient w całym backendzie (services/prisma.ts).
- W trybie legacy (brak req.auth) requireOrg zwróci 403 — to oczekiwane.

AKCEPTACJA:
- npm run typecheck zielone.
- Ręczny test: po zalogowaniu (Bearer) upload tworzy rekord UploadedFile z
  poprawnym organizationId, plik ląduje w storage pod org_{id}/{key}.
```

### Prompt 2.2 — analytics.ts: weryfikacja własności pliku

```
KONTEKST:
backend/routes/analytics.ts czyta pliki po nazwie podanej przez klienta. Bez
sprawdzenia własności klient mógłby podać cudzą nazwę pliku (IDOR).

ZADANIE:
W każdej trasie analytics.ts, która przyjmuje filename i czyta plik:
1. Owiń trasę middlewarem requireOrg.
2. Przed odczytem sprawdź własność:
   const owned = await prisma.uploadedFile.findUnique({ where: {
     organizationId_storageKey: { organizationId: req.auth!.organizationId,
     storageKey: filename } } });
   if (!owned) return res.status(404).json({ error: "Plik nie istnieje" });
3. Odczyt pliku przez orgStorage(req.auth!.organizationId).getFile(filename)
   zamiast bezpośredniego getStorage()/odczytu po nazwie.
4. Jeśli analytics korzysta z helpera resolvującego ścieżkę (filePathResolver),
   zaadaptuj go lub zastąp w tych trasach org-scoped odczytem.

WYMAGANIA:
- Wzorzec ma być spójny — rozważ wydzielenie helpera
  assertFileOwnership(req, filename) w services/prisma.ts lub osobnym util,
  by nie powtarzać kodu w każdej trasie.

AKCEPTACJA:
- npm run typecheck zielone.
- Ręczny test: żądanie analizy pliku należącego do innej organizacji → 404.
- Żądanie własnego pliku → działa jak dawniej.
```

### Prompt 2.3 — ai.ts: izolacja insightów i jobów

```
KONTEKST:
backend/routes/ai.ts (GET /insights, POST /insights/run, GET /insights/job/:id,
POST /insights/feedback) operuje na plikach po nazwie i tworzy joby. Joby
trzyma agentJobStore (Redis + fallback pamięci), bez powiązania z organizacją.

ZADANIE:
1. Owiń trasy /insights* middlewarem requireOrg.
2. We wszystkich miejscach czytających plik po filename zastosuj weryfikację
   własności jak w 2.2 (helper assertFileOwnership) + odczyt przez orgStorage.
3. Joby: dodaj organizationId do AgentJobRecord w services/agentJobStore.ts
   i zapisuj je przy createJob. Przy GET /insights/job/:sessionId sprawdź, że
   job.organizationId === req.auth!.organizationId — w przeciwnym razie 404
   (nie 403, by nie zdradzać istnienia cudzego joba).

AKCEPTACJA:
- npm run typecheck zielone.
- Polling joba innej organizacji → 404.
- Własny pełny przepływ (run → poll → wynik) działa.
```

### Prompt 2.4 — customers / products / payments: filtrowanie po organizacji

```
KONTEKST:
backend/routes/customers.ts, products.ts, payments.ts liczą dane z pliku
podanego po nazwie. Trzeba je objąć tą samą izolacją.

ZADANIE:
W każdej z trzech tras:
1. requireOrg.
2. assertFileOwnership(req, filename) przed odczytem.
3. Odczyt przez orgStorage(req.auth!.organizationId).
Nie zmieniaj logiki liczenia metryk — tylko źródło pliku i kontrolę dostępu.

AKCEPTACJA:
- npm run typecheck zielone.
- Każda z tras zwraca dane tylko dla plików własnej organizacji.
```

---

## FAZA 3 — Trwałość jobów (baza + Redis)

### Prompt 3.1 — AnalysisJob jako źródło prawdy

```
KONTEKST:
agentJobStore.ts używa Redis (TTL 30 min) z fallbackiem do pamięci. Po wygaśnięciu
TTL lub restarcie bez Redis historia jobów znika. Model Prisma AnalysisJob już
istnieje (status, currentStep, result JSON, errorMessage, organizationId, fileId).

ZADANIE:
Zrób z bazy danych ŹRÓDŁO PRAWDY dla jobów, a z Redis — szybki cache statusu:
1. createJob: utwórz rekord AnalysisJob (status PENDING/RUNNING) w bazie +
   zapis do Redis jak dotąd. Mapuj fileId z UploadedFile (lookup po storageKey
   + organizationId).
2. updateJob/aktualizacje kroków: zapisuj currentStep i status do bazy
   (transakcyjnie lub best-effort) ORAZ do Redis.
3. finalize (done/error): zapisz result/errorMessage do AnalysisJob w bazie.
4. getJob: czytaj najpierw z Redis (szybko); przy braku — z bazy (po restarcie).
5. Zachowaj fallback pamięci tylko dla środowiska bez bazy i bez Redis (dev).

WYMAGANIA:
- Nie blokuj głównego przepływu, jeśli zapis do bazy chwilowo padnie — loguj
  i kontynuuj (Redis jako bufor), ale stan końcowy MUSI trafić do bazy.
- Status enum w bazie (PENDING/RUNNING/DONE/FAILED) zmapuj na istniejący
  AgentJobStatus ("running"/"done"/"error").

AKCEPTACJA:
- npm run typecheck zielone.
- Test: utwórz job, zrestartuj proces (bez Redis), GET joba → odczyt z bazy.
- Dopisz test w backend/tests/agentJobStore.test.ts pokrywający odczyt z bazy.
```

---

## FAZA 4 — Konfiguracja per-organizacja (koniec z zaszytym Olsztynem)

### Prompt 4.1 — Baza tras i region z Organization.settings

```
KONTEKST:
backend/shared/cityCoords.ts ma na sztywno ROUTE_BASE_CITY = "Olsztyn",
słownik miast woj. warmińsko-mazurskiego i WARMIA_REGION_BOUNDS. Route planner
(routePlannerService.ts, routeMatrix.ts) i prompty agenta zakładają tę bazę.
Model Organization.settings (JSON) jest gotowy na konfigurację per-tenant.

ZADANIE:
1. Zdefiniuj kształt ustawień w backend/shared/api-types.ts, np.:
   type OrgRouteSettings = { baseCity: string; baseLat: number; baseLng: number;
     regionCities?: Record<string, {lat:number; lng:number; label:string}>;
     currency?: string };
2. Dodaj helper getOrgSettings(organizationId) w services (czyta
   Organization.settings z Prisma, parsuje, zwraca z domyślnymi wartościami =
   obecny Olsztyn jako fallback, żeby istniejące dane działały).
3. routePlannerService.ts i routeMatrix.ts: zamiast importować ROUTE_BASE_CITY
   na sztywno, przyjmij bazę z parametru/kontekstu wywołania. Trasy AI (ai.ts
   plan-route) przekażą req.auth.organizationId → getOrgSettings → baza.
4. resolveExpertPersona / prompty: persona logistyczna nie może zakładać Olsztyna
   w tekście — sparametryzuj nazwę miasta z ustawień.
5. cityCoords.ts: zachowaj warmińsko-mazurskie jako DOMYŚLNY zestaw (fallback),
   ale przestań traktować je jako jedyne źródło.

WYMAGANIA:
- Pełna kompatybilność wstecz: organizacja bez ustawień działa jak dziś (Olsztyn).
- Żadnej zmiany w UI na tym etapie (osobna faza).

AKCEPTACJA:
- npm run typecheck zielone.
- Organizacja z ustawioną inną bazą (np. Warszawa) generuje plan trasy z tej bazy.
- Organizacja bez ustawień → Olsztyn jak dotąd.
```

---

## FAZA 5 — Frontend (logowanie + tokeny)

### Prompt 5.1 — Warstwa auth we frontendzie

```
KONTEKST:
frontend/src/services/api.ts dziś wysyła stały nagłówek { "x-api-key": key }
z VUE_APP_API_KEY (klucz w buildzie — niebezpieczne dla wielu klientów).
Backend wspiera teraz logowanie JWT (/api/auth/login → accessToken + refreshToken).

ZADANIE:
1. W api.ts zamień nagłówek na Authorization: Bearer <accessToken> czytany z
   localStorage; gdy brak tokenu — brak nagłówka (poza trybem legacy do migracji).
2. Dodaj prosty store/composable auth (Vuex jest w projekcie):
   login(email,password) → POST /api/auth/login → zapis tokenów; logout → POST
   /api/auth/logout + czyszczenie; me() → GET /api/auth/me.
3. Interceptor axios: przy 401 spróbuj POST /api/auth/refresh z refreshToken;
   po sukcesie powtórz żądanie, po porażce przekieruj na ekran logowania.
4. Dodaj widok logowania/rejestracji (Element Plus formularze) i guard w
   vue-router: trasy aplikacji wymagają zalogowania.

AKCEPTACJA:
- npm run build (frontend) przechodzi (typecheck + webpack).
- Po zalogowaniu dashboard działa na Bearer tokenie; po 401 następuje auto-refresh.
```

### Prompt 5.2 — Wyłączenie trybu legacy

```
KONTEKST:
Gdy front w pełni działa na JWT, stary współdzielony x-api-key jest zbędny
i stanowi ryzyko (klucz w buildzie).

ZADANIE:
1. Ustaw LEGACY_API_KEY_ENABLED=false w środowisku (i opisz w .env.example,
   że to docelowa wartość produkcyjna).
2. Usuń VUE_APP_API_KEY z frontend/.env.example i z api.ts (martwy kod).
3. Sprawdź, że żaden test/route nie polega już na x-api-key (poza świadomym
   testem trybu legacy, jeśli zostaje).

AKCEPTACJA:
- Z LEGACY_API_KEY_ENABLED=false żądania bez Bearer są odrzucane (401).
- Frontend działa wyłącznie na JWT.
- npm run typecheck (backend) i npm run build (frontend) zielone.
```

---

## Kolejność i zależności (skrót)

```
FAZA 0 (pre-flight)  → MUSI być przed wszystkim innym
   0.1 storage  0.2 CORS  0.3 logout
FAZA 1 (fundament)   → 1.1 deps/env → 1.2 migracja → 1.3 wpięcie
FAZA 2 (izolacja)    → 2.1 upload → 2.2 analytics → 2.3 ai → 2.4 reszta
FAZA 3 (joby)        → 3.1  (po Fazie 2, bo używa fileId/org)
FAZA 4 (konfiguracja)→ 4.1  (niezależna od 3, ale po 1)
FAZA 5 (frontend)    → 5.1 logowanie → 5.2 wyłączenie legacy (na końcu)
```

## Wskazówki do pracy z Cursorem

- Wklejaj **jeden prompt na raz**. Po każdym sprawdź diff, zanim zaakceptujesz.
- Jeśli Cursor zacznie zmieniać pliki spoza zakresu promptu — odrzuć i doprecyzuj
  „zmień tylko plik X".
- Po każdej fazie zrób commit z opisem (np. „feat(auth): wpięcie sessionAuth").
- Trzymaj `npm run typecheck` w osobnym terminalu w trybie watch, jeśli możesz.
- Gdy prompt mówi „dopisz test" — nie pomijaj; to jedyny tani sposób, by wychwycić
  regresję izolacji danych (najgroźniejszy rodzaj błędu w multi-tenant).
```
