<template>
  <article
    class="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover sm:p-5"
  >
    <div
      class="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.08]"
      :style="{ backgroundColor: accent }"
    />
    <div class="relative flex items-start gap-4">
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
        :style="{
          backgroundColor: `${accent}26`,
          color: accent,
        }"
      >
        <el-icon :size="22"><component :is="icon" /></el-icon>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-[0.8125rem]">
          {{ label }}
        </p>
        <p
          class="mt-1 break-words text-xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-2xl"
        >
          {{ value }}
        </p>
        <p v-if="hint" class="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
          {{ hint }}
        </p>
      </div>
    </div>
  </article>
</template>

<script>
export default {
  name: "StatCard",
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    icon: { type: String, required: true },
    accent: { type: String, default: "#4f46e5" },
    hint: { type: String, default: "" },
  },
};
</script>
