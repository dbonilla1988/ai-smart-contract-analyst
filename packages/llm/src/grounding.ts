import type { AiInterpretation, AnalysisReport } from "@asca/shared";
import type { AiModelResponse } from "./prompts.js";

export interface GroundingResult {
  ok: boolean;
  interpretation: AiInterpretation;
  droppedIds: string[];
}

/**
 * Ensure all cited / theme finding IDs exist in the deterministic report.
 * Unknown IDs are dropped (sanitized). Findings themselves are never mutated.
 */
export function groundAiInterpretation(
  report: AnalysisReport,
  raw: AiModelResponse,
  model: string,
): GroundingResult {
  const known = new Set(report.findings.map((f) => f.id));
  const dropped = new Set<string>();

  const filterIds = (ids: string[]): string[] => {
    const kept: string[] = [];
    for (const id of ids) {
      if (known.has(id)) {
        if (!kept.includes(id)) kept.push(id);
      } else {
        dropped.add(id);
      }
    }
    return kept;
  };

  const citedFindingIds = filterIds(raw.citedFindingIds ?? []);
  const riskThemes = (raw.riskThemes ?? [])
    .map((theme) => ({
      title: theme.title,
      explanation: theme.explanation,
      findingIds: filterIds(theme.findingIds),
    }))
    .filter((theme) => theme.findingIds.length > 0 || report.findings.length === 0);

  // If the model invented many unknown IDs and kept almost none while findings exist, fail safely.
  const unknownHeavy =
    report.findings.length > 0 &&
    dropped.size > 0 &&
    citedFindingIds.length === 0 &&
    (raw.citedFindingIds?.length ?? 0) > 0;

  if (unknownHeavy) {
    return {
      ok: false,
      droppedIds: [...dropped],
      interpretation: {
        status: "failed",
        model,
        citedFindingIds: [],
        interpretation:
          "AI explanation failed grounding validation (unknown finding citations) and was discarded.",
      },
    };
  }

  return {
    ok: true,
    droppedIds: [...dropped],
    interpretation: {
      status: "ok",
      model,
      summary: raw.summary,
      interpretation: raw.interpretation,
      priorityActions: raw.priorityActions,
      riskThemes: riskThemes.length > 0 ? riskThemes : undefined,
      citedFindingIds,
    },
  };
}
