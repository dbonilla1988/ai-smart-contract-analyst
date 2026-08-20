import type {
  ContractDefinition,
  EventDefinition,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import type { EventSummary } from "@asca/shared";
import { canonicalSignature, locToSpan, typeNameToString } from "./astUtils.js";

export function extractEvents(contract: ContractDefinition, source: string): EventSummary[] {
  const out: EventSummary[] = [];

  for (const node of contract.subNodes) {
    if (node.type !== "EventDefinition") continue;
    const event = node as EventDefinition;
    const types = (event.parameters ?? []).map((p) => typeNameToString(p.typeName));
    out.push({
      name: event.name,
      parameters: types,
      signature: canonicalSignature(event.name, types),
      span: locToSpan(source, event.loc),
    });
  }

  return out;
}
