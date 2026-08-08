# MFD Talent Acquisition Tool

An internal platform for MFD's recruiting workflow: analyze how well a candidate's CV matches a job description, generate an ATS-optimized version of that CV **without inventing experience**, prepare recruiters for genuineness screening interviews, and process bulk CV drops against open positions. Direct sourcing from Naukri Resdex is planned behind the existing provider interface.

Core capabilities:

- **JD–CV match analysis** — deterministic, weighted scoring (skills, experience, keywords, education, ATS readiness) with an evidence-backed breakdown per criterion. LLM calls are content-hash cached, so re-running an analysis is cheap and reproducible.
- **ATS-optimized CV generation** — rewrites a CV to target a JD while enforcing integrity guardrails: every change carries a change log entry with evidence, and anything the generator refuses to change is recorded in integrity notes. Versions are tracked with full lineage.
- **Interview prep and genuineness screening** — generates targeted questions for the internal interview, including probes for skills the model inferred but could not verify. Recruiter-confirmed skills are recorded with evidence. Includes an HR screening-call deck: first-call verification questions over the candidate's experience, skills and projects that a non-technical recruiter can ask and judge (genuine-answer cues, red flags, follow-ups, logistics checklist, verdict guidance).
- **Naukri Search** — extract ready-to-paste Naukri Resdex search filters from a JD (boolean keyword string, experience range, candidate locations, salary band in lakhs, plus IT skills, designations, notice period and search tips), each with one-click copy.
- **WhatsApp pre-screening** — a bot runs the pre-call conversation on WhatsApp: consent, interest check, logistics (notice period, current/expected CTC, location, offers in hand), current-role claim confirmation, and booking the human screening call. Questions are deterministic templates; the LLM only interprets replies (with a no-AI heuristic fallback). Produces a pre-call brief with flags, auto-fills the candidate record, and advances the pipeline. Ships with a **simulated mode** so the flow can be tested in-app before Meta business verification.
- **Email pre-screening** — the same question flow over email (AWS SES SMTP, e.g. from `hiring@metafordata.com`): one concise email with a secure answer-form link plus the questions inline. Form submissions become the pre-call brief automatically; candidates who reply by email instead are handled via "Record email reply", which parses the reply against the questions. Runs in simulated mode until SES SMTP credentials are configured.
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

# Required — the stack needs an AI provider key and an encryption key:
#   ANTHROPIC_API_KEY   your Anthropic API key
#     — or —
#   GEMINI_API_KEY      your Google Gemini API key (set LLM_PROVIDER=gemini)
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

## Team access on your office network (LAN)

The app is multi-user (logins, roles, audit log) — teammates on the same network use it from the machine running Docker:

1. **Leave `NEXT_PUBLIC_API_URL` and `API_CORS_ORIGIN` empty in `.env`.** The app calls the API on whatever address the browser used, and the API accepts localhost plus private-network origins — so the same running stack serves both `http://localhost:3000` (you) and `http://<LAN IP>:3000` (your team), and keeps working when the machine's IP changes. Pinning an IP in `NEXT_PUBLIC_API_URL` is what breaks the app the moment that IP changes.
2. **Find this machine's LAN IP** — `ipconfig` on Windows (the IPv4 address of your Wi-Fi adapter, e.g. `192.168.1.50`). A router DHCP reservation keeps the URL stable across reboots.
3. **Start the stack**: `docker compose up -d --build`
4. **Allow the ports through the firewall** (Windows: usually only needed if the network is marked Public): allow inbound TCP **3000** and **4000**, or approve the Docker Desktop prompt.
5. **Create accounts for the team** — log in as admin → Settings → Users → add each recruiter with the `RECRUITER` role (use `VIEWER` for read-only access). Don't share the admin login.
6. Teammates open `http://192.168.1.50:3000` and sign in.

Postgres and MinIO are deliberately bound to `127.0.0.1` in docker-compose so only the app ports (3000/4000) are reachable from the network. Note the app serves plain HTTP — fine on a trusted office LAN, but put it behind a reverse proxy with TLS before exposing it any wider, and move to a small always-on server (or cloud VM) when "the laptop is off" becomes a problem.

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
| `API_CORS_ORIGIN` | _(empty)_ | Allowed browser origins, comma-separated (`*` allows all). Empty = localhost and private-network addresses on any port |
| `DATABASE_URL` | localhost Postgres | PostgreSQL connection string |
| `JWT_SECRET` | change-me placeholder | Access-token signing secret — set a long random value |
| `JWT_EXPIRES_IN` | `12h` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `ADMIN_EMAIL` | `admin@mfd.local` | Seeded admin email (only if no users exist) |
| `ADMIN_PASSWORD` | `ChangeMe123!` | Seeded admin password — change it |
| `ADMIN_NAME` | `MFD Admin` | Seeded admin display name |
| `ENCRYPTION_KEY` | — **required** | 32-byte base64 key for candidate PII encryption (`openssl rand -base64 32`) |
| `LLM_PROVIDER` | auto | AI provider: `anthropic` or `gemini`. When unset, inferred from which key is present (Anthropic wins if both) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (required when using the Anthropic provider) |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Claude model used for AI calls |
| `ANTHROPIC_EFFORT` | `medium` | Claude reasoning effort: `low` \| `medium` \| `high` |
| `GEMINI_API_KEY` | — | Google Gemini API key (required when using the Gemini provider) |
| `GEMINI_MODEL` | auto | Optional Gemini model pin. If unset or unavailable to your key, the best available model is auto-selected and logged |
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
| `NEXT_PUBLIC_API_URL` | _(empty)_ | Pins the API base URL into the web build. Empty (recommended) = derived at runtime from the address the browser used, so LAN IP changes need no rebuild |
| `NEXT_PUBLIC_API_PORT` | `4000` | Port used when deriving the API URL at runtime |

Scoring weights must sum to 100. Defaults can be overridden per deployment via env, and admins can adjust them at runtime through app settings.

## Email pre-screening setup (AWS SES)

Without SMTP credentials the channel runs in **simulated mode**: the composed email is stored on the conversation (viewable in the transcript), and the answer-form link works locally — so the whole flow is testable before touching SES.

To send real email:

1. In the AWS SES console, verify your domain (e.g. `metafordata.com`) and make sure the sending identity (`hiring@metafordata.com`) is covered by it. If the account is still in the SES **sandbox**, request production access first — sandbox accounts can only send to verified addresses.
2. Create SMTP credentials (SES console → SMTP settings → Create SMTP credentials) and set in `.env`: `SES_SMTP_HOST` (e.g. `email-smtp.ap-south-1.amazonaws.com` for Mumbai), `SES_SMTP_PORT=587`, `SES_SMTP_USER`, `SES_SMTP_PASS`, `MAIL_FROM=hiring@metafordata.com`.
3. Choose the answer form the email links to:
   - **External form (recommended while the app runs on localhost):** create a Google Form mirroring the pre-screen questions (link its responses to a Sheet) and set `PRESCREEN_FORM_URL` to the form's share link. Every pre-screening email then links there.
   - **Built-in form:** leave `PRESCREEN_FORM_URL` empty and set `WEB_PUBLIC_URL` to the web app's candidate-reachable public URL (not `localhost`) — emails link to the tokenized `/prescreen/<token>` page and answers complete the conversation automatically.
4. **Deliverability (do this or mail lands in spam):**
   - **DKIM** — SES console → your domain identity → *DKIM* tab → enable Easy DKIM and publish the three CNAME records in your DNS; wait until status shows *Successful*. This is the single biggest factor.
   - **Custom MAIL FROM domain** — identity → *Custom MAIL FROM domain* → set e.g. `mail.metafordata.com` and publish the MX + SPF TXT records SES shows. This makes SPF align with your domain instead of amazonses.com.
   - **DMARC** — publish a TXT record `_dmarc.metafordata.com` with value `v=DMARC1; p=none; rua=mailto:careers@metafordata.com`.
   - Verify the result: send yourself a pre-screen, open it in Gmail → ⋮ → *Show original* — SPF, DKIM and DMARC must all say **PASS** with `metafordata.com`.
   - Warm up: send low volumes at first, and ask early recipients to hit *Not spam* / reply — engagement trains the filters.

Candidate answers flow back three ways: the **built-in form** (structured, completes the conversation automatically), a **Google Form** (open the conversation, click *Record response…*, paste the response row from the linked Sheet), or a plain **email reply** (paste it the same way). Pasted text is interpreted by the LLM against the question list; nothing is auto-sent back to the candidate.

## WhatsApp pre-screening setup

Out of the box the feature runs in **simulated mode** (`WHATSAPP_MODE=simulated`): no WhatsApp account is needed, and the conversation can be exercised end-to-end from the candidate page (a "Simulator" input plays the candidate). Use this to tune the flow and train the team.

To go live on real WhatsApp (`WHATSAPP_MODE=meta`):

1. **Meta setup** — create a Meta Business account and verify the business, create an app at developers.facebook.com with the WhatsApp product, and register a dedicated business phone number (do not use a number already bound to a WhatsApp account). This yields `WHATSAPP_PHONE_NUMBER_ID` and a permanent `WHATSAPP_ACCESS_TOKEN` (create a system user token — the default token expires in 24h).
2. **Webhook** — the API must be reachable over public HTTPS. In the app's WhatsApp configuration, set the callback URL to `https://<your-host>/api/v1/whatsapp/webhook`, enter the same random string you put in `WHATSAPP_VERIFY_TOKEN`, and subscribe to the `messages` field. Set `WHATSAPP_APP_SECRET` (app settings → basic) so webhook payload signatures are verified.
3. **Invite template** — business-initiated messages require a pre-approved template. Create one (category: UTILITY) whose body takes three parameters — `{{1}}` candidate first name, `{{2}}` role title, `{{3}}` client name — including the consent line and YES/STOP instructions, and put its name in `WHATSAPP_TEMPLATE_INVITE`. Approval usually takes minutes to a day.
4. Restart with `WHATSAPP_MODE=meta`. Candidate replies arrive via the webhook; everything else works exactly as in simulated mode.

Compliance notes: the invite carries the DPDP consent language (a YES records consent on the candidate), STOP is honored instantly at any point, all messages are logged on the conversation record, and candidate erasure cascades to conversations and purges linked AI-cache entries.

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
