import type { AiInterpretation, AnalysisReport } from "@asca/shared";
import type { ExplainFindingsOptions } from "./types.js";
import { resolveLlmProvider } from "./providers/index.js";
import { buildNoFindingsInterpretation } from "./prompts.js";

function skipped(message: string, model?: string): AiInterpretation {
  return {
    status: "skipped",
    model,
    citedFindingIds: [],
    interpretation: message,
    summary: "AI explanation skipped",
  };
}

/**
 * Explain deterministic findings via an LLM provider adapter.
 *
 * - Never mutates findings / severity / confidence
 * - Skips cleanly when disabled or when no API key is configured
 * - On provider failure returns status "failed" (caller should still return the report)
 */
export async function explainFindings(
  report: AnalysisReport,
  options: ExplainFindingsOptions = {},
): Promise<AiInterpretation> {
  if (options.enabled === false) {
    return skipped("AI interpretation was not requested.");
  }

  const provider =
    options.provider ??
    resolveLlmProvider({
      env: options.env ?? process.env,
    });

  if (!provider) {
    return skipped(
      "AI explanation is unavailable because no LLM API key is configured on the server.",
    );
  }

  // Empty findings: local safe narrative — do not invent risks and do not spend a model call.
  if (report.findings.length === 0) {
    return {
      status: "ok",
      model: provider.id,
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

  try {
    const result = await provider.explainFindings(report);
    // Defense in depth: re-filter citations even if the provider already grounded.
    const known = new Set(report.findings.map((f) => f.id));
    const citedFindingIds = result.citedFindingIds.filter((id) => known.has(id));
    const riskThemes = result.riskThemes
      ?.map((theme) => ({
        ...theme,
        findingIds: theme.findingIds.filter((id) => known.has(id)),
      }))
      .filter((theme) => theme.findingIds.length > 0);

    return {
      ...result,
      citedFindingIds,
      riskThemes,
    };
  } catch {
    return {
      status: "failed",
      citedFindingIds: [],
      interpretation: "AI explanation failed.",
      summary: "AI explanation failed",
    };
  }
}
