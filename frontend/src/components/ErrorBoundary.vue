<template>
  <div v-if="hasError" class="error-fallback p-4">
    <el-alert type="error" :closable="false" title="Coś poszło nie tak">
      <template #default>
        <p class="mb-2">Widok napotkał błąd. Możesz spróbować ponownie.</p>
        <el-button type="primary" @click="reset">Spróbuj ponownie</el-button>
      </template>
    </el-alert>
  </div>
  <slot v-else />
</template>

<script setup>
import { ref, onErrorCaptured } from "vue";

const hasError = ref(false);

onErrorCaptured((err) => {
  hasError.value = true;
  console.error(err);
  return false;
});

function reset() {
  hasError.value = false;
}
</script>
