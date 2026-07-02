import express, {
  type CookieOptions,
  type Request,
  type Response,
} from "express";
import { sessionAuth } from "../middleware/session";
import {
  registerOrganization,
  login,
  refreshTokens,
  logout,
} from "../services/authService";
import { createLogger } from "../services/appLogger";
import { prisma } from "../services/prisma";

const log = createLogger("routes/auth");
const router = express.Router();

// --- Refresh token w httpOnly cookie (niedostępny dla JS → odporny na XSS) ---
const REFRESH_COOKIE = "opus_refresh";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni — zgodne z REFRESH_TOKEN_TTL_DAYS

function refreshCookieOptions(): CookieOptions {
  const sameSite =
    (process.env.COOKIE_SAMESITE as CookieOptions["sameSite"]) || "lax";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite,
    // Cookie wysyłane tylko do tras auth (refresh/logout) — minimalna ekspozycja.
    path: "/api/auth",
    maxAge: REFRESH_TTL_MS,
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...opts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
}

// Trasy register/login/refresh/logout są w PUBLIC_PATHS (sessionAuth je przepuszcza
// globalnie). /me wymaga tokenu — sessionAuth podpięty bezpośrednio na tej trasie
// (authRoutes rejestrowane przed globalnym sessionAuth w server.ts).

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { organizationName, email, password, userName } = req.body ?? {};
    if (!organizationName || !email || !password) {
      res
        .status(400)
        .json({ error: "Wymagane: organizationName, email, password" });
      return;
    }
    const result = await registerOrganization({
      organizationName,
      email,
      password,
      userName,
    });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Błąd rejestracji";
    res.status(400).json({ error: message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "Wymagane: email, password" });
      return;
    }
    const { accessToken, refreshToken } = await login(email, password);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch {
    // Świadomie ogólny komunikat — nie zdradzamy, czy to e-mail czy hasło.
    log.warn("Nieudane logowanie", { ip: req.ip });
    res.status(401).json({ error: "Nieprawidłowy e-mail lub hasło" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    // Refresh token czytamy WYŁĄCZNIE z httpOnly cookie (nie z body).
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      res.status(401).json({ error: "Brak refresh tokenu" });
      return;
    }
    const { accessToken, refreshToken: rotated } =
      await refreshTokens(refreshToken);
    setRefreshCookie(res, rotated);
    res.json({ accessToken });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Nieprawidłowy lub wygasły refresh token" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) await logout(refreshToken);
  clearRefreshCookie(res);
  res.json({ ok: true });
});

/** Kto jestem — wygodne dla frontu po odświeżeniu strony. */
router.get("/me", sessionAuth, async (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: "Niezalogowany" });
    return;
  }
  const base = {
    userId: req.auth.userId,
    organizationId: req.auth.organizationId,
    role: req.auth.role,
  };
  try {
    // Wzbogacenie o dane z bazy (e-mail, nazwa organizacji) dla UI konta.
    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: {
        email: true,
        name: true,
        organization: { select: { name: true } },
      },
    });
    res.json({
      ...base,
      email: user?.email,
      name: user?.name ?? null,
      organizationName: user?.organization?.name,
    });
  } catch {
    // Baza chwilowo niedostępna — zwróć minimalny kontekst z tokenu.
    res.json(base);
  }
});

export default router;
