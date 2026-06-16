<template>
  <el-dialog
    v-model="visibleModel"
    title="Proces myślowy AI"
    width="min(720px, 96vw)"
    class="agentic-trace-dialog"
    destroy-on-close
  >
    <div v-if="analystFacts?.anomalies?.length" class="anomalies-block">
      <p class="section-label">Anomalie wykryte przez Analityka</p>
      <div class="anomaly-tags">
        <el-tag
          v-for="(a, i) in analystFacts.anomalies"
          :key="i"
          type="warning"
          effect="plain"
          round
          class="anomaly-tag"
        >
          {{ a }}
        </el-tag>
      </div>
    </div>

    <el-empty
      v-if="!trace?.length"
      description="Brak śladu ReAct — tryb regułowy lub starsza odpowiedź API."
      :image-size="64"
    />

    <el-timeline v-else class="react-timeline">
      <el-timeline-item
        v-for="(step, index) in trace"
        :key="index"
        :timestamp="`Krok ${index + 1}`"
        placement="top"
        type="primary"
      >
        <div class="trace-step">
          <div class="trace-block thought">
            <span class="trace-label">Thought</span>
            <p>{{ step.thought || "—" }}</p>
          </div>
          <div v-if="step.action" class="trace-block action">
            <span class="trace-label">Action</span>
            <p>
              <el-tag size="small" type="info">{{ step.action }}</el-tag>
              <code v-if="step.actionInput && Object.keys(step.actionInput).length" class="action-args">
                {{ formatArgs(step.actionInput) }}
              </code>
            </p>
          </div>
          <div v-if="step.observation" class="trace-block observation">
            <span class="trace-label">Observation</span>
            <pre class="obs-pre">{{ truncate(step.observation) }}</pre>
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>

    <template v-if="observabilityLine" #footer>
      <p class="obs-line">{{ observabilityLine }}</p>
    </template>
  </el-dialog>
</template>

<script>
import { computed } from "vue";

export default {
  name: "AgenticTraceDialog",
  props: {
    modelValue: { type: Boolean, default: false },
    trace: { type: Array, default: () => [] },
    analystFacts: { type: Object, default: null },
    meta: { type: Object, default: null },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const visibleModel = computed({
      get: () => props.modelValue,
      set: (v) => emit("update:modelValue", v),
    });

    const observabilityLine = computed(() => {
      const m = props.meta;
      if (!m?.sessionId && m?.latency_ms == null) return "";
      const parts = [];
      if (m.sessionId) parts.push(`Sesja: ${m.sessionId.slice(0, 8)}…`);
      if (m.latency_ms != null) parts.push(`${m.latency_ms} ms`);
      if (m.total_tokens != null) parts.push(`${m.total_tokens} tokenów`);
      if (m.cost_usd != null) parts.push(`~$${m.cost_usd.toFixed(4)}`);
      if (m.promptVersion) parts.push(m.promptVersion);
      return parts.join(" · ");
    });

    const formatArgs = (args) => {
      try {
        return JSON.stringify(args);
      } catch {
        return "";
      }
    };

    const truncate = (s, max = 1200) => {
      const t = String(s);
      return t.length > max ? `${t.slice(0, max)}…` : t;
    };

    return {
      visibleModel,
      observabilityLine,
      formatArgs,
      truncate,
    };
  },
};
</script>

<style scoped>
.anomalies-block {
  margin-bottom: 20px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
}
.section-label {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #92400e;
}
.anomaly-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.anomaly-tag {
  max-width: 100%;
  height: auto;
  white-space: normal;
  line-height: 1.35;
  padding: 6px 10px;
}
.react-timeline {
  padding: 4px 0 0;
}
.trace-step {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.trace-block {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.trace-block.thought {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}
.trace-block.action {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
}
.trace-block.observation {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.trace-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  margin-bottom: 4px;
}
.trace-block p {
  margin: 0;
  color: #334155;
}
.action-args {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #475569;
  word-break: break-all;
}
.obs-pre {
  margin: 0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #475569;
  max-height: 200px;
  overflow-y: auto;
}
.obs-line {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
  text-align: right;
}
</style>
