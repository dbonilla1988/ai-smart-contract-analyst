import { MAX_SOLIDITY_SOURCE_BYTES } from "@asca/shared";

export const MIN_SOURCE_BYTES = 16;

export type SourceValidationFailure = {
  ok: false;
  code: "INVALID_INPUT" | "PAYLOAD_TOO_LARGE";
  message: string;
};

export type SourceValidationSuccess = {
  ok: true;
  byteLength: number;
};

export type SourceValidationResult = SourceValidationFailure | SourceValidationSuccess;

/**
 * Server-side source hardening beyond Zod shape checks.
 * Plain-text Solidity only — reject binary / control-heavy payloads.
 */
export function validateAnalyzeSource(source: unknown): SourceValidationResult {
  if (typeof source !== "string") {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Source must be plain-text Solidity.",
    };
  }

  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Source must be a non-empty Solidity string.",
    };
  }

  const byteLength = Buffer.byteLength(source, "utf8");
  if (byteLength < MIN_SOURCE_BYTES) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: `Source is too short to analyze (minimum ${MIN_SOURCE_BYTES} bytes).`,
    };
  }

  if (byteLength > MAX_SOLIDITY_SOURCE_BYTES) {
    return {
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
      message: `Source exceeds maximum size of ${MAX_SOLIDITY_SOURCE_BYTES} bytes.`,
    };
  }

  // Reject NUL and other non-text control characters (allow \t \n \r).
  let controlCount = 0;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code === 0) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "Source contains binary or invalid control characters.",
      };
    }
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      controlCount += 1;
    }
  }

  if (controlCount > 8 || controlCount / Math.max(source.length, 1) > 0.02) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Source contains too many non-text control characters.",
    };
  }

  return { ok: true, byteLength };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  return "unknown";
}
