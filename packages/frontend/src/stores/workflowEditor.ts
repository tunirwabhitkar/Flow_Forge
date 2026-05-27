import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { nanoid } from 'nanoid';
import type { Node, Edge } from '@vueflow/core';
import { workflowsApi, executionsApi, type WorkflowDetail, type WorkflowNode } from '@/api/index.js';
import { ElMessage } from 'element-plus';

export interface CanvasNode extends Node {
  data: {
    nodeData: WorkflowNode;
    selected: boolean;
    hasError: boolean;
    isExecuting: boolean;
    executionOutput?: unknown;
  };
}

export const useWorkflowEditorStore = defineStore('workflowEditor', () => {
  // ─── State ────────────────────────────────────────────────────────────────
  const workflow = ref<WorkflowDetail | null>(null);
  const nodes = ref<CanvasNode[]>([]);
  const edges = ref<Edge[]>([]);
  const isDirty = ref(false);
  const isSaving = ref(false);
  const isExecuting = ref(false);
  const activeExecutionId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const isPanelOpen = ref(false);

  // Undo/redo stacks
  const history = ref<Array<{ nodes: CanvasNode[]; edges: Edge[] }>>([]);
  const future = ref<Array<{ nodes: CanvasNode[]; edges: Edge[] }>>([]);

  // ─── Getters ──────────────────────────────────────────────────────────────
  const selectedNode = computed(() =>
    nodes.value.find((n) => n.id === selectedNodeId.value),
  );

  const canUndo = computed(() => history.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  const isActive = computed(() => workflow.value?.active ?? false);

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function loadWorkflow(id: string): Promise<void> {
    const res = await workflowsApi.get(id);
    workflow.value = res.data;
    syncFromWorkflow(res.data);
    isDirty.value = false;
  }

  function syncFromWorkflow(wf: WorkflowDetail): void {
    nodes.value = wf.nodes.map((n) => ({
      id: n.id,
      type: 'flowforge',
      position: { x: n.position[0], y: n.position[1] },
      data: {
        nodeData: n,
        selected: false,
        hasError: false,
        isExecuting: false,
      },
    }));

    // Build edges from connections
    const newEdges: Edge[] = [];
    for (const [sourceName, outputs] of Object.entries(wf.connections)) {
      const sourceNode = wf.nodes.find((n) => n.name === sourceName);
      if (!sourceNode) continue;
      for (const [outputType, outputConnections] of Object.entries(outputs as Record<string, unknown[][]>)) {
        outputConnections.forEach((connections, outputIndex) => {
          connections.forEach((conn: any) => {
            const targetNode = wf.nodes.find((n) => n.name === conn.node);
            if (!targetNode) return;
            newEdges.push({
              id: `${sourceNode.id}-${targetNode.id}-${outputIndex}`,
              source: sourceNode.id,
              target: targetNode.id,
              sourceHandle: `${outputType}-${outputIndex}`,
              targetHandle: `input-0`,
              type: 'flowforge',
            });
          });
        });
      }
    }
    edges.value = newEdges;
  }

  function buildWorkflowPayload(): Partial<WorkflowDetail> {
    const updatedNodes: WorkflowNode[] = nodes.value.map((n) => ({
      ...n.data.nodeData,
      position: [Math.round(n.position.x), Math.round(n.position.y)],
    }));

    // Rebuild connections from edges
    const connections: Record<string, Record<string, unknown[][]>> = {};
    for (const edge of edges.value) {
      const sourceNode = nodes.value.find((n) => n.id === edge.source);
      const targetNode = nodes.value.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) continue;

      const sourceName = sourceNode.data.nodeData.name;
      const targetName = targetNode.data.nodeData.name;
      const outputIndex = parseInt(edge.sourceHandle?.split('-').pop() ?? '0') || 0;

      if (!connections[sourceName]) connections[sourceName] = {};
      if (!connections[sourceName]!['main']) connections[sourceName]!['main'] = [];
      while (connections[sourceName]!['main']!.length <= outputIndex) {
        connections[sourceName]!['main']!.push([]);
      }
      connections[sourceName]!['main']![outputIndex]!.push({
        node: targetName,
        type: 'main',
        index: 0,
      });
    }

    return { nodes: updatedNodes, connections };
  }

  async function save(): Promise<void> {
    if (!workflow.value || isSaving.value) return;
    isSaving.value = true;
    try {
      const payload = buildWorkflowPayload();
      const res = await workflowsApi.update(workflow.value.id, payload);
      workflow.value = res.data;
      isDirty.value = false;
      ElMessage.success('Workflow saved');
    } catch (err: any) {
      ElMessage.error(err.response?.data?.error ?? 'Failed to save workflow');
    } finally {
      isSaving.value = false;
    }
  }

  async function toggleActive(): Promise<void> {
    if (!workflow.value) return;
    try {
      if (workflow.value.active) {
        const res = await workflowsApi.deactivate(workflow.value.id);
        workflow.value = res.data;
        ElMessage.info('Workflow deactivated');
      } else {
        // Save before activating
        await save();
        const res = await workflowsApi.activate(workflow.value!.id);
        workflow.value = res.data;
        ElMessage.success('Workflow activated');
      }
    } catch (err: any) {
      ElMessage.error(err.response?.data?.error ?? 'Failed to toggle workflow');
    }
  }

  async function runTest(): Promise<string | null> {
    if (!workflow.value || isExecuting.value) return null;
    // Save first
    await save();
    isExecuting.value = true;
    try {
      const res = await workflowsApi.run(workflow.value!.id);
      const execId = (res.data as any).id;
      activeExecutionId.value = execId;
      ElMessage.info('Execution started');
      return execId;
    } catch (err: any) {
      ElMessage.error(err.response?.data?.error ?? 'Failed to run workflow');
      return null;
    } finally {
      isExecuting.value = false;
    }
  }

  function addNode(type: string, position: { x: number; y: number }): void {
    pushHistory();
    const id = nanoid(10);
    const newNode: CanvasNode = {
      id,
      type: 'flowforge',
      position,
      data: {
        nodeData: {
          id,
          name: type.split('.').pop()!,
          type,
          typeVersion: 1,
          position: [position.x, position.y],
          parameters: {},
        },
        selected: false,
        hasError: false,
        isExecuting: false,
      },
    };
    nodes.value = [...nodes.value, newNode];
    isDirty.value = true;
  }

  function deleteNode(nodeId: string): void {
    pushHistory();
    nodes.value = nodes.value.filter((n) => n.id !== nodeId);
    edges.value = edges.value.filter((e) => e.source !== nodeId && e.target !== nodeId);
    if (selectedNodeId.value === nodeId) {
      selectedNodeId.value = null;
      isPanelOpen.value = false;
    }
    isDirty.value = true;
  }

  function updateNodeParameters(nodeId: string, params: Record<string, unknown>): void {
    nodes.value = nodes.value.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, nodeData: { ...n.data.nodeData, parameters: { ...n.data.nodeData.parameters, ...params } } } }
        : n,
    );
    isDirty.value = true;
  }

  function selectNode(nodeId: string | null): void {
    selectedNodeId.value = nodeId;
    isPanelOpen.value = !!nodeId;
  }

  function pushHistory(): void {
    history.value = [...history.value.slice(-49), { nodes: [...nodes.value], edges: [...edges.value] }];
    future.value = [];
  }

  function undo(): void {
    const prev = history.value.pop();
    if (!prev) return;
    future.value = [{ nodes: [...nodes.value], edges: [...edges.value] }, ...future.value];
    nodes.value = prev.nodes;
    edges.value = prev.edges;
    isDirty.value = true;
  }

  function redo(): void {
    const next = future.value.shift();
    if (!next) return;
    history.value = [...history.value, { nodes: [...nodes.value], edges: [...edges.value] }];
    nodes.value = next.nodes;
    edges.value = next.edges;
    isDirty.value = true;
  }

  return {
    workflow, nodes, edges, isDirty, isSaving, isExecuting,
    activeExecutionId, selectedNodeId, selectedNode, isPanelOpen,
    isActive, canUndo, canRedo,
    loadWorkflow, save, toggleActive, runTest,
    addNode, deleteNode, updateNodeParameters, selectNode,
    undo, redo, pushHistory,
  };
});
