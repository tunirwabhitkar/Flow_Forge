<template>
  <div class="page-wrap">
    <div class="page-header">
      <el-button text :icon="ArrowLeft" @click="$router.back()">Back</el-button>
      <h1 class="page-title">Execution {{ route.params.id?.toString().slice(0,8) }}</h1>
      <el-tag v-if="execution" :type="statusType(execution.status)" size="small">{{ execution.status }}</el-tag>
    </div>
    <div class="page-content">
      <el-descriptions v-if="execution" :column="2" border>
        <el-descriptions-item label="ID">{{ execution.id }}</el-descriptions-item>
        <el-descriptions-item label="Workflow ID">{{ execution.workflowId }}</el-descriptions-item>
        <el-descriptions-item label="Mode">{{ execution.mode }}</el-descriptions-item>
        <el-descriptions-item label="Started">{{ execution.startedAt }}</el-descriptions-item>
        <el-descriptions-item label="Stopped">{{ execution.stoppedAt ?? 'Running…' }}</el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { executionsApi } from '@/api/index.js';
const route = useRoute();
const execution = ref<any>(null);
function statusType(s: string) { const m: any = {success:'success',error:'danger',running:'warning',canceled:'info'}; return m[s] ?? ''; }
onMounted(async () => { const r = await executionsApi.get(route.params['id'] as string); execution.value = r.data; });
</script>
<style scoped>
.page-wrap{height:100%;display:flex;flex-direction:column}
.page-header{display:flex;align-items:center;gap:12px;padding:16px 32px;border-bottom:1px solid var(--el-border-color-lighter);background:var(--el-bg-color)}
.page-title{font-size:20px;font-weight:700}
.page-content{flex:1;overflow-y:auto;padding:24px 32px}
</style>
