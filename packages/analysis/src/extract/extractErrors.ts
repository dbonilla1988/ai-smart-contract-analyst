import type {
  ContractDefinition,
  CustomErrorDefinition,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { CustomErrorSummary } from "@asca/shared";
import { canonicalSignature, locToSpan, typeNameToString } from "./astUtils.js";

export function extractErrors(
  contract: ContractDefinition,
  source: string,
): CustomErrorSummary[] {
  const out: CustomErrorSummary[] = [];

  for (const node of contract.subNodes) {
    if (node.type !== "CustomErrorDefinition") continue;
    const err = node as CustomErrorDefinition;
    const types = (err.parameters ?? []).map((p) => typeNameToString(p.typeName));
    out.push({
      name: err.name,
      parameters: types,
      signature: canonicalSignature(err.name, types),
      span: locToSpan(source, err.loc),
    });
  }

  return out;
}
