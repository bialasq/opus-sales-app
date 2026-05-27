import path from "path";

let cachedRoot: string | null = null;

/** Katalog główny backendu (package.json), niezależnie od uruchomienia z tsx lub dist/. */
export function getAppRoot(): string {
  if (cachedRoot) return cachedRoot;

  const utilsDir = __dirname;
  const parentName = path.basename(path.dirname(utilsDir));
  cachedRoot =
    parentName === "dist"
      ? path.resolve(utilsDir, "..", "..")
      : path.resolve(utilsDir, "..");
  return cachedRoot;
}
