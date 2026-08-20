import type { Confidence, ContractUnit, Evidence } from "@asca/shared";

const ERC20_CORE = [
  "totalSupply()",
  "balanceOf(address)",
  "transfer(address,uint256)",
  "allowance(address,address)",
  "approve(address,uint256)",
  "transferFrom(address,address,uint256)",
] as const;

const ERC20_EVENTS = ["Transfer(address,address,uint256)", "Approval(address,address,uint256)"] as const;

const ERC721_CORE = [
  "balanceOf(address)",
  "ownerOf(uint256)",
  "safeTransferFrom(address,address,uint256)",
  "safeTransferFrom(address,address,uint256,bytes)",
  "transferFrom(address,address,uint256)",
  "approve(address,uint256)",
  "setApprovalForAll(address,bool)",
  "getApproved(uint256)",
  "isApprovedForAll(address,address)",
] as const;

const ERC721_DISTINCT = [
  "ownerOf(uint256)",
  "setApprovalForAll(address,bool)",
  "getApproved(uint256)",
  "isApprovedForAll(address,address)",
  "safeTransferFrom(address,address,uint256)",
  "safeTransferFrom(address,address,uint256,bytes)",
] as const;

const ERC721_EVENTS = [
  "Transfer(address,address,uint256)",
  "Approval(address,address,uint256)",
  "ApprovalForAll(address,address,bool)",
] as const;

export interface TokenIndicatorResult {
  standard: string;
  confidence: Confidence;
  evidence: Evidence[];
}

function unitSignatures(unit: ContractUnit): Set<string> {
  return new Set(
    unit.functions
      .filter((f) => f.kind === "function")
      .map((f) => f.signature)
      .filter((s): s is string => !!s),
  );
}

function unitEventSignatures(unit: ContractUnit): Set<string> {
  return new Set(
    (unit.events ?? [])
      .map((e) => e.signature ?? `${e.name}(${e.parameters.join(",")})`)
      .filter(Boolean),
  );
}

function matchCount(have: Set<string>, want: readonly string[]): string[] {
  return want.filter((s) => have.has(s));
}

function erc20Confidence(fnHits: number, eventHits: number): Confidence | null {
  // Require enough overlap to avoid aggressive false positives on tiny overlaps.
  if (fnHits >= 5 && eventHits >= 1) return "high";
  if (fnHits >= 6) return "high";
  if (fnHits >= 4) return "medium";
  if (fnHits >= 3) return "low";
  return null;
}

function erc721Confidence(
  fnHits: number,
  distinctHits: number,
  eventHits: number,
): Confidence | null {
  // Need at least one ERC-721-distinct signal so ERC-20 overlap alone is insufficient.
  if (distinctHits === 0) return null;
  if (fnHits >= 6 && distinctHits >= 2 && eventHits >= 1) return "high";
  if (fnHits >= 5 && distinctHits >= 2) return "high";
  if (fnHits >= 4 && distinctHits >= 1) return "medium";
  if (fnHits >= 3 && distinctHits >= 1) return "low";
  return null;
}

function buildEvidence(
  unit: ContractUnit,
  matchedFns: string[],
  matchedEvents: string[],
  label: string,
): Evidence[] {
  const evidence: Evidence[] = [
    {
      kind: "pattern_match",
      description: `${label} on ${unit.kind} ${unit.name}`,
      symbol: unit.name,
    },
  ];
  for (const sig of matchedFns) {
    evidence.push({
      kind: "symbol",
      description: `function ${sig}`,
      symbol: `${unit.name}.${sig}`,
    });
  }
  for (const ev of matchedEvents) {
    evidence.push({
      kind: "symbol",
      description: `event ${ev}`,
      symbol: `${unit.name}.${ev}`,
    });
  }
  return evidence;
}

/**
 * Heuristic ERC-20 / ERC-721 interface indicators.
 * These are NOT security findings and must not be pushed into findings[].
 */
export function detectTokenIndicators(units: ContractUnit[]): TokenIndicatorResult[] {
  const out: TokenIndicatorResult[] = [];

  for (const unit of units) {
    const sigs = unitSignatures(unit);
    const events = unitEventSignatures(unit);

    const erc20Fns = matchCount(sigs, ERC20_CORE);
    const erc20Events = matchCount(events, ERC20_EVENTS);
    const erc20Conf = erc20Confidence(erc20Fns.length, erc20Events.length);
    if (erc20Conf) {
      out.push({
        standard: "ERC-20",
        confidence: erc20Conf,
        evidence: buildEvidence(unit, erc20Fns, erc20Events, "ERC-20-like interface detected"),
      });
    }

    const erc721Fns = matchCount(sigs, ERC721_CORE);
    const erc721Distinct = matchCount(sigs, ERC721_DISTINCT);
    const erc721Events = matchCount(events, ERC721_EVENTS);
    const erc721Conf = erc721Confidence(
      erc721Fns.length,
      erc721Distinct.length,
      erc721Events.length,
    );
    if (erc721Conf) {
      out.push({
        standard: "ERC-721",
        confidence: erc721Conf,
        evidence: buildEvidence(unit, erc721Fns, erc721Events, "ERC-721-like interface detected"),
      });
    }
  }

  return out;
}
