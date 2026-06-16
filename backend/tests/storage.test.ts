import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { __resetStorageForTests, getStorage } from "../services/storage";

describe("storage (local)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opus-storage-"));
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("LOCAL_UPLOADS_DIR", tmpDir);
    __resetStorageForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetStorageForTests();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("putFile + getFile round-trip", async () => {
    const storage = getStorage();
    const content = Buffer.from("excel-bytes");
    await storage.putFile("report.xlsx", content);
    const read = await storage.getFile("report.xlsx");
    expect(read.equals(content)).toBe(true);
  });

  it("deleteFile removes object", async () => {
    const storage = getStorage();
    await storage.putFile("gone.xlsx", Buffer.from("x"));
    await storage.deleteFile("gone.xlsx");
    await expect(storage.getFile("gone.xlsx")).rejects.toThrow();
  });

  it("org-scoped putFile + getFile round-trip", async () => {
    const storage = getStorage();
    const content = Buffer.from("org-scoped-bytes");
    await storage.putFile("org_test1/a.xlsx", content);
    const read = await storage.getFile("org_test1/a.xlsx");
    expect(read.equals(content)).toBe(true);
  });

  it("rejects path traversal in org-scoped key", async () => {
    const storage = getStorage();
    await expect(storage.getFile("org_test1/../b.xlsx")).rejects.toThrow(
      /Invalid storage key/
    );
  });
});
