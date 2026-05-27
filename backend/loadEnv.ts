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
    dotenv.config({
      path: envPath,
      override: process.env.NODE_ENV !== "production",
    });
  }
}

loadEnvFromDisk();

const appRoot = getAppRoot();

export { appRoot };
