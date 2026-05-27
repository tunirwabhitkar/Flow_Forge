import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data, WebhookResponse } from '@flowforge/core';

export class WebhookTriggerNode implements INode {
  description: NodeDescription = {
    displayName: 'Webhook',
    name: 'flowforge.webhook',
    group: ['trigger'],
    version: 1,
    description: 'Starts a workflow when an HTTP webhook is called',
    icon: 'fa:globe',
    color: '#6E56CF',
    inputs: [],
    outputs: [{ type: 'main' }],
    properties: [
      {
        displayName: 'HTTP Method',
        name: 'httpMethod',
        type: 'options',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
        ],
        default: 'POST',
        description: 'The HTTP method that the webhook listens on',
      },
      {
        displayName: 'Path',
        name: 'path',
        type: 'string',
        default: '',
        placeholder: '/my-webhook',
        description: 'The path segment of the webhook URL',
        required: true,
      },
      {
        displayName: 'Response Mode',
        name: 'responseMode',
        type: 'options',
        options: [
          { name: 'Immediately', value: 'onReceived' },
          { name: 'When last node finishes', value: 'lastNode' },
          { name: 'Using "Respond to Webhook" node', value: 'responseNode' },
        ],
        default: 'onReceived',
      },
      {
        displayName: 'Response Data',
        name: 'responseData',
        type: 'options',
        options: [
          { name: 'All Entries', value: 'allEntries' },
          { name: 'First Entry JSON', value: 'firstEntryJson' },
          { name: 'No Response Body', value: 'noData' },
        ],
        default: 'firstEntryJson',
        displayOptions: { show: { responseMode: ['lastNode'] } },
      },
      {
        displayName: 'Response Headers',
        name: 'responseHeaders',
        type: 'collection',
        default: {},
        description: 'Headers to add to the webhook response',
      },
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        description: 'Name of the binary property for file uploads',
      },
    ],
    defaults: { name: 'Webhook', color: '#6E56CF' },
    triggerPanel: {
      header: 'Pull in events from any service that supports webhooks',
      executionsHelp: {
        inactive: 'Webhooks have two modes: test and production.\n\nTo use the webhook in test mode: use the "Test URL".',
        active: 'Your workflow is active and listening for webhook calls using the "Production URL".',
      },
    },
  };

  async webhook(context: NodeExecutionContext): Promise<WebhookResponse> {
    const inputData = context.getInputData();
    return {
      workflowData: [inputData],
    };
  }
}
