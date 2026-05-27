import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';

export class SlackNode implements INode {
  description: NodeDescription = {
    displayName: 'Slack',
    name: 'flowforge.slack',
    group: ['communication'],
    version: 2,
    description: 'Consume the Slack API',
    icon: 'file:slack.svg',
    color: '#4A154B',
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    credentials: [{ name: 'slackApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Channel', value: 'channel' },
          { name: 'File', value: 'file' },
          { name: 'Message', value: 'message' },
          { name: 'Reaction', value: 'reaction' },
          { name: 'Star', value: 'star' },
          { name: 'User', value: 'user' },
          { name: 'User Group', value: 'userGroup' },
        ],
        default: 'message',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Send', value: 'send' },
          { name: 'Update', value: 'update' },
          { name: 'Delete', value: 'delete' },
          { name: 'Get Permalink', value: 'getPermalink' },
        ],
        default: 'send',
        displayOptions: { show: { resource: ['message'] } },
      },
      {
        displayName: 'Channel',
        name: 'channel',
        type: 'string',
        default: '',
        required: true,
        description: 'Channel, private group, or DM channel to send to (e.g. #general or C123456)',
        displayOptions: { show: { operation: ['send'] } },
      },
      {
        displayName: 'Message Text',
        name: 'text',
        type: 'string',
        typeOptions: { rows: 5 },
        default: '',
        description: 'The message text (supports Slack mrkdwn format)',
        displayOptions: { show: { resource: ['message'], operation: ['send'] } },
      },
      {
        displayName: 'As User',
        name: 'asUser',
        type: 'boolean',
        default: false,
        description: 'Post as the authenticated user, not the bot',
        displayOptions: { show: { resource: ['message'], operation: ['send'] } },
      },
      {
        displayName: 'Username',
        name: 'username',
        type: 'string',
        default: 'FlowForge',
        description: 'Custom bot username',
        displayOptions: { show: { resource: ['message'], operation: ['send'], asUser: [false] } },
      },
      {
        displayName: 'Blocks (JSON)',
        name: 'blocksJson',
        type: 'json',
        default: '',
        description: 'Slack Block Kit JSON for rich messages',
        displayOptions: { show: { resource: ['message'], operation: ['send'] } },
      },
    ],
    defaults: { name: 'Slack', color: '#4A154B' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const { WebClient } = await import('@slack/web-api');
    const creds = await context.getCredentials<{ accessToken: string }>('slackApi');
    const client = new WebClient(creds.accessToken);

    const items = context.getInputData();
    const resource = context.getNodeParameter<string>('resource', 0);
    const operation = context.getNodeParameter<string>('operation', 0);
    const results = [];

    for (let i = 0; i < items.length; i++) {
      if (resource === 'message' && operation === 'send') {
        const channel = context.getNodeParameter<string>('channel', i);
        const text = context.getNodeParameter<string>('text', i, '');
        const asUser = context.getNodeParameter<boolean>('asUser', i, false);
        const username = context.getNodeParameter<string>('username', i, 'FlowForge');
        const blocksRaw = context.getNodeParameter<string>('blocksJson', i, '');
        let blocks;
        if (blocksRaw) {
          try {
            blocks = JSON.parse(blocksRaw) as unknown[];
          } catch { /* ignore */ }
        }

        const response = await client.chat.postMessage({
          channel,
          text,
          ...(asUser ? { as_user: true } : { username }),
          ...(blocks ? { blocks } : {}),
        });

        results.push({
          json: {
            ok: response.ok,
            ts: response.ts,
            channel: response.channel,
            messageId: response.ts,
          },
          pairedItem: { item: i },
        });
      }
    }

    return [results];
  }
}
