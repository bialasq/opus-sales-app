import { createApp } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import ElementPlus, { ElMessage } from "element-plus";
import "element-plus/dist/index.css";
// Zmienne CSS trybu ciemnego Element Plus — aktywowane klasą `dark` na <html>.
import "element-plus/theme-chalk/dark/css-vars.css";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth";
import { useUiStore } from "./stores/ui";
import { useWorkspaceStore } from "./stores/workspace";
import "./assets/tailwind.css";

const app = createApp(App);
const pinia = createPinia();

// Pinia PRZED routerem — guard nawigacji czyta store'y auth.
app.use(pinia);

type RuntimeAppConfig = { SENTRY_DSN?: string };
const sentryDsn =
  (typeof window !== "undefined" &&
    (window as Window & { __APP_CONFIG__?: RuntimeAppConfig }).__APP_CONFIG__
      ?.SENTRY_DSN) ||
  import.meta.env.VITE_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    app,
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration({ router })],
    tracesSampleRate: 0.1,
  });
}

app.config.errorHandler = (err, _instance, info) => {
  console.error("Vue error:", err, info);
  if (sentryDsn) {
    Sentry.captureException(err, { extra: { info } });
  }
};

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(router);
app.use(ElementPlus);
app.config.globalProperties.$message = ElMessage;

const authStore = useAuthStore();
const uiStore = useUiStore();
const workspaceStore = useWorkspaceStore();

// Definitywne 401 z interceptora axios (refresh nie pomógł) → pełne wylogowanie.
window.addEventListener("opus:logout", () => {
  authStore.clear();
  workspaceStore.reset();
  router.push({ name: "Auth" });
});

// Motyw od razu (bez mignięcia). Odtworzenie sesji z cookie robi guard routera
// przy pierwszej nawigacji (patrz router/index.ts) — dzięki temu reload zalogowanej
// strony nie wyrzuca usera na /login zanim refresh zdąży odtworzyć token.
uiStore.initTheme();
app.mount("#app");
