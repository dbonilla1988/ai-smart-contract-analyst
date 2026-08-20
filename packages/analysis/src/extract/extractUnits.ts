import type { ContractDefinition } from "@solidity-parser/parser/dist/src/ast-types.js";
import type { ContractUnit } from "@asca/shared";
import type { ParseSuccess } from "../parse/types.js";
import { extractFunctions } from "./extractFunctions.js";
import { extractStateVariables } from "./extractStateVariables.js";
import { extractEvents } from "./extractEvents.js";
import { extractErrors } from "./extractErrors.js";
import { extractInheritance } from "./extractInheritance.js";
import { extractModifiers } from "./extractModifiers.js";

function mapContractKind(kind: string): ContractUnit["kind"] {
  switch (kind) {
    case "interface":
      return "interface";
    case "library":
      return "library";
    case "abstract":
      return "abstract";
    case "contract":
    default:
      return "contract";
  }
}

export function extractUnits(parsed: ParseSuccess): ContractUnit[] {
  const units: ContractUnit[] = [];

  for (const child of parsed.ast.children) {
    if (child.type !== "ContractDefinition") continue;
    const contract = child as ContractDefinition;
    const functions = extractFunctions(contract, parsed.source);
    const stateVariables = extractStateVariables(contract, parsed.source);
    const events = extractEvents(contract, parsed.source);
    const errors = extractErrors(contract, parsed.source);
    const modifiers = extractModifiers(contract, parsed.source);

    units.push({
      name: contract.name,
      kind: mapContractKind(contract.kind),
      inheritance: extractInheritance(contract),
      functions,
      stateVariables: stateVariables.length > 0 ? stateVariables : undefined,
      events: events.length > 0 ? events : undefined,
      errors: errors.length > 0 ? errors : undefined,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
    });
  }

  return units;
}

/** Collect structural modifier names used on functions (not a security claim). */
export function collectModifierPatterns(units: ContractUnit[]): string[] {
  const names = new Set<string>();
  for (const unit of units) {
    for (const mod of unit.modifiers ?? []) {
      names.add(mod.name);
    }
    for (const fn of unit.functions) {
      for (const name of fn.modifiers ?? []) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}
