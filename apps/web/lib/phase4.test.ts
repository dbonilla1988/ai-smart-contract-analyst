import { describe, expect, it, beforeEach } from "vitest";
import { apiError, type ApiErrorBody } from "./apiErrors";
import { checkRateLimit, resetRateLimitStores, RATE_LIMITS } from "./rateLimit";
import { validateAnalyzeSource, MIN_SOURCE_BYTES } from "./validateSource";
import { redactSecrets, hashSource } from "./observe";
import { V1_DETECTOR_COVERAGE, V1_TOKEN_INDICATORS, EXAMPLE_CONTRACT } from "./coverage";

describe("Phase 4 rate limiting", () => {
  beforeEach(() => {
    resetRateLimitStores();
  });

  it("allows deterministic requests up to the limit then blocks", () => {
    const key = "10.0.0.1";
    for (let i = 0; i < RATE_LIMITS.deterministic.limit; i++) {
      const result = checkRateLimit("analyze-det", key, RATE_LIMITS.deterministic, 1_000 + i);
      expect(result.allowed).toBe(true);
    }
    const blocked = checkRateLimit(
      "analyze-det",
      key,
      RATE_LIMITS.deterministic,
      1_000 + RATE_LIMITS.deterministic.limit,
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("applies a stricter AI window than deterministic", () => {
    expect(RATE_LIMITS.ai.limit).toBeLessThan(RATE_LIMITS.deterministic.limit);
    const key = "10.0.0.2";
    for (let i = 0; i < RATE_LIMITS.ai.limit; i++) {
      expect(checkRateLimit("analyze-ai", key, RATE_LIMITS.ai, 5_000 + i).allowed).toBe(true);
    }
    expect(checkRateLimit("analyze-ai", key, RATE_LIMITS.ai, 5_000 + RATE_LIMITS.ai.limit).allowed).toBe(
      false,
    );
  });
});

describe("Phase 4 input validation", () => {
  it("accepts plain-text Solidity", () => {
    const result = validateAnalyzeSource(EXAMPLE_CONTRACT);
    expect(result.ok).toBe(true);
  });

  it("rejects empty / too-short source", () => {
    expect(validateAnalyzeSource("").ok).toBe(false);
    expect(validateAnalyzeSource("pragma").ok).toBe(false);
    const short = validateAnalyzeSource("a".repeat(MIN_SOURCE_BYTES - 1));
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe("INVALID_INPUT");
  });

  it("rejects binary / NUL payloads", () => {
    const result = validateAnalyzeSource(`pragma solidity 0.8.20;\0contract X {}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_INPUT");
  });

  it("rejects oversized payloads", () => {
    const huge = "a".repeat(500_001);
    const result = validateAnalyzeSource(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("Phase 4 API error shape", () => {
  it("returns consistent error envelope", async () => {
    const res = apiError("RATE_LIMITED", "Too many analysis requests. Try again shortly.", 429);
    expect(res.status).toBe(429);
    const body = (await res.json()) as ApiErrorBody;
    expect(body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many analysis requests. Try again shortly.",
      },
    });
  });
});

describe("Phase 4 privacy-safe observability helpers", () => {
  it("hashes source without retaining plaintext in the helper", () => {
    const hash = hashSource(EXAMPLE_CONTRACT);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("contract");
  });

  it("redacts API keys from accidental log strings", () => {
    expect(redactSecrets("Bearer sk-abcdefghijklmnopqrstuvwxyz")).toMatch(/REDACTED/);
    expect(redactSecrets("key=sk-abcdefghijklmnopqrstuvwxyz")).toContain("[REDACTED_KEY]");
  });
});

describe("Phase 4 coverage catalog", () => {
  it("lists V1 detectors and token heuristics", () => {
    expect(V1_DETECTOR_COVERAGE.map((d) => d.id)).toEqual(
      expect.arrayContaining([
        "tx-origin",
        "selfdestruct",
        "delegatecall",
        "low-level-call",
        "privileged-function",
        "floating-pragma",
        "unrestricted-mint-admin",
        "unchecked-external-call",
      ]),
    );
    expect(V1_TOKEN_INDICATORS.map((d) => d.id)).toEqual(
      expect.arrayContaining(["erc20-indicator", "erc721-indicator"]),
    );
    expect(EXAMPLE_CONTRACT).toMatch(/pragma solidity/);
  });
});
