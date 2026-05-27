# FlowForge

**Self-hosted workflow automation platform** — wire together integrations, run custom code, and build AI-powered automations through a visual node editor.

> Built with TypeScript, Vue 3, Express 5, LangChain, and a typed DAG execution engine. Inspired by n8n, built from scratch.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Monorepo Structure](#monorepo-structure)
- [Configuration](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Built-in Nodes](#built-in-nodes)
- [API Reference](#api-reference)
- [Security](#security)

---

## Features

### Core Engine
- **Typed DAG execution** — Kahn's topological sort, cycle detection, parallel branch support
- **Two execution modes** — `regular` (single-process) and `queue` (Bull + Redis workers)
- **Checkpoint persistence** — execution state saved to DB at each node
- **Binary data storage** — filesystem or S3, with GC job
- **Execution history** — soft/hard delete with configurable retention

### Workflow Editor
- **Vue Flow canvas** — drag-and-drop visual node editor
- **Node palette** — searchable, grouped by category
- **CodeMirror 6** — embedded JavaScript/JSON/HTML code editor with syntax highlighting
- **Undo/redo** — 50-step history stack
- **AI Assistant** — generate workflow nodes from plain English (Claude or GPT-4o)
- **Version history** — roll back to any previous workflow state

### Integrations
- **10+ built-in nodes** — Webhook, Schedule, HTTP Request, Code, IF, Set Fields, Send Email, Slack, Postgres, AI LLM
- **400+ integration template** — architecture ready for all major APIs
- **Multi-provider AI** — OpenAI, Anthropic, Ollama, Azure, Groq, Mistral

### Auth & Access Control
- Email/password with bcrypt
- TOTP (Google Authenticator) MFA
- LDAP, SAML 2.0, OpenID Connect (enterprise)
- Roles: `owner`, `admin`, `member`, `viewer`
- Project-scoped workflows and credentials
- API keys with scope enforcement (`read:workflow`, `write:execution`, etc.)

### Credentials & Secrets
- AES-256-GCM encryption at rest
- OAuth 1.0a/2.0 with PKCE
- API keys, Basic, Bearer, AWS Signature v4
- AWS Secrets Manager / Azure Key Vault integration (secrets never touch DB)

### Observability
- Winston structured logging (console + file)
- Prometheus metrics at `/metrics`
- OpenTelemetry traces
- Sentry error tracking
- Message event bus for streaming execution events

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 22.0
- **pnpm** ≥ 9.0
- **Docker** (optional, for PostgreSQL/Redis)

### 1 — Clone and install

```bash
git clone https://github.com/yourorg/flowforge.git
cd flowforge
pnpm install
```

### 2 — Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum, set:
#   FLOWFORGE_ENCRYPTION_KEY  (32+ chars, random)
#   JWT_SECRET                (32+ chars, random)
```

Generate secure keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3 — Start development servers

```bash
pnpm dev
```

This starts both the backend (`:5678`) and frontend (`:5173`) with hot reload.

### 4 — Seed the database

```bash
pnpm db:seed
```

Default admin: `admin@flowforge.local` / `FlowForge2024!`

### 5 — Open the editor

Navigate to [http://localhost:5173](http://localhost:5173) and log in.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vue 3)                     │
│  Vue Flow Editor · Pinia Stores · CodeMirror 6 · Element+   │
└────────────────────────┬────────────────────────────────────┘
                         │ REST /rest (internal)
                         │ REST /api/v1 (public)
┌────────────────────────▼────────────────────────────────────┐
│                    Backend (Express 5)                      │
│                                                             │
│  Auth · RBAC · Webhook Router · Rate Limiter               │
│  AI Assistant · OpenAPI · Prometheus Metrics               │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │         Workflow Execution Engine            │           │
│  │  Topological Sort · DAG Runner · Timeout    │           │
│  │  Node Registry · Binary Data · Events       │           │
│  └──────────────┬──────────────────────────────┘           │
│                 │                                           │
│  ┌──────────────▼──────┐    ┌──────────────────────────┐   │
│  │   Regular Mode      │    │      Queue Mode (Bull)   │   │
│  │  In-process runner  │    │  Job → Redis → Workers   │   │
│  └─────────────────────┘    └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   ┌─────────┐     ┌──────────┐    ┌──────────┐
   │ SQLite  │     │ Postgres │    │  Redis   │
   │  (dev)  │     │  (prod)  │    │  (queue) │
   └─────────┘     └──────────┘    └──────────┘
```

### Execution Flow

```
Trigger (Webhook/Schedule/Manual)
    │
    ▼
WorkflowExecutionEngine.run()
    │
    ├── buildAdjacencyList(workflow)
    ├── topologicalSort()           ← Kahn's algorithm, O(V+E)
    │
    └── for each node in sorted order:
            │
            ├── Skip if disabled
            ├── Gather inputs from predecessor outputs
            ├── Build NodeExecutionContext (credentials, helpers)
            ├── node.execute(context)
            │       └── Returns NodeOutput_data[][]
            ├── Store output in runData[nodeName]
            └── On error → continueOnFail? or stop
```

---

## Monorepo Structure

```
flowforge/
├── packages/
│   ├── core/          # DAG engine, types, errors, event bus, node registry
│   ├── nodes/         # All built-in node implementations
│   ├── backend/       # Express 5 API, TypeORM, auth, webhooks, queue
│   ├── ai/            # LangChain agents, vector stores, MCP client
│   └── frontend/      # Vue 3 editor, Pinia stores, Vue Flow canvas
├── nginx/             # Reverse proxy config
├── monitoring/        # Prometheus + Grafana configs
├── scripts/           # DB init scripts
├── .github/           # CI/CD workflows
├── docker-compose.yml
├── Dockerfile
└── turbo.json
```

---

## Configuration

All configuration is through environment variables. See [`.env.example`](.env.example) for the full list.

### Critical variables

| Variable | Required | Description |
|---|---|---|
| `FLOWFORGE_ENCRYPTION_KEY` | ✅ | 32+ char key for AES-256-GCM credential encryption |
| `JWT_SECRET` | ✅ | 32+ char secret for JWT signing |
| `DB_TYPE` | | `sqlite` (default) / `postgres` / `mysql` |
| `EXECUTIONS_MODE` | | `regular` (default) / `queue` |
| `REDIS_URL` | Queue mode | Redis connection for Bull queue |

### AI providers

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | For Claude models (AI assistant defaults to Claude) |
| `OPENAI_API_KEY` | For GPT-4o and embeddings |
| `AI_ASSISTANT_MODEL` | Override AI assistant model (default: `claude-opus-4-20250514`) |

---

## Development

### Commands

```bash
# Start all packages in watch mode
pnpm dev

# Build everything
pnpm build

# Run all tests
pnpm test

# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Format code
pnpm format

# Seed database
pnpm db:seed

# Run only backend in dev
pnpm --filter @flowforge/backend dev

# Run only frontend in dev
pnpm --filter @flowforge/frontend dev
```

### Adding a new node

1. Create `packages/nodes/src/<category>/<name>.node.ts`
2. Implement the `INode` interface from `@flowforge/core`
3. Export it from `packages/nodes/src/index.ts`
4. Add to `allBuiltInNodes` array

```typescript
import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';

export class MyNode implements INode {
  description: NodeDescription = {
    displayName: 'My Node',
    name: 'myorg.myNode',
    group: ['action'],
    version: 1,
    description: 'Does something useful',
    icon: 'fa:star',
    color: '#FF6B6B',
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    properties: [
      {
        displayName: 'Input Value',
        name: 'value',
        type: 'string',
        default: '',
        required: true,
      },
    ],
    defaults: { name: 'My Node' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const items = context.getInputData();
    const value = context.getNodeParameter<string>('value', 0);
    return [items.map(item => ({ json: { ...item.json, processed: value } }))];
  }
}
```

### Adding a credential type

```typescript
import type { CredentialTypeDescription } from '@flowforge/core';

export const myApiCredential: CredentialTypeDescription = {
  name: 'myApi',
  displayName: 'My API',
  authType: 'apiKey',
  properties: [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      default: '',
      required: true,
    },
  ],
};
```

---

## Testing

```bash
# Core unit tests (DAG engine, node registry, errors)
pnpm --filter @flowforge/core test

# Backend unit tests (encryption, auth)
pnpm --filter @flowforge/backend test -- --testPathPattern="unit"

# Backend integration tests (REST API with in-memory SQLite)
pnpm --filter @flowforge/backend test -- --testPathPattern="integration"

# Frontend unit tests (Vitest + Vue Test Utils)
pnpm --filter @flowforge/frontend test

# E2E tests (Playwright — requires running servers)
pnpm --filter @flowforge/frontend test:e2e

# All tests with coverage
pnpm test -- --coverage
```

---

## Production Deployment

### Docker Compose (recommended)

```bash
# Copy and configure environment
cp .env.example .env
# Set FLOWFORGE_ENCRYPTION_KEY, JWT_SECRET, POSTGRES_PASSWORD, etc.

# Build and start
docker compose up -d

# Verify
curl http://localhost:5678/api/v1/health

# Seed initial data
docker compose exec flowforge node packages/backend/dist/db/seed.js
```

### With monitoring stack

```bash
docker compose --profile monitoring up -d
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3000  (admin / $GRAFANA_PASSWORD)
```

### Kubernetes (Helm chart)

```bash
# Coming soon — contributions welcome
helm install flowforge ./charts/flowforge \
  --set encryption.key="<your-key>" \
  --set jwt.secret="<your-secret>" \
  --set postgresql.enabled=true \
  --set redis.enabled=true
```

### Environment-specific considerations

**Production checklist:**
- [ ] Set strong `FLOWFORGE_ENCRYPTION_KEY` and `JWT_SECRET`
- [ ] Use `DB_TYPE=postgres` with a managed database
- [ ] Set `EXECUTIONS_MODE=queue` with Redis for scaling
- [ ] Configure `FLOWFORGE_WEBHOOK_URL` to your public domain
- [ ] Enable SSL via Nginx (see `nginx/nginx.conf`)
- [ ] Set `LOG_OUTPUT=both` for file-based logging
- [ ] Configure `SENTRY_DSN` for error tracking
- [ ] Set up regular database backups
- [ ] Configure `BINARY_DATA_MODE=s3` for persistent binary storage

---

## Built-in Nodes

| Node | Category | Description |
|---|---|---|
| **Webhook** | Trigger | HTTP webhook trigger (GET/POST/PUT/PATCH/DELETE) |
| **Schedule Trigger** | Trigger | Cron, interval, or preset schedules |
| **HTTP Request** | Action | Make HTTP calls to any API |
| **AI Language Model** | Action/AI | OpenAI, Anthropic, Ollama, Groq, Mistral |
| **Code** | Transform | Execute custom JavaScript in a sandbox |
| **Edit Fields (Set)** | Transform | Add, update, or remove JSON fields |
| **IF** | Flow | Conditional branching with filter rules |
| **Send Email** | Communication | SMTP email with HTML support |
| **Slack** | Communication | Post messages, manage channels |
| **Postgres** | Database | SELECT, INSERT, UPDATE, DELETE, raw SQL |

> The architecture supports 400+ integration nodes. Add new nodes by implementing the `INode` interface.

---

## API Reference

### Internal API (`/rest/*`)
Used by the frontend. Requires session cookie or `Authorization: Bearer <jwt>`.

```
POST   /rest/auth/login          # Login
POST   /rest/auth/register       # Register
GET    /rest/auth/me             # Current user

GET    /rest/workflows           # List workflows
POST   /rest/workflows           # Create workflow
GET    /rest/workflows/:id       # Get workflow
PATCH  /rest/workflows/:id       # Update workflow
DELETE /rest/workflows/:id       # Delete workflow
POST   /rest/workflows/:id/run   # Manual execution

GET    /rest/executions          # List executions
GET    /rest/executions/:id      # Get execution
POST   /rest/executions/:id/retry   # Retry failed execution
POST   /rest/executions/:id/cancel  # Cancel running execution

GET    /rest/credentials         # List credentials (no data)
POST   /rest/credentials         # Create credential
PATCH  /rest/credentials/:id     # Update credential
DELETE /rest/credentials/:id     # Delete credential

GET    /rest/node-types          # All node type definitions

POST   /rest/ai/generate-nodes   # AI node generation
POST   /rest/ai/chat             # AI assistant chat
```

### Public API (`/api/v1/*`)
Rate-limited. Requires `Authorization: Bearer <api-key>` with appropriate scopes.

**Scopes:** `read:workflow`, `write:workflow`, `delete:workflow`, `read:execution`, `write:execution`, `delete:execution`, `read:credential`, `write:credential`, `delete:credential`

Full OpenAPI 3.0 spec available at: `GET /api/v1/openapi.json`  
Interactive docs at: `/api/v1/docs`

### Webhook URLs

```
Production: /webhook/<your-path>
Test:        /webhook-test/<your-path>
Form:        /webhook-waiting/<your-path>
```

---

## Security

### Credential Encryption
All credentials are encrypted with AES-256-GCM before being stored in the database. The encryption key (`FLOWFORGE_ENCRYPTION_KEY`) never leaves the server and is never stored in the database.

### API Key Hashing
API keys are stored as HMAC-SHA256 hashes. The raw key is only shown once at creation time and cannot be recovered.

### Rate Limiting
- Public API: 180 req/15 min per IP (configurable)
- Login: 20 req/15 min per IP
- AI endpoints: 20 req/min per user

### Reporting Security Issues
Please report security vulnerabilities to `security@flowforge.io` rather than opening a public GitHub issue.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

*Built with ❤️ using TypeScript, Vue 3, LangChain, and a lot of DAG theory.*
