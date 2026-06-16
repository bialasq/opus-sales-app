<template>
  <div class="min-h-screen bg-slate-50">
    <Transition name="fade">
      <div
        v-if="navOpen"
        class="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        aria-hidden="true"
        @click="navOpen = false"
      />
    </Transition>

    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-[min(100%,17.5rem)] max-w-[85vw] flex-col border-r border-slate-200/90 bg-white shadow-xl transition-transform duration-200 ease-out lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none"
      :class="navOpen ? 'translate-x-0' : '-translate-x-full'"
      :aria-hidden="!navOpen ? 'true' : undefined"
    >
      <div
        class="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-4 lg:h-16"
      >
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-md"
        >
          O
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold tracking-tight text-slate-900">
            Opus Sales
          </p>
          <p class="truncate text-xs text-slate-500">Analityka sprzedaży</p>
        </div>
        <button
          type="button"
          class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
          aria-label="Zamknij menu"
          @click="navOpen = false"
        >
          <el-icon :size="20"><Close /></el-icon>
        </button>
      </div>

      <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3 pb-6">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          :class="
            isActive(item.to)
              ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100'
              : ''
          "
          @click="closeNavMobile"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-white group-hover:text-indigo-600"
            :class="
              isActive(item.to)
                ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100'
                : ''
            "
          >
            <el-icon :size="18"><component :is="item.icon" /></el-icon>
          </span>
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <div class="flex min-h-screen flex-col lg:pl-64">
      <header
        class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md"
      >
        <div
          class="mx-auto flex max-w-content flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 lg:px-8"
        >
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 lg:hidden"
              aria-label="Otwórz menu"
              @click="navOpen = true"
            >
              <el-icon :size="20"><Menu /></el-icon>
            </button>
            <div class="min-w-0">
              <h1
                class="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
              >
                {{ title }}
              </h1>
              <p class="hidden text-xs text-slate-500 sm:block sm:text-sm">
                Podgląd KPI, produktów i trendów sprzedaży
              </p>
            </div>
          </div>

          <div
            class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          >
            <slot name="actions" />
          </div>
        </div>
      </header>

      <main
        class="mx-auto w-full max-w-content flex-1 px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8"
      >
        <slot />
      </main>

      <footer
        class="mt-auto border-t border-slate-200/80 bg-white/90 px-4 py-3 sm:px-5 lg:px-8"
      >
        <div
          class="mx-auto flex max-w-content flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left"
        >
          <p class="text-xs text-slate-500">
            © {{ year }} Opus Sales
          </p>
          <a
            :href="vibeHref"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3 py-1 text-xs font-medium text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
          >
            <span aria-hidden="true">✨</span>
            Powered by AI &amp; Vibe Coding
          </a>
        </div>
      </footer>
    </div>
  </div>
</template>

<script>
import { ref, watch } from "vue";
import { useRoute, RouterLink } from "vue-router";

export default {
  name: "DashboardShell",
  components: { RouterLink },
  props: {
    title: {
      type: String,
      required: true,
    },
  },
  setup() {
    const route = useRoute();
    const navOpen = ref(false);
    const year = new Date().getFullYear();
    const vibeHref =
      import.meta.env.VITE_VIBE_URL || "https://github.com";

    const navItems = [
      { to: "/", label: "Dashboard", icon: "DataAnalysis" },
      { to: "/customers", label: "Profile klientów", icon: "User" },
      { to: "/products", label: "Produkty", icon: "Goods" },
      { to: "/anomalies", label: "Anomalie", icon: "Warning" },
      { to: "/payments", label: "Płatności", icon: "Money" },
      { to: "/analysis", label: "Kompleksowa analiza", icon: "DataAnalysis" },
    ];

    const isActive = (path) => {
      if (path === "/") return route.path === "/";
      return route.path === path || route.path.startsWith(path + "/");
    };

    const closeNavMobile = () => {
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        navOpen.value = false;
      }
    };

    watch(
      () => route.fullPath,
      () => {
        navOpen.value = false;
      }
    );

    return {
      navOpen,
      navItems,
      isActive,
      closeNavMobile,
      year,
      vibeHref,
    };
  },
};
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
