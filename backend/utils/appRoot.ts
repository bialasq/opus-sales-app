import fs from "fs";
import path from "path";

let cachedRoot: string | null = null;

/** Katalog główny backendu (package.json), niezależnie od uruchomienia z tsx lub dist/. */
export function getAppRoot(): string {
  if (cachedRoot) return cachedRoot;

  let dir = __dirname;
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cachedRoot = path.join(__dirname, "..");
  return cachedRoot;
}
