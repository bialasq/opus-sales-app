import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { ElMessage } from "element-plus";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import AuthView from "@/views/AuthView.vue";

/**
 * Widoki ładowane leniwie (osobne chunki) — wyjątek: AuthView, bo to pierwszy
 * ekran niezalogowanego użytkownika i nie chcemy dodatkowej rundy sieciowej.
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Auth",
    component: AuthView,
    meta: { public: true, title: "Logowanie" },
  },
  {
    path: "/",
    name: "Dashboard",
    component: () => import("@/components/Dashboard.vue"),
    meta: { title: "Dashboard" },
  },
  {
    path: "/customers",
    name: "CustomerProfiling",
    component: () => import("@/components/CustomerProfiling.vue"),
    meta: { title: "Profile klientów" },
  },
  {
    path: "/products",
    name: "ProductAnalysis",
    component: () => import("@/components/ProductAnalysis.vue"),
    meta: { title: "Analiza produktów" },
  },
  {
    path: "/anomalies",
    name: "AnomalyDetection",
    component: () => import("@/components/AnomalyDetection.vue"),
    meta: { title: "Wykrywanie anomalii" },
  },
  {
    path: "/payments",
    name: "PaymentMonitoring",
    component: () => import("@/components/PaymentMonitoring.vue"),
    meta: { title: "Monitoring płatności" },
  },
  {
    path: "/analysis",
    name: "ComprehensiveAnalysis",
    component: () => import("@/components/ComprehensiveAnalysis.vue"),
    meta: { title: "Kompleksowa analiza" },
  },
  {
    path: "/files",
    name: "Files",
    component: () => import("@/views/FilesView.vue"),
    meta: { title: "Pliki" },
  },
  {
    path: "/ai-jobs",
    name: "AiJobs",
    component: () => import("@/views/AiJobsView.vue"),
    meta: { title: "Historia AI" },
  },
  {
    path: "/admin",
    name: "Admin",
    component: () => import("@/views/AdminView.vue"),
    meta: { title: "Administracja", requiresRole: ["OWNER", "ADMIN"] },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("@/views/NotFoundView.vue"),
    meta: { public: true, title: "Nie znaleziono" },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // Przy PIERWSZEJ nawigacji (np. reload) odtwórz sesję z refresh-cookie ZANIM
  // zdecydujemy o dostępie — inaczej zalogowany user zostaje wyrzucony na /login,
  // bo access token (tylko w pamięci) jeszcze nie istnieje. bootstrap jest idempotentny.
  if (!auth.ready) {
    const restored = await auth.bootstrap();
    if (restored) {
      const workspace = useWorkspaceStore();
      await workspace.restoreWorkspace().catch(() => {});
    }
  }

  if (to.meta.title) {
    document.title = `${String(to.meta.title)} · Opus Sales`;
  }

  if (to.meta.public) return true;

  if (!auth.isLoggedIn) {
    return { name: "Auth", query: { redirect: to.fullPath } };
  }

  const required = to.meta.requiresRole as string[] | undefined;
  if (required && (!auth.role || !required.includes(auth.role))) {
    ElMessage.warning("Brak uprawnień do tej sekcji");
    return { name: "Dashboard" };
  }

  return true;
});

export default router;
