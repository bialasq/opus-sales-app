import type { Request } from "express";
import type { UploadedFile } from "@prisma/client";
import { prisma } from "./prisma";
import { AppError } from "../errors";

/**
 * Rzucane, gdy plik nie należy do organizacji żądającego (lub nie istnieje).
 * AppError(404) — centralny errorHandler mapuje je na 404 "Plik nie istnieje",
 * więc trasy nie muszą go łapać ręcznie.
 */
export class FileNotOwnedError extends AppError {
  constructor(public readonly filename: string) {
    super(404, "Plik nie istnieje", `Brak dostępu do pliku: ${filename}`);
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
