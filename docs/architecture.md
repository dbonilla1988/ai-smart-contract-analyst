# Architecture

## Pipeline

### Phase 4 (current)

```
Solidity Source
→ Input hardening + rate limit
→ AST parse + structural extraction
→ Security detectors + token indicators
→ Normalized findings
→ Optional grounded AI explanation
→ Privacy-safe observation log
→ AnalysisReport
```

## Package boundaries

- `@asca/shared` — schemas
- `@asca/analysis` — deterministic truth
- `@asca/llm` — explanation only (allowlisted models, grounded)
- `@asca/web` — UI + hardened API

## Hardening highlights

- Deterministic vs AI rate limits (in-memory; see deployment docs)
- Structured API errors (`INVALID_INPUT`, `PAYLOAD_TOO_LARGE`, `PARSE_ERROR`, `RATE_LIMITED`, …)
- Security headers via Next config
- AI cost caps + model allowlist
- Observation logs without source / prompts / keys

## Docs

- [detector-catalog.md](./detector-catalog.md)
- [ai-grounding.md](./ai-grounding.md)
- [deployment.md](./deployment.md)
