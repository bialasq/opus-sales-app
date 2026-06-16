import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../services/authService";
import { constantTimeEqual } from "./auth";
import { createLogger } from "../services/appLogger";

const log = createLogger("middleware/session");

// Rozszerzamy typ Request o kontekst uwierzytelnionego użytkownika.
// To pozwala każdej trasie odczytać req.auth.organizationId bez powtórzeń.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        role: AccessTokenPayload["role"];
      };
    }
  }
}

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/healthz",
  "/api/readyz",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
]);

function isPublicPath(req: Request): boolean {
  const pathOnly = req.path.split("?")[0];
  return PUBLIC_PATHS.has(pathOnly);
}

/**
 * Uwierzytelnianie dwutrybowe:
 *  1. Bearer JWT  → tryb wielodostępny (per-użytkownik, z organizationId).  [docelowy]
 *  2. x-api-key   → tryb legacy (jeden współdzielony klucz, bez izolacji).  [przejściowy]
 *
 * Tryb legacy zostaje, by nie zepsuć istniejących wdrożeń podczas migracji.
 * Gdy LEGACY_API_KEY_ENABLED=false, akceptowany jest wyłącznie JWT.
 */
export function sessionAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isPublicPath(req)) {
    next();
    return;
  }

  // --- Tryb 1: JWT (preferowany) ---
  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    try {
      const payload = verifyAccessToken(token);
      req.auth = {
        userId: payload.sub,
        organizationId: payload.org,
        role: payload.role,
      };
      next();
      return;
    } catch (err) {
      log.warn("Nieprawidłowy access token", {
        detail: err instanceof Error ? err.message : "unknown",
      });
      res.status(401).json({ error: "Nieprawidłowy lub wygasły token" });
      return;
    }
  }

  // --- Tryb 2: legacy x-api-key ---
  const legacyEnabled = process.env.LEGACY_API_KEY_ENABLED !== "false";
  if (legacyEnabled) {
    const configured = process.env.API_KEY?.trim() || "";
    const provided = req.header("x-api-key");
    if (configured && provided && constantTimeEqual(provided, configured)) {
      // Brak organizationId w trybie legacy — trasy wymagające izolacji
      // muszą to wykryć (patrz requireOrg niżej).
      next();
      return;
    }
  }

  res.status(401).json({ error: "Wymagane uwierzytelnienie (Bearer token)" });
}

/**
 * Strażnik tras operujących na danych: wymusza obecność organizationId.
 * Trasy analityczne, pliki i joby owijamy tym, żeby legacy-klucz (bez org)
 * nie mógł wejść w dane wielodostępne.
 */
export function requireOrg(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth?.organizationId) {
    res.status(403).json({
      error:
        "Ta operacja wymaga logowania użytkownika (kontekst organizacji).",
    });
    return;
  }
  next();
}

/** Strażnik ról — np. zarządzanie użytkownikami tylko dla OWNER/ADMIN. */
export function requireRole(...roles: AccessTokenPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Brak uprawnień do tej operacji" });
      return;
    }
    next();
  };
}
