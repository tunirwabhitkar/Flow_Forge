# FlowForge

<div align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="Apache 2.0" />
</div>

<p align="center">
  <strong>Self-hosted workflow automation for teams who want control, extensibility, and a modern visual editor.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#configuration">Configuration</a>
</p>

FlowForge is a self-hosted workflow automation platform for building, running, and monitoring automations with a visual node editor, a typed execution engine, and a developer-friendly backend.

It is designed for teams that want a powerful automation stack without giving up ownership of infrastructure, secrets, and execution logic.

---

## ✨ Why FlowForge?

- Visual workflow design with an intuitive node editor
- DAG-based orchestration for deterministic execution
- Local dev support plus production-ready queue execution
- Extensible node system for custom integrations and logic
- Self-hosted control over credentials, data, and deployment

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>⚡ Fast setup</strong><br />Get a workflow engine running locally in minutes.</td>
      <td align="center"><strong>🧠 AI-ready</strong><br />Integrate assistant workflows and model providers.</td>
      <td align="center"><strong>🔐 Secure by default</strong><br />Handle secrets, auth, and credentials in a controlled environment.</td>
    </tr>
  </table>
</div>

---

## 🧩 Features

<div align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <strong>Workflow editor</strong><br />
        Drag-and-drop canvas, node palette, and code-editing support for scripts and payloads.
      </td>
      <td align="center" width="33%">
        <strong>Execution engine</strong><br />
        DAG-based orchestration with dependency ordering, retries, and queue execution modes.
      </td>
      <td align="center" width="33%">
        <strong>Integrations</strong><br />
        Connect APIs, triggers, databases, webhooks, and communication channels with built-in nodes.
      </td>
    </tr>
    <tr>
      <td align="center" width="33%">
        <strong>Auth & access</strong><br />
        Secure login flows, role-aware access, and a backend designed for enterprise-style control.
      </td>
      <td align="center" width="33%">
        <strong>Observability</strong><br />
        Structured logs, metrics, and monitoring hooks for production operations.
      </td>
      <td align="center" width="33%">
        <strong>Extensible platform</strong><br />
        Add new nodes, credentials, and services without reworking the runtime model.
      </td>
    </tr>
  </table>
</div>

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         Frontend (Vue 3)                   │
│  Workflow editor · State store · Code editor · UI panels    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                        Backend (Express 5)                  │
│  Auth · API routes · Webhooks · Credentials · Scheduler      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     Core execution engine                     │
│   DAG builder · Node registry · Dependency resolution        │
│   Retry handling · Event bus · Execution orchestration       │
└──────────────────────────────┬──────────────────────────────┘
                               │
           ┌───────────────────────┼────────────────────────────┐
           ▼                       ▼                        ▼
    ┌──────────────┐       ┌──────────────┐        ┌──────────────┐
    │ SQLite /     │       │ PostgreSQL / │        │ Redis / Bull │
    │ local store  │       │ managed DB   │        │ queue layer  │
    └──────────────┘       └──────────────┘        └──────────────┘
```

---

## 📁 Monorepo structure

```text
flowforge/
├── packages/
│   ├── core/        # DAG engine, shared types, registry, events
│   ├── nodes/       # Built-in node implementations
│   ├── backend/     # API server, auth, orchestration, DB access
│   ├── ai/          # AI assistant and model integrations
│   └── frontend/    # Vue 3 editor and user interface
├── nginx/           # Reverse proxy configuration
├── monitoring/      # Prometheus and monitoring config
├── scripts/         # Database bootstrap scripts
├── .env.example     # Environment template
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── LICENSE
├── README.md
└── .gitignore
```

---

## 🚀 Quick start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (optional, mainly for Redis/PostgreSQL or containerized runs)

### 1) Install dependencies

```bash
git clone <your-repo-url>
cd flowforge
pnpm install
```

### 2) Configure the environment

```bash
cp .env.example .env
```

Then update the required values, especially:

```env
FLOWFORGE_ENCRYPTION_KEY=change-me-in-production-32-chars!!
JWT_SECRET=change-me-jwt-secret-32-chars!!!!
DB_TYPE=sqlite
EXECUTIONS_MODE=regular
```

Generate secure values if needed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3) Start the app

```bash
pnpm dev
```

The development stack should be available at:

- Frontend: http://localhost:5173
- Backend: http://localhost:5678

### 4) Seed the database

```bash
pnpm db:seed
```

### 5) Open FlowForge

Visit the frontend URL in your browser and start creating workflows.

---

## 🧪 Common development commands

```bash
# Run the full monorepo in dev watch mode
pnpm dev

# Build all packages
pnpm build

# Run tests across the workspace
pnpm test

# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Format code
pnpm format

# Run only backend dev mode
pnpm --filter @flowforge/backend dev

# Run only frontend dev mode
pnpm --filter @flowforge/frontend dev
```

---

## ⚙️ Configuration

The project is configured through environment variables using the template in [.env.example](.env.example).

| Variable | Purpose |
|---|---|
| `FLOWFORGE_ENCRYPTION_KEY` | Encrypts stored credentials at rest |
| `JWT_SECRET` | Signs authentication tokens |
| `DB_TYPE` | Database backend: `sqlite`, `postgres`, or `mysql` |
| `EXECUTIONS_MODE` | `regular` or `queue` execution mode |
| `REDIS_URL` | Redis connection for queue-based execution |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | AI provider credentials |
| `FLOWFORGE_WEBHOOK_URL` | Public URL used for webhook callbacks |

---

## 🚢 Deployment

### Docker Compose

```bash
docker compose up -d
```

This is the easiest way to run the stack locally or in a staging environment.

### Production guidance

For production deployments, the platform is designed to work well with:

- PostgreSQL or MySQL instead of SQLite
- Redis in queue mode
- TLS termination via Nginx or a reverse proxy
- Strong secret rotation and secure environment management
- Separate runtime and admin configuration boundaries

---

## 🤝 Contributing

Contributions are welcome. The repository is organized by package so changes usually land in:

- `packages/core` for execution engine and shared types
- `packages/backend` for API and runtime behavior
- `packages/frontend` for editor and app UI
- `packages/nodes` for built-in node implementations

---

## 📄 License

This project is licensed under the Apache 2.0 License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with TypeScript, Vue, and a workflow-first execution engine for modern automation.
</p>
