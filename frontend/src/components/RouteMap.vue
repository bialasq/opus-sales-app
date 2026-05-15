<template>
  <div class="route-map-wrap">
    <svg
      v-if="loopPoints.length"
      class="route-map-svg"
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      role="img"
      aria-label="Mapa trasy warmińsko-mazurskiej — pętla z Olsztyna"
    >
      <rect :width="svgWidth" :height="svgHeight" fill="#f0f4f8" rx="8" />
      <polyline
        :points="polylinePoints"
        fill="none"
        stroke="#409eff"
        stroke-width="3"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <g v-for="(p, idx) in loopPoints" :key="`${p.city}-${idx}`">
        <circle
          :cx="p.x"
          :cy="p.y"
          :r="p.isBase ? 9 : 7"
          :fill="p.isBase ? '#67c23a' : p.afterHours ? '#f56c6c' : '#409eff'"
          stroke="#fff"
          stroke-width="2"
          class="route-point"
        >
          <title>{{ p.tooltip }}</title>
        </circle>
        <text
          :x="p.x"
          :y="p.y - 12"
          text-anchor="middle"
          font-size="11"
          :fill="p.afterHours ? '#f56c6c' : '#303133'"
        >
          {{ p.city }}
        </text>
      </g>
    </svg>
    <el-empty v-else description="Brak punktów trasy do wyświetlenia" />

    <el-table
      v-if="tableRows.length"
      :data="tableRows"
      size="small"
      stripe
      class="route-table"
      :row-class-name="tableRowClassName"
    >
      <el-table-column prop="arrivalTime" label="Godzina przyjazdu" width="140">
        <template #default="{ row }">
          <span :class="{ 'arrival-late': row.afterBusinessHours }">
            {{ row.arrivalTime }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="clientName" label="Klient" min-width="140" />
      <el-table-column prop="city" label="Miasto" min-width="110" />
      <el-table-column prop="driveTime" label="Czas dojazdu" width="120" />
      <el-table-column prop="distanceKm" label="Dystans" width="80" />
      <el-table-column prop="visitGoal" label="Cel wizyty" min-width="180" />
    </el-table>
  </div>
</template>

<script>
import { computed } from "vue";
import {
  projectWarmiaToSvg,
  SVG_MAP_WIDTH,
  SVG_MAP_HEIGHT,
} from "@shared/cityCoords";

const DAY_START_MINUTES = 8 * 60;

function isBaseStop(s, baseCity) {
  const goal = String(s.visitGoal || "").toLowerCase();
  return (
    s.city === baseCity ||
    goal.includes("baza") ||
    goal.includes("start") ||
    goal.includes("powrót")
  );
}

function parseDriveMinutes(stop) {
  if (stop.driveTimeHoursFromPrevious) {
    return Math.round(stop.driveTimeHoursFromPrevious * 60);
  }
  const label = String(stop.driveTimeLabel || "");
  const hMatch = label.match(/(\d+)\s*h/);
  const mMatch = label.match(/(\d+)\s*min/);
  let m = 0;
  if (hMatch) m += Number(hMatch[1]) * 60;
  if (mMatch) m += Number(mMatch[1]);
  return m;
}

function formatTime(totalMinutesFromMidnight) {
  const h = Math.floor(totalMinutesFromMidnight / 60);
  const m = totalMinutesFromMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildTooltip(stop, baseCity) {
  if (isBaseStop(stop, baseCity)) {
    return `${stop.city}: ${stop.visitGoal || "Baza"}`;
  }
  const km =
    stop.distanceKmFromPrevious != null
      ? `${Number(stop.distanceKmFromPrevious).toFixed(1)} km`
      : "—";
  return `Klient: ${stop.clientName || "—"}, Planowany dojazd: ${stop.arrivalTime || "—"}, Dystans od poprzedniego: ${km}`;
}

function buildArrivalFallback(visitStops) {
  let clock = 0;
  const rows = [];
  for (const s of visitStops) {
    clock += parseDriveMinutes(s);
    rows.push({
      arrivalTime: formatTime(DAY_START_MINUTES + clock),
      clientName: s.clientName || "—",
      city: s.city,
      driveTime:
        s.driveTimeLabel ||
        (s.driveTimeHoursFromPrevious
          ? `~${s.driveTimeHoursFromPrevious}h`
          : "—"),
      distanceKm:
        s.distanceKmFromPrevious != null
          ? `${Number(s.distanceKmFromPrevious).toFixed(1)}`
          : "—",
      visitGoal: s.visitGoal || "Wizyta handlowa",
      afterBusinessHours: s.afterBusinessHours ?? false,
    });
    clock += s.visitDurationMinutes ?? 45;
  }
  return rows;
}

export default {
  name: "RouteMap",
  props: {
    routePlan: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const svgWidth = SVG_MAP_WIDTH;
    const svgHeight = SVG_MAP_HEIGHT;
    const baseCity = computed(() => props.routePlan?.baseCity || "Olsztyn");

    const allStopsWithCoords = computed(() => {
      const plan = props.routePlan;
      if (!plan?.stops?.length) return [];
      return plan.stops.filter((s) => s.lat != null && s.lng != null);
    });

    const loopPoints = computed(() => {
      const base = baseCity.value;
      const stops = allStopsWithCoords.value;
      if (!stops.length) return [];

      return stops.map((s) => {
        const { x, y } = projectWarmiaToSvg(s.lat, s.lng);
        return {
          city: s.city,
          x,
          y,
          isBase: isBaseStop(s, base),
          afterHours: Boolean(s.afterBusinessHours),
          tooltip: buildTooltip(s, base),
        };
      });
    });

    const polylinePoints = computed(() =>
      loopPoints.value.map((p) => `${p.x},${p.y}`).join(" ")
    );

    const tableRows = computed(() => {
      const visitStops = (props.routePlan?.stops || []).filter(
        (s) => !isBaseStop(s, baseCity.value)
      );
      if (!visitStops.length) return [];

      const hasArrival = visitStops.some((s) => s.arrivalTime);
      if (hasArrival) {
        return visitStops.map((s) => ({
          arrivalTime: s.arrivalTime || "—",
          clientName: s.clientName || "—",
          city: s.city,
          driveTime:
            s.driveTimeLabel ||
            (s.driveTimeHoursFromPrevious
              ? `~${s.driveTimeHoursFromPrevious}h`
              : "—"),
          distanceKm:
            s.distanceKmFromPrevious != null
              ? `${Number(s.distanceKmFromPrevious).toFixed(1)}`
              : "—",
          visitGoal: s.visitGoal || "Wizyta handlowa",
          afterBusinessHours: Boolean(s.afterBusinessHours),
        }));
      }
      return buildArrivalFallback(visitStops);
    });

    const tableRowClassName = ({ row }) =>
      row.afterBusinessHours ? "row-after-hours" : "";

    return {
      svgWidth,
      svgHeight,
      loopPoints,
      polylinePoints,
      tableRows,
      tableRowClassName,
    };
  },
};
</script>

<style scoped>
.route-map-wrap {
  display: block;
}
.route-map-svg {
  width: 100%;
  max-width: 400px;
  height: auto;
  margin-bottom: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.route-point {
  cursor: help;
}
.route-table {
  width: 100%;
}
.arrival-late {
  color: #f56c6c;
  font-weight: 600;
}
:deep(.row-after-hours) {
  background-color: #fef0f0 !important;
}
:deep(.row-after-hours td) {
  color: #c45656;
}
</style>
