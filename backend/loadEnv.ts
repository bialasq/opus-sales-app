import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getAppRoot } from "./utils/appRoot";

function loadEnvFromDisk(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const appRoot = getAppRoot();
  const envPath = path.join(appRoot, ".env");

  if (fs.existsSync(envPath)) {
    // override:false (standard 12-factor) — zmienne już ustawione w środowisku procesu
    // (Docker/Compose, CI, orchestrator) mają pierwszeństwo; plik .env tylko uzupełnia braki.
    // Inaczej zamontowany .env nadpisywałby np. DATABASE_URL podany przez compose.
    dotenv.config({
      path: envPath,
      override: false,
    });
  }
}

loadEnvFromDisk();

const appRoot = getAppRoot();

export { appRoot };
