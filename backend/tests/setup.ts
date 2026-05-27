import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY = "test-api-key-32-chars-long-string-aaaaaa";
  process.env.AI_BUDGET_USD_PER_DAY = "100";
  process.env.AI_REQUEST_TIMEOUT_MS = "5000";
  process.env.ANTHROPIC_API_KEY = "test-mock-key";
  process.env.OPENAI_API_KEY = "test-mock-key";
  process.env.FRONTEND_ORIGIN = "http://localhost:8080";
});
