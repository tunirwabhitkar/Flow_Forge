import axios, { type AxiosRequestConfig, type Method } from 'axios';
import FormData from 'form-data';
import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';

export class HttpRequestNode implements INode {
  description: NodeDescription = {
    displayName: 'HTTP Request',
    name: 'flowforge.httpRequest',
    group: ['action'],
    version: 3,
    description: 'Makes HTTP requests to any URL',
    icon: 'fa:globe',
    color: '#2196F3',
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    credentials: [
      { name: 'httpBasicAuth', required: false },
      { name: 'httpBearerAuth', required: false },
      { name: 'httpHeaderAuth', required: false },
    ],
    properties: [
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        options: [
          { name: 'DELETE', value: 'DELETE' },
          { name: 'GET', value: 'GET' },
          { name: 'HEAD', value: 'HEAD' },
          { name: 'OPTIONS', value: 'OPTIONS' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
        ],
        default: 'GET',
        required: true,
      },
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        default: '',
        placeholder: 'https://api.example.com/endpoint',
        required: true,
      },
      {
        displayName: 'Authentication',
        name: 'authentication',
        type: 'options',
        options: [
          { name: 'None', value: 'none' },
          { name: 'Basic Auth', value: 'basicAuth' },
          { name: 'Bearer Token', value: 'bearerToken' },
          { name: 'Header Auth', value: 'headerAuth' },
          { name: 'OAuth2', value: 'oauth2' },
        ],
        default: 'none',
      },
      {
        displayName: 'Send Headers',
        name: 'sendHeaders',
        type: 'boolean',
        default: false,
      },
      {
        displayName: 'Headers',
        name: 'headerParameters',
        type: 'collection',
        default: {},
        displayOptions: { show: { sendHeaders: [true] } },
      },
      {
        displayName: 'Send Query Parameters',
        name: 'sendQuery',
        type: 'boolean',
        default: false,
      },
      {
        displayName: 'Query Parameters',
        name: 'queryParameters',
        type: 'collection',
        default: {},
        displayOptions: { show: { sendQuery: [true] } },
      },
      {
        displayName: 'Send Body',
        name: 'sendBody',
        type: 'boolean',
        default: false,
        displayOptions: { show: { method: ['PATCH', 'POST', 'PUT', 'DELETE'] } },
      },
      {
        displayName: 'Body Content Type',
        name: 'contentType',
        type: 'options',
        options: [
          { name: 'JSON', value: 'json' },
          { name: 'Form Urlencoded', value: 'form-urlencoded' },
          { name: 'Multipart Form Data', value: 'multipart-form-data' },
          { name: 'Raw / Custom', value: 'raw' },
          { name: 'Binary', value: 'binary' },
        ],
        default: 'json',
        displayOptions: { show: { sendBody: [true] } },
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'json',
        default: '{}',
        displayOptions: { show: { sendBody: [true], contentType: ['json'] } },
      },
      {
        displayName: 'Timeout (ms)',
        name: 'timeout',
        type: 'number',
        default: 30000,
      },
      {
        displayName: 'Retry on Failure',
        name: 'retryOnFail',
        type: 'boolean',
        default: false,
      },
      {
        displayName: 'Max Retries',
        name: 'maxTries',
        type: 'number',
        default: 3,
        displayOptions: { show: { retryOnFail: [true] } },
      },
    ],
    defaults: { name: 'HTTP Request', color: '#2196F3' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const items = context.getInputData();
    const results: NodeOutput_data[number] = [];

    for (let i = 0; i < items.length; i++) {
      const method = context.getNodeParameter<string>('method', i, 'GET');
      const url = context.getNodeParameter<string>('url', i);
      const timeout = context.getNodeParameter<number>('timeout', i, 30000);
      const sendHeaders = context.getNodeParameter<boolean>('sendHeaders', i, false);
      const sendQuery = context.getNodeParameter<boolean>('sendQuery', i, false);
      const sendBody = context.getNodeParameter<boolean>('sendBody', i, false);

      const headers: Record<string, string> = {};
      if (sendHeaders) {
        const headerParams = context.getNodeParameter<Record<string, string>>('headerParameters', i, {});
        Object.assign(headers, headerParams);
      }

      const params: Record<string, unknown> = {};
      if (sendQuery) {
        const queryParams = context.getNodeParameter<Record<string, unknown>>('queryParameters', i, {});
        Object.assign(params, queryParams);
      }

      let data: unknown = undefined;
      if (sendBody) {
        const contentType = context.getNodeParameter<string>('contentType', i, 'json');
        if (contentType === 'json') {
          const bodyRaw = context.getNodeParameter<string>('body', i, '{}');
          data = typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : bodyRaw;
          headers['Content-Type'] = 'application/json';
        } else if (contentType === 'form-urlencoded') {
          data = context.getNodeParameter<Record<string, unknown>>('body', i, {});
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }

      const config: AxiosRequestConfig = {
        method: method as Method,
        url,
        headers,
        params,
        data,
        timeout,
        validateStatus: () => true, // Don't throw on 4xx/5xx
      };

      try {
        const response = await axios(config);
        const responseData = typeof response.data === 'object' ? response.data : { body: response.data };
        results.push({
          json: {
            ...responseData,
            $response: {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            },
          },
          pairedItem: { item: i },
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (context.node.continueOnFail) {
          results.push({ json: { error: error.message }, pairedItem: { item: i } });
        } else {
          throw error;
        }
      }
    }

    return [results];
  }
}
