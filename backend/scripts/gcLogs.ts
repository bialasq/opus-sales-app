import "../loadEnv";
import fs from "fs";
import path from "path";
import { createLogger } from "../services/appLogger";
import { getAppRoot } from "../utils/appRoot";

const log = createLogger("gcLogs");
const RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || "30", 10);
const TRACES_DIR = path.join(getAppRoot(), "logs", "traces");

async function runGC(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(TRACES_DIR);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "ENOENT") {
      log.info("No traces directory");
      return;
    }
    throw err;
  }

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const file of entries) {
    const full = path.join(TRACES_DIR, file);
    const stat = await fs.promises.stat(full);
    if (stat.mtimeMs < cutoff) {
      await fs.promises.unlink(full);
      deleted++;
    }
  }
  log.info(`Log GC: deleted ${deleted} files older than ${RETENTION_DAYS} days`);
}

void runGC().catch((err) => {
  log.error("Log GC failed", err);
  process.exit(1);
});
