<template>
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 style="font-size:18px;font-weight:600">API Keys</h2>
      <el-button type="primary" :icon="Plus" @click="showCreate=true">New Key</el-button>
    </div>
    <el-empty v-if="!keys.length" description="No API keys yet" />
    <el-table v-else :data="keys">
      <el-table-column label="Label" prop="label" />
      <el-table-column label="Created"><template #default="{row}">{{ dayjs(row.createdAt).format('MMM D, YYYY') }}</template></el-table-column>
      <el-table-column label="Last Used"><template #default="{row}">{{ row.lastUsedAt ? dayjs(row.lastUsedAt).fromNow() : 'Never' }}</template></el-table-column>
      <el-table-column label="" width="80"><template #default="{row}"><el-button text type="danger" :icon="Delete" @click="deleteKey(row.id)" /></template></el-table-column>
    </el-table>
    <el-dialog v-model="showCreate" title="Create API Key" width="420px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="Label"><el-input v-model="createForm.label" placeholder="My integration key" /></el-form-item>
      </el-form>
      <el-alert v-if="newKey" :title="`Copy this key — it won't be shown again: ${newKey}`" type="success" show-icon :closable="false" />
      <template #footer>
        <el-button v-if="!newKey" @click="showCreate=false">Cancel</el-button>
        <el-button v-if="!newKey" type="primary" @click="createKey">Create</el-button>
        <el-button v-if="newKey" type="primary" @click="showCreate=false;newKey=''">Done</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Delete } from '@element-plus/icons-vue';
import { apiKeysApi } from '@/api/index.js';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
const keys = ref<any[]>([]);
const showCreate = ref(false);
const createForm = ref({ label: '' });
const newKey = ref('');
async function createKey() {
  const r = await apiKeysApi.create({ label: createForm.value.label });
  newKey.value = (r.data as any).key;
}
async function deleteKey(id: string) { await apiKeysApi.delete(id); ElMessage.success('Key revoked'); keys.value = keys.value.filter(k=>k.id!==id); }
onMounted(() => { /* fetch keys endpoint TBD */ });
</script>
