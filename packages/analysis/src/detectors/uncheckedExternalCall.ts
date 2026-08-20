import type { Finding, Severity, Confidence } from "@asca/shared";
import type {
  ASTNode,
  FunctionCall,
  FunctionDefinition,
  VariableDeclaration,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { Detector, DetectorContext } from "./types.js";
import { walkAstChildren } from "./accessControl.js";
import {
  buildFinding,
  containingSymbol,
  evidenceFromLoc,
  isMemberNamed,
  makeFindingId,
  walkScoped,
  type WalkContext,
} from "./utils.js";

type CallKind = "call" | "staticcall" | "delegatecall";

function lowLevelKindFromCall(node: ASTNode | null | undefined): CallKind | null {
  if (!node || node.type !== "FunctionCall") return null;
  const expr = (node as FunctionCall).expression;
  if (!expr || expr.type !== "MemberAccess") return null;
  if (isMemberNamed(expr, "call")) return "call";
  if (isMemberNamed(expr, "staticcall")) return "staticcall";
  if (isMemberNamed(expr, "delegatecall")) return "delegatecall";
  return null;
}

/** Unwrap FunctionCall from common assignment/tuple wrappers. */
function extractLowLevelCall(expr: ASTNode | null | undefined): {
  call: FunctionCall;
  kind: CallKind;
} | null {
  if (!expr) return null;
  const direct = lowLevelKindFromCall(expr);
  if (direct && expr.type === "FunctionCall") {
    return { call: expr as FunctionCall, kind: direct };
  }
  if (expr.type === "BinaryOperation") {
    const bin = expr as { operator: string; right: ASTNode };
    if (bin.operator === "=") {
      return extractLowLevelCall(bin.right);
    }
  }
  if (expr.type === "TupleExpression") {
    const comps = (expr as { components?: Array<ASTNode | null> }).components ?? [];
    for (const c of comps) {
      const found = extractLowLevelCall(c ?? undefined);
      if (found) return found;
    }
  }
  return null;
}

function declarationNames(stmt: ASTNode): string[] {
  if (stmt.type !== "VariableDeclarationStatement") return [];
  const vars = (stmt as { variables?: Array<VariableDeclaration | null> }).variables ?? [];
  const names: string[] = [];
  for (const v of vars) {
    if (v && v.type === "VariableDeclaration" && v.name) names.push(v.name);
  }
  return names;
}

function assignmentTargetNames(expr: ASTNode): string[] {
  if (expr.type === "BinaryOperation") {
    const bin = expr as { operator: string; left: ASTNode };
    if (bin.operator !== "=") return [];
    return identifierNames(bin.left);
  }
  return [];
}

function identifierNames(node: ASTNode): string[] {
  const names: string[] = [];
  if (node.type === "Identifier") {
    names.push((node as { name: string }).name);
    return names;
  }
  if (node.type === "TupleExpression") {
    const comps = (node as { components?: Array<ASTNode | null> }).components ?? [];
    for (const c of comps) {
      if (c?.type === "Identifier") names.push((c as { name: string }).name);
    }
  }
  return names;
}

function successVarLikelyUsed(fn: FunctionDefinition, varName: string, afterLine: number): boolean {
  if (!fn.body) return false;
  let used = false;

  walkAstChildren(fn.body as unknown as ASTNode, (node) => {
    if (used) return;
    const line = node.loc?.start.line ?? 0;
    // Allow same-line checks; skip declarations at/before assignment line for Identifier noise
    if (line && afterLine && line < afterLine) return;

    if (node.type === "FunctionCall") {
      const call = node as FunctionCall;
      if (call.expression.type === "Identifier") {
        const name = call.expression.name;
        if (["require", "assert", "revert"].includes(name)) {
          for (const arg of call.arguments) {
            walkAstChildren(arg as ASTNode, (inner) => {
              if (inner.type === "Identifier" && (inner as { name: string }).name === varName) {
                used = true;
              }
            });
          }
        }
      }
    }

    if (node.type === "IfStatement") {
      const cond = (node as { condition: ASTNode }).condition;
      const condLine = cond.loc?.start.line ?? line;
      if (condLine >= afterLine) {
        walkAstChildren(cond, (inner) => {
          if (inner.type === "Identifier" && (inner as { name: string }).name === varName) {
            used = true;
          }
        });
      }
    }
  });

  return used;
}

function classify(
  kind: CallKind,
  mode: "ignored" | "assigned-unused",
): { severity: Severity; confidence: Confidence; title: string; description: string } {
  if (mode === "ignored") {
    if (kind === "call") {
      return {
        severity: "medium",
        confidence: "high",
        title: "Low-level call success appears ignored",
        description:
          "Detected a low-level .call whose success return value appears unused. Ignoring call success can leave failed external interactions unnoticed. This is a structural signal based on local AST patterns, not a full dataflow proof of exploitability.",
      };
    }
    if (kind === "staticcall") {
      return {
        severity: "low",
        confidence: "high",
        title: "Low-level staticcall success appears ignored",
        description:
          "Detected a low-level .staticcall whose success return value appears unused. Failed staticcalls may silently yield empty/invalid data. Review required; presence alone is not proof of a vulnerability.",
      };
    }
    return {
      severity: "medium",
      confidence: "high",
      title: "delegatecall success appears ignored",
      description:
        "Detected a .delegatecall whose success return value appears unused. Failed delegatecalls can leave state assumptions incorrect. This finding is specifically about return-value handling (not mere presence of delegatecall).",
    };
  }

  return {
    severity: kind === "staticcall" ? "informational" : "low",
    confidence: "medium",
    title: `${kind}() result assigned but success check not resolved`,
    description: `Detected ${kind}() with an assigned return value, but this analyzer could not resolve a direct require/assert/if check of the success boolean in the same function. The value may still be checked via helpers or later control flow this phase does not model.`,
  };
}

function emitFinding(
  ctx: DetectorContext,
  findings: Finding[],
  seen: Set<string>,
  walkCtx: WalkContext,
  callNode: FunctionCall,
  kind: CallKind,
  mode: "ignored" | "assigned-unused",
  successName?: string,
): void {
  const line = callNode.loc?.start.line ?? 0;
  const key = `${kind}:${mode}:${line}`;
  if (seen.has(key)) return;
  seen.add(key);

  const symbol = containingSymbol(walkCtx);
  const classified = classify(kind, mode);

  findings.push(
    buildFinding({
      id: makeFindingId(
        "unchecked-external-call",
        ctx.source,
        `${kind}-${mode}-${line || symbol || "call"}`,
      ),
      detectorId: "unchecked-external-call",
      title: classified.title,
      severity: classified.severity,
      confidence: classified.confidence,
      category: "external-calls",
      description: classified.description,
      remediation:
        "Capture the success boolean from low-level calls and handle failure explicitly (require/if/revert). Prefer high-level interface calls when ABI-safe alternatives exist.",
      evidence: [
        evidenceFromLoc(
          ctx.source,
          callNode.loc,
          mode === "ignored"
            ? `${kind}() used without capturing success`
            : `${kind}() assigned${successName ? ` to ${successName}` : ""} without a resolved success check`,
          symbol,
        ),
      ],
      tags: ["unchecked-call", kind, "deterministic"],
      relatedSymbols: symbol ? [symbol] : undefined,
      source: "deterministic",
    }),
  );
}

export const uncheckedExternalCallDetector: Detector = {
  id: "unchecked-external-call",
  title: "Unchecked external call return",
  description: "Detects low-level call success values that appear ignored.",
  run(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<string>();

    walkScoped(ctx.parsed.ast, {
      ExpressionStatement(node, walkCtx) {
        const expr = (node as { expression?: ASTNode | null }).expression;
        if (!expr) return;

        // Bare: target.call(data);
        if (expr.type === "FunctionCall") {
          const kind = lowLevelKindFromCall(expr);
          if (!kind) return;
          emitFinding(ctx, findings, seen, walkCtx, expr as FunctionCall, kind, "ignored");
          return;
        }

        // Reassignment: (ok, data) = target.call(data);
        const extracted = extractLowLevelCall(expr);
        if (!extracted) return;
        const names = assignmentTargetNames(expr);
        const successName = names[0];
        const line = node.loc?.start.line ?? extracted.call.loc?.start.line ?? 0;
        const fn = walkCtx.functionNode;

        if (successName && fn && successVarLikelyUsed(fn, successName, line)) {
          return;
        }
        emitFinding(
          ctx,
          findings,
          seen,
          walkCtx,
          extracted.call,
          extracted.kind,
          successName ? "assigned-unused" : "ignored",
          successName,
        );
      },
      VariableDeclarationStatement(node, walkCtx) {
        const init = (node as { initialValue?: ASTNode | null }).initialValue;
        const extracted = extractLowLevelCall(init ?? undefined);
        if (!extracted) return;

        const names = declarationNames(node);
        const successName = names[0];
        const line = node.loc?.start.line ?? extracted.call.loc?.start.line ?? 0;
        const fn = walkCtx.functionNode;

        if (successName && fn && successVarLikelyUsed(fn, successName, line)) {
          return;
        }

        emitFinding(
          ctx,
          findings,
          seen,
          walkCtx,
          extracted.call,
          extracted.kind,
          successName ? "assigned-unused" : "ignored",
          successName,
        );
      },
    });

    return findings;
  },
};
