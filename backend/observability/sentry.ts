import * as Sentry from "@sentry/node";
import type { Application } from "express";
import { createLogger } from "../services/appLogger";

const log = createLogger("observability/sentry");

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: process.env.APP_VERSION,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
  });
  log.info("Sentry initialized");
}

export function setupSentryErrorHandler(app: Application): void {
  if (!process.env.SENTRY_DSN?.trim()) return;
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
