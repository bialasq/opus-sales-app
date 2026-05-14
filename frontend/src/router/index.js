// frontend/src/router/index.js
import { createRouter, createWebHistory } from "vue-router";
import Dashboard from "../components/Dashboard.vue";
import CustomerProfiling from "../components/CustomerProfiling.vue";
import ProductAnalysis from "../components/ProductAnalysis.vue";
import AnomalyDetection from "../components/AnomalyDetection.vue";
import PaymentMonitoring from "../components/PaymentMonitoring.vue";
import ComprehensiveAnalysis from "../components/ComprehensiveAnalysis.vue";

const routes = [
  {
    path: "/",
    name: "Dashboard",
    component: Dashboard,
  },
  {
    path: "/customers",
    name: "CustomerProfiling",
    component: CustomerProfiling,
  },
  {
    path: "/products",
    name: "ProductAnalysis",
    component: ProductAnalysis,
  },
  {
    path: "/anomalies",
    name: "AnomalyDetection",
    component: AnomalyDetection,
  },
  {
    path: "/payments",
    name: "PaymentMonitoring",
    component: PaymentMonitoring,
  },
  {
    path: "/analysis",
    name: "ComprehensiveAnalysis",
    component: ComprehensiveAnalysis,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
