<template>
  <div>
    <h2 style="font-size:18px;font-weight:600;margin-bottom:20px">Users</h2>
    <el-table :data="users" v-loading="loading">
      <el-table-column label="Name"><template #default="{row}">{{ row.firstName }} {{ row.lastName }}</template></el-table-column>
      <el-table-column label="Email" prop="email" />
      <el-table-column label="Role"><template #default="{row}"><el-tag size="small">{{ row.role }}</el-tag></template></el-table-column>
      <el-table-column label="Joined"><template #default="{row}">{{ dayjs(row.createdAt).format('MMM D, YYYY') }}</template></el-table-column>
    </el-table>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usersApi } from '@/api/index.js';
import dayjs from 'dayjs';
const users = ref<any[]>([]);
const loading = ref(false);
onMounted(async () => { loading.value = true; try { const r = await usersApi.list(); users.value = r.data.data; } finally { loading.value = false; } });
</script>
