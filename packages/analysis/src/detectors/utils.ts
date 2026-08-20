import { visit } from "@solidity-parser/parser";
import { createHash } from "node:crypto";
import type {
  ASTNode,
  FunctionDefinition,
  Location,
  ModifierDefinition,
  SourceUnit,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type {
  Confidence,
  Evidence,
  Finding,
  FindingSource,
  Severity,
  SourceSpan,
} from "@asca/shared";
import { locToSpan } from "../extract/astUtils.js";

/**
 * Finding ID scheme:
 *   <detectorId>:<sourceHash12>:<anchor>
 *
 * Anchor is usually a 1-based start line, or a stable contract/symbol key
 * for grouped findings.
 *
 * Same source + same detector => same IDs across runs.
 */
export function sourceHashPrefix(source: string, length = 12): string {
  return createHash("sha256").update(source, "utf8").digest("hex").slice(0, length);
}

export function makeFindingId(
  detectorId: string,
  source: string,
  anchor: string | number,
): string {
  return `${detectorId}:${sourceHashPrefix(source)}:${anchor}`;
}

export function evidenceFromLoc(
  source: string,
  loc: Location | undefined,
  description: string,
  symbol?: string,
): Evidence {
  const span = locToSpan(source, loc);
  return {
    kind: span ? "source_span" : "pattern_match",
    description,
    span,
    symbol,
  };
}

export function buildFinding(input: {
  id: string;
  detectorId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  category: string;
  description: string;
  remediation: string;
  evidence: Evidence[];
  source?: FindingSource;
  tags?: string[];
  relatedSymbols?: string[];
}): Finding {
  if (input.evidence.length === 0) {
    throw new Error(`Finding ${input.id} must include evidence`);
  }
  return {
    id: input.id,
    detectorId: input.detectorId,
    title: input.title,
    severity: input.severity,
    confidence: input.confidence,
    category: input.category,
    description: input.description,
    remediation: input.remediation,
    evidence: input.evidence,
    tags: input.tags ?? [],
    source: input.source ?? "deterministic",
    relatedSymbols: input.relatedSymbols,
  };
}

export interface WalkContext {
  contractName?: string;
  contractKind?: string;
  functionName?: string;
  functionNode?: FunctionDefinition;
  modifierName?: string;
  modifierNode?: ModifierDefinition;
}

export function containingSymbol(ctx: WalkContext): string | undefined {
  if (ctx.functionName && ctx.contractName) return `${ctx.contractName}.${ctx.functionName}`;
  if (ctx.modifierName && ctx.contractName) return `${ctx.contractName}.${ctx.modifierName}`;
  return ctx.functionName ?? ctx.modifierName ?? ctx.contractName;
}

export function functionLabel(node: FunctionDefinition): string {
  if (node.isConstructor) return "constructor";
  if (node.isReceiveEther) return "receive";
  if (node.isFallback) return "fallback";
  return node.name || "unknown";
}

type Handlers = {
  [K in ASTNode["type"]]?: (node: Extract<ASTNode, { type: K }>, ctx: WalkContext) => void;
} & {
  onNode?: (node: ASTNode, ctx: WalkContext) => void;
};

/** Walk the AST while tracking current contract / function / modifier scope. */
export function walkScoped(ast: SourceUnit, handlers: Handlers): void {
  const ctx: WalkContext = {};

  const call = (node: ASTNode) => {
    const snapshot = { ...ctx };
    handlers.onNode?.(node, snapshot);
    const typed = handlers[node.type as ASTNode["type"]];
    if (typeof typed === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (typed as any)(node, snapshot);
    }
  };

  visit(ast, {
    ContractDefinition(node) {
      ctx.contractName = node.name;
      ctx.contractKind = node.kind;
      call(node);
    },
    "ContractDefinition:exit"() {
      ctx.contractName = undefined;
      ctx.contractKind = undefined;
    },
    FunctionDefinition(node) {
      ctx.functionName = functionLabel(node);
      ctx.functionNode = node;
      ctx.modifierName = undefined;
      ctx.modifierNode = undefined;
      call(node);
    },
    "FunctionDefinition:exit"() {
      ctx.functionName = undefined;
      ctx.functionNode = undefined;
    },
    ModifierDefinition(node) {
      ctx.modifierName = node.name;
      ctx.modifierNode = node;
      ctx.functionName = undefined;
      ctx.functionNode = undefined;
      call(node);
    },
    "ModifierDefinition:exit"() {
      ctx.modifierName = undefined;
      ctx.modifierNode = undefined;
    },
    MemberAccess(node) {
      call(node);
    },
    FunctionCall(node) {
      call(node);
    },
    BinaryOperation(node) {
      call(node);
    },
    Identifier(node) {
      call(node);
    },
    PragmaDirective(node) {
      call(node);
    },
    IfStatement(node) {
      call(node);
    },
    ExpressionStatement(node) {
      call(node);
    },
    IndexAccess(node) {
      call(node);
    },
    UnaryOperation(node) {
      call(node);
    },
    EmitStatement(node) {
      call(node);
    },
    ReturnStatement(node) {
      call(node);
    },
    VariableDeclarationStatement(node) {
      call(node);
    },
  });
}

export function spanOf(source: string, loc?: Location): SourceSpan | undefined {
  return locToSpan(source, loc);
}

export function countSeverities(findings: Finding[]) {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    note: 0,
  };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

export function isMemberNamed(
  node: ASTNode,
  member: string,
): node is Extract<ASTNode, { type: "MemberAccess" }> {
  return node.type === "MemberAccess" && node.memberName === member;
}

export function isIdentifierNamed(
  node: ASTNode,
  name: string,
): node is Extract<ASTNode, { type: "Identifier" }> {
  return node.type === "Identifier" && node.name === name;
}
