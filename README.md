# AI Smart Contract Analyst

Deterministic-first Solidity analysis with an optional grounded AI explanation layer.

> Experimental developer tool for identifying and explaining potential smart-contract risks. Results are not a substitute for a professional security audit.

## Purpose

Paste Solidity source and receive:

1. Structural extraction (contracts, functions, inheritance, …)
2. Deterministic / heuristic security findings with evidence
3. ERC-20 / ERC-721-like token interface indicators (not findings)
4. Optional AI narrative that **only explains** existing findings

The LLM is **not** the vulnerability scanner.

## Architecture

```
Solidity Source
→ Parse / Extract
→ Deterministic Detectors + Token Indicators
→ Normalized Findings
→ Optional Grounded AI Explanation
→ Report
```

Packages:

| Package | Role |
|---------|------|
| `@asca/shared` | Zod schemas / shared types |
| `@asca/analysis` | Parse → extract → detectors → indicators → report |
| `@asca/llm` | Provider interface, OpenAI adapter, grounding |
| `@asca/web` | Next.js UI + `POST /api/analyze` |

## Deterministic-first principle

- Detectors own findings, severity, confidence, and evidence
- AI may summarize / group / prioritize and must cite finding IDs
- AI cannot create, remove, or rewrite findings
- AI failure never blocks the deterministic report

See [docs/ai-grounding.md](docs/ai-grounding.md).

## V1 detector coverage

Security detectors:

- `tx-origin`, `selfdestruct`, `delegatecall`, `low-level-call`
- `privileged-function`, `floating-pragma`
- `unrestricted-mint-admin`, `unchecked-external-call`

Token-interface heuristics (→ `tokenIndicators[]`):

- ERC-20-like, ERC-721-like

Coverage is intentionally limited. Absence of findings does **not** imply security.

Catalog: [docs/detector-catalog.md](docs/detector-catalog.md)

## Security / privacy boundaries

- Plain-text source only; size-capped; control-character rejection
- No Solidity execution, no `solc`, no shell-out
- Deterministic path makes no network calls
- Full source is not sent to the AI provider (bounded finding/evidence JSON only)
- API keys are server-side only
- Privacy-safe request logs (hash + sizes + timings — never full source)
- In-memory rate limits (stricter for AI)

## Current limitations

- Heuristic detectors; not a professional audit
- In-memory rate limits are per-instance (not global on serverless)
- No Slither / on-chain / address analysis yet
- Public high-traffic deploy still needs distributed rate limiting

## Local setup

Requirements: Node.js ≥ 20, pnpm 10+

```bash
pnpm install
cp .env.example .env.local   # optional OPENAI_API_KEY
pnpm dev
```

App: [http://localhost:3000](http://localhost:3000)

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Deployment

Vercel-oriented instructions: [docs/deployment.md](docs/deployment.md)

Deploy from the monorepo root with `pnpm build` (builds workspace packages, then `@asca/web`). Deterministic analysis works with zero environment variables; `OPENAI_API_KEY` is optional for AI interpretation.

## Disclaimer

Experimental developer tool for identifying and explaining potential smart-contract risks. Results are not a substitute for a professional security audit.
