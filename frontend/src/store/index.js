// frontend/src/store/index.js
import { createStore } from "vuex";
import { fetchMe, isLoggedIn, logout } from "@/services/auth";

export default createStore({
  state: {
    user: null,
    currentFile: null,
    notifications: [],
    anomalies: [],
  },
  getters: {
    isLoggedIn: () => isLoggedIn(),
    hasFile: (state) => !!state.currentFile,
  },
  mutations: {
    setUser(state, user) {
      state.user = user;
    },
    clearUser(state) {
      state.user = null;
    },
    setCurrentFile(state, filename) {
      state.currentFile = filename;
    },
    addNotification(state, notification) {
      state.notifications.push({
        id: Date.now(),
        ...notification,
      });
    },
    addAnomaly(state, anomaly) {
      state.anomalies.push({
        id: Date.now(),
        timestamp: new Date(),
        ...anomaly,
      });
    },
  },
  actions: {
    async loadMe({ commit }) {
      const me = await fetchMe();
      commit("setUser", me);
      return me;
    },
    async doLogout({ commit }) {
      await logout();
      commit("clearUser");
    },
    checkAnomalies({ commit }, data) {
      // Logika wykrywania anomalii
      data.forEach((item) => {
        if (item.stock < item.minStock) {
          commit("addAnomaly", {
            type: "low_stock",
            product: item.name,
            message: `Niski stan magazynowy: ${item.name}`,
            priority: item.rotationRate > 0.5 ? "high" : "low",
          });
        }
      });
    },
  },
});
