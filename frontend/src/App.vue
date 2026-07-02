<!-- frontend/src/App.vue -->
<template>
  <router-view v-if="isPublicRoute" />
  <DashboardShell v-else :title="pageTitle">
    <template #actions>
      <div class="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <!-- Aktywny plik — globalny kontekst analiz -->
        <button
          v-if="workspace.hasFile"
          type="button"
          class="hidden max-w-[14rem] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100 md:inline-flex dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          title="Aktywny plik — kliknij, aby zarządzać plikami"
          @click="$router.push({ name: 'Files' })"
        >
          <el-icon :size="14"><Document /></el-icon>
          <span class="truncate">{{ workspace.currentFileLabel }}</span>
        </button>

        <el-upload
          class="upload-compact"
          :action="uploadAction"
          :headers="uploadHeaders"
          :before-upload="beforeUpload"
          :on-success="handleUploadSuccess"
          :on-error="handleUploadError"
          :show-file-list="false"
          accept=".xlsx,.xls"
        >
          <el-button type="primary" class="!rounded-xl !px-4 !font-medium">
            <el-icon class="mr-1"><Upload /></el-icon>
            <span class="hidden sm:inline">Wgraj Excel</span>
            <span class="sm:hidden">Wgraj</span>
          </el-button>
        </el-upload>

        <!-- Przełącznik motywu -->
        <el-tooltip
          :content="ui.dark ? 'Tryb jasny' : 'Tryb ciemny'"
          placement="bottom"
        >
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
            aria-label="Przełącz motyw"
            @click="ui.toggleDark()"
          >
            <el-icon :size="18">
              <Sunny v-if="ui.dark" />
              <Moon v-else />
            </el-icon>
          </button>
        </el-tooltip>

        <!-- Menu użytkownika -->
        <el-dropdown v-if="auth.isLoggedIn" trigger="click">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800"
          >
            <span
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-bold text-white"
            >
              {{ userInitial }}
            </span>
            <span
              class="hidden max-w-[10rem] truncate text-sm text-slate-700 sm:inline dark:text-slate-200"
            >
              {{ auth.displayName }}
            </span>
            <el-icon :size="14" class="text-slate-400"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <div class="px-4 py-2">
                <p class="text-sm font-medium">{{ auth.me?.email }}</p>
                <p class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <el-tag size="small" :type="roleTagType">{{ roleLabel }}</el-tag>
                  <span v-if="auth.me?.organizationName" class="truncate">
                    {{ auth.me.organizationName }}
                  </span>
                </p>
              </div>
              <el-dropdown-item divided @click="$router.push({ name: 'Files' })">
                <el-icon><Folder /></el-icon> Pliki
              </el-dropdown-item>
              <el-dropdown-item @click="$router.push({ name: 'AiJobs' })">
                <el-icon><Clock /></el-icon> Historia AI
              </el-dropdown-item>
              <el-dropdown-item
                v-if="auth.isAdmin"
                @click="$router.push({ name: 'Admin' })"
              >
                <el-icon><Setting /></el-icon> Administracja
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">
                <el-icon><SwitchButton /></el-icon> Wyloguj
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </template>
    <ErrorBoundary>
      <router-view />
    </ErrorBoundary>
  </DashboardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import DashboardShell from "@/components/layout/DashboardShell.vue";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import { getAuthHeaders, uploadActionUrl } from "@/services/api";
import { ensureFreshToken } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useWorkspaceStore } from "@/stores/workspace";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const workspace = useWorkspaceStore();

const isPublicRoute = computed(() => !!route.meta.public);
const pageTitle = computed(() => String(route.meta.title ?? "Opus Sales"));

const uploadAction = computed(() => uploadActionUrl());
const uploadHeaders = computed(() => getAuthHeaders());

const userInitial = computed(() =>
  (auth.displayName || "?").charAt(0).toUpperCase()
);

const roleLabel = computed(() => {
  switch (auth.role) {
    case "OWNER":
      return "Właściciel";
    case "ADMIN":
      return "Administrator";
    default:
      return "Użytkownik";
  }
});

const roleTagType = computed(() =>
  auth.role === "OWNER" ? "warning" : auth.role === "ADMIN" ? "success" : "info"
);

// Upload omija interceptor axios — zapewniamy świeży token z cookie.
async function beforeUpload(): Promise<boolean> {
  const ok = await ensureFreshToken();
  if (!ok) {
    ElMessage.error("Sesja wygasła — zaloguj się ponownie i spróbuj wgrać plik.");
    router.push({ name: "Auth" });
    return false;
  }
  return true;
}

function handleUploadSuccess(response: unknown): void {
  const data =
    typeof response === "string"
      ? (() => {
          try {
            return JSON.parse(response) as { filename?: string };
          } catch {
            return null;
          }
        })()
      : (response as { filename?: string } | null);
  if (!data?.filename) {
    ElMessage.error("Niepoprawna odpowiedź serwera po uploadzie.");
    return;
  }
  workspace.setCurrentFile(data.filename);
  void workspace.fetchFiles();
  ElMessage.success("Plik został wgrany pomyślnie!");
}

function handleUploadError(): void {
  ElMessage.error(
    "Błąd wgrywania pliku. Upewnij się, że backend działa (npm run dev w folderze backend)."
  );
}

async function handleLogout(): Promise<void> {
  await auth.logout();
  workspace.reset();
  router.push({ name: "Auth" });
}
</script>

<style>
.upload-compact .el-upload {
  display: inline-block;
}
</style>
