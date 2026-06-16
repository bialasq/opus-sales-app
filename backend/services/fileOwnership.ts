import type { Request } from "express";
import type { UploadedFile } from "@prisma/client";
import { prisma } from "./prisma";

/** Rzucane, gdy plik nie należy do organizacji żądającego (lub nie istnieje). */
export class FileNotOwnedError extends Error {
  constructor(public readonly filename: string) {
    super(`Plik nie istnieje lub brak dostępu: ${filename}`);
    this.name = "FileNotOwnedError";
  }
}

/**
 * Sprawdza własność pliku po organizationId (bez zależności od req).
 * Używane w uploadReader i innych warstwach bez kontekstu HTTP.
 */
export async function assertFileOwnershipByOrg(
  organizationId: string,
  filename: string
): Promise<UploadedFile> {
  if (!organizationId) {
    throw new FileNotOwnedError(filename);
  }

  const file = await prisma.uploadedFile.findUnique({
    where: {
      organizationId_storageKey: { organizationId, storageKey: filename },
    },
  });

  if (!file) throw new FileNotOwnedError(filename);
  return file;
}

/**
 * Sprawdza, że plik `storageKey` należy do organizacji z req.auth.
 * Zwraca rekord UploadedFile (przydatny np. do powiązania jobu przez fileId).
 *
 * Wymaga, by wcześniej zadziałał requireOrg (gwarantuje req.auth.organizationId).
 */
export async function assertFileOwnership(
  req: Request,
  filename: string
): Promise<UploadedFile> {
  const organizationId = req.auth?.organizationId;
  if (!organizationId) {
    throw new FileNotOwnedError(filename);
  }
  return assertFileOwnershipByOrg(organizationId, filename);
}
