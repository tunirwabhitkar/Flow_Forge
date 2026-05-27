<template>
  <div class="page-wrap">
    <div class="page-header"><h1 class="page-title">Settings</h1></div>
    <div class="settings-layout">
      <nav class="settings-nav">
        <RouterLink to="/settings/profile" class="settings-link">Profile</RouterLink>
        <RouterLink to="/settings/api-keys" class="settings-link">API Keys</RouterLink>
        <RouterLink v-if="authStore.isAdmin" to="/settings/users" class="settings-link">Users</RouterLink>
      </nav>
      <div class="settings-content"><RouterView /></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
const authStore = useAuthStore();
</script>
<style scoped>
.page-wrap { height:100%; display:flex; flex-direction:column; }
.page-header { padding:24px 32px 16px; border-bottom:1px solid var(--el-border-color-lighter); background:var(--el-bg-color); }
.page-title { font-size:22px; font-weight:700; }
.settings-layout { display:flex; flex:1; overflow:hidden; }
.settings-nav { width:200px; border-right:1px solid var(--el-border-color-lighter); padding:16px 8px; display:flex; flex-direction:column; gap:2px; }
.settings-link { padding:8px 12px; border-radius:6px; text-decoration:none; font-size:14px; color:var(--el-text-color-secondary); }
.settings-link:hover,.settings-link.router-link-active { background:var(--el-fill-color); color:var(--el-color-primary); }
.settings-content { flex:1; overflow-y:auto; padding:24px; }
</style>
