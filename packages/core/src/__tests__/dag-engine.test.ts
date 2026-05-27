import {
  buildAdjacencyList,
  topologicalSort,
  findTriggerNodes,
  WorkflowExecutionEngine,
} from '../dag/engine.js';
import { WorkflowCycleError } from '../errors/index.js';
import type { WorkflowDefinition, INode, NodeExecutionContext, NodeOutput_data } from '../types/index.js';
import { NodeRegistry } from '../nodes/registry.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeWorkflow(
  nodes: Array<{ id: string; name: string; type?: string }>,
  connections: Array<[string, string]>,  // [sourceNodeName, targetNodeName]
): WorkflowDefinition {
  const wfConnections: WorkflowDefinition['connections'] = {};

  for (const [src, tgt] of connections) {
    wfConnections[src] = {
      main: [[{ node: tgt, type: 'main', index: 0 }]],
    };
  }

  return {
    id: 'test-wf',
    name: 'Test Workflow',
    active: false,
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type ?? 'test.node',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    })),
    connections: wfConnections,
  };
}

// ─── Tests: buildAdjacencyList ────────────────────────────────────────────────

describe('buildAdjacencyList', () => {
  it('builds correct successor and predecessor maps', () => {
    const wf = makeWorkflow(
      [
        { id: 'a', name: 'NodeA' },
        { id: 'b', name: 'NodeB' },
        { id: 'c', name: 'NodeC' },
      ],
      [['NodeA', 'NodeB'], ['NodeB', 'NodeC']],
    );

    const adj = buildAdjacencyList(wf);

    expect(adj.successors.get('a')).toContain('b');
    expect(adj.successors.get('b')).toContain('c');
    expect(adj.predecessors.get('b')).toContain('a');
    expect(adj.predecessors.get('c')).toContain('b');
    expect(adj.predecessors.get('a')).toHaveLength(0);
  });

  it('handles disconnected nodes', () => {
    const wf = makeWorkflow(
      [
        { id: 'a', name: 'NodeA' },
        { id: 'b', name: 'NodeB' },
        { id: 'c', name: 'Isolated' },
      ],
      [['NodeA', 'NodeB']],
    );
    const adj = buildAdjacencyList(wf);
    expect(adj.successors.get('c')).toHaveLength(0);
    expect(adj.predecessors.get('c')).toHaveLength(0);
  });

  it('handles a fan-out (one node → many)', () => {
    const wf = makeWorkflow(
      [
        { id: 'a', name: 'Start' },
        { id: 'b', name: 'Branch1' },
        { id: 'c', name: 'Branch2' },
      ],
      [['Start', 'Branch1'], ['Start', 'Branch2']],
    );
    const adj = buildAdjacencyList(wf);
    expect(adj.successors.get('a')).toHaveLength(2);
  });
});

// ─── Tests: topologicalSort ───────────────────────────────────────────────────

describe('topologicalSort', () => {
  it('returns nodes in topological order for a linear chain', () => {
    const wf = makeWorkflow(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      [['A', 'B'], ['B', 'C']],
    );
    const adj = buildAdjacencyList(wf);
    const sorted = topologicalSort(wf, adj);

    const indexA = sorted.indexOf('a');
    const indexB = sorted.indexOf('b');
    const indexC = sorted.indexOf('c');

    expect(indexA).toBeLessThan(indexB);
    expect(indexB).toBeLessThan(indexC);
  });

  it('handles a DAG with parallel branches', () => {
    const wf = makeWorkflow(
      [
        { id: 'trigger', name: 'Trigger' },
        { id: 'left', name: 'Left' },
        { id: 'right', name: 'Right' },
        { id: 'merge', name: 'Merge' },
      ],
      [['Trigger', 'Left'], ['Trigger', 'Right'], ['Left', 'Merge'], ['Right', 'Merge']],
    );
    const adj = buildAdjacencyList(wf);
    const sorted = topologicalSort(wf, adj);

    expect(sorted.indexOf('trigger')).toBeLessThan(sorted.indexOf('left'));
    expect(sorted.indexOf('trigger')).toBeLessThan(sorted.indexOf('right'));
    expect(sorted.indexOf('left')).toBeLessThan(sorted.indexOf('merge'));
    expect(sorted.indexOf('right')).toBeLessThan(sorted.indexOf('merge'));
  });

  it('throws WorkflowCycleError for cyclic workflows', () => {
    const wf = makeWorkflow(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      [['A', 'B'], ['B', 'C'], ['C', 'A']],
    );
    const adj = buildAdjacencyList(wf);
    expect(() => topologicalSort(wf, adj)).toThrow(WorkflowCycleError);
  });

  it('handles a single node with no connections', () => {
    const wf = makeWorkflow([{ id: 'solo', name: 'Solo' }], []);
    const adj = buildAdjacencyList(wf);
    const sorted = topologicalSort(wf, adj);
    expect(sorted).toEqual(['solo']);
  });
});

// ─── Tests: findTriggerNodes ──────────────────────────────────────────────────

describe('findTriggerNodes', () => {
  it('identifies nodes with no predecessors as triggers', () => {
    const wf = makeWorkflow(
      [
        { id: 'trigger', name: 'WebhookTrigger' },
        { id: 'action', name: 'HTTPRequest' },
      ],
      [['WebhookTrigger', 'HTTPRequest']],
    );
    const adj = buildAdjacencyList(wf);
    const triggers = findTriggerNodes(wf, adj);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.id).toBe('trigger');
  });

  it('returns multiple roots for disconnected sub-graphs', () => {
    const wf = makeWorkflow(
      [
        { id: 't1', name: 'Trigger1' },
        { id: 'a1', name: 'Action1' },
        { id: 't2', name: 'Trigger2' },
        { id: 'a2', name: 'Action2' },
      ],
      [['Trigger1', 'Action1'], ['Trigger2', 'Action2']],
    );
    const adj = buildAdjacencyList(wf);
    const triggers = findTriggerNodes(wf, adj);
    expect(triggers).toHaveLength(2);
  });
});

// ─── Tests: WorkflowExecutionEngine ──────────────────────────────────────────

describe('WorkflowExecutionEngine', () => {
  function makeRegistry(
    nodes: Array<{ type: string; fn: (ctx: NodeExecutionContext) => Promise<NodeOutput_data> }>,
  ): NodeRegistry {
    const reg = new NodeRegistry();
    for (const { type, fn } of nodes) {
      reg.register({
        description: {
          displayName: type,
          name: type,
          group: ['action'],
          version: 1,
          description: '',
          inputs: [{ type: 'main' }],
          outputs: [{ type: 'main' }],
          properties: [],
          defaults: { name: type },
        },
        execute: fn,
      } as INode);
    }
    return reg;
  }

  it('executes a linear workflow in order', async () => {
    const executionOrder: string[] = [];

    const registry = makeRegistry([
      {
        type: 'step.a',
        fn: async () => { executionOrder.push('A'); return [[{ json: { step: 'A' } }]]; },
      },
      {
        type: 'step.b',
        fn: async () => { executionOrder.push('B'); return [[{ json: { step: 'B' } }]]; },
      },
      {
        type: 'step.c',
        fn: async () => { executionOrder.push('C'); return [[{ json: { step: 'C' } }]]; },
      },
    ]);

    const wf = makeWorkflow(
      [
        { id: 'a', name: 'StepA', type: 'step.a' },
        { id: 'b', name: 'StepB', type: 'step.b' },
        { id: 'c', name: 'StepC', type: 'step.c' },
      ],
      [['StepA', 'StepB'], ['StepB', 'StepC']],
    );

    const engine = new WorkflowExecutionEngine({ nodeRegistry: registry.toExecutionMap() });
    const result = await engine.run(wf, 'test-exec-id');

    expect(result.status).toBe('success');
    expect(executionOrder).toEqual(['A', 'B', 'C']);
    expect(result.runData['StepA']).toBeDefined();
    expect(result.runData['StepB']).toBeDefined();
    expect(result.runData['StepC']).toBeDefined();
  });

  it('stops execution on node error when continueOnFail is false', async () => {
    const executed: string[] = [];

    const registry = makeRegistry([
      {
        type: 'ok.node',
        fn: async () => { executed.push('ok'); return [[{ json: {} }]]; },
      },
      {
        type: 'fail.node',
        fn: async () => { throw new Error('Intentional failure'); },
      },
      {
        type: 'never.node',
        fn: async () => { executed.push('shouldNotRun'); return [[{ json: {} }]]; },
      },
    ]);

    const wf = makeWorkflow(
      [
        { id: 'a', name: 'OkNode', type: 'ok.node' },
        { id: 'b', name: 'FailNode', type: 'fail.node' },
        { id: 'c', name: 'NeverNode', type: 'never.node' },
      ],
      [['OkNode', 'FailNode'], ['FailNode', 'NeverNode']],
    );

    const engine = new WorkflowExecutionEngine({ nodeRegistry: registry.toExecutionMap() });
    const result = await engine.run(wf, 'test-exec-id');

    expect(result.status).toBe('error');
    expect(executed).toContain('ok');
    expect(executed).not.toContain('shouldNotRun');
    expect(result.error?.message).toContain('Intentional failure');
  });

  it('continues after error when continueOnFail is true', async () => {
    const executed: string[] = [];

    const registry = makeRegistry([
      {
        type: 'fail.node',
        fn: async () => { throw new Error('Expected failure'); },
      },
      {
        type: 'continue.node',
        fn: async () => { executed.push('continued'); return [[{ json: { ok: true } }]]; },
      },
    ]);

    const wf = makeWorkflow(
      [
        { id: 'a', name: 'FailNode', type: 'fail.node' },
        { id: 'b', name: 'ContinueNode', type: 'continue.node' },
      ],
      [['FailNode', 'ContinueNode']],
    );

    // Enable continueOnFail on the fail node
    wf.nodes[0]!.continueOnFail = true;

    const engine = new WorkflowExecutionEngine({ nodeRegistry: registry.toExecutionMap() });
    const result = await engine.run(wf, 'test-exec-id');

    expect(result.status).toBe('success');
    expect(executed).toContain('continued');
  });

  it('skips disabled nodes', async () => {
    const executed: string[] = [];

    const registry = makeRegistry([
      {
        type: 'step.node',
        fn: async (ctx) => {
          executed.push(ctx.node.name);
          return [[{ json: {} }]];
        },
      },
    ]);

    const wf = makeWorkflow(
      [
        { id: 'a', name: 'ActiveNode', type: 'step.node' },
        { id: 'b', name: 'DisabledNode', type: 'step.node' },
        { id: 'c', name: 'FinalNode', type: 'step.node' },
      ],
      [['ActiveNode', 'DisabledNode'], ['DisabledNode', 'FinalNode']],
    );

    wf.nodes[1]!.disabled = true;

    const engine = new WorkflowExecutionEngine({ nodeRegistry: registry.toExecutionMap() });
    await engine.run(wf, 'test-exec-id');

    expect(executed).toContain('ActiveNode');
    expect(executed).not.toContain('DisabledNode');
  });

  it('respects execution timeout', async () => {
    const registry = makeRegistry([
      {
        type: 'slow.node',
        fn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return [[{ json: {} }]];
        },
      },
    ]);

    const wf = makeWorkflow([{ id: 'a', name: 'SlowNode', type: 'slow.node' }], []);

    const engine = new WorkflowExecutionEngine({
      nodeRegistry: registry.toExecutionMap(),
      timeoutMs: 50, // 50ms — much less than the 500ms sleep
    });

    const result = await engine.run(wf, 'test-exec-id');
    // Timeout marks as error
    expect(result.status).toBe('error');
  }, 3000);

  it('passes output data from predecessor to successor', async () => {
    let receivedInput: unknown;

    const registry = makeRegistry([
      {
        type: 'producer.node',
        fn: async () => [[{ json: { value: 42, label: 'hello' } }]],
      },
      {
        type: 'consumer.node',
        fn: async (ctx) => {
          receivedInput = ctx.getInputData();
          return [[{ json: {} }]];
        },
      },
    ]);

    const wf = makeWorkflow(
      [
        { id: 'p', name: 'Producer', type: 'producer.node' },
        { id: 'c', name: 'Consumer', type: 'consumer.node' },
      ],
      [['Producer', 'Consumer']],
    );

    const engine = new WorkflowExecutionEngine({ nodeRegistry: registry.toExecutionMap() });
    await engine.run(wf, 'test-exec-id');

    expect(receivedInput).toEqual([{ json: { value: 42, label: 'hello' } }]);
  });
});

// ─── Tests: NodeRegistry ──────────────────────────────────────────────────────

describe('NodeRegistry', () => {
  it('registers and retrieves nodes', () => {
    const reg = new NodeRegistry();
    const mockNode: INode = {
      description: {
        displayName: 'Test',
        name: 'test.node',
        group: ['action'],
        version: 1,
        description: 'A test node',
        inputs: [],
        outputs: [],
        properties: [],
        defaults: { name: 'Test' },
      },
    };
    reg.register(mockNode);
    expect(reg.get('test.node')).toBe(mockNode);
    expect(reg.has('test.node')).toBe(true);
    expect(reg.size()).toBe(1);
  });

  it('throws on duplicate registration', () => {
    const reg = new NodeRegistry();
    const mockNode: INode = {
      description: {
        displayName: 'Dup',
        name: 'dup.node',
        group: ['action'],
        version: 1,
        description: '',
        inputs: [],
        outputs: [],
        properties: [],
        defaults: { name: 'Dup' },
      },
    };
    reg.register(mockNode);
    expect(() => reg.register(mockNode)).toThrow(/already registered/);
  });

  it('getOrThrow throws for unknown types', () => {
    const reg = new NodeRegistry();
    expect(() => reg.getOrThrow('nonexistent')).toThrow(/Unknown node type/);
  });
});
