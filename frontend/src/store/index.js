// frontend/src/store/index.js
import { createStore } from "vuex";

export default createStore({
  state: {
    currentFile: null,
    notifications: [],
    anomalies: [],
  },
  getters: {
    hasFile: (state) => !!state.currentFile,
  },
  mutations: {
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
