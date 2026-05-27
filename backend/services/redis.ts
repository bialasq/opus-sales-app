import Redis from "ioredis";
import { createLogger } from "./appLogger";

const log = createLogger("redis");

let client: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      log.error("Redis error", err);
    });
    client.on("connect", () => {
      log.info("Redis connected");
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

/** Tylko testy — reset klienta. */
export function __resetRedisClientForTests(): void {
  client = null;
}
