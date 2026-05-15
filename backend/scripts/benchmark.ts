/**
 * Benchmark agenta AI — czas i koszt jednej analizy.
 * Użycie: npm run benchmark -- [nazwa_pliku_w_uploads]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getAiInsightsForFile } from "../services/aiService";

async function main(): Promise<void> {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  const argFile = process.argv[2];
  let filename = argFile;

  if (!filename) {
    const files = fs
      .readdirSync(uploadsDir)
      .filter((f) => /\.(xlsx|xls)$/i.test(f));
    if (!files.length) {
      console.error("Brak plików .xlsx w backend/uploads/. Wgraj plik lub podaj nazwę:");
      console.error("  npm run benchmark -- moj_plik.xlsx");
      process.exit(1);
    }
    filename = files.sort(
      (a, b) =>
        fs.statSync(path.join(uploadsDir, b)).mtimeMs -
        fs.statSync(path.join(uploadsDir, a)).mtimeMs
    )[0];
    console.log(`Auto-wybrany plik: ${filename}`);
  }

  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`Nie znaleziono: ${filePath}`);
    process.exit(1);
  }

  console.log("--- Opus Sales AI Benchmark ---");
  console.log(`Plik: ${filename}`);
  console.log(`Provider: ${process.env.AI_PROVIDER || "(auto)"}`);
  console.log(`Prompt: ${process.env.AGENT_PROMPT_VERSION || "agent_v2"}`);
  console.log("Uruchamianie analizy (skip cache)…\n");

  const start = Date.now();
  const result = await getAiInsightsForFile(filename, { skipCache: true });
  const elapsed = Date.now() - start;

  console.log("--- Wynik ---");
  console.log(`Czas wall-clock: ${elapsed} ms`);
  console.log(`meta.latency_ms: ${result.meta.latency_ms ?? "—"}`);
  console.log(`meta.cost_usd: $${result.meta.cost_usd ?? 0}`);
  console.log(`meta.total_tokens: ${result.meta.total_tokens ?? "—"}`);
  console.log(`Sugestie: ${result.suggestions.length}`);
  console.log(
    `Eval: ${result.meta.evalSummary?.verified ?? "—"} OK, ${result.meta.evalSummary?.potential_hallucination ?? 0} halucynacji`
  );
  console.log(`Orchestration: ${result.meta.orchestration ?? "—"}`);
  if (result.meta.partial) {
    console.log(`UWAGA: partial (${result.meta.partialReason})`);
  }
  console.log("\nBenchmark zakończony.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
