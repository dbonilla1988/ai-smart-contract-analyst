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

/**
 * Normalize OPENAI_API_KEY for HTTP Authorization headers.
 *
 * Vercel/dashboard paste artifacts (quotes, whitespace, CTL, accidental "Bearer ")
 * otherwise cause undici/Node to throw TypeError on Headers.append before any
 * network call — which previously surfaced as a generic "failed or timed out".
 *
 * Returns null when the value cannot be made into a header-safe OpenAI key token.
 */
export function normalizeOpenAiApiKey(raw: string | undefined): string | null {
  if (!raw) return null;

  let key = raw.trim();
  if (
    key.length >= 2 &&
    ((key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'")))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Strip accidental Bearer prefix if the full header value was pasted.
  key = key.replace(/^bearer\s+/i, "");

  // Keys are contiguous tokens — remove all whitespace / CTL characters.
  let cleaned = "";
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) continue;
    cleaned += key[i];
  }
  key = cleaned;

  if (!key.startsWith("sk-")) return null;

  // Authorization header values must be Latin-1 / printable ASCII here.
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return null;
  }

  return key;
}

export interface LlmEnvValidation {
  apiKeyPresent: boolean;
  /** Normalized header-safe key when usable. */
  apiKey: string | null;
  /** Resolved allowlisted model, or null when unavailable/invalid. */
  model: AllowedOpenAiModel | null;
  /** Why AI cannot run, if any. */
  unavailableReason?: "missing_api_key" | "invalid_api_key" | "invalid_model";
}

/**
 * Validate LLM environment without throwing.
 * Deterministic analysis must work even when this fails.
 */
export function validateLlmEnv(env: NodeJS.ProcessEnv = process.env): LlmEnvValidation {
  const rawKey = env.OPENAI_API_KEY;
  if (!rawKey?.trim()) {
    return {
      apiKeyPresent: false,
      apiKey: null,
      model: null,
      unavailableReason: "missing_api_key",
    };
  }

  const apiKey = normalizeOpenAiApiKey(rawKey);
  if (!apiKey) {
    return {
      apiKeyPresent: true,
      apiKey: null,
      model: null,
      unavailableReason: "invalid_api_key",
    };
  }

  const requested = (env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL).trim();
  if (!isAllowedOpenAiModel(requested)) {
    return {
      apiKeyPresent: true,
      apiKey,
      model: null,
      unavailableReason: "invalid_model",
    };
  }

  return {
    apiKeyPresent: true,
    apiKey,
    model: requested,
  };
}
