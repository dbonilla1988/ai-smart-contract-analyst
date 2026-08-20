import type {
  ContractDefinition,
  FunctionDefinition,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { FunctionKind, FunctionSummary } from "@asca/shared";
import { canonicalSignature, locToSpan, typeNameToString } from "./astUtils.js";

function mapVisibility(
  visibility: string | null | undefined,
  kind: FunctionKind,
): FunctionSummary["visibility"] {
  switch (visibility) {
    case "public":
    case "external":
    case "internal":
    case "private":
      return visibility;
    case "default":
      return kind === "constructor" ? "public" : "unknown";
    default:
      return "unknown";
  }
}

function mapMutability(
  stateMutability: string | null | undefined,
): FunctionSummary["stateMutability"] {
  switch (stateMutability) {
    case "pure":
    case "view":
    case "payable":
    case "nonpayable":
      return stateMutability;
    case "constant":
      return "view";
    case null:
    case undefined:
      return "nonpayable";
    default:
      return "unknown";
  }
}

function functionKind(node: FunctionDefinition): FunctionKind {
  if (node.isConstructor) return "constructor";
  if (node.isReceiveEther) return "receive";
  if (node.isFallback) return "fallback";
  return "function";
}

function functionName(node: FunctionDefinition, kind: FunctionKind): string {
  if (kind === "constructor") return "constructor";
  if (kind === "receive") return "receive";
  if (kind === "fallback") return "fallback";
  return node.name || "unknown";
}

export function extractFunctions(
  contract: ContractDefinition,
  source: string,
): FunctionSummary[] {
  const out: FunctionSummary[] = [];

  for (const node of contract.subNodes) {
    if (node.type !== "FunctionDefinition") continue;
    const fn = node as FunctionDefinition;
    const kind = functionKind(fn);
    const name = functionName(fn, kind);
    const parameters = (fn.parameters ?? []).map((p) => typeNameToString(p.typeName));
    const returns = (fn.returnParameters ?? []).map((p) => typeNameToString(p.typeName));
    const modifiers = (fn.modifiers ?? []).map((m) => m.name).filter(Boolean);
    const stateMutability = mapMutability(fn.stateMutability);
    const signature =
      kind === "function" || kind === "constructor"
        ? canonicalSignature(name, parameters)
        : `${name}()`;

    out.push({
      name,
      kind,
      visibility: mapVisibility(fn.visibility, kind),
      stateMutability,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      payable: stateMutability === "payable",
      parameters,
      returns: returns.length > 0 ? returns : undefined,
      signature,
      span: locToSpan(source, fn.loc),
    });
  }

  return out;
}
