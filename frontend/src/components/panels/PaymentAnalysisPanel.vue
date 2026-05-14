<template>
  <div class="payment-analysis-panel">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-statistic
          title="Łączne zaległości"
          :value="data.totalOutstanding"
          :precision="2"
          prefix="PLN"
          class="stat-danger"
        />
      </el-col>
      <el-col :span="8">
        <el-statistic
          title="Liczba zaległych faktur"
          :value="data.overduePayments.length"
        />
      </el-col>
      <el-col :span="8">
        <el-statistic
          title="Średnie opóźnienie"
          :value="Number(data.averagePaymentDelay)"
          suffix="dni"
        />
      </el-col>
    </el-row>

    <el-divider />

    <h3>Przeterminowane faktury</h3>
    <el-table
      :data="sortedOverduePayments"
      style="width: 100%"
      :row-class-name="tableRowClassName"
    >
      <el-table-column prop="invoiceNumber" label="Nr faktury" width="150" />
      <el-table-column prop="customerName" label="Klient" />
      <el-table-column prop="amount" label="Kwota">
        <template #default="scope">
          {{ formatCurrency(scope.row.amount) }}
        </template>
      </el-table-column>
      <el-table-column prop="dueDate" label="Termin płatności" width="120">
        <template #default="scope">
          {{ formatDate(scope.row.dueDate) }}
        </template>
      </el-table-column>
      <el-table-column prop="daysOverdue" label="Dni po terminie" width="130">
        <template #default="scope">
          <el-tag :type="getOverdueType(scope.row.daysOverdue)">
            {{ scope.row.daysOverdue }} dni
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Akcje" width="200">
        <template #default="scope">
          <el-button
            type="primary"
            size="small"
            @click="sendReminder(scope.row)"
          >
            Wyślij przypomnienie
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-divider />

    <el-row :gutter="20">
      <el-col :span="12">
        <h3>Zaległości według klientów</h3>
        <div ref="customerChart" style="height: 300px"></div>
      </el-col>
      <el-col :span="12">
        <h3>Histogram opóźnień</h3>
        <div ref="delayChart" style="height: 300px"></div>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from "vue";
import * as echarts from "echarts";
import { ElMessage, ElMessageBox } from "element-plus";
import api from "@/services/api";

export default {
  name: "PaymentAnalysisPanel",
  props: {
    data: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const customerChart = ref(null);
    const delayChart = ref(null);

    let customerChartInstance = null;
    let delayChartInstance = null;

    const disposeCharts = () => {
      customerChartInstance?.dispose();
      customerChartInstance = null;
      delayChartInstance?.dispose();
      delayChartInstance = null;
    };

    const sortedOverduePayments = computed(() => {
      return [...props.data.overduePayments].sort(
        (a, b) => b.daysOverdue - a.daysOverdue
      );
    });

    const formatCurrency = (value) => {
      return new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
      }).format(value);
    };

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("pl-PL");
    };

    const getOverdueType = (days) => {
      if (days > 30) return "danger";
      if (days > 14) return "warning";
      return "info";
    };

    const tableRowClassName = ({ row }) => {
      if (row.daysOverdue > 30) return "danger-row";
      if (row.daysOverdue > 14) return "warning-row";
      return "";
    };

    const sendReminder = async (payment) => {
      try {
        await ElMessageBox.confirm(
          `Wysłać przypomnienie do ${payment.customerName}?`,
          "Potwierdzenie",
          {
            confirmButtonText: "Wyślij",
            cancelButtonText: "Anuluj",
            type: "warning",
          }
        );

        await api.post("/payments/send-reminder", {
          invoiceNumber: payment.invoiceNumber,
          customerId: payment.customerNIP,
          email: payment.email,
        });

        ElMessage.success("Przypomnienie wysłane");
      } catch (error) {
        if (error !== "cancel") {
          ElMessage.error("Błąd wysyłania przypomnienia");
        }
      }
    };

    const renderCharts = () => {
      disposeCharts();
      // Wykres zaległości według klientów
      if (customerChart.value && props.data.paymentsByCustomer) {
        customerChartInstance = echarts.init(customerChart.value);
        const chart = customerChartInstance;
        const customerData = Object.entries(props.data.paymentsByCustomer)
          .filter(([_, data]) => data.overdue > 0)
          .sort((a, b) => b[1].overdue - a[1].overdue)
          .slice(0, 10);

        const option = {
          tooltip: {
            trigger: "axis",
            axisPointer: {
              type: "shadow",
            },
          },
          xAxis: {
            type: "value",
            axisLabel: {
              formatter: (value) => (value / 1000).toFixed(0) + "k",
            },
          },
          yAxis: {
            type: "category",
            data: customerData.map(([nip]) => nip),
          },
          series: [
            {
              type: "bar",
              data: customerData.map(([_, data]) => data.overdue),
              itemStyle: {
                color: "#F56C6C",
              },
            },
          ],
        };

        chart.setOption(option);
      }

      // Histogram opóźnień
      if (delayChart.value) {
        delayChartInstance = echarts.init(delayChart.value);
        const chart = delayChartInstance;

        // Grupuj opóźnienia w przedziały
        const delays = props.data.overduePayments.map((p) => p.daysOverdue);
        const ranges = [
          { label: "1-7 dni", min: 1, max: 7, count: 0 },
          { label: "8-14 dni", min: 8, max: 14, count: 0 },
          { label: "15-30 dni", min: 15, max: 30, count: 0 },
          { label: "31-60 dni", min: 31, max: 60, count: 0 },
          { label: ">60 dni", min: 61, max: Infinity, count: 0 },
        ];

        delays.forEach((days) => {
          const range = ranges.find((r) => days >= r.min && days <= r.max);
          if (range) range.count++;
        });

        const option = {
          tooltip: {
            trigger: "axis",
          },
          xAxis: {
            type: "category",
            data: ranges.map((r) => r.label),
          },
          yAxis: {
            type: "value",
          },
          series: [
            {
              type: "bar",
              data: ranges.map((r) => r.count),
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "#F56C6C" },
                  { offset: 1, color: "#E6A23C" },
                ]),
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
      customerChart,
      delayChart,
      sortedOverduePayments,
      formatCurrency,
      formatDate,
      getOverdueType,
      tableRowClassName,
      sendReminder,
    };
  },
};
</script>

<style scoped>
.payment-analysis-panel {
  padding: 20px;
}

h3 {
  margin-bottom: 15px;
  color: #303133;
}

:deep(.stat-danger .el-statistic__value) {
  color: #f56c6c;
}

:deep(.danger-row) {
  background-color: #fef0f0;
}

:deep(.warning-row) {
  background-color: #fdf6ec;
}
</style>
