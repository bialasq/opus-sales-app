import "./loadEnv";
import { initSentry, setupSentryErrorHandler } from "./observability/sentry";
import {
  httpRequestDuration,
  httpRequestsTotal,
  registry,
  refreshBudgetGauge,
} from "./observability/metrics";

initSentry();
refreshBudgetGauge();
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import express, {
  type Application,
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit, { type Options as RateLimitOptions } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import multer from "multer";
import analyticsRoutes from "./routes/analytics";
import customersRoutes from "./routes/customers";
import productsRoutes from "./routes/products";
import paymentsRoutes from "./routes/payments";
import aiRoutes from "./routes/ai";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import { requireOrg, sessionAuth } from "./middleware/session";
import { constantTimeEqual } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { rootLogger } from "./services/appLogger";
import { appRoot } from "./loadEnv";
import { ValidationError } from "./errors";
import { closeRedis, getRedis } from "./services/redis";
import { orgStorage } from "./services/orgStorage";
import { prisma } from "./services/prisma";

export let isAppReady = false;

export function setAppReadyForTests(ready = true): void {
  isAppReady = ready;
}

let warnedUnsecuredMetrics = false;

function extractMetricsToken(req: Request): string | null {
  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const queryToken = req.query.token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

function metricsAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const configured = process.env.METRICS_TOKEN?.trim() || "";
  if (!configured) {
    // Produkcja: fail-closed — bez tokenu nie wystawiamy metryk (mogą zawierać wrażliwe etykiety).
    if (process.env.NODE_ENV === "production") {
      res.status(503).json({
        error: "Metrics disabled: ustaw METRICS_TOKEN",
      });
      return;
    }
    if (!warnedUnsecuredMetrics) {
      rootLogger.warn(
        "metrics endpoint niezabezpieczony (ustaw METRICS_TOKEN)"
      );
      warnedUnsecuredMetrics = true;
    }
    next();
    return;
  }
  const provided = extractMetricsToken(req);
  if (!provided || !constantTimeEqual(provided, configured)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function ensureRuntimeDirs(): Promise<void> {
  await fs.promises.mkdir(path.join(appRoot, "uploads"), { recursive: true });
  await fs.promises.mkdir(path.join(appRoot, "logs", "traces"), {
    recursive: true,
  });
}

export function createApp(): Application {
  const app: Application = express();

  // Za reverse-proxy (TLS) w produkcji: poprawne req.ip dla rate-limitera
  // oraz akceptacja Secure cookie (X-Forwarded-Proto). 1 = pierwszy zaufany proxy.
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  // FRONTEND_ORIGIN może być listą po przecinku (np. staging + prod).
  // Pierwszy origin służy też jako link na stronie informacyjnej "/".
  const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:8080")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const FRONTEND_ORIGIN = FRONTEND_ORIGINS[0] || "http://localhost:8080";

  app.use(requestIdMiddleware);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const route =
        (req.route as { path?: string } | undefined)?.path || req.path;
      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, (Date.now() - start) / 1000);
    });
    next();
  });

  app.get("/metrics", metricsAuth, async (_req, res) => {
    refreshBudgetGauge();
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

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
      origin: FRONTEND_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-api-key",
        "x-request-id",
      ],
    })
  );

  app.use(
    helmet({
      // To jest serwer API + mała strona informacyjna na "/" (z inline <style>).
      // SPA jest serwowane osobno przez nginx (własny CSP) — tu wystarczy sensowny baseline.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
          "object-src": ["'none'"],
          "base-uri": ["'self'"],
          "frame-ancestors": ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(express.json({ limit: "12mb" }));
  app.use(cookieParser());

  // Gdy skonfigurowany jest REDIS_URL, limity są współdzielone między replikami
  // (jeden licznik na cały klaster). Bez Redis — store w pamięci (pojedyncza instancja).
  const makeLimiter = (
    opts: Partial<RateLimitOptions> & { prefix: string }
  ) => {
    const redis = getRedis();
    const { prefix, ...rest } = opts;
    return rateLimit({
      standardHeaders: true,
      legacyHeaders: false,
      ...rest,
      ...(redis
        ? {
            store: new RedisStore({
              prefix: `rl:${prefix}:`,
              sendCommand: (...args: string[]) =>
                (
                  redis.call as (
                    ...a: string[]
                  ) => Promise<string | number | string[]>
                )(...args),
            }),
          }
        : {}),
    });
  };

  const generalApiLimiter = makeLimiter({
    prefix: "api",
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: "Too many requests, please try again later" },
  });

  const aiLimiter = makeLimiter({
    prefix: "ai",
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: { error: "AI rate limit exceeded, please wait" },
  });

  const uploadLimiter = makeLimiter({
    prefix: "upload",
    windowMs: 5 * 60 * 1000,
    max: 10,
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

  app.get("/api/readyz", async (_req, res) => {
    if (!isAppReady) {
      res.status(503).json({ status: "not ready" });
      return;
    }
    const checks: { db: boolean; redis: boolean | "n/a" } = {
      db: false,
      redis: "n/a",
    };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch {
      checks.db = false;
    }
    const redis = getRedis();
    if (redis) {
      try {
        const pong = await redis.ping();
        checks.redis = pong === "PONG";
      } catch {
        checks.redis = false;
      }
    }
    const ready = checks.db && checks.redis !== false;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "degraded",
      checks,
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api", sessionAuth);

  const ALLOWED_MIME_TYPES = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];
  const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

  const upload = multer({
    storage: multer.memoryStorage(),
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

  const handleUpload: RequestHandler = async (req, res, next) => {
    try {
      const file = req.file;
      if (!file?.buffer) {
        res.status(400).json({ error: "Brak pliku" });
        return;
      }
      const ext = path.extname(file.originalname).toLowerCase();
      const baseName = path
        .basename(file.originalname, ext)
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(0, 100);
      const key = `${randomUUID()}-${baseName}${ext}`;
      const orgId = req.auth!.organizationId;
      await orgStorage(orgId).putFile(key, file.buffer);
      await prisma.uploadedFile.create({
        data: {
          organizationId: orgId,
          uploadedById: req.auth!.userId,
          storageKey: key,
          originalName: file.originalname,
          sizeBytes: file.size,
        },
      });
      res.json({
        filename: key,
        originalName: file.originalname,
        size: file.size,
      });
    } catch (err) {
      next(err);
    }
  };

  app.post("/api/upload", requireOrg, upload.single("file"), handleUpload);

  const testDataDownload: RequestHandler = async (_req, res, next) => {
    const testFilePath = path.join(appRoot, "dane_testowe.xlsx");
    try {
      await fs.promises.access(testFilePath);
    } catch {
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
  setupSentryErrorHandler(app);
  app.use(errorHandler);

  return app;
}

let inFlightRequests = 0;

export async function startServer(): Promise<ReturnType<Application["listen"]>> {
  await ensureRuntimeDirs();
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
  void startServer().catch((err) => {
    rootLogger.error("Server start failed", err);
    process.exit(1);
  });
}
