import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { AiInsightsResponse } from "../shared/api-types";
import { chooseProvider } from "./llmInvoke";
import { getActivePromptVersion } from "../prompts";

const CACHE_TTL_MS = Number(process.env.AGENT_CACHE_TTL_MS) || 10 * 60 * 1000;

type CacheEntry = {
  key: string;
  storedAt: number;
  response: AiInsightsResponse;
};

const memoryCache = new Map<string, CacheEntry>();

function uploadsPath(filename: string): string {
  return path.join(__dirname, "..", "uploads", filename);
}

/** Klucz cache: plik + hash treści + wersja promptu + dostawca */
export function buildCacheKey(filename: string, params: Record<string, unknown> = {}): string {
  const filePath = uploadsPath(filename);
  let filePart = `${filename}:missing`;
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const hash = crypto.createHash("sha256");
    const buf = fs.readFileSync(filePath);
    hash.update(buf);
    filePart = `${filename}:${stat.mtimeMs}:${hash.digest("hex").slice(0, 16)}`;
  }
  const paramPart = crypto
    .createHash("md5")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 8);
  return `${filePart}:${getActivePromptVersion()}:${chooseProvider()}:${paramPart}`;
}

export function getCachedInsights(key: string): AiInsightsResponse | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  const response = JSON.parse(JSON.stringify(entry.response)) as AiInsightsResponse;
  response.meta = {
    ...response.meta,
    from_cache: true,
    sessionId: response.meta.sessionId,
    cacheAge_ms: Date.now() - entry.storedAt,
  };
  return response;
}

export function setCachedInsights(key: string, response: AiInsightsResponse): void {
  memoryCache.set(key, {
    key,
    storedAt: Date.now(),
    response: JSON.parse(JSON.stringify(response)) as AiInsightsResponse,
  });
  if (memoryCache.size > 50) {
    const oldest = [...memoryCache.entries()].sort(
      (a, b) => a[1].storedAt - b[1].storedAt
    )[0];
    if (oldest) memoryCache.delete(oldest[0]);
  }
}

export function invalidateCacheForFile(filename: string): void {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`${filename}:`)) memoryCache.delete(key);
  }
}

export function clearAllAgentCache(): { cleared: number } {
  const n = memoryCache.size;
  memoryCache.clear();
  return { cleared: n };
}

export function getCacheStats(): { size: number } {
  return { size: memoryCache.size };
}
