<template>
  <div class="login-view">
    <div class="login-card">
      <div class="login-logo">
        <div class="logo-mark"><el-icon color="white" :size="28"><Connection /></el-icon></div>
        <h1>FlowForge</h1><p>Create your account</p>
      </div>
      <el-form :model="form" label-position="top" @submit.prevent="handleRegister">
        <el-form-item label="First Name"><el-input v-model="form.firstName" size="large" /></el-form-item>
        <el-form-item label="Last Name"><el-input v-model="form.lastName" size="large" /></el-form-item>
        <el-form-item label="Email"><el-input v-model="form.email" type="email" size="large" /></el-form-item>
        <el-form-item label="Password"><el-input v-model="form.password" type="password" size="large" show-password /></el-form-item>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom:16px" />
        <el-button type="primary" size="large" :loading="loading" style="width:100%" @click="handleRegister">Create Account</el-button>
      </el-form>
      <div class="login-footer">Already have an account? <RouterLink to="/auth/login">Sign in</RouterLink></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { Connection } from '@element-plus/icons-vue';
const router = useRouter();
const authStore = useAuthStore();
const form = ref({ firstName: '', lastName: '', email: '', password: '' });
const loading = ref(false);
const error = ref('');
async function handleRegister() {
  loading.value = true; error.value = '';
  try {
    await authStore.register(form.value.email, form.value.password, form.value.firstName, form.value.lastName);
    router.push('/workflows');
  } catch(e: any) { error.value = e.response?.data?.error ?? 'Registration failed'; }
  finally { loading.value = false; }
}
</script>
<style scoped>
.login-view { min-height:100vh; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460); }
.login-card { background:white; border-radius:16px; padding:40px; width:100%; max-width:420px; box-shadow:0 20px 60px rgba(0,0,0,.3); }
.login-logo { text-align:center; margin-bottom:28px; }
.logo-mark { width:56px; height:56px; background:linear-gradient(135deg,#6E56CF,#2196F3); border-radius:14px; display:flex; align-items:center; justify-content:center; margin:0 auto 14px; }
.login-logo h1 { font-size:22px; font-weight:800; color:#1a1a2e; }
.login-logo p { font-size:13px; color:var(--el-text-color-secondary); }
.login-footer { text-align:center; margin-top:20px; font-size:14px; color:var(--el-text-color-secondary); }
.login-footer a { color:#6E56CF; font-weight:500; text-decoration:none; }
</style>
