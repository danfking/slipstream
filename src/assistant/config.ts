// Model is config, not architecture (decision record A5). Default per A5:
// Sonnet tier for an interactive routing workload; override via env.
export const MODEL = process.env.SLIPSTREAM_MODEL ?? 'claude-sonnet-5';
export const MAX_TOKENS = 2048;
export const MAX_LOOP_ITERATIONS = 8;
