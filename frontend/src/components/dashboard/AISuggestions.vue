<template>
  <section
    class="dashboard-card relative overflow-hidden border-amber-100/80 bg-gradient-to-br from-white via-amber-50/40 to-orange-50/40"
    aria-label="Inteligentna analiza AI"
  >
    <div
      class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/10 blur-2xl"
    />

    <div class="dashboard-card-header relative border-amber-100/60">
      <div class="flex min-w-0 flex-1 items-start gap-4">
        <div class="relative shrink-0">
          <span
            class="absolute inset-0 scale-110 rounded-2xl bg-amber-400/25 robot-pulse"
            aria-hidden="true"
          />
          <div
            class="relative flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient text-white shadow-lg sm:h-14 sm:w-14"
          >
            <el-icon class="text-2xl sm:text-[26px]"><Cpu /></el-icon>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
            Inteligentna analiza
          </h2>
          <p class="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Promocje vs domówienia na podstawie
            <span class="font-medium text-orange-700">rotationRate</span>
            produktów z danych sprzedaży.
          </p>
          <p
            v-if="metaLine"
            class="mt-2 text-[0.7rem] font-medium uppercase tracking-wider text-slate-400 sm:text-xs"
          >
            {{ metaLine }}
          </p>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <el-button
          v-if="hasTrace"
          type="default"
          plain
          class="!rounded-xl !font-medium"
          :disabled="loading"
          @click="traceDialogOpen = true"
        >
          <el-icon class="mr-1"><View /></el-icon>
          Proces myślowy AI
        </el-button>
        <el-button
          type="primary"
          plain
          class="!rounded-xl !border-amber-200 !font-medium"
          :loading="loading"
          :disabled="!filename"
          @click="loadInsights"
        >
          Analizuj
        </el-button>
      </div>
    </div>

    <div
      v-if="filename && !loading"
      class="relative mb-4 px-1"
    >
      <label class="mb-1.5 block text-xs font-medium text-slate-600">
        Dodatkowe wytyczne dla AI
      </label>
      <el-input
        v-model="userGuidelines"
        type="textarea"
        :rows="2"
        maxlength="2000"
        show-word-limit
        placeholder="np. Priorytetyzuj produkty z niską marżą"
        class="!text-sm"
      />
      <p class="mt-1 text-[0.65rem] text-slate-400">
        Opcjonalnie — trafią do Stratega jako Direct User Constraint.
      </p>
    </div>

    <div
      v-if="!filename"
      class="relative rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center"
    >
      <el-empty
        description="Wgraj plik z danymi sprzedaży (Excel), aby AI mogło je przeanalizować."
        :image-size="72"
      />
    </div>

    <div v-else-if="loading" class="relative space-y-4 px-1 py-4">
      <div class="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
        <div class="flex items-center gap-2 text-sm font-medium text-orange-900">
          <el-icon class="is-loading text-xl text-amber-500"><Loading /></el-icon>
          <span>{{ agentStep || "Uruchamianie agenta…" }}</span>
        </div>
      </div>
      <el-skeleton animated :rows="5" />
    </div>

    <div v-else-if="error" class="relative">
      <el-alert type="error" :closable="false" show-icon class="!rounded-xl" :title="error" />
    </div>

    <div
      v-else-if="showEmptyDataState"
      class="relative rounded-xl border border-dashed border-amber-200/80 bg-amber-50/40 px-4 py-10 text-center"
    >
      <el-empty
        description="W pliku nie ma danych sprzedaży do analizy (np. arkusz „Sprzedaż” / „Sprzedaz” z kolumną produktu). Uzupełnij plik lub wgraj inny — bez wierszy sprzedaży sugestii nie wygenerujemy."
        :image-size="80"
      >
        <template #image>
          <el-icon class="text-5xl text-amber-500/90"><Document /></el-icon>
        </template>
      </el-empty>
      <p class="mt-2 text-xs text-slate-500">
        Przy braku klucza API, po dodaniu danych nadal działa tryb regułowy (bez modelu zewnętrznego).
      </p>
    </div>

    <div
      v-else-if="suggestions.length === 0"
      class="relative rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center"
    >
      <el-empty description="Brak sugestii do wyświetlenia. Spróbuj odświeżyć po ponownym wgraniu pliku." :image-size="72" />
    </div>

    <ul v-else class="relative space-y-3 sm:space-y-4" role="list">
      <li
        v-for="(item, index) in suggestions"
        :key="index"
        class="group flex gap-3 rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm transition-all hover:border-amber-200/80 hover:shadow-md sm:gap-4 sm:p-5"
        :class="priorityBorderClass(item.priority)"
      >
        <span
          class="mt-0.5 inline-flex h-8 min-w-[2.75rem] shrink-0 items-center justify-center rounded-lg px-2 text-[0.65rem] font-bold uppercase tracking-wide text-white sm:h-9 sm:min-w-[3rem] sm:text-xs"
          :class="priorityBadgeClass(item.priority)"
        >
          {{ priorityLabel(item.priority) }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-semibold text-slate-900 sm:text-base">
              {{ item.title }}
            </h3>
            <el-tag
              v-if="judgeItemFor(index)?.approved"
              type="success"
              size="small"
              effect="plain"
              round
              class="!border-emerald-200 !bg-emerald-50 !text-emerald-800"
            >
              <span class="inline-flex items-center gap-1">
                <el-icon class="text-sm"><CircleCheck /></el-icon>
                Zweryfikowane przez Judge LLM
              </span>
            </el-tag>
            <el-tag
              v-else-if="judgeItemFor(index) && !judgeItemFor(index).approved"
              type="warning"
              size="small"
              effect="plain"
              round
            >
              Judge: wymaga uwagi
            </el-tag>
            <el-tag
              v-if="item.eval?.potential_hallucination"
              type="danger"
              size="small"
              effect="dark"
              round
            >
              potencjalna halucynacja
            </el-tag>
            <el-tag
              v-for="(anomaly, ai) in matchedAnomalies(item)"
              :key="ai"
              type="warning"
              size="small"
              effect="plain"
              round
              class="max-w-[14rem] !h-auto !whitespace-normal !py-1"
            >
              {{ anomaly }}
            </el-tag>
          </div>
          <p class="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
            {{ item.description }}
          </p>
          <div v-if="sessionId" class="mt-3 flex flex-wrap gap-2">
            <el-button
              size="small"
              type="success"
              plain
              :disabled="feedbackGiven[index] === 'approve'"
              @click="submitFeedback(index, 'approve', item)"
            >
              Zatwierdź
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :disabled="feedbackGiven[index] === 'reject'"
              @click="submitFeedback(index, 'reject', item)"
            >
              Odrzuć
            </el-button>
            <el-tag v-if="feedbackGiven[index]" size="small" type="info" effect="plain">
              {{ feedbackGiven[index] === "approve" ? "Zaakceptowano" : "Odrzucono" }}
            </el-tag>
          </div>
        </div>
      </li>
    </ul>

    <AgenticTraceDialog
      v-model="traceDialogOpen"
      :trace="reactTrace"
      :analyst-facts="analystFacts"
      :meta="meta"
    />
  </section>
</template>

<script>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { ElMessage } from "element-plus";
import {
  pollAiInsightsJob,
  postSuggestionFeedback,
  runAiInsightsJob,
} from "@/services/api";
import AgenticTraceDialog from "@/components/shared/AgenticTraceDialog.vue";

export default {
  name: "AISuggestions",
  components: { AgenticTraceDialog },
  setup() {
    const store = useWorkspaceStore();
    const loading = ref(false);
    const error = ref("");
    const suggestions = ref([]);
    const reactTrace = ref([]);
    const analystFacts = ref(null);
    const traceDialogOpen = ref(false);
    const agentStep = ref("");
    const sessionId = ref("");
    const feedbackGiven = ref({});
    const userGuidelines = ref("");
    const meta = ref({ provider: "", productCount: 0, emptyDataset: false });

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Gdy komponent zniknie w trakcie pollingu (nawigacja), przerywamy pętlę —
    // inaczej dalej odpytywalibyśmy backend i ustawiali stan odmontowanego widoku.
    const cancelled = ref(false);
    onBeforeUnmount(() => {
      cancelled.value = true;
    });

    const applyInsightsData = (data) => {
      suggestions.value = data.suggestions || [];
      reactTrace.value = data.reactTrace || [];
      analystFacts.value = data.analystFacts || null;
      sessionId.value = data.meta?.sessionId || "";
      meta.value = {
        ...(data.meta || {}),
        provider: data.meta?.provider || "",
        productCount: data.meta?.productCount ?? 0,
        emptyDataset: Boolean(data.meta?.emptyDataset),
      };
    };

    const hasTrace = computed(
      () => reactTrace.value?.length > 0 || analystFacts.value?.anomalies?.length > 0
    );

    const filename = computed(() => store.currentFile || "");

    const showEmptyDataState = computed(
      () =>
        !!filename.value &&
        !loading.value &&
        !error.value &&
        (meta.value.emptyDataset === true ||
          (meta.value.productCount === 0 && suggestions.value.length === 0))
    );

    const metaLine = computed(() => {
      const m = meta.value;
      if (!m.provider || m.emptyDataset) return "";
      const labels = {
        openai: "Model: OpenAI",
        anthropic: "Model: Claude",
        fallback: "Tryb: reguły (brak klucza API)",
        "openai-error-fallback": "Tryb: reguły (błąd OpenAI)",
        "anthropic-error-fallback": "Tryb: reguły (błąd Claude)",
        "openai-parsed-empty": "Tryb: reguły (niepoprawna odpowiedź modelu)",
        "anthropic-parsed-empty": "Tryb: reguły (niepoprawna odpowiedź modelu)",
      };
      const prefix = labels[m.provider] || `Źródło: ${m.provider}`;
      const cache = m.from_cache ? " · cache" : "";
      const partial = m.partial ? " · częściowe wyniki" : "";
      const personaLabels = {
        store_manager: "Store Manager",
        supply_chain_manager: "Supply Chain",
        financial_controller: "Financial Controller",
      };
      const persona = m.strategistPersona
        ? ` · ${personaLabels[m.strategistPersona] || m.strategistPersona}`
        : "";
      const userHint = m.userInstructionsApplied ? " · wytyczne użytkownika" : "";
      const judge = m.judge_review
        ? ` · Judge ${m.judge_review.overall_pass ? "OK" : "uwaga"}`
        : "";
      return `${prefix} · ${m.productCount} produktów${persona}${userHint}${judge}${cache}${partial}`;
    });

    const judgeItemFor = (index) => {
      const items = meta.value?.judge_review?.items;
      if (!Array.isArray(items)) return null;
      return items.find((i) => i.index === index) ?? items[index] ?? null;
    };

    const priorityLabel = (p) =>
      ({ high: "Pilne", medium: "Ważne", low: "Opcja" }[p] || p);

    const priorityBadgeClass = (p) => {
      if (p === "high") return "bg-rose-600";
      if (p === "medium") return "bg-amber-500";
      return "bg-slate-500";
    };

    const priorityBorderClass = (p) => {
      if (p === "high") return "border-l-4 border-l-rose-500 pl-3 sm:pl-4";
      if (p === "medium") return "border-l-4 border-l-amber-400 pl-3 sm:pl-4";
      return "border-l-4 border-l-slate-300 pl-3 sm:pl-4";
    };

    const loadInsights = async () => {
      if (!filename.value) {
        suggestions.value = [];
        return;
      }
      loading.value = true;
      error.value = "";
      feedbackGiven.value = {};
      agentStep.value = "Przygotowanie analizy…";
      try {
        const { sessionId: sid } = await runAiInsightsJob(
          filename.value,
          userGuidelines.value
        );
        sessionId.value = sid;
        let finished = false;
        for (let i = 0; i < 150 && !finished && !cancelled.value; i++) {
          await sleep(800);
          if (cancelled.value) return;
          const job = await pollAiInsightsJob(sid);
          agentStep.value = job.current_step || agentStep.value;
          if (job.status === "done" && job.result) {
            applyInsightsData(job.result);
            finished = true;
          } else if (job.status === "error") {
            throw new Error(job.error || "Błąd agenta AI");
          }
        }
        if (cancelled.value) return;
        if (!finished) {
          throw new Error("Przekroczono czas oczekiwania na agenta (timeout)");
        }
      } catch (e) {
        const status = e?.response?.status;
        const body = e?.response?.data;
        const base =
          body?.error || e?.message || "Nie udało się pobrać sugestii AI.";
        if (status === 400) {
          /* ElMessage: interceptor w api.ts (walidacja Zod) */
        } else if (status && status >= 500) {
          ElMessage.error({ message: base, duration: 7000, showClose: true });
        } else if (!status) {
          ElMessage.error({ message: base, duration: 6000, showClose: true });
        }
        error.value = base;
        suggestions.value = [];
        reactTrace.value = [];
        analystFacts.value = null;
        meta.value = { provider: "", productCount: 0, emptyDataset: false };
      } finally {
        loading.value = false;
      }
    };

    watch(filename, (name) => {
      if (!name) {
        suggestions.value = [];
        reactTrace.value = [];
        analystFacts.value = null;
        meta.value = { provider: "", productCount: 0, emptyDataset: false };
        error.value = "";
        userGuidelines.value = "";
      }
    });

    const submitFeedback = async (index, verdict, item) => {
      if (!sessionId.value) return;
      try {
        await postSuggestionFeedback({
          sessionId: sessionId.value,
          suggestionIndex: index,
          verdict,
          title: item.title,
          description: item.description,
          filename: filename.value || undefined,
        });
        feedbackGiven.value = { ...feedbackGiven.value, [index]: verdict };
        ElMessage.success(verdict === "approve" ? "Sugestia zatwierdzona" : "Sugestia odrzucona");
      } catch {
        ElMessage.error("Nie udało się zapisać feedbacku");
      }
    };

    const matchedAnomalies = (item) => {
      const anomalies = analystFacts.value?.anomalies || [];
      if (!anomalies.length) return [];
      const text = `${item.title} ${item.description}`.toLowerCase();
      return anomalies.filter((a) => {
        const words = String(a).toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.some((w) => text.includes(w)) || text.includes(String(a).toLowerCase().slice(0, 12));
      }).slice(0, 2);
    };

    return {
      filename,
      loading,
      error,
      suggestions,
      reactTrace,
      analystFacts,
      meta,
      traceDialogOpen,
      hasTrace,
      metaLine,
      showEmptyDataState,
      loadInsights,
      agentStep,
      sessionId,
      feedbackGiven,
      userGuidelines,
      judgeItemFor,
      submitFeedback,
      matchedAnomalies,
      priorityLabel,
      priorityBadgeClass,
      priorityBorderClass,
    };
  },
};
</script>

<style scoped>
.robot-pulse {
  animation: robot-pulse 2.2s ease-in-out infinite;
}
@keyframes robot-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
  50% {
    opacity: 0.65;
    transform: scale(1.08);
  }
}
</style>
