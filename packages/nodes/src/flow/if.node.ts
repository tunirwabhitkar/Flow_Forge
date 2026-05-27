import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data, NodeExecutionData } from '@flowforge/core';
import { get } from 'lodash';

type ComparisonOperation =
  | 'equal' | 'notEqual' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'regex' | 'isEmpty' | 'isNotEmpty' | 'isTrue' | 'isFalse'
  | 'exists' | 'notExists';

interface FilterCondition {
  leftValue: string;
  operation: ComparisonOperation;
  rightValue?: unknown;
  caseSensitive?: boolean;
}

interface FilterGroup {
  conditions: FilterCondition[];
  combineOperation: 'AND' | 'OR';
}

function evaluateCondition(itemJson: Record<string, unknown>, cond: FilterCondition): boolean {
  const left = get(itemJson, cond.leftValue);
  const right = cond.rightValue;

  switch (cond.operation) {
    case 'equal': return left === right;
    case 'notEqual': return left !== right;
    case 'gt': return Number(left) > Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'lte': return Number(left) <= Number(right);
    case 'contains':
      return typeof left === 'string' && typeof right === 'string'
        ? (cond.caseSensitive ? left.includes(right) : left.toLowerCase().includes(right.toLowerCase()))
        : false;
    case 'notContains':
      return typeof left === 'string' && typeof right === 'string'
        ? !(cond.caseSensitive ? left.includes(right) : left.toLowerCase().includes(right.toLowerCase()))
        : true;
    case 'startsWith':
      return typeof left === 'string' && typeof right === 'string' && left.startsWith(right);
    case 'endsWith':
      return typeof left === 'string' && typeof right === 'string' && left.endsWith(right);
    case 'regex':
      return typeof left === 'string' && typeof right === 'string'
        ? new RegExp(right, cond.caseSensitive ? '' : 'i').test(left)
        : false;
    case 'isEmpty':
      return left === null || left === undefined || left === '' || (Array.isArray(left) && left.length === 0);
    case 'isNotEmpty':
      return !(left === null || left === undefined || left === '' || (Array.isArray(left) && left.length === 0));
    case 'isTrue': return left === true || left === 'true' || left === 1;
    case 'isFalse': return left === false || left === 'false' || left === 0;
    case 'exists': return left !== undefined && left !== null;
    case 'notExists': return left === undefined || left === null;
    default: return false;
  }
}

export class IfNode implements INode {
  description: NodeDescription = {
    displayName: 'IF',
    name: 'flowforge.if',
    group: ['flow'],
    version: 2,
    description: 'Splits the flow based on filter conditions',
    icon: 'fa:code-branch',
    color: '#408000',
    inputs: [{ type: 'main' }],
    outputs: [
      { type: 'main', displayName: 'True' },
      { type: 'main', displayName: 'False' },
    ],
    properties: [
      {
        displayName: 'Conditions',
        name: 'conditions',
        type: 'collection',
        default: {},
        description: 'The conditions to check',
      },
      {
        displayName: 'Combine Conditions',
        name: 'combineOperation',
        type: 'options',
        options: [
          { name: 'AND — all must be true', value: 'AND' },
          { name: 'OR — any must be true', value: 'OR' },
        ],
        default: 'AND',
      },
    ],
    defaults: { name: 'IF', color: '#408000' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const items = context.getInputData();
    const conditions = context.getNodeParameter<FilterCondition[]>('conditions', 0, []);
    const combineOp = context.getNodeParameter<'AND' | 'OR'>('combineOperation', 0, 'AND');

    const trueBranch: NodeExecutionData[] = [];
    const falseBranch: NodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      let passes: boolean;

      if (!conditions || conditions.length === 0) {
        passes = true;
      } else if (combineOp === 'AND') {
        passes = conditions.every((c) => evaluateCondition(item.json, c));
      } else {
        passes = conditions.some((c) => evaluateCondition(item.json, c));
      }

      const outputItem = { ...item, pairedItem: { item: i } };
      if (passes) trueBranch.push(outputItem);
      else falseBranch.push(outputItem);
    }

    return [trueBranch, falseBranch];
  }
}
