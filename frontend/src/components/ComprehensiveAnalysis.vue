<template>
  <div class="comprehensive-analysis">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>Kompleksowa Analiza Danych</span>
          <div class="header-actions">
            <el-button
              v-if="!hasFile"
              type="success"
              :loading="loadingTestData"
              @click="loadTestData"
            >
              <el-icon><FolderOpened /></el-icon>
              Wgraj dane testowe
            </el-button>
            <el-upload
              :action="uploadActionUrl()"
              :show-file-list="false"
              :on-success="handleUploadSuccess"
              :on-error="handleUploadError"
              accept=".xlsx,.xls"
            >
              <el-button type="primary">
                <el-icon><Upload /></el-icon>
                Wgraj plik Excel
              </el-button>
            </el-upload>

            <el-button
              type="primary"
              @click="runAnalysis"
              :loading="loading"
              :disabled="!hasFile"
            >
              <el-icon><DataAnalysis /></el-icon>
              Analizuj dane
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="!analysisData && !hasFile" class="empty-state">
        <el-empty
          description="Wgraj plik Excel z arkuszami: Wizyty, Sprzedaż, Faktury"
        >
          <el-upload
            :action="uploadActionUrl()"
            :show-file-list="false"
            :on-success="handleUploadSuccess"
            :on-error="handleUploadError"
            accept=".xlsx,.xls"
          >
            <el-button type="primary">
              <el-icon><Upload /></el-icon>
              Wybierz plik Excel
            </el-button>
          </el-upload>
        </el-empty>
      </div>

      <div v-else-if="!analysisData && hasFile" class="ready-state">
        <el-result
          icon="success"
          title="Plik wgrany pomyślnie"
          :sub-title="`Plik: ${currentFileName}`"
        >
          <template #extra>
            <el-button type="primary" @click="runAnalysis" :loading="loading">
              Rozpocznij analizę
            </el-button>
            <el-upload
              :action="uploadActionUrl()"
              :show-file-list="false"
              :on-success="handleUploadSuccess"
              :on-error="handleUploadError"
              accept=".xlsx,.xls"
              style="display: inline-block; margin-left: 12px"
            >
              <el-button>Zmień plik</el-button>
            </el-upload>
          </template>
        </el-result>
      </div>

      <div v-else>
        <el-row :gutter="20" class="summary-cards" v-if="analysisData.summary">
          <el-col :span="6">
            <div class="summary-card">
              <div class="summary-label">Przychód</div>
              <div class="summary-value">
                {{ formatCurrency(analysisData.summary.totalRevenue) }}
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-card">
              <div class="summary-label">Wizyty</div>
              <div class="summary-value">{{ analysisData.summary.totalVisits }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-card">
              <div class="summary-label">Konwersja</div>
              <div class="summary-value">
                {{ Number(analysisData.summary.conversionRate || 0).toFixed(1) }}%
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-card">
              <div class="summary-label">Zaległości</div>
              <div class="summary-value error">
                {{ formatCurrency(analysisData.summary.overdueAmount) }}
              </div>
            </div>
          </el-col>
        </el-row>

        <ExpertAiPanel :analysis-data="analysisData" />

        <el-tabs v-model="activeTab" style="margin-top: 20px">
          <el-tab-pane label="Wizyty" name="visits">
            <VisitAnalysisPanel
              v-if="analysisData.visitAnalysis"
              :data="analysisData.visitAnalysis"
            />
            <el-empty v-else description="Brak arkusza Wizyty w pliku" />
          </el-tab-pane>
          <el-tab-pane label="Sprzedaż" name="sales">
            <SalesAnalysisPanel
              v-if="analysisData.salesAnalysis"
              :data="analysisData.salesAnalysis"
            />
            <el-empty v-else description="Brak arkusza Sprzedaż / Sprzedaz" />
          </el-tab-pane>
          <el-tab-pane label="Płatności" name="payments">
            <PaymentAnalysisPanel
              v-if="analysisData.paymentAnalysis"
              :data="analysisData.paymentAnalysis"
            />
            <el-empty v-else description="Brak arkusza Faktury" />
          </el-tab-pane>
          <el-tab-pane label="Efektywność" name="efficiency">
            <EfficiencyPanel
              v-if="analysisData.metrics"
              :data="analysisData.metrics"
            />
            <el-empty v-else description="Brak metryk efektywności" />
          </el-tab-pane>
          <el-tab-pane label="Rekomendacje AI" name="ai">
            <AIRecommendationsPanel
              :recommendations="analysisData.aiRecommendations || []"
              :recommendations-meta="analysisData.aiRecommendationsMeta || null"
              @refresh-analysis="runAnalysis"
            />
          </el-tab-pane>
        </el-tabs>

        <div class="report-actions">
          <h3 style="margin-bottom: 12px">Raporty</h3>
          <el-button type="primary" @click="generateReport('pdf')">
            Generuj PDF
          </el-button>
          <el-button @click="generateReport('html')">Generuj HTML</el-button>
          <el-button type="success" @click="optimizeRoutes">
            Optymalizuj trasy
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- Dialog z raportem -->
    <el-dialog
      v-model="reportDialogVisible"
      title="Wygenerowany raport"
      width="70%"
    >
      <iframe
        v-if="reportUrl"
        :src="reportUrl"
        title="Podgląd raportu"
        style="width: 100%; min-height: 420px; border: 1px solid #ebeef5"
      />
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from "vue";
import { useStore } from "vuex";
import { ElMessage } from "element-plus";
import api, { uploadActionUrl, testDataDownloadUrl } from "@/services/api";
import VisitAnalysisPanel from "./panels/VisitAnalysisPanel.vue";
import SalesAnalysisPanel from "./panels/SalesAnalysisPanel.vue";
import PaymentAnalysisPanel from "./panels/PaymentAnalysisPanel.vue";
import EfficiencyPanel from "./panels/EfficiencyPanel.vue";
import AIRecommendationsPanel from "./panels/AIRecommendationsPanel.vue";
import ExpertAiPanel from "./panels/ExpertAiPanel.vue";

export default {
  name: "ComprehensiveAnalysis",
  components: {
    VisitAnalysisPanel,
    SalesAnalysisPanel,
    PaymentAnalysisPanel,
    EfficiencyPanel,
    AIRecommendationsPanel,
    ExpertAiPanel,
  },
  setup() {
    const store = useStore();
    const loading = ref(false);
    const analysisData = ref(null);
    const activeTab = ref("visits");
    const reportDialogVisible = ref(false);
    const reportUrl = ref("");
    const reportFormat = ref("");

    const hasFile = computed(() => !!store.state.currentFile);
    const currentFileName = computed(() => store.state.currentFile || "");

    const handleUploadSuccess = (response) => {
      store.commit("setCurrentFile", response.filename);
      ElMessage.success("Plik został wgrany pomyślnie!");
      // Resetuj poprzednią analizę
      analysisData.value = null;
    };

    const handleUploadError = (error) => {
      const msg = (error && (error.message || String(error))) || "";
      const low = msg.toLowerCase();
      if (
        !error?.status ||
        error.status === 0 ||
        low.includes("network") ||
        low.includes("failed to fetch") ||
        low.includes("econnrefused")
      ) {
        ElMessage.error(
          "Brak połączenia z backendem. Uruchom w osobnym terminalu: cd backend → npm run dev (port 3000), potem odśwież stronę."
        );
        return;
      }
      ElMessage.error("Błąd podczas wgrywania pliku: " + (msg || "nieznany"));
    };

    const loadingTestData = ref(false);

    const loadTestData = async () => {
      loadingTestData.value = true;
      try {
        const checkResponse = await api.get("/analytics/test-data-info");

        if (!checkResponse.data.testFileExists) {
          ElMessage.warning(
            "Najpierw wygeneruj dane testowe: npm run generate-test-data"
          );
          return;
        }

        const downloadRes = await fetch(testDataDownloadUrl());
        if (!downloadRes.ok) {
          const errText = await downloadRes.text().catch(() => "");
          ElMessage.error(
            `Nie udało się pobrać pliku testowego (${downloadRes.status}). ${errText.slice(0, 200)}`
          );
          return;
        }
        const blob = await downloadRes.blob();
        if (!blob || blob.size < 100) {
          ElMessage.error(
            "Pobrany plik testowy jest pusty lub uszkodzony — uruchom ponownie: npm run generate-test-data w folderze backend."
          );
          return;
        }

        const file = new File([blob], "dane_testowe.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const formData = new FormData();
        formData.append("file", file);

        const uploadResponse = await fetch(uploadActionUrl(), {
          method: "POST",
          body: formData,
        });

        let result = {};
        try {
          result = await uploadResponse.json();
        } catch {
          ElMessage.error(
            `Odpowiedź serwera po wgraniu nie jest JSON (HTTP ${uploadResponse.status}).`
          );
          return;
        }

        if (!uploadResponse.ok) {
          ElMessage.error(
            result.error ||
              `Błąd wgrywania pliku testowego (HTTP ${uploadResponse.status}).`
          );
          return;
        }

        if (result.filename) {
          store.commit("setCurrentFile", result.filename);
          ElMessage.success("Dane testowe wgrane pomyślnie!");
        } else {
          ElMessage.error(
            result.error ||
              "Serwer nie zwrócił nazwy pliku po wgraniu — sprawdź logi backendu."
          );
        }
      } catch (e) {
        const status = e?.response?.status;
        const msg =
          e instanceof Error ? e.message : "Nieznany błąd sieci lub konfiguracji.";
        const hint404 =
          status === 404
            ? " Backend na :3000? Zrestartuj `npm run serve` (proxy /api → 127.0.0.1:3000). Albo ustaw `VUE_APP_API_URL=http://127.0.0.1:3000/api`."
            : "";
        ElMessage.error(`Błąd wgrywania danych testowych: ${msg}${hint404}`);
      } finally {
        loadingTestData.value = false;
      }
    };

    const runAnalysis = async () => {
      if (!store.state.currentFile) {
        ElMessage.warning("Najpierw wgraj plik Excel");
        return;
      }

      loading.value = true;
      try {
        const response = await api.post("/analytics/comprehensive-analysis", {
          filename: store.state.currentFile,
        });

        analysisData.value = response.data;
        ElMessage.success("Analiza zakończona pomyślnie");
      } catch (error) {
        ElMessage.error(
          "Błąd analizy: " + (error.response?.data?.details || error.message)
        );
      } finally {
        loading.value = false;
      }
    };

    const generateReport = async (format) => {
      if (!analysisData.value) {
        ElMessage.warning("Najpierw przeprowadź analizę");
        return;
      }

      try {
        const response = await api.post("/analytics/generate-report", {
          analysisData: analysisData.value,
          format: format,
        });

        reportUrl.value = response.data.report.url;
        reportFormat.value = format;
        reportDialogVisible.value = true;

        ElMessage.success(`Raport ${format.toUpperCase()} wygenerowany`);
      } catch {
        ElMessage.error("Błąd generowania raportu");
      }
    };

    const optimizeRoutes = async () => {
      try {
        const response = await api.post("/analytics/route-optimization", {
          visitData: analysisData.value.visitAnalysis,
          priorities: analysisData.value.visitAnalysis.customerPriorities,
        });

        ElMessage.success("Trasy zoptymalizowane");
        // Tutaj możesz dodać wyświetlanie zoptymalizowanych tras
      } catch {
        ElMessage.error("Błąd optymalizacji tras");
      }
    };

    const formatCurrency = (value) => {
      return new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
      }).format(value);
    };

    // Jeśli plik jest już wgrany przy wejściu na stronę
    onMounted(() => {
      if (hasFile.value) {
        // Opcjonalnie możesz od razu uruchomić analizę
        // runAnalysis()
      }
    });
    watch(
      () => store.state.currentFile,
      (newFile, oldFile) => {
        if (newFile && newFile !== oldFile) {
          analysisData.value = null;
          ElMessage.info(
            'Nowy plik wgrany. Kliknij "Analizuj dane" aby rozpocząć analizę.'
          );
        }
      }
    );

    return {
      loading,
      analysisData,
      activeTab,
      hasFile,
      currentFileName,
      reportDialogVisible,
      reportUrl,
      reportFormat,
      handleUploadSuccess,
      handleUploadError,
      loadingTestData,
      loadTestData,
      runAnalysis,
      generateReport,
      optimizeRoutes,
      formatCurrency,
      uploadActionUrl,
      testDataDownloadUrl,
    };
  },
};
</script>

<style scoped>
.comprehensive-analysis {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.upload-inline {
  display: inline-block;
}

.empty-state,
.ready-state {
  padding: 40px;
  text-align: center;
}

.summary-cards {
  margin-bottom: 20px;
}

.summary-card {
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.summary-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.summary-value.error {
  color: #f56c6c;
}

.report-actions {
  margin-top: 20px;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
  text-align: center;
}

.report-links {
  margin: 20px 0;
  display: flex;
  gap: 10px;
  justify-content: center;
}

.report-preview {
  margin-top: 20px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
}
</style>
