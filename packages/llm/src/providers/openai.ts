import type { AiInterpretation, AnalysisReport } from "@asca/shared";
import type { LlmProvider } from "../types.js";
import { buildAiInputPayload, buildExplainUserPrompt } from "../payload.js";
import {
  AI_LIMITS,
  AiModelResponseSchema,
  SYSTEM_PROMPT,
  buildNoFindingsInterpretation,
} from "../prompts.js";
import { groundAiInterpretation } from "../grounding.js";
import { DEFAULT_OPENAI_MODEL, isAllowedOpenAiModel } from "../env.js";

export interface OpenAiProviderOptions {
  apiKey: string;
  model?: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

function resolveSafeModel(model: string | undefined): string {
  const candidate = (model ?? DEFAULT_OPENAI_MODEL).trim();
  if (!isAllowedOpenAiModel(candidate)) {
    // Defense in depth — constructor should only receive allowlisted models.
    return DEFAULT_OPENAI_MODEL;
  }
  return candidate;
}

/**
 * OpenAI Chat Completions adapter.
 * Sends bounded structured JSON only — never full Solidity source.
 * Model/token limits are server-enforced; clients cannot override them.
 */
export class OpenAiLlmProvider implements LlmProvider {
  readonly id = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  /** Tracks provider HTTP calls for tests / abuse awareness. */
  callCount = 0;

  constructor(options: OpenAiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = resolveSafeModel(options.model);
    // Prefer globalThis.fetch so bundlers cannot leave a bare `fetch` unbound.
    this.fetchImpl =
      options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.timeoutMs = options.timeoutMs ?? AI_LIMITS.timeoutMs;
  }

  async explainFindings(report: AnalysisReport): Promise<AiInterpretation> {
    if (report.findings.length === 0) {
      return {
        status: "ok",
        model: this.model,
        citedFindingIds: [],
        summary: "No security findings from the deterministic detector set",
        interpretation: buildNoFindingsInterpretation({
          overviewSummary: report.overview.summary,
          tokenIndicatorCount: report.tokenIndicators.length,
        }),
        priorityActions: [
          "Treat empty findings as incomplete coverage, not a clean bill of health.",
          "Review analyzer limitations before relying on this report.",
        ],
      };
    }

    const payload = buildAiInputPayload(report);
    const userPrompt = buildExplainUserPrompt(payload);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.callCount += 1;
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: AI_LIMITS.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        let providerCode: string | null = null;
        try {
          const errBody = (await response.json()) as {
            error?: { code?: string; type?: string };
          };
          providerCode = errBody.error?.code ?? errBody.error?.type ?? null;
        } catch {
          providerCode = null;
        }
        console.info(
          JSON.stringify({
            kind: "ai_provider_http_error",
            httpStatus: response.status,
            providerCode,
            model: this.model,
          }),
        );
        return {
          status: "failed",
          model: this.model,
          citedFindingIds: [],
          interpretation:
            response.status === 401
              ? "AI explanation is unavailable because the configured OpenAI API key was rejected by the provider."
              : "AI explanation is temporarily unavailable.",
        };
      }

      let data: { choices?: Array<{ message?: { content?: string } }> };
      try {
        data = (await response.json()) as typeof data;
      } catch {
        return {
          status: "failed",
          model: this.model,
          citedFindingIds: [],
          interpretation: "AI explanation could not be read.",
        };
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        return {
          status: "failed",
          model: this.model,
          citedFindingIds: [],
          interpretation: "AI explanation returned an empty response.",
        };
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch {
        return {
          status: "failed",
          model: this.model,
          citedFindingIds: [],
          interpretation: "AI explanation could not be parsed.",
        };
      }

      const modelParsed = AiModelResponseSchema.safeParse(parsedJson);
      if (!modelParsed.success) {
        return {
          status: "failed",
          model: this.model,
          citedFindingIds: [],
          interpretation: "AI explanation failed schema validation.",
        };
      }

      const grounded = groundAiInterpretation(report, modelParsed.data, this.model);
      return grounded.interpretation;
    } catch (err) {
      const e = err as {
        name?: string;
        message?: string;
        code?: unknown;
        cause?: { name?: string; code?: unknown; message?: string };
      };
      const name = e?.name ?? (err instanceof Error ? err.name : "UnknownError");
      const code = e?.code != null ? String(e.code) : undefined;
      const message = String(e?.message ?? "").slice(0, 160);
      const cause = e?.cause;
      // Privacy-safe diagnostics only — never log keys, prompts, or bodies.
      console.info(
        JSON.stringify({
          kind: "ai_provider_error",
          name,
          code: code ?? null,
          message: message.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]"),
          causeName: cause?.name ?? null,
          causeCode: cause?.code != null ? String(cause.code) : null,
          causeMessage: cause?.message
            ? String(cause.message).slice(0, 160).replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
            : null,
          model: this.model,
          timeoutMs: this.timeoutMs,
          fetchType: typeof this.fetchImpl,
        }),
      );
      const timedOut = name === "AbortError" || code === "ABORT_ERR";
      return {
        status: "failed",
        model: this.model,
        citedFindingIds: [],
        interpretation: timedOut
          ? "AI explanation timed out."
          : "AI explanation is temporarily unavailable.",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
