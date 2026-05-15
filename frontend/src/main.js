// frontend/src/main.js
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import ElementPlus, { ElMessage } from "element-plus";
import "element-plus/dist/index.css";
import "./assets/tailwind.css";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

const app = createApp(App);

// Rejestruj wszystkie ikony
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(store);
app.use(router);
app.use(ElementPlus);

app.config.globalProperties.$message = ElMessage;

app.mount("#app");
