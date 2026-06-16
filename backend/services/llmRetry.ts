import { createLogger } from "./appLogger";

const log = createLogger("llmRetry");
const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
    error?: { type?: string; code?: string };
  };
  const status = e.status ?? e.statusCode;
  if (status === 429) return true;
  const msg = String(e.message || "").toLowerCase();
  if (msg.includes("429") || msg.includes("rate limit")) return true;
  if (e.code === "rate_limit_exceeded") return true;
  if (e.error?.type === "rate_limit_error") return true;
  return false;
}

/**
 * Linear backoff przy 429: 1s, 2s, 3s…
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const delayMs = BASE_DELAY_MS * (attempt + 1);
      log.warn(`Rate limit — ponowienie za ${delayMs}ms (próba ${attempt + 2}/${maxAttempts})`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
