# Deployment (Vercel)

## Recommended Vercel settings

| Setting | Value |
|---------|--------|
| Root Directory | repository root (`.` / `ai-smart-contract-analyst`) |
| Framework Preset | Next.js |
| Install Command | `pnpm install` |
| Build Command | `pnpm build` |
| Output Directory | *(leave default — Next.js)* |
| Node.js | ≥ 20 |

This is a **pnpm workspace**. Build from the **repo root** so `@asca/shared`, `@asca/analysis`, and `@asca/llm` are compiled before `@asca/web`.

Commit `pnpm-lock.yaml` and keep `packageManager` in root `package.json` so Vercel selects pnpm.

**Production Vercel project settings (required for this monorepo):**

| Setting | Value |
|---------|--------|
| Root Directory | `apps/web` |
| Install Command | `cd ../.. && pnpm install` |
| Build Command | `cd ../.. && pnpm build` |
| Framework | Next.js |

Reason: Next.js lives in `apps/web`, but `@asca/*` packages export from `dist/` and must be built via the root `pnpm build` script first. `apps/web/vercel.json` pins the install/build commands above.

## Environment variables

| Name | Required | Notes |
|------|----------|--------|
| `OPENAI_API_KEY` | No | Required only for AI interpretation |
| `OPENAI_MODEL` | No | Must be on allowlist if set (`gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1`) |

Deterministic analysis works with **zero** env vars.

Never set `NEXT_PUBLIC_OPENAI_API_KEY`.

## API route

- `POST /api/analyze` — Node.js runtime (`export const runtime = "nodejs"`)
- Compatible with Vercel serverless functions
- Returns structured errors; AI failure still returns HTTP 200 with deterministic report

## Rate limiting limitations (important)

V1 uses an **in-memory per-instance** sliding window:

- Deterministic: 30 requests / minute / client IP
- AI-enabled: 5 requests / minute / client IP

On Vercel serverless:

- each isolate has its own memory
- limits are **not globally distributed**
- cold starts reset counters

This is acceptable for an early public demo. Before serious traffic, replace with Redis / Upstash / edge rate limiting.

## Security headers

Configured in `apps/web/next.config.ts`:

- CSP (same-origin; `style-src`/`script-src` allow `'unsafe-inline'` for Next App Router practicality)
- **Development only:** CSP also allows `'unsafe-eval'` because `next dev` webpack uses `eval` for modules. Without it, the client bundle fails to load and UI buttons appear dead.
- **Production:** `'unsafe-eval'` is omitted
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy` locked down
- HSTS: enable at the CDN/edge when the site is HTTPS-only (not set in-app to avoid local HTTP issues)

## Pre-deploy checklist

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
2. Set `OPENAI_API_KEY` only if AI should be available
3. Confirm allowlisted `OPENAI_MODEL` if overridden
4. Smoke-test `/api/analyze` with and without AI
5. Confirm rate-limit 429 responses
6. Confirm no secrets in client bundle
7. Add application-level global rate limiting before high traffic

## Out of scope (still)

- Portfolio / davidbonilla.dev integration
- Auth, database, Slither, address analysis
