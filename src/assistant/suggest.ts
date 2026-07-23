// Predicted next question (issue #3). The staged product arc (assistant →
// advisor → agent teams) needs a measured gate before the advisor tier is
// worth building: do people accept proactive suggestions? This is the cheapest
// honest probe — a static follow-up per tool, no extra model call, and the
// shown→used rate tells us whether proactivity earns its place.

export interface Suggestion {
  text: string;
  source: string; // the tool call the suggestion was derived from
}

// Each entry answers: after a question that ran THIS tool, what does a marina
// operator naturally ask next? Deliberately hand-written from the demo
// vocabulary — a v1 heuristic the metric can judge before anything smarter.
const FOLLOW_UPS: Record<string, string> = {
  search_customers: 'What open work orders does this customer have?',
  get_work_orders: 'Are any of these jobs blocked waiting on parts?',
  get_unbilled_work: 'Draft invoices for the completed work we have not billed yet.',
  draft_invoices: 'Who owes us money, and how overdue are they?',
  get_schedule_load: 'Which jobs are blocked waiting on parts?',
  get_parts_blockers: 'How much completed work have we not billed yet?',
  get_receivables: 'Which overdue customers have boats in the yard right now?',
  get_occupancy: 'Can we keep up with the haul-out schedule over the next three weeks?',
  get_overnight_activity: 'What is this week\'s biggest operational risk?',
};

export const SUGGESTION_SOURCES = new Set(Object.keys(FOLLOW_UPS));

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
  const asked = new Set(alreadyAsked.filter((q) => typeof q === 'string').map((q) => q.trim().toLowerCase()));
  for (let i = toolNames.length - 1; i >= 0; i--) {
    const text = FOLLOW_UPS[toolNames[i]];
    if (text && !asked.has(text.trim().toLowerCase())) return { text, source: toolNames[i] };
  }
  return null;
}
