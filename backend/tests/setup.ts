process.env.NODE_ENV = "test";
process.env.API_KEY = "test-api-key-32-chars-long-string-aaaaaa";
process.env.AI_BUDGET_USD_PER_DAY = "100";
process.env.AI_REQUEST_TIMEOUT_MS = "5000";
process.env.ANTHROPIC_API_KEY = "test-mock-anthropic-key-32chars-min";
process.env.OPENAI_API_KEY = "test-mock-openai-key-32chars-minimum";
process.env.FRONTEND_ORIGIN = "http://localhost:8080";
process.env.JWT_SECRET =
  "test-jwt-secret-32-chars-minimum-for-auth-tests";

import { vi } from "vitest";
import { createLlmInvokeMock } from "./mocks/llm";

vi.mock("../services/llmInvoke", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/llmInvoke")>();
  return {
    ...actual,
    ...createLlmInvokeMock(),
  };
});
