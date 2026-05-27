// Trigger nodes
export { WebhookTriggerNode } from './trigger/webhook.node.js';
export { ScheduleTriggerNode } from './trigger/schedule-trigger.node.js';

// Action nodes
export { HttpRequestNode } from './action/http-request.node.js';
export { AILLMNode } from './action/ai-llm.node.js';

// Transform nodes
export { CodeNode } from './transform/code.node.js';
export { SetNode } from './transform/set.node.js';

// Flow control
export { IfNode } from './flow/if.node.js';

// Communication
export { SendEmailNode } from './communication/send-email.node.js';
export { SlackNode } from './communication/slack.node.js';

// Database
export { PostgresNode } from './database/postgres.node.js';

// ─── All Built-in Nodes ──────────────────────────────────────────────────────

import type { INode } from '@flowforge/core';
import { WebhookTriggerNode } from './trigger/webhook.node.js';
import { ScheduleTriggerNode } from './trigger/schedule-trigger.node.js';
import { HttpRequestNode } from './action/http-request.node.js';
import { AILLMNode } from './action/ai-llm.node.js';
import { CodeNode } from './transform/code.node.js';
import { SetNode } from './transform/set.node.js';
import { IfNode } from './flow/if.node.js';
import { SendEmailNode } from './communication/send-email.node.js';
import { SlackNode } from './communication/slack.node.js';
import { PostgresNode } from './database/postgres.node.js';

export const allBuiltInNodes: INode[] = [
  new WebhookTriggerNode(),
  new ScheduleTriggerNode(),
  new HttpRequestNode(),
  new AILLMNode(),
  new CodeNode(),
  new SetNode(),
  new IfNode(),
  new SendEmailNode(),
  new SlackNode(),
  new PostgresNode(),
];
