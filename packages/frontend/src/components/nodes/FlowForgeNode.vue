<template>
  <div
    class="ff-node"
    :class="{
      'is-selected': selected,
      'has-error': data.hasError,
      'is-executing': data.isExecuting,
      'is-disabled': data.nodeData.disabled,
    }"
    @click="$emit('open-panel')"
  >
    <!-- Input handles -->
    <Handle
      v-for="(input, idx) in inputs"
      :key="`in-${idx}`"
      type="target"
      :position="Position.Left"
      :id="`input-${idx}`"
      :style="getHandleStyle(idx, inputs.length, 'left')"
      class="ff-handle"
    />

    <!-- Node body -->
    <div class="node-header" :style="{ background: nodeColor }">
      <div class="node-icon-wrap">
        <el-icon color="white" :size="16">
          <component :is="nodeIcon" />
        </el-icon>
      </div>
      <span class="node-type-label">{{ typeLabel }}</span>

      <!-- Status badges -->
      <div class="status-indicators">
        <div v-if="data.isExecuting" class="exec-spinner" />
        <el-icon v-else-if="data.hasError" color="white" :size="14"><CircleClose /></el-icon>
        <el-icon v-else-if="hasOutput" color="white" :size="14"><Select /></el-icon>
      </div>
    </div>

    <div class="node-body">
      <div class="node-name">{{ data.nodeData.name }}</div>
      <div v-if="data.nodeData.disabled" class="disabled-badge">Disabled</div>
    </div>

    <!-- Execution output preview -->
    <div v-if="data.executionOutput" class="exec-output">
      <span class="output-count">{{ outputItemCount }} item{{ outputItemCount !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Output handles -->
    <Handle
      v-for="(output, idx) in outputs"
      :key="`out-${idx}`"
      type="source"
      :position="Position.Right"
      :id="`${output.type}-${idx}`"
      :style="getHandleStyle(idx, outputs.length, 'right')"
      class="ff-handle ff-handle--output"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vueflow/core';
import { CircleClose, Select, Connection, Clock, Globe, Code, DataLine, Message, MagicStick } from '@element-plus/icons-vue';

interface NodeData {
  nodeData: {
    name: string;
    type: string;
    disabled?: boolean;
    parameters: Record<string, unknown>;
  };
  selected: boolean;
  hasError: boolean;
  isExecuting: boolean;
  executionOutput?: unknown[][];
}

const props = defineProps<{
  id: string;
  data: NodeData;
  selected: boolean;
}>();

defineEmits<{ 'open-panel': [] }>();

const NODE_COLORS: Record<string, string> = {
  'flowforge.webhook':         '#6E56CF',
  'flowforge.scheduleTrigger': '#31C48D',
  'flowforge.httpRequest':     '#2196F3',
  'flowforge.code':            '#FF6D5A',
  'flowforge.set':             '#0AA55C',
  'flowforge.if':              '#408000',
  'flowforge.sendEmail':       '#EA4335',
  'flowforge.slack':           '#4A154B',
  'flowforge.postgres':        '#336791',
  'flowforge.aiLLM':           '#8B5CF6',
};

const NODE_ICONS: Record<string, string> = {
  'flowforge.webhook':         'Globe',
  'flowforge.scheduleTrigger': 'Clock',
  'flowforge.httpRequest':     'Globe',
  'flowforge.code':            'Code',
  'flowforge.set':             'EditPen',
  'flowforge.if':              'Sort',
  'flowforge.sendEmail':       'Message',
  'flowforge.slack':           'ChatLineRound',
  'flowforge.postgres':        'DataLine',
  'flowforge.aiLLM':           'MagicStick',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  'flowforge.webhook':         'Webhook',
  'flowforge.scheduleTrigger': 'Schedule',
  'flowforge.httpRequest':     'HTTP',
  'flowforge.code':            'Code',
  'flowforge.set':             'Set Fields',
  'flowforge.if':              'IF',
  'flowforge.sendEmail':       'Email',
  'flowforge.slack':           'Slack',
  'flowforge.postgres':        'Postgres',
  'flowforge.aiLLM':           'AI LLM',
};

const nodeColor = computed(() => NODE_COLORS[props.data.nodeData.type] ?? '#6E56CF');
const nodeIcon = computed(() => NODE_ICONS[props.data.nodeData.type] ?? 'Connection');
const typeLabel = computed(() => NODE_TYPE_LABELS[props.data.nodeData.type] ?? props.data.nodeData.type.split('.').pop());

const inputs = computed(() => [{ type: 'main' }]);
const outputs = computed(() => {
  // IF node has two outputs
  if (props.data.nodeData.type === 'flowforge.if') {
    return [{ type: 'main', label: 'True' }, { type: 'main', label: 'False' }];
  }
  // Triggers have no inputs, one output
  return [{ type: 'main' }];
});

const isTrigger = computed(() =>
  ['flowforge.webhook', 'flowforge.scheduleTrigger'].includes(props.data.nodeData.type)
);

const hasOutput = computed(() =>
  Array.isArray(props.data.executionOutput) && props.data.executionOutput.length > 0
);

const outputItemCount = computed(() => {
  if (!props.data.executionOutput) return 0;
  return (props.data.executionOutput as unknown[][])[0]?.length ?? 0;
});

function getHandleStyle(
  idx: number,
  total: number,
  side: 'left' | 'right',
): Record<string, string> {
  if (total === 1) return { top: '50%' };
  const step = 100 / (total + 1);
  return { top: `${step * (idx + 1)}%` };
}
</script>

<style scoped>
.ff-node {
  min-width: 180px;
  max-width: 240px;
  background: white;
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: visible;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.ff-node:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}

.ff-node.is-selected {
  border-color: #6E56CF;
  box-shadow: 0 0 0 3px rgba(110, 86, 207, 0.2);
}

.ff-node.has-error {
  border-color: var(--el-color-danger);
}

.ff-node.is-executing {
  border-color: var(--el-color-warning);
}

.ff-node.is-disabled {
  opacity: 0.6;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 7px 7px 0 0;
}

.node-icon-wrap {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-type-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-indicators {
  display: flex;
  align-items: center;
}

.exec-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.node-body {
  padding: 8px 10px;
}

.node-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.disabled-badge {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}

.exec-output {
  padding: 4px 10px 6px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.output-count {
  font-size: 11px;
  color: var(--el-color-success);
  font-weight: 500;
}

.ff-handle {
  width: 10px !important;
  height: 10px !important;
  border: 2px solid white !important;
  background: #6E56CF !important;
  border-radius: 50% !important;
}

.ff-handle--output {
  background: #2196F3 !important;
}
</style>
