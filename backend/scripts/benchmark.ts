/**
 * Benchmark agenta AI — czas i koszt jednej analizy.
 * Użycie: npm run benchmark -- [nazwa_pliku_w_uploads]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getAiInsightsForFile } from "../services/aiService";

async function pickLatestUpload(uploadsDir: string): Promise<string> {
  const files = (await fs.promises.readdir(uploadsDir)).filter((f) =>
    /\.(xlsx|xls)$/i.test(f)
  );
  if (!files.length) {
    console.error("Brak plików .xlsx w backend/uploads/. Wgraj plik lub podaj nazwę:");
    console.error("  npm run benchmark -- moj_plik.xlsx");
    process.exit(1);
  }
  const withMtime = await Promise.all(
    files.map(async (name) => {
      const st = await fs.promises.stat(path.join(uploadsDir, name));
      return { name, mtime: st.mtimeMs };
    })
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return withMtime[0].name;
}

async function main(): Promise<void> {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  const argFile = process.argv[2];
  let filename = argFile;

  if (!filename) {
    filename = await pickLatestUpload(uploadsDir);
    console.log(`Auto-wybrany plik: ${filename}`);
  }

  const filePath = path.join(uploadsDir, filename);
  try {
    await fs.promises.access(filePath);
  } catch {
    console.error(`Nie znaleziono: ${filePath}`);
    process.exit(1);
  }

  console.log("--- Opus Sales AI Benchmark ---");
  console.log(`Plik: ${filename}`);
  console.log(`Provider: ${process.env.AI_PROVIDER || "(auto)"}`);
  console.log(`Prompt: ${process.env.AGENT_PROMPT_VERSION || "agent_v2"}`);
  console.log("Uruchamianie analizy (skip cache)…\n");

  const orgId =
    process.env.BENCHMARK_ORG_ID?.trim() || process.argv[3]?.trim() || "";
  if (!orgId) {
    console.error(
      "Brak organizationId. Ustaw BENCHMARK_ORG_ID lub podaj jako 3. argument:"
    );
    console.error("  npm run benchmark -- moj_plik.xlsx org_moj_id");
    process.exit(1);
  }

  const start = Date.now();
  const result = await getAiInsightsForFile(filename, orgId, { skipCache: true });
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
