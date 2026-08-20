import { createHash } from "node:crypto";
import type { AnalysisReport, Finding } from "@asca/shared";
import { collectModifierPatterns, extractUnits } from "../extract/index.js";
import {
  parseSolidityOrThrow,
  SolidityParseError,
  SolidityValidationError,
} from "../parse/index.js";
import { runDetectors } from "../detectors/index.js";
import { detectTokenIndicators } from "../indicators/tokenIndicators.js";
import { normalizeFindings } from "../normalize/index.js";
import { countSeverities } from "../detectors/utils.js";

export const DETECTOR_VERSION = "0.4.0-phase4";

export interface BuildReportOptions {
  includeFindings?: Finding[];
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildOverviewSummary(
  units: AnalysisReport["units"],
  findingCount: number,
  tokenIndicatorCount: number,
): string {
  const contracts = units.filter((u) => u.kind === "contract").length;
  const abstracts = units.filter((u) => u.kind === "abstract").length;
  const interfaces = units.filter((u) => u.kind === "interface").length;
  const libraries = units.filter((u) => u.kind === "library").length;
  const functions = units.reduce((sum, u) => sum + u.functions.length, 0);

  const parts: string[] = [];
  if (contracts > 0) parts.push(pluralize(contracts, "contract"));
  if (abstracts > 0) parts.push(pluralize(abstracts, "abstract contract"));
  if (interfaces > 0) parts.push(pluralize(interfaces, "interface"));
  if (libraries > 0) parts.push(pluralize(libraries, "library"));
  if (parts.length === 0) parts.push("0 contract units");

  const parsed = `Parsed ${parts.join(", ")} and ${pluralize(functions, "function")}.`;

  const findingPart =
    findingCount === 0
      ? "No security-relevant findings detected by the current detector suite"
      : `Detected ${pluralize(findingCount, "security-relevant finding")}`;

  if (tokenIndicatorCount === 0) {
    return `${parsed} ${findingPart}.`;
  }

  if (findingCount === 0) {
    return `${parsed} ${findingPart}. Detected ${pluralize(tokenIndicatorCount, "token-interface indicator")}.`;
  }

  return `${parsed} ${findingPart} and ${pluralize(tokenIndicatorCount, "token-interface indicator")}.`;
}

/**
 * Build AnalysisReport:
 * source → parse → extract → detectors + token indicators → normalized findings
 */
export function buildAnalysisReport(
  source: string,
  options: BuildReportOptions = {},
): AnalysisReport {
  const parsed = parseSolidityOrThrow(source);
  const units = extractUnits(parsed);
  const detectorFindings = runDetectors({
    source,
    parsed,
    units,
  });
  const findings = normalizeFindings([
    ...detectorFindings,
    ...(options.includeFindings ?? []),
  ]);
  const tokenIndicators = detectTokenIndicators(units);
  const severityCounts = countSeverities(findings);

  const hash = createHash("sha256").update(source, "utf8").digest("hex");

  const privilegedSymbols = findings
    .filter((f) => f.detectorId === "privileged-function")
    .flatMap((f) => f.relatedSymbols ?? []);

  const externalCallFindings = findings.filter((f) =>
    ["delegatecall", "low-level-call", "unchecked-external-call"].includes(f.detectorId),
  );

  return {
    reportId: `rpt_${hash.slice(0, 12)}`,
    createdAt: new Date().toISOString(),
    input: {
      language: "solidity",
      byteLength: Buffer.byteLength(source, "utf8"),
      hash,
      pragma: parsed.pragmas.length > 0 ? parsed.pragmas : undefined,
    },
    overview: {
      summary: buildOverviewSummary(units, findings.length, tokenIndicators.length),
      contractCount: units.length,
      detectorVersion: DETECTOR_VERSION,
      findingCount: findings.length,
      severityCounts,
    },
    units,
    accessControl: {
      patterns: collectModifierPatterns(units),
      privilegedFunctions: [...new Set(privilegedSymbols)].sort(),
    },
    externalCalls: {
      count: externalCallFindings.length,
      items: externalCallFindings.flatMap((f) =>
        f.evidence
          .filter((e) => e.span)
          .map((e) => ({
            from: e.symbol ?? f.relatedSymbols?.[0] ?? "unknown",
            kind: f.detectorId,
            span: e.span!,
          })),
      ),
    },
    tokenIndicators,
    findings,
    ai: {
      status: "skipped",
      citedFindingIds: [],
    },
    limitations: [
      "Phase 4 findings are deterministic/heuristic static checks — not a substitute for a professional security audit.",
      "Presence of a pattern is not proof of exploitability.",
      "Token interface indicators are heuristic and do not prove standards compliance.",
      "Empty or sparse findings do not mean the contract is safe.",
      "Optional AI explanation summarizes detector output only and does not create or validate findings.",
      "In-memory rate limits are per server instance and are not globally distributed on serverless hosts.",
      "Slither and on-chain analysis are not enabled in this phase.",
    ],
  };
}

export { SolidityParseError, SolidityValidationError };
