import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';
import { set, get, unset, cloneDeep } from 'lodash';

export class SetNode implements INode {
  description: NodeDescription = {
    displayName: 'Edit Fields (Set)',
    name: 'flowforge.set',
    group: ['transform'],
    version: 3,
    description: 'Set, add, or remove fields on items',
    icon: 'fa:pen',
    color: '#0AA55C',
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        options: [
          { name: 'Manual Mapping', value: 'manual' },
          { name: 'JSON Output', value: 'raw' },
        ],
        default: 'manual',
        noDataExpression: true,
      },
      {
        displayName: 'Fields to Set',
        name: 'fields',
        type: 'collection',
        default: {},
        description: 'Fields to add or update',
        displayOptions: { show: { mode: ['manual'] } },
      },
      {
        displayName: 'JSON',
        name: 'jsonOutput',
        type: 'json',
        default: '{}',
        description: 'Raw JSON to set as the item output',
        displayOptions: { show: { mode: ['raw'] } },
      },
      {
        displayName: 'Keep Only Set',
        name: 'keepOnlySet',
        type: 'boolean',
        default: false,
        description: 'Whether to remove all fields not explicitly set',
      },
      {
        displayName: 'Include Binary Data',
        name: 'includeBinary',
        type: 'boolean',
        default: true,
      },
    ],
    defaults: { name: 'Edit Fields', color: '#0AA55C' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const items = context.getInputData();
    const mode = context.getNodeParameter<string>('mode', 0, 'manual');
    const keepOnlySet = context.getNodeParameter<boolean>('keepOnlySet', 0, false);
    const results = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      let newJson: Record<string, unknown> = keepOnlySet ? {} : cloneDeep(item.json);

      if (mode === 'raw') {
        const rawJson = context.getNodeParameter<string>('jsonOutput', i, '{}');
        const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
        newJson = parsed as Record<string, unknown>;
      } else {
        const fields = context.getNodeParameter<Record<string, unknown>>('fields', i, {});
        for (const [key, value] of Object.entries(fields)) {
          set(newJson, key, value);
        }
      }

      results.push({
        json: newJson,
        binary: item.binary,
        pairedItem: { item: i },
      });
    }

    return [results];
  }
}
