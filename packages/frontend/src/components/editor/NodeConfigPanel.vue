<template>
  <div class="config-panel">
    <div class="panel-header">
      <div class="panel-title-row">
        <div class="panel-icon" :style="{ background: nodeColor }">
          <el-icon color="white" :size="16"><Connection /></el-icon>
        </div>
        <div class="panel-title-info">
          <h3>{{ nodeData.name }}</h3>
          <span class="node-type">{{ nodeData.type }}</span>
        </div>
      </div>
      <div class="panel-actions">
        <el-tooltip content="Disable node">
          <el-switch v-model="localEnabled" size="small" @change="handleEnabledChange" />
        </el-tooltip>
        <el-button text :icon="Delete" size="small" type="danger" @click="$emit('delete')" />
        <el-button text :icon="Close" size="small" @click="$emit('close')" />
      </div>
    </div>

    <el-tabs v-model="activeTab" class="panel-tabs">
      <!-- Parameters tab -->
      <el-tab-pane label="Parameters" name="params">
        <div class="params-form">
          <template v-for="param in visibleParams" :key="param.name">
            <!-- String input -->
            <div v-if="param.type === 'string'" class="param-item">
              <label class="param-label">
                {{ param.displayName }}
                <span v-if="param.required" class="required">*</span>
              </label>
              <el-input
                :model-value="getParam(param.name) as string"
                :placeholder="param.placeholder ?? ''"
                size="small"
                @update:model-value="(v) => setParam(param.name, v)"
              />
              <p v-if="param.description" class="param-hint">{{ param.description }}</p>
            </div>

            <!-- Number input -->
            <div v-else-if="param.type === 'number'" class="param-item">
              <label class="param-label">{{ param.displayName }}</label>
              <el-input-number
                :model-value="getParam(param.name) as number"
                size="small"
                :min="param.typeOptions?.minValue"
                :max="param.typeOptions?.maxValue"
                :step="param.typeOptions?.numberStepSize ?? 1"
                style="width: 100%"
                @update:model-value="(v) => setParam(param.name, v)"
              />
            </div>

            <!-- Boolean toggle -->
            <div v-else-if="param.type === 'boolean'" class="param-item param-item--inline">
              <label class="param-label">{{ param.displayName }}</label>
              <el-switch
                :model-value="getParam(param.name) as boolean"
                @update:model-value="(v) => setParam(param.name, v)"
              />
            </div>

            <!-- Options select -->
            <div v-else-if="param.type === 'options'" class="param-item">
              <label class="param-label">{{ param.displayName }}</label>
              <el-select
                :model-value="getParam(param.name)"
                size="small"
                style="width: 100%"
                @update:model-value="(v) => setParam(param.name, v)"
              >
                <el-option
                  v-for="opt in param.options"
                  :key="String(opt.value)"
                  :label="opt.name"
                  :value="opt.value"
                />
              </el-select>
            </div>

            <!-- Code editor -->
            <div v-else-if="param.type === 'code'" class="param-item">
              <label class="param-label">{{ param.displayName }}</label>
              <div class="code-editor-wrap">
                <Codemirror
                  :model-value="getParam(param.name) as string ?? ''"
                  :extensions="getCodeExtensions(param.typeOptions?.language ?? 'javascript')"
                  :style="{ height: '240px', fontSize: '13px' }"
                  @update:model-value="(v) => setParam(param.name, v)"
                />
              </div>
            </div>

            <!-- JSON editor -->
            <div v-else-if="param.type === 'json'" class="param-item">
              <label class="param-label">{{ param.displayName }}</label>
              <div class="code-editor-wrap">
                <Codemirror
                  :model-value="jsonDisplay(getParam(param.name))"
                  :extensions="jsonExtensions"
                  :style="{ height: '160px', fontSize: '13px' }"
                  @update:model-value="(v) => setJsonParam(param.name, v)"
                />
              </div>
            </div>
          </template>
        </div>
      </el-tab-pane>

      <!-- Settings tab -->
      <el-tab-pane label="Settings" name="settings">
        <div class="params-form">
          <div class="param-item param-item--inline">
            <label class="param-label">Continue on Fail</label>
            <el-switch
              :model-value="nodeData.continueOnFail"
              @update:model-value="(v) => $emit('update', { continueOnFail: v })"
            />
          </div>
          <div class="param-item param-item--inline">
            <label class="param-label">Retry on Fail</label>
            <el-switch
              :model-value="nodeData.retryOnFail"
              @update:model-value="(v) => $emit('update', { retryOnFail: v })"
            />
          </div>
          <div v-if="nodeData.retryOnFail" class="param-item">
            <label class="param-label">Max Retries</label>
            <el-input-number
              :model-value="nodeData.maxTries ?? 3"
              :min="1"
              :max="10"
              size="small"
              @update:model-value="(v) => $emit('update', { maxTries: v })"
            />
          </div>
          <div class="param-item">
            <label class="param-label">Notes</label>
            <el-input
              :model-value="nodeData.notes ?? ''"
              type="textarea"
              :rows="3"
              placeholder="Notes about this node…"
              @update:model-value="(v) => $emit('update', { notes: v })"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Apply button -->
    <div class="panel-footer">
      <el-button type="primary" size="small" @click="applyChanges">Apply</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { Connection, Delete, Close } from '@element-plus/icons-vue';
import type { CanvasNode } from '@/stores/workflowEditor.js';
import { nodeTypesApi } from '@/api/index.js';

const props = defineProps<{
  node: CanvasNode;
}>();

const emit = defineEmits<{
  close: [];
  delete: [];
  update: [params: Record<string, unknown>];
}>();

const activeTab = ref('params');
const localParams = ref<Record<string, unknown>>({ ...props.node.data.nodeData.parameters });
const localEnabled = ref(!props.node.data.nodeData.disabled);
const nodeDescription = ref<any>(null);

watch(() => props.node.id, async () => {
  localParams.value = { ...props.node.data.nodeData.parameters };
  localEnabled.value = !props.node.data.nodeData.disabled;
  await fetchNodeDescription();
}, { immediate: true });

async function fetchNodeDescription(): Promise<void> {
  try {
    const res = await nodeTypesApi.get(props.node.data.nodeData.type);
    nodeDescription.value = res.data;
  } catch { /* ignore */ }
}

const nodeData = computed(() => props.node.data.nodeData as any);

const NODE_COLORS: Record<string, string> = {
  'flowforge.webhook': '#6E56CF',
  'flowforge.scheduleTrigger': '#31C48D',
  'flowforge.httpRequest': '#2196F3',
  'flowforge.code': '#FF6D5A',
  'flowforge.set': '#0AA55C',
  'flowforge.if': '#408000',
  'flowforge.sendEmail': '#EA4335',
  'flowforge.slack': '#4A154B',
  'flowforge.postgres': '#336791',
  'flowforge.aiLLM': '#8B5CF6',
};

const nodeColor = computed(() => NODE_COLORS[nodeData.value.type] ?? '#6E56CF');

const visibleParams = computed(() => {
  const params: any[] = nodeDescription.value?.properties ?? [];
  return params.filter((p: any) => {
    if (!p.displayOptions) return true;
    const show = p.displayOptions.show;
    if (!show) return true;
    return Object.entries(show).every(([key, vals]) => {
      const current = localParams.value[key];
      return (vals as unknown[]).includes(current);
    });
  });
});

const jsonExtensions = [json(), oneDark];

function getCodeExtensions(lang: string) {
  const base = [oneDark];
  if (lang === 'javascript') return [javascript({ jsx: false }), ...base];
  if (lang === 'json') return [json(), ...base];
  if (lang === 'html') return [html(), ...base];
  return [javascript(), ...base];
}

function getParam(name: string): unknown {
  return localParams.value[name] ?? nodeDescription.value?.properties?.find((p: any) => p.name === name)?.default ?? '';
}

function setParam(name: string, value: unknown): void {
  localParams.value = { ...localParams.value, [name]: value };
}

function setJsonParam(name: string, raw: string): void {
  try {
    localParams.value = { ...localParams.value, [name]: JSON.parse(raw) };
  } catch {
    localParams.value = { ...localParams.value, [name]: raw };
  }
}

function jsonDisplay(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return '{}'; }
}

function applyChanges(): void {
  emit('update', { ...localParams.value });
}

function handleEnabledChange(val: boolean): void {
  emit('update', { disabled: !val });
}
</script>

<style scoped>
.config-panel {
  width: 360px;
  min-width: 360px;
  background: white;
  border-left: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}

.panel-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.panel-title-info h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.node-type {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: monospace;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.panel-tabs {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
}

:deep(.el-tabs__header) {
  margin: 0;
  padding: 0 14px;
}

.params-form {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-item--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.param-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  display: flex;
  align-items: center;
  gap: 4px;
}

.required { color: var(--el-color-danger); }

.param-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}

.code-editor-wrap {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.panel-footer {
  padding: 10px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
</style>
