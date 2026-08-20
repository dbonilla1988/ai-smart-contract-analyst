import type {
  ContractDefinition,
  ModifierDefinition,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { ModifierSummary } from "@asca/shared";
import { locToSpan, typeNameToString } from "./astUtils.js";

export function extractModifiers(
  contract: ContractDefinition,
  source: string,
): ModifierSummary[] {
  const out: ModifierSummary[] = [];

  for (const node of contract.subNodes) {
    if (node.type !== "ModifierDefinition") continue;
    const mod = node as ModifierDefinition;
    const types = (mod.parameters ?? []).map((p) => typeNameToString(p.typeName));
    out.push({
      name: mod.name,
      parameters: types.length > 0 ? types : undefined,
      span: locToSpan(source, mod.loc),
    });
  }

  return out;
}
