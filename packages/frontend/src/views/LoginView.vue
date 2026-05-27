<template>
  <div class="login-view">
    <div class="login-card">
      <div class="login-logo">
        <div class="logo-mark">
          <el-icon color="white" :size="28"><Connection /></el-icon>
        </div>
        <h1>FlowForge</h1>
        <p>Workflow Automation Platform</p>
      </div>

      <el-form :model="form" label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="Email">
          <el-input
            v-model="form.email"
            type="email"
            placeholder="you@example.com"
            size="large"
            autofocus
          />
        </el-form-item>

        <el-form-item label="Password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="Your password"
            size="large"
            show-password
            @keydown.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item v-if="requiresMFA" label="Authenticator Code">
          <el-input
            v-model="form.totpCode"
            placeholder="6-digit code"
            size="large"
            maxlength="6"
          />
        </el-form-item>

        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom: 16px" />

        <el-button
          native-type="submit"
          type="primary"
          size="large"
          :loading="loading"
          style="width: 100%"
          @click="handleLogin"
        >
          Sign In
        </el-button>
      </el-form>

      <div class="login-footer">
        Don't have an account?
        <RouterLink to="/auth/register">Create one</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { Connection } from '@element-plus/icons-vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const form = ref({ email: '', password: '', totpCode: '' });
const loading = ref(false);
const error = ref('');
const requiresMFA = ref(false);

async function handleLogin(): Promise<void> {
  error.value = '';
  loading.value = true;
  try {
    await authStore.login(form.value.email, form.value.password, form.value.totpCode || undefined);
    const redirect = route.query['redirect'] as string | undefined;
    router.push(redirect ?? '/workflows');
  } catch (err: any) {
    const msg = err.response?.data?.error ?? err.message ?? 'Login failed';
    if (msg.toLowerCase().includes('mfa') || msg.toLowerCase().includes('totp')) {
      requiresMFA.value = true;
      error.value = 'Please enter your authenticator code.';
    } else {
      error.value = msg;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-logo {
  text-align: center;
  margin-bottom: 32px;
}

.logo-mark {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #6E56CF, #2196F3);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
}

.login-logo h1 {
  font-size: 24px;
  font-weight: 800;
  color: #1a1a2e;
  margin-bottom: 4px;
}

.login-logo p {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.login-footer {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.login-footer a {
  color: #6E56CF;
  font-weight: 500;
  text-decoration: none;
}
</style>
