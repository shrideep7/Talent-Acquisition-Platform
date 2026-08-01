# MFD Talent Acquisition Tool

An internal platform for MFD's recruiting workflow: analyze how well a candidate's CV matches a job description, generate an ATS-optimized version of that CV **without inventing experience**, prepare recruiters for genuineness screening interviews, and process bulk CV drops against open positions. Direct sourcing from Naukri Resdex is planned behind the existing provider interface.

Core capabilities:

- **JD–CV match analysis** — deterministic, weighted scoring (skills, experience, keywords, education, ATS readiness) with an evidence-backed breakdown per criterion. LLM calls are content-hash cached, so re-running an analysis is cheap and reproducible.
- **ATS-optimized CV generation** — rewrites a CV to target a JD while enforcing integrity guardrails: every change carries a change log entry with evidence, and anything the generator refuses to change is recorded in integrity notes. Versions are tracked with full lineage.
- **Interview prep and genuineness screening** — generates targeted questions for the internal interview, including probes for skills the model inferred but could not verify. Recruiter-confirmed skills are recorded with evidence.
- **Bulk sourcing** — upload a batch of CVs against a JD; each file is parsed (with OCR fallback for scanned PDFs), scored, and fed into the pipeline.
- **Pipeline tracking** — per-JD candidate pipeline from `SOURCED` through `SENT_TO_CLIENT`.

## Architecture

pnpm workspace monorepo:

| Path | Package | Description |
| --- | --- | --- |
| `apps/api` | `@mfd/api` | NestJS REST API (`/api/v1`), Prisma + PostgreSQL, S3-compatible document storage, Anthropic-powered analysis, Swagger at `/docs` |
| `apps/web` | `@mfd/web` | Next.js 14 App Router frontend (standalone output), Tailwind + Radix UI |
| `packages/shared` | `@mfd/shared` | Shared Zod schemas and types (parsed JD/CV, match breakdown, generated CV contracts) used by both apps |

Supporting services: PostgreSQL 16 (data), MinIO (S3-compatible storage for uploaded and exported documents), Chromium (PDF export), Tesseract (OCR fallback).

## Quick start (Docker Compose)

Prerequisites: Docker with the Compose plugin.

```bash
cp .env.example .env

# Required — the stack refuses to start without these two:
#   ANTHROPIC_API_KEY   your Anthropic API key
#   ENCRYPTION_KEY      candidate-PII encryption key:
openssl rand -base64 32   # paste the output into ENCRYPTION_KEY in .env

docker compose up --build
```

This starts PostgreSQL, MinIO (plus a one-shot job that creates the `mfd-documents` bucket), the API, and the web app. The API container applies Prisma migrations and seeds the initial admin user on startup.

| What | Where |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| API docs (Swagger) | http://localhost:4000/docs |
| MinIO console | http://localhost:9001 |
| Default admin login | `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (defaults: `admin@mfd.local` / `ChangeMe123!` — change them) |

## Local development

```bash
pnpm install

# Start only the backing services in Docker:
docker compose up -d postgres minio minio-init

# Point DATABASE_URL / S3_ENDPOINT at localhost (the .env.example defaults already do),
# then prepare the database:
pnpm --filter @mfd/api prisma:generate
pnpm --filter @mfd/api prisma:migrate   # prisma migrate deploy
pnpm seed                               # creates the admin user if none exists

# Build the shared package once (the apps import its compiled output):
pnpm --filter @mfd/shared build

# Run the apps (separate terminals):
pnpm dev:api   # NestJS watch mode on :4000
pnpm dev:web   # Next.js dev server on :3000
```

## Environment variables

All configuration lives in `.env` (see `.env.example`). Docker Compose reads it automatically and provides development fallbacks for everything except the two secrets marked required.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode |
| `API_PORT` | `4000` | API listen port |
| `API_CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin(s), comma-separated |
| `DATABASE_URL` | localhost Postgres | PostgreSQL connection string |
| `JWT_SECRET` | change-me placeholder | Access-token signing secret — set a long random value |
| `JWT_EXPIRES_IN` | `12h` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `ADMIN_EMAIL` | `admin@mfd.local` | Seeded admin email (only if no users exist) |
| `ADMIN_PASSWORD` | `ChangeMe123!` | Seeded admin password — change it |
| `ADMIN_NAME` | `MFD Admin` | Seeded admin display name |
| `ENCRYPTION_KEY` | — **required** | 32-byte base64 key for candidate PII encryption (`openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | — **required** | Anthropic API key for analysis/generation |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Model used for AI calls |
| `ANTHROPIC_EFFORT` | `medium` | Reasoning effort: `low` \| `medium` \| `high` |
| `S3_ENDPOINT` | `http://localhost:9000` | S3-compatible endpoint (`http://minio:9000` inside Compose) |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ACCESS_KEY` | `mfd-minio` | S3 access key (also MinIO root user) |
| `S3_SECRET_KEY` | `mfd-minio-secret` | S3 secret key (also MinIO root password) |
| `S3_BUCKET` | `mfd-documents` | Document bucket |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style addressing (required for MinIO) |
| `CHROMIUM_PATH` | auto-detected / `/usr/bin/chromium` in Docker | Chromium binary for PDF export |
| `OCR_ENABLED` | `true` | Tesseract OCR fallback for scanned PDFs |
| `SCORE_WEIGHT_SKILLS` | `35` | Scoring weight: skills |
| `SCORE_WEIGHT_EXPERIENCE` | `25` | Scoring weight: experience |
| `SCORE_WEIGHT_KEYWORDS` | `20` | Scoring weight: keywords |
| `SCORE_WEIGHT_EDUCATION` | `10` | Scoring weight: education |
| `SCORE_WEIGHT_ATS` | `10` | Scoring weight: ATS readiness |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | API base URL baked into the web build (must be browser-reachable) |

Scoring weights must sum to 100. Defaults can be overridden per deployment via env, and admins can adjust them at runtime through app settings.

## Skill integrity model

Every skill the analyzer attributes to a candidate is placed in one of four match tiers, so no claim ever silently outruns its evidence (skills with no support are marked absent):

| Tier | Meaning |
| --- | --- |
| `EXPLICIT` | Stated verbatim in the CV |
| `TERMINOLOGY` | Present under an equivalent name (e.g. "K8s" for Kubernetes) |
| `INFERRED` | Strongly implied by documented work, with the model's rationale recorded |
| `UNVERIFIED_POSSIBLE` | Plausible but unproven — never written into a generated CV; instead it feeds the genuineness-screening question set |

The CV generator only uses tiers backed by evidence, and the interview prep flow exists to convert `INFERRED`/`UNVERIFIED_POSSIBLE` claims into recruiter-verified skills (with recorded evidence) or to reject them.

## Data protection (DPDP)

- **PII encryption at rest** — candidate email and phone are stored AES-256-GCM encrypted; a salted hash of the email supports deduplication without decryption. Sourcing credentials are stored as encrypted payloads.
- **Consent capture** — each candidate carries a consent status (`PENDING` / `GRANTED` / `REVOKED`) with timestamp and note.
- **Erasure** — a hard-delete endpoint removes a candidate and all dependent records (documents, analyses, CV versions, interview preps, pipeline entries, verified skills) **and purges cached AI responses linked to the candidate**. If object storage is unreachable during erasure, the orphaned file keys are recorded in the audit entry for manual cleanup.
- **Consent in bulk mode** — the bulk-upload screen includes a batch-level consent attestation; candidates uploaded without it stay `PENDING` until consent is recorded individually.
- **Audit trail** — sensitive actions are written to an audit log with actor, entity, and IP. Audit entries deliberately survive candidate erasure as a processing record; they contain file names and IDs but no CV content or contact details.

### Known trade-offs

- Extracted CV text (`cv_documents.parsedText` / `parsedCv`) is stored unencrypted at the application level so keyword matching and search stay fast — it is removed by erasure, and production deployments should additionally enable database/disk-level encryption.
- Scoring, generation, and prep calls run regardless of consent status; if your legal review requires consent-gated processing, gate the analysis endpoints on `consentStatus === 'GRANTED'`.
- The app fails fast at startup in production if `ENCRYPTION_KEY` or `JWT_SECRET` is missing.

## Roles

| Role | Permissions |
| --- | --- |
| `ADMIN` | Everything, plus user management, app settings (e.g. scoring weights), sourcing credentials |
| `RECRUITER` | Day-to-day work: JDs, candidates, analyses, CV generation, interview prep, pipeline |
| `VIEWER` | Read-only access |

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| Phase 1 | JD–CV match analyzer, ATS-optimized CV generator with integrity guardrails, interview prep and genuineness screening | ✅ |
| Phase 2 | Bulk sourcing fallback (batch CV upload, parse, score) and pipeline tracking | ✅ |
| Phase 3 | Naukri Resdex integration via the existing sourcing-provider interface, dashboard metrics | ⏳ |
