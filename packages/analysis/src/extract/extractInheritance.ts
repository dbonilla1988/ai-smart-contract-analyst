import type {
  ContractDefinition,
  InheritanceSpecifier,
} from "@solidity-parser/parser/dist/src/ast-types.js";

export function extractInheritance(contract: ContractDefinition): string[] {
  return (contract.baseContracts ?? []).map((base: InheritanceSpecifier) => {
    return base.baseName?.namePath ?? "unknown";
  });
}
