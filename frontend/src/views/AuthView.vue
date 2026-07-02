<template>
  <div class="auth-page flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-xl font-bold text-white shadow-lg"
        >
          O
        </div>
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">
          Opus Sales
        </h1>
        <p class="mt-1 text-sm text-slate-500">Analityka sprzedaży</p>
      </div>

      <el-card class="auth-card !rounded-2xl !border-slate-200/80 !shadow-card">
        <el-tabs v-model="activeTab" class="auth-tabs">
          <el-tab-pane label="Logowanie" name="login">
            <el-form
              ref="loginFormRef"
              :model="loginForm"
              :rules="loginRules"
              label-position="top"
              @submit.prevent="handleLogin"
            >
              <el-form-item label="E-mail" prop="email">
                <el-input
                  v-model="loginForm.email"
                  type="email"
                  autocomplete="email"
                  placeholder="twoj@email.pl"
                  size="large"
                />
              </el-form-item>
              <el-form-item label="Hasło" prop="password">
                <el-input
                  v-model="loginForm.password"
                  type="password"
                  autocomplete="current-password"
                  placeholder="••••••••"
                  size="large"
                  show-password
                  @keyup.enter="handleLogin"
                />
              </el-form-item>
              <el-button
                type="primary"
                class="!mt-2 w-full !rounded-xl !font-medium"
                size="large"
                :loading="loginLoading"
                @click="handleLogin"
              >
                Zaloguj
              </el-button>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="Rejestracja" name="register">
            <el-form
              ref="registerFormRef"
              :model="registerForm"
              :rules="registerRules"
              label-position="top"
              @submit.prevent="handleRegister"
            >
              <el-form-item label="Nazwa firmy" prop="organizationName">
                <el-input
                  v-model="registerForm.organizationName"
                  autocomplete="organization"
                  placeholder="Moja Firma Sp. z o.o."
                  size="large"
                />
              </el-form-item>
              <el-form-item label="E-mail" prop="email">
                <el-input
                  v-model="registerForm.email"
                  type="email"
                  autocomplete="email"
                  placeholder="twoj@email.pl"
                  size="large"
                />
              </el-form-item>
              <el-form-item label="Hasło" prop="password">
                <el-input
                  v-model="registerForm.password"
                  type="password"
                  autocomplete="new-password"
                  placeholder="Min. 8 znaków"
                  size="large"
                  show-password
                />
              </el-form-item>
              <el-form-item label="Imię (opcjonalnie)" prop="userName">
                <el-input
                  v-model="registerForm.userName"
                  autocomplete="name"
                  placeholder="Jan"
                  size="large"
                />
              </el-form-item>
              <el-button
                type="primary"
                class="!mt-2 w-full !rounded-xl !font-medium"
                size="large"
                :loading="registerLoading"
                @click="handleRegister"
              >
                Załóż konto
              </el-button>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import axios from "axios";
import { login, register } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const workspaceStore = useWorkspaceStore();

const activeTab = ref("login");
const loginLoading = ref(false);
const registerLoading = ref(false);

const loginFormRef = ref(null);
const registerFormRef = ref(null);

const loginForm = ref({
  email: "",
  password: "",
});

const registerForm = ref({
  organizationName: "",
  email: "",
  password: "",
  userName: "",
});

const emailValidator = (_rule, value, callback) => {
  if (!value || !String(value).includes("@")) {
    callback(new Error("Podaj poprawny adres e-mail"));
    return;
  }
  callback();
};

const loginRules = {
  email: [
    { required: true, message: "Podaj e-mail", trigger: "blur" },
    { validator: emailValidator, trigger: "blur" },
  ],
  password: [{ required: true, message: "Podaj hasło", trigger: "blur" }],
};

const registerRules = {
  organizationName: [
    { required: true, message: "Podaj nazwę firmy", trigger: "blur" },
  ],
  email: [
    { required: true, message: "Podaj e-mail", trigger: "blur" },
    { validator: emailValidator, trigger: "blur" },
  ],
  password: [
    { required: true, message: "Podaj hasło", trigger: "blur" },
    { min: 8, message: "Hasło musi mieć co najmniej 8 znaków", trigger: "blur" },
  ],
};

function resolveRedirect() {
  const redirect = route.query.redirect;
  if (typeof redirect === "string" && redirect.startsWith("/") && redirect !== "/login") {
    return redirect;
  }
  return "/";
}

async function setUserAfterAuth() {
  // /auth/me zwraca już email i nazwę organizacji — store trzyma pełny profil.
  await authStore.loadMe();
  await workspaceStore.restoreWorkspace().catch(() => {});
}

async function handleLogin() {
  const form = loginFormRef.value;
  if (!form) return;
  const valid = await form.validate().catch(() => false);
  if (!valid) return;

  loginLoading.value = true;
  try {
    await login(loginForm.value.email, loginForm.value.password);
    await setUserAfterAuth();
    router.push(resolveRedirect());
  } catch {
    ElMessage.error("Nieprawidłowy e-mail lub hasło");
  } finally {
    loginLoading.value = false;
  }
}

function registerErrorMessage(err) {
  if (axios.isAxiosError(err) && err.response?.data) {
    const body = err.response.data;
    if (typeof body === "object" && body !== null && "error" in body) {
      return String(body.error);
    }
  }
  return "Rejestracja nie powiodła się";
}

async function handleRegister() {
  const form = registerFormRef.value;
  if (!form) return;
  const valid = await form.validate().catch(() => false);
  if (!valid) return;

  registerLoading.value = true;
  try {
    const { email, password, organizationName, userName } = registerForm.value;
    await register(
      organizationName.trim(),
      email.trim(),
      password,
      userName?.trim() || undefined
    );
    await login(email.trim(), password);
    await setUserAfterAuth();
    router.push("/");
  } catch (err) {
    ElMessage.error(registerErrorMessage(err));
  } finally {
    registerLoading.value = false;
  }
}
</script>

<style scoped>
.auth-card :deep(.el-card__body) {
  padding: 1.5rem 1.5rem 1.75rem;
}

.auth-tabs :deep(.el-tabs__header) {
  margin-bottom: 1.25rem;
}

.auth-tabs :deep(.el-tabs__item) {
  font-weight: 500;
}
</style>
