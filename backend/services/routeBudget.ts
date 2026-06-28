import type { RoutePlanStop } from "../shared/api-types";
import {
  DEFAULT_VISIT_MINUTES,
  ROUTE_BASE_CITY,
  WORK_DAY_MINUTES,
  estimateLeg,
  resolveCityCoords,
} from "./routeMatrix";

export { WORK_DAY_MINUTES, DEFAULT_VISIT_MINUTES };

export const ROUTE_SHORTENED_RETURN_WARNING =
  "Trasa skrócona, aby umożliwić powrót do bazy przed 16:00";

/** Godziny dostępności klientów B2B */
export const BUSINESS_HOURS_OPEN = "08:00";
export const BUSINESS_HOURS_CLOSE = "16:30";
/** Próg ostrzeżenia wizyty (po tej godzinie — czerwony wiersz) */
export const BUSINESS_LATE_ARRIVAL_THRESHOLD = "16:00";
/** Docelowy powrót do bazy */
export const TARGET_BASE_RETURN_BY = "16:00";

const DAY_START_HOUR = 8;
const DAY_START_MINUTE = 0;

export function isBaseStop(stop: Pick<RoutePlanStop, "city" | "visitGoal">): boolean {
  const goal = String(stop.visitGoal || "").toLowerCase();
  return (
    stop.city === ROUTE_BASE_CITY ||
    goal.includes("baza") ||
    goal.includes("start") ||
    goal.includes("powrót")
  );
}

export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Odcinek powrotny: ostatni klient → Olsztyn */
export function getReturnLegMinutes(visitStops: RoutePlanStop[]): number {
  if (!visitStops.length) return 0;
  const last = visitStops[visitStops.length - 1].city;
  const leg = estimateLeg(last, ROUTE_BASE_CITY);
  if ("error" in leg) return 0;
  return Math.round(leg.driveTimeHours * 60);
}

/**
 * Suma minut dnia: jazda (wszystkie odcinki + obowiązkowy powrót do Olsztyna) + wizyty×45.
 */
export function computeDayBudgetMinutes(visitStops: RoutePlanStop[]): {
  drivingMinutes: number;
  visitMinutes: number;
  returnMinutes: number;
  totalMinutes: number;
} {
  let drivingMinutes = 0;
  let prev = ROUTE_BASE_CITY;

  for (const stop of visitStops) {
    const leg = estimateLeg(prev, stop.city);
    drivingMinutes +=
      "error" in leg
        ? Math.round((stop.driveTimeHoursFromPrevious || 0) * 60)
        : Math.round(leg.driveTimeHours * 60);
    prev = stop.city;
  }

  const returnMinutes = getReturnLegMinutes(visitStops);
  drivingMinutes += returnMinutes;

  const visitMinutes = visitStops.reduce(
    (s, x) => s + (x.visitDurationMinutes ?? DEFAULT_VISIT_MINUTES),
    0
  );

  return {
    drivingMinutes,
    visitMinutes,
    returnMinutes,
    totalMinutes: drivingMinutes + visitMinutes,
  };
}

/**
 * Usuwa ostatnich klientów, aż (jazda + powrót do Olsztyna + wizyty) ≤ 480 min.
 */
export function trimStopsToDayBudget(visitStops: RoutePlanStop[]): {
  stops: RoutePlanStop[];
  removed: RoutePlanStop[];
  budgetWarning?: string;
  routeShortenedForReturn: boolean;
} {
  const removed: RoutePlanStop[] = [];
  const working = [...visitStops];
  let routeShortenedForReturn = false;

  while (working.length > 0) {
    const { totalMinutes } = computeDayBudgetMinutes(working);
    if (totalMinutes <= WORK_DAY_MINUTES) {
      return { stops: working, removed, routeShortenedForReturn };
    }
    const dropped = working.pop();
    if (dropped) {
      removed.unshift(dropped);
      routeShortenedForReturn = true;
    }
  }

  return {
    stops: [],
    removed,
    routeShortenedForReturn,
    budgetWarning: `Brak możliwości zmieszczenia trasy w ${WORK_DAY_MINUTES} min (z powrotem do Olsztyna) — skróć klastr.`,
  };
}

export function sortVisitStopsGeographically(
  visitStops: RoutePlanStop[]
): RoutePlanStop[] {
  if (visitStops.length <= 1) return visitStops;

  const remaining = [...visitStops];
  const ordered: RoutePlanStop[] = [];
  let current = ROUTE_BASE_CITY;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestMinutes = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const leg = estimateLeg(current, remaining[i].city);
      const minutes =
        "error" in leg
          ? (remaining[i].driveTimeHoursFromPrevious || 2) * 60
          : leg.driveTimeHours * 60;
      if (minutes < bestMinutes) {
        bestMinutes = minutes;
        bestIdx = i;
      }
    }

    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = next.city;
  }

  return ordered;
}

export function applyLegTimingsToVisitStops(visitStops: RoutePlanStop[]): RoutePlanStop[] {
  let prev = ROUTE_BASE_CITY;
  return visitStops.map((stop, i) => {
    const leg = estimateLeg(prev, stop.city);
    prev = stop.city;
    if ("error" in leg) return { ...stop, order: i + 1 };
    return {
      ...stop,
      order: i + 1,
      driveTimeHoursFromPrevious: leg.driveTimeHours,
      driveTimeLabel: leg.driveTimeLabel,
      distanceKmFromPrevious: leg.distanceKm,
      visitDurationMinutes: stop.visitDurationMinutes ?? DEFAULT_VISIT_MINUTES,
    };
  });
}

export function formatArrivalTime(totalMinutesFromStart: number): string {
  const m = DAY_START_MINUTE + totalMinutesFromStart;
  const h = DAY_START_HOUR + Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function computeArrivalSchedule(visitStops: RoutePlanStop[]): RoutePlanStop[] {
  let clock = 0;
  let prev = ROUTE_BASE_CITY;
  return visitStops.map((stop) => {
    const leg = estimateLeg(prev, stop.city);
    const driveMin =
      "error" in leg
        ? Math.round((stop.driveTimeHoursFromPrevious || 0) * 60)
        : Math.round(leg.driveTimeHours * 60);
    clock += driveMin;
    const arrivalTime = formatArrivalTime(clock);
    const visitMin = stop.visitDurationMinutes ?? DEFAULT_VISIT_MINUTES;
    clock += visitMin;
    prev = stop.city;
    return { ...stop, arrivalTime };
  });
}

/** Szac. godzina powrotu do bazy (ostatni klient → Olsztyn, po ostatniej wizycie) */
export function computeBaseReturnArrivalTime(visitStops: RoutePlanStop[]): string {
  let clock = 0;
  let prev = ROUTE_BASE_CITY;
  for (const stop of visitStops) {
    const leg = estimateLeg(prev, stop.city);
    clock +=
      "error" in leg
        ? Math.round((stop.driveTimeHoursFromPrevious || 0) * 60)
        : Math.round(leg.driveTimeHours * 60);
    clock += stop.visitDurationMinutes ?? DEFAULT_VISIT_MINUTES;
    prev = stop.city;
  }
  clock += getReturnLegMinutes(visitStops);
  return formatArrivalTime(clock);
}

export function applyBusinessHoursFlags(visitStops: RoutePlanStop[]): {
  stops: RoutePlanStop[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const lateThreshold = parseTimeToMinutes(BUSINESS_LATE_ARRIVAL_THRESHOLD)!;
  const closeMinutes = parseTimeToMinutes(BUSINESS_HOURS_CLOSE)!;

  const stops = visitStops.map((stop) => {
    const arrival = stop.arrivalTime;
    if (!arrival) return stop;
    const mins = parseTimeToMinutes(arrival);
    if (mins == null) return stop;

    let afterBusinessHours = false;
    if (mins > lateThreshold) {
      afterBusinessHours = true;
      warnings.push(
        `Wizyta u klienta ${stop.clientName} (${stop.city}) może odbyć się po godzinach pracy (planowany dojazd ${arrival}, dostępność ${BUSINESS_HOURS_OPEN}–${BUSINESS_HOURS_CLOSE}).`
      );
    } else if (mins + (stop.visitDurationMinutes ?? DEFAULT_VISIT_MINUTES) > closeMinutes) {
      warnings.push(
        `Wizyta u ${stop.clientName} może nie zmieścić się przed zamknięciem biura (${BUSINESS_HOURS_CLOSE}).`
      );
    }

    return { ...stop, afterBusinessHours };
  });

  const returnAt = computeBaseReturnArrivalTime(stops);
  if (returnAt) {
    const returnMins = parseTimeToMinutes(returnAt);
    const targetReturn = parseTimeToMinutes(TARGET_BASE_RETURN_BY)!;
    if (returnMins != null && returnMins > targetReturn) {
      warnings.push(
        `Szacowany powrót do Olsztyna o ${returnAt} — po docelowej ${TARGET_BASE_RETURN_BY} (uwzględniono odcinek powrotny).`
      );
    }
  }

  return { stops, warnings };
}

export function buildClosedRouteStops(visitStops: RoutePlanStop[]): RoutePlanStop[] {
  const baseCoords = resolveCityCoords(ROUTE_BASE_CITY);
  const returnLeg =
    visitStops.length > 0
      ? estimateLeg(visitStops[visitStops.length - 1].city, ROUTE_BASE_CITY)
      : null;
  const returnArrival = computeBaseReturnArrivalTime(visitStops);

  return [
    {
      order: 0,
      city: ROUTE_BASE_CITY,
      clientName: "Baza — start",
      visitGoal: `Wyjazd z Olsztyna (${BUSINESS_HOURS_OPEN})`,
      driveTimeHoursFromPrevious: 0,
      driveTimeLabel: "—",
      distanceKmFromPrevious: 0,
      visitDurationMinutes: 0,
      arrivalTime: formatArrivalTime(0),
      lat: baseCoords?.lat,
      lng: baseCoords?.lng,
    },
    ...visitStops,
    {
      order: visitStops.length + 1,
      city: ROUTE_BASE_CITY,
      clientName: "Baza — powrót",
      visitGoal: `Powrót do Olsztyna (LastClient → Olsztyn)`,
      driveTimeHoursFromPrevious:
        returnLeg && !("error" in returnLeg) ? returnLeg.driveTimeHours : 0,
      driveTimeLabel:
        returnLeg && !("error" in returnLeg) ? returnLeg.driveTimeLabel : undefined,
      distanceKmFromPrevious:
        returnLeg && !("error" in returnLeg) ? returnLeg.distanceKm : 0,
      visitDurationMinutes: 0,
      arrivalTime: returnArrival ?? undefined,
      lat: baseCoords?.lat,
      lng: baseCoords?.lng,
    },
  ];
}

export type FinalizeRouteResult = {
  visitStops: RoutePlanStop[];
  mapStops: RoutePlanStop[];
  drivingMinutes: number;
  visitMinutes: number;
  returnMinutes: number;
  totalMinutes: number;
  fullLoopKm: number;
  warnings: string[];
  metaWarnings: string[];
  removedClients: string[];
};

export function finalizeVisitRoute(
  rawVisitStops: RoutePlanStop[]
): FinalizeRouteResult {
  const warnings: string[] = [];
  const metaWarnings: string[] = [];

  let visitStops = sortVisitStopsGeographically(rawVisitStops);
  visitStops = applyLegTimingsToVisitStops(visitStops);

  const {
    stops: trimmed,
    removed,
    budgetWarning,
    routeShortenedForReturn,
  } = trimStopsToDayBudget(visitStops);

  visitStops = applyLegTimingsToVisitStops(trimmed);

  if (removed.length) {
    if (routeShortenedForReturn) {
      warnings.push(ROUTE_SHORTENED_RETURN_WARNING);
      metaWarnings.push(ROUTE_SHORTENED_RETURN_WARNING);
    }
    warnings.push(
      `Budżet ${WORK_DAY_MINUTES} min (z powrotem do Olsztyna): usunięto ${removed.length} przystanków (${removed.map((r) => r.clientName).join(", ")}).`
    );
  }
  if (budgetWarning) {
    warnings.push(budgetWarning);
    metaWarnings.push(budgetWarning);
  }

  visitStops = computeArrivalSchedule(visitStops);
  const business = applyBusinessHoursFlags(visitStops);
  visitStops = business.stops;
  metaWarnings.push(...business.warnings);

  const { drivingMinutes, visitMinutes, returnMinutes, totalMinutes } =
    computeDayBudgetMinutes(visitStops);

  if (totalMinutes > WORK_DAY_MINUTES) {
    const msg = `Po korekcie nadal ${totalMinutes} min > ${WORK_DAY_MINUTES} min (w tym powrót ${returnMinutes} min).`;
    warnings.push(msg);
    metaWarnings.push(msg);
  }

  const fullLoopKm = computeFullLoopKm(visitStops);

  return {
    visitStops,
    mapStops: buildClosedRouteStops(visitStops),
    drivingMinutes,
    visitMinutes,
    returnMinutes,
    totalMinutes,
    fullLoopKm,
    warnings,
    metaWarnings,
    removedClients: removed.map((r) => r.clientName),
  };
}

function computeFullLoopKm(visitStops: RoutePlanStop[]): number {
  let totalKm = 0;
  let prev = ROUTE_BASE_CITY;
  for (const stop of visitStops) {
    const leg = estimateLeg(prev, stop.city);
    if (!("error" in leg)) totalKm += leg.distanceKm;
    prev = stop.city;
  }
  const returnLeg = estimateLeg(prev, ROUTE_BASE_CITY);
  if (!("error" in returnLeg)) totalKm += returnLeg.distanceKm;
  return Number(totalKm.toFixed(1));
}
