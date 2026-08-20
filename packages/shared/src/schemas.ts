import { z } from "zod";

export const SeveritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "informational",
  "note",
]);
export type Severity = z.infer<typeof SeveritySchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Findings may only come from analysis engines — never from the LLM. */
export const FindingSourceSchema = z.enum(["deterministic", "heuristic", "slither"]);
export type FindingSource = z.infer<typeof FindingSourceSchema>;

export const SourceSpanSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  startCol: z.number().int().nonnegative().optional(),
  endCol: z.number().int().nonnegative().optional(),
  snippet: z.string().max(4000),
});
export type SourceSpan = z.infer<typeof SourceSpanSchema>;

export const EvidenceSchema = z.object({
  kind: z.enum(["source_span", "symbol", "pattern_match", "call_graph_edge"]),
  description: z.string(),
  span: SourceSpanSchema.optional(),
  symbol: z.string().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  detectorId: z.string().min(1),
  title: z.string().min(1),
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  category: z.string().min(1),
  description: z.string().min(1),
  remediation: z.string().min(1),
  evidence: z.array(EvidenceSchema),
  tags: z.array(z.string()),
  source: FindingSourceSchema,
  relatedSymbols: z.array(z.string()).optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const FunctionKindSchema = z.enum(["function", "constructor", "fallback", "receive"]);
export type FunctionKind = z.infer<typeof FunctionKindSchema>;

export const FunctionSummarySchema = z.object({
  name: z.string(),
  kind: FunctionKindSchema.default("function"),
  visibility: z.enum(["public", "external", "internal", "private", "unknown"]),
  stateMutability: z
    .enum(["pure", "view", "payable", "nonpayable", "unknown"])
    .optional(),
  modifiers: z.array(z.string()).optional(),
  payable: z.boolean().optional(),
  parameters: z.array(z.string()).optional(),
  returns: z.array(z.string()).optional(),
  signature: z.string().optional(),
  selectors: z.array(z.string()).optional(),
  /** Reserved for Phase 2 detectors — do not set from structural extraction alone. */
  isPrivileged: z.boolean().optional(),
  span: SourceSpanSchema.optional(),
});
export type FunctionSummary = z.infer<typeof FunctionSummarySchema>;

export const StateVariableSummarySchema = z.object({
  name: z.string(),
  typeName: z.string(),
  visibility: z.enum(["public", "internal", "private", "unknown"]),
  isConstant: z.boolean().optional(),
  isImmutable: z.boolean().optional(),
  span: SourceSpanSchema.optional(),
});
export type StateVariableSummary = z.infer<typeof StateVariableSummarySchema>;

export const EventSummarySchema = z.object({
  name: z.string(),
  parameters: z.array(z.string()),
  signature: z.string().optional(),
  span: SourceSpanSchema.optional(),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

export const CustomErrorSummarySchema = z.object({
  name: z.string(),
  parameters: z.array(z.string()),
  signature: z.string().optional(),
  span: SourceSpanSchema.optional(),
});
export type CustomErrorSummary = z.infer<typeof CustomErrorSummarySchema>;

export const ModifierSummarySchema = z.object({
  name: z.string(),
  parameters: z.array(z.string()).optional(),
  span: SourceSpanSchema.optional(),
});
export type ModifierSummary = z.infer<typeof ModifierSummarySchema>;

export const ContractUnitSchema = z.object({
  name: z.string(),
  kind: z.enum(["contract", "interface", "library", "abstract"]),
  inheritance: z.array(z.string()),
  functions: z.array(FunctionSummarySchema),
  stateVariables: z.array(StateVariableSummarySchema).optional(),
  events: z.array(EventSummarySchema).optional(),
  errors: z.array(CustomErrorSummarySchema).optional(),
  modifiers: z.array(ModifierSummarySchema).optional(),
});
export type ContractUnit = z.infer<typeof ContractUnitSchema>;

/**
 * AI output is interpretation only.
 * It must cite existing Finding.id values and must never create Finding objects.
 */
export const AiRiskThemeSchema = z.object({
  title: z.string().min(1),
  findingIds: z.array(z.string()),
  explanation: z.string().min(1),
});
export type AiRiskTheme = z.infer<typeof AiRiskThemeSchema>;

export const AiInterpretationSchema = z.object({
  status: z.enum(["ok", "skipped", "failed"]),
  interpretation: z.string().optional(),
  summary: z.string().optional(),
  priorityActions: z.array(z.string()).optional(),
  riskThemes: z.array(AiRiskThemeSchema).optional(),
  citedFindingIds: z.array(z.string()),
  model: z.string().optional(),
});
export type AiInterpretation = z.infer<typeof AiInterpretationSchema>;

export const AnalysisReportSchema = z.object({
  reportId: z.string().min(1),
  createdAt: z.string().datetime(),
  input: z.object({
    language: z.literal("solidity"),
    byteLength: z.number().int().nonnegative(),
    hash: z.string().min(1),
    pragma: z.array(z.string()).optional(),
  }),
  overview: z.object({
    summary: z.string(),
    contractCount: z.number().int().nonnegative(),
    detectorVersion: z.string(),
    findingCount: z.number().int().nonnegative().optional(),
    severityCounts: z
      .object({
        critical: z.number().int().nonnegative(),
        high: z.number().int().nonnegative(),
        medium: z.number().int().nonnegative(),
        low: z.number().int().nonnegative(),
        informational: z.number().int().nonnegative(),
        note: z.number().int().nonnegative(),
      })
      .optional(),
  }),
  units: z.array(ContractUnitSchema),
  accessControl: z.object({
    patterns: z.array(z.string()),
    privilegedFunctions: z.array(z.string()),
  }),
  externalCalls: z.object({
    count: z.number().int().nonnegative(),
    items: z.array(
      z.object({
        from: z.string(),
        kind: z.string(),
        span: SourceSpanSchema,
      }),
    ),
  }),
  tokenIndicators: z.array(
    z.object({
      standard: z.string(),
      confidence: ConfidenceSchema,
      evidence: z.array(EvidenceSchema),
    }),
  ),
  findings: z.array(FindingSchema),
  ai: AiInterpretationSchema.optional(),
  limitations: z.array(z.string()),
});
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;

export const AnalyzeRequestSchema = z.object({
  source: z.string().min(1).max(500_000),
  options: z
    .object({
      includeAiInterpretation: z.boolean().optional(),
      locale: z.string().optional(),
    })
    .optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const MAX_SOLIDITY_SOURCE_BYTES = 500_000;
