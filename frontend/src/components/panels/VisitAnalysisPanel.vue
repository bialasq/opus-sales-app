<template>
  <div class="visit-analysis-panel">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-statistic title="Łączna liczba wizyt" :value="data.totalVisits" />
      </el-col>
      <el-col :span="8">
        <el-statistic title="Wizyty sprzedażowe" :value="data.salesVisits" />
      </el-col>
      <el-col :span="8">
        <el-statistic
          title="Wskaźnik konwersji"
          :value="Number(data.conversionRate)"
          suffix="%"
        />
      </el-col>
    </el-row>

    <el-divider />

    <el-row :gutter="20">
      <el-col :span="12">
        <h3>Wizyty według województw</h3>
        <div ref="regionChart" style="height: 300px"></div>
      </el-col>
      <el-col :span="12">
        <h3>Wizyty według handlowców</h3>
        <div ref="salespersonChart" style="height: 300px"></div>
      </el-col>
    </el-row>

    <el-divider />

    <h3>Priorytety klientów</h3>
    <el-table :data="customerPriorities" style="width: 100%">
      <el-table-column prop="nip" label="NIP klienta" />
      <el-table-column prop="priority" label="Priorytet">
        <template #default="scope">
          <el-tag :type="getPriorityType(scope.row.priority)">
            {{ scope.row.priority }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from "vue";
import * as echarts from "echarts";

export default {
  name: "VisitAnalysisPanel",
  props: {
    data: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const regionChart = ref(null);
    const salespersonChart = ref(null);

    let regionChartInstance = null;
    let salespersonChartInstance = null;

    const disposeCharts = () => {
      regionChartInstance?.dispose();
      regionChartInstance = null;
      salespersonChartInstance?.dispose();
      salespersonChartInstance = null;
    };

    const customerPriorities = computed(() => {
      return Object.entries(props.data.customerPriorities || {}).map(
        ([nip, priority]) => ({
          nip,
          priority,
        })
      );
    });

    const getPriorityType = (priority) => {
      const types = {
        wysoki: "danger",
        średni: "warning",
        niski: "info",
      };
      return types[priority] || "info";
    };

    const renderCharts = () => {
      disposeCharts();
      // Wykres regionów
      if (regionChart.value) {
        regionChartInstance = echarts.init(regionChart.value);
        const chart = regionChartInstance;
        const regionData = Object.entries(props.data.visitsByRegion || {});

        const option = {
          tooltip: {
            trigger: "axis",
            axisPointer: {
              type: "shadow",
            },
          },
          legend: {
            data: ["Wszystkie", "Sprzedażowe"],
          },
          xAxis: {
            type: "category",
            data: regionData.map(([region]) => region),
            axisLabel: {
              rotate: 45,
            },
          },
          yAxis: {
            type: "value",
          },
          series: [
            {
              name: "Wszystkie",
              type: "bar",
              data: regionData.map(([_, data]) => data.total),
            },
            {
              name: "Sprzedażowe",
              type: "bar",
              data: regionData.map(([_, data]) => data.sales),
            },
          ],
        };

        chart.setOption(option);
      }

      // Wykres handlowców
      if (salespersonChart.value) {
        salespersonChartInstance = echarts.init(salespersonChart.value);
        const chart = salespersonChartInstance;
        const salespersonData = Object.entries(
          props.data.visitsBySalesperson || {}
        );

        const option = {
          tooltip: {
            trigger: "item",
          },
          legend: {
            orient: "vertical",
            left: "left",
          },
          series: [
            {
              name: "Wizyty",
              type: "pie",
              radius: "50%",
              data: salespersonData.map(([person, data]) => ({
                value: data.visits,
                name: person,
              })),
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowOffsetX: 0,
                  shadowColor: "rgba(0, 0, 0, 0.5)",
                },
              },
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
      () => nextTick(() => renderCharts()),
      { deep: true }
    );

    onBeforeUnmount(() => {
      disposeCharts();
    });

    return {
      regionChart,
      salespersonChart,
      customerPriorities,
      getPriorityType,
    };
  },
};
</script>

<style scoped>
.visit-analysis-panel {
  padding: 20px;
}

h3 {
  margin-bottom: 15px;
  color: #303133;
}
</style>
