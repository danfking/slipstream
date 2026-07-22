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

// Only an outside channel gets the gold chip. The customer portal is the
// marina's own self-service front door, so badging it identically would blunt
// the one signal the chip carries: this record came in from beyond the yard.
const PARTNER_SOURCES = new Set(['blu_voice_agent']);

export function isPartnerChannel(source) {
  return PARTNER_SOURCES.has(source);
}

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

const LIST_ITEM = /^\s{0,3}([-*+]|\d+[.)])\s+\S/;

/**
 * Insert the blank line a list needs when the model runs it straight on from
 * the line above. We render with `breaks: true` so single newlines become <br>
 * (operational answers are written line-per-fact), but that also stops a list
 * from interrupting a paragraph — so "Overdue total:\n* $12,400" came out with
 * literal asterisks in the briefing, the demo's opening frame.
 */
export function normalizeMarkdown(text) {
  const repaired = String(text)
    // The model writes non-breaking hyphens and narrow no-break spaces
    // ("haul‑out", "54 hrs"). They render so tight that a date range reads as
    // a missing separator — a reviewer read "10‑12" as "10 12" off a screenshot.
    .replace(/‑/g, '-')
    .replace(/[  ]/g, ' ')
    // "** Blu Voice Agent**" — a space inside the opening marker is not valid
    // emphasis, so CommonMark renders the asterisks literally. Same defect
    // class as the bullet lists, just inline.
    .replace(/\*\*\s+([^*\n]+?)\s*\*\*/g, '**$1**')
    .replace(/\*\*([^*\n]+?)\s+\*\*/g, '**$1** ');

  // "**Unbilled completed work:**$16,419" — the model omits the space often
  // enough that the headline figure of the money answer runs into its label.
  const spaced = repaired
    .replace(/(\*\*[^*\n]+\*\*)(?=[^\s.,;:!?)\]}])/g, '$1 ')
    // ...and the mirror case: "no shortfall.**Next steps:**" runs a new bold
    // heading onto the end of the previous sentence.
    .replace(/([^\s*([{"'])(\*\*[^*\n]+\*\*)/g, '$1 $2');
  const lines = spaced.split('\n');
  const out = [];
  for (const [i, line] of lines.entries()) {
    const previous = i > 0 ? lines[i - 1] : '';
    if (LIST_ITEM.test(line) && previous.trim() !== '' && !LIST_ITEM.test(previous)) out.push('');
    out.push(line);
  }
  return out.join('\n');
}

const MAX_VALUE_CHARS = 40;

/** One-line "what was asked of this tool", instead of raw JSON in the panel. */
export function summarizeInput(input) {
  // Models routinely send "" for optional arguments; rendering those as bare
  // colons made a working call look like a malformed one.
  const entries = Object.entries(input ?? {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
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
