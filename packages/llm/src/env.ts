/** Allowed OpenAI chat models for V1. Client cannot override. */
export const OPENAI_MODEL_ALLOWLIST = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
] as const;

export type AllowedOpenAiModel = (typeof OPENAI_MODEL_ALLOWLIST)[number];

export const DEFAULT_OPENAI_MODEL: AllowedOpenAiModel = "gpt-4o-mini";

export function isAllowedOpenAiModel(model: string): model is AllowedOpenAiModel {
  return (OPENAI_MODEL_ALLOWLIST as readonly string[]).includes(model);
}

export interface LlmEnvValidation {
  apiKeyPresent: boolean;
  /** Resolved allowlisted model, or null when unavailable/invalid. */
  model: AllowedOpenAiModel | null;
  /** Why AI cannot run, if any. */
  unavailableReason?: "missing_api_key" | "invalid_model";
}

/**
 * Validate LLM environment without throwing.
 * Deterministic analysis must work even when this fails.
 */
export function validateLlmEnv(env: NodeJS.ProcessEnv = process.env): LlmEnvValidation {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      apiKeyPresent: false,
      model: null,
      unavailableReason: "missing_api_key",
    };
  }

  const requested = (env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL).trim();
  if (!isAllowedOpenAiModel(requested)) {
    return {
      apiKeyPresent: true,
      model: null,
      unavailableReason: "invalid_model",
    };
  }

  return {
    apiKeyPresent: true,
    model: requested,
  };
}
