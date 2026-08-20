import type { AnalysisReport, Finding } from "@asca/shared";
import { AI_LIMITS } from "./prompts.js";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function boundFinding(finding: Finding) {
  const evidence = finding.evidence.slice(0, AI_LIMITS.maxEvidencePerFinding).map((ev) => ({
    kind: ev.kind,
    description: truncate(ev.description, 240),
    symbol: ev.symbol,
    snippet: ev.span?.snippet
      ? truncate(ev.span.snippet, AI_LIMITS.maxSnippetLength)
      : undefined,
    startLine: ev.span?.startLine,
  }));

  return {
    id: finding.id,
    detectorId: finding.detectorId,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    description: truncate(finding.description, 600),
    remediation: truncate(finding.remediation, 400),
    relatedSymbols: finding.relatedSymbols?.slice(0, 8),
    evidence,
  };
}

/**
 * Bounded structured payload for the LLM.
 * Never includes full Solidity source.
 */
export function buildAiInputPayload(report: AnalysisReport) {
  const findings = report.findings.slice(0, AI_LIMITS.maxFindings).map(boundFinding);

  return {
    overview: {
      summary: report.overview.summary,
      contractCount: report.overview.contractCount,
      detectorVersion: report.overview.detectorVersion,
      findingCount: report.overview.findingCount ?? report.findings.length,
      severityCounts: report.overview.severityCounts,
    },
    findings,
    tokenIndicators: report.tokenIndicators.slice(0, AI_LIMITS.maxTokenIndicators).map((t) => ({
      standard: t.standard,
      confidence: t.confidence,
      evidence: t.evidence.slice(0, 6).map((e) => ({
        description: truncate(e.description, 200),
        symbol: e.symbol,
      })),
    })),
    limitations: report.limitations.slice(0, AI_LIMITS.maxLimitations),
    instructions: {
      citeOnlyProvidedFindingIds: true,
      tokenIndicatorsAreNotFindings: true,
      doNotInventVulnerabilities: true,
      untrustedEvidenceSnippets: true,
    },
  };
}

export type AiInputPayload = ReturnType<typeof buildAiInputPayload>;

export function buildExplainUserPrompt(payload: AiInputPayload): string {
  return [
    "Explain the following deterministic analysis report for a developer audience.",
    "Use only the structured JSON. Cite finding IDs from findings[].id only.",
    "If findings is empty, do not invent risks — explain limited coverage, structure, token indicators, and limitations.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}
