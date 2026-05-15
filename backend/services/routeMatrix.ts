import {
  ROUTE_BASE_CITY,
  WARMIA_MAZURY_CITIES,
  normalizeCityKey,
  resolveCityCoords,
} from "../shared/cityCoords";

export { ROUTE_BASE_CITY, normalizeCityKey, resolveCityCoords };
export const WARMIA_CITY_COORDS = WARMIA_MAZURY_CITIES;

const LOCAL_SPEED_KMH = 60;
const EXPRESS_SPEED_KMH = 90;

/** DK16 / Pojezierze — wolniejsze odcinki na wschód od Olsztyna */
const EAST_LAKE_KEYS = new Set([
  "elk",
  "gizycko",
  "ketrzyn",
  "mrongowo",
  "goldap",
  "mikolajki",
  "wegorzewo",
]);
/** S7 / zachód — szybszy dojazd */
const WEST_S7_KEYS = new Set(["elblag", "ilawa", "braniewo", "ostoda"]);
/** Kierunek północny — drogi regionalne */
const NORTH_KEYS = new Set(["bartoszyce", "lidzbarkwarminski", "dobremiasto"]);

/** Trasy z segmentem S7/S16 (90 km/h) */
const EXPRESS_LEG_KEYS = new Set([
  "olsztyn|elblag",
  "olsztyn|elk",
  "olsztyn|gizycko",
  "olsztyn|ostoda",
  "olsztyn|ilawa",
  "olsztyn|mrongowo",
  "olsztyn|ketrzyn",
  "elblag|ilawa",
  "ostoda|ilawa",
  "mrongowo|ketrzyn",
  "ketrzyn|gizycko",
  "elk|gizycko",
]);

export type RoadCorridor = "east_lakes" | "west_s7" | "north" | "standard";

export type RouteMatrixLeg = {
  from: string;
  to: string;
  distanceKm: number;
  driveTimeHours: number;
  driveTimeLabel: string;
  roadProfile: "local" | "express";
  /** Mnożnik czasu (Mazury / S7) */
  roadDifficultyMultiplier?: number;
  roadCorridor?: RoadCorridor;
};

export type RouteMatrixResult = {
  baseCity: string;
  legs: RouteMatrixLeg[];
  /** Skrót: z bazy do każdego miasta */
  fromBase: Record<string, { distanceKm: number; driveTimeLabel: string; driveTimeHours: number }>;
  maxReachHoursOneWay: number;
  note: string;
};

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function legKey(a: string, b: string): string {
  const keys = [normalizeCityKey(a), normalizeCityKey(b)].sort();
  return `${keys[0]}|${keys[1]}`;
}

function usesExpressRoad(a: string, b: string, distanceKm: number): boolean {
  if (EXPRESS_LEG_KEYS.has(legKey(a, b))) return true;
  return distanceKm >= 55;
}

export function corridorForCity(cityName: string): RoadCorridor {
  const k = normalizeCityKey(cityName);
  if (EAST_LAKE_KEYS.has(k)) return "east_lakes";
  if (WEST_S7_KEYS.has(k)) return "west_s7";
  if (NORTH_KEYS.has(k)) return "north";
  return "standard";
}

/**
 * Mnożnik czasu jazdy (nie km): Mazury wschód 1.2, S7 zachód 0.9, północ 1.1.
 */
export function roadDifficultyTimeMultiplier(fromCity: string, toCity: string): number {
  const fromC = corridorForCity(fromCity);
  const toC = corridorForCity(toCity);
  if (fromC === "east_lakes" || toC === "east_lakes") return 1.2;
  if (fromC === "west_s7" && toC === "west_s7") return 0.9;
  if (toC === "west_s7" || fromC === "west_s7") return 0.9;
  if (fromC === "north" || toC === "north") return 1.1;
  return 1;
}

function formatDriveLabel(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `~${m} min`;
  if (m === 0) return `~${h}h`;
  return `~${h}h ${m}min`;
}

export function estimateLeg(
  fromCity: string,
  toCity: string
): RouteMatrixLeg | { error: string } {
  const from = resolveCityCoords(fromCity);
  const to = resolveCityCoords(toCity);
  if (!from || !to) {
    return { error: `Nieznane miasto w bazie regionu: ${fromCity} → ${toCity}` };
  }
  const roadKm = Number((haversineKm(from.lat, from.lng, to.lat, to.lng) * 1.18).toFixed(1));
  const express = usesExpressRoad(from.label, to.label, roadKm);
  const speed = express ? EXPRESS_SPEED_KMH : LOCAL_SPEED_KMH;
  const baseHours = roadKm / speed;
  const multiplier = roadDifficultyTimeMultiplier(from.label, to.label);
  const driveTimeHours = Number((baseHours * multiplier).toFixed(2));
  const corridor =
    corridorForCity(to.label) !== "standard"
      ? corridorForCity(to.label)
      : corridorForCity(from.label);
  return {
    from: from.label,
    to: to.label,
    distanceKm: roadKm,
    driveTimeHours,
    driveTimeLabel: formatDriveLabel(driveTimeHours),
    roadProfile: express ? "express" : "local",
    roadDifficultyMultiplier: multiplier,
    roadCorridor: corridor,
  };
}

/**
 * Macierz czasów/dystansów z Olsztyna i między wskazanymi miastami.
 */
export function calculateRouteMatrix(locations: string[]): RouteMatrixResult {
  const unique = new Map<string, string>();
  unique.set(normalizeCityKey(ROUTE_BASE_CITY), ROUTE_BASE_CITY);
  for (const loc of locations) {
    const t = String(loc || "").trim();
    if (!t) continue;
    unique.set(normalizeCityKey(t), t);
  }

  const cities = [...unique.values()];
  const legs: RouteMatrixLeg[] = [];
  const fromBase: RouteMatrixResult["fromBase"] = {};

  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const result = estimateLeg(cities[i], cities[j]);
      if ("error" in result) continue;
      legs.push(result);
      if (normalizeCityKey(cities[i]) === normalizeCityKey(ROUTE_BASE_CITY)) {
        fromBase[result.to] = {
          distanceKm: result.distanceKm,
          driveTimeLabel: result.driveTimeLabel,
          driveTimeHours: result.driveTimeHours,
        };
      }
      if (normalizeCityKey(cities[j]) === normalizeCityKey(ROUTE_BASE_CITY)) {
        fromBase[result.from] = {
          distanceKm: result.distanceKm,
          driveTimeLabel: result.driveTimeLabel,
          driveTimeHours: result.driveTimeHours,
        };
      }
    }
  }

  const maxReach = Math.max(
    0,
    ...Object.values(fromBase).map((v) => v.driveTimeHours)
  );

  return {
    baseCity: ROUTE_BASE_CITY,
    legs,
    fromBase,
    maxReachHoursOneWay: Number(maxReach.toFixed(2)),
    note:
      "Szacunek: 60/90 km/h + mnożniki Mazur (wschód DK16 ×1.2, S7 zachód ×0.9, północ ×1.1). Dzień: 480 min (jazda + wizyty×45).",
  };
}

export const WORK_DAY_MINUTES = 480;
export const MAX_DRIVING_HOURS_PER_DAY = 4;
export const MAX_ONE_WAY_HOURS_FROM_BASE = 2;
export const VISIT_BLOCK_HOURS = 4;
export const DEFAULT_VISIT_MINUTES = 45;
export const FUEL_PLN_PER_KM = 0.52;

/** Dystans pełnej pętli: Olsztyn → wizyty → Olsztyn (km, do paliwa) */
export function computeFullLoopDistanceKm(visitCities: string[]): number {
  if (!visitCities.length) return 0;
  let totalKm = 0;
  let prev = ROUTE_BASE_CITY;
  for (const city of visitCities) {
    const leg = estimateLeg(prev, city);
    if (!("error" in leg)) totalKm += leg.distanceKm;
    prev = city;
  }
  const returnLeg = estimateLeg(prev, ROUTE_BASE_CITY);
  if (!("error" in returnLeg)) totalKm += returnLeg.distanceKm;
  return Number(totalKm.toFixed(1));
}
