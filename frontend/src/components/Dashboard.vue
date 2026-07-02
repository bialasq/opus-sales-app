<!-- frontend/src/components/Dashboard.vue -->
<template>
  <div class="space-y-6 sm:space-y-8">
    <AISuggestions />
    <AiPerformancePanel />

    <section aria-label="Kluczowe wskaźniki">
      <div v-if="dashboardLoading" class="dashboard-card p-6">
        <el-skeleton animated :rows="6" />
      </div>
      <div
        v-else
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4"
      >
        <StatCard
          v-for="(item, index) in kpiCards"
          :key="index"
          :label="item.title"
          :value="item.value"
          :icon="item.icon"
          :accent="item.color"
          :hint="item.hint"
        />
      </div>
    </section>

    <section
      v-if="dashboardLoading"
      class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8"
      aria-hidden="true"
    >
      <div class="dashboard-card p-6">
        <el-skeleton animated :rows="5" />
      </div>
      <div class="dashboard-card p-6">
        <el-skeleton animated :rows="5" />
      </div>
    </section>
    <section
      v-else
      class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8"
      aria-label="Wykresy sprzedaży"
    >
      <div class="dashboard-card flex min-h-[320px] flex-col sm:min-h-[340px]">
        <div class="dashboard-card-header !mb-0 !border-0 !pb-0">
          <div>
            <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
              Top produkty
            </h2>
            <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Przychód według pozycji
            </p>
          </div>
        </div>
        <div ref="topProductsChart" class="mt-2 min-h-[240px] flex-1 w-full" />
      </div>

      <div class="dashboard-card flex min-h-[320px] flex-col sm:min-h-[340px]">
        <div class="dashboard-card-header !mb-0 !border-0 !pb-0">
          <div>
            <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
              Trend sprzedaży
            </h2>
            <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Szacowany przebieg w czasie
            </p>
          </div>
        </div>
        <div ref="salesTrendChart" class="mt-2 min-h-[240px] flex-1 w-full" />
      </div>
    </section>

    <section class="dashboard-card" aria-label="Rekomendacje AI">
      <div class="dashboard-card-header">
        <div>
          <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
            Rekomendacje AI
          </h2>
          <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Sugestie na podstawie bieżących danych
          </p>
        </div>
        <el-button
          type="primary"
          class="!h-10 !shrink-0 !rounded-xl !px-4 !font-medium"
          :loading="aiLegacyLoading"
          @click="getAIInsights"
        >
          Generuj rekomendacje
        </el-button>
      </div>
      <div v-if="aiInsights" class="max-h-[min(28rem,70vh)] space-y-3 overflow-y-auto pr-1">
        <el-alert
          v-for="(insight, index) in aiInsights"
          :key="index"
          :title="insight.title"
          :type="insight.type"
          :description="insight.description"
          show-icon
          class="!rounded-xl"
        />
      </div>
      <p v-else class="text-sm leading-relaxed text-slate-500">
        Kliknij przycisk, aby wygenerować rekomendacje na podstawie załadowanego pliku.
      </p>
    </section>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import * as echarts from "echarts";
import { ElMessage } from "element-plus";
import api from "@/services/api";
import StatCard from "@/components/dashboard/StatCard.vue";
import AISuggestions from "@/components/dashboard/AISuggestions.vue";
import AiPerformancePanel from "@/components/dashboard/AiPerformancePanel.vue";

export default {
  name: "Dashboard",
  components: { StatCard, AISuggestions, AiPerformancePanel },
  setup() {
    const store = useWorkspaceStore();
    const topProductsChart = ref(null);
    const salesTrendChart = ref(null);
    const kpiData = ref({});
    const aiInsights = ref(null);
    const dashboardLoading = ref(false);
    const aiLegacyLoading = ref(false);

    let topProductsChartInstance = null;
    let salesTrendChartInstance = null;

    const disposeCharts = () => {
      topProductsChartInstance?.dispose();
      topProductsChartInstance = null;
      salesTrendChartInstance?.dispose();
      salesTrendChartInstance = null;
    };

    const formatCurrency = (value) => {
      return new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
      }).format(value);
    };

    const kpiCards = computed(() => [
      {
        title: "Całkowity przychód",
        value: formatCurrency(kpiData.value.totalRevenue || 0),
        icon: "Money",
        color: "#059669",
        hint: "Suma z załadowanego pliku",
      },
      {
        title: "Liczba zamówień",
        value: String(kpiData.value.totalOrders || 0),
        icon: "ShoppingCart",
        color: "#2563eb",
        hint: "Wiersze transakcji",
      },
      {
        title: "Średnia wartość zamówienia",
        value: formatCurrency(kpiData.value.averageOrderValue || 0),
        icon: "TrendCharts",
        color: "#d97706",
        hint: "AOV",
      },
      {
        title: "Retencja klientów",
        value: `${kpiData.value.customerRetention || 0}%`,
        icon: "User",
        color: "#dc2626",
        hint: "Szacunek z danych",
      },
    ]);

    const loadDashboardData = async () => {
      const filename = store.currentFile;
      if (!filename) {
        ElMessage.warning("Najpierw wgraj plik Excel");
        return;
      }

      dashboardLoading.value = true;
      try {
        const response = await api.post("/analytics/dashboard", { filename });
        kpiData.value = response.data;
        ElMessage.success("Dane załadowane pomyślnie");
      } catch (error) {
        ElMessage.error(
          "Błąd ładowania danych: " +
            (error.response?.data?.error || error.message)
        );
      } finally {
        dashboardLoading.value = false;
      }

      await nextTick();
      if (kpiData.value.topProducts && kpiData.value.topProducts.length > 0) {
        renderTopProductsChart();
      }
      renderSalesTrendChart();
    };

    const renderTopProductsChart = () => {
      if (!topProductsChart.value) return;
      topProductsChartInstance?.dispose();
      topProductsChartInstance = null;
      const chart = echarts.init(topProductsChart.value);
      topProductsChartInstance = chart;
      const data = kpiData.value.topProducts || [];

      const option = {
        grid: { left: "3%", right: "4%", bottom: "12%", top: "8%", containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
        },
        xAxis: {
          type: "category",
          data: data.map((item) => item.name),
          axisLabel: {
            rotate: data.length > 4 ? 32 : 0,
            interval: 0,
            fontSize: 11,
            color: "#64748b",
          },
        },
        yAxis: {
          type: "value",
          axisLabel: {
            formatter: (value) => formatCurrency(value),
            fontSize: 11,
            color: "#64748b",
          },
          splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
        },
        series: [
          {
            data: data.map((item) => item.value),
            type: "bar",
            barMaxWidth: 48,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "#6366f1" },
                { offset: 1, color: "#4f46e5" },
              ]),
              borderRadius: [6, 6, 0, 0],
            },
          },
        ],
      };

      chart.setOption(option);
    };

    const renderSalesTrendChart = () => {
      if (!salesTrendChart.value) return;
      salesTrendChartInstance?.dispose();
      salesTrendChartInstance = null;
      const chart = echarts.init(salesTrendChart.value);
      salesTrendChartInstance = chart;

      const monthlyData = kpiData.value.monthlyTrends || {
        Sty: 120000,
        Lut: 132000,
        Mar: 101000,
        Kwi: 134000,
        Maj: 90000,
        Cze: 230000,
      };

      const option = {
        grid: { left: "3%", right: "4%", bottom: "8%", top: "10%", containLabel: true },
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: Object.keys(monthlyData),
          axisLabel: { fontSize: 11, color: "#64748b" },
        },
        yAxis: {
          type: "value",
          axisLabel: {
            formatter: (value) => formatCurrency(value),
            fontSize: 11,
            color: "#64748b",
          },
          splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
        },
        series: [
          {
            data: Object.values(monthlyData),
            type: "line",
            smooth: true,
            symbolSize: 6,
            lineStyle: { width: 3, color: "#059669" },
            itemStyle: { color: "#059669" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(5, 150, 105, 0.25)" },
                { offset: 1, color: "rgba(5, 150, 105, 0.02)" },
              ]),
            },
          },
        ],
      };

      chart.setOption(option);
    };

    const getAIInsights = async () => {
      aiLegacyLoading.value = true;
      try {
        const response = await api.post("/analytics/ai-insights", {
          data: kpiData.value,
          agentType: "salesOptimizer",
          filename: store.currentFile || undefined,
        });

        aiInsights.value = [
          {
            title: "Optymalizacja sprzedaży",
            type: "success",
            description: response.data.insights,
          },
        ];

        ElMessage.success("Rekomendacje AI wygenerowane");
      } catch {
        ElMessage.error("Błąd generowania rekomendacji AI");
      } finally {
        aiLegacyLoading.value = false;
      }
    };

    onMounted(() => {
      if (store.currentFile) {
        loadDashboardData();
      }
    });

    onBeforeUnmount(() => {
      disposeCharts();
    });

    return {
      topProductsChart,
      salesTrendChart,
      kpiCards,
      aiInsights,
      getAIInsights,
      loadDashboardData,
      dashboardLoading,
      aiLegacyLoading,
    };
  },
};
</script>
