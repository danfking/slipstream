// Pure render transforms, kept out of app.js so they can be unit-tested without
// a DOM. Everything here takes data and returns data or a string; anything that
// touches the document lives in app.js.

const CHANNEL_LABELS = {
  blu_voice_agent: 'Blu Voice Agent',
  customer_portal: 'Customer Portal',
  staff: 'Staff',
};

/** Human-readable name for a record's `source` field. */
export function channelLabel(source) {
  if (CHANNEL_LABELS[source]) return CHANNEL_LABELS[source];
  return String(source)
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// Staff entry is the default path — badging it would be noise. The badge exists
// to answer "where did this come from if not from us", which is the ecosystem
// story: the partner owns the phone, the record owns the truth.
const UNREMARKABLE_SOURCES = new Set(['staff']);

/**
 * Distinct partner channels appearing anywhere in a tool result, in order of
 * first appearance. This is what makes the briefing's overnight items visibly
 * attributable to Blu instead of arriving from nowhere.
 */
export function collectSources(value) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const source = node.source;
    if (typeof source === 'string' && !UNREMARKABLE_SOURCES.has(source) && !found.includes(source)) {
      found.push(source);
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(value);
  return found;
}

const MAX_VALUE_CHARS = 40;

/** One-line "what was asked of this tool", instead of raw JSON in the panel. */
export function summarizeInput(input) {
  const entries = Object.entries(input ?? {});
  if (!entries.length) return 'no arguments';
  return entries
    .map(([key, value]) => {
      const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
      return `${key}: ${text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text}`;
    })
    .join(', ');
}

/**
 * Rewrite tool names the model marked up (`*get_unbilled_work*`, `\`draft_invoices\``)
 * into chips that point at the matching receipt, so a citation is a control
 * rather than stray asterisks in the prose.
 *
 * Only <em>/<code> mentions of tools actually called this turn are rewritten:
 * a name in plain prose stays prose, and a tool that never ran gets no chip it
 * could not scroll to. Runs after sanitizing — the emitted markup is ours and
 * the name is matched against the turn's own tool list, never interpolated raw.
 */
export function linkifyToolCitations(html, toolNames) {
  const called = new Set(toolNames ?? []);
  return String(html).replace(/<(em|code)>([a-z0-9_]+)<\/\1>/g, (whole, _tag, name) =>
    called.has(name) ? `<button type="button" class="citation" data-tool="${name}">${name}</button>` : whole,
  );
}
