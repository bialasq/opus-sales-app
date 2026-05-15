<template>
  <div>
    <div v-if="analysisLoading" class="dashboard-card space-y-4 p-6">
      <el-skeleton animated :rows="2" />
      <el-skeleton animated :rows="6" />
    </div>
    <div v-else class="space-y-6 sm:space-y-8">
    <section v-if="productsTable.length" aria-label="Tabela produktów">
      <div class="dashboard-card p-0 sm:p-0">
        <div class="dashboard-card-header px-4 pt-4 sm:px-5 sm:pt-5">
          <div>
            <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
              Produkty z pliku
            </h2>
            <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Przewiń poziomo na małym ekranie — kolumny pozostają czytelne
            </p>
          </div>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="do"
            start-placeholder="Od"
            end-placeholder="Do"
            format="DD.MM.YYYY"
            value-format="YYYY-MM-DD"
            class="!w-full min-w-0 sm:!max-w-xs"
            @change="updateAnalysis"
          />
        </div>
        <div class="sales-table-wrap border-t-0 sm:border-t">
          <el-table
            :data="productsTable"
            stripe
            class="min-w-[640px]"
            :default-sort="{ prop: 'totalValue', order: 'descending' }"
          >
            <el-table-column prop="id" label="ID" min-width="88" fixed />
            <el-table-column prop="name" label="Produkt" min-width="160" show-overflow-tooltip />
            <el-table-column prop="category" label="Kategoria" min-width="120" />
            <el-table-column
              prop="rotationRate"
              label="Rotacja"
              min-width="100"
              sortable
              :formatter="(_, __, val) => formatPct(val)"
            />
            <el-table-column prop="totalQuantity" label="Ilość" min-width="88" sortable align="right" />
            <el-table-column
              prop="totalValue"
              label="Wartość"
              min-width="120"
              sortable
              align="right"
              :formatter="(_, __, val) => formatCurrency(val)"
            />
          </el-table>
        </div>
      </div>
    </section>

    <section v-else class="dashboard-card">
      <p class="text-sm text-slate-600">
        Wgraj plik Excel w nagłówku, aby zobaczyć tabelę produktów i wykresy rotacji.
      </p>
    </section>

    <section class="grid grid-cols-1 gap-6 lg:gap-8" aria-label="Wykresy produktów">
      <div class="dashboard-card flex min-h-[300px] flex-col sm:min-h-[360px] lg:min-h-[400px]">
        <div class="dashboard-card-header !mb-0 !border-0 !pb-0">
          <div class="min-w-0 flex-1">
            <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
              Rotacja produktów
            </h2>
            <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Porównanie dynamiki (tygodnie)
            </p>
          </div>
          <el-date-picker
            v-if="!productsTable.length"
            v-model="dateRange"
            type="daterange"
            range-separator="do"
            start-placeholder="Od"
            end-placeholder="Do"
            format="DD.MM.YYYY"
            value-format="YYYY-MM-DD"
            class="!w-full min-w-0 sm:!max-w-xs"
            @change="updateAnalysis"
          />
        </div>
        <div ref="rotationChart" class="mt-2 min-h-[240px] flex-1 w-full sm:min-h-[280px]" />
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-6">
        <div class="dashboard-card flex min-h-[280px] flex-col">
          <div class="dashboard-card-header !mb-0 !border-0 !pb-0">
            <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
              Sezonowość
            </h2>
            <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Sprzedaż miesięczna
            </p>
          </div>
          <div ref="seasonalChart" class="mt-2 min-h-[220px] flex-1 w-full" />
        </div>

        <div class="dashboard-card flex flex-col">
          <div class="dashboard-card-header !mb-0 !border-0 !pb-0">
            <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
              Sugerowane promocje
            </h2>
            <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Priorytety działań
            </p>
          </div>
          <div class="sales-table-wrap flex-1 border-0 shadow-none">
            <el-table :data="promotionSuggestions" stripe class="min-w-[280px]">
              <el-table-column prop="product" label="Produkt" min-width="120" show-overflow-tooltip />
              <el-table-column prop="discount" label="Rabat" width="100" align="center">
                <template #default="scope">
                  <el-tag type="danger" effect="light" round>{{ scope.row.discount }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="reason" label="Powód" min-width="140" show-overflow-tooltip />
              <el-table-column label="" width="108" align="right" fixed="right">
                <template #default="scope">
                  <el-button type="primary" size="small" round @click="applyPromotion(scope.row)">
                    Zastosuj
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
    </section>

    <section class="dashboard-card" aria-label="Analiza AI kategorii">
      <div class="dashboard-card-header">
        <div>
          <h2 class="text-base font-semibold text-slate-900 sm:text-lg">
            Analiza kategorii (AI)
          </h2>
          <p class="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Podsumowanie tekstowe
          </p>
        </div>
        <el-button
          type="primary"
          class="!rounded-xl !font-medium"
          :loading="aiCategoryLoading"
          @click="getAICategoryAnalysis"
        >
          Analizuj kategorie
        </el-button>
      </div>
      <div v-if="categoryAnalysis" class="max-h-[min(20rem,50vh)] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <el-alert :title="categoryAnalysis" type="info" :closable="false" show-icon class="!rounded-xl" />
      </div>
    </section>
  </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useStore } from "vuex";
import * as echarts from "echarts";
import api from "@/services/api";
import { ElMessage } from "element-plus";

export default {
  name: "ProductAnalysis",
  setup() {
    const store = useStore();
    const rotationChart = ref(null);
    const seasonalChart = ref(null);
    const dateRange = ref([]);
    const productsTable = ref([]);
    const promotionSuggestions = ref([
      {
        product: "Produkt A",
        discount: "-20%",
        reason: "Niska sprzedaż w czerwcu 2023",
      },
      {
        product: "Produkt C",
        discount: "-15%",
        reason: "Nadmierny stan magazynowy",
      },
    ]);
    const categoryAnalysis = ref(null);
    const analysisLoading = ref(false);
    const aiCategoryLoading = ref(false);

    let rotationChartInstance = null;
    let seasonalChartInstance = null;

    const disposeCharts = () => {
      rotationChartInstance?.dispose();
      rotationChartInstance = null;
      seasonalChartInstance?.dispose();
      seasonalChartInstance = null;
    };

    const formatCurrency = (n) =>
      new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(n) || 0);

    const formatPct = (n) =>
      `${((Number(n) || 0) * 100).toFixed(1)}%`;

    const loadProductAnalysis = async () => {
      const filename = store.state.currentFile;
      if (!filename) return;

      analysisLoading.value = true;
      try {
        const response = await api.post("/products/analysis", { filename });
        productsTable.value = response.data.products || [];
        await nextTick();
        renderRotationChart(response.data.products || []);
        renderSeasonalChart(response.data.seasonalTrends || {});
      } catch (error) {
        ElMessage.error(
          "Nie udało się załadować analizy produktów. " +
            (error.response?.data?.error || error.message || "")
        );
      } finally {
        analysisLoading.value = false;
      }
    };

    const renderRotationChart = (products) => {
      if (!rotationChart.value) return;
      rotationChartInstance?.dispose();
      rotationChartInstance = null;
      const chart = echarts.init(rotationChart.value);
      rotationChartInstance = chart;
      if (!products.length) {
        chart.clear();
        return;
      }

      const option = {
        grid: { left: "2%", right: "3%", bottom: "14%", top: "12%", containLabel: true },
        title: { text: "", show: false },
        tooltip: { trigger: "axis" },
        legend: {
          type: "scroll",
          bottom: 0,
          textStyle: { fontSize: 11, color: "#64748b" },
        },
        xAxis: {
          type: "category",
          data: ["Tydzień 1", "Tydzień 2", "Tydzień 3", "Tydzień 4"],
          axisLabel: { fontSize: 11, color: "#64748b" },
        },
        yAxis: {
          type: "value",
          name: "Ilość",
          nameTextStyle: { color: "#64748b", fontSize: 11 },
          axisLabel: { fontSize: 11, color: "#64748b" },
          splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
        },
        series: products.map((product) => ({
          name: product.name,
          type: "line",
          smooth: true,
          symbolSize: 4,
          data: [
            Math.floor(product.rotationRate * 7),
            Math.floor(product.rotationRate * 7 * 1.1),
            Math.floor(product.rotationRate * 7 * 0.9),
            Math.floor(product.rotationRate * 7 * 1.2),
          ],
        })),
      };

      chart.setOption(option);
    };

    const renderSeasonalChart = (seasonalData) => {
      if (!seasonalChart.value) return;
      seasonalChartInstance?.dispose();
      seasonalChartInstance = null;
      const chart = echarts.init(seasonalChart.value);
      seasonalChartInstance = chart;
      const months = [
        "Sty", "Lut", "Mar", "Kwi", "Maj", "Cze",
        "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru",
      ];

      const keys = Object.keys(seasonalData || {});
      if (!keys.length) {
        chart.clear();
        return;
      }

      const option = {
        grid: { left: "2%", right: "3%", bottom: "12%", top: "14%", containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
        },
        legend: {
          type: "scroll",
          bottom: 0,
          textStyle: { fontSize: 10, color: "#64748b" },
          data: keys,
        },
        xAxis: {
          type: "category",
          data: months,
          axisLabel: { fontSize: 10, color: "#64748b" },
        },
        yAxis: {
          type: "value",
          name: "Sprzedaż",
          nameTextStyle: { color: "#64748b", fontSize: 11 },
          axisLabel: { fontSize: 10, color: "#64748b" },
          splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
        },
        series: keys.map((product) => ({
          name: product,
          type: "bar",
          barMaxWidth: 22,
          data: months.map((_, index) => seasonalData[product][index] || 0),
        })),
      };

      chart.setOption(option);
    };

    const updateAnalysis = () => {
      loadProductAnalysis();
    };

    const applyPromotion = (promotion) => {
      ElMessage.success(
        `Promocja ${promotion.discount} zastosowana dla ${promotion.product}`
      );
    };

    const getAICategoryAnalysis = async () => {
      aiCategoryLoading.value = true;
      try {
        const response = await api.post("/analytics/ai-insights", {
          data: { type: "categories" },
          agentType: "productAnalyzer",
          filename: store.state.currentFile || undefined,
        });
        categoryAnalysis.value = response.data.insights;
      } catch (error) {
        ElMessage.error("Nie udało się pobrać analizy AI kategorii.");
      } finally {
        aiCategoryLoading.value = false;
      }
    };

    onMounted(() => {
      loadProductAnalysis();
    });

    onBeforeUnmount(() => {
      disposeCharts();
    });

    return {
      rotationChart,
      seasonalChart,
      dateRange,
      productsTable,
      promotionSuggestions,
      categoryAnalysis,
      updateAnalysis,
      applyPromotion,
      getAICategoryAnalysis,
      formatCurrency,
      formatPct,
      analysisLoading,
      aiCategoryLoading,
    };
  },
};
</script>
