import vm from 'vm';
import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data, NodeExecutionData } from '@flowforge/core';

export class CodeNode implements INode {
  description: NodeDescription = {
    displayName: 'Code',
    name: 'flowforge.code',
    group: ['transform'],
    version: 2,
    description: 'Run custom JavaScript/TypeScript code',
    icon: 'fa:code',
    color: '#FF6D5A',
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        options: [
          { name: 'Run Once for All Items', value: 'runOnceForAllItems' },
          { name: 'Run Once for Each Item', value: 'runOnceForEachItem' },
        ],
        default: 'runOnceForAllItems',
      },
      {
        displayName: 'Language',
        name: 'language',
        type: 'options',
        options: [
          { name: 'JavaScript', value: 'javaScript' },
        ],
        default: 'javaScript',
        noDataExpression: true,
      },
      {
        displayName: 'JavaScript Code',
        name: 'jsCode',
        type: 'code',
        typeOptions: { language: 'javascript', rows: 20 },
        default: `// Loop over input items and add a new field called 'myNewField' to the JSON of each one
for (const item of $input.all()) {
  item.json.myNewField = 1;
}

return $input.all();`,
        description: 'JavaScript code to execute',
        displayOptions: { show: { language: ['javaScript'] } },
        noDataExpression: true,
      },
    ],
    defaults: { name: 'Code', color: '#FF6D5A' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const mode = context.getNodeParameter<string>('mode', 0, 'runOnceForAllItems');
    const code = context.getNodeParameter<string>('jsCode', 0);
    const inputItems = context.getInputData();

    if (mode === 'runOnceForEachItem') {
      const results: NodeExecutionData[] = [];
      for (let i = 0; i < inputItems.length; i++) {
        const item = inputItems[i]!;
        const result = await this.runCode(code, [item], context, i);
        results.push(...result);
      }
      return [results];
    }

    const results = await this.runCode(code, inputItems, context, 0);
    return [results];
  }

  private async runCode(
    code: string,
    items: NodeExecutionData[],
    context: NodeExecutionContext,
    _itemIndex: number,
  ): Promise<NodeExecutionData[]> {
    // Build the $input helper
    const $input = {
      all: () => items.map((item) => ({ json: { ...item.json }, binary: item.binary })),
      first: () => items[0] ? { json: { ...items[0].json }, binary: items[0].binary } : undefined,
      last: () => items[items.length - 1] ? { json: { ...items[items.length - 1]!.json } } : undefined,
      item: items[0] ? { json: { ...items[0].json } } : { json: {} },
    };

    const sandbox: Record<string, unknown> = {
      $input,
      $json: items[0]?.json ?? {},
      $items: items,
      console: {
        log: (...args: unknown[]) => context.sendMessageToUI(args.join(' ')),
        error: (...args: unknown[]) => context.sendMessageToUI(`ERROR: ${args.join(' ')}`),
        warn: (...args: unknown[]) => context.sendMessageToUI(`WARN: ${args.join(' ')}`),
      },
      require: (module: string) => {
        // Whitelist safe modules
        const allowed = ['crypto', 'path', 'url', 'querystring', 'buffer'];
        if (!allowed.includes(module)) {
          throw new Error(`Module '${module}' is not allowed in code nodes`);
        }
        return require(module);
      },
      // Lodash-style helpers
      $now: new Date(),
      $today: new Date(new Date().setHours(0, 0, 0, 0)),
      $jmespath: undefined,
    };

    const wrappedCode = `(async () => { ${code} })()`;
    const script = new vm.Script(wrappedCode);
    const vmContext = vm.createContext(sandbox);

    const result = await script.runInContext(vmContext, { timeout: 30000 });

    // Normalize output
    if (!result) return [{ json: {} }];

    if (Array.isArray(result)) {
      return result.map((item: unknown) => {
        if (item && typeof item === 'object' && 'json' in item) {
          return item as NodeExecutionData;
        }
        return { json: typeof item === 'object' ? (item as Record<string, unknown>) : { data: item } };
      });
    }

    if (typeof result === 'object') {
      return [{ json: result as Record<string, unknown> }];
    }

    return [{ json: { result } }];
  }
}
