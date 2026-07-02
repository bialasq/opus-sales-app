<template>
  <div class="payment-monitoring">
    <el-row :gutter="20">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>Monitoring Płatności</span>
              <div>
                <el-button type="primary" @click="sendReminders">
                  <el-icon><Message /></el-icon>
                  Wyślij przypomnienia
                </el-button>
                <el-button @click="refreshPayments">
                  <el-icon><Refresh /></el-icon>
                  Odśwież
                </el-button>
              </div>
            </div>
          </template>

          <el-table :data="overduePayments" style="width: 100%" stripe>
            <el-table-column
              prop="invoiceNumber"
              label="Nr faktury"
              width="150"
            />
            <el-table-column prop="customerName" label="Klient" />
            <el-table-column prop="amount" label="Kwota" width="120">
              <template #default="scope">
                {{ formatCurrency(scope.row.amount) }}
              </template>
            </el-table-column>
            <el-table-column
              prop="dueDate"
              label="Termin płatności"
              width="150"
            >
              <template #default="scope">
                {{ formatDate(scope.row.dueDate) }}
              </template>
            </el-table-column>
            <el-table-column
              prop="daysOverdue"
              label="Dni po terminie"
              width="130"
            >
              <template #default="scope">
                <el-tag :type="getOverdueType(scope.row.daysOverdue)">
                  {{ scope.row.daysOverdue }} dni
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Status" width="120">
              <template #default="scope">
                <el-tag :type="scope.row.reminderSent ? 'success' : 'warning'">
                  {{ scope.row.reminderSent ? "Przypomniano" : "Oczekuje" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Akcje" width="200">
              <template #default="scope">
                <el-button
                  type="primary"
                  size="small"
                  :disabled="scope.row.reminderSent"
                  @click="sendSingleReminder(scope.row)"
                >
                  Przypomnij
                </el-button>
                <el-button
                  type="text"
                  size="small"
                  @click="showDetails(scope.row)"
                >
                  Szczegóły
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="8">
        <el-card>
          <div class="stat-card">
            <div class="stat-title">Łączna kwota zaległości</div>
            <div class="stat-value">{{ formatCurrency(totalOverdue) }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <div class="stat-card">
            <div class="stat-title">Liczba zaległych faktur</div>
            <div class="stat-value">{{ overduePayments.length }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <div class="stat-card">
            <div class="stat-title">Średnie opóźnienie</div>
            <div class="stat-value">{{ averageDelay }} dni</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="24">
        <el-card>
          <template #header>
            <span>Szablon wiadomości przypominającej</span>
          </template>
          <el-form label-width="120px">
            <el-form-item label="Temat">
              <el-input v-model="emailTemplate.subject" />
            </el-form-item>
            <el-form-item label="Treść">
              <el-input
                v-model="emailTemplate.body"
                type="textarea"
                :rows="8"
                placeholder="Użyj zmiennych: {customerName}, {invoiceNumber}, {amount}, {dueDate}, {daysOverdue}"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveTemplate">
                Zapisz szablon
              </el-button>
              <el-button @click="previewEmail"> Podgląd </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog
      v-model="detailsDialogVisible"
      title="Szczegóły płatności"
      width="50%"
    >
      <div v-if="selectedPayment">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="Nr faktury">
            {{ selectedPayment.invoiceNumber }}
          </el-descriptions-item>
          <el-descriptions-item label="Klient">
            {{ selectedPayment.customerName }}
          </el-descriptions-item>
          <el-descriptions-item label="Kwota">
            {{ formatCurrency(selectedPayment.amount) }}
          </el-descriptions-item>
          <el-descriptions-item label="Termin płatności">
            {{ formatDate(selectedPayment.dueDate) }}
          </el-descriptions-item>
          <el-descriptions-item label="Dni po terminie" :span="2">
            {{ selectedPayment.daysOverdue }} dni
          </el-descriptions-item>
        </el-descriptions>

        <div style="margin-top: 20px">
          <h4>Historia kontaktów</h4>
          <el-timeline>
            <el-timeline-item
              v-for="(contact, index) in contactHistory"
              :key="index"
              :timestamp="contact.date"
            >
              {{ contact.action }}
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="previewDialogVisible"
      title="Podgląd wiadomości"
      width="60%"
    >
      <div class="email-preview">
        <p><strong>Temat:</strong> {{ previewSubject }}</p>
        <div style="margin-top: 20px; white-space: pre-wrap">
          {{ previewBody }}
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import api from "@/services/api";
import { ElMessage, ElMessageBox } from "element-plus";

export default {
  name: "PaymentMonitoring",
  setup() {
    const store = useWorkspaceStore();
    const overduePayments = ref([]);
    const detailsDialogVisible = ref(false);
    const previewDialogVisible = ref(false);
    const selectedPayment = ref(null);
    const contactHistory = ref([]);
    const emailTemplate = ref({
      subject: "Przypomnienie o płatności - Faktura {invoiceNumber}",
      body: `Szanowni Państwo {customerName},

Uprzejmie informujemy, że termin płatności za fakturę nr {invoiceNumber} na kwotę {amount} upłynął {dueDate}.

Faktura jest przeterminowana o {daysOverdue} dni.

Prosimy o jak najszybsze uregulowanie należności.

W przypadku, gdy płatność została już dokonana, prosimy o przesłanie potwierdzenia.

Z poważaniem,
Dział Księgowości`,
    });

    const totalOverdue = computed(() => {
      return overduePayments.value.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );
    });

    const averageDelay = computed(() => {
      if (overduePayments.value.length === 0) return 0;
      const totalDays = overduePayments.value.reduce(
        (sum, payment) => sum + payment.daysOverdue,
        0
      );
      return Math.round(totalDays / overduePayments.value.length);
    });

    const previewSubject = ref("");
    const previewBody = ref("");

    const loadOverduePayments = async () => {
      try {
        const response = await api.post("/payments/overdue", {
          filename: store.currentFile,
        });
        const body = response.data;
        if (body?.available === false) {
          overduePayments.value = [];
          ElMessage.info(body.reason || "Brak danych o płatnościach w pliku");
          return;
        }
        const rows = Array.isArray(body) ? body : body?.data ?? [];
        overduePayments.value = rows.map((payment) => ({
          ...payment,
          reminderSent: false,
        }));
      } catch (error) {
        ElMessage.error(
          "Nie udało się załadować zaległych płatności. " +
            (error.response?.data?.error || error.message || "")
        );
      }
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

    const getOverdueType = (days) => {
      if (days > 30) return "danger";
      if (days > 14) return "warning";
      return "info";
    };

    const refreshPayments = () => {
      loadOverduePayments();
      ElMessage.success("Lista płatności odświeżona");
    };

    const sendSingleReminder = async (payment) => {
      try {
        await ElMessageBox.confirm(
          `Czy na pewno chcesz wysłać przypomnienie do ${payment.customerName}?`,
          "Potwierdzenie",
          {
            confirmButtonText: "Wyślij",
            cancelButtonText: "Anuluj",
            type: "warning",
          }
        );

        const response = await api.post("/payments/send-reminder", {
          invoiceNumber: payment.invoiceNumber,
          customerId: payment.customerId,
        });

        if (response.data.success) {
          payment.reminderSent = true;
          ElMessage.success("Przypomnienie wysłane pomyślnie");
        }
      } catch (error) {
        if (error === "cancel") return;
        if (error.response?.status === 501) {
          ElMessage.info(
            error.response.data?.error ||
              "Wysyłka e-mail nie jest skonfigurowana."
          );
          return;
        }
        ElMessage.error(
          "Nie udało się wysłać przypomnienia. " +
            (error.response?.data?.error || error.message || "")
        );
      }
    };

    const sendReminders = async () => {
      const toSend = overduePayments.value.filter((p) => !p.reminderSent);

      if (toSend.length === 0) {
        ElMessage.warning("Brak płatności do przypomnienia");
        return;
      }

      try {
        await ElMessageBox.confirm(
          `Wysłać przypomnienia do ${toSend.length} klientów?`,
          "Potwierdzenie",
          {
            confirmButtonText: "Wyślij wszystkie",
            cancelButtonText: "Anuluj",
            type: "warning",
          }
        );

        let sent = 0;
        for (const payment of toSend) {
          await api.post("/payments/send-reminder", {
            invoiceNumber: payment.invoiceNumber,
            customerId: payment.customerId,
          });
          payment.reminderSent = true;
          sent++;
        }

        ElMessage.success(`Wysłano ${sent} przypomnień`);
      } catch (error) {
        if (error === "cancel") return;
        if (error.response?.status === 501) {
          ElMessage.info(
            error.response.data?.error ||
              "Wysyłka e-mail nie jest skonfigurowana."
          );
          return;
        }
        ElMessage.error(
          "Nie udało się wysłać przypomnień. " +
            (error.response?.data?.error || error.message || "")
        );
      }
    };

    const showDetails = (payment) => {
      selectedPayment.value = payment;
      detailsDialogVisible.value = true;

      // Symulacja historii kontaktów
      contactHistory.value = [
        {
          date: "2024-03-01",
          action: "Faktura wystawiona",
        },
        {
          date: "2024-03-15",
          action: "Termin płatności upłynął",
        },
        {
          date: "2024-03-20",
          action: "Pierwsze przypomnienie wysłane",
        },
      ];
    };

    const saveTemplate = () => {
      ElMessage.success("Szablon zapisany pomyślnie");
    };

    const previewEmail = () => {
      const samplePayment = overduePayments.value[0] || {
        customerName: "Przykładowa Firma",
        invoiceNumber: "FV/2024/001",
        amount: 5000,
        dueDate: "2024-03-01",
        daysOverdue: 10,
      };

      previewSubject.value = emailTemplate.value.subject.replace(
        "{invoiceNumber}",
        samplePayment.invoiceNumber
      );

      previewBody.value = emailTemplate.value.body
        .replace("{customerName}", samplePayment.customerName)
        .replace("{invoiceNumber}", samplePayment.invoiceNumber)
        .replace("{amount}", formatCurrency(samplePayment.amount))
        .replace("{dueDate}", formatDate(samplePayment.dueDate))
        .replace("{daysOverdue}", samplePayment.daysOverdue);

      previewDialogVisible.value = true;
    };

    onMounted(() => {
      loadOverduePayments();
    });

    // Zmiana aktywnego pliku → przeładuj zaległości dla nowego pliku.
    watch(
      () => store.currentFile,
      () => {
        overduePayments.value = [];
        loadOverduePayments();
      }
    );

    return {
      overduePayments,
      detailsDialogVisible,
      previewDialogVisible,
      selectedPayment,
      contactHistory,
      emailTemplate,
      totalOverdue,
      averageDelay,
      previewSubject,
      previewBody,
      formatCurrency,
      formatDate,
      getOverdueType,
      refreshPayments,
      sendSingleReminder,
      sendReminders,
      showDetails,
      saveTemplate,
      previewEmail,
    };
  },
};
</script>

<style scoped>
.payment-monitoring {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-card {
  text-align: center;
  padding: 20px;
}

.stat-title {
  color: #909399;
  font-size: 14px;
  margin-bottom: 10px;
}

.stat-value {
  color: #303133;
  font-size: 24px;
  font-weight: bold;
}

.email-preview {
  background-color: #f5f7fa;
  padding: 20px;
  border-radius: 4px;
  font-family: monospace;
}
</style>
