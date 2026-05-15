import { normalizeCityKey } from "./routeMatrix";

export type FerryCheckResult = {
  ok: boolean;
  warnings: string[];
  /** Sugerowany narzut ponad macierz (minuty) */
  extraMinutesSuggested: number;
  notes: string[];
};

type RouteInput = string[] | { cities?: string[]; route?: string[] };

function parseCities(input: RouteInput): string[] {
  if (Array.isArray(input)) return input.map((c) => String(c).trim()).filter(Boolean);
  const list = input.cities ?? input.route ?? [];
  return list.map((c) => String(c).trim()).filter(Boolean);
}

/** Znane wąskie gardła Warmii i Mazur (promy, mosty sezonowe) */
const FERRY_HOTSPOTS: {
  id: string;
  match: string[];
  message: string;
  extraMinutes: number;
}[] = [
  {
    id: "niegocin_mikolajki",
    match: ["mikolajki", "gizycko"],
    message:
      "Odcinek Giżycko–Mikołajki: możliwa przeprawa promowa na Jeziorze Niegocin (sezonowo +15–25 min poza szacunkiem macierzy).",
    extraMinutes: 20,
  },
  {
    id: "wegorzewo_peninsula",
    match: ["wegorzewo", "gizycko"],
    message:
      "Trasa przez Półwysep Giżycki/Węgorzewo: w sezonie kolejki na promy jeziorne — zaplanuj bufor.",
    extraMinutes: 25,
  },
  {
    id: "elk_lake_detour",
    match: ["elk", "gizycko"],
    message:
      "Ełk ↔ Giżycko: omijanie zatok (DK16 + lokalne) — realny czas bywa dłuższy niż linia prosta; mnożnik Mazur już to częściowo uwzględnia.",
    extraMinutes: 15,
  },
  {
    id: "ostrada_lake",
    match: ["ostrada", "mrongowo"],
    message:
      "Ostróda–Mrągowo: odcinki wzdłuż jezior — możliwe zwężenia i sezonowy ruch turystyczny.",
    extraMinutes: 10,
  },
];

/**
 * Ostrzeżenia o promach / mostach sezonowych na trasie warmińsko-mazurskiej.
 */
export function checkBridgeAndFerry(route: RouteInput): FerryCheckResult {
  const cities = parseCities(route);
  const keys = new Set(cities.map(normalizeCityKey));
  const warnings: string[] = [];
  const notes: string[] = [];
  let extraMinutesSuggested = 0;

  for (const spot of FERRY_HOTSPOTS) {
    const hit = spot.match.every((m) => keys.has(normalizeCityKey(m)));
    if (hit) {
      warnings.push(spot.message);
      extraMinutesSuggested += spot.extraMinutes;
      notes.push(spot.id);
    }
  }

  if (keys.has("gizycko") && (keys.has("ketrzyn") || keys.has("mrongowo"))) {
    warnings.push(
      "Klaster wschodni (Mrągowo/Kętrzyn/Giżycko): rozważ checkBridgeAndFerry przed finalizacją — drogi przez Pojezierze bywają wolniejsze niż S7."
    );
    extraMinutesSuggested += 10;
    notes.push("east_lake_cluster");
  }

  return {
    ok: warnings.length === 0,
    warnings,
    extraMinutesSuggested,
    notes,
  };
}
