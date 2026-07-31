# syntax=docker/dockerfile:1
# =============================================================================
# @mfd/web — Next.js 14 (standalone output) image
# Build from the REPO ROOT:  docker build -f apps/web/Dockerfile .
# NEXT_PUBLIC_* values are inlined at build time — pass NEXT_PUBLIC_API_URL as
# a build arg to point the UI at a non-default API origin.
# =============================================================================

# ---------------------------------------------------------------------------
# base: node 20 with pnpm 10 via corepack
# ---------------------------------------------------------------------------
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# ---------------------------------------------------------------------------
# deps: install workspace dependencies for @mfd/web (+ its workspace deps)
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@mfd/web..."

# ---------------------------------------------------------------------------
# build: shared lib first, then the Next.js standalone build
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo

ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm --filter @mfd/shared build \
 && pnpm --filter @mfd/web build

# The app has no public/ directory today; create one so the runtime COPY
# below never fails if assets are added later.
RUN mkdir -p apps/web/public

# ---------------------------------------------------------------------------
# runtime: minimal standalone server.
# In a monorepo, Next's standalone output mirrors the workspace layout, so the
# server entry lives at .next/standalone/apps/web/server.js.
# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
