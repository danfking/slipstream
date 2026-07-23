// Pure render transforms, kept out of app.js so they can be unit-tested without
// a DOM. Everything here takes data and returns data or a string; anything that
// touches the document lives in app.js.
//
// The markdown path is a single pure pipeline (see renderMarkdown), designed to
// be prefix-stable: rendering any prefix of a reply must never throw and must
// converge to the batch render — that property is what makes token streaming a
// display change later, not a pipeline change.

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

// ---------------------------------------------------------------------------
// Markdown normalization.
//
// The model is a stochastic markdown emitter: the same prompt produces clean
// CommonMark on one run and malformed markup on the next. So repairs are
// organised by DEFECT CLASS, not by observed instance — each transform kills a
// whole class, carries its rationale, and has fixtures in test/fixtures/replies.
// Adding a repair means adding a transform + a fixture, never patching a regex.
// Every transform must be idempotent and prefix-stable (no lookahead past the
// current block) — both properties are enforced by tests.
// ---------------------------------------------------------------------------

/** Split a line into segments, isolating inline code spans so no transform ever
 * rewrites the inside of backticks. Returns [{code: boolean, text}]. */
function splitCodeSpans(line) {
  const segments = [];
  const re = /`+[^`]*`+/g;
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) segments.push({ code: false, text: line.slice(last, m.index) });
    segments.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < line.length) segments.push({ code: false, text: line.slice(last) });
  return segments;
}

function mapNonCode(line, fn) {
  return splitCodeSpans(line)
    .map((seg) => (seg.code ? seg.text : fn(seg.text)))
    .join('');
}

/**
 * Class repair for `**` emphasis on one line: when the markers on a line are
 * balanced, rebuild the line trimming whitespace just inside each pair and
 * separating the markers from jammed neighbours outside. This retires the
 * per-variant regexes that let `**Financial action today **` escape: any
 * combination of inner spaces now normalizes, including nested `*em*` inside
 * the bold. Odd marker counts are left untouched — guessing the model's intent
 * on unbalanced emphasis creates worse output than literal asterisks, and the
 * lint (not this function) is responsible for flagging those.
 */
function repairStrongEmphasis(segment) {
  const parts = segment.split('**');
  if (parts.length < 3 || parts.length % 2 === 0) return segment; // none, or unbalanced
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const inside = i % 2 === 1;
    if (inside) {
      const content = parts[i].replace(/^\s+|\s+$/g, '');
      if (content === '') {
        out += '**' + parts[i] + '**'; // empty bold — leave for the lint to flag
        continue;
      }
      // Jam repair outside the opening marker: ".**Bold" reads as one word.
      if (/[.:;!?,)\]}]$/.test(out)) out += ' ';
      out += '**' + content + '**';
    } else {
      let text = parts[i];
      // Jam repair after a closing marker: "**bold**word" and "**bold**$16".
      if (i > 0 && /^[^\s.,;:!?)\]}*]/.test(text)) text = ' ' + text;
      out += text;
    }
  }
  return out;
}

const LIST_ITEM = /^\s{0,3}([-*+]|\d+[.)])\s+\S/;
const HEADING = /^\s{0,3}#{1,6}\s+\S/;
const FENCE = /^\s{0,3}(```|~~~)/;

/**
 * The transform table: one entry per defect class. Order matters — typography
 * folds first so later transforms see plain ASCII spacing.
 */
export const TRANSFORMS = [
  {
    name: 'fold-typography',
    why: 'Model emits U+2011 non-breaking hyphens and U+00A0/U+2009/U+202F spaces; they render tight enough that "10-12" was read as two numbers off a screenshot.',
    apply: (text) =>
      text
        .replace(/[\u2011\u2010]/g, '-')
        .replace(/[\u00A0\u2009\u202F]/g, ' '),
  },
  {
    name: 'strip-think',
    why: 'Local reasoning models can leak <think> blocks; providers.ts strips them server-side, but the renderer must not depend on which provider produced the text.',
    apply: (text) => text.replace(/<think>[\s\S]*?(<\/think>|$)/g, ''),
  },
  {
    name: 'repair-strong-emphasis',
    why: 'Spaces inside ** markers are invalid CommonMark and render as literal asterisks; jammed boundaries (".**Next**", "**total**$16k") read as one word. Class repair per line, code spans protected.',
    apply: (text) =>
      text
        .split('\n')
        .map((line) => mapNonCode(line, repairStrongEmphasis))
        .join('\n'),
  },
  {
    name: 'block-separation',
    why: 'With breaks:true a list or heading cannot interrupt a paragraph, so a missing blank line renders bullets as literal asterisks — the original briefing bug.',
    apply: (text) => {
      const lines = text.split('\n');
      const out = [];
      for (const [i, line] of lines.entries()) {
        const previous = i > 0 ? lines[i - 1] : '';
        const startsBlock = LIST_ITEM.test(line) || HEADING.test(line) || FENCE.test(line);
        const previousSame =
          (LIST_ITEM.test(line) && LIST_ITEM.test(previous)) ||
          (HEADING.test(line) && HEADING.test(previous));
        // Blank line before a block start...
        if (startsBlock && previous.trim() !== '' && !previousSame && !FENCE.test(previous)) out.push('');
        // ...and after a list or heading ends (MD032/MD022): without it, the
        // following paragraph is absorbed as lazy continuation of the list.
        else if (!startsBlock && line.trim() !== '' && (LIST_ITEM.test(previous) || HEADING.test(previous))) out.push('');
        out.push(line);
      }
      return out.join('\n');
    },
  },
];

/**
 * Normalize model markdown by running every class transform. Idempotent:
 * normalize(normalize(x)) === normalize(x), enforced by tests.
 */
export function normalizeMarkdown(text) {
  let out = String(text);
  for (const t of TRANSFORMS) out = t.apply(out);
  return out;
}

/**
 * The one markdown pipeline, pure and dependency-injected so the browser passes
 * window.marked/DOMPurify/remend and tests pass their npm equivalents:
 *
 *   normalize → complete (remend; no-op on complete buffers) → parse →
 *   sanitize → linkify tool citations
 *
 * Streaming later = re-run this on the accumulated buffer per chunk and morph
 * the DOM; nothing in here changes.
 */
export function renderMarkdown(text, toolNames, deps) {
  const complete = deps.complete ?? ((s) => s);
  const normalized = normalizeMarkdown(text);
  const completed = complete(normalized);
  const parsed = deps.parse(completed, { breaks: true });
  const clean = deps.sanitize(parsed);
  return linkifyToolCitations(clean, toolNames);
}

// ---------------------------------------------------------------------------
// Render lint: the machine that replaces a human eyeballing every reply.
// Given the raw model text and the pipeline's HTML output, report artifacts
// that mean the pipeline failed. Runs in vitest (fixtures), the golden batch
// (live replies), and the capture harness (rendered DOM).
// ---------------------------------------------------------------------------

/** Visible text of an HTML string with code/pre contents removed — code spans
 * may legitimately contain marker characters. Tag-strip is sufficient here
 * because the input is our own sanitized pipeline output, not arbitrary HTML. */
export function visibleText(html) {
  return String(html)
    .replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function lintRendered(raw, html) {
  const issues = [];
  const text = visibleText(html);
  if (text.includes('**')) issues.push('literal ** markers survived rendering');
  if (/(^|\s)\*\s|\s\*($|\s)/.test(text)) issues.push('stray * marker survived rendering');
  if (/<think>/i.test(text) || /<think>/i.test(html)) issues.push('<think> block reached the renderer');
  if (/[\u2011\u2010\u00A0\u2009\u202F]/.test(text)) issues.push('non-standard unicode spacing/hyphen survived');
  if (/[.:;!?]<(strong|b|h[1-6])\b/.test(html)) issues.push('jammed boundary: punctuation abuts a bold/heading with no space');
  if (/<(strong|b)>\s*<\/\1>/.test(html)) issues.push('empty emphasis element');
  return issues;
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
