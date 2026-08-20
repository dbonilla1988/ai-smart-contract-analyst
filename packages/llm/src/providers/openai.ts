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
    this.fetchImpl = options.fetchImpl ?? fetch;
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
        return {
          status: "failed",
          model: this.model,
          citedFindingIds: [],
          interpretation: "AI explanation is temporarily unavailable.",
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
    } catch {
      return {
        status: "failed",
        model: this.model,
        citedFindingIds: [],
        interpretation: "AI explanation failed or timed out.",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
