<template>
  <div class="page-wrap">
    <div class="page-header">
      <h1 class="page-title">Credentials</h1>
      <el-button type="primary" :icon="Plus" @click="showCreate = true">Add Credential</el-button>
    </div>
    <div class="page-content">
      <el-table :data="credentials" v-loading="loading" stripe>
        <el-table-column label="Name" prop="name" />
        <el-table-column label="Type" prop="type" />
        <el-table-column label="Created" width="180">
          <template #default="{row}"><span>{{ dayjs(row.createdAt).format('MMM D, YYYY') }}</span></template>
        </el-table-column>
        <el-table-column label="" width="80" align="right">
          <template #default="{row}">
            <el-button text type="danger" :icon="Delete" @click="deleteCredential(row.id)" />
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="showCreate" title="Add Credential" width="480px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="Name"><el-input v-model="createForm.name" /></el-form-item>
        <el-form-item label="Type"><el-input v-model="createForm.type" placeholder="e.g. slackApi" /></el-form-item>
        <el-form-item label="Data (JSON)">
          <el-input v-model="createForm.dataRaw" type="textarea" :rows="5" placeholder='{"token": "xoxb-..."}' />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">Cancel</el-button>
        <el-button type="primary" @click="submitCreate">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Delete } from '@element-plus/icons-vue';
import { credentialsApi } from '@/api/index.js';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
const credentials = ref<any[]>([]);
const loading = ref(false);
const showCreate = ref(false);
const createForm = ref({ name: '', type: '', dataRaw: '{}' });
async function fetchCredentials() {
  loading.value = true;
  try { const r = await credentialsApi.list(); credentials.value = r.data.data; }
  finally { loading.value = false; }
}
async function submitCreate() {
  try {
    const data = JSON.parse(createForm.value.dataRaw);
    await credentialsApi.create({ name: createForm.value.name, type: createForm.value.type, data });
    showCreate.value = false; ElMessage.success('Credential saved'); fetchCredentials();
  } catch(e: any) { ElMessage.error(e.response?.data?.error ?? 'Failed'); }
}
async function deleteCredential(id: string) {
  await credentialsApi.delete(id); ElMessage.success('Deleted'); fetchCredentials();
}
onMounted(fetchCredentials);
</script>
<style scoped>
.page-wrap { height:100%; display:flex; flex-direction:column; }
.page-header { display:flex; align-items:center; justify-content:space-between; padding:24px 32px 16px; border-bottom:1px solid var(--el-border-color-lighter); background:var(--el-bg-color); }
.page-title { font-size:22px; font-weight:700; }
.page-content { flex:1; overflow-y:auto; padding:24px 32px; }
</style>
