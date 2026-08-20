import type { Finding } from "@asca/shared";
import type { ASTNode, FunctionCall, IfStatement } from "@solidity-parser/parser/dist/src/ast-types.js";
import type { Detector, DetectorContext } from "./types.js";
import {
  buildFinding,
  containingSymbol,
  evidenceFromLoc,
  isIdentifierNamed,
  isMemberNamed,
  makeFindingId,
  walkScoped,
  type WalkContext,
} from "./utils.js";

function mentionsTxOrigin(node: ASTNode | null | undefined): boolean {
  if (!node || typeof node !== "object" || !("type" in node)) return false;
  const stack: ASTNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || !("type" in cur)) continue;
    if (isMemberNamed(cur, "origin") && isIdentifierNamed(cur.expression as ASTNode, "tx")) {
      return true;
    }
    for (const value of Object.values(cur)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) stack.push(item as ASTNode);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        stack.push(value as ASTNode);
      }
    }
  }
  return false;
}

interface OriginHit {
  line: number;
  loc: ASTNode["loc"];
  ctx: WalkContext;
  authContext: boolean;
}

export const txOriginDetector: Detector = {
  id: "tx-origin",
  title: "tx.origin authentication",
  description: "Detects authorization logic that relies on tx.origin.",
  run(ctx: DetectorContext): Finding[] {
    const hits: OriginHit[] = [];
    const authLines = new Set<number>();

    walkScoped(ctx.parsed.ast, {
      FunctionCall(node, walkCtx) {
        if (node.expression.type !== "Identifier") return;
        if (!["require", "assert"].includes(node.expression.name)) return;
        const arg = (node as FunctionCall).arguments[0] as ASTNode | undefined;
        if (!mentionsTxOrigin(arg)) return;
        const line = arg?.loc?.start.line ?? node.loc?.start.line;
        if (line) authLines.add(line);
        hits.push({
          line: line ?? 0,
          loc: node.loc ?? arg?.loc,
          ctx: walkCtx,
          authContext: true,
        });
      },
      IfStatement(node, walkCtx) {
        const cond = (node as IfStatement).condition as ASTNode;
        if (!mentionsTxOrigin(cond)) return;
        const line = cond.loc?.start.line ?? node.loc?.start.line;
        if (line) authLines.add(line);
        hits.push({
          line: line ?? 0,
          loc: cond.loc ?? node.loc,
          ctx: walkCtx,
          authContext: true,
        });
      },
      MemberAccess(node, walkCtx) {
        if (!isMemberNamed(node, "origin")) return;
        if (!isIdentifierNamed(node.expression as ASTNode, "tx")) return;
        const line = node.loc?.start.line ?? 0;
        hits.push({
          line,
          loc: node.loc,
          ctx: walkCtx,
          authContext: false,
        });
      },
    });

    // Deduplicate by line; prefer auth-context hits.
    const byLine = new Map<number, OriginHit>();
    for (const hit of hits) {
      const key = hit.line || 0;
      const existing = byLine.get(key);
      if (!existing || (!existing.authContext && hit.authContext)) {
        byLine.set(key, {
          ...hit,
          authContext: hit.authContext || authLines.has(hit.line),
        });
      } else if (existing && authLines.has(hit.line)) {
        existing.authContext = true;
      }
    }

    const findings: Finding[] = [];
    for (const hit of byLine.values()) {
      const symbol = containingSymbol(hit.ctx);
      const auth = hit.authContext || authLines.has(hit.line);
      findings.push(
        buildFinding({
          id: makeFindingId("tx-origin", ctx.source, hit.line || symbol || "unknown"),
          detectorId: "tx-origin",
          title: auth
            ? "tx.origin used in authorization-sensitive logic"
            : "tx.origin referenced",
          severity: auth ? "medium" : "informational",
          confidence: auth ? "high" : "medium",
          category: "authorization",
          description: auth
            ? "Detected tx.origin in a require/assert/if condition. Using tx.origin for authorization can enable phishing-style intermediary contract calls because tx.origin is the original EOA rather than the immediate caller. This pattern is security-sensitive and requires review; presence alone does not prove exploitability."
            : "Detected a tx.origin reference. If this value participates in authorization decisions, it can introduce phishing-style authorization risk. Review whether the use is authorization-related.",
          remediation:
            "Use msg.sender for access control. Avoid tx.origin in authorization conditions. Confirm any remaining reads are not part of auth logic.",
          evidence: [
            evidenceFromLoc(
              ctx.source,
              hit.loc,
              auth ? "tx.origin in authorization-sensitive context" : "tx.origin reference",
              symbol,
            ),
          ],
          tags: auth
            ? ["tx.origin", "authorization", "deterministic"]
            : ["tx.origin", "review", "deterministic"],
          relatedSymbols: symbol ? [symbol] : undefined,
        }),
      );
    }

    return findings;
  },
};
