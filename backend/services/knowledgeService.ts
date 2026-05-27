import fs from "fs/promises";
import path from "path";
import type { SuggestionFeedbackVerdict } from "../shared/api-types";
import { createLogger } from "./appLogger";
import {
  TRACES_DIR,
  buildSessionFilenameIndex,
  readFeedbackJsonlLines,
} from "./traceLogReader";

const log = createLogger("knowledgeService");

/** Max rekordów feedbacku wczytywanych do rankingu (oszczędność I/O + prompt) */
const MAX_FEEDBACK_LOAD =
  Number(process.env.KNOWLEDGE_MAX_FEEDBACK_RECORDS) || 10;

/** Max przykładów / odrzuceń wstrzykiwanych do promptu Stratega */
const MAX_POSITIVE_IN_PROMPT = 3;
const MAX_REJECT_IN_PROMPT = 5;

/** Twardy limit znaków sekcji RLHF w prompcie */
const MAX_KNOWLEDGE_CONTEXT_CHARS = 2800;

export type FeedbackRecord = {
  sessionId: string;
  suggestionIndex: number;
  verdict: SuggestionFeedbackVerdict;
  title: string;
  description: string;
  timestamp: string;
  filename?: string;
  prompt_version?: string;
};

export type RankedExample = {
  title: string;
  description: string;
  score: number;
  filename?: string;
};

async function ensureTracesDir(): Promise<void> {
  try {
    await fs.mkdir(TRACES_DIR, { recursive: true });
  } catch (err) {
    log.warn("Could not ensure traces directory exists", { detail: err });
  }
}

export { buildSessionFilenameIndex };

export async function loadAllFeedback(
  sessionIndex?: Map<string, string>
): Promise<FeedbackRecord[]> {
  await ensureTracesDir();

  const index = sessionIndex ?? (await buildSessionFilenameIndex());
  const records: FeedbackRecord[] = [];

  let files: string[];
  try {
    files = await fs.readdir(TRACES_DIR);
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") {
      return [];
    }
    log.warn("Could not list traces directory for feedback", { detail: err });
    return [];
  }

  for (const file of files) {
    if (!file.endsWith("-feedback.jsonl")) {
      continue;
    }
    const sessionId = file.replace(/-feedback\.jsonl$/, "");
    const filePath = path.join(TRACES_DIR, file);
    const lines = await readFeedbackJsonlLines(filePath);

    for (const line of lines) {
      try {
        const row = JSON.parse(line) as FeedbackRecord;
        records.push({
          ...row,
          sessionId: row.sessionId || sessionId,
          filename: row.filename || index.get(row.sessionId || sessionId),
          timestamp: row.timestamp || new Date(0).toISOString(),
        });
      } catch (err) {
        log.warn(`Skipping invalid feedback line in ${file}`, { detail: err });
      }
    }
  }

  records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return records.slice(0, MAX_FEEDBACK_LOAD);
}

function extractProductTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;:()\-–—]+/)
    .filter((w) => w.length > 2);
}

function overlapScore(
  haystack: string,
  productNames: string[]
): number {
  const text = haystack.toLowerCase();
  let score = 0;
  for (const p of productNames) {
    const pl = p.toLowerCase();
    if (pl.length > 2 && text.includes(pl)) score += 3;
    const tokens = extractProductTokens(pl);
    for (const t of tokens) {
      if (t.length > 3 && text.includes(t)) score += 1;
    }
  }
  return score;
}

function rankExamples(
  records: FeedbackRecord[],
  filename: string,
  productNames: string[],
  verdict: SuggestionFeedbackVerdict
): RankedExample[] {
  const filtered = records.filter((r) => r.verdict === verdict);
  const ranked: RankedExample[] = filtered.map((r) => {
    let score = overlapScore(`${r.title} ${r.description}`, productNames);
    if (r.filename === filename) score += 5;
    if (r.filename && r.filename !== filename) score += 1;
    return {
      title: r.title,
      description: r.description,
      score,
      filename: r.filename,
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const unique: RankedExample[] = [];
  for (const ex of ranked) {
    const key = ex.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ex);
    if (unique.length >= MAX_POSITIVE_IN_PROMPT) break;
  }
  return unique;
}

/**
 * Vector-less RAG: przykłady approve + lista reject dla pliku.
 */
export async function buildStrategistKnowledgeContext(
  filename: string,
  productNames: string[]
): Promise<string> {
  const sessionIndex = await buildSessionFilenameIndex();
  const allFeedback = await loadAllFeedback(sessionIndex);
  const parts: string[] = [];

  const positive = rankExamples(allFeedback, filename, productNames, "approve");
  if (positive.length > 0) {
    parts.push("Przykłady udanych analiz z przeszłości (użytkownik zatwierdził):");
    positive.forEach((ex, i) => {
      parts.push(
        `${i + 1}. «${ex.title}» — ${ex.description.slice(0, 220)}${ex.description.length > 220 ? "…" : ""}`
      );
    });
  }

  const rejected = rankExamples(allFeedback, filename, productNames, "reject").filter(
    (ex) => ex.score >= 2 || allFeedback.some(
      (f) => f.verdict === "reject" && f.filename === filename && f.title === ex.title
    )
  );
  const rejectedForFile = allFeedback.filter(
    (f) => f.verdict === "reject" && f.filename === filename
  );
  const rejectTitles = [
    ...new Set([
      ...rejectedForFile.map((r) => r.title),
      ...rejected.filter((r) => r.filename === filename).map((r) => r.title),
    ]),
  ].slice(0, MAX_REJECT_IN_PROMPT);

  if (rejectTitles.length > 0) {
    parts.push(
      "Użytkownik wcześniej odrzucił te pomysły dla tego pliku. Nie powtarzaj ich — zaproponuj coś innego:"
    );
    rejectTitles.forEach((t, i) => parts.push(`${i + 1}. ${t}`));
  }

  if (!parts.length) return "";

  let body = parts.join("\n");
  if (body.length > MAX_KNOWLEDGE_CONTEXT_CHARS) {
    body = `${body.slice(0, MAX_KNOWLEDGE_CONTEXT_CHARS)}… [ucięte do limitu promptu]`;
  }
  return `\n\n--- Baza wiedzy (RLHF) ---\n${body}\n--- Koniec bazy wiedzy ---`;
}
