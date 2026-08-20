import type { Finding } from "@asca/shared";
import type {
  ASTNode,
  BinaryOperation,
  FunctionDefinition,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { Detector, DetectorContext } from "./types.js";
import {
  hasRecognizedAccessControl,
  walkAstChildren,
} from "./accessControl.js";
import {
  buildFinding,
  containingSymbol,
  evidenceFromLoc,
  functionLabel,
  makeFindingId,
  walkScoped,
} from "./utils.js";

const MINT_NAME = /\b(mint|_mint|safeMint)\b/i;
const ADMIN_NAME =
  /\b(burn|pause|unpause|upgrade|setOwner|transferOwnership|setFee|setAdmin|setOracle|setImplementation|setConfig|configure|setTreasury|grantRole|revokeRole|setRole|withdraw|rescue)\b/i;

const SENSITIVE_STATE =
  /^(owner|admin|fee|protocolFee|treasury|oracle|implementation|config|paused|minter|guardian)$/i;

const SENSITIVE_INTERNAL_CALLS = new Set([
  "_mint",
  "_burn",
  "_pause",
  "_unpause",
  "_setOwner",
  "_upgradeTo",
  "_authorizeUpgrade",
]);

type SensitiveKind = "mint" | "admin";

interface BodySignal {
  kind: SensitiveKind;
  description: string;
  loc?: FunctionDefinition["loc"];
}

function nameSuggestsSensitive(name: string): SensitiveKind | null {
  if (MINT_NAME.test(name)) return "mint";
  if (ADMIN_NAME.test(name) || /^set[A-Z]/.test(name)) return "admin";
  return null;
}

function collectBodySignals(fn: FunctionDefinition): BodySignal[] {
  if (!fn.body) return [];
  const signals: BodySignal[] = [];

  walkAstChildren(fn.body as unknown as ASTNode, (node) => {
    if (node.type === "FunctionCall") {
      const expr = (node as { expression?: ASTNode }).expression;
      if (expr?.type === "Identifier") {
        const callName = (expr as { name: string }).name;
        if (SENSITIVE_INTERNAL_CALLS.has(callName) || MINT_NAME.test(callName)) {
          signals.push({
            kind: callName.toLowerCase().includes("mint") ? "mint" : "admin",
            description: `body calls ${callName}(...)`,
            loc: node.loc,
          });
        }
      }
    }

    if (node.type === "BinaryOperation") {
      const bin = node as BinaryOperation;
      if (bin.operator === "=" && bin.left.type === "Identifier") {
        const leftName = (bin.left as { name: string }).name;
        if (SENSITIVE_STATE.test(leftName)) {
          signals.push({
            kind: leftName.toLowerCase().includes("owner") || leftName.toLowerCase() === "admin"
              ? "admin"
              : "admin",
            description: `assigns sensitive state variable ${leftName}`,
            loc: node.loc,
          });
        }
      }
    }
  });

  return signals;
}

function isStateChanging(fn: FunctionDefinition): boolean {
  const mut = fn.stateMutability;
  return mut !== "pure" && mut !== "view" && mut !== "constant";
}

export const unrestrictedMintAdminDetector: Detector = {
  id: "unrestricted-mint-admin",
  title: "Unrestricted mint / admin capability",
  description:
    "Heuristic for externally callable mint/admin-style functions without recognized access control.",
  run(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<string>();

    walkScoped(ctx.parsed.ast, {
      FunctionDefinition(node, walkCtx) {
        if (walkCtx.contractKind === "interface") return;
        if (node.visibility !== "public" && node.visibility !== "external") return;
        if (node.isConstructor || node.isReceiveEther || node.isFallback) return;
        if (!isStateChanging(node)) return;
        if (!node.body) return;
        if (hasRecognizedAccessControl(node)) return;

        const name = functionLabel(node);
        const nameKind = nameSuggestsSensitive(name);
        const bodySignals = collectBodySignals(node);
        if (!nameKind && bodySignals.length === 0) return;

        const kind: SensitiveKind =
          nameKind === "mint" || bodySignals.some((s) => s.kind === "mint") ? "mint" : "admin";

        const symbol = containingSymbol(walkCtx) ?? name;
        const line = node.loc?.start.line ?? 0;
        const key = `${symbol}:${line}`;
        if (seen.has(key)) return;
        seen.add(key);

        const evidence = [
          evidenceFromLoc(
            ctx.source,
            node.loc,
            `${node.visibility} ${name} — no access-control pattern recognized by this analyzer`,
            symbol,
          ),
          ...bodySignals.slice(0, 3).map((s) =>
            evidenceFromLoc(ctx.source, s.loc, s.description, symbol),
          ),
        ];

        const isMint = kind === "mint";
        findings.push(
          buildFinding({
            id: makeFindingId("unrestricted-mint-admin", ctx.source, `${name}-${line || symbol}`),
            detectorId: "unrestricted-mint-admin",
            title: isMint
              ? `Potentially unrestricted mint-style function: ${name}`
              : `Potentially unrestricted admin/config function: ${name}`,
            severity: isMint ? "high" : "medium",
            confidence: bodySignals.length > 0 || nameKind ? "high" : "medium",
            category: "access-control",
            description: isMint
              ? `Detected externally callable mint-style function ${symbol} with no access-control pattern recognized by this analyzer. Missing recognized guards can introduce privilege risk if the function is reachable without authorization. This is a heuristic signal — absence of a detected guard is not proof that anyone can definitely exploit the function.`
              : `Detected externally callable admin/configuration-style function ${symbol} with no access-control pattern recognized by this analyzer. Unrestricted configuration surfaces are security-sensitive and require review. This is a heuristic signal, not a proven exploit.`,
            remediation:
              "Restrict sensitive mint/admin functions with clear access-control modifiers or explicit caller authorization. Prefer role-based guards, timelocks/multisigs for high-impact admin ops, and emit events for privileged state changes.",
            evidence,
            tags: [
              "unrestricted",
              isMint ? "mint" : "admin",
              "access-control",
              "heuristic",
            ],
            relatedSymbols: [symbol],
            source: "heuristic",
          }),
        );
      },
    });

    return findings;
  },
};
