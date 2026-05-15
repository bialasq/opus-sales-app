import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import express, {
  type Application,
  type RequestHandler,
  type Router,
} from "express";
import cors from "cors";
import multer from "multer";
import { rootLogger } from "./services/appLogger";

dotenv.config({
  path: path.join(__dirname, ".env"),
  override: process.env.NODE_ENV !== "production",
});

// Trasy w JS — require() do czasu migracji plików na .ts (Node ładuje je jak dotąd).
const analyticsRoutes = require("./routes/analytics") as Router;
const customersRoutes = require("./routes/customers") as Router;
const productsRoutes = require("./routes/products") as Router;
const paymentsRoutes = require("./routes/payments") as Router;
const aiRoutes = require("./routes/ai") as Router;

const app: Application = express();
const PORT: number = Number(process.env.PORT) || 3000;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "12mb" }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

const handleUpload: RequestHandler = (req, res, _next) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Brak pliku" });
    return;
  }
  res.json({
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
  });
};

app.post("/api/upload", upload.single("file"), handleUpload);

const testDataDownload: RequestHandler = (_req, res, _next) => {
  const testFilePath = path.join(__dirname, "dane_testowe.xlsx");
  if (!fs.existsSync(testFilePath)) {
    res.status(404).json({ error: "Plik testowy nie istnieje. Uruchom: npm run generate-test-data" });
    return;
  }
  res.download(testFilePath, "dane_testowe.xlsx", (err: Error | null) => {
    if (err) {
      rootLogger.error("Błąd pobierania pliku testowego", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });
};

app.get("/api/test-data/download", testDataDownload);

app.use("/api/analytics", analyticsRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/ai", aiRoutes);

/** Przeglądarka na :3000 — backend to API; UI uruchamia się osobno (Vue dev server, zwykle :8080). */
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN?.replace(/\/$/, "") || "http://localhost:8080";

app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Opus Sales — API</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1e293b}
    a{color:#4f46e5} code{background:#f1f5f9;padding:.1rem .35rem;border-radius:.25rem}
  </style>
</head>
<body>
  <h1>Backend API (port ${PORT})</h1>
  <p>To jest serwer Express — <strong>nie hostuje</strong> interfejsu Vue. Stąd komunikat „Cannot GET /” bez tej strony.</p>
  <p><strong>Aplikacja (UI):</strong> <a href="${FRONTEND_ORIGIN}">${FRONTEND_ORIGIN}</a></p>
  <p>Uruchom frontend: <code>cd frontend && npm run serve</code> (Vue CLI domyślnie <code>:8080</code>).</p>
  <p>API jest pod ścieżką <code>/api/…</code> (np. proxy z frontendu).</p>
</body>
</html>`);
});

const server = app.listen(PORT, () => {
  rootLogger.info(`Serwer działa na porcie ${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    rootLogger.error(
      `Port ${PORT} jest już zajęty — backend już działa w innym terminalu. Zatrzymaj go (Ctrl+C) albo zamknij proces na porcie ${PORT}, potem uruchom npm run dev ponownie.`
    );
    process.exit(1);
  }
  throw err;
});
