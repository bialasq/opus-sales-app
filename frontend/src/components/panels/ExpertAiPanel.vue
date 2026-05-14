<template>
  <div class="expert-ai-panel">
    <el-alert
      v-if="metaLine"
      :title="metaLine"
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
    />

    <el-button
      type="primary"
      :loading="loading"
      :disabled="!analysisData"
      @click="runExpert"
    >
      <el-icon><Cpu /></el-icon>
      Generuj analizę ekspercką AI (sprzedaż · finanse · marketing)
    </el-button>
    <p class="hint">
      Wymaga ukończonej analizy kompleksowej. Z kluczem API (OpenAI / Anthropic) otrzymasz
      pełny raport; bez klucza — uproszczona analiza z danych i reguł.
    </p>

    <template v-if="expert">
      <el-divider />
      <el-tabs>
        <el-tab-pane label="Sprzedaż" name="sales">
          <div class="prose" v-html="formatBlock(expert.sales)" />
        </el-tab-pane>
        <el-tab-pane label="Finanse" name="finance">
          <div class="prose" v-html="formatBlock(expert.finance)" />
        </el-tab-pane>
        <el-tab-pane label="Marketing" name="marketing">
          <div class="prose" v-html="formatBlock(expert.marketing)" />
        </el-tab-pane>
        <el-tab-pane label="Zarząd" name="exec">
          <div class="prose" v-html="formatBlock(expert.executiveSummary)" />
        </el-tab-pane>
        <el-tab-pane label="Priorytety" name="actions">
          <el-timeline>
            <el-timeline-item
              v-for="(a, i) in expert.priorityActions"
              :key="i"
              :type="tagType(a.priority)"
              :timestamp="a.priority"
            >
              <strong>{{ a.title }}</strong>
              <p class="action-desc">{{ a.description }}</p>
            </el-timeline-item>
          </el-timeline>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script>
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import api from "@/services/api";

export default {
  name: "ExpertAiPanel",
  props: {
    analysisData: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const loading = ref(false);
    const expert = ref(null);

    const metaLine = computed(() => {
      const m = expert.value?.meta;
      if (!m?.provider) return "";
      const p = m.provider;
      if (p === "fallback") return "Źródło: reguły + dane (brak klucza API lub błąd modelu).";
      if (String(p).includes("fallback")) return `Źródło: tryb awaryjny (${p}).`;
      return `Model: ${p}${m.model ? ` (${m.model})` : ""}`;
    });

    const tagType = (p) => {
      if (p === "high") return "danger";
      if (p === "medium") return "warning";
      return "primary";
    };

    const escapeHtml = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const formatBlock = (text) => {
      if (!text) return "";
      const safe = escapeHtml(text);
      return safe
        .split(/\n+/)
        .map((line) => `<p>${line || "&nbsp;"}</p>`)
        .join("");
    };

    watch(
      () => props.analysisData,
      () => {
        expert.value = null;
      }
    );

    const runExpert = async () => {
      if (!props.analysisData) {
        ElMessage.warning("Najpierw uruchom analizę kompleksową.");
        return;
      }
      loading.value = true;
      expert.value = null;
      try {
        const { data } = await api.post("/analytics/comprehensive-expert-ai", {
          analysisData: props.analysisData,
        });
        expert.value = data;
        ElMessage.success("Analiza ekspercka gotowa.");
      } catch (e) {
        ElMessage.error(
          e?.response?.data?.error ||
            e?.message ||
            "Nie udało się wygenerować analizy eksperckiej."
        );
      } finally {
        loading.value = false;
      }
    };

    return {
      loading,
      expert,
      metaLine,
      runExpert,
      tagType,
      formatBlock,
    };
  },
};
</script>

<style scoped>
.expert-ai-panel {
  padding: 8px 0 16px;
}
.mb-4 {
  margin-bottom: 16px;
}
.hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: #909399;
  max-width: 52rem;
  line-height: 1.5;
}
.prose {
  font-size: 14px;
  line-height: 1.65;
  color: #303133;
}
.prose :deep(p) {
  margin: 0 0 10px;
}
.action-desc {
  margin: 6px 0 0;
  color: #606266;
  font-size: 13px;
}
</style>
