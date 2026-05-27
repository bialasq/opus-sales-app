import "../loadEnv";
import fs from "fs";
import path from "path";
import { createLogger } from "../services/appLogger";
import { getAppRoot } from "../utils/appRoot";

const log = createLogger("gcLogs");
const RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || "30", 10);
const TRACES_DIR = path.join(getAppRoot(), "logs", "traces");

function runGC(): void {
  if (!fs.existsSync(TRACES_DIR)) {
    log.info("No traces directory");
    return;
  }
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const file of fs.readdirSync(TRACES_DIR)) {
    const full = path.join(TRACES_DIR, file);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      deleted++;
    }
  }
  log.info(`Log GC: deleted ${deleted} files older than ${RETENTION_DAYS} days`);
}

try {
  runGC();
} catch (err) {
  log.error("Log GC failed", err);
  process.exit(1);
}
