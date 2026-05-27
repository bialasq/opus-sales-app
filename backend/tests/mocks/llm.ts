import { vi } from "vitest";

const defaultUsage = {
  prompt_tokens: 12,
  completion_tokens: 8,
  total_tokens: 20,
};

/** Stub OpenAI assistant message (text-only, no tool calls). */
export const mockOpenAiChatRoundResult = {
  provider: "openai" as const,
  model: "gpt-4o",
  usage: { ...defaultUsage },
  message: {
    role: "assistant" as const,
    content: JSON.stringify({
      summary: "Mock analyst summary",
      anomalies: [],
      metrics: { productCount: 1 },
    }),
  },
};

/** Stub Anthropic message round (text block). */
export const mockAnthropicChatRoundResult = {
  provider: "anthropic" as const,
  model: "claude-sonnet-4-6",
  usage: { ...defaultUsage },
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        summary: "Mock analyst summary",
        anomalies: [],
        metrics: { productCount: 1 },
      }),
    },
  ],
  stop_reason: "end_turn",
};

export const mockLlmJsonResult = {
  raw: JSON.stringify({
    summary: "Mock analyst summary",
    anomalies: [],
    metrics: { productCount: 1 },
  }),
  provider: "openai" as const,
  model: "gpt-4o",
  usage: { ...defaultUsage },
};

/**
 * Vitest mock for llmInvoke — keeps real budget helpers, stubs network-facing calls.
 * Register from tests/setup.ts via vi.mock().
 */
export function createLlmInvokeMock() {
  return {
    chooseProvider: vi.fn(() => "openai" as const),
    getLlmConfigStatus: vi.fn(() => ({
      available: true,
      provider: "openai" as const,
      configuredProvider: "openai",
    })),
    invokeLlmJsonObject: vi.fn().mockResolvedValue(mockLlmJsonResult),
    invokeOpenAiChatRound: vi.fn().mockResolvedValue(mockOpenAiChatRoundResult),
    invokeAnthropicChatRound: vi.fn().mockResolvedValue(mockAnthropicChatRoundResult),
  };
}
