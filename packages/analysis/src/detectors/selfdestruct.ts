import type { Finding } from "@asca/shared";
import type { Detector, DetectorContext } from "./types.js";
import {
  buildFinding,
  containingSymbol,
  evidenceFromLoc,
  makeFindingId,
  walkScoped,
} from "./utils.js";

const PRIVILEGE_MODIFIERS = /^(onlyOwner|onlyAdmin|onlyRole|auth|requiresAuth|adminOnly|ownerOnly)$/i;

export const selfdestructDetector: Detector = {
  id: "selfdestruct",
  title: "selfdestruct usage",
  description: "Detects selfdestruct/suicide usage.",
  run(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<number>();

    walkScoped(ctx.parsed.ast, {
      FunctionCall(node, walkCtx) {
        if (node.expression.type !== "Identifier") return;
        const name = node.expression.name;
        if (name !== "selfdestruct" && name !== "suicide") return;

        const line = node.loc?.start.line ?? 0;
        if (line && seen.has(line)) return;
        if (line) seen.add(line);

        const symbol = containingSymbol(walkCtx);
        const mods = walkCtx.functionNode?.modifiers?.map((m) => m.name) ?? [];
        const protectedBy = mods.find((m) => PRIVILEGE_MODIFIERS.test(m));

        findings.push(
          buildFinding({
            id: makeFindingId("selfdestruct", ctx.source, line || symbol || name),
            detectorId: "selfdestruct",
            title: protectedBy
              ? `Privileged ${name}() capability`
              : `Destructive ${name}() capability`,
            severity: "medium",
            confidence: "high",
            category: "destructive-operations",
            description: protectedBy
              ? `Detected ${name}() in ${symbol ?? "a function"} gated by ${protectedBy}. This is destructive/privileged behavior. On modern EVM networks, SELFDESTRUCT semantics have changed and must not be assumed to permanently delete contract code in all contexts. Review whether this capability is necessary and correctly protected.`
              : `Detected ${name}(). This introduces destructive behavior that can send contract balance and affect contract lifecycle depending on network/EVM rules. Presence is security-sensitive and requires review; it is not automatically an exploit.`,
            remediation:
              "Avoid selfdestruct unless absolutely required. If retained, restrict callers carefully, document operational risk, and verify behavior against the target chain's EVM rules. Prefer safer withdrawal/upgrade patterns where possible.",
            evidence: [evidenceFromLoc(ctx.source, node.loc, `${name}() call`, symbol)],
            tags: ["selfdestruct", "destructive", "deterministic"],
            relatedSymbols: symbol ? [symbol] : undefined,
          }),
        );
      },
    });

    return findings;
  },
};
