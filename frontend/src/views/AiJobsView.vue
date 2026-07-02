<template>
  <div class="space-y-4">
    <el-card class="!rounded-2xl !border-slate-200/80 dark:!border-slate-700">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">Historia analiz AI</h2>
            <p class="text-xs text-slate-500">
              Joby agentowe organizacji — trwające odświeżają się automatycznie.
            </p>
          </div>
          <el-button :loading="workspace.jobsLoading" @click="refresh">
            <el-icon class="mr-1"><Refresh /></el-icon>
            Odśwież
          </el-button>
        </div>
      </template>

      <el-empty
        v-if="!workspace.jobsLoading && workspace.jobs.length === 0"
        description="Brak analiz — uruchom pierwszą w Kompleksowej analizie."
      />

      <el-table
        v-else
        v-loading="workspace.jobsLoading"
        :data="workspace.jobs"
        row-key="sessionId"
        class="w-full"
      >
        <el-table-column label="Status" width="130">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small" effect="dark">
              <el-icon v-if="isActive(row.status)" class="is-loading mr-1">
                <Loading />
              </el-icon>
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Plik" min-width="200">
          <template #default="{ row }">
            <span class="truncate text-sm">
              {{ row.file?.originalName || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="Etap / błąd" min-width="240">
          <template #default="{ row }">
            <span
              v-if="row.status === 'FAILED'"
              class="text-sm text-red-500"
              :title="row.errorMessage || ''"
            >
              {{ truncate(row.errorMessage || "Nieznany błąd", 80) }}
            </span>
            <span v-else class="text-sm text-slate-500">
              {{ row.currentStep || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="Uruchomił(a)" min-width="150">
          <template #default="{ row }">
            <span class="text-sm">
              {{ row.createdBy?.name || row.createdBy?.email || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="Start" width="150">
          <template #default="{ row }">
            <span class="text-sm">{{ formatDate(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Czas" width="90" align="right">
          <template #default="{ row }">
            <span class="text-sm tabular-nums">{{ duration(row) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from "vue";
import type { AiJobSummary } from "@shared/api-types";
import { useWorkspaceStore } from "@/stores/workspace";

const workspace = useWorkspaceStore();

const POLL_MS = 4000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function isActive(status: AiJobSummary["status"]): boolean {
  return status === "PENDING" || status === "RUNNING";
}

function statusTag(status: AiJobSummary["status"]) {
  switch (status) {
    case "DONE":
      return "success";
    case "FAILED":
      return "danger";
    case "RUNNING":
      return "primary";
    default:
      return "info";
  }
}

function statusLabel(status: AiJobSummary["status"]): string {
  switch (status) {
    case "DONE":
      return "Gotowe";
    case "FAILED":
      return "Błąd";
    case "RUNNING":
      return "W toku";
    default:
      return "W kolejce";
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function duration(row: AiJobSummary): string {
  const start = new Date(row.createdAt).getTime();
  const end = isActive(row.status)
    ? Date.now()
    : new Date(row.updatedAt).getTime();
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function refresh(): void {
  void workspace.fetchJobs();
}

// Polling tylko gdy coś faktycznie się liczy — bez trwających jobów nie ma
// sensu odpytywać backendu.
function syncPolling(): void {
  const shouldPoll = workspace.runningJobs.length > 0;
  if (shouldPoll && !pollTimer) {
    pollTimer = setInterval(() => void workspace.fetchJobs(), POLL_MS);
  } else if (!shouldPoll && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

watch(() => workspace.runningJobs.length, syncPolling);

onMounted(() => {
  void workspace.fetchJobs().then(syncPolling);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
