import type { AiInterpretation, AnalysisReport } from "@asca/shared";
import type { LlmProvider } from "../types.js";
import { buildAiInputPayload, buildExplainUserPrompt } from "../payload.js";
import { buildNoFindingsInterpretation } from "../prompts.js";

/** Phase 0/3 stub provider — no network calls. Useful for tests. */
export class StubLlmProvider implements LlmProvider {
  readonly id = "stub";

  async explainFindings(report: AnalysisReport): Promise<AiInterpretation> {
    if (report.findings.length === 0) {
      return {
        status: "ok",
        model: this.id,
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

    const ids = report.findings.map((f) => f.id);
    return {
      status: "ok",
      model: this.id,
      citedFindingIds: ids,
      summary: `Stub explanation of ${ids.length} deterministic finding(s)`,
      interpretation:
        "Stub explanation: the following finding IDs were produced by deterministic/heuristic detectors — " +
        ids.join(", "),
      priorityActions: report.findings.slice(0, 3).map((f) => `Review ${f.id}: ${f.title}`),
      riskThemes: [
        {
          title: "Deterministic findings (stub grouping)",
          findingIds: ids,
          explanation: "Grouped for UI wiring only; not an AI risk model.",
        },
      ],
    };
  }
}

/** Test helper that builds prompts the same way as real providers (no network). */
export function stubExplainPayload(report: AnalysisReport) {
  const payload = buildAiInputPayload(report);
  return {
    payload,
    userPrompt: buildExplainUserPrompt(payload),
  };
}
