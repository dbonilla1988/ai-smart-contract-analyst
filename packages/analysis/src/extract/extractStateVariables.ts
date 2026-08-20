import type {
  ContractDefinition,
  StateVariableDeclaration,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { StateVariableSummary } from "@asca/shared";
import { locToSpan, typeNameToString } from "./astUtils.js";

function mapVarVisibility(
  visibility: string | null | undefined,
): StateVariableSummary["visibility"] {
  switch (visibility) {
    case "public":
    case "internal":
    case "private":
      return visibility;
    case "default":
      return "internal";
    default:
      return "unknown";
  }
}

export function extractStateVariables(
  contract: ContractDefinition,
  source: string,
): StateVariableSummary[] {
  const out: StateVariableSummary[] = [];

  for (const node of contract.subNodes) {
    if (node.type !== "StateVariableDeclaration") continue;
    const decl = node as StateVariableDeclaration;
    for (const variable of decl.variables ?? []) {
      if (!variable.name) continue;
      out.push({
        name: variable.name,
        typeName: typeNameToString(variable.typeName),
        visibility: mapVarVisibility(variable.visibility),
        isConstant: variable.isDeclaredConst || undefined,
        isImmutable: variable.isImmutable || undefined,
        span: locToSpan(source, variable.loc ?? decl.loc),
      });
    }
  }

  return out;
}
