// frontend/src/main.js
import { createApp } from "vue";
import * as Sentry from "@sentry/vue";
import { initSession } from "./services/auth";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import ElementPlus, { ElMessage } from "element-plus";
import "element-plus/dist/index.css";
import "./assets/tailwind.css";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

const app = createApp(App);

const sentryDsn =
  (typeof window !== "undefined" &&
    window.__APP_CONFIG__ &&
    window.__APP_CONFIG__.SENTRY_DSN) ||
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

// Rejestruj wszystkie ikony
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(store);
app.use(router);
app.use(ElementPlus);

window.addEventListener("opus:logout", () => {
  store.commit("clearUser");
  router.push({ name: "Auth" });
});

app.config.globalProperties.$message = ElMessage;

// Odtwarzamy sesję z httpOnly refresh-cookie ZANIM zamontujemy aplikację,
// inaczej po przeładowaniu strony (access token tylko w pamięci) router
// przekierowałby zalogowanego użytkownika na ekran logowania.
async function bootstrap() {
  try {
    const restored = await initSession();
    if (restored) {
      await store.dispatch("loadMe").catch(() => {});
    }
  } catch {
    /* brak ważnej sesji — wejdziemy jako niezalogowani */
  }
  app.mount("#app");
}

bootstrap();
