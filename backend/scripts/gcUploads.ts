import "../loadEnv";
import { createLogger } from "../services/appLogger";
import { getStorage } from "../services/storage";

const log = createLogger("gcUploads");

const RETENTION_DAYS = parseInt(process.env.UPLOAD_RETENTION_DAYS || "90", 10);

async function runGC(): Promise<void> {
  const storage = getStorage();
  const files = await storage.listFiles();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  let deleted = 0;
  for (const file of files) {
    const meta = await storage.getMetadata(file);
    if (meta && meta.lastModified.getTime() < cutoff) {
      await storage.deleteFile(file);
      deleted++;
      log.info(`GC: deleted ${file}`, { lastModified: meta.lastModified });
    }
  }
  log.info(`GC complete: ${deleted}/${files.length} files deleted`);
}

runGC().catch((err) => {
  log.error("GC failed", err);
  process.exit(1);
});
