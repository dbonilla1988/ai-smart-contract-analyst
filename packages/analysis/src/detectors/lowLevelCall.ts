import type { Finding } from "@asca/shared";
import type { Detector, DetectorContext } from "./types.js";
import {
  buildFinding,
  containingSymbol,
  evidenceFromLoc,
  isMemberNamed,
  makeFindingId,
  walkScoped,
} from "./utils.js";

const LOW_LEVEL = new Set(["call", "staticcall", "callcode"]);

export const lowLevelCallDetector: Detector = {
  id: "low-level-call",
  title: "Low-level call",
  description: "Detects low-level call/staticcall/callcode usage (excludes delegatecall).",
  run(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<string>();

    walkScoped(ctx.parsed.ast, {
      MemberAccess(node, walkCtx) {
        if (!isMemberNamed(node, node.memberName)) return;
        if (!LOW_LEVEL.has(node.memberName)) return;

        const line = node.loc?.start.line ?? 0;
        const key = `${node.memberName}:${line}`;
        if (seen.has(key)) return;
        seen.add(key);

        const symbol = containingSymbol(walkCtx);
        const kind = node.memberName;
        const severity = kind === "callcode" ? "low" : "informational";

        findings.push(
          buildFinding({
            id: makeFindingId(
              "low-level-call",
              ctx.source,
              `${kind}-${line || symbol || "call"}`,
            ),
            detectorId: "low-level-call",
            title: `Low-level ${kind}() detected`,
            severity,
            confidence: "high",
            category: "external-calls",
            description: `Detected low-level ${kind}(). Low-level calls bypass ABI-level type safety and require explicit success/return-data handling. Presence is security-sensitive and worth review, but it is not automatically a vulnerability.`,
            remediation:
              "Prefer high-level interface calls when possible. If a low-level call is required, check success, handle return data carefully, and document why ABI-safe alternatives are insufficient.",
            evidence: [evidenceFromLoc(ctx.source, node.loc, `low-level ${kind}`, symbol)],
            tags: ["low-level-call", kind, "deterministic"],
            relatedSymbols: symbol ? [symbol] : undefined,
          }),
        );
      },
    });

    return findings;
  },
};
