#!/bin/sh
# Entrypoint for the @mfd/api container.
# 1. Apply pending Prisma migrations (idempotent).
# 2. Seed the initial admin user (no-op if any user already exists).
# 3. Start the NestJS server (exec so it receives signals as PID 1).
set -e

echo "[entrypoint] Applying database migrations..."
prisma migrate deploy --schema prisma/schema.prisma

echo "[entrypoint] Seeding database (skips if users already exist)..."
node prisma/seed.js

echo "[entrypoint] Starting API..."
exec node dist/main.js
