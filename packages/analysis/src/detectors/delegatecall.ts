import type { Finding } from "@asca/shared";
import type { ASTNode } from "@solidity-parser/parser/dist/src/ast-types.js";
import type { Detector, DetectorContext } from "./types.js";
import {
  buildFinding,
  containingSymbol,
  evidenceFromLoc,
  isMemberNamed,
  makeFindingId,
  walkScoped,
} from "./utils.js";

export const delegatecallDetector: Detector = {
  id: "delegatecall",
  title: "delegatecall usage",
  description: "Detects delegatecall usage.",
  run(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<number>();

    walkScoped(ctx.parsed.ast, {
      MemberAccess(node, walkCtx) {
        if (!isMemberNamed(node, "delegatecall")) return;
        const line = node.loc?.start.line ?? 0;
        if (line && seen.has(line)) return;
        if (line) seen.add(line);

        const symbol = containingSymbol(walkCtx);
        const targetHint =
          node.expression && "type" in (node.expression as ASTNode)
            ? (node.expression as { type: string; name?: string }).name
            : undefined;

        findings.push(
          buildFinding({
            id: makeFindingId("delegatecall", ctx.source, line || symbol || "delegatecall"),
            detectorId: "delegatecall",
            title: "delegatecall detected",
            severity: "high",
            confidence: "high",
            category: "external-calls",
            description:
              "Detected delegatecall. Execution runs in the caller's storage context, so target trust and input control are critical. Risks include unexpected state changes and storage-layout collisions if the callee is untrusted or incorrectly assumed. delegatecall is not inherently a vulnerability; this finding flags a security-sensitive pattern that requires review.",
            remediation:
              "Ensure the callee is trusted and immutable where possible, validate inputs, and review storage layout compatibility. Prefer well-audited proxy patterns when using delegatecall for upgrades.",
            evidence: [
              evidenceFromLoc(
                ctx.source,
                node.loc,
                "delegatecall member access",
                symbol ?? targetHint,
              ),
            ],
            tags: ["delegatecall", "external-call", "deterministic"],
            relatedSymbols: symbol ? [symbol] : undefined,
            source: "deterministic",
          }),
        );
      },
    });

    return findings;
  },
};
