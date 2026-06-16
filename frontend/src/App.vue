<!-- frontend/src/App.vue -->
<template>
  <router-view v-if="isPublicRoute" />
  <DashboardShell v-else :title="pageTitle">
    <template #actions>
      <div class="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <el-upload
          class="upload-compact"
          :action="uploadAction"
          :headers="uploadHeaders"
          :on-success="handleUploadSuccess"
          :on-error="handleUploadError"
          :show-file-list="false"
        >
          <el-button type="primary" class="!rounded-xl !px-4 !font-medium">
            <el-icon class="mr-1"><Upload /></el-icon>
            <span class="hidden sm:inline">Wgraj Excel</span>
            <span class="sm:hidden">Wgraj</span>
          </el-button>
        </el-upload>

        <div
          v-if="loggedIn"
          class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
        >
          <span class="hidden max-w-[10rem] truncate text-sm text-slate-600 sm:inline">
            {{ userLabel }}
          </span>
          <el-button
            type="default"
            size="small"
            class="!rounded-lg"
            @click="handleLogout"
          >
            Wyloguj
          </el-button>
        </div>
      </div>
    </template>
    <ErrorBoundary>
      <router-view />
    </ErrorBoundary>
  </DashboardShell>
</template>

<script>
import { ElMessage } from "element-plus";
import { mapGetters } from "vuex";
import DashboardShell from "@/components/layout/DashboardShell.vue";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import { getAuthHeaders, uploadActionUrl } from "@/services/api";

export default {
  name: "App",
  components: { DashboardShell, ErrorBoundary },
  computed: {
    ...mapGetters(["isLoggedIn"]),
    isPublicRoute() {
      return !!this.$route.meta.public;
    },
    loggedIn() {
      return this.isLoggedIn;
    },
    uploadAction() {
      return uploadActionUrl();
    },
    uploadHeaders() {
      return getAuthHeaders();
    },
    userLabel() {
      const user = this.$store.state.user;
      if (!user) return "";
      return user.email || user.role || "Konto";
    },
    pageTitle() {
      const titles = {
        "/": "Dashboard",
        "/customers": "Profile klientów",
        "/products": "Analiza produktów",
        "/anomalies": "Wykrywanie anomalii",
        "/payments": "Monitoring płatności",
        "/analysis": "Kompleksowa analiza",
      };
      return titles[this.$route.path] || "Opus Sales";
    },
  },
  methods: {
    handleUploadSuccess(response) {
      const data =
        typeof response === "string"
          ? (() => {
              try {
                return JSON.parse(response);
              } catch {
                return null;
              }
            })()
          : response;
      if (!data?.filename) {
        ElMessage.error("Niepoprawna odpowiedź serwera po uploadzie.");
        return;
      }
      this.$store.commit("setCurrentFile", data.filename);
      ElMessage.success("Plik został wgrany pomyślnie!");
    },
    handleUploadError() {
      ElMessage.error(
        "Błąd wgrywania pliku. Upewnij się, że backend działa (npm run dev w folderze backend)."
      );
    },
    async handleLogout() {
      await this.$store.dispatch("doLogout");
      this.$router.push({ name: "Auth" });
    },
  },
};
</script>

<style>
.upload-compact .el-upload {
  display: inline-block;
}
</style>
