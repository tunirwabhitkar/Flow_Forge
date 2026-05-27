<template>
  <div class="node-palette">
    <div class="palette-header">
      <h3>Nodes</h3>
      <el-input
        v-model="search"
        size="small"
        :prefix-icon="Search"
        placeholder="Search…"
        clearable
      />
    </div>

    <div class="palette-body">
      <div
        v-for="group in filteredGroups"
        :key="group.name"
        class="node-group"
      >
        <div
          class="group-header"
          @click="toggleGroup(group.name)"
        >
          <el-icon :size="12">
            <component :is="expandedGroups.has(group.name) ? 'ArrowDown' : 'ArrowRight'" />
          </el-icon>
          <span>{{ group.label }}</span>
          <span class="group-count">{{ group.nodes.length }}</span>
        </div>

        <div v-if="expandedGroups.has(group.name)" class="group-nodes">
          <div
            v-for="node in group.nodes"
            :key="node.name"
            class="palette-node"
            draggable="true"
            @dragstart="onDragStart($event, node.name)"
            @dragend="onDragEnd"
            @click="$emit('add-node', node.name)"
          >
            <div
              class="node-icon"
              :style="{ background: node.color ?? '#6E56CF' }"
            >
              <el-icon color="white" :size="14">
                <component :is="getNodeIcon(node)" />
              </el-icon>
            </div>
            <div class="node-info">
              <span class="node-name">{{ node.displayName }}</span>
              <span class="node-desc">{{ truncate(node.description, 48) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredGroups.length === 0" class="no-results">
        <el-icon :size="32" color="#c0c4cc"><Search /></el-icon>
        <p>No nodes found for "{{ search }}"</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Search, ArrowDown, ArrowRight, Globe, Clock, Code, Mail, DataLine } from '@element-plus/icons-vue';
import { nodeTypesApi, type NodeTypeDescription } from '@/api/index.js';

const emit = defineEmits<{ 'add-node': [type: string] }>();

const nodeTypes = ref<NodeTypeDescription[]>([]);
const search = ref('');
const expandedGroups = ref(new Set(['trigger', 'action', 'transform', 'flow']));

const GROUP_META: Record<string, { label: string; order: number }> = {
  trigger:       { label: 'Triggers',       order: 0 },
  action:        { label: 'Actions',         order: 1 },
  transform:     { label: 'Transform',       order: 2 },
  flow:          { label: 'Flow Control',    order: 3 },
  communication: { label: 'Communication',   order: 4 },
  database:      { label: 'Databases',       order: 5 },
  ai:            { label: 'AI / LLM',        order: 6 },
  cloud:         { label: 'Cloud Services',  order: 7 },
  devTools:      { label: 'Dev Tools',       order: 8 },
  ecommerce:     { label: 'Ecommerce',       order: 9 },
  marketing:     { label: 'Marketing',       order: 10 },
  utility:       { label: 'Utility',         order: 11 },
};

const filteredGroups = computed(() => {
  const q = search.value.toLowerCase();
  const grouped: Record<string, { name: string; label: string; order: number; nodes: NodeTypeDescription[] }> = {};

  for (const node of nodeTypes.value) {
    if (q && !node.displayName.toLowerCase().includes(q) && !node.description.toLowerCase().includes(q)) continue;
    const groupKey = node.group[0] ?? 'utility';
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        name: groupKey,
        label: GROUP_META[groupKey]?.label ?? groupKey,
        order: GROUP_META[groupKey]?.order ?? 99,
        nodes: [],
      };
    }
    grouped[groupKey]!.nodes.push(node);
  }

  return Object.values(grouped).sort((a, b) => a.order - b.order);
});

function toggleGroup(name: string): void {
  if (expandedGroups.value.has(name)) expandedGroups.value.delete(name);
  else expandedGroups.value.add(name);
}

function onDragStart(event: DragEvent, nodeType: string): void {
  event.dataTransfer?.setData('application/flowforge-node', nodeType);
  event.dataTransfer!.effectAllowed = 'move';
}

function onDragEnd(): void {}

function getNodeIcon(node: NodeTypeDescription): string {
  if (node.group.includes('trigger')) return 'Clock';
  if (node.group.includes('communication')) return 'Message';
  if (node.group.includes('database')) return 'DataLine';
  if (node.group.includes('ai')) return 'MagicStick';
  if (node.name.includes('http')) return 'Globe';
  if (node.name.includes('code')) return 'Code';
  return 'Connection';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

onMounted(async () => {
  const res = await nodeTypesApi.list();
  nodeTypes.value = res.data.data;
  // If search is active, auto-expand all groups
  if (search.value) expandedGroups.value = new Set(nodeTypes.value.map((n) => n.group[0] ?? 'utility'));
});
</script>

<style scoped>
.node-palette {
  width: 240px;
  min-width: 240px;
  background: white;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}

.palette-header {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette-header h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.node-group { }

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  user-select: none;
}

.group-header:hover { background: var(--el-fill-color-lighter); }

.group-count {
  margin-left: auto;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
}

.group-nodes {
  padding: 2px 0 6px;
}

.palette-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: grab;
  transition: background 0.12s;
  user-select: none;
}

.palette-node:hover {
  background: var(--el-fill-color-lighter);
}

.palette-node:active { cursor: grabbing; }

.node-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.node-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-desc {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: center;
}
</style>
