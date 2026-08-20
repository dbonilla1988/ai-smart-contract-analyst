import type { AiInterpretation, AnalysisReport } from "@asca/shared";

/**
 * LLM provider interface.
 * Providers explain existing findings — they never create Finding objects.
 */
export interface LlmProvider {
  readonly id: string;
  explainFindings(report: AnalysisReport): Promise<AiInterpretation>;
}

export interface ExplainFindingsOptions {
  provider?: LlmProvider;
  /** When false, returns skipped without calling a provider. */
  enabled?: boolean;
  /** Explicit API key presence signal for skip messaging (server sets this). */
  apiKeyAvailable?: boolean;
  /** Override process.env when resolving a default provider (tests). */
  env?: NodeJS.ProcessEnv;
}
