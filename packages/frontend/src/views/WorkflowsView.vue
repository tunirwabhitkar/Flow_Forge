<template>
  <div class="workflows-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">Workflows</h1>
        <span class="count-badge">{{ total }}</span>
      </div>
      <div class="header-right">
        <el-input
          v-model="searchQuery"
          placeholder="Search workflows…"
          :prefix-icon="Search"
          clearable
          style="width: 260px"
        />
        <el-button type="primary" :icon="Plus" @click="createWorkflow">
          New Workflow
        </el-button>
      </div>
    </div>

    <!-- Workflows grid -->
    <div class="workflows-content">
      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="6" animated />
      </div>

      <div v-else-if="filteredWorkflows.length === 0" class="empty-state">
        <div class="empty-icon">
          <el-icon :size="64" color="#c0c4cc"><Connection /></el-icon>
        </div>
        <h2>No workflows yet</h2>
        <p>Create your first workflow to start automating tasks</p>
        <el-button type="primary" :icon="Plus" size="large" @click="createWorkflow">
          Create Workflow
        </el-button>
      </div>

      <div v-else class="workflows-grid">
        <div
          v-for="workflow in filteredWorkflows"
          :key="workflow.id"
          class="workflow-card"
          @click="openEditor(workflow.id)"
        >
          <div class="card-header">
            <div class="card-icon" :style="{ background: workflowColor(workflow.name) }">
              <el-icon color="white" :size="20"><Connection /></el-icon>
            </div>
            <div class="card-actions" @click.stop>
              <el-switch
                v-model="workflow.active"
                size="small"
                @change="(val: boolean) => toggleWorkflow(workflow, val)"
              />
              <el-dropdown trigger="click">
                <el-button text :icon="MoreFilled" size="small" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openEditor(workflow.id)">
                      <el-icon><Edit /></el-icon> Edit
                    </el-dropdown-item>
                    <el-dropdown-item @click="duplicateWorkflow(workflow)">
                      <el-icon><CopyDocument /></el-icon> Duplicate
                    </el-dropdown-item>
                    <el-dropdown-item @click="runWorkflow(workflow)">
                      <el-icon><VideoPlay /></el-icon> Run manually
                    </el-dropdown-item>
                    <el-dropdown-item divided class="danger" @click="confirmDelete(workflow)">
                      <el-icon><Delete /></el-icon> Delete
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>

          <div class="card-body">
            <h3 class="workflow-name">{{ workflow.name }}</h3>
            <div class="workflow-meta">
              <span class="meta-item">
                <el-icon :size="12"><Clock /></el-icon>
                {{ formatDate(workflow.updatedAt) }}
              </span>
            </div>
          </div>

          <div class="card-footer">
            <el-tag
              :type="workflow.active ? 'success' : 'info'"
              size="small"
              effect="light"
            >
              {{ workflow.active ? 'Active' : 'Inactive' }}
            </el-tag>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="total > pageSize" class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="fetchWorkflows"
        />
      </div>
    </div>

    <!-- Create Workflow Dialog -->
    <el-dialog v-model="showCreateDialog" title="Create Workflow" width="480px">
      <el-form :model="createForm" label-position="top" @submit.prevent="submitCreate">
        <el-form-item label="Workflow Name" required>
          <el-input
            v-model="createForm.name"
            placeholder="My Automation Workflow"
            autofocus
            @keydown.enter="submitCreate"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">Create</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, Search, MoreFilled, Edit, Delete, CopyDocument,
  VideoPlay, Connection, Clock,
} from '@element-plus/icons-vue';
import { workflowsApi, type WorkflowSummary } from '@/api/index.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const router = useRouter();
const workflows = ref<WorkflowSummary[]>([]);
const loading = ref(false);
const total = ref(0);
const currentPage = ref(1);
const pageSize = 24;
const searchQuery = ref('');
const showCreateDialog = ref(false);
const creating = ref(false);
const createForm = ref({ name: '' });

const filteredWorkflows = computed(() => {
  const q = searchQuery.value.toLowerCase();
  if (!q) return workflows.value;
  return workflows.value.filter((w) => w.name.toLowerCase().includes(q));
});

function workflowColor(name: string): string {
  const colors = ['#6E56CF', '#2196F3', '#31C48D', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return colors[hash % colors.length]!;
}

function formatDate(d: string): string {
  return dayjs(d).fromNow();
}

async function fetchWorkflows(): Promise<void> {
  loading.value = true;
  try {
    const offset = (currentPage.value - 1) * pageSize;
    const res = await workflowsApi.list({ limit: pageSize, offset });
    workflows.value = res.data.data;
    total.value = res.data.count;
  } finally {
    loading.value = false;
  }
}

function openEditor(id: string): void {
  router.push(`/workflows/${id}/edit`);
}

function createWorkflow(): void {
  createForm.value = { name: '' };
  showCreateDialog.value = true;
}

async function submitCreate(): Promise<void> {
  if (!createForm.value.name.trim()) return;
  creating.value = true;
  try {
    const res = await workflowsApi.create({ name: createForm.value.name });
    showCreateDialog.value = false;
    ElMessage.success('Workflow created');
    router.push(`/workflows/${res.data.id}/edit`);
  } finally {
    creating.value = false;
  }
}

async function toggleWorkflow(workflow: WorkflowSummary, val: boolean): Promise<void> {
  try {
    if (val) {
      await workflowsApi.activate(workflow.id);
      ElMessage.success(`"${workflow.name}" activated`);
    } else {
      await workflowsApi.deactivate(workflow.id);
      ElMessage.info(`"${workflow.name}" deactivated`);
    }
  } catch (err: any) {
    workflow.active = !val; // revert
    ElMessage.error(err.response?.data?.error ?? 'Failed to toggle workflow');
  }
}

async function runWorkflow(workflow: WorkflowSummary): Promise<void> {
  try {
    await workflowsApi.run(workflow.id);
    ElMessage.success('Execution started');
    router.push('/executions');
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error ?? 'Failed to run workflow');
  }
}

async function duplicateWorkflow(workflow: WorkflowSummary): Promise<void> {
  try {
    const detail = await workflowsApi.get(workflow.id);
    await workflowsApi.create({ ...detail.data, name: `${workflow.name} (copy)`, active: false });
    ElMessage.success('Workflow duplicated');
    fetchWorkflows();
  } catch {
    ElMessage.error('Failed to duplicate');
  }
}

async function confirmDelete(workflow: WorkflowSummary): Promise<void> {
  await ElMessageBox.confirm(
    `Delete "${workflow.name}"? This cannot be undone.`,
    'Delete Workflow',
    { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' },
  );
  await workflowsApi.delete(workflow.id);
  ElMessage.success('Workflow deleted');
  fetchWorkflows();
}

onMounted(fetchWorkflows);
</script>

<style scoped>
.workflows-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.count-badge {
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workflows-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.workflows-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.workflow-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s, transform 0.1s;
}

.workflow-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-1px);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-body {
  margin-bottom: 12px;
}

.workflow-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workflow-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
  text-align: center;
}

.empty-icon { opacity: 0.4; }

.empty-state h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.empty-state p {
  color: var(--el-text-color-secondary);
  max-width: 320px;
}

.pagination {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

:deep(.danger) { color: var(--el-color-danger); }
</style>
