import { AnalyzeRequestSchema, AnalysisReportSchema } from "@asca/shared";
import {
  buildAnalysisReport,
  SolidityParseError,
  SolidityValidationError,
} from "@asca/analysis";
import { explainFindings, resolveLlmProviderResult } from "@asca/llm";
import { apiError } from "../../../lib/apiErrors";
import { checkRateLimit, RATE_LIMITS } from "../../../lib/rateLimit";
import {
  createRequestId,
  hashSource,
  logAnalyzeObservation,
} from "../../../lib/observe";
import { getClientIp, validateAnalyzeSource } from "../../../lib/validateSource";

export const runtime = "nodejs";

/**
 * Deterministic Solidity analysis with optional grounded AI explanation.
 * AI failure never upgrades the HTTP status — the deterministic report still returns 200.
 */
export async function POST(request: Request) {
  const requestId = createRequestId();
  const timestamp = new Date().toISOString();
  const clientIp = getClientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Request body must be valid JSON.", 400);
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_INPUT", "Invalid analyze request.", 400);
  }

  const sourceCheck = validateAnalyzeSource(parsed.data.source);
  if (!sourceCheck.ok) {
    const status = sourceCheck.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    return apiError(sourceCheck.code, sourceCheck.message, status);
  }

  const includeAi = parsed.data.options?.includeAiInterpretation === true;
  const rate = checkRateLimit(
    includeAi ? "analyze-ai" : "analyze-det",
    clientIp,
    includeAi ? RATE_LIMITS.ai : RATE_LIMITS.deterministic,
  );

  if (!rate.allowed) {
    logAnalyzeObservation({
      requestId,
      timestamp,
      sourceByteLength: sourceCheck.byteLength,
      sourceHash: hashSource(parsed.data.source),
      deterministicMs: 0,
      aiRequested: includeAi,
      findingCount: 0,
      tokenIndicatorCount: 0,
      rateLimited: true,
      errorCode: "RATE_LIMITED",
    });
    return apiError(
      "RATE_LIMITED",
      "Too many analysis requests. Try again shortly.",
      429,
      {
        "Retry-After": String(
          Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)),
        ),
        "X-RateLimit-Limit": String(rate.limit),
        "X-RateLimit-Remaining": "0",
      },
    );
  }

  const sourceHash = hashSource(parsed.data.source);
  const detStarted = Date.now();

  try {
    const report = buildAnalysisReport(parsed.data.source);
    const deterministicMs = Date.now() - detStarted;

    let aiMs: number | undefined;
    if (!includeAi) {
      report.ai = {
        status: "skipped",
        citedFindingIds: [],
        summary: "AI explanation skipped",
        interpretation: "AI interpretation was not requested.",
      };
    } else {
      const resolved = resolveLlmProviderResult();
      if (!resolved.ok) {
        report.ai = {
          status: "skipped",
          citedFindingIds: [],
          summary: "AI explanation unavailable",
          interpretation: `${resolved.message} Deterministic analysis completed successfully.`,
        };
      } else {
        const aiStarted = Date.now();
        report.ai = await explainFindings(report, {
          enabled: true,
          provider: resolved.provider,
        });
        aiMs = Date.now() - aiStarted;
      }
    }

    const validated = AnalysisReportSchema.parse(report);

    logAnalyzeObservation({
      requestId,
      timestamp,
      sourceByteLength: sourceCheck.byteLength,
      sourceHash,
      deterministicMs,
      aiRequested: includeAi,
      aiMs,
      aiStatus: validated.ai?.status,
      findingCount: validated.findings.length,
      tokenIndicatorCount: validated.tokenIndicators.length,
    });

    return Response.json(validated, {
      headers: {
        "X-Request-Id": requestId,
        "X-RateLimit-Limit": String(rate.limit),
        "X-RateLimit-Remaining": String(rate.remaining),
      },
    });
  } catch (err) {
    if (err instanceof SolidityValidationError) {
      const tooLarge = /exceeds maximum size/i.test(err.message);
      logAnalyzeObservation({
        requestId,
        timestamp,
        sourceByteLength: sourceCheck.byteLength,
        sourceHash,
        deterministicMs: Date.now() - detStarted,
        aiRequested: includeAi,
        findingCount: 0,
        tokenIndicatorCount: 0,
        errorCode: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
      });
      return apiError(
        tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
        tooLarge
          ? "Source exceeds the maximum allowed size."
          : "Source failed validation.",
        tooLarge ? 413 : 400,
      );
    }

    if (err instanceof SolidityParseError) {
      logAnalyzeObservation({
        requestId,
        timestamp,
        sourceByteLength: sourceCheck.byteLength,
        sourceHash,
        deterministicMs: Date.now() - detStarted,
        aiRequested: includeAi,
        findingCount: 0,
        tokenIndicatorCount: 0,
        errorCode: "PARSE_ERROR",
      });
      return apiError(
        "PARSE_ERROR",
        "Failed to parse Solidity source. Check syntax and try again.",
        422,
      );
    }

    logAnalyzeObservation({
      requestId,
      timestamp,
      sourceByteLength: sourceCheck.byteLength,
      sourceHash,
      deterministicMs: Date.now() - detStarted,
      aiRequested: includeAi,
      findingCount: 0,
      tokenIndicatorCount: 0,
      errorCode: "INTERNAL_ERROR",
    });
    return apiError("INTERNAL_ERROR", "Analysis failed. Please try again.", 500);
  }
}
