import express, { type Request, type Response } from "express";
import { sessionAuth } from "../middleware/session";
import {
  registerOrganization,
  login,
  refreshTokens,
  logout,
} from "../services/authService";
import { createLogger } from "../services/appLogger";

const log = createLogger("routes/auth");
const router = express.Router();

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
    const tokens = await login(email, password);
    res.json(tokens);
  } catch (err) {
    // Świadomie ogólny komunikat — nie zdradzamy, czy to e-mail czy hasło.
    log.warn("Nieudane logowanie", { ip: req.ip });
    res.status(401).json({ error: "Nieprawidłowy e-mail lub hasło" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      res.status(400).json({ error: "Wymagany refreshToken" });
      return;
    }
    const tokens = await refreshTokens(refreshToken);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: "Nieprawidłowy lub wygasły refresh token" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const { refreshToken } = req.body ?? {};
  if (refreshToken) await logout(refreshToken);
  res.json({ ok: true });
});

/** Kto jestem — wygodne dla frontu po odświeżeniu strony. */
router.get("/me", sessionAuth, (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: "Niezalogowany" });
    return;
  }
  res.json({
    userId: req.auth.userId,
    organizationId: req.auth.organizationId,
    role: req.auth.role,
  });
});

export default router;
