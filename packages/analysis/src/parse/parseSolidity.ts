import { parse as parseAst, ParserError } from "@solidity-parser/parser";
import type { SourceUnit } from "@solidity-parser/parser/dist/src/ast-types.js";
import {
  MAX_SOURCE_BYTES,
  MIN_SOURCE_BYTES,
  type ParseResult,
  type ParserDiagnostic,
} from "./types.js";
import { SolidityParseError, SolidityValidationError } from "./errors.js";

function collectPragmas(ast: SourceUnit): string[] {
  const pragmas: string[] = [];
  for (const child of ast.children) {
    if (child.type === "PragmaDirective") {
      const node = child as { name?: string; value?: string };
      const name = node.name ?? "solidity";
      const value = node.value ?? "";
      pragmas.push(`${name} ${value}`.trim());
    }
  }
  return pragmas;
}

function normalizeParserErrors(err: unknown): ParserDiagnostic[] {
  if (err instanceof ParserError) {
    return (err.errors ?? []).map((item) => ({
      message: item.message ?? "Parse error",
      line: item.line,
      column: item.column,
    }));
  }

  if (err && typeof err === "object" && "errors" in err) {
    const list = (err as { errors?: unknown }).errors;
    if (Array.isArray(list)) {
      return list.map((item) => {
        if (item && typeof item === "object") {
          const e = item as { message?: string; line?: number; column?: number };
          return {
            message: e.message ?? "Parse error",
            line: e.line,
            column: e.column,
          };
        }
        return { message: String(item) };
      });
    }
  }

  if (err instanceof Error) {
    return [{ message: err.message }];
  }

  return [{ message: "Unknown parse failure" }];
}

function assertPlainTextSource(source: string): void {
  let controlCount = 0;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code === 0) {
      throw new SolidityValidationError(
        "Solidity source contains binary or invalid control characters",
      );
    }
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      controlCount += 1;
    }
  }
  if (controlCount > 8 || controlCount / Math.max(source.length, 1) > 0.02) {
    throw new SolidityValidationError(
      "Solidity source contains too many non-text control characters",
    );
  }
}

/**
 * Parse Solidity source into an AST.
 * Does not execute Solidity, invoke solc, or evaluate source.
 * Does not log source contents.
 */
export function parseSolidity(source: string): ParseResult {
  if (typeof source !== "string" || source.trim().length === 0) {
    throw new SolidityValidationError("Solidity source must be a non-empty string");
  }

  const byteLength = Buffer.byteLength(source, "utf8");
  if (byteLength < MIN_SOURCE_BYTES) {
    throw new SolidityValidationError(
      `Solidity source is too short (minimum ${MIN_SOURCE_BYTES} bytes)`,
    );
  }
  if (byteLength > MAX_SOURCE_BYTES) {
    throw new SolidityValidationError(
      `Solidity source exceeds maximum size of ${MAX_SOURCE_BYTES} bytes`,
    );
  }

  assertPlainTextSource(source);

  try {
    // Sync parser — size caps above bound worst-case work for V1.
    const ast = parseAst(source, {
      loc: true,
      range: true,
      tolerant: false,
    }) as SourceUnit;

    return {
      ok: true,
      source,
      ast,
      pragmas: collectPragmas(ast),
    };
  } catch (err) {
    if (err instanceof SolidityValidationError) throw err;
    const errors = normalizeParserErrors(err);
    return {
      ok: false,
      source,
      errors,
    };
  }
}

/** Parse or throw a safe SolidityParseError / SolidityValidationError. */
export function parseSolidityOrThrow(source: string): Extract<ParseResult, { ok: true }> {
  const result = parseSolidity(source);
  if (!result.ok) {
    throw new SolidityParseError("Failed to parse Solidity source", result.errors);
  }
  return result;
}
