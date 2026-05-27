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

  private resolveSafe(key: string): string {
    const safe = path.basename(key);
    if (safe !== key) throw new Error(`Invalid storage key: ${key}`);
    return path.join(this.baseDir, safe);
  }

  async putFile(key: string, content: Buffer): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.resolveSafe(key), content);
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

  private keyFor(key: string): string {
    const safe = path.basename(key);
    return this.prefix ? `${this.prefix}/${safe}` : safe;
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
        Prefix: this.keyFor(prefix),
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
