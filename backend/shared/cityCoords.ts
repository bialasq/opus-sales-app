/**
 * Współrzędne miast woj. warmińsko-mazurskiego (wspólne backend + frontend).
 */

export type CityCoord = { lat: number; lng: number; label: string };

export const ROUTE_BASE_CITY = "Olsztyn";

/** Klucz = znormalizowana nazwa (bez diakrytyków, małe litery) */
export const WARMIA_MAZURY_CITIES: Record<string, CityCoord> = {
  olsztyn: { lat: 53.7784, lng: 20.4801, label: "Olsztyn" },
  elblag: { lat: 54.1522, lng: 19.4088, label: "Elbląg" },
  elk: { lat: 53.828, lng: 22.3647, label: "Ełk" },
  gizycko: { lat: 54.038, lng: 21.7644, label: "Giżycko" },
  ilawa: { lat: 53.5986, lng: 19.5685, label: "Iława" },
  ostoda: { lat: 53.6969, lng: 19.9649, label: "Ostróda" },
  mrongowo: { lat: 53.8647, lng: 21.3045, label: "Mrągowo" },
  ketrzyn: { lat: 54.0766, lng: 21.3753, label: "Kętrzyn" },
  bartoszyce: { lat: 54.2535, lng: 20.8082, label: "Bartoszyce" },
  lidzbarkwarminski: { lat: 54.1258, lng: 20.5795, label: "Lidzbark Warmiński" },
  dobremiasto: { lat: 53.9867, lng: 20.3844, label: "Dobre Miasto" },
  braniewo: { lat: 54.3793, lng: 19.8252, label: "Braniewo" },
  goldap: { lat: 54.2939, lng: 22.2952, label: "Gołdap" },
  mikolajki: { lat: 53.8028, lng: 21.5701, label: "Mikołajki" },
  wegorzewo: { lat: 54.2158, lng: 21.7374, label: "Węgorzewo" },
  morag: { lat: 53.917, lng: 19.926, label: "Morąg" },
  paslek: { lat: 54.061, lng: 19.657, label: "Pasłęk" },
  nidzica: { lat: 53.3606, lng: 20.4275, label: "Nidzica" },
  szczytno: { lat: 53.5628, lng: 20.9856, label: "Szczytno" },
};

/** Granice geograficzne województwa (na podstawie miast w bazie) */
export const WARMIA_REGION_BOUNDS = (() => {
  const coords = Object.values(WARMIA_MAZURY_CITIES);
  return {
    minLat: Math.min(...coords.map((c) => c.lat)),
    maxLat: Math.max(...coords.map((c) => c.lat)),
    minLng: Math.min(...coords.map((c) => c.lng)),
    maxLng: Math.max(...coords.map((c) => c.lng)),
  };
})();

export const SVG_MAP_WIDTH = 400;
export const SVG_MAP_HEIGHT = 400;
export const SVG_MAP_PADDING = 28;

export function normalizeCityKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]/g, "");
}

export function resolveCityCoords(cityName: string): CityCoord | null {
  const key = normalizeCityKey(cityName);
  if (WARMIA_MAZURY_CITIES[key]) return WARMIA_MAZURY_CITIES[key];
  for (const [, v] of Object.entries(WARMIA_MAZURY_CITIES)) {
    if (normalizeCityKey(v.label) === key) return v;
  }
  return null;
}

/**
 * Projekcja lat/lng → piksele SVG (północ u góry, wschód w prawo).
 */
export function projectWarmiaToSvg(
  lat: number,
  lng: number,
  options?: {
    width?: number;
    height?: number;
    padding?: number;
    bounds?: typeof WARMIA_REGION_BOUNDS;
  }
): { x: number; y: number } {
  const width = options?.width ?? SVG_MAP_WIDTH;
  const height = options?.height ?? SVG_MAP_HEIGHT;
  const padding = options?.padding ?? SVG_MAP_PADDING;
  const b = options?.bounds ?? WARMIA_REGION_BOUNDS;

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const x = padding + ((lng - b.minLng) / (b.maxLng - b.minLng)) * innerW;
  const y = padding + ((b.maxLat - lat) / (b.maxLat - b.minLat)) * innerH;
  return { x: Math.round(x), y: Math.round(y) };
}
