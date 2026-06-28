<template>
  <div class="sales-analysis-panel">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-statistic
          title="Całkowity przychód"
          :value="data.totalRevenue"
          :precision="2"
          prefix="PLN"
        />
      </el-col>
      <el-col :span="8">
        <el-statistic
          title="Całkowita marża"
          :value="data.totalMargin"
          :precision="2"
          prefix="PLN"
        />
      </el-col>
      <el-col :span="8">
        <el-statistic title="Średnia marża" :value="averageMargin" suffix="%" />
      </el-col>
    </el-row>

    <el-divider />

    <el-row :gutter="20">
      <el-col :span="12">
        <h3>Sprzedaż według kategorii</h3>
        <div ref="categoryChart" style="height: 300px"></div>
      </el-col>
      <el-col :span="12">
        <h3>Trendy miesięczne</h3>
        <div ref="monthlyChart" style="height: 300px"></div>
      </el-col>
    </el-row>

    <el-divider />

    <el-row :gutter="20">
      <el-col :span="12">
        <h3>Klasyfikacja klientów</h3>
        <el-table :data="customerTiers" style="width: 100%" max-height="400">
          <el-table-column prop="nip" label="NIP" width="120" />
          <el-table-column prop="name" label="Nazwa klienta" />
          <el-table-column prop="tier" label="Tier" width="80">
            <template #default="scope">
              <el-tag :type="getTierType(scope.row.tier)">
                {{ scope.row.tier }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="revenue" label="Przychód">
            <template #default="scope">
              {{ formatCurrency(scope.row.revenue) }}
            </template>
          </el-table-column>
        </el-table>
      </el-col>
      <el-col :span="12">
        <h3>Produkty bez rotacji</h3>
        <el-alert
          v-if="data.inactiveProducts && data.inactiveProducts.length === 0"
          title="Wszystkie produkty mają regularną sprzedaż"
          type="success"
          :closable="false"
        />
        <el-table
          v-else
          :data="data.inactiveProducts"
          style="width: 100%"
          max-height="400"
        >
          <el-table-column prop="product" label="Produkt" />
          <el-table-column prop="category" label="Kategoria" />
          <el-table-column
            prop="daysSinceLastSale"
            label="Dni bez sprzedaży"
            width="150"
          >
            <template #default="scope">
              <el-tag type="danger"
                >{{ scope.row.daysSinceLastSale }} dni</el-tag
              >
            </template>
          </el-table-column>
        </el-table>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from "vue";
import * as echarts from "echarts";

export default {
  name: "SalesAnalysisPanel",
  props: {
    data: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const categoryChart = ref(null);
    const monthlyChart = ref(null);

    let categoryChartInstance = null;
    let monthlyChartInstance = null;

    const disposeCharts = () => {
      categoryChartInstance?.dispose();
      categoryChartInstance = null;
      monthlyChartInstance?.dispose();
      monthlyChartInstance = null;
    };

    const averageMargin = computed(() => {
      if (props.data.totalRevenue > 0) {
        return (
          (props.data.totalMargin / props.data.totalRevenue) *
          100
        ).toFixed(2);
      }
      return 0;
    });

    const customerTiers = computed(() => {
      return Object.entries(props.data.customerTiers || {})
        .map(([nip, tierData]) => ({
          nip,
          name: tierData.data.name,
          tier: tierData.tier,
          revenue: tierData.data.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue);
    });

    const getTierType = (tier) => {
      const types = {
        T1: "danger",
        T2: "warning",
        T3: "info",
      };
      return types[tier] || "info";
    };

    const formatCurrency = (value) => {
      return new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
      }).format(value);
    };

    const renderCharts = () => {
      disposeCharts();
      // Wykres kategorii
      if (categoryChart.value && props.data.salesByCategory) {
        categoryChartInstance = echarts.init(categoryChart.value);
        const chart = categoryChartInstance;
        const categoryData = Object.entries(props.data.salesByCategory)
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .slice(0, 10);

        const option = {
          tooltip: {
            trigger: "axis",
            axisPointer: {
              type: "shadow",
            },
          },
          xAxis: {
            type: "category",
            data: categoryData.map(([cat]) => cat),
            axisLabel: {
              rotate: 45,
            },
          },
          yAxis: {
            type: "value",
            axisLabel: {
              formatter: (value) => (value / 1000).toFixed(0) + "k PLN",
            },
          },
          series: [
            {
              type: "bar",
              data: categoryData.map(([_, data]) => data.revenue),
              itemStyle: {
                color: "#409EFF",
              },
            },
          ],
        };

        chart.setOption(option);
      }

      // Wykres miesięczny
      if (monthlyChart.value && props.data.monthlyTrends) {
        monthlyChartInstance = echarts.init(monthlyChart.value);
        const chart = monthlyChartInstance;
        const monthlyData = Object.entries(props.data.monthlyTrends).sort();

        const option = {
          tooltip: {
            trigger: "axis",
          },
          xAxis: {
            type: "category",
            data: monthlyData.map(([month]) => month),
          },
          yAxis: {
            type: "value",
            axisLabel: {
              formatter: (value) => (value / 1000).toFixed(0) + "k PLN",
            },
          },
          series: [
            {
              type: "line",
              smooth: true,
              data: monthlyData.map(([_, data]) => data.revenue),
              itemStyle: {
                color: "#67C23A",
              },
              areaStyle: {
                opacity: 0.3,
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
      categoryChart,
      monthlyChart,
      averageMargin,
      customerTiers,
      getTierType,
      formatCurrency,
    };
  },
};
</script>

<style scoped>
.sales-analysis-panel {
  padding: 20px;
}

h3 {
  margin-bottom: 15px;
  color: #303133;
}
</style>
