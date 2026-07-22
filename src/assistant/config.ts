// Model and provider are config, not architecture (decision record A5).
// Defaults: Anthropic + Sonnet tier for an interactive routing workload.
// SLIPSTREAM_PROVIDER=openai + SLIPSTREAM_BASE_URL flips to any
// OpenAI-compatible endpoint (local Ollama, OpenAI) — see providers.ts.
import { defaultModel } from './providers.js';

export const MODEL = defaultModel();
export const MAX_TOKENS = 2048;
export const MAX_LOOP_ITERATIONS = 8;
