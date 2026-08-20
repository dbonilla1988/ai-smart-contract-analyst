import type { LlmProvider } from "../types.js";
import { OpenAiLlmProvider } from "./openai.js";
import { validateLlmEnv } from "../env.js";

export { StubLlmProvider, stubExplainPayload } from "./stub.js";
export { OpenAiLlmProvider } from "./openai.js";

export interface ResolveProviderOptions {
  /** Override env for tests. */
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export type ResolveProviderResult =
  | { ok: true; provider: LlmProvider; model: string }
  | {
      ok: false;
      reason: "missing_api_key" | "invalid_api_key" | "invalid_model";
      message: string;
    };

/**
 * Resolve the configured LLM provider from environment.
 * Returns a structured result so callers can distinguish missing key vs invalid model.
 */
export function resolveLlmProviderResult(
  options: ResolveProviderOptions = {},
): ResolveProviderResult {
  const env = options.env ?? process.env;
  const validation = validateLlmEnv(env);

  if (validation.unavailableReason === "missing_api_key" || !validation.apiKeyPresent) {
    return {
      ok: false,
      reason: "missing_api_key",
      message:
        "AI explanation is unavailable because no LLM API key is configured on the server.",
    };
  }

  if (validation.unavailableReason === "invalid_api_key" || !validation.apiKey) {
    return {
      ok: false,
      reason: "invalid_api_key",
      message:
        "AI explanation is unavailable because OPENAI_API_KEY is not a valid header-safe key token.",
    };
  }

  if (validation.unavailableReason === "invalid_model" || !validation.model) {
    return {
      ok: false,
      reason: "invalid_model",
      message:
        "AI explanation is unavailable because OPENAI_MODEL is not on the server allowlist.",
    };
  }

  return {
    ok: true,
    model: validation.model,
    provider: new OpenAiLlmProvider({
      apiKey: validation.apiKey,
      model: validation.model,
      fetchImpl: options.fetchImpl,
    }),
  };
}

/**
 * Resolve the configured LLM provider from environment.
 * Returns null when no usable provider is available.
 */
export function resolveLlmProvider(options: ResolveProviderOptions = {}): LlmProvider | null {
  const result = resolveLlmProviderResult(options);
  return result.ok ? result.provider : null;
}
