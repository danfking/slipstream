// Predicted next question (issue #3). The staged product arc (assistant →
// advisor → agent teams) needs a measured gate before the advisor tier is
// worth building: do people accept proactive suggestions? This is the cheapest
// honest probe — a static follow-up per tool, no extra model call, and the
// shown→used rate tells us whether proactivity earns its place.

import { TOOLS } from '../tools/registry.js';
import type { ChatClient } from './chat.js';

export interface Suggestion {
  text: string;
  source: string; // tool name the static map keyed on, 'llm', or 'starter'
}

// Each entry answers: after a question that ran THIS tool, what does a marina
// operator naturally ask next? Deliberately hand-written from the demo
// vocabulary — a v1 heuristic the metric can judge before anything smarter.
const FOLLOW_UPS: Record<string, string> = {
  search_customers: 'What open work orders does this customer have?',
  // Same canonical text as the starter, so the asked-exclusion dedupes them.
  get_work_orders: 'Which jobs are blocked waiting on parts?',
  get_unbilled_work: 'Draft invoices for the completed work we have not billed yet.',
  draft_invoices: 'Who owes us money, and how overdue are they?',
  get_schedule_load: 'Which jobs are blocked waiting on parts?',
  get_parts_blockers: 'How much completed work have we not billed yet?',
  get_receivables: 'Which overdue customers have boats in the yard right now?',
  get_occupancy: 'Can we keep up with the haul-out schedule over the next three weeks?',
  get_overnight_activity: 'What is this week\'s biggest operational risk?',
};

// When a turn calls no tools (or every mapped follow-up has been asked), fall
// back to a starter question rather than the inert default hint: after any
// reply the placeholder should hold something Tab can actually take. Ordered
// by demo value; already-asked ones are skipped like any other suggestion.
const STARTERS: string[] = [
  'How much completed work have we not billed yet?',
  'Who owes us money, and how overdue are they?',
  'Which jobs are blocked waiting on parts?',
  'Can we keep up with the haul-out schedule over the next three weeks?',
  'What happened overnight?',
  'How full are the slips right now?',
];

export const SUGGESTION_SOURCES = new Set([...Object.keys(FOLLOW_UPS), 'starter', 'llm']);

const normalize = (q: string) => q.trim().toLowerCase();
const askedSet = (alreadyAsked: string[]) =>
  new Set(alreadyAsked.filter((q) => typeof q === 'string').map(normalize));

/**
 * Sanitizes raw model output into one clean question, or null. Model output is
 * untrusted: reasoning leakage, preambles, quotes, list markers, rambling.
 * Null means the caller falls back to the static map — the LLM path can only
 * ever degrade to current behavior, never below it.
 */
export function extractSuggestionText(raw: string, alreadyAsked: string[] = []): string | null {
  let t = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
  if (t.includes('</think>')) t = t.slice(t.lastIndexOf('</think>') + '</think>'.length);
  // Reasoning models can leak untagged deliberation before the question; the
  // conclusion comes last, so take the last plausible question line.
  const lines = t.split('\n').map((s) => s.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    const q = line
      .replace(/^(?:[-*>]|\d+[.)])\s+/, '')
      .replace(/^["'`]+/, '')
      .replace(/["'`]+$/, '')
      .trim();
    if (!q || q.length > 140 || !q.endsWith('?')) continue;
    if (askedSet(alreadyAsked).has(normalize(q))) return null; // the model's pick was already asked — do not fish deeper
    return q;
  }
  return null;
}

/**
 * Contextual suggestion: one extra small model call after the reply, so the
 * suggestion tracks what the answer actually said (the static map cannot know
 * the briefing's headline was overdue invoices). Guard rails stay in code:
 * sanitizer, asked-exclusion, timeout, and null-on-anything-wrong so the
 * caller falls back to the static map.
 */
export async function generateSuggestion(
  client: ChatClient,
  model: string,
  conversation: { role: string; content: unknown }[],
  alreadyAsked: string[],
  timeoutMs = 20_000,
): Promise<Suggestion | null> {
  const transcript = conversation
    .filter((m) => typeof m.content === 'string')
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${(m.content as string).slice(0, 600)}`)
    .join('\n');
  const toolLines = TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  // Single user message: provider-safe (Anthropic requires the first message
  // to be a user turn), and no tools are offered — this call must only write.
  const params = {
    model,
    // Generous on purpose: reasoning models spend most of this thinking, and
    // a truncated thought yields no question at all (seen with qwen3:4b and
    // gpt-oss). "Reasoning: low" is gpt-oss's own dial for exactly this; other
    // models read it as an ignorable style hint.
    max_tokens: 800,
    system:
      'Reasoning: low\n' +
      'You suggest the next question for the operator of a marina operations assistant. ' +
      'Reply with exactly one short question and nothing else: no preamble, no quotes, no list. ' +
      'It must be answerable from the data tools listed, must follow naturally from the conversation, ' +
      'and must not repeat a question already asked.',
    messages: [
      {
        role: 'user',
        content: `Conversation so far:\n${transcript}\n\nData tools available:\n${toolLines}\n\nSuggest the single best next question I should ask.`,
      },
    ],
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resp: any = await Promise.race([
      client.create(params),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('suggestion timeout')), timeoutMs);
      }),
    ]);
    const text = (resp.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    const q = extractSuggestionText(text, alreadyAsked);
    return q ? { text: q, source: 'llm' } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Most recent tool with a mapped follow-up wins; null when nothing maps.
 * A follow-up the user has already asked in this conversation is skipped —
 * otherwise a static map loops (ask the suggestion, the answer runs the same
 * tool, the same suggestion comes back). The server is stateless, but every
 * request carries the conversation, so the exclusion needs no session state.
 */
export function suggestNext(toolNames: string[], alreadyAsked: string[] = []): Suggestion | null {
  // API callers may send block-array content (the adapters accept it); only
  // string turns can match a follow-up, and nothing here may throw post-reply.
  const asked = askedSet(alreadyAsked);
  for (let i = toolNames.length - 1; i >= 0; i--) {
    const text = FOLLOW_UPS[toolNames[i]];
    if (text && !asked.has(normalize(text))) return { text, source: toolNames[i] };
  }
  for (const text of STARTERS) {
    if (!asked.has(normalize(text))) return { text, source: 'starter' };
  }
  return null;
}
