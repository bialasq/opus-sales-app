# Warstwa kont + izolacja danych — instrukcja wpięcia

Ten pakiet dodaje **wielodostępność (multi-tenancy)** do Opus Sales: organizacje, użytkownicy,
logowanie JWT i izolację danych po `organizationId`. Zaprojektowany tak, by **nie przepisywać**
istniejącego kodu — dokłada się obok i wpina w kilku miejscach.

## Nowe pliki (skopiuj do `backend/`)

| Plik | Rola |
|------|------|
| `prisma/schema.prisma` | Modele: Organization, User, RefreshToken, UploadedFile, AnalysisJob |
| `services/authService.ts` | Rejestracja, logowanie, JWT, rotacja refresh tokenów (bcryptjs) |
| `services/orgStorage.ts` | Nakładka na storage wymuszająca prefiks `org_{id}/` (izolacja plików) |
| `middleware/session.ts` | Uwierzytelnianie dwutrybowe: JWT **lub** legacy x-api-key + `requireOrg` |
| `routes/auth.ts` | `/api/auth/register \| login \| refresh \| logout \| me` |

## Krok 1 — zależności

```bash
cd backend
npm install @prisma/client bcryptjs jsonwebtoken
npm install -D prisma @types/bcryptjs @types/jsonwebtoken
```

> Świadomie **bcryptjs**, nie `bcrypt` — czysty JS, bez natywnej kompilacji,
> co oszczędza problemów z buildem w Dockerze (Alpine/musl).

## Krok 2 — zmienne środowiskowe

Dopisz do `backend/.env.example` (i swojego `.env`):

```bash
# --- Baza danych (PostgreSQL) ---
DATABASE_URL=postgresql://opus:opus@localhost:5432/opus?schema=public

# --- Sesje (JWT) ---
# Wygeneruj: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=replace-me-with-32-plus-char-random-string

# Tryb przejściowy: true = akceptuj też stary x-api-key obok JWT.
# Ustaw false, gdy front w pełni przejdzie na logowanie.
LEGACY_API_KEY_ENABLED=true
```

## Krok 3 — migracja bazy

```bash
cd backend
npx prisma migrate dev --name init_accounts
npx prisma generate
```

(Lokalny Postgres najszybciej przez Docker: `docker run -e POSTGRES_USER=opus -e POSTGRES_PASSWORD=opus -e POSTGRES_DB=opus -p 5432:5432 -d postgres:16`)

## Krok 4 — wpięcie w `server.ts`

**4a.** Dodaj import na górze (obok pozostałych tras):

```ts
import authRoutes from "./routes/auth";
import { sessionAuth } from "./middleware/session";
```

**4b.** Zamień stary `apiKeyAuth` na nowy `sessionAuth`. Znajdź linię:

```ts
app.use("/api", apiKeyAuth);
```

i zamień na:

```ts
app.use("/api/auth", authRoutes);   // trasy logowania (publiczne — sessionAuth je przepuszcza)
app.use("/api", sessionAuth);       // uwierzytelnianie dwutrybowe (JWT lub legacy klucz)
```

> `sessionAuth` ma własną listę publicznych ścieżek (health + /api/auth/*),
> więc rejestracja i logowanie działają bez tokenu. Reszta `/api/*` wymaga
> nagłówka `Authorization: Bearer <accessToken>`.

## Krok 5 — przetnij dane po organizacji (najważniejsze)

To jest sedno izolacji. Każdą trasę operującą na plikach/analizach owiń `requireOrg`
i używaj `req.auth.organizationId`. Przykład dla uploadu w `server.ts`:

```ts
import { requireOrg } from "./middleware/session";
import { orgStorage } from "./services/orgStorage";

app.post("/api/upload", requireOrg, upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file?.buffer) return res.status(400).json({ error: "Brak pliku" });

    const orgId = req.auth!.organizationId;
    const store = orgStorage(orgId);              // ← izolacja: prefiks org_{id}/

    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
    const key = `${randomUUID()}-${baseName}${ext}`;

    await store.putFile(key, file.buffer);        // trafia do org_{id}/{key}

    // Zapis metadanych w bazie — wiąże plik z organizacją i użytkownikiem:
    await prisma.uploadedFile.create({
      data: {
        organizationId: orgId,
        uploadedById: req.auth!.userId,
        storageKey: key,
        originalName: file.originalname,
        sizeBytes: file.size,
      },
    });

    res.json({ filename: key, originalName: file.originalname, size: file.size });
  } catch (err) { next(err); }
});
```

**Ta sama zasada w trasach `analytics`, `ai`, `customers`, `products`, `payments`:**
zanim wczytasz plik z nazwy podanej przez klienta, sprawdź, że należy do jego organizacji:

```ts
const owned = await prisma.uploadedFile.findUnique({
  where: { organizationId_storageKey: { organizationId: req.auth!.organizationId, storageKey: filename } },
});
if (!owned) return res.status(404).json({ error: "Plik nie istnieje" });
const buffer = await orgStorage(req.auth!.organizationId).getFile(filename);
```

Bez tego kroku klient mógłby podać cudzą nazwę pliku — `orgStorage` blokuje to na
poziomie storage (prefiks), a sprawdzenie w bazie blokuje na poziomie aplikacji
(obrona w głąb).

## Krok 6 — frontend

W `frontend/src/services/api.ts` zamień stały `x-api-key` na nagłówek `Authorization`:

```ts
// było: { "x-api-key": key }
// jest:
const token = localStorage.getItem("accessToken");
return token ? { Authorization: `Bearer ${token}` } : {};
```

Dodaj prosty przepływ: ekran logowania → `POST /api/auth/login` → zapis `accessToken`
i `refreshToken` → interceptor axios, który przy `401` woła `/api/auth/refresh`.

## Czego NIE trzeba zmieniać

Orkiestrator AI, narzędzia agenta, excelService, route planner — działają bez zmian.
Dostają bufor pliku i konfigurację jak dotąd; zmienia się tylko **skąd** plik pochodzi
(z org-scoped storage) i **kto** go zażądał (sprawdzone wcześniej w trasie).

## Migracja istniejących wdrożeń

`LEGACY_API_KEY_ENABLED=true` pozwala starym integracjom działać na `x-api-key`
w czasie, gdy front przechodzi na logowanie. Po migracji ustaw `false` — wtedy
akceptowany jest wyłącznie JWT i pełna izolacja danych jest wymuszona.
```
