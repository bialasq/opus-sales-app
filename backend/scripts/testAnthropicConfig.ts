import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { getLlmConfigStatus, invokeLlmJsonObject } from "../services/llmInvoke";

async function main(): Promise<void> {
  const status = getLlmConfigStatus();
  console.log("LLM config:", {
    available: status.available,
    provider: status.provider,
    configuredProvider: status.configuredProvider,
    hint: status.hint,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    anthropicModel: process.env.ANTHROPIC_MODEL || "(default)",
  });

  if (!status.available || status.provider !== "anthropic") {
    console.error("FAIL: Anthropic not selected as active provider.");
    process.exit(1);
  }

  const result = await invokeLlmJsonObject({
    system:
      'Odpowiedz WYŁĄCZNIE JSON: {"status":"ok","provider":"anthropic"}',
    user: "ping",
    temperature: 0,
    maxTokensAnthropic: 128,
  });

  console.log("API call OK:", {
    provider: result.provider,
    model: result.model,
    tokens: result.usage.total_tokens,
    rawPreview: result.raw.slice(0, 120),
  });

  if (!result.raw.includes("ok") && !result.raw.includes("anthropic")) {
    console.warn("Unexpected response body (may still be valid JSON).");
  }

  console.log("PASS: Anthropic API key and model work.");
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
