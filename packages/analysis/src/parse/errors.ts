import type { ParserDiagnostic } from "./types.js";

export class SolidityParseError extends Error {
  readonly code = "SOLIDITY_PARSE_ERROR";
  readonly errors: ParserDiagnostic[];

  constructor(message: string, errors: ParserDiagnostic[]) {
    super(message);
    this.name = "SolidityParseError";
    this.errors = errors;
  }
}

export class SolidityValidationError extends Error {
  readonly code = "SOLIDITY_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "SolidityValidationError";
  }
}
