<template>
  <div class="ai-recommendations-panel">
    <el-alert
      v-if="recommendationsMeta && recommendationsMeta.provider"
      :title="recommendationsSourceLabel"
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
    />

    <div v-if="loading" class="panel-loading">
      <p class="panel-loading-hint">
        <el-icon class="is-loading"><Loading /></el-icon>
        Odświeżanie rekomendacji…
      </p>
      <el-skeleton animated :rows="5" />
    </div>

    <div
      v-else-if="!recommendations || recommendations.length === 0"
      class="empty-state"
    >
      <el-empty
        description="Brak rekomendacji AI. Uruchom ponownie analizę kompleksową lub odśwież, gdy dane będą gotowe."
      />
    </div>

    <div v-else>
      <el-timeline>
        <el-timeline-item
          v-for="(rec, index) in recommendations"
          :key="index"
          :timestamp="getPriority(rec)"
          :type="getTimelineType(rec)"
          placement="top"
        >
          <el-card shadow="hover">
            <h4>{{ rec.title }}</h4>
            <p class="recommendation-description">{{ rec.description }}</p>

            <div v-if="rec.action" class="recommendation-action">
              <el-divider />
              <div class="action-content">
                <el-icon><Promotion /></el-icon>
                <span>Rekomendowane działanie: </span>
                <strong>{{ rec.action }}</strong>
              </div>

              <el-button
                type="primary"
                size="small"
                style="margin-top: 10px"
                @click="implementAction(rec, index)"
              >
                Wdrożyć rekomendację
              </el-button>
            </div>

            <div class="recommendation-meta">
              <el-tag size="small" v-if="rec.category">{{
                rec.category
              }}</el-tag>
              <el-tag size="small" type="info" v-if="rec.impact">
                Wpływ: {{ rec.impact }}
              </el-tag>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </div>

    <el-divider />

    <div class="ai-actions">
      <el-button @click="refreshRecommendations" :loading="loading">
        <el-icon><Refresh /></el-icon>
        Odśwież rekomendacje
      </el-button>
      <el-button type="success" @click="exportRecommendations">
        <el-icon><Download /></el-icon>
        Eksportuj do PDF
      </el-button>
    </div>

    <el-dialog
      v-model="actionDialogVisible"
      title="Wdrożenie rekomendacji"
      width="50%"
    >
      <div v-if="selectedRecommendation">
        <p><strong>Rekomendacja:</strong> {{ selectedRecommendation.title }}</p>
        <p><strong>Działanie:</strong> {{ selectedRecommendation.action }}</p>

        <el-form style="margin-top: 20px">
          <el-form-item label="Termin realizacji">
            <el-date-picker
              v-model="implementationDate"
              type="date"
              placeholder="Wybierz datę"
              format="DD.MM.YYYY"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
          <el-form-item label="Odpowiedzialny">
            <el-input
              v-model="responsiblePerson"
              placeholder="Imię i nazwisko"
            />
          </el-form-item>
          <el-form-item label="Notatki">
            <el-input
              v-model="implementationNotes"
              type="textarea"
              :rows="3"
              placeholder="Dodatkowe uwagi..."
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="actionDialogVisible = false">Anuluj</el-button>
        <el-button type="primary" @click="confirmImplementation">
          Potwierdź wdrożenie
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import api from "@/services/api";

export default {
  name: "AIRecommendationsPanel",
  components: { Loading },
  props: {
    recommendations: {
      type: Array,
      default: () => [],
    },
    recommendationsMeta: {
      type: Object,
      default: null,
    },
  },
  setup(props, { emit }) {
    const loading = ref(false);
    const actionDialogVisible = ref(false);
    const selectedRecommendation = ref(null);
    const implementationDate = ref("");
    const responsiblePerson = ref("");
    const implementationNotes = ref("");

    const recommendationsSourceLabel = computed(() => {
      const m = props.recommendationsMeta;
      if (!m) return "";
      const src = m.source || "";
      const prov = m.provider || "";
      const model = m.model ? ` (${m.model})` : "";
      if (src === "hybrid") return `Źródło: reguły + LLM — ${prov}${model}`;
      if (src === "llm") return `Źródło: LLM — ${prov}${model}`;
      return `Źródło: ${src || "reguły"} — ${prov}${model}`;
    });

    const getPriority = (rec) => {
      if (rec.priority === "high") return "Wysoki priorytet";
      if (rec.priority === "medium") return "Średni priorytet";
      return "Niski priorytet";
    };

    const getTimelineType = (rec) => {
      if (rec.priority === "high") return "danger";
      if (rec.priority === "medium") return "warning";
      return "primary";
    };

    const implementAction = (rec, index) => {
      selectedRecommendation.value = { ...rec, index };
      implementationDate.value = "";
      responsiblePerson.value = "";
      implementationNotes.value = "";
      actionDialogVisible.value = true;
    };

    const confirmImplementation = () => {
      if (!implementationDate.value || !responsiblePerson.value) {
        ElMessage.warning("Wypełnij wszystkie wymagane pola");
        return;
      }

      ElMessage.success("Rekomendacja oznaczona do wdrożenia");
      actionDialogVisible.value = false;
    };

    const refreshRecommendations = async () => {
      loading.value = true;
      try {
        // Emit event do rodzica aby odświeżył analizę
        emit("refresh-analysis");
        ElMessage.success("Rekomendacje zostaną odświeżone");
      } catch (error) {
        ElMessage.error("Błąd odświeżania rekomendacji");
      } finally {
        loading.value = false;
      }
    };

    const exportRecommendations = async () => {
      try {
        const response = await api.post("/analytics/export-recommendations", {
          recommendations: props.recommendations,
        });

        if (response.data.url) {
          window.open(response.data.url, "_blank");
        }

        ElMessage.success("Rekomendacje wyeksportowane");
      } catch (error) {
        ElMessage.error("Błąd eksportu rekomendacji");
      }
    };

    return {
      loading,
      actionDialogVisible,
      selectedRecommendation,
      implementationDate,
      responsiblePerson,
      implementationNotes,
      recommendationsSourceLabel,
      getPriority,
      getTimelineType,
      implementAction,
      confirmImplementation,
      refreshRecommendations,
      exportRecommendations,
    };
  },
};
</script>

<style scoped>
.ai-recommendations-panel {
  padding: 20px;
}

.mb-4 {
  margin-bottom: 16px;
}

.panel-loading {
  padding: 8px 0 24px;
}

.panel-loading-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  font-size: 14px;
  color: #606266;
}

.empty-state {
  padding: 40px;
  text-align: center;
}

.recommendation-description {
  color: #606266;
  margin: 10px 0;
  line-height: 1.6;
}

.recommendation-action {
  margin-top: 15px;
}

.action-content {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #409eff;
  margin-bottom: 10px;
}

.recommendation-meta {
  margin-top: 15px;
  display: flex;
  gap: 8px;
}

.ai-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

h4 {
  margin: 0 0 10px 0;
  color: #303133;
}
</style>
