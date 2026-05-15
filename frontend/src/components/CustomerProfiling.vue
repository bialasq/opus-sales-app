<!-- frontend/src/components/CustomerProfiling.vue -->
<template>
  <div class="customer-profiling">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>Profile Klientów</span>
          <el-button
            type="primary"
            native-type="button"
            :loading="visitPlanLoading"
            :disabled="!store.state.currentFile || customerProfiles.length === 0"
            @click="generateVisitPlan"
          >
            Generuj Plan Wizyt
          </el-button>
        </div>
      </template>

      <el-table :data="customerProfiles" style="width: 100%" stripe>
        <el-table-column prop="customerId" label="ID Klienta" width="100" />
        <el-table-column prop="name" label="Nazwa Klienta" />
        <el-table-column prop="city" label="Miasto" />
        <el-table-column prop="tier" label="Segment" width="80">
          <template #default="scope">
            <el-tag :type="getTierColor(scope.row.tier)" size="small">
              {{ scope.row.tier }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="totalOrders"
          label="Liczba Zamówień"
          width="130"
        />
        <el-table-column prop="totalValue" label="Wartość Zamówień" width="150">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="visitFrequency" label="Częstotliwość Wizyt" />
        <el-table-column label="Akcje" width="100">
          <template #default="scope">
            <el-button
              type="text"
              size="small"
              @click="showCustomerDetails(scope.row)"
            >
              Szczegóły
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="visitPlan.length > 0" style="margin-top: 20px">
      <template #header>
        <span>Plan Wizyt</span>
      </template>

      <el-timeline>
        <el-timeline-item
          v-for="visit in visitPlan"
          :key="visit.customerId"
          :timestamp="formatDate(visit.nextVisit)"
          :type="getVisitType(visit.priority)"
          placement="top"
        >
          <el-card>
            <h4>{{ visit.customerName }}</h4>
            <p>{{ visit.city }} - Priorytet: {{ visit.priority }}</p>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </el-card>

    <el-dialog
      v-model="detailsDialogVisible"
      title="Szczegóły Klienta"
      width="60%"
    >
      <div v-if="selectedCustomer">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="Nazwa">
            {{ selectedCustomer.name }}
          </el-descriptions-item>
          <el-descriptions-item label="Miasto">
            {{ selectedCustomer.city }}
          </el-descriptions-item>
          <el-descriptions-item label="Segment">
            {{ selectedCustomer.tier }}
          </el-descriptions-item>
          <el-descriptions-item label="Liczba Zamówień">
            {{ selectedCustomer.totalOrders }}
          </el-descriptions-item>
          <el-descriptions-item label="Wartość Zamówień" :span="2">
            {{ formatCurrency(selectedCustomer.totalValue) }}
          </el-descriptions-item>
        </el-descriptions>

        <div style="margin-top: 20px">
          <h4>Rekomendacje AI</h4>
          <el-button type="primary" size="small" @click="getCustomerInsights">
            Generuj Wgląd w Klienta
          </el-button>
          <div v-if="customerInsights" style="margin-top: 10px">
            <el-alert :title="customerInsights" type="info" :closable="false" />
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, onMounted, watch } from "vue";
import { useStore } from "vuex";
import api, { postVisitPlan } from "@/services/api";
import { ElMessage } from "element-plus";

export default {
  name: "CustomerProfiling",
  setup() {
    const store = useStore();
    const customerProfiles = ref([]);
    const visitPlan = ref([]);
    const visitPlanLoading = ref(false);
    const detailsDialogVisible = ref(false);
    const selectedCustomer = ref(null);
    const customerInsights = ref(null);

    const loadCustomerProfiles = async () => {
      const filename = store.state.currentFile;
      if (!filename) {
        customerProfiles.value = [];
        visitPlan.value = [];
        return;
      }

      try {
        const response = await api.post("/customers/profile", { filename });
        const body = response.data;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          customerProfiles.value = [];
          ElMessage.warning("Nieoczekiwany format odpowiedzi profili klientów.");
          return;
        }
        customerProfiles.value = Object.entries(body).map(([id, profile]) => ({
          customerId: String(id),
          ...(typeof profile === "object" && profile !== null ? profile : {}),
        }));
      } catch (error) {
        ElMessage.error(
          "Nie udało się załadować profili klientów. " +
            (error.response?.data?.error || error.message || "")
        );
      }
    };

    const generateVisitPlan = async () => {
      if (!store.state.currentFile) {
        ElMessage.warning("Najpierw wgraj plik Excel (lub wybierz dane testowe).");
        return;
      }
      if (!customerProfiles.value.length) {
        ElMessage.warning(
          "Brak profili klientów — sprawdź arkusz Sprzedaż (NIP klienta) lub odśwież stronę."
        );
        return;
      }

      const profiles = {};
      for (const row of customerProfiles.value) {
        const id = String(row.customerId ?? "").trim();
        if (!id) continue;
        profiles[id] = {
          name: row.name,
          city: row.city,
          tier: row.tier,
          totalOrders: Number(row.totalOrders) || 0,
          totalValue: Number(row.totalValue) || 0,
          visitFrequency: row.visitFrequency,
        };
      }

      if (!Object.keys(profiles).length) {
        ElMessage.warning("Brak poprawnych identyfikatorów klientów (customerId).");
        return;
      }

      visitPlanLoading.value = true;
      try {
        let payload;
        try {
          payload = JSON.parse(JSON.stringify({ profiles }));
        } catch (e) {
          ElMessage.error(
            "Nie można przygotować danych do wysłania (serializacja JSON). " +
              (e instanceof Error ? e.message : "")
          );
          return;
        }

        const plan = await postVisitPlan(payload.profiles);
        visitPlan.value = Array.isArray(plan) ? plan : [];
        if (visitPlan.value.length) {
          ElMessage.success(`Wygenerowano plan wizyt: ${visitPlan.value.length} pozycji.`);
        } else {
          ElMessage.info("Plan wizyt jest pusty — brak wpisów do zaplanowania.");
        }
      } catch (error) {
        ElMessage.error(
          "Nie udało się wygenerować planu wizyt. " +
            (error.response?.data?.error || error.message || "")
        );
      } finally {
        visitPlanLoading.value = false;
      }
    };

    const getTierColor = (tier) => {
      const colors = {
        T1: "danger",
        T2: "warning",
        T3: "info",
      };
      return colors[tier] || "info";
    };

    const getVisitType = (priority) => {
      const types = {
        Wysoki: "danger",
        Średni: "warning",
        Niski: "primary",
      };
      return types[priority] || "primary";
    };

    const formatCurrency = (value) => {
      return new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
      }).format(value);
    };

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("pl-PL");
    };

    const showCustomerDetails = (customer) => {
      selectedCustomer.value = customer;
      detailsDialogVisible.value = true;
      customerInsights.value = null;
    };

    const getCustomerInsights = async () => {
      try {
        const response = await api.post("/analytics/ai-insights", {
          data: selectedCustomer.value,
          agentType: "customerInsights",
          filename: store.state.currentFile || undefined,
        });
        customerInsights.value = response.data?.insights ?? "";
      } catch {
        ElMessage.error("Nie udało się pobrać spostrzeżeń AI o kliencie.");
      }
    };

    onMounted(() => {
      loadCustomerProfiles();
    });

    watch(
      () => store.state.currentFile,
      () => {
        visitPlan.value = [];
        loadCustomerProfiles();
      }
    );

    return {
      store,
      customerProfiles,
      visitPlan,
      visitPlanLoading,
      detailsDialogVisible,
      selectedCustomer,
      customerInsights,
      generateVisitPlan,
      getTierColor,
      getVisitType,
      formatCurrency,
      formatDate,
      showCustomerDetails,
      getCustomerInsights,
    };
  },
};
</script>

<style scoped>
.customer-profiling {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
