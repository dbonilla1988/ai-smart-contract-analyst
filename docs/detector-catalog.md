# Detector catalog

Phase 2B completes the V1 deterministic/heuristic analysis layer.

## Finding ID scheme

```
<detectorId>:<sourceHash12>:<anchor>
```

- `sourceHash12` — first 12 hex chars of SHA-256 of the analyzed source
- `anchor` — usually the 1-based start line, or a stable contract/symbol key for grouped findings

Same source + same detector ⇒ same IDs across runs.

## Security detectors (populate `findings[]`)

### `tx-origin`

| Field | Value |
|-------|--------|
| Description | Detects `tx.origin`, especially in `require` / `assert` / `if` authorization logic |
| Default severity | `medium` (auth context); `informational` (non-auth reference) |
| Confidence | `high` (auth); `medium` (non-auth) |
| Evidence | Source span/snippet of the `tx.origin` usage |
| Example trigger | `require(tx.origin == owner)` |
| False-positive considerations | Presence alone is not exploitability. Non-auth uses (e.g. events) are lower severity. |
| Known limitations | Does not prove phishing exploit paths; does not track dataflow into later conditions |

### `selfdestruct`

| Field | Value |
|-------|--------|
| Description | Detects `selfdestruct(...)` and legacy `suicide(...)` |
| Default severity | `medium` |
| Confidence | `high` |
| Evidence | Call span + containing function symbol |
| Example trigger | `selfdestruct(payable(owner))` |
| False-positive considerations | Finding is retained even when gated by `onlyOwner` (privilege context is noted). Not claimed as guaranteed code deletion on modern EVM. |
| Known limitations | Does not model EIP-6780 / chain-specific SELFDESTRUCT semantics beyond cautious wording |

### `delegatecall`

| Field | Value |
|-------|--------|
| Description | Detects `.delegatecall(...)` |
| Default severity | `high` |
| Confidence | `high` (presence) |
| Evidence | Member-access span + containing function |
| Example trigger | `impl.delegatecall(data)` |
| False-positive considerations | Not inherently a vulnerability; wording stresses target trust / storage context |
| Known limitations | Does not prove malicious target or storage collision |

### `low-level-call`

| Field | Value |
|-------|--------|
| Description | Detects `.call` / `.staticcall` / `.callcode` (excludes `delegatecall`) |
| Default severity | `informational` (call/staticcall); `low` (callcode) |
| Confidence | `high` (presence) |
| Evidence | Member-access span + containing function |
| Example trigger | `target.call(data)` |
| False-positive considerations | Does not equate `.transfer`/`.send` with raw call severity; does not duplicate `delegatecall` findings |
| Known limitations | Presence only — return handling is covered by `unchecked-external-call` |

### `privileged-function`

| Field | Value |
|-------|--------|
| Description | Surfaces public/external functions with clear privilege guards |
| Default severity | `informational` |
| Confidence | `high` |
| Evidence | Function spans + modifier / `msg.sender == owner` reason text |
| Example trigger | `function mint(...) external onlyOwner` |
| False-positive considerations | Informational admin-surface map — not a vulnerability claim. Grouped by contract. |
| Known limitations | Only direct structural patterns |

### `floating-pragma`

| Field | Value |
|-------|--------|
| Description | Detects floating Solidity compiler constraints |
| Default severity | `informational` |
| Confidence | `high` |
| Evidence | Pragma directive span |
| Example trigger | `pragma solidity ^0.8.20;` |
| False-positive considerations | Exact pins are not flagged. Not exploitable by itself. |
| Known limitations | Does not validate build-tool pinning |

### `unrestricted-mint-admin`

| Field | Value |
|-------|--------|
| Description | Heuristic for externally callable mint/admin-style functions without a recognized access-control pattern |
| Default severity | `high` (mint-style); `medium` (admin/config-style) |
| Confidence | `high` when name + body evidence align; otherwise `medium`/`high` by signal strength |
| Evidence | Function symbol/visibility, body mutation or sensitive call, note that no guard was recognized |
| Example trigger | `function mint(address to, uint256 amount) external { ... }` with no `onlyOwner` / `msg.sender` gate |
| False-positive considerations | Wording uses “no access-control pattern recognized by this analyzer” — not “anyone can definitely exploit this”. Custom auth may be missed. |
| Known limitations | Name/body heuristics only; no inter-contract role analysis; skips interfaces / view-pure / internal-private |

### `unchecked-external-call`

| Field | Value |
|-------|--------|
| Description | Detects low-level call success values that appear ignored (return-value handling) |
| Default severity | ignored `.call`/`delegatecall`: `medium`; ignored `.staticcall`: `low`; assigned-but-unresolved: `low`/`informational` |
| Confidence | `high` when clearly ignored; `medium` when assigned but check not resolved locally |
| Evidence | Call expression span + containing function |
| Example trigger | `target.call(data);` or `(bool ok,) = target.call(data);` without `require(ok)` / `if (ok)` |
| False-positive considerations | Does not duplicate the mere-presence `delegatecall` / `low-level-call` findings; if success is structurally checked, no finding |
| Known limitations | Local structural analysis only — no full dataflow / helper-function resolution |

## Token Interface Indicators (populate `tokenIndicators[]`)

These are **not** security findings. They never contribute to `findings[]` or `severityCounts`.

### ERC-20 heuristic (`standard: "ERC-20"`)

Core signatures considered:

- `totalSupply()`, `balanceOf(address)`, `transfer(address,uint256)`, `allowance(address,address)`, `approve(address,uint256)`, `transferFrom(address,address,uint256)`

Events: `Transfer(address,address,uint256)`, `Approval(address,address,uint256)`

Confidence:

| Confidence | Rule (approx.) |
|------------|----------------|
| high | ≥5/6 core functions + ≥1 expected event, or all 6 functions |
| medium | ≥4/6 core functions |
| low | ≥3/6 core functions |

Wording: “ERC-20-like interface detected” — **not** standards compliance.

### ERC-721 heuristic (`standard: "ERC-721"`)

Core signatures considered include ERC-721 surface plus distinct signals such as `ownerOf`, `setApprovalForAll`, `getApproved`, `isApprovedForAll`, `safeTransferFrom`.

Events: `Transfer`, `Approval`, `ApprovalForAll`

Confidence requires at least one ERC-721-distinct signature so pure ERC-20 overlap is insufficient.

| Confidence | Rule (approx.) |
|------------|----------------|
| high | strong function overlap + ≥2 distinct + event support |
| medium | ≥4 matches with ≥1 distinct |
| low | ≥3 matches with ≥1 distinct |

### Conflicts / mixed surfaces

A unit may emit **both** ERC-20 and ERC-721 indicators with independent confidence/evidence. Generic tiny overlaps are avoided by minimum signature thresholds.

### Limitations

- Heuristic signature/event matching only
- Public mapping getters may be invisible if not present as explicit functions in the AST extract
- Not a certification of EIP compliance
- Interfaces and implementations are both eligible when signature thresholds are met
