import type { INode, NodeDescription } from '../types/index.js';

export class NodeRegistry {
  private readonly nodes = new Map<string, INode>();
  private readonly descriptions = new Map<string, NodeDescription>();

  register(node: INode): void {
    const { name } = node.description;
    if (this.nodes.has(name)) {
      throw new Error(`Node type '${name}' is already registered`);
    }
    this.nodes.set(name, node);
    this.descriptions.set(name, node.description);
  }

  registerMany(nodes: INode[]): void {
    for (const node of nodes) this.register(node);
  }

  get(type: string): INode | undefined {
    return this.nodes.get(type);
  }

  getOrThrow(type: string): INode {
    const node = this.get(type);
    if (!node) throw new Error(`Unknown node type: '${type}'`);
    return node;
  }

  getDescription(type: string): NodeDescription | undefined {
    return this.descriptions.get(type);
  }

  getAllDescriptions(): NodeDescription[] {
    return [...this.descriptions.values()];
  }

  listTypes(): string[] {
    return [...this.nodes.keys()];
  }

  has(type: string): boolean {
    return this.nodes.has(type);
  }

  toExecutionMap(): Map<string, INode> {
    return new Map(this.nodes);
  }

  size(): number {
    return this.nodes.size;
  }
}

// Global singleton registry
export const globalNodeRegistry = new NodeRegistry();
