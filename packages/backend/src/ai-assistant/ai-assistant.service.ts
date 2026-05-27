import { config } from '../config/index.js';
import { globalNodeRegistry } from '@flowforge/core';
import { logger } from '../observability/logger.js';

export interface GenerateNodesRequest {
  description: string;
  existingNodes?: string[];
  context?: string;
}

export interface GeneratedNode {
  type: string;
  name: string;
  parameters: Record<string, unknown>;
  position: [number, number];
  rationale?: string;
}

export interface GenerateNodesResponse {
  nodes: GeneratedNode[];
  connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
  explanation: string;
}

export class AIAssistantService {
  async generateNodes(req: GenerateNodesRequest): Promise<GenerateNodesResponse> {
    const availableTypes = globalNodeRegistry.getAllDescriptions().map((d) => ({
      name: d.name,
      displayName: d.displayName,
      description: d.description,
      group: d.group,
    }));

    const systemPrompt = `You are FlowForge's AI workflow assistant. 
Your job is to generate workflow node configurations based on natural language descriptions.

Available node types (${availableTypes.length} total):
${availableTypes.slice(0, 50).map((t) => `- ${t.name}: ${t.displayName} — ${t.description}`).join('\n')}

Rules:
1. Only use node types from the available list above.
2. Generate valid JSON with "nodes", "connections", and "explanation" fields.
3. Each node must have: type, name, parameters, position [x, y].
4. connections maps source node name to downstream connections.
5. Keep it simple and focused on the user's request.
6. Explain your choices in the "explanation" field.

Respond ONLY with valid JSON matching this schema:
{
  "nodes": [{ "type": "string", "name": "string", "parameters": {}, "position": [0, 0], "rationale": "string" }],
  "connections": {},
  "explanation": "string"
}`;

    const userPrompt = `Create a workflow that: ${req.description}
${req.context ? `\nContext: ${req.context}` : ''}
${req.existingNodes?.length ? `\nExisting nodes: ${req.existingNodes.join(', ')}` : ''}`;

    try {
      if (config.ANTHROPIC_API_KEY) {
        return await this.callAnthropic(systemPrompt, userPrompt);
      }
      if (config.OPENAI_API_KEY) {
        return await this.callOpenAI(systemPrompt, userPrompt);
      }
      throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
    } catch (err) {
      logger.error('AI assistant generation failed', { err });
      throw err;
    }
  }

  private async callAnthropic(system: string, user: string): Promise<GenerateNodesResponse> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: config.AI_ASSISTANT_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const text = message.content.find((c) => c.type === 'text')?.text ?? '{}';
    return this.parseResponse(text);
  }

  private async callOpenAI(system: string, user: string): Promise<GenerateNodesResponse> {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    });

    const text = completion.choices[0]?.message.content ?? '{}';
    return this.parseResponse(text);
  }

  private parseResponse(text: string): GenerateNodesResponse {
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      const parsed = JSON.parse(cleaned) as GenerateNodesResponse;

      if (!Array.isArray(parsed.nodes)) parsed.nodes = [];
      if (!parsed.connections || typeof parsed.connections !== 'object') parsed.connections = {};
      if (!parsed.explanation) parsed.explanation = '';

      return parsed;
    } catch {
      throw new Error('AI returned invalid JSON. Please try again.');
    }
  }

  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    workflowContext?: string,
  ): Promise<string> {
    const systemPrompt = `You are FlowForge's AI assistant. You help users build and understand workflow automations.
${workflowContext ? `\nCurrent workflow context:\n${workflowContext}` : ''}
Be concise, helpful, and technical when appropriate. Focus on automation best practices.`;

    if (config.ANTHROPIC_API_KEY) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: config.AI_ASSISTANT_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      });
      return response.content.find((c) => c.type === 'text')?.text ?? '';
    }

    if (config.OPENAI_API_KEY) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 2048,
      });
      return completion.choices[0]?.message.content ?? '';
    }

    throw new Error('No AI provider configured');
  }
}

export const aiAssistantService = new AIAssistantService();
