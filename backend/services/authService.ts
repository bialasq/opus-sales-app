import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { createLogger } from "./appLogger";
import { prisma } from "./prisma";

const log = createLogger("authService");

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = "15m"; // krótki — odświeżany refresh tokenem
const REFRESH_TOKEN_TTL_DAYS = 30;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET nie ustawiony lub za krótki (min. 32 znaki). " +
        'Wygeneruj: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return secret;
}

/** Payload zapisywany w access tokenie — minimalna, bezpieczna treść. */
type UserRole = "OWNER" | "ADMIN" | "MEMBER";
export interface AccessTokenPayload {
  sub: string; // userId
  org: string; // organizationId — KLUCZ do izolacji danych
  role: UserRole;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Rejestracja: tworzy organizację i pierwszego użytkownika (OWNER) w jednej transakcji. */
export async function registerOrganization(input: {
  organizationName: string;
  email: string;
  password: string;
  userName?: string;
}): Promise<{ userId: string; organizationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Nieprawidłowy adres e-mail");
  if (input.password.length < 8)
    throw new Error("Hasło musi mieć co najmniej 8 znaków");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Użytkownik z tym e-mailem już istnieje");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const org = await tx.organization.create({
      data: { name: input.organizationName.trim() },
    });
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: input.userName?.trim() || null,
        role: "OWNER",
        organizationId: org.id,
      },
    });
    return { userId: user.id, organizationId: org.id };
  });

  log.info("Zarejestrowano nową organizację", {
    organizationId: result.organizationId,
  });
  return result;
}

/** Logowanie: weryfikuje hasło, zwraca parę tokenów. */
export async function login(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  // Stały koszt niezależnie od istnienia użytkownika — utrudnia enumerację kont.
  const hashToCompare =
    user?.passwordHash ||
    "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !user.isActive || !valid) {
    throw new Error("Nieprawidłowy e-mail lub hasło");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return issueTokenPair({
    sub: user.id,
    org: user.organizationId,
    role: user.role,
  });
}

/** Wydaje access token (JWT) + refresh token (hash w bazie). */
async function issueTokenPair(
  payload: AccessTokenPayload
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
  });

  const refreshRaw = randomUUID() + randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await prisma.refreshToken.create({
    data: { tokenHash: hashToken(refreshRaw), userId: payload.sub, expiresAt },
  });

  return { accessToken, refreshToken: refreshRaw };
}

/** Rotacja: wymienia ważny refresh token na nową parę, unieważniając stary. */
export async function refreshTokens(
  refreshRaw: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshRaw) },
    include: { user: true },
  });

  if (
    !stored ||
    stored.revokedAt ||
    stored.expiresAt < new Date() ||
    !stored.user.isActive
  ) {
    throw new Error("Nieprawidłowy lub wygasły refresh token");
  }

  // Rotacja: unieważnij stary, wydaj nowy (wykrywanie kradzieży tokenu).
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair({
    sub: stored.user.id,
    org: stored.user.organizationId,
    role: stored.user.role,
  });
}

/** Wylogowanie — unieważnia refresh token. */
export async function logout(refreshRaw: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshRaw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Weryfikacja access tokenu — używana przez middleware. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
  if (!decoded.sub || !decoded.org) {
    throw new Error("Token bez wymaganych pól (sub/org)");
  }
  return decoded;
}

