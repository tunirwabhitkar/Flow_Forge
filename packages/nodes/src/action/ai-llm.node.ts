import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';

export class AILLMNode implements INode {
  description: NodeDescription = {
    displayName: 'AI Language Model',
    name: 'flowforge.aiLLM',
    group: ['ai'],
    version: 1,
    description: 'Send prompts to AI language models (OpenAI, Anthropic, Ollama, etc.)',
    icon: 'fa:brain',
    color: '#8B5CF6',
    inputs: [
      { type: 'main' },
      { type: 'ai_memory', displayName: 'Memory', required: false },
      { type: 'ai_tool', displayName: 'Tools', required: false },
    ],
    outputs: [{ type: 'main' }],
    credentials: [
      { name: 'openAiApi', required: false },
      { name: 'anthropicApi', required: false },
    ],
    properties: [
      {
        displayName: 'Provider',
        name: 'provider',
        type: 'options',
        options: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic Claude', value: 'anthropic' },
          { name: 'Ollama (Local)', value: 'ollama' },
          { name: 'Azure OpenAI', value: 'azure' },
          { name: 'Google Vertex AI', value: 'vertex' },
          { name: 'Groq', value: 'groq' },
          { name: 'Mistral', value: 'mistral' },
        ],
        default: 'openai',
        noDataExpression: true,
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        options: [
          // OpenAI
          { name: 'GPT-4o', value: 'gpt-4o' },
          { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
          { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
          // Anthropic
          { name: 'Claude 3.5 Sonnet', value: 'claude-sonnet-4-20250514' },
          { name: 'Claude 3.5 Haiku', value: 'claude-haiku-4-5-20251001' },
          { name: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
          // Groq
          { name: 'Llama 3 70B (Groq)', value: 'llama3-70b-8192' },
          { name: 'Mixtral 8x7B (Groq)', value: 'mixtral-8x7b-32768' },
        ],
        default: 'gpt-4o',
        description: 'The model to use',
      },
      {
        displayName: 'System Prompt',
        name: 'systemPrompt',
        type: 'string',
        typeOptions: { rows: 5 },
        default: 'You are a helpful assistant.',
        description: 'Instructions for the AI model (system message)',
      },
      {
        displayName: 'User Prompt / Input',
        name: 'prompt',
        type: 'string',
        typeOptions: { rows: 8 },
        default: '',
        required: true,
        description: 'The user message to send to the model',
      },
      {
        displayName: 'Temperature',
        name: 'temperature',
        type: 'number',
        default: 0.7,
        typeOptions: { minValue: 0, maxValue: 2, numberStepSize: 0.1 },
        description: 'Sampling temperature (0 = deterministic, 2 = very random)',
      },
      {
        displayName: 'Max Tokens',
        name: 'maxTokens',
        type: 'number',
        default: 1024,
        description: 'Maximum tokens to generate',
      },
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        options: [
          { name: 'Text', value: 'text' },
          { name: 'JSON', value: 'json' },
        ],
        default: 'text',
        description: 'Expected output format from the model',
      },
      {
        displayName: 'Ollama Base URL',
        name: 'ollamaBaseUrl',
        type: 'string',
        default: 'http://localhost:11434',
        displayOptions: { show: { provider: ['ollama'] } },
      },
      {
        displayName: 'Ollama Model',
        name: 'ollamaModel',
        type: 'string',
        default: 'llama3',
        placeholder: 'llama3, mistral, codellama...',
        displayOptions: { show: { provider: ['ollama'] } },
      },
    ],
    defaults: { name: 'AI Language Model', color: '#8B5CF6' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const items = context.getInputData();
    const provider = context.getNodeParameter<string>('provider', 0);
    const results = [];

    for (let i = 0; i < items.length; i++) {
      const prompt = context.getNodeParameter<string>('prompt', i);
      const systemPrompt = context.getNodeParameter<string>('systemPrompt', i, 'You are a helpful assistant.');
      const model = context.getNodeParameter<string>('model', i);
      const temperature = context.getNodeParameter<number>('temperature', i, 0.7);
      const maxTokens = context.getNodeParameter<number>('maxTokens', i, 1024);
      const outputFormat = context.getNodeParameter<string>('outputFormat', i, 'text');

      let responseText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      if (provider === 'anthropic') {
        const creds = await context.getCredentials<{ apiKey: string }>('anthropicApi');
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: creds.apiKey });
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          temperature,
        });
        responseText = response.content.find((c) => c.type === 'text')?.text ?? '';
        inputTokens = response.usage.input_tokens;
        outputTokens = response.usage.output_tokens;
      } else if (provider === 'openai') {
        const creds = await context.getCredentials<{ apiKey: string }>('openAiApi');
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: creds.apiKey });
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
        });
        responseText = response.choices[0]?.message.content ?? '';
        inputTokens = response.usage?.prompt_tokens ?? 0;
        outputTokens = response.usage?.completion_tokens ?? 0;
      } else if (provider === 'ollama') {
        const baseUrl = context.getNodeParameter<string>('ollamaBaseUrl', i, 'http://localhost:11434');
        const ollamaModel = context.getNodeParameter<string>('ollamaModel', i, 'llama3');
        const { default: fetch } = await import('node-fetch');
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            stream: false,
            options: { temperature },
          }),
        });
        const data = await response.json() as any;
        responseText = data.message?.content ?? '';
      }

      // Parse JSON if requested
      let parsedOutput: unknown = responseText;
      if (outputFormat === 'json') {
        try {
          const cleaned = responseText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
          parsedOutput = JSON.parse(cleaned);
        } catch {
          parsedOutput = { text: responseText };
        }
      }

      results.push({
        json: {
          response: parsedOutput,
          text: responseText,
          model,
          provider,
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        },
        pairedItem: { item: i },
      });
    }

    return [results];
  }
}
