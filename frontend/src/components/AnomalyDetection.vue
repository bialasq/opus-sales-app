<template>
  <div class="anomaly-detection">
    <el-alert
      title="Dane demonstracyjne"
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
    >
      Ta sekcja pokazuje przykładowe anomalie w celach poglądowych. Wykrywanie
      anomalii z wgranego pliku nie jest jeszcze podłączone do prawdziwego źródła.
    </el-alert>
    <el-row :gutter="20">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>Wykryte Anomalie</span>
              <el-badge :value="anomalies.length" class="item">
                <el-button type="warning" @click="refreshAnomalies">
                  <el-icon><Refresh /></el-icon>
                  Odśwież
                </el-button>
              </el-badge>
            </div>
          </template>

          <el-table
            :data="anomalies"
            style="width: 100%"
            :row-class-name="tableRowClassName"
          >
            <el-table-column type="expand">
              <template #default="props">
                <div class="expand-content">
                  <p><strong>Szczegóły:</strong></p>
                  <p>{{ props.row.details }}</p>
                  <p>
                    <strong>Rekomendacja:</strong>
                    {{ props.row.recommendation }}
                  </p>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="timestamp" label="Czas" width="180">
              <template #default="scope">
                {{ formatTime(scope.row.timestamp) }}
              </template>
            </el-table-column>
            <el-table-column prop="type" label="Typ" width="150">
              <template #default="scope">
                <el-tag :type="getTypeColor(scope.row.type)">
                  {{ getTypeLabel(scope.row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="product" label="Produkt" />
            <el-table-column prop="message" label="Komunikat" />
            <el-table-column prop="priority" label="Priorytet" width="120">
              <template #default="scope">
                <el-tag :type="getPriorityColor(scope.row.priority)">
                  {{ scope.row.priority === "high" ? "Wysoki" : "Niski" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Akcja" width="150">
              <template #default="scope">
                <el-button
                  type="primary"
                  size="small"
                  @click="handleAnomaly(scope.row)"
                >
                  Obsłuż
                </el-button>
                <el-button
                  type="text"
                  size="small"
                  @click="dismissAnomaly(scope.row)"
                >
                  Odrzuć
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>Statystyki Anomalii</span>
          </template>
          <div ref="anomalyStatsChart" style="height: 300px"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>Konfiguracja Alertów</span>
          </template>
          <el-form label-width="150px">
            <el-form-item label="Niski stan (%)">
              <el-slider
                v-model="alertConfig.lowStockPercent"
                :min="5"
                :max="30"
              />
            </el-form-item>
            <el-form-item label="Email alertów">
              <el-input
                v-model="alertConfig.email"
                placeholder="email@firma.pl"
              />
            </el-form-item>
            <el-form-item label="Częstotliwość">
              <el-select v-model="alertConfig.frequency">
                <el-option label="Natychmiast" value="immediate" />
                <el-option label="Co godzinę" value="hourly" />
                <el-option label="Raz dziennie" value="daily" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveAlertConfig">
                Zapisz konfigurację
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog
      v-model="actionDialogVisible"
      title="Obsługa Anomalii"
      width="50%"
    >
      <div v-if="selectedAnomaly">
        <p><strong>Produkt:</strong> {{ selectedAnomaly.product }}</p>
        <p><strong>Problem:</strong> {{ selectedAnomaly.message }}</p>
        <el-form style="margin-top: 20px">
          <el-form-item label="Akcja do podjęcia">
            <el-select v-model="selectedAction" style="width: 100%">
              <el-option label="Złóż zamówienie uzupełniające" value="order" />
              <el-option label="Przenieś z innego magazynu" value="transfer" />
              <el-option label="Oznacz jako wycofany" value="discontinue" />
              <el-option label="Ignoruj tymczasowo" value="ignore" />
            </el-select>
          </el-form-item>
          <el-form-item label="Uwagi">
            <el-input
              v-model="actionNotes"
              type="textarea"
              :rows="3"
              placeholder="Dodatkowe uwagi..."
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="actionDialogVisible = false">Anuluj</el-button>
        <el-button type="primary" @click="executeAction"> Wykonaj </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from "vue";
import * as echarts from "echarts";
import { ElMessage } from "element-plus";

export default {
  name: "AnomalyDetection",
  setup() {
    const anomalies = ref([]);
    const anomalyStatsChart = ref(null);
    const actionDialogVisible = ref(false);
    const selectedAnomaly = ref(null);
    const selectedAction = ref("");
    const actionNotes = ref("");
    const alertConfig = ref({
      lowStockPercent: 20,
      email: "",
      frequency: "immediate",
    });
    let anomalyStatsChartInstance = null;

    const loadAnomalies = () => {
      // Symulacja wykrywania anomalii
      const newAnomalies = [
        {
          id: Date.now(),
          timestamp: new Date(),
          type: "low_stock",
          product: "Produkt A",
          message: "Stan magazynowy poniżej minimum (15/50)",
          priority: "high",
          details:
            "Produkt o wysokiej rotacji. Ostatnie zamówienie 5 dni temu.",
          recommendation: "Natychmiastowe zamówienie 100 sztuk",
        },
        {
          id: Date.now() + 1,
          timestamp: new Date(),
          type: "no_rotation",
          product: "Produkt X",
          message: "Brak sprzedaży od 30 dni",
          priority: "low",
          details: "Produkt sezonowy, poza sezonem.",
          recommendation: "Rozważyć promocję lub wycofanie",
        },
      ];

      anomalies.value = newAnomalies;
    };

    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleString("pl-PL");
    };

    const getTypeColor = (type) => {
      const colors = {
        low_stock: "danger",
        no_rotation: "warning",
        overstock: "info",
      };
      return colors[type] || "info";
    };

    const getTypeLabel = (type) => {
      const labels = {
        low_stock: "Niski stan",
        no_rotation: "Brak rotacji",
        overstock: "Nadmiar",
      };
      return labels[type] || type;
    };

    const getPriorityColor = (priority) => {
      return priority === "high" ? "danger" : "success";
    };

    const tableRowClassName = ({ row }) => {
      return row.priority === "high" ? "warning-row" : "";
    };

    const refreshAnomalies = () => {
      loadAnomalies();
      ElMessage.success("Anomalie odświeżone");
    };

    const handleAnomaly = (anomaly) => {
      selectedAnomaly.value = anomaly;
      actionDialogVisible.value = true;
    };

    const dismissAnomaly = (anomaly) => {
      anomalies.value = anomalies.value.filter((a) => a.id !== anomaly.id);
      ElMessage.info("Anomalia odrzucona");
    };

    const executeAction = () => {
      ElMessage.success(
        `Akcja "${selectedAction.value}" wykonana dla ${selectedAnomaly.value.product}`
      );
      dismissAnomaly(selectedAnomaly.value);
      actionDialogVisible.value = false;
    };

    const saveAlertConfig = () => {
      ElMessage.success("Konfiguracja alertów zapisana");
    };

    const renderAnomalyStats = () => {
      if (!anomalyStatsChart.value) return;
      anomalyStatsChartInstance?.dispose();
      anomalyStatsChartInstance = null;
      const chart = echarts.init(anomalyStatsChart.value);
      anomalyStatsChartInstance = chart;

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
            name: "Typy anomalii",
            type: "pie",
            radius: "50%",
            data: [
              { value: 5, name: "Niski stan" },
              { value: 3, name: "Brak rotacji" },
              { value: 2, name: "Nadmiar" },
            ],
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
    };

    onMounted(() => {
      loadAnomalies();
      renderAnomalyStats();
      // Brak auto-refreshu: to dane demonstracyjne (nie ma jeszcze realnego źródła
      // anomalii), więc odświeżanie co 30 s tylko udawałoby monitoring na żywo.
    });

    onUnmounted(() => {
      anomalyStatsChartInstance?.dispose();
      anomalyStatsChartInstance = null;
    });

    return {
      anomalies,
      anomalyStatsChart,
      actionDialogVisible,
      selectedAnomaly,
      selectedAction,
      actionNotes,
      alertConfig,
      formatTime,
      getTypeColor,
      getTypeLabel,
      getPriorityColor,
      tableRowClassName,
      refreshAnomalies,
      handleAnomaly,
      dismissAnomaly,
      executeAction,
      saveAlertConfig,
    };
  },
};
</script>

<style scoped>
.anomaly-detection {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.expand-content {
  padding: 10px 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

:deep(.warning-row) {
  background-color: #fef0f0;
}
</style>
