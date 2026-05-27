import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { initDatabase, AppDataSource } from './data-source.js';
import { UserEntity, WorkflowEntity, TagEntity } from './entities.js';
import { logger } from '../observability/logger.js';

async function seed(): Promise<void> {
  logger.info('🌱 Starting database seed...');
  await initDatabase();

  const userRepo = AppDataSource.getRepository(UserEntity);
  const workflowRepo = AppDataSource.getRepository(WorkflowEntity);
  const tagRepo = AppDataSource.getRepository(TagEntity);

  // ─── Owner User ─────────────────────────────────────────────────────────────

  const ownerEmail = process.env['SEED_OWNER_EMAIL'] ?? 'admin@flowforge.local';
  const ownerPassword = process.env['SEED_OWNER_PASSWORD'] ?? 'FlowForge2024!';

  const existing = await userRepo.findOne({ where: { email: ownerEmail } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(ownerPassword, 12);
    const owner = userRepo.create({
      id: uuidv4(),
      email: ownerEmail,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'owner',
      emailVerified: true,
    });
    await userRepo.save(owner);
    logger.info(`Created owner user: ${ownerEmail}`);
  } else {
    logger.info(`Owner user already exists: ${ownerEmail}`);
  }

  const owner = await userRepo.findOne({ where: { email: ownerEmail } });
  if (!owner) throw new Error('Owner user not found after seed');

  // ─── Tags ─────────────────────────────────────────────────────────────────

  const tagNames = ['automation', 'ai', 'webhook', 'scheduled', 'example'];
  const tags: TagEntity[] = [];

  for (const name of tagNames) {
    const existingTag = await tagRepo.findOne({ where: { name } });
    if (!existingTag) {
      const tag = tagRepo.create({ id: uuidv4(), name });
      tags.push(await tagRepo.save(tag));
    } else {
      tags.push(existingTag);
    }
  }

  // ─── Sample Workflows ──────────────────────────────────────────────────────

  const sampleWorkflows = [
    {
      name: 'HTTP Webhook → Transform → Log',
      nodes: [
        {
          id: 'trigger-1',
          name: 'Webhook',
          type: 'flowforge.webhook',
          typeVersion: 1,
          position: [100, 300],
          parameters: { httpMethod: 'POST', path: '/sample/webhook', responseMode: 'onReceived' },
        },
        {
          id: 'transform-1',
          name: 'Extract Fields',
          type: 'flowforge.set',
          typeVersion: 3,
          position: [380, 300],
          parameters: {
            mode: 'manual',
            fields: { event: '={{ $json.event }}', userId: '={{ $json.userId }}', timestamp: '={{ $now }}' },
          },
        },
        {
          id: 'code-1',
          name: 'Log to Console',
          type: 'flowforge.code',
          typeVersion: 2,
          position: [660, 300],
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: `console.log('Received event:', $input.first().json);\nreturn $input.all();`,
          },
        },
      ],
      connections: {
        Webhook: { main: [[{ node: 'Extract Fields', type: 'main', index: 0 }]] },
        'Extract Fields': { main: [[{ node: 'Log to Console', type: 'main', index: 0 }]] },
      },
    },
    {
      name: 'Daily Report via Email (Schedule)',
      nodes: [
        {
          id: 'sched-1',
          name: 'Daily at 9am',
          type: 'flowforge.scheduleTrigger',
          typeVersion: 1,
          position: [100, 300],
          parameters: { rule: 'cron', cronExpression: '0 9 * * *', timezone: 'America/New_York' },
        },
        {
          id: 'http-1',
          name: 'Fetch Report Data',
          type: 'flowforge.httpRequest',
          typeVersion: 3,
          position: [380, 300],
          parameters: { method: 'GET', url: 'https://api.example.com/report', sendHeaders: false },
        },
        {
          id: 'email-1',
          name: 'Send Report Email',
          type: 'flowforge.sendEmail',
          typeVersion: 2,
          position: [660, 300],
          parameters: {
            toEmail: 'team@example.com',
            subject: 'Daily Report — {{ $now.toFormat("yyyy-MM-dd") }}',
            emailFormat: 'html',
            html: '<h1>Daily Report</h1><pre>{{ JSON.stringify($json, null, 2) }}</pre>',
          },
        },
      ],
      connections: {
        'Daily at 9am': { main: [[{ node: 'Fetch Report Data', type: 'main', index: 0 }]] },
        'Fetch Report Data': { main: [[{ node: 'Send Report Email', type: 'main', index: 0 }]] },
      },
    },
    {
      name: 'AI Chatbot with Slack',
      nodes: [
        {
          id: 'slack-trigger-1',
          name: 'Slack Webhook',
          type: 'flowforge.webhook',
          typeVersion: 1,
          position: [100, 300],
          parameters: { httpMethod: 'POST', path: '/slack/events', responseMode: 'onReceived' },
        },
        {
          id: 'if-1',
          name: 'Is Bot Mentioned?',
          type: 'flowforge.if',
          typeVersion: 2,
          position: [380, 300],
          parameters: {
            conditions: [{ leftValue: '={{ $json.event.type }}', operation: 'equal', rightValue: 'app_mention' }],
            combineOperation: 'AND',
          },
        },
        {
          id: 'ai-1',
          name: 'Generate AI Reply',
          type: 'flowforge.aiLLM',
          typeVersion: 1,
          position: [660, 200],
          parameters: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            systemPrompt: 'You are a helpful Slack assistant. Be concise and friendly.',
            prompt: '={{ $json.event.text.replace(/<@[^>]+>/g, "").trim() }}',
            temperature: 0.7,
            maxTokens: 512,
          },
        },
        {
          id: 'slack-1',
          name: 'Reply in Slack',
          type: 'flowforge.slack',
          typeVersion: 2,
          position: [940, 200],
          parameters: {
            resource: 'message',
            operation: 'send',
            channel: '={{ $json.event.channel }}',
            text: '={{ $json.response }}',
          },
        },
      ],
      connections: {
        'Slack Webhook': { main: [[{ node: 'Is Bot Mentioned?', type: 'main', index: 0 }]] },
        'Is Bot Mentioned?': { main: [[{ node: 'Generate AI Reply', type: 'main', index: 0 }], []] },
        'Generate AI Reply': { main: [[{ node: 'Reply in Slack', type: 'main', index: 0 }]] },
      },
    },
  ];

  for (const wfData of sampleWorkflows) {
    const exists = await workflowRepo.findOne({ where: { name: wfData.name } });
    if (!exists) {
      const wf = workflowRepo.create({
        id: uuidv4(),
        name: wfData.name,
        nodes: JSON.stringify(wfData.nodes),
        connections: JSON.stringify(wfData.connections),
        active: false,
        versionId: uuidv4(),
        ownerId: owner.id,
      });
      await workflowRepo.save(wf);
      logger.info(`Created sample workflow: ${wfData.name}`);
    }
  }

  logger.info('✅ Seed complete');
  logger.info(`\n  Login with:\n    Email:    ${ownerEmail}\n    Password: ${ownerPassword}\n`);

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
