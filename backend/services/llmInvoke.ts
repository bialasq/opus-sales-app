import OpenAI from "openai";
import { withRateLimitRetry } from "./llmRetry";

export type LlmProviderActive = "openai" | "anthropic";

export type LlmConfigStatus = {
  available: boolean;
  provider: "openai" | "anthropic" | "none";
  /** Preferowany z AI_PROVIDER (może być niedostępny bez klucza) */
  configuredProvider?: string;
  hint?: string;
};

/**
 * Wybór dostawcy LLM — spójny z modułami AI.
 * Gdy AI_PROVIDER wskazuje dostawcę bez klucza, używany jest drugi dostępny klucz.
 */
export function chooseProvider(): "openai" | "anthropic" | "none" {
  return getLlmConfigStatus().provider;
}

export function getLlmConfigStatus(): LlmConfigStatus {
  const explicit = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (explicit === "openai") {
    if (hasOpenAi) return { available: true, provider: "openai", configuredProvider: "openai" };
    if (hasAnthropic) {
      return {
        available: true,
        provider: "anthropic",
        configuredProvider: "openai",
        hint: "AI_PROVIDER=openai, ale brak OPENAI_API_KEY — użyto Anthropic.",
      };
    }
    return {
      available: false,
      provider: "none",
      configuredProvider: "openai",
      hint: "Ustaw OPENAI_API_KEY w backend/.env (lub zmień AI_PROVIDER i dodaj ANTHROPIC_API_KEY).",
    };
  }

  if (explicit === "anthropic") {
    if (hasAnthropic) return { available: true, provider: "anthropic", configuredProvider: "anthropic" };
    if (hasOpenAi) {
      return {
        available: true,
        provider: "openai",
        configuredProvider: "anthropic",
        hint: "AI_PROVIDER=anthropic, ale brak ANTHROPIC_API_KEY — użyto OpenAI.",
      };
    }
    return {
      available: false,
      provider: "none",
      configuredProvider: "anthropic",
      hint: "Ustaw ANTHROPIC_API_KEY w backend/.env (lub zmień AI_PROVIDER=openai i dodaj OPENAI_API_KEY).",
    };
  }

  if (hasOpenAi) return { available: true, provider: "openai" };
  if (hasAnthropic) return { available: true, provider: "anthropic" };
  return {
    available: false,
    provider: "none",
    hint: "Brak klucza LLM. Dodaj OPENAI_API_KEY lub ANTHROPIC_API_KEY w pliku backend/.env i zrestartuj serwer (npm run dev).",
  };
}

export type InvokeLlmJsonOptions = {
  system: string;
  user: string;
  temperature?: number;
  maxTokensOpenAi?: number;
  maxTokensAnthropic?: number;
  /** Nadpisanie modelu (np. gpt-4o-mini / Haiku dla kroku Analityk) */
  modelOverride?: string;
};

/**
 * Wywołanie modelu z oczekiwanym JSON-em w odpowiedzi (OpenAI: response_format json_object).
 * Anthropic: system + user; model proszony o sam JSON w system prompt.
 */
export type LlmInvokeResult = {
  raw: string;
  provider: LlmProviderActive;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export async function invokeLlmJsonObject(
  options: InvokeLlmJsonOptions
): Promise<LlmInvokeResult> {
  const provider = chooseProvider();
  if (provider === "none") {
    throw new Error("NO_LLM_PROVIDER");
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("MISSING_OPENAI");
    const client = new OpenAI({ apiKey });
    const model = options.modelOverride || process.env.AI_MODEL || "gpt-4o";
    const res = await withRateLimitRetry(() =>
      client.chat.completions.create({
        model,
        temperature: options.temperature ?? 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        max_tokens: options.maxTokensOpenAi ?? 4096,
      })
    );
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error("Empty OpenAI response");
    const u = res.usage;
    return {
      raw: text,
      provider: "openai",
      model,
      usage: {
        prompt_tokens: u?.prompt_tokens ?? 0,
        completion_tokens: u?.completion_tokens ?? 0,
        total_tokens: u?.total_tokens ?? 0,
      },
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");
  const model =
    options.modelOverride ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-6";

  const res = await withRateLimitRetry(() =>
    fetch("https://api.anthropic.com/v1/messages", {
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
    })
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty Anthropic response");
  const inTok = body.usage?.input_tokens ?? 0;
  const outTok = body.usage?.output_tokens ?? 0;
  return {
    raw: text,
    provider: "anthropic",
    model,
    usage: {
      prompt_tokens: inTok,
      completion_tokens: outTok,
      total_tokens: inTok + outTok,
    },
  };
}
