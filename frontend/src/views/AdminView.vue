<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Budżet AI -->
    <el-card class="!rounded-2xl !border-slate-200/80 dark:!border-slate-700">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold">Budżet AI (dziś)</h2>
          <el-button size="small" :loading="budgetLoading" @click="loadBudget">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </template>

      <div v-if="budget" class="space-y-3">
        <el-progress
          :percentage="budgetPercent"
          :status="budgetPercent >= 90 ? 'exception' : undefined"
          :stroke-width="14"
        />
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-lg font-semibold tabular-nums">
              ${{ budget.currentSpendUsd.toFixed(2) }}
            </p>
            <p class="text-xs text-slate-500">wydane</p>
          </div>
          <div>
            <p class="text-lg font-semibold tabular-nums">
              ${{ budget.remainingUsd.toFixed(2) }}
            </p>
            <p class="text-xs text-slate-500">pozostało</p>
          </div>
          <div>
            <p class="text-lg font-semibold tabular-nums">
              ${{ budget.maxUsdPerDay.toFixed(2) }}
            </p>
            <p class="text-xs text-slate-500">limit dzienny</p>
          </div>
        </div>
        <p class="text-right text-xs text-slate-400">{{ budget.dateKey }}</p>
      </div>
      <el-skeleton v-else :rows="3" animated />
    </el-card>

    <!-- Status LLM -->
    <el-card class="!rounded-2xl !border-slate-200/80 dark:!border-slate-700">
      <template #header>
        <h2 class="text-base font-semibold">Dostawca LLM</h2>
      </template>

      <div v-if="llm" class="space-y-3">
        <div class="flex items-center gap-2">
          <el-tag :type="llm.available ? 'success' : 'danger'" effect="dark">
            {{ llm.available ? "Dostępny" : "Niedostępny" }}
          </el-tag>
          <span class="font-medium capitalize">{{ llm.provider }}</span>
        </div>
        <ul class="space-y-1 text-sm">
          <li class="flex items-center gap-2">
            <el-icon :class="llm.hasOpenAiKey ? 'text-emerald-500' : 'text-slate-300'">
              <CircleCheckFilled />
            </el-icon>
            Klucz OpenAI {{ llm.hasOpenAiKey ? "skonfigurowany" : "brak" }}
          </li>
          <li class="flex items-center gap-2">
            <el-icon :class="llm.hasAnthropicKey ? 'text-emerald-500' : 'text-slate-300'">
              <CircleCheckFilled />
            </el-icon>
            Klucz Anthropic {{ llm.hasAnthropicKey ? "skonfigurowany" : "brak" }}
          </li>
        </ul>
        <el-alert
          v-if="llm.hint"
          :title="llm.hint"
          type="info"
          :closable="false"
          show-icon
        />
      </div>
      <el-skeleton v-else :rows="3" animated />
    </el-card>

    <!-- Operacje -->
    <el-card
      class="!rounded-2xl !border-slate-200/80 dark:!border-slate-700 lg:col-span-2"
    >
      <template #header>
        <h2 class="text-base font-semibold">Operacje</h2>
      </template>
      <div class="flex flex-wrap items-center gap-3">
        <el-popconfirm
          title="Wyczyścić cache odpowiedzi AI?"
          confirm-button-text="Wyczyść"
          cancel-button-text="Anuluj"
          @confirm="clearCache"
        >
          <template #reference>
            <el-button type="warning" plain :loading="cacheClearing">
              <el-icon class="mr-1"><Delete /></el-icon>
              Wyczyść cache AI
            </el-button>
          </template>
        </el-popconfirm>
        <p class="text-xs text-slate-500">
          Wymusza świeże analizy — kolejne zapytania trafią do modelu zamiast do
          cache (koszt tokenów).
        </p>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  clearAiCache,
  getAdminBudget,
  getLlmStatus,
  type BudgetStatusResponse,
  type LlmStatusResponse,
} from "@/services/api";

const budget = ref<BudgetStatusResponse | null>(null);
const budgetLoading = ref(false);
const llm = ref<LlmStatusResponse | null>(null);
const cacheClearing = ref(false);

const budgetPercent = computed(() => {
  if (!budget.value || budget.value.maxUsdPerDay <= 0) return 0;
  return Math.min(
    100,
    Math.round((budget.value.currentSpendUsd / budget.value.maxUsdPerDay) * 100)
  );
});

async function loadBudget(): Promise<void> {
  budgetLoading.value = true;
  try {
    budget.value = await getAdminBudget();
  } catch {
    ElMessage.error("Nie udało się pobrać budżetu");
  } finally {
    budgetLoading.value = false;
  }
}

async function loadLlm(): Promise<void> {
  try {
    llm.value = await getLlmStatus();
  } catch {
    ElMessage.error("Nie udało się pobrać statusu LLM");
  }
}

async function clearCache(): Promise<void> {
  cacheClearing.value = true;
  try {
    const { cleared } = await clearAiCache();
    ElMessage.success(`Cache wyczyszczony (${cleared} wpisów)`);
  } catch {
    ElMessage.error("Nie udało się wyczyścić cache");
  } finally {
    cacheClearing.value = false;
  }
}

onMounted(() => {
  void loadBudget();
  void loadLlm();
});
</script>
