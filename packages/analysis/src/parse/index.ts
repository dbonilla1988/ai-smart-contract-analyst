export { parseSolidity, parseSolidityOrThrow } from "./parseSolidity.js";
export { SolidityParseError, SolidityValidationError } from "./errors.js";
export type { ParseResult, ParseSuccess, ParseFailure, ParserDiagnostic } from "./types.js";
export { MAX_SOURCE_BYTES, MIN_SOURCE_BYTES } from "./types.js";

/** @deprecated Use parseSolidity */
export { parseSolidity as parseSoliditySource } from "./parseSolidity.js";
