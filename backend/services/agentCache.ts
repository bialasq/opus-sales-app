import fs from "fs";
import crypto from "crypto";
import type { AiInsightsResponse } from "../shared/api-types";
import { resolveUploadPath } from "../utils/filePathResolver";
import { chooseProvider } from "./llmInvoke";
import { getActivePromptVersion } from "../prompts";
import { createLogger } from "./appLogger";
import { getRedis } from "./redis";

const log = createLogger("agentCache");

const CACHE_TTL_MS = Number(process.env.AGENT_CACHE_TTL_MS) || 10 * 60 * 1000;
const CACHE_TTL_SECONDS = Math.max(60, Math.ceil(CACHE_TTL_MS / 1000));

type CacheEntry = {
  key: string;
  storedAt: number;
  response: AiInsightsResponse;
};

const memoryCache = new Map<string, CacheEntry>();

function cacheRedisKey(key: string): string {
  return `agentcache:${key}`;
}

function fileFingerprint(filename: string): string {
  try {
    const filePath = resolveUploadPath(filename);
    if (!fs.existsSync(filePath)) return `${filename}:missing`;
    const stat = fs.statSync(filePath);
    return `${filename}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return `${filename}:invalid`;
  }
}

/** Klucz cache: plik (mtime+size) + wersja promptu + dostawca + parametry */
export function buildCacheKey(
  filename: string,
  params: Record<string, unknown> = {}
): string {
  const filePart = fileFingerprint(filename);
  const paramPart = crypto
    .createHash("md5")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 8);
  return `${filePart}:${getActivePromptVersion()}:${chooseProvider()}:${paramPart}`;
}

function cloneWithCacheMeta(
  response: AiInsightsResponse,
  cacheAgeMs: number
): AiInsightsResponse {
  const cloned = JSON.parse(JSON.stringify(response)) as AiInsightsResponse;
  cloned.meta = {
    ...cloned.meta,
    from_cache: true,
    sessionId: cloned.meta.sessionId,
    cacheAge_ms: cacheAgeMs,
  };
  return cloned;
}

export async function getCachedInsights(
  key: string
): Promise<AiInsightsResponse | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(cacheRedisKey(key));
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as CacheEntry;
      if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
        await redis.del(cacheRedisKey(key));
        return null;
      }
      return cloneWithCacheMeta(entry.response, Date.now() - entry.storedAt);
    } catch {
      log.warn("Corrupt cache entry", { key });
      return null;
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return cloneWithCacheMeta(entry.response, Date.now() - entry.storedAt);
}

export async function setCachedInsights(
  key: string,
  response: AiInsightsResponse
): Promise<void> {
  const entry: CacheEntry = {
    key,
    storedAt: Date.now(),
    response: JSON.parse(JSON.stringify(response)) as AiInsightsResponse,
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(
      cacheRedisKey(key),
      JSON.stringify(entry),
      "EX",
      CACHE_TTL_SECONDS
    );
    return;
  }

  memoryCache.set(key, entry);
  if (memoryCache.size > 50) {
    const oldest = [...memoryCache.entries()].sort(
      (a, b) => a[1].storedAt - b[1].storedAt
    )[0];
    if (oldest) memoryCache.delete(oldest[0]);
  }
}

export async function invalidateCacheForFile(filename: string): Promise<void> {
  const prefix = `${filename}:`;
  const redis = getRedis();
  if (redis) {
    const stream = redis.scanStream({ match: "agentcache:*", count: 100 });
    for await (const keys of stream) {
      const keyList = keys as string[];
      const toDelete = keyList.filter((k) => k.includes(prefix));
      if (toDelete.length) await redis.del(...toDelete);
    }
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}

export async function clearAllAgentCache(): Promise<{ cleared: number }> {
  const redis = getRedis();
  if (redis) {
    let cleared = 0;
    const stream = redis.scanStream({ match: "agentcache:*", count: 100 });
    for await (const keys of stream) {
      const keyList = keys as string[];
      if (keyList.length) {
        cleared += keyList.length;
        await redis.del(...keyList);
      }
    }
    return { cleared };
  }
  const n = memoryCache.size;
  memoryCache.clear();
  return { cleared: n };
}

export async function getCacheStats(): Promise<{ size: number }> {
  const redis = getRedis();
  if (redis) {
    let size = 0;
    const stream = redis.scanStream({ match: "agentcache:*", count: 100 });
    for await (const keys of stream) {
      size += (keys as string[]).length;
    }
    return { size };
  }
  return { size: memoryCache.size };
}

/** Tylko testy */
export function __clearMemoryCacheForTests(): void {
  memoryCache.clear();
}
