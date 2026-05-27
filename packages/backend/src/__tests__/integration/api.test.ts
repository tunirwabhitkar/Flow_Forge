import request from 'supertest';
import { createApp } from '../../app.js';
import { initDatabase, closeDatabase, AppDataSource } from '../../db/data-source.js';
import { loadAllNodes } from '../../nodes/loader.js';
import { webhookRegistry } from '../../webhooks/webhook.registry.js';
import { binaryDataService } from '../../execution/binary-data.service.js';
import type { Express } from 'express';

let app: Express;
let authToken: string;

beforeAll(async () => {
  // Use SQLite in-memory for tests
  process.env['DB_TYPE'] = 'sqlite';
  process.env['DB_SQLITE_DATABASE'] = ':memory:';
  process.env['FLOWFORGE_ENCRYPTION_KEY'] = 'test-key-32-chars-long!!!!!!!!!!!';
  process.env['JWT_SECRET'] = 'test-jwt-secret-32-chars-long!!!!';
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'error';

  await initDatabase();
  await binaryDataService.initialize();
  await loadAllNodes();
  await webhookRegistry.initialize();

  app = createApp();

  // Register a test user
  const regRes = await request(app)
    .post('/rest/auth/register')
    .send({
      email: 'test@flowforge.io',
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
    });

  authToken = regRes.body.token as string;
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

// ─── Auth endpoints ────────────────────────────────────────────────────────────

describe('POST /rest/auth/login', () => {
  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/rest/auth/login')
      .send({ email: 'test@flowforge.io', password: 'TestPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('test@flowforge.io');
  });

  it('rejects invalid password', async () => {
    const res = await request(app)
      .post('/rest/auth/login')
      .send({ email: 'test@flowforge.io', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects non-existent user', async () => {
    const res = await request(app)
      .post('/rest/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(401);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/rest/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(422);
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/rest/auth/login').send({});
    expect(res.status).toBe(422);
  });
});

describe('GET /rest/auth/me', () => {
  it('returns current user with valid token', async () => {
    const res = await request(app)
      .get('/rest/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@flowforge.io');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/rest/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/rest/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
  });
});

// ─── Workflow endpoints ────────────────────────────────────────────────────────

describe('Workflow CRUD', () => {
  let createdWorkflowId: string;

  it('creates a workflow', async () => {
    const res = await request(app)
      .post('/rest/workflows')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'My Test Workflow',
        nodes: [],
        connections: {},
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Test Workflow');
    expect(res.body).toHaveProperty('id');
    createdWorkflowId = res.body.id as string;
  });

  it('lists workflows', async () => {
    const res = await request(app)
      .get('/rest/workflows')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('gets a workflow by id', async () => {
    const res = await request(app)
      .get(`/rest/workflows/${createdWorkflowId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdWorkflowId);
  });

  it('updates a workflow', async () => {
    const res = await request(app)
      .patch(`/rest/workflows/${createdWorkflowId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Renamed Workflow' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Workflow');
  });

  it('returns 404 for non-existent workflow', async () => {
    const res = await request(app)
      .get('/rest/workflows/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });

  it('rejects creating workflow without name', async () => {
    const res = await request(app)
      .post('/rest/workflows')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ nodes: [] });

    expect(res.status).toBe(422);
  });

  it('deletes a workflow', async () => {
    const res = await request(app)
      .delete(`/rest/workflows/${createdWorkflowId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(204);

    // Verify it's gone
    const check = await request(app)
      .get(`/rest/workflows/${createdWorkflowId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(check.status).toBe(404);
  });
});

// ─── Credentials endpoints ────────────────────────────────────────────────────

describe('Credential CRUD', () => {
  let credentialId: string;

  it('creates a credential', async () => {
    const res = await request(app)
      .post('/rest/credentials')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'My Slack Credential',
        type: 'slackApi',
        data: { accessToken: 'xoxb-fake-token-12345' },
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Slack Credential');
    // Encrypted data must NOT be exposed
    expect(res.body).not.toHaveProperty('data');
    credentialId = res.body.id as string;
  });

  it('lists credentials without raw data', async () => {
    const res = await request(app)
      .get('/rest/credentials')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    for (const cred of res.body.data) {
      expect(cred).not.toHaveProperty('data');
      expect(cred).not.toHaveProperty('iv');
      expect(cred).not.toHaveProperty('authTag');
    }
  });

  it('deletes a credential', async () => {
    const res = await request(app)
      .delete(`/rest/credentials/${credentialId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(204);
  });
});

// ─── Node types endpoint ──────────────────────────────────────────────────────

describe('GET /rest/node-types', () => {
  it('returns all registered node types', async () => {
    const res = await request(app)
      .get('/rest/node-types')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Check structure
    const firstNode = res.body.data[0];
    expect(firstNode).toHaveProperty('name');
    expect(firstNode).toHaveProperty('displayName');
    expect(firstNode).toHaveProperty('description');
  });

  it('returns a specific node type', async () => {
    const res = await request(app)
      .get('/rest/node-types/flowforge.httpRequest')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('flowforge.httpRequest');
  });
});

// ─── Public API ───────────────────────────────────────────────────────────────

describe('GET /api/v1/health', () => {
  it('returns healthy status without auth', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('GET /api/v1/openapi.json', () => {
  it('returns the OpenAPI spec', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toBe('FlowForge Public API');
  });
});

// ─── Metrics endpoint ─────────────────────────────────────────────────────────

describe('GET /metrics', () => {
  it('returns Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('flowforge_');
  });
});
