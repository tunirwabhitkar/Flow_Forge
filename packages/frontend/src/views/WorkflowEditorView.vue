<template>
  <div class="editor-shell" @keydown.meta.s.prevent="editorStore.save()" @keydown.ctrl.s.prevent="editorStore.save()">
    <!-- Top toolbar -->
    <EditorToolbar />

    <div class="editor-body">
      <!-- Node palette sidebar -->
      <NodePalette v-if="!paletteCollapsed" @add-node="handleAddNode" />
      <button class="palette-toggle" @click="paletteCollapsed = !paletteCollapsed">
        <el-icon><component :is="paletteCollapsed ? 'Expand' : 'Fold'" /></el-icon>
      </button>

      <!-- Canvas -->
      <div class="canvas-area" ref="canvasRef">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          :default-edge-options="defaultEdgeOptions"
          :connect-on-click="false"
          :snap-to-grid="true"
          :snap-grid="[20, 20]"
          fit-view-on-init
          class="flowforge-canvas"
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
          @node-double-click="onNodeDoubleClick"
          @connect="onConnect"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @drop="onDrop"
          @dragover.prevent
        >
          <Background pattern-color="#e8eaf0" :gap="20" />
          <Controls />
          <MiniMap
            node-color="#6E56CF"
            mask-color="rgba(26,26,46,0.6)"
          />

          <!-- Custom node types rendered via slot -->
          <template #node-flowforge="nodeProps">
            <FlowForgeNode v-bind="nodeProps" @open-panel="editorStore.selectNode(nodeProps.id)" />
          </template>
        </VueFlow>

        <!-- Drop overlay hint -->
        <div v-if="isDraggingNode" class="drop-overlay">
          <el-icon :size="40" color="#6E56CF"><Plus /></el-icon>
          <p>Drop here to add node</p>
        </div>
      </div>

      <!-- Node configuration panel -->
      <NodeConfigPanel
        v-if="editorStore.isPanelOpen && editorStore.selectedNode"
        :node="editorStore.selectedNode"
        @close="editorStore.selectNode(null)"
        @update="(params: Record<string, unknown>) => editorStore.updateNodeParameters(editorStore.selectedNodeId!, params)"
        @delete="editorStore.deleteNode(editorStore.selectedNodeId!)"
      />
    </div>

    <!-- AI Assistant panel -->
    <AIAssistantPanel
      v-if="showAIPanel"
      @close="showAIPanel = false"
      @insert-nodes="handleInsertNodes"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue';
import { useRoute } from 'vue-router';
import { VueFlow, useVueFlow, type Connection, type NodeChange, type EdgeChange } from '@vueflow/core';
import { Background } from '@vueflow/background';
import { Controls } from '@vueflow/controls';
import { MiniMap } from '@vueflow/minimap';
import '@vueflow/core/dist/style.css';
import '@vueflow/background/dist/style.css';
import '@vueflow/controls/dist/style.css';
import '@vueflow/minimap/dist/style.css';

import { useWorkflowEditorStore } from '@/stores/workflowEditor.js';
import EditorToolbar from '@/components/editor/EditorToolbar.vue';
import NodePalette from '@/components/editor/NodePalette.vue';
import FlowForgeNode from '@/components/nodes/FlowForgeNode.vue';
import NodeConfigPanel from '@/components/editor/NodeConfigPanel.vue';
import AIAssistantPanel from '@/components/editor/AIAssistantPanel.vue';

const route = useRoute();
const editorStore = useWorkflowEditorStore();
const { addEdges, project } = useVueFlow();

const paletteCollapsed = ref(false);
const showAIPanel = ref(false);
const isDraggingNode = ref(false);
const canvasRef = ref<HTMLElement>();

const nodeTypes = { flowforge: FlowForgeNode };
const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: '#6E56CF', strokeWidth: 2 },
  animated: false,
};

const nodes = computed({
  get: () => editorStore.nodes,
  set: (val) => { editorStore.nodes = val as any; },
});

const edges = computed({
  get: () => editorStore.edges,
  set: (val) => { editorStore.edges = val as any; },
});

provide('showAIPanel', () => { showAIPanel.value = true; });

onMounted(async () => {
  const id = route.params['id'] as string;
  await editorStore.loadWorkflow(id);
});

function onNodeClick(_: MouseEvent, node: any): void {
  editorStore.selectNode(node.id);
}

function onPaneClick(): void {
  editorStore.selectNode(null);
}

function onNodeDoubleClick(_: MouseEvent, node: any): void {
  editorStore.selectNode(node.id);
}

function onConnect(connection: Connection): void {
  editorStore.pushHistory();
  addEdges([{
    ...connection,
    id: `${connection.source}-${connection.target}-${Date.now()}`,
    type: 'smoothstep',
    style: { stroke: '#6E56CF', strokeWidth: 2 },
  }]);
  editorStore.isDirty = true;
}

function onNodesChange(changes: NodeChange[]): void {
  if (changes.some((c) => c.type !== 'select' && c.type !== 'position')) {
    editorStore.isDirty = true;
  }
}

function onEdgesChange(_changes: EdgeChange[]): void {
  editorStore.isDirty = true;
}

function handleAddNode(type: string): void {
  // Add near center of viewport
  const bounds = canvasRef.value?.getBoundingClientRect();
  const x = (bounds?.width ?? 800) / 2 - 100;
  const y = (bounds?.height ?? 600) / 2 - 50;
  editorStore.addNode(type, project({ x, y }));
}

function onDrop(event: DragEvent): void {
  const nodeType = event.dataTransfer?.getData('application/flowforge-node');
  if (!nodeType || !canvasRef.value) return;
  const bounds = canvasRef.value.getBoundingClientRect();
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  });
  editorStore.addNode(nodeType, position);
  isDraggingNode.value = false;
}

function handleInsertNodes(payload: { nodes: any[]; connections: any }): void {
  for (const n of payload.nodes) {
    editorStore.addNode(n.type, { x: n.position[0], y: n.position[1] });
  }
  showAIPanel.value = false;
}
</script>

<style scoped>
.editor-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #f8f9fc;
  position: relative;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.flowforge-canvas {
  width: 100%;
  height: 100%;
  background: #f1f3f8;
}

.palette-toggle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  background: white;
  border: 1px solid var(--el-border-color);
  border-left: none;
  border-radius: 0 6px 6px 0;
  padding: 8px 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--el-text-color-secondary);
  transition: background 0.15s;
}

.palette-toggle:hover {
  background: var(--el-fill-color);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(110, 86, 207, 0.05);
  border: 3px dashed #6E56CF;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  pointer-events: none;
  z-index: 100;
  font-size: 16px;
  color: #6E56CF;
}
</style>
