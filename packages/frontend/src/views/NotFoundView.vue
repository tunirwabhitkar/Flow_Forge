<template>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;color:var(--el-text-color-secondary)">
    <el-icon :size="64" color="#c0c4cc"><Warning /></el-icon>
    <h1 style="font-size:48px;font-weight:800;color:#1a1a2e">404</h1>
    <p>Page not found</p>
    <el-button type="primary" @click="$router.push('/workflows')">Go Home</el-button>
  </div>
</template>
<script setup lang="ts">
import { Warning } from '@element-plus/icons-vue';
</script>
