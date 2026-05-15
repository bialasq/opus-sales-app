import {
  analyzeSalesFromFile,
  analyzeVisitsFromFile,
  extractVisitRows,
  readWorkbookFromUploads,
} from "./salesMetrics";
import {
  calculateRouteMatrix,
  MAX_ONE_WAY_HOURS_FROM_BASE,
  resolveCityCoords,
  ROUTE_BASE_CITY,
} from "./routeMatrix";

export type RouteVisitCandidate = {
  clientNip: string;
  clientName: string;
  city: string;
  priorityScore: number;
  priorityLabel: "high" | "medium" | "low";
  visitGoal: string;
  region?: string;
  reachableFromBase: boolean;
  driveTimeFromBaseLabel?: string;
  driveTimeFromBaseHours?: number;
};

function getCityFromRow(row: Record<string, unknown>): string {
  return String(
    row["Miejscowość"] ?? row["Miasto"] ?? row["City"] ?? row["Lokalizacja"] ?? ""
  ).trim();
}

function priorityFromOpis(opis: string): { score: number; label: "high" | "medium" | "low" } {
  const d = opis.toLowerCase();
  if (d.includes("niezainteresowany") || d.includes("rezygnacja")) {
    return { score: 25, label: "low" };
  }
  if (d.includes("zainteresowany") || d.includes("oferta")) {
    return { score: 90, label: "high" };
  }
  if (d.includes("spadek") || d.includes("reklamacja")) {
    return { score: 85, label: "high" };
  }
  return { score: 55, label: "medium" };
}

/**
 * Kandydaci do trasy z arkusza Wizyty (+ wzbogacenie o Sprzedaż).
 */
export function buildRouteVisitCandidates(filename: string): {
  baseCity: string;
  candidates: RouteVisitCandidate[];
  matrixNote: string;
} {
  const rows = extractVisitRows(readWorkbookFromUploads(filename));
  const visitAnalysis = analyzeVisitsFromFile(filename);
  const sales = analyzeSalesFromFile(filename);
  const byCustomer = sales.salesByCustomer || {};

  const byKey = new Map<string, RouteVisitCandidate>();

  for (const row of rows) {
    const nip = String(row["Klient_NIP"] ?? "").trim();
    if (!nip) continue;
    const city = getCityFromRow(row);
    if (!city) continue;

    const opis = String(row["Opis"] ?? "");
    const fromOpis = priorityFromOpis(opis);
    const priorities = visitAnalysis.customerPriorities as Record<string, string> | undefined;
    const fromVisitPriority = priorities?.[nip];
    let score = fromOpis.score;
    if (fromVisitPriority === "wysoki") score = Math.max(score, 88);
    if (fromVisitPriority === "niski") score = Math.min(score, 30);

    const cust = byCustomer[nip];
    if (cust) {
      score += Math.min(20, Math.round(cust.revenue / 50_000));
      if (cust.orders <= 2) score += 15;
    }

    const name =
      String(row["Klient_Nazwa"] ?? cust?.name ?? `Klient ${nip}`).trim() || `Klient ${nip}`;
    const region = String(row["Województwo"] ?? "").trim() || undefined;
    const key = `${nip}|${city}`;

    const existing = byKey.get(key);
    if (!existing || score > existing.priorityScore) {
      byKey.set(key, {
        clientNip: nip,
        clientName: name,
        city,
        priorityScore: score,
        priorityLabel: score >= 75 ? "high" : score >= 45 ? "medium" : "low",
        visitGoal:
          score >= 75
            ? "Wysoki priorytet — utrzymanie / odzyskanie obrotów"
            : "Rutynowa wizyta handlowa",
        region,
        reachableFromBase: false,
      });
    }
  }

  const cities = [...new Set([...byKey.values()].map((c) => c.city))];
  const matrix = calculateRouteMatrix(cities);

  const candidates = [...byKey.values()]
    .map((c) => {
      const baseLeg = matrix.fromBase[c.city];
      const coords = resolveCityCoords(c.city);
      const reachable =
        baseLeg != null && baseLeg.driveTimeHours <= MAX_ONE_WAY_HOURS_FROM_BASE;
      return {
        ...c,
        reachableFromBase: reachable || coords != null,
        driveTimeFromBaseLabel: baseLeg?.driveTimeLabel,
        driveTimeFromBaseHours: baseLeg?.driveTimeHours,
        priorityScore:
          c.priorityScore +
          (reachable ? 10 : -25) +
          (baseLeg ? Math.max(0, 8 - baseLeg.driveTimeHours) : 0),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    baseCity: ROUTE_BASE_CITY,
    candidates,
    matrixNote: matrix.note,
  };
}
