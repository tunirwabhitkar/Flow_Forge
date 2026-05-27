<template>
  <div class="editor-toolbar">
    <!-- Left: back + workflow name -->
    <div class="toolbar-left">
      <el-button text :icon="ArrowLeft" @click="goBack">
        Workflows
      </el-button>
      <div class="divider" />
      <div class="workflow-title-wrap">
        <template v-if="editingName">
          <el-input
            v-model="tempName"
            size="small"
            autofocus
            style="width: 240px"
            @blur="commitName"
            @keydown.enter="commitName"
            @keydown.escape="cancelNameEdit"
          />
        </template>
        <template v-else>
          <h2 class="workflow-title" @dblclick="startNameEdit">
            {{ editorStore.workflow?.name ?? 'Loading…' }}
          </h2>
          <el-icon class="edit-icon" :size="14" @click="startNameEdit"><EditPen /></el-icon>
        </template>
      </div>

      <el-tag v-if="editorStore.isDirty" size="small" type="warning" effect="plain">
        Unsaved
      </el-tag>
    </div>

    <!-- Center: undo/redo -->
    <div class="toolbar-center">
      <el-tooltip content="Undo (⌘Z)">
        <el-button text :icon="RefreshLeft" :disabled="!editorStore.canUndo" @click="editorStore.undo()" />
      </el-tooltip>
      <el-tooltip content="Redo (⌘⇧Z)">
        <el-button text :icon="RefreshRight" :disabled="!editorStore.canRedo" @click="editorStore.redo()" />
      </el-tooltip>
    </div>

    <!-- Right: AI + test + save + activate -->
    <div class="toolbar-right">
      <el-tooltip content="AI Assistant">
        <el-button
          text
          class="ai-btn"
          @click="openAIPanel"
        >
          <el-icon :size="16"><MagicStick /></el-icon>
          AI
        </el-button>
      </el-tooltip>

      <el-tooltip content="Test workflow (manual run)">
        <el-button
          :icon="VideoPlay"
          :loading="editorStore.isExecuting"
          @click="editorStore.runTest()"
        >
          Test
        </el-button>
      </el-tooltip>

      <el-button
        :loading="editorStore.isSaving"
        :icon="editorStore.isDirty ? DocumentChecked : Check"
        @click="editorStore.save()"
      >
        Save
      </el-button>

      <el-button
        :type="editorStore.isActive ? 'success' : 'primary'"
        @click="editorStore.toggleActive()"
      >
        <el-icon :size="14">
          <component :is="editorStore.isActive ? 'VideoPause' : 'VideoPlay'" />
        </el-icon>
        {{ editorStore.isActive ? 'Active' : 'Activate' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkflowEditorStore } from '@/stores/workflowEditor.js';
import {
  ArrowLeft, EditPen, RefreshLeft, RefreshRight,
  VideoPlay, DocumentChecked, Check, MagicStick,
} from '@element-plus/icons-vue';
import { workflowsApi } from '@/api/index.js';
import { ElMessage } from 'element-plus';

const router = useRouter();
const editorStore = useWorkflowEditorStore();
const openAIPanel = inject<() => void>('showAIPanel', () => {});

const editingName = ref(false);
const tempName = ref('');

function goBack(): void {
  if (editorStore.isDirty) {
    // Simple confirm — in production use a dialog
    if (!confirm('You have unsaved changes. Leave anyway?')) return;
  }
  router.push('/workflows');
}

function startNameEdit(): void {
  tempName.value = editorStore.workflow?.name ?? '';
  editingName.value = true;
}

async function commitName(): Promise<void> {
  editingName.value = false;
  const name = tempName.value.trim();
  if (!name || !editorStore.workflow || name === editorStore.workflow.name) return;
  try {
    const res = await workflowsApi.update(editorStore.workflow.id, { name });
    editorStore.workflow = res.data;
    ElMessage.success('Renamed');
  } catch {
    ElMessage.error('Failed to rename');
  }
}

function cancelNameEdit(): void {
  editingName.value = false;
}
</script>

<style scoped>
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 52px;
  background: white;
  border-bottom: 1px solid var(--el-border-color-lighter);
  z-index: 100;
  flex-shrink: 0;
  gap: 12px;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-left { flex: 1; }
.toolbar-center { flex-shrink: 0; }
.toolbar-right { flex: 1; justify-content: flex-end; }

.divider {
  width: 1px;
  height: 20px;
  background: var(--el-border-color);
  margin: 0 4px;
}

.workflow-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.workflow-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  cursor: text;
  white-space: nowrap;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-icon {
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.workflow-title-wrap:hover .edit-icon {
  opacity: 1;
}

.ai-btn {
  color: #8B5CF6 !important;
  font-weight: 600;
  gap: 4px;
}

.ai-btn:hover {
  background: rgba(139, 92, 246, 0.08) !important;
}
</style>
