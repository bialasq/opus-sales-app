<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
    <el-result
      icon="warning"
      title="404"
      sub-title="Taka strona nie istnieje."
    >
      <template #extra>
        <el-button type="primary" @click="goHome">Wróć do dashboardu</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
const goHome = () => router.push({ name: "Dashboard" });
</script>
