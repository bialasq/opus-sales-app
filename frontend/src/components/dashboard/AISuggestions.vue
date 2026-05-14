<template>
  <section
    class="dashboard-card relative overflow-hidden border-indigo-100/80 bg-gradient-to-br from-white via-indigo-50/30 to-violet-50/40"
    aria-label="Inteligentna analiza AI"
  >
    <div
      class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-400/10 blur-2xl"
    />

    <div class="dashboard-card-header relative border-indigo-100/60">
      <div class="flex min-w-0 flex-1 items-start gap-4">
        <div class="relative shrink-0">
          <span
            class="absolute inset-0 scale-110 rounded-2xl bg-indigo-400/25 robot-pulse"
            aria-hidden="true"
          />
          <div
            class="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg sm:h-14 sm:w-14"
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
            <span class="font-medium text-indigo-700">rotationRate</span>
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
      <el-button
        type="primary"
        plain
        class="!shrink-0 !rounded-xl !border-indigo-200 !font-medium"
        :loading="loading"
        :disabled="!filename"
        @click="loadInsights"
      >
        Odśwież
      </el-button>
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
      <div class="flex items-center gap-2 text-sm font-medium text-slate-600">
        <el-icon class="is-loading text-xl text-indigo-500"><Loading /></el-icon>
        <span>Analiza modelu — to może potrwać kilkanaście sekund…</span>
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
        class="group flex gap-3 rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm transition-all hover:border-indigo-200/80 hover:shadow-md sm:gap-4 sm:p-5"
        :class="priorityBorderClass(item.priority)"
      >
        <span
          class="mt-0.5 inline-flex h-8 min-w-[2.75rem] shrink-0 items-center justify-center rounded-lg px-2 text-[0.65rem] font-bold uppercase tracking-wide text-white sm:h-9 sm:min-w-[3rem] sm:text-xs"
          :class="priorityBadgeClass(item.priority)"
        >
          {{ priorityLabel(item.priority) }}
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold text-slate-900 sm:text-base">
            {{ item.title }}
          </h3>
          <p class="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
            {{ item.description }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<script>
import { ref, computed, watch, onMounted } from "vue";
import { useStore } from "vuex";
import { ElMessage } from "element-plus";
import { getAiInsights } from "@/services/api";

export default {
  name: "AISuggestions",
  setup() {
    const store = useStore();
    const loading = ref(false);
    const error = ref("");
    const suggestions = ref([]);
    const meta = ref({ provider: "", productCount: 0, emptyDataset: false });

    const filename = computed(() => store.state.currentFile || "");

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
      return `${prefix} · ${m.productCount} produktów w analizie`;
    });

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
      try {
        const data = await getAiInsights(filename.value);
        suggestions.value = data.suggestions || [];
        meta.value = {
          provider: data.meta?.provider || "",
          productCount: data.meta?.productCount ?? 0,
          emptyDataset: Boolean(data.meta?.emptyDataset),
        };
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
        meta.value = { provider: "", productCount: 0, emptyDataset: false };
      } finally {
        loading.value = false;
      }
    };

    watch(filename, (name) => {
      if (name) loadInsights();
      else {
        suggestions.value = [];
        meta.value = { provider: "", productCount: 0, emptyDataset: false };
        error.value = "";
      }
    });

    onMounted(() => {
      if (filename.value) loadInsights();
    });

    return {
      filename,
      loading,
      error,
      suggestions,
      metaLine,
      showEmptyDataState,
      loadInsights,
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
