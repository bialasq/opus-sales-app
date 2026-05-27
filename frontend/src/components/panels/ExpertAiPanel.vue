<template>
  <div
    v-loading="loading"
    element-loading-text="Generowanie analizy — zwykle 15–45 sekund…"
    class="expert-ai-panel"
  >
    <el-alert
      v-if="metaLine"
      :title="metaLine"
      :type="metaAlertType"
      :closable="false"
      show-icon
      class="mb-4"
    />

    <div class="flex flex-wrap items-center gap-3">
      <el-button
        type="primary"
        :loading="loading"
        :disabled="!analysisData"
        @click="runExpert"
      >
        <el-icon><Cpu /></el-icon>
        Generuj analizę ekspercką AI (sprzedaż · finanse · marketing)
      </el-button>
      <el-button
        type="default"
        plain
        :loading="traceLoading"
        :disabled="!currentFile"
        @click="loadAgenticTrace"
      >
        <el-icon class="mr-1"><View /></el-icon>
        Proces myślowy AI
      </el-button>
    </div>
    <p v-if="traceLoading && agentStep" class="agent-step">{{ agentStep }}</p>
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

    <AgenticTraceDialog
      v-model="traceDialogOpen"
      :trace="reactTrace"
      :analyst-facts="analystFacts"
      :meta="agenticMeta"
    />
  </div>
</template>

<script>
import { ref, computed, watch } from "vue";
import { useStore } from "vuex";
import { ElMessage } from "element-plus";
import api from "@/services/api";
import { pollAiInsightsJob, runAiInsightsJob } from "@/services/api";
import AgenticTraceDialog from "@/components/shared/AgenticTraceDialog.vue";

export default {
  name: "ExpertAiPanel",
  components: { AgenticTraceDialog },
  props: {
    analysisData: {
      type: Object,
      default: null,
    },
  },
  setup(props) {
    const store = useStore();
    const loading = ref(false);
    const expert = ref(null);
    const reactTrace = ref([]);
    const analystFacts = ref(null);
    const agenticMeta = ref(null);
    const traceDialogOpen = ref(false);
    const traceLoading = ref(false);
    const agentStep = ref("");

    const currentFile = computed(() => store.state.currentFile || "");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const hasAgenticTrace = computed(
      () => reactTrace.value?.length > 0 || analystFacts.value?.anomalies?.length > 0
    );

    const metaAlertType = computed(() => {
      const m = expert.value?.meta;
      if (m?.llmAvailable === false || m?.provider === "fallback") return "warning";
      if (String(m?.provider || "").includes("fallback")) return "warning";
      return "success";
    });

    const metaLine = computed(() => {
      const m = expert.value?.meta;
      if (!m?.provider) return "";
      if (m.setupHint && m.llmAvailable === false) {
        return m.setupHint;
      }
      const p = m.provider;
      if (p === "fallback" || m.llmAvailable === false) {
        return (
          m.setupHint ||
          "Tryb regułowy: brak klucza API. Ustaw OPENAI_API_KEY lub ANTHROPIC_API_KEY w backend/.env i zrestartuj backend."
        );
      }
      if (String(p).includes("fallback")) {
        return m.setupHint || `Tryb awaryjny (${p}) — sprawdź klucz API i model w .env.`;
      }
      return `Analiza LLM: ${p}${m.model ? ` · ${m.model}` : ""}`;
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
        reactTrace.value = [];
        analystFacts.value = null;
        agenticMeta.value = null;
      }
    );

    const loadAgenticTrace = async () => {
      if (!currentFile.value) {
        ElMessage.warning("Wgraj plik Excel, aby zobaczyć trace agenta.");
        return;
      }
      traceLoading.value = true;
      agentStep.value = "Przygotowanie analizy…";
      try {
        const { sessionId } = await runAiInsightsJob(currentFile.value);
        let finished = false;
        for (let i = 0; i < 120 && !finished; i++) {
          await sleep(800);
          const job = await pollAiInsightsJob(sessionId);
          agentStep.value = job.current_step || agentStep.value;
          if (job.status === "done" && job.result) {
            reactTrace.value = job.result.reactTrace || [];
            analystFacts.value = job.result.analystFacts || null;
            agenticMeta.value = job.result.meta || null;
            finished = true;
          } else if (job.status === "error") {
            throw new Error(job.error || "Błąd agenta");
          }
        }
        if (!finished) throw new Error("Timeout agenta AI");
        traceDialogOpen.value = true;
      } catch (e) {
        ElMessage.error(
          e?.response?.data?.error || e?.message || "Nie udało się wczytać trace agenta."
        );
      } finally {
        traceLoading.value = false;
        agentStep.value = "";
      }
    };

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
      metaAlertType,
      runExpert,
      tagType,
      formatBlock,
      currentFile,
      hasAgenticTrace,
      loadAgenticTrace,
      traceLoading,
      agentStep,
      traceDialogOpen,
      reactTrace,
      analystFacts,
      agenticMeta,
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
.agent-step {
  margin: 8px 0 0;
  font-size: 13px;
  color: #6366f1;
  font-weight: 500;
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
