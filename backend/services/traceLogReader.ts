import fs from "fs/promises";
import path from "path";
import { createLogger } from "./appLogger";

const log = createLogger("traceLogReader");

export const TRACES_DIR = path.join(__dirname, "..", "logs", "traces");

export type TraceJsonSummary = {
  timestamp: string;
  filename?: string;
  cost_usd: number;
  latency_ms: number;
  total_tokens: number;
  from_cache?: boolean;
  eval_hallucinations?: number;
};

type TraceJsonFile = {
  timestamp?: string;
  filename?: string;
  cost_usd?: number;
  latency_ms?: number;
  total_tokens?: number;
  sessionID?: string;
  meta?: { from_cache?: boolean; cache_hit?: boolean };
  eval_summary?: { potential_hallucination?: number };
};

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function tracesDirectoryExists(): Promise<boolean> {
  try {
    await fs.access(TRACES_DIR);
    return true;
  } catch (err) {
    if (isEnoent(err)) {
      return false;
    }
    log.warn("Could not access traces directory", { detail: err });
    return false;
  }
}

async function listTraceFilenames(): Promise<string[]> {
  if (!(await tracesDirectoryExists())) {
    return [];
  }
  try {
    return await fs.readdir(TRACES_DIR);
  } catch (err) {
    log.warn("Could not list traces directory", { detail: err });
    return [];
  }
}

function parseTraceJsonFile(
  file: string,
  raw: string
): TraceJsonSummary | null {
  try {
    const data = JSON.parse(raw) as TraceJsonFile;
    return {
      timestamp: data.timestamp || file,
      filename: data.filename,
      cost_usd: data.cost_usd ?? 0,
      latency_ms: data.latency_ms ?? 0,
      total_tokens: data.total_tokens ?? 0,
      from_cache: Boolean(data.meta?.from_cache || data.meta?.cache_hit),
      eval_hallucinations: data.eval_summary?.potential_hallucination ?? 0,
    };
  } catch (err) {
    log.warn(`Skipping invalid trace JSON: ${file}`, { detail: err });
    return null;
  }
}

/**
 * Reads agent trace JSON files from logs/traces (non-blocking).
 */
export async function readTraceJsonSummaries(): Promise<TraceJsonSummary[]> {
  const files = await listTraceFilenames();
  const out: TraceJsonSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file.includes("feedback")) {
      continue;
    }
    const filePath = path.join(TRACES_DIR, file);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const entry = parseTraceJsonFile(file, raw);
      if (entry) {
        out.push(entry);
      }
    } catch (err) {
      if (isEnoent(err)) {
        log.warn(`Trace file disappeared while reading: ${file}`);
        continue;
      }
      log.warn(`Could not read trace file: ${file}`, { detail: err });
    }
  }

  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Maps sessionID → filename from trace JSON files.
 */
export async function buildSessionFilenameIndex(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const files = await listTraceFilenames();

  for (const file of files) {
    if (!file.endsWith(".json") || file.includes("feedback")) {
      continue;
    }
    const filePath = path.join(TRACES_DIR, file);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw) as TraceJsonFile;
      if (data.sessionID && data.filename) {
        map.set(data.sessionID, data.filename);
      }
    } catch (err) {
      if (isEnoent(err)) {
        log.warn(`Trace file disappeared while indexing: ${file}`);
        continue;
      }
      log.warn(`Could not index trace file: ${file}`, { detail: err });
    }
  }

  return map;
}

/**
 * Reads raw non-empty lines from a feedback JSONL file.
 */
export async function readFeedbackJsonlLines(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.split("\n").filter(Boolean);
  } catch (err) {
    if (isEnoent(err)) {
      log.warn(`Feedback file not found: ${filePath}`);
      return [];
    }
    log.warn(`Could not read feedback file: ${filePath}`, { detail: err });
    return [];
  }
}
