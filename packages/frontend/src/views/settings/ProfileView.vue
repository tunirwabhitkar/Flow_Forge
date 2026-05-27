<template>
  <div>
    <h2 style="font-size:18px;font-weight:600;margin-bottom:20px">Profile</h2>
    <el-form :model="form" label-position="top" style="max-width:400px">
      <el-form-item label="First Name"><el-input v-model="form.firstName" /></el-form-item>
      <el-form-item label="Last Name"><el-input v-model="form.lastName" /></el-form-item>
      <el-form-item label="Email"><el-input v-model="form.email" disabled /></el-form-item>
      <el-form-item label="Role"><el-tag>{{ form.role }}</el-tag></el-form-item>
      <el-button type="primary" @click="ElMessage.info('Profile update coming soon')">Save Changes</el-button>
    </el-form>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { ElMessage } from 'element-plus';
const authStore = useAuthStore();
const form = ref({ firstName: authStore.user?.firstName ?? '', lastName: authStore.user?.lastName ?? '', email: authStore.user?.email ?? '', role: authStore.user?.role ?? '' });
</script>
