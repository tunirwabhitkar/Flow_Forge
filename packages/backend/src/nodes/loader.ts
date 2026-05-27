import { globalNodeRegistry } from '@flowforge/core';
import { allBuiltInNodes } from '@flowforge/nodes';
import { logger } from '../observability/logger.js';

export async function loadAllNodes(): Promise<void> {
  globalNodeRegistry.registerMany(allBuiltInNodes);
  logger.info(`Node registry loaded ${globalNodeRegistry.size()} built-in nodes`);
}
