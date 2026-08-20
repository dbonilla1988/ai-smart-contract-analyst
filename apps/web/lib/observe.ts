import { createHash, randomUUID } from "node:crypto";

export interface AnalyzeObservation {
  requestId: string;
  timestamp: string;
  sourceByteLength: number;
  sourceHash: string;
  deterministicMs: number;
  aiRequested: boolean;
  aiMs?: number;
  aiStatus?: string;
  findingCount: number;
  tokenIndicatorCount: number;
  rateLimited?: boolean;
  errorCode?: string;
}

/**
 * Privacy-safe request observability.
 * Never logs source, snippets, prompts, keys, or raw model output.
 */
export function createRequestId(): string {
  return randomUUID();
}

export function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function logAnalyzeObservation(obs: AnalyzeObservation): void {
  // Single-line structured log — safe for production scrapers.
  console.info(
    JSON.stringify({
      kind: "analyze",
      requestId: obs.requestId,
      timestamp: obs.timestamp,
      sourceByteLength: obs.sourceByteLength,
      sourceHash: obs.sourceHash.slice(0, 16),
      deterministicMs: obs.deterministicMs,
      aiRequested: obs.aiRequested,
      aiMs: obs.aiMs,
      aiStatus: obs.aiStatus,
      findingCount: obs.findingCount,
      tokenIndicatorCount: obs.tokenIndicatorCount,
      rateLimited: obs.rateLimited,
      errorCode: obs.errorCode,
    }),
  );
}

/** Redact secrets from arbitrary strings before any accidental logging. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}
