import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../services/appLogger";

const log = createLogger("middleware/auth");

let warnedMissingKey = false;

function getConfiguredApiKey(): string {
  return process.env.API_KEY?.trim() || "";
}

function warnIfKeyInvalid(): void {
  if (warnedMissingKey) return;
  const key = getConfiguredApiKey();
  if (!key || key.length < 32) {
    log.warn(
      "API_KEY not set or too short (< 32 chars). Protected API requests will be rejected until configured."
    );
    warnedMissingKey = true;
  }
}

warnIfKeyInvalid();

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/healthz",
  "/api/readyz",
  "/health",
  "/healthz",
  "/readyz",
  "/ready",
]);

function isPublicPath(req: Request): boolean {
  const pathOnly = req.path.split("?")[0];
  const original = req.originalUrl.split("?")[0];
  return PUBLIC_PATHS.has(pathOnly) || PUBLIC_PATHS.has(original);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (isPublicPath(req)) {
    next();
    return;
  }

  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    log.error("API_KEY not configured — rejecting request");
    res.status(503).json({ error: "Service not configured" });
    return;
  }

  const providedKey = req.header("x-api-key");
  if (!providedKey) {
    res.status(401).json({ error: "Missing x-api-key header" });
    return;
  }

  if (!constantTimeEqual(providedKey, apiKey)) {
    log.warn("Invalid API key", { ip: req.ip });
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

/** Tylko testy — reset flagi ostrzeżenia przy przeładowaniu modułu. */
export function __resetAuthWarningsForTests(): void {
  warnedMissingKey = false;
}
