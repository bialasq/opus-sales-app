import path from "path";
import { getAppRoot } from "./appRoot";

/** Dozwolone nazwy plików w uploads/ (bez separatorów ścieżki). */
export const FILENAME_REGEX = /^[A-Za-z0-9._-]+\.(xlsx|xls)$/;

export class InvalidFilenameError extends Error {
  constructor(message = "Invalid filename") {
    super(message);
    this.name = "InvalidFilenameError";
  }
}

let uploadsDirCache: string | null = null;

/** Absolutna ścieżka katalogu uploads/ (spójna w całym backendzie). */
export function getUploadsDir(): string {
  if (!uploadsDirCache) {
    uploadsDirCache = path.resolve(path.join(getAppRoot(), "uploads"));
  }
  return uploadsDirCache;
}

/**
 * Waliduje filename i zwraca bezpieczną absolutną ścieżkę wewnątrz uploads/.
 * @throws {InvalidFilenameError}
 */
export function resolveUploadPath(filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new InvalidFilenameError();
  }
  if (filename.includes("\0")) {
    throw new InvalidFilenameError();
  }
  if (/[/\\]/.test(filename) || filename.includes("..")) {
    throw new InvalidFilenameError();
  }

  const base = path.basename(filename);
  if (base !== filename) {
    throw new InvalidFilenameError();
  }
  if (!FILENAME_REGEX.test(base)) {
    throw new InvalidFilenameError();
  }

  const uploadsDir = getUploadsDir();
  const resolved = path.resolve(uploadsDir, base);
  const uploadsResolved = path.resolve(uploadsDir);
  const prefix = uploadsResolved.endsWith(path.sep)
    ? uploadsResolved
    : uploadsResolved + path.sep;

  if (resolved !== uploadsResolved && !resolved.startsWith(prefix)) {
    throw new InvalidFilenameError();
  }

  return resolved;
}
