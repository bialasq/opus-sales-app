<template>
  <div class="space-y-4">
    <el-card class="!rounded-2xl !border-slate-200/80 dark:!border-slate-700">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">Pliki organizacji</h2>
            <p class="text-xs text-slate-500">
              Wgrane arkusze Excel — wybierz aktywny plik do analiz.
            </p>
          </div>
          <el-button
            :loading="workspace.filesLoading"
            @click="refresh"
          >
            <el-icon class="mr-1"><Refresh /></el-icon>
            Odśwież
          </el-button>
        </div>
      </template>

      <el-empty
        v-if="!workspace.filesLoading && workspace.files.length === 0"
        description="Brak plików — wgraj pierwszy Excel przyciskiem w nagłówku."
      />

      <el-table
        v-else
        v-loading="workspace.filesLoading"
        :data="workspace.files"
        row-key="id"
        class="w-full"
      >
        <el-table-column label="Plik" min-width="240">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <el-icon class="text-emerald-600"><Document /></el-icon>
              <div class="min-w-0">
                <p class="truncate font-medium">{{ row.originalName }}</p>
                <p class="truncate text-xs text-slate-400">
                  {{ formatSize(row.sizeBytes) }}
                </p>
              </div>
              <el-tag
                v-if="row.storageKey === workspace.currentFile"
                type="success"
                size="small"
                effect="dark"
                class="ml-1 shrink-0"
              >
                aktywny
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Wgrał(a)" min-width="160">
          <template #default="{ row }">
            <span class="text-sm">
              {{ row.uploadedBy?.name || row.uploadedBy?.email || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="Data" width="150">
          <template #default="{ row }">
            <span class="text-sm">{{ formatDate(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Analizy AI" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.jobsCount }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Akcje" width="230" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.storageKey !== workspace.currentFile"
              size="small"
              type="primary"
              plain
              @click="activate(row)"
            >
              Ustaw aktywny
            </el-button>
            <el-button
              v-else
              size="small"
              type="primary"
              @click="goAnalyze"
            >
              Analizuj
            </el-button>
            <el-popconfirm
              title="Usunąć plik i powiązane analizy?"
              confirm-button-text="Usuń"
              cancel-button-text="Anuluj"
              confirm-button-type="danger"
              @confirm="remove(row)"
            >
              <template #reference>
                <el-button size="small" type="danger" plain>
                  Usuń
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import type { OrgFileSummary } from "@shared/api-types";
import { useWorkspaceStore } from "@/stores/workspace";

const workspace = useWorkspaceStore();
const router = useRouter();

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function activate(row: OrgFileSummary): void {
  workspace.setCurrentFile(row.storageKey);
  ElMessage.success(`Aktywny plik: ${row.originalName}`);
}

function goAnalyze(): void {
  router.push({ name: "ComprehensiveAnalysis" });
}

async function remove(row: OrgFileSummary): Promise<void> {
  try {
    await workspace.removeFile(row.id);
    ElMessage.success("Plik usunięty");
  } catch {
    ElMessage.error("Nie udało się usunąć pliku (brak uprawnień?)");
  }
}

function refresh(): void {
  void workspace.fetchFiles();
}

onMounted(() => {
  void workspace.fetchFiles();
});
</script>
