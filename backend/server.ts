import "./loadEnv";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import express, {
  type Application,
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import analyticsRoutes from "./routes/analytics";
import customersRoutes from "./routes/customers";
import productsRoutes from "./routes/products";
import paymentsRoutes from "./routes/payments";
import aiRoutes from "./routes/ai";
import adminRoutes from "./routes/admin";
import { apiKeyAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { rootLogger } from "./services/appLogger";
import { appRoot } from "./loadEnv";
import { ValidationError } from "./errors";
import { closeRedis } from "./services/redis";

export let isAppReady = false;

export function setAppReadyForTests(ready = true): void {
  isAppReady = ready;
}

export function createApp(): Application {
  const app: Application = express();
  const uploadsDir = path.join(appRoot, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const FRONTEND_ORIGIN =
    process.env.FRONTEND_ORIGIN?.replace(/\/$/, "") || "http://localhost:8080";

  app.use(requestIdMiddleware);

  app.use((req, res, next) => {
    inFlightRequests++;
    const done = () => {
      inFlightRequests = Math.max(0, inFlightRequests - 1);
    };
    res.on("finish", done);
    res.on("close", done);
    next();
  });

  app.use(
    cors({
      origin: FRONTEND_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "x-api-key", "x-request-id"],
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(express.json({ limit: "12mb" }));

  const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });

  const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI rate limit exceeded, please wait" },
  });

  const uploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many uploads, please try again later" },
  });

  app.use("/api/", generalApiLimiter);
  app.use("/api/ai/", aiLimiter);
  app.use("/api/upload", uploadLimiter);

  const healthPayload = () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  });

  app.get("/api/health", (_req, res) => {
    res.json(healthPayload());
  });

  app.get("/api/healthz", (_req, res) => {
    res.json(healthPayload());
  });

  app.get("/api/readyz", (_req, res) => {
    if (!isAppReady) {
      res.status(503).json({ status: "not ready" });
      return;
    }
    res.json({ status: "ready" });
  });

  app.use("/api", apiKeyAuth);

  const ALLOWED_MIME_TYPES = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];
  const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const baseName = path
        .basename(file.originalname, ext)
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(0, 100);
      cb(null, `${randomUUID()}-${baseName}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_SIZE },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(
          new ValidationError(
            `Invalid file type: ${file.mimetype}. Only Excel files allowed.`
          )
        );
        return;
      }
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        cb(
          new ValidationError(
            `Invalid file extension: ${ext}. Only .xlsx and .xls allowed.`
          )
        );
        return;
      }
      cb(null, true);
    },
  });

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

  const testDataDownload: RequestHandler = (_req, res, next) => {
    const testFilePath = path.join(appRoot, "dane_testowe.xlsx");
    if (!fs.existsSync(testFilePath)) {
      next(
        new ValidationError(
          "Plik testowy nie istnieje. Uruchom: npm run generate-test-data"
        )
      );
      return;
    }
    res.download(testFilePath, "dane_testowe.xlsx", (err: Error | null) => {
      if (err) {
        next(err);
      }
    });
  };

  app.get("/api/test-data/download", testDataDownload);

  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/customers", customersRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/admin", adminRoutes);

  const PORT: number = Number(process.env.PORT) || 3000;

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
  <p>To jest serwer Express — <strong>nie hostuje</strong> interfejsu Vue.</p>
  <p><strong>Aplikacja (UI):</strong> <a href="${FRONTEND_ORIGIN}">${FRONTEND_ORIGIN}</a></p>
  <p>API jest pod ścieżką <code>/api/…</code>.</p>
</body>
</html>`);
  });

  const multerErrorHandler: ErrorRequestHandler = (err, _req, _res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new ValidationError("File exceeds 25 MB limit", err.message));
        return;
      }
      next(new ValidationError(`Upload error: ${err.message}`));
      return;
    }
    next(err);
  };

  app.use(multerErrorHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

let inFlightRequests = 0;

export function startServer(): ReturnType<Application["listen"]> {
  const app = createApp();
  const PORT: number = Number(process.env.PORT) || 3000;

  const server = app.listen(PORT, () => {
    isAppReady = true;
    rootLogger.info(`Serwer działa na porcie ${PORT}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      rootLogger.error(
        `Port ${PORT} jest już zajęty — zatrzymaj proces na porcie ${PORT} i uruchom ponownie.`
      );
      process.exit(1);
    }
    throw err;
  });

  function gracefulShutdown(signal: string): void {
    rootLogger.info(`Received ${signal}, starting graceful shutdown`);
    isAppReady = false;

    server.close(async (closeErr) => {
      if (closeErr) {
        rootLogger.error("Error during server close", closeErr);
        process.exit(1);
        return;
      }
      try {
        await closeRedis();
      } catch (redisErr) {
        rootLogger.warn("Redis close error", redisErr);
      }
      rootLogger.info("Server closed cleanly");
      process.exit(0);
    });

    setTimeout(() => {
      rootLogger.warn(
        `Force exit after timeout. In-flight requests: ${inFlightRequests}`
      );
      process.exit(1);
    }, 30_000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    rootLogger.error("Unhandled promise rejection", reason);
  });

  process.on("uncaughtException", (err) => {
    rootLogger.error("Uncaught exception", err);
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  startServer();
}
