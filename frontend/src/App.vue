<!-- frontend/src/App.vue -->
<template>
  <DashboardShell :title="pageTitle">
    <template #actions>
      <el-upload
        class="upload-compact"
        :action="uploadAction"
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
    </template>
    <router-view />
  </DashboardShell>
</template>

<script>
import { ElMessage } from "element-plus";
import DashboardShell from "@/components/layout/DashboardShell.vue";
import { uploadActionUrl } from "@/services/api";

export default {
  name: "App",
  components: { DashboardShell },
  computed: {
    uploadAction() {
      return uploadActionUrl();
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
  },
};
</script>

<style>
.upload-compact .el-upload {
  display: inline-block;
}
</style>
