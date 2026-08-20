import type { Location, TypeName } from "@solidity-parser/parser/dist/src/ast-types.js";
import type { SourceSpan } from "@asca/shared";

export function typeNameToString(typeName: TypeName | null | undefined): string {
  if (!typeName) return "unknown";

  switch (typeName.type) {
    case "ElementaryTypeName":
      return typeName.name;
    case "UserDefinedTypeName":
      return typeName.namePath;
    case "ArrayTypeName":
      return `${typeNameToString(typeName.baseTypeName)}[]`;
    case "Mapping":
      return `mapping(${typeNameToString(typeName.keyType)}=>${typeNameToString(typeName.valueType)})`;
    case "FunctionTypeName":
      return "function";
    default:
      return "unknown";
  }
}

export function locToSpan(
  source: string,
  loc: Location | undefined,
  maxSnippet = 240,
): SourceSpan | undefined {
  if (!loc?.start?.line || !loc?.end?.line) return undefined;

  const lines = source.split(/\r?\n/);
  const startLine = loc.start.line;
  const endLine = loc.end.line;
  const snippet = lines
    .slice(Math.max(0, startLine - 1), endLine)
    .join("\n")
    .slice(0, maxSnippet);

  return {
    startLine,
    endLine,
    startCol: loc.start.column,
    endCol: loc.end.column,
    snippet,
  };
}

export function canonicalSignature(name: string, paramTypes: string[]): string {
  return `${name}(${paramTypes.join(",")})`;
}
