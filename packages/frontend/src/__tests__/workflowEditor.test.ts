import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkflowEditorStore } from '../../stores/workflowEditor.js';

// Mock the API module
vi.mock('../../api/index.js', () => ({
  workflowsApi: {
    get: vi.fn().mockResolvedValue({
      data: {
        id: 'wf-1',
        name: 'Test Workflow',
        active: false,
        nodes: [
          {
            id: 'node-1',
            name: 'WebhookTrigger',
            type: 'flowforge.webhook',
            typeVersion: 1,
            position: [100, 200],
            parameters: { httpMethod: 'POST', path: '/test' },
          },
          {
            id: 'node-2',
            name: 'HttpRequest',
            type: 'flowforge.httpRequest',
            typeVersion: 3,
            position: [400, 200],
            parameters: { method: 'GET', url: 'https://api.example.com' },
          },
        ],
        connections: {
          WebhookTrigger: {
            main: [[{ node: 'HttpRequest', type: 'main', index: 0 }]],
          },
        },
        settings: {},
      },
    }),
    update: vi.fn().mockResolvedValue({
      data: { id: 'wf-1', name: 'Test Workflow', active: false, nodes: [], connections: {} },
    }),
    activate: vi.fn().mockResolvedValue({
      data: { id: 'wf-1', name: 'Test Workflow', active: true, nodes: [], connections: {} },
    }),
    deactivate: vi.fn().mockResolvedValue({
      data: { id: 'wf-1', name: 'Test Workflow', active: false, nodes: [], connections: {} },
    }),
    run: vi.fn().mockResolvedValue({ data: { id: 'exec-1', status: 'running' } }),
  },
  executionsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkflowEditorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loads a workflow and populates nodes and edges', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    expect(store.workflow).toBeDefined();
    expect(store.workflow!.id).toBe('wf-1');
    expect(store.nodes).toHaveLength(2);
    expect(store.edges).toHaveLength(1);
    expect(store.isDirty).toBe(false);
  });

  it('adds a node to the canvas', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    const initialCount = store.nodes.length;
    store.addNode('flowforge.code', { x: 600, y: 300 });

    expect(store.nodes.length).toBe(initialCount + 1);
    expect(store.isDirty).toBe(true);
  });

  it('deletes a node and its connected edges', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    const nodeToDelete = store.nodes[0]!.id;
    const edgesBefore = store.edges.length;

    store.deleteNode(nodeToDelete);

    expect(store.nodes.find((n) => n.id === nodeToDelete)).toBeUndefined();
    // Edges connected to the deleted node should also be removed
    expect(
      store.edges.every((e) => e.source !== nodeToDelete && e.target !== nodeToDelete),
    ).toBe(true);
  });

  it('selects and deselects nodes', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    const nodeId = store.nodes[0]!.id;
    store.selectNode(nodeId);

    expect(store.selectedNodeId).toBe(nodeId);
    expect(store.isPanelOpen).toBe(true);
    expect(store.selectedNode?.id).toBe(nodeId);

    store.selectNode(null);
    expect(store.selectedNodeId).toBeNull();
    expect(store.isPanelOpen).toBe(false);
  });

  it('updates node parameters and marks dirty', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    const nodeId = store.nodes[0]!.id;
    store.updateNodeParameters(nodeId, { httpMethod: 'GET', path: '/updated' });

    const updatedNode = store.nodes.find((n) => n.id === nodeId);
    expect(updatedNode?.data.nodeData.parameters['httpMethod']).toBe('GET');
    expect(store.isDirty).toBe(true);
  });

  it('supports undo and redo', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    const countBefore = store.nodes.length;

    // Add a node (this pushes history)
    store.addNode('flowforge.set', { x: 800, y: 400 });
    expect(store.nodes.length).toBe(countBefore + 1);
    expect(store.canUndo).toBe(true);

    // Undo — should remove the added node
    store.undo();
    expect(store.nodes.length).toBe(countBefore);
    expect(store.canRedo).toBe(true);

    // Redo — re-adds the node
    store.redo();
    expect(store.nodes.length).toBe(countBefore + 1);
  });

  it('clears redo stack when a new change is made after undo', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    store.addNode('flowforge.if', { x: 500, y: 300 });
    store.undo();

    expect(store.canRedo).toBe(true);

    // Make a new change — redo stack should clear
    store.addNode('flowforge.code', { x: 700, y: 300 });
    expect(store.canRedo).toBe(false);
  });

  it('computes isActive from workflow data', async () => {
    const store = useWorkflowEditorStore();
    await store.loadWorkflow('wf-1');

    expect(store.isActive).toBe(false);
  });
});
