import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { promises as fs } from "fs";
import path from "path";
import { createLogger } from "./appLogger";
import { getAppRoot } from "../utils/appRoot";

const log = createLogger("storage");

/** Klucz pliku w kontenerze organizacji: org_{id}/{nazwa} (dokładnie jeden slash). */
const ORG_SCOPED_KEY = /^org_[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;

/** Odrzuca segmenty z path traversal lub separatorami — każdy segment osobno. */
function assertSafeSegment(segment: string): void {
  if (
    segment.includes("..") ||
    segment.includes("\\") ||
    segment.includes("/")
  ) {
    throw new Error(`Invalid storage key segment: ${segment}`);
  }
  if (path.basename(segment) !== segment) {
    throw new Error(`Invalid storage key segment: ${segment}`);
  }
}

/** Prefiks listowania — dozwolone segmenty org_{id}/… bez "..". */
function validateListPrefix(prefix: string): void {
  if (!prefix) return;
  if (prefix.includes("..") || prefix.includes("\\")) {
    throw new Error(`Invalid storage list prefix: ${prefix}`);
  }
  for (const segment of prefix.split("/")) {
    if (segment) assertSafeSegment(segment);
  }
}

/**
 * Waliduje klucz pliku i zwraca go w postaci względnej (płaski lub org_{id}/plik).
 * Klucze bez slasha — kompatybilność wstecz z dotychczasowymi uploadami.
 */
function validateFileKey(key: string): string {
  if (!key.includes("/")) {
    const safe = path.basename(key);
    if (safe !== key) throw new Error(`Invalid storage key: ${key}`);
    assertSafeSegment(safe);
    return safe;
  }

  if (!ORG_SCOPED_KEY.test(key)) {
    throw new Error(`Invalid storage key: ${key}`);
  }

  const slashIdx = key.indexOf("/");
  const orgDir = key.slice(0, slashIdx);
  const fileName = key.slice(slashIdx + 1);
  assertSafeSegment(orgDir);
  assertSafeSegment(fileName);
  return key;
}

export interface StorageProvider {
  putFile(key: string, content: Buffer): Promise<void>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  listFiles(prefix?: string): Promise<string[]>;
  getMetadata(
    key: string
  ): Promise<{ size: number; lastModified: Date } | null>;
  getSignedDownloadUrl?(key: string, expiresInSeconds: number): Promise<string>;
}

class LocalStorage implements StorageProvider {
  constructor(private baseDir: string) {}

  /** Mapuje zwalidowany klucz na ścieżkę absolutną w baseDir. */
  private resolveSafe(key: string): string {
    const validated = validateFileKey(key);
    if (!validated.includes("/")) {
      return path.join(this.baseDir, validated);
    }
    const slashIdx = validated.indexOf("/");
    const orgDir = validated.slice(0, slashIdx);
    const fileName = validated.slice(slashIdx + 1);
    return path.join(this.baseDir, orgDir, fileName);
  }

  async putFile(key: string, content: Buffer): Promise<void> {
    const target = this.resolveSafe(key);
    // Dla org_{id}/plik tworzy podkatalog organizacji przed zapisem.
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }

  async getFile(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveSafe(key));
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveSafe(key));
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (code !== "ENOENT") throw err;
    }
  }

  async listFiles(prefix = ""): Promise<string[]> {
    try {
      if (!prefix) {
        const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
      }

      validateListPrefix(prefix);

      const parts = prefix.split("/").filter(Boolean);
      if (parts.length >= 1 && /^org_[A-Za-z0-9_-]+$/.test(parts[0])) {
        const dir = path.join(this.baseDir, ...parts);
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const baseKey = parts.join("/");
        return entries
          .filter((e) => e.isFile())
          .map((e) => `${baseKey}/${e.name}`);
      }

      const files = await fs.readdir(this.baseDir);
      return files.filter((f) => f.startsWith(prefix));
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (code === "ENOENT") return [];
      throw err;
    }
  }

  async getMetadata(
    key: string
  ): Promise<{ size: number; lastModified: Date } | null> {
    try {
      const stats = await fs.stat(this.resolveSafe(key));
      return { size: stats.size, lastModified: stats.mtime };
    } catch {
      return null;
    }
  }
}

class S3Storage implements StorageProvider {
  constructor(
    private client: S3Client,
    private bucket: string,
    private prefix: string = ""
  ) {}

  /** Pełny klucz S3 — zachowuje prefiks org_{id}/ zamiast obcinać basename. */
  private keyFor(key: string): string {
    const relative = validateFileKey(key);
    return this.prefix ? `${this.prefix}/${relative}` : relative;
  }

  /** Prefiks listowania S3 — obsługuje org_{id}/ z natywnym separatorem "/". */
  private listPrefixFor(prefix: string): string {
    if (!prefix) return this.prefix ? `${this.prefix}/` : "";
    validateListPrefix(prefix);
    return this.prefix ? `${this.prefix}/${prefix}` : prefix;
  }

  private stripPrefix(fullKey: string): string {
    if (!this.prefix) return fullKey;
    const p = `${this.prefix}/`;
    return fullKey.startsWith(p) ? fullKey.slice(p.length) : fullKey;
  }

  async putFile(key: string, content: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(key),
        Body: content,
      })
    );
  }

  async getFile(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(key),
      })
    );
    const stream = res.Body;
    if (!stream || typeof stream === "string") {
      throw new Error("Empty S3 object body");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(key),
      })
    );
  }

  async listFiles(prefix = ""): Promise<string[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.listPrefixFor(prefix),
      })
    );
    return (res.Contents || [])
      .map((o) => this.stripPrefix(o.Key || ""))
      .filter(Boolean);
  }

  async getMetadata(
    key: string
  ): Promise<{ size: number; lastModified: Date } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.keyFor(key),
        })
      );
      return {
        size: res.ContentLength || 0,
        lastModified: res.LastModified || new Date(),
      };
    } catch {
      return null;
    }
  }

  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds: number
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(key),
      }),
      { expiresIn: expiresInSeconds }
    );
  }
}

let storageInstance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (storageInstance) return storageInstance;

  if (process.env.S3_BUCKET?.trim()) {
    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || "us-east-1",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    });
    storageInstance = new S3Storage(
      client,
      process.env.S3_BUCKET.trim(),
      process.env.S3_PREFIX?.trim() || "uploads"
    );
    log.info(`Using S3 storage: ${process.env.S3_BUCKET}`);
  } else {
    const uploadsDir =
      process.env.LOCAL_UPLOADS_DIR?.trim() ||
      path.join(getAppRoot(), "uploads");
    storageInstance = new LocalStorage(uploadsDir);
    log.info(`Using local storage: ${uploadsDir}`);
  }

  return storageInstance;
}

/** Tylko testy */
export function __resetStorageForTests(): void {
  storageInstance = null;
}
