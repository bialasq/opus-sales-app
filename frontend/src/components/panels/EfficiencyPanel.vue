<template>
  <div class="efficiency-panel">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-statistic
          title="Przychód na kilometr"
          :value="Number(data.revenuePerKilometer)"
          suffix="PLN/km"
          :precision="2"
        />
      </el-col>
      <el-col :span="8">
        <el-statistic
          title="Średni czas wizyty"
          :value="Number(data.averageVisitDuration)"
          suffix="min"
        />
      </el-col>
      <el-col :span="8">
        <el-statistic
          title="Liczba handlowców"
          :value="Object.keys(data.salespersonEfficiency || {}).length"
        />
      </el-col>
    </el-row>

    <el-divider />

    <h3>Efektywność handlowców</h3>
    <el-table
      :data="salespersonData"
      style="width: 100%"
      :default-sort="{ prop: 'revenue', order: 'descending' }"
    >
      <el-table-column prop="name" label="Handlowiec" fixed />
      <el-table-column prop="visitsCount" label="Wizyty" width="80" sortable />
      <el-table-column
        prop="conversionRate"
        label="Konwersja"
        width="100"
        sortable
      >
        <template #default="scope">
          <el-progress
            :percentage="Number(scope.row.conversionRate)"
            :status="getProgressStatus(scope.row.conversionRate)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="revenue" label="Przychód" width="120" sortable>
        <template #default="scope">
          {{ formatCurrency(scope.row.revenue) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="revenuePerVisit"
        label="PLN/wizyta"
        width="100"
        sortable
      >
        <template #default="scope">
          {{ Number(scope.row.revenuePerVisit).toFixed(0) }}
        </template>
      </el-table-column>
      <el-table-column prop="revenuePerKm" label="PLN/km" width="90" sortable>
        <template #default="scope">
          {{ Number(scope.row.revenuePerKm).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="averageVisitTime"
        label="Śr. czas"
        width="80"
        sortable
      >
        <template #default="scope">
          {{ scope.row.averageVisitTime }} min
        </template>
      </el-table-column>
      <el-table-column
        prop="customersCount"
        label="Klienci"
        width="80"
        sortable
      />
    </el-table>

    <el-divider />

    <el-row :gutter="20">
      <el-col :span="12">
        <h3>Ranking efektywności</h3>
        <div ref="rankingChart" style="height: 300px"></div>
      </el-col>
      <el-col :span="12">
        <h3>Porównanie konwersji</h3>
        <div ref="conversionChart" style="height: 300px"></div>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from "vue";
import * as echarts from "echarts";

export default {
  name: "EfficiencyPanel",
  props: {
    data: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const rankingChart = ref(null);
    const conversionChart = ref(null);

    let rankingChartInstance = null;
    let conversionChartInstance = null;

    const disposeCharts = () => {
      rankingChartInstance?.dispose();
      rankingChartInstance = null;
      conversionChartInstance?.dispose();
      conversionChartInstance = null;
    };

    const salespersonData = computed(() => {
      return Object.entries(props.data.salespersonEfficiency || {}).map(
        ([name, data]) => ({
          name,
          ...data,
        })
      );
    });

    const formatCurrency = (value) => {
      return new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    };

    const getProgressStatus = (percentage) => {
      if (percentage >= 50) return "success";
      if (percentage >= 30) return "warning";
      return "exception";
    };

    const renderCharts = () => {
      disposeCharts();
      // Wykres rankingu
      if (rankingChart.value) {
        rankingChartInstance = echarts.init(rankingChart.value);
        const chart = rankingChartInstance;
        const sortedData = [...salespersonData.value].sort(
          (a, b) => b.revenuePerKm - a.revenuePerKm
        );

        const option = {
          tooltip: {
            trigger: "axis",
            axisPointer: {
              type: "shadow",
            },
          },
          xAxis: {
            type: "category",
            data: sortedData.map((d) => d.name),
            axisLabel: {
              rotate: 45,
            },
          },
          yAxis: {
            type: "value",
            name: "PLN/km",
          },
          series: [
            {
              type: "bar",
              data: sortedData.map((d) => d.revenuePerKm),
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "#67C23A" },
                  { offset: 1, color: "#409EFF" },
                ]),
              },
            },
          ],
        };

        chart.setOption(option);
      }

      // Wykres konwersji
      if (conversionChart.value) {
        conversionChartInstance = echarts.init(conversionChart.value);
        const chart = conversionChartInstance;

        const option = {
          tooltip: {
            trigger: "item",
            formatter: "{b}: {c}%",
          },
          radar: {
            indicator: salespersonData.value.map((d) => ({
              name: d.name,
              max: 100,
            })),
          },
          series: [
            {
              type: "radar",
              data: [
                {
                  value: salespersonData.value.map((d) =>
                    Number(d.conversionRate)
                  ),
                  name: "Wskaźnik konwersji",
                  areaStyle: {
                    opacity: 0.3,
                  },
                },
              ],
            },
          ],
        };

        chart.setOption(option);
      }
    };

    onMounted(() => {
      nextTick(() => renderCharts());
    });

    watch(
      () => props.data,
      async () => {
        await nextTick();
        renderCharts();
      },
      { deep: true }
    );

    onBeforeUnmount(() => {
      disposeCharts();
    });

    return {
      rankingChart,
      conversionChart,
      salespersonData,
      formatCurrency,
      getProgressStatus,
    };
  },
};
</script>

<style scoped>
.efficiency-panel {
  padding: 20px;
}

h3 {
  margin-bottom: 15px;
  color: #303133;
}
</style>
