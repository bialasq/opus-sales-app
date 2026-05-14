<!-- frontend/src/App.vue -->
<template>
  <DashboardShell :title="pageTitle">
    <template #actions>
      <el-upload
        class="upload-compact"
        :action="uploadAction"
        :on-success="handleUploadSuccess"
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
      this.$store.commit("setCurrentFile", response.filename);
      this.$message.success("Plik został wgrany pomyślnie!");
    },
  },
};
</script>

<style>
.upload-compact .el-upload {
  display: inline-block;
}
</style>
