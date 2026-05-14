import OpenAI from "openai";

export type LlmProviderActive = "openai" | "anthropic";

/**
 * Wybór dostawcy LLM — spójny z modułami AI (OpenAI preferowane gdy brak jawnego AI_PROVIDER).
 */
export function chooseProvider(): "openai" | "anthropic" | "none" {
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase();
  if (explicit === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (explicit === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}

export type InvokeLlmJsonOptions = {
  system: string;
  user: string;
  temperature?: number;
  maxTokensOpenAi?: number;
  maxTokensAnthropic?: number;
};

/**
 * Wywołanie modelu z oczekiwanym JSON-em w odpowiedzi (OpenAI: response_format json_object).
 * Anthropic: system + user; model proszony o sam JSON w system prompt.
 */
export async function invokeLlmJsonObject(
  options: InvokeLlmJsonOptions
): Promise<{ raw: string; provider: LlmProviderActive }> {
  const provider = chooseProvider();
  if (provider === "none") {
    throw new Error("NO_LLM_PROVIDER");
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("MISSING_OPENAI");
    const client = new OpenAI({ apiKey });
    const model = process.env.AI_MODEL || "gpt-4o";
    const res = await client.chat.completions.create({
      model,
      temperature: options.temperature ?? 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      max_tokens: options.maxTokensOpenAi ?? 4096,
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error("Empty OpenAI response");
    return { raw: text, provider: "openai" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokensAnthropic ?? 4096,
      system: `${options.system}\n\nOdpowiedz WYŁĄCZNIE jednym obiektem JSON (bez markdown, bez komentarzy przed/po).`,
      messages: [{ role: "user", content: options.user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = body.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty Anthropic response");
  return { raw: text, provider: "anthropic" };
}
