<template>
  <section
    class="dashboard-card border-slate-200/90"
    aria-label="Wydajność AI"
  >
    <div class="dashboard-card-header border-slate-100">
      <div>
        <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
          AI Performance
        </h2>
        <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
          Koszty, skuteczność RLHF i wykryte halucynacje (z logów trace)
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <el-button
          size="small"
          plain
          :loading="loading"
          @click="loadStats"
        >
          Odśwież
        </el-button>
        <el-button
          size="small"
          type="warning"
          plain
          :loading="clearing"
          @click="clearCache"
        >
          Wyczyść cache AI
        </el-button>
      </div>
    </div>

    <div v-if="loading && !stats" class="py-6">
      <el-skeleton animated :rows="4" />
    </div>

    <div
      v-else-if="isEmptyStats"
      class="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center"
    >
      <el-empty
        description="Brak logów w traces/ — uruchom analizę AI i zostaw feedback, aby zobaczyć statystyki."
        :image-size="72"
      />
    </div>

    <div v-else-if="stats" class="space-y-6">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div class="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <p class="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
            Średni koszt
          </p>
          <p class="mt-1 text-lg font-semibold text-slate-900">
            ${{ formatCost(stats.avgCostUsd) }}
          </p>
        </div>
        <div class="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <p class="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
            Skuteczność
          </p>
          <p class="mt-1 text-lg font-semibold text-emerald-700">
            {{ stats.approvalRatePercent != null ? `${stats.approvalRatePercent}%` : "—" }}
          </p>
          <p class="text-[0.65rem] text-slate-500">
            {{ stats.approvedCount }}✓ / {{ stats.rejectedCount }}✗
          </p>
        </div>
        <div class="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <p class="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
            Halucynacje (eval)
          </p>
          <p class="mt-1 text-lg font-semibold text-rose-600">
            {{ stats.hallucinationCount ?? 0 }}
          </p>
          <p class="text-[0.65rem] text-slate-500">
            {{ stats.hallucinationRatePercent != null ? `~${stats.hallucinationRatePercent}% runów` : "—" }}
          </p>
        </div>
        <div class="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <p class="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
            Śr. czas / cache
          </p>
          <p class="mt-1 text-lg font-semibold text-slate-900">
            {{ stats.avgLatencyMs ?? 0 }} ms
          </p>
          <p class="text-[0.65rem] text-slate-500">{{ stats.cacheEntries ?? 0 }} wpisów cache</p>
        </div>
      </div>

      <div v-if="(stats.recentRuns || []).length" class="rounded-xl border border-slate-100 p-4">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Ostatnie uruchomienia
        </p>
        <el-table :data="stats.recentRuns || []" size="small" stripe class="w-full">
          <el-table-column prop="timestamp" label="Czas" min-width="140">
            <template #default="{ row }">
              {{ formatTime(row.timestamp) }}
            </template>
          </el-table-column>
          <el-table-column prop="filename" label="Plik" min-width="120" show-overflow-tooltip />
          <el-table-column prop="cost_usd" label="Koszt $" width="90">
            <template #default="{ row }">
              {{ formatCost(row.cost_usd) }}
            </template>
          </el-table-column>
          <el-table-column prop="latency_ms" label="ms" width="70" />
          <el-table-column label="Cache" width="70">
            <template #default="{ row }">
              <el-tag v-if="row.from_cache" size="small" type="info">tak</el-tag>
              <span v-else class="text-slate-400">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div
      v-else
      class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center"
    >
      <p class="text-sm text-slate-500">Nie udało się wczytać statystyk. Kliknij Odśwież.</p>
    </div>
  </section>
</template>

<script>
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { clearAiCache, getAiPerformance } from "@/services/api";

export default {
  name: "AiPerformancePanel",
  setup() {
    const loading = ref(false);
    const clearing = ref(false);
    const stats = ref(null);

    const isEmptyStats = computed(
      () =>
        stats.value != null &&
        stats.value.totalRuns === 0 &&
        stats.value.totalFeedback === 0
    );

    const formatCost = (value) => Number(value ?? 0).toFixed(4);

    const formatTime = (iso) => {
      try {
        return new Date(iso).toLocaleString("pl-PL", {
          dateStyle: "short",
          timeStyle: "short",
        });
      } catch {
        return iso ?? "—";
      }
    };

    const loadStats = async () => {
      loading.value = true;
      try {
        stats.value = await getAiPerformance();
      } catch (e) {
        stats.value = null;
        ElMessage.error(e?.response?.data?.error || "Nie udało się wczytać statystyk AI");
      } finally {
        loading.value = false;
      }
    };

    const clearCache = async () => {
      clearing.value = true;
      try {
        const res = await clearAiCache();
        ElMessage.success(`Wyczyszczono cache (${res.cleared} wpisów)`);
        await loadStats();
      } catch (e) {
        ElMessage.error(e?.response?.data?.error || "Błąd czyszczenia cache");
      } finally {
        clearing.value = false;
      }
    };

    onMounted(loadStats);

    return {
      loading,
      clearing,
      stats,
      isEmptyStats,
      loadStats,
      clearCache,
      formatTime,
      formatCost,
    };
  },
};
</script>
