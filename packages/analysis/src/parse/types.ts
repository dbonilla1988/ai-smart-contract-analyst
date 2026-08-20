import type { SourceUnit } from "@solidity-parser/parser/dist/src/ast-types.js";

export const MAX_SOURCE_BYTES = 500_000;
export const MIN_SOURCE_BYTES = 16;

export interface ParserDiagnostic {
  message: string;
  line?: number;
  column?: number;
}

export interface ParseSuccess {
  ok: true;
  source: string;
  ast: SourceUnit;
  pragmas: string[];
}

export interface ParseFailure {
  ok: false;
  source: string;
  errors: ParserDiagnostic[];
}

export type ParseResult = ParseSuccess | ParseFailure;
