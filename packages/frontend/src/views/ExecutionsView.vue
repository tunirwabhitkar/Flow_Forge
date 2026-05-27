<template>
  <div class="executions-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">Executions</h1>
        <span class="count-badge">{{ total }}</span>
      </div>
      <div class="header-right">
        <el-select v-model="statusFilter" placeholder="All statuses" clearable style="width: 160px">
          <el-option label="Success" value="success" />
          <el-option label="Error" value="error" />
          <el-option label="Running" value="running" />
          <el-option label="Canceled" value="canceled" />
        </el-select>
        <el-button :icon="Refresh" @click="fetchExecutions">Refresh</el-button>
      </div>
    </div>

    <div class="executions-table-wrap">
      <el-table
        v-loading="loading"
        :data="executions"
        row-key="id"
        stripe
        style="width: 100%"
        @row-click="openDetail"
      >
        <el-table-column label="Status" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="light">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Workflow" prop="workflowId" min-width="200">
          <template #default="{ row }">
            <span class="mono">{{ row.workflowId.slice(0, 8) }}…</span>
          </template>
        </el-table-column>

        <el-table-column label="Mode" prop="mode" width="100">
          <template #default="{ row }">
            <el-tag type="info" size="small" effect="plain">{{ row.mode }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Started" width="180">
          <template #default="{ row }">
            {{ formatDate(row.startedAt) }}
          </template>
        </el-table-column>

        <el-table-column label="Duration" width="120">
          <template #default="{ row }">
            {{ duration(row.startedAt, row.stoppedAt) }}
          </template>
        </el-table-column>

        <el-table-column label="" width="120" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'error'"
              text size="small" type="primary"
              @click.stop="retryExecution(row)"
            >
              Retry
            </el-button>
            <el-button
              v-if="row.status === 'running'"
              text size="small" type="warning"
              @click.stop="cancelExecution(row)"
            >
              Cancel
            </el-button>
            <el-button
              text size="small" type="danger"
              :icon="Delete"
              @click.stop="deleteExecution(row)"
            />
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination" v-if="total > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="fetchExecutions"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Refresh, Delete } from '@element-plus/icons-vue';
import { executionsApi, type ExecutionSummary } from '@/api/index.js';
import dayjs from 'dayjs';

const router = useRouter();
const executions = ref<ExecutionSummary[]>([]);
const loading = ref(false);
const total = ref(0);
const currentPage = ref(1);
const pageSize = 25;
const statusFilter = ref('');

function statusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    success: 'success', error: 'danger', running: 'warning',
    canceled: 'info', waiting: 'info', crashed: 'danger',
  };
  return map[status] ?? '';
}

function formatDate(d: string): string {
  return dayjs(d).format('MMM D, HH:mm:ss');
}

function duration(start: string, stop?: string): string {
  if (!stop) return 'Running…';
  const ms = dayjs(stop).diff(dayjs(start));
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

async function fetchExecutions(): Promise<void> {
  loading.value = true;
  try {
    const offset = (currentPage.value - 1) * pageSize;
    const res = await executionsApi.list({ limit: pageSize, offset });
    executions.value = res.data.data;
    total.value = res.data.count;
  } finally {
    loading.value = false;
  }
}

function openDetail(row: ExecutionSummary): void {
  router.push(`/executions/${row.id}`);
}

async function retryExecution(row: ExecutionSummary): Promise<void> {
  await executionsApi.retry(row.id);
  ElMessage.success('Retry started');
  fetchExecutions();
}

async function cancelExecution(row: ExecutionSummary): Promise<void> {
  await executionsApi.cancel(row.id);
  ElMessage.info('Canceled');
  fetchExecutions();
}

async function deleteExecution(row: ExecutionSummary): Promise<void> {
  await executionsApi.delete(row.id);
  ElMessage.success('Deleted');
  fetchExecutions();
}

watch(statusFilter, () => { currentPage.value = 1; fetchExecutions(); });
onMounted(fetchExecutions);
</script>

<style scoped>
.executions-page { height: 100%; display: flex; flex-direction: column; }
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24px 32px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.header-left { display: flex; align-items: center; gap: 12px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.page-title { font-size: 22px; font-weight: 700; }
.count-badge { background: var(--el-fill-color); color: var(--el-text-color-secondary); font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.executions-table-wrap { flex: 1; overflow-y: auto; padding: 24px 32px; }
.mono { font-family: monospace; font-size: 12px; }
.pagination { margin-top: 20px; display: flex; justify-content: center; }
</style>
