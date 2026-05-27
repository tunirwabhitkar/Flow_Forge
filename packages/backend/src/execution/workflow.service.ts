import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../db/data-source.js';
import { WorkflowEntity, WorkflowVersionEntity, WebhookEntity } from '../db/entities.js';
import { webhookRegistry } from '../webhooks/webhook.registry.js';
import { globalEventBus, type WorkflowDefinition, WorkflowDefinitionSchema } from '@flowforge/core';
import { NotFoundError, ValidationError } from '@flowforge/core';
import { logger } from '../observability/logger.js';

export interface WorkflowCreateInput {
  name: string;
  nodes?: unknown[];
  connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  projectId?: string;
  ownerId: string;
}

export interface WorkflowUpdateInput {
  name?: string;
  nodes?: unknown[];
  connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  active?: boolean;
}

export class WorkflowService {
  private get wfRepo() {
    return AppDataSource.getRepository(WorkflowEntity);
  }
  private get versionRepo() {
    return AppDataSource.getRepository(WorkflowVersionEntity);
  }

  async create(input: WorkflowCreateInput): Promise<WorkflowEntity> {
    const entity = this.wfRepo.create({
      id: uuidv4(),
      name: input.name,
      nodes: JSON.stringify(input.nodes ?? []),
      connections: JSON.stringify(input.connections ?? {}),
      settings: input.settings ? JSON.stringify(input.settings) : undefined,
      active: false,
      versionId: uuidv4(),
      projectId: input.projectId,
      ownerId: input.ownerId,
    });
    return this.wfRepo.save(entity);
  }

  async findAll(projectId?: string, limit = 50, offset = 0): Promise<[WorkflowEntity[], number]> {
    const qb = this.wfRepo
      .createQueryBuilder('w')
      .orderBy('w.updatedAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (projectId) qb.where('w.project_id = :projectId', { projectId });

    return qb.getManyAndCount();
  }

  async findById(id: string): Promise<WorkflowEntity | null> {
    return this.wfRepo.findOne({ where: { id } });
  }

  async update(id: string, input: WorkflowUpdateInput, userId?: string): Promise<WorkflowEntity> {
    const wf = await this.wfRepo.findOne({ where: { id } });
    if (!wf) throw new NotFoundError('Workflow', id);

    // Save version before updating
    if (input.nodes || input.connections) {
      await this.saveVersion(wf, userId);
    }

    if (input.name) wf.name = input.name;
    if (input.nodes) wf.nodes = JSON.stringify(input.nodes);
    if (input.connections) wf.connections = JSON.stringify(input.connections);
    if (input.settings) wf.settings = JSON.stringify(input.settings);
    if (typeof input.active === 'boolean') {
      const wasActive = wf.active;
      wf.active = input.active;
      await this.wfRepo.save(wf);

      if (!wasActive && input.active) await this.activate(wf);
      else if (wasActive && !input.active) await this.deactivate(wf);
      return wf;
    }

    wf.versionId = uuidv4();
    return this.wfRepo.save(wf);
  }

  async activate(wf: WorkflowEntity): Promise<void> {
    const def: WorkflowDefinition = {
      id: wf.id,
      name: wf.name,
      active: true,
      nodes: JSON.parse(wf.nodes),
      connections: JSON.parse(wf.connections),
    };

    // Register webhooks for webhook trigger nodes
    for (const node of def.nodes) {
      if (node.type === 'flowforge.webhook') {
        const webhookPath = (node.parameters['path'] as string) ?? `/${wf.id}/${node.id}`;
        const httpMethod = (node.parameters['httpMethod'] as string) ?? 'GET';

        await webhookRegistry.register({
          workflowId: wf.id,
          nodeId: node.id,
          nodeName: node.name,
          path: webhookPath,
          method: httpMethod,
          webhookType: 'production',
        });
      }
    }

    globalEventBus.emit('workflow:activated', { workflowId: wf.id });
    logger.info(`Workflow activated: ${wf.name} (${wf.id})`);
  }

  async deactivate(wf: WorkflowEntity): Promise<void> {
    await webhookRegistry.unregister(wf.id);
    globalEventBus.emit('workflow:deactivated', { workflowId: wf.id });
    logger.info(`Workflow deactivated: ${wf.name} (${wf.id})`);
  }

  async delete(id: string): Promise<void> {
    const wf = await this.wfRepo.findOne({ where: { id } });
    if (!wf) throw new NotFoundError('Workflow', id);

    if (wf.active) await this.deactivate(wf);
    await this.wfRepo.softDelete(id);
    globalEventBus.emit('workflow:deleted', { workflowId: id });
  }

  async getVersions(workflowId: string): Promise<WorkflowVersionEntity[]> {
    return this.versionRepo.find({
      where: { workflowId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async rollbackToVersion(workflowId: string, versionId: string): Promise<WorkflowEntity> {
    const version = await this.versionRepo.findOne({ where: { id: versionId, workflowId } });
    if (!version) throw new NotFoundError('WorkflowVersion', versionId);

    const wf = await this.wfRepo.findOne({ where: { id: workflowId } });
    if (!wf) throw new NotFoundError('Workflow', workflowId);

    await this.saveVersion(wf);
    wf.nodes = version.nodes;
    wf.connections = version.connections;
    wf.settings = version.settings;
    wf.versionId = uuidv4();
    return this.wfRepo.save(wf);
  }

  private async saveVersion(wf: WorkflowEntity, createdBy?: string): Promise<WorkflowVersionEntity> {
    const version = this.versionRepo.create({
      id: uuidv4(),
      workflowId: wf.id,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings,
      versionId: wf.versionId,
      createdBy,
    });
    return this.versionRepo.save(version);
  }
}

export const workflowService = new WorkflowService();
