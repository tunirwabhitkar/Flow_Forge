# ─── Build Stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json          ./packages/core/package.json
COPY packages/nodes/package.json         ./packages/nodes/package.json
COPY packages/backend/package.json       ./packages/backend/package.json
COPY packages/ai/package.json            ./packages/ai/package.json
COPY packages/frontend/package.json      ./packages/frontend/package.json

# Install all dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─── Source Build ──────────────────────────────────────────────────────────────
FROM base AS builder

COPY packages/core/src       ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/tsconfig.json

COPY packages/nodes/src      ./packages/nodes/src
COPY packages/nodes/tsconfig.json ./packages/nodes/tsconfig.json

COPY packages/backend/src    ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/tsconfig.json

COPY packages/ai/src         ./packages/ai/src
COPY packages/ai/tsconfig.json ./packages/ai/tsconfig.json

COPY packages/frontend/src   ./packages/frontend/src
COPY packages/frontend/index.html ./packages/frontend/index.html
COPY packages/frontend/public ./packages/frontend/public
COPY packages/frontend/vite.config.ts ./packages/frontend/vite.config.ts
COPY packages/frontend/tsconfig.json ./packages/frontend/tsconfig.json
COPY packages/frontend/tsconfig.node.json ./packages/frontend/tsconfig.node.json

# Build everything with Turbo
RUN pnpm turbo run build --filter=@flowforge/backend --filter=@flowforge/frontend

# ─── Production Image ──────────────────────────────────────────────────────────
FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Create non-root user
RUN addgroup -g 1001 -S flowforge && \
    adduser -S -u 1001 -G flowforge flowforge

WORKDIR /app

# Copy built artifacts + manifests
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/core/package.json     ./packages/core/
COPY --from=builder /app/packages/core/dist             ./packages/core/dist
COPY --from=builder /app/packages/nodes/package.json    ./packages/nodes/
COPY --from=builder /app/packages/nodes/dist            ./packages/nodes/dist
COPY --from=builder /app/packages/backend/package.json  ./packages/backend/
COPY --from=builder /app/packages/backend/dist          ./packages/backend/dist
COPY --from=builder /app/packages/ai/package.json       ./packages/ai/
COPY --from=builder /app/packages/ai/dist               ./packages/ai/dist

# Frontend static files served by Express
COPY --from=builder /app/packages/frontend/dist ./packages/backend/dist/public

# Install production dependencies only
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Create directories for runtime data
RUN mkdir -p /data/binary-data /data/logs && \
    chown -R flowforge:flowforge /data /app

USER flowforge

EXPOSE 5678

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:5678/api/v1/health || exit 1

CMD ["node", "packages/backend/dist/index.js"]

# ─── Worker Image ──────────────────────────────────────────────────────────────
FROM production AS worker

CMD ["node", "packages/backend/dist/worker.js"]
