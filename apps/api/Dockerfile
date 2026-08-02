# syntax=docker/dockerfile:1
# =============================================================================
# @mfd/api — NestJS + Prisma API image
# Build from the REPO ROOT:  docker build -f apps/api/Dockerfile .
# =============================================================================

# ---------------------------------------------------------------------------
# base: node 20 with pnpm 10 via corepack
# ---------------------------------------------------------------------------
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# ---------------------------------------------------------------------------
# deps: install workspace dependencies for @mfd/api (+ its workspace deps).
# Only manifests are copied so this layer caches until a manifest changes.
# NOTE: the root package.json declares pnpm.onlyBuiltDependencies, so a plain
# `pnpm install` runs the required build scripts (prisma engines, etc.).
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@mfd/api..."

# ---------------------------------------------------------------------------
# build: compile shared lib, generate the Prisma client, compile the API,
# then produce a pruned production bundle with `pnpm deploy`.
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @mfd/shared build \
 && pnpm --filter @mfd/api exec prisma generate \
 && pnpm --filter @mfd/api build

# Compile the seed script to plain JS so the runtime image does not need ts-node.
RUN cd apps/api \
 && ./node_modules/.bin/tsc prisma/seed.ts --outDir prisma \
      --module commonjs --target ES2022 --esModuleInterop --skipLibCheck

# Standalone production bundle: project files + prod node_modules only.
# (--legacy keeps pnpm v9 deploy semantics under pnpm v10.)
RUN pnpm --filter @mfd/api --prod deploy --legacy /out/api

# `pnpm deploy` installs from the store, so it does not carry the generated
# Prisma client — regenerate it inside the deployed node_modules.
RUN cd /out/api \
 && /repo/apps/api/node_modules/.bin/prisma generate --schema prisma/schema.prisma

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime

# Chromium (PDF export via playwright-core) + Tesseract (OCR fallback).
# openssl/ca-certificates: required by the Prisma engines and outbound TLS
# (node:20-slim does not ship libssl).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      tesseract-ocr \
      fonts-liberation \
      openssl \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Prisma CLI for `prisma migrate deploy` at container start.
# Pinned to the same version as @prisma/client in the lockfile.
RUN npm install -g prisma@5.22.0 && npm cache clean --force

ENV NODE_ENV=production
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV OCR_ENABLED=true
# Note: Chromium sandbox flags (--no-sandbox etc.) are passed at launch time by
# the application code; CHROMIUM_FLAGS below is informational/override only.
ENV CHROMIUM_FLAGS="--no-sandbox --disable-dev-shm-usage"

WORKDIR /app
COPY --from=build --chown=node:node /out/api /app
# Strip Windows CRLF line endings (a checkout with core.autocrlf=true breaks
# the shebang: "exec: /app/entrypoint.sh: not found"), then mark executable.
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

USER node
EXPOSE 4000
CMD ["/app/entrypoint.sh"]
