import { vi } from "vitest";

export function mockLlmInvoke(): void {
  vi.mock("../../services/llmInvoke", () => ({
    callAnthropic: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "mocked response" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    callOpenAI: vi.fn().mockResolvedValue({
      choices: [{ message: { content: "mocked response" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
    invokeLlm: vi.fn().mockResolvedValue({
      text: "mocked response",
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  }));
}
