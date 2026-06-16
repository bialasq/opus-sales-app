import { PrismaClient } from "@prisma/client";

/**
 * Pojedyncza, współdzielona instancja PrismaClient dla całego backendu.
 * Tworzenie wielu klientów wyczerpuje pulę połączeń do bazy — dlatego
 * wszystkie moduły importują TĘ instancję, zamiast robić `new PrismaClient()`.
 *
 * W dev (hot-reload) trzymamy ją na globalThis, by reload nie tworzył
 * nowych połączeń przy każdej zmianie pliku.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
