import { channelLabel, collectSources, isPartnerChannel, renderMarkdown, summarizeInput } from './render.js';
import remend from './vendor/remend.js';

const messagesEl = document.getElementById('messages');
const receiptsEl = document.getElementById('receipts');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const briefingBtn = document.getElementById('briefing-btn');

const history = []; // {role, content} resent each turn

// --- predicted next question (issue #3) --------------------------------------
// The server derives a likely follow-up from the last turn's tool calls; it
// shows up in the input placeholder and Tab accepts it. Whether people take
// the suggestion is the measured gate for the advisor tier, so acceptance is
// reported back on the next question via headers the server counts.
const DEFAULT_PLACEHOLDER = input.placeholder;
let suggestion = null; // {text, source} from the latest reply
let acceptedSuggestion = null; // set when Tab fills the input

function setSuggestion(s) {
  suggestion = s ?? null;
  // Front-load the "Tab" affordance so it is never the part that clips on a
  // narrow input, and truncate a long question so it ends in an ellipsis
  // rather than a hard cut (issue #32). Tab still accepts the full text.
  if (!suggestion) {
    input.placeholder = DEFAULT_PLACEHOLDER;
    return;
  }
  const t = suggestion.text;
  const shown = t.length > 68 ? `${t.slice(0, 67).trimEnd()}…` : t;
  input.placeholder = `Tab to ask: ${shown}`;
}

function suggestionUseHeaders(question) {
  if (!acceptedSuggestion) return {};
  const headers = {
    'x-suggestion-used': question === acceptedSuggestion.text ? 'verbatim' : 'edited',
    'x-suggestion-source': acceptedSuggestion.source,
  };
  acceptedSuggestion = null;
  return headers;
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey && suggestion && !input.value.trim()) {
    e.preventDefault();
    input.value = suggestion.text;
    acceptedSuggestion = suggestion;
    syncSendState();
  }
});

// --- credential gate (hosted mode) -----------------------------------------
// BYO credentials live in this browser only; every request carries them as
// headers and the server builds a throwaway client. The passcode path instead
// sets an httpOnly session cookie that unlocks the server-held key.
const gate = document.getElementById('gate');
const BYO_STORE = 'slipstream_byo';

function byoHeaders() {
  try {
    const byo = JSON.parse(localStorage.getItem(BYO_STORE) ?? 'null');
    if (!byo?.key) return {};
    const headers = { 'x-llm-key': byo.key, 'x-llm-provider': byo.provider };
    if (byo.baseUrl) headers['x-llm-base-url'] = byo.baseUrl;
    if (byo.model) headers['x-llm-model'] = byo.model;
    return headers;
  } catch {
    return {};
  }
}

function openGate() {
  if (!gate.open) gate.showModal();
}

document.getElementById('gate-provider').addEventListener('change', (e) => {
  document.getElementById('gate-base-url').classList.toggle('gate-hidden', e.target.value !== 'custom');
});

document.getElementById('gate-passcode-btn').addEventListener('click', async () => {
  const resp = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode: document.getElementById('gate-passcode').value }),
  });
  if (resp.ok) {
    gate.close();
  } else {
    document.getElementById('gate-passcode-error').textContent = 'Wrong passcode.';
  }
});

document.getElementById('gate-key-btn').addEventListener('click', () => {
  const provider = document.getElementById('gate-provider').value;
  const key = document.getElementById('gate-key').value.trim();
  if (!key) return;
  localStorage.setItem(
    BYO_STORE,
    JSON.stringify({
      provider: provider === 'custom' ? 'openai' : provider,
      key,
      baseUrl: provider === 'custom' ? document.getElementById('gate-base-url').value.trim() : undefined,
      model: document.getElementById('gate-model').value.trim() || undefined,
    }),
  );
  gate.close();
});

// The golden batch, run from the app. The case list loads once; running
// streams each result so the checks turn green in front of the audience.
// Run is auth-gated server-side; a 401 opens the credential gate.
const goldenModal = document.getElementById('golden');
const goldenList = document.getElementById('golden-list');
const goldenSummary = document.getElementById('golden-summary');
const goldenRunBtn = document.getElementById('golden-run');
let goldenCases = null;
// Latest run result per case id, so an expanded row can show why it passed.
const goldenResults = new Map();

// One entry per assertion, tagged exactly the way the server tags failures in
// missing[] (src/golden/check.ts), so pass/fail is a set-membership test.
function goldenAssertions(c) {
  const list = [];
  for (const needle of c.mustInclude ?? []) list.push({ tag: `text:"${needle}"`, label: 'Reply must state', value: needle });
  for (const tool of c.mustCallTools ?? []) list.push({ tag: `tool:${tool}`, label: 'Must call', value: tool });
  for (const needle of c.mustNotInclude ?? []) list.push({ tag: `unexpected-text:"${needle}"`, label: 'Must not state', value: needle });
  for (const tool of c.mustNotCallTools ?? []) list.push({ tag: `unexpected-tool:${tool}`, label: 'Must not call', value: tool });
  return list;
}

// Fills the expanded panel: what the check asserts, and after a run, how each
// assertion went, which tools actually ran, and the reply itself.
function renderGoldenDetail(c, detail) {
  detail.replaceChildren();
  const result = goldenResults.get(c.id);
  const asserts = goldenAssertions(c);
  const positive = (c.mustInclude ?? []).length + (c.mustCallTools ?? []).length;
  if (!positive) {
    const note = document.createElement('div');
    note.className = 'oos-note';
    note.textContent = 'Out of scope on purpose: the right answer here is a refusal, not a figure.';
    detail.append(note);
  }
  const missing = new Set(result?.missing ?? []);
  for (const a of asserts) {
    const line = document.createElement('div');
    line.className = 'golden-assert';
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.textContent = '·';
    if (result) {
      const failed = missing.has(a.tag);
      line.classList.add(failed ? 'fail' : 'pass');
      glyph.textContent = failed ? '✕' : '✓';
      missing.delete(a.tag);
    }
    const text = document.createElement('span');
    const code = document.createElement('code');
    code.textContent = a.value;
    text.append(`${a.label} `, code);
    line.append(glyph, text);
    detail.append(line);
  }
  // Anything left in missing[] matched no assertion tag: a run error. Show it.
  for (const leftover of missing) {
    const line = document.createElement('div');
    line.className = 'golden-assert fail';
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.textContent = '✕';
    const text = document.createElement('span');
    text.textContent = leftover;
    line.append(glyph, text);
    detail.append(line);
  }
  if (result) {
    const tools = document.createElement('div');
    tools.className = 'golden-tools';
    const names = result.toolsCalled ?? [];
    tools.textContent = 'Tools called: ';
    if (names.length) {
      names.forEach((n, i) => {
        if (i) tools.append(', ');
        const code = document.createElement('code');
        code.textContent = n;
        tools.append(code);
      });
    } else {
      tools.append('none');
    }
    detail.append(tools);
    if (result.reply) {
      const reply = document.createElement('div');
      reply.className = 'golden-reply';
      reply.textContent = result.reply;
      detail.append(reply);
    }
  }
}

function goldenRow(c) {
  const item = document.createElement('div');
  item.className = 'golden-item';
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'golden-row';
  row.dataset.id = c.id;
  row.setAttribute('aria-expanded', 'false');
  const status = document.createElement('span');
  status.className = 'golden-status pending';
  status.textContent = '•';
  const q = document.createElement('span');
  q.className = 'golden-q';
  q.textContent = c.question;
  const ms = document.createElement('span');
  ms.className = 'golden-ms';
  const chev = document.createElement('span');
  chev.className = 'golden-chev';
  chev.textContent = '⌄';
  chev.setAttribute('aria-hidden', 'true');
  row.append(status, q, ms, chev);
  const detail = document.createElement('div');
  detail.className = 'golden-detail';
  detail.id = `golden-detail-${c.id}`;
  row.setAttribute('aria-controls', detail.id);
  detail.hidden = true;
  row.addEventListener('click', () => {
    const open = detail.hidden;
    detail.hidden = !open;
    row.setAttribute('aria-expanded', String(open));
    if (open) renderGoldenDetail(c, detail);
  });
  item.append(row, detail);
  return item;
}

function setGoldenRow(id, state, missing, ms) {
  const row = goldenList.querySelector(`.golden-row[data-id="${id}"]`);
  if (!row) return;
  const status = row.querySelector('.golden-status');
  status.className = `golden-status ${state}`;
  status.textContent = state === 'pass' ? '✓' : state === 'fail' ? '✕' : state === 'running' ? '⋯' : '•';
  row.querySelector('.golden-ms').textContent = ms != null ? `${ms} ms` : '';
  row.title = missing && missing.length ? `missing: ${missing.join(', ')}` : '';
  row.classList.toggle('is-fail', state === 'fail');
  // If the row is open while the batch runs, refresh its detail in place.
  const detail = row.nextElementSibling;
  if (detail && !detail.hidden) {
    const c = (goldenCases ?? []).find((x) => x.id === id);
    if (c) renderGoldenDetail(c, detail);
  }
}

async function openGolden() {
  goldenModal.showModal();
  if (!goldenCases) {
    // Leave goldenCases null on failure so reopening retries, rather than
    // caching an empty list until a page reload.
    try {
      const resp = await fetch('/api/golden/cases');
      if (resp.ok) goldenCases = await resp.json();
    } catch {
      /* retry on next open */
    }
  }
  const cases = goldenCases ?? [];
  goldenList.replaceChildren(...cases.map(goldenRow));
  goldenSummary.className = 'golden-summary';
  goldenSummary.textContent = cases.length ? `${cases.length} checks in the batch.` : 'Batch unavailable. Close and reopen to retry.';
}

async function runGolden() {
  if (!goldenCases || !goldenCases.length) return;
  goldenRunBtn.disabled = true;
  goldenResults.clear();
  for (const c of goldenCases) setGoldenRow(c.id, 'pending');
  goldenSummary.className = 'golden-summary';
  goldenSummary.textContent = 'Running…';
  try {
    const resp = await fetch('/api/golden/run', { headers: { ...byoHeaders() } });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) openGate();
      goldenSummary.textContent = data.detail ?? data.error ?? `Could not run the batch (HTTP ${resp.status}).`;
      goldenRunBtn.disabled = false;
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sse = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sse += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = sse.indexOf('\n\n')) !== -1) {
        const block = sse.slice(0, sep);
        sse = sse.slice(sep + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          let ev;
          try {
            ev = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (ev.type === 'case') {
            goldenResults.set(ev.id, ev);
            setGoldenRow(ev.id, ev.ok ? 'pass' : 'fail', ev.missing, ev.ms);
          } else if (ev.type === 'done') {
            goldenSummary.textContent = `${ev.passed} / ${ev.total} passed`;
            goldenSummary.className = `golden-summary ${ev.passed === ev.total ? 'all-pass' : 'some-fail'}`;
          }
        }
      }
    }
  } catch {
    goldenSummary.textContent = 'The batch stopped unexpectedly.';
  } finally {
    goldenRunBtn.disabled = false;
  }
}

document.getElementById('golden-open').addEventListener('click', openGolden);
document.getElementById('golden-close').addEventListener('click', () => goldenModal.close());
goldenRunBtn.addEventListener('click', runGolden);

// Header status dot (issue #5): worst component state, links to /status.html.
// Refreshed on load, after every turn (a provider failure should show at the
// moment it happens, not a poll later), and on a slow interval.
let statusSeq = 0; // overlapping fetches: only the latest response may paint
async function refreshStatus() {
  const mySeq = ++statusSeq;
  try {
    const s = await fetch('/api/status').then((r) => r.json());
    if (statusSeq !== mySeq) return;
    document.getElementById('header-status-dot').className = `status-dot ${s.overall}`;
  } catch {
    if (statusSeq !== mySeq) return;
    document.getElementById('header-status-dot').className = 'status-dot down';
  }
}
refreshStatus();
setInterval(refreshStatus, 30_000);

// The anchor date is written the human way the assistant itself uses ("5 Oct
// 2026") rather than raw ISO, so it reads as context, not a database value.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatAnchor(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso);
}

fetch('/api/health').then((r) => r.json()).then((h) => {
  document.getElementById('meta-date').textContent = `as of ${formatAnchor(h.anchorDate)}`;
  document.getElementById('meta-model').textContent = h.model;
  if (h.authMode === 'gated' && !h.authorized && !byoHeaders()['x-llm-key']) openGate();
});

/**
 * Assistant replies are markdown — the model writes tables, bold figures and
 * lists, and rendering them as literal asterisks made the demo look broken.
 * Sanitized because tool results (customer names, note text) reach this string.
 */
function assistantHtml(text, toolNames) {
  return renderMarkdown(text, toolNames, {
    parse: (s, o) => window.marked.parse(s, o),
    sanitize: (s) => window.DOMPurify.sanitize(s),
    complete: (s) => remend(s),
  });
}

function clearEmptyState() {
  document.getElementById('empty-state')?.remove();
}

function addMsg(role, text, toolNames = []) {
  clearEmptyState();
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  if (role === 'assistant') {
    div.innerHTML = assistantHtml(text, toolNames);
  } else {
    div.textContent = text; // never parse the operator's own words as markup
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

/**
 * The local model can take a minute to reach first token. A static italic line
 * reads as a hang, so show a live indicator with elapsed time — slow but
 * working is a very different message from broken.
 */
function addPending(label) {
  clearEmptyState();
  const div = document.createElement('div');
  div.className = 'msg assistant pending';
  div.innerHTML = '<span class="dots"><i></i><i></i><i></i></span><span class="pending-label"></span><span class="elapsed"></span>';
  div.querySelector('.pending-label').textContent = label;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const started = Date.now();
  const elapsedEl = div.querySelector('.elapsed');
  const timer = setInterval(() => {
    const secs = Math.round((Date.now() - started) / 1000);
    if (secs >= 3) elapsedEl.textContent = `${secs}s`;
  }, 1000);
  return { el: div, stop: () => clearInterval(timer) };
}

function receiptRow(ev) {
  const details = document.createElement('details');
  details.className = 'receipt';
  details.dataset.tool = ev.name;

  const summary = document.createElement('summary');
  const name = document.createElement('span');
  name.className = 'tool-name';
  name.textContent = ev.name;
  summary.append(name);

  // Provenance at panel level: which partner channel this record came through.
  for (const source of collectSources(ev.result)) {
    const chip = document.createElement('span');
    chip.className = isPartnerChannel(source) ? 'src-chip partner' : 'src-chip';
    chip.textContent = channelLabel(source);
    summary.append(chip);
  }

  const inputLine = document.createElement('div');
  inputLine.className = 'input-line';
  inputLine.textContent = summarizeInput(ev.input);

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(ev.result, null, 2);

  details.append(summary, inputLine, pre);
  return details;
}

/**
 * Receipts are grouped by the question that caused them and kept across turns.
 * Previously the panel showed only the latest turn's bare tool names, so there
 * was no way to say which answer a call served — the whole point of receipts.
 */
function addReceiptGroup(question, toolEvents) {
  for (const open of receiptsEl.querySelectorAll('details.receipt[open]')) open.removeAttribute('open');

  const group = document.createElement('section');
  group.className = 'receipt-turn';

  const heading = document.createElement('h3');
  heading.className = 'turn-question';
  heading.textContent = question;
  group.append(heading);

  if (!toolEvents.length) {
    const none = document.createElement('p');
    none.className = 'turn-none';
    none.textContent = 'No tools called for this answer.';
    group.append(none);
  }
  for (const ev of toolEvents) group.append(receiptRow(ev));

  // Newest first: the answer on screen is the one whose receipts you want.
  receiptsEl.prepend(group);
  return group;
}

// A citation chip scrolls to its receipt and flashes it, so "where did that
// number come from" is one click rather than a hunt.
messagesEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.citation');
  if (!chip) return;
  const target = receiptsEl.querySelector(`details.receipt[data-tool="${chip.dataset.tool}"]`);
  if (!target) return;
  target.setAttribute('open', '');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('flash');
  void target.offsetWidth; // restart the animation if it is already applied
  target.classList.add('flash');
});

function renderApprovalCards(toolEvents) {
  for (const ev of toolEvents) {
    const r = ev.result;
    if (!r || !r.requiresApproval || !Array.isArray(r.drafts) || !r.drafts.length) continue;
    const card = document.createElement('div');
    card.className = 'approval-card';
    const total = r.drafts.reduce((s, d) => s + d.amount, 0);
    card.innerHTML = `
      <span class="approval-badge">Approval required</span>
      <h3>${r.drafts.length} invoice ${r.drafts.length === 1 ? 'draft' : 'drafts'}, $${total.toLocaleString()}</h3>
      <p class="approval-guarantee">Nothing is created until you approve. Rejecting leaves the record untouched.</p>
      <table>
        <tr><th>Customer</th><th>Description</th><th class="amt">Amount</th></tr>
        ${r.drafts.map((d) => `<tr><td>${d.customerName}</td><td>${d.description}</td><td class="amt">$${d.amount.toLocaleString()}</td></tr>`).join('')}
      </table>
      <div class="actions"><button class="approve">Approve &amp; create</button><button class="reject">Reject</button></div>`;
    card.querySelector('.approve').addEventListener('click', async () => {
      const resp = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...byoHeaders() },
        body: JSON.stringify({ drafts: r.drafts }),
      });
      const out = await resp.json();
      card.remove();
      addMsg('assistant', `Approved. Created ${out.created.length} ${out.created.length === 1 ? 'invoice' : 'invoices'}: ${out.created.join(', ')}.`)
        .classList.add('outcome', 'outcome-approved');
      // The write is the step a sceptic examines hardest, and it was the only
      // one leaving no trace in the panel. Give the approval its own receipt so
      // creating invoices is as auditable as reading them.
      addReceiptGroup('Approved — create invoices', [
        { name: 'create_invoices', input: { drafts: r.drafts.length, approvedBy: 'operator' }, result: out },
      ]);
    });
    card.querySelector('.reject').addEventListener('click', () => {
      card.remove();
      addMsg('assistant', 'Drafts rejected. Nothing was created.').classList.add('outcome', 'outcome-rejected');
    });
    messagesEl.appendChild(card);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

/**
 * A failed turn is a designed state, not a stack trace. The presenter may show
 * this one deliberately (provider pulled mid-demo), so it has to read as
 * "handled" — plain language, the raw error still available for the curious,
 * and a retry that does not make the operator retype the question.
 */
function addErrorCard(detail, retry, copy = {}) {
  clearEmptyState();
  const card = document.createElement('div');
  card.className = 'error-card';

  const heading = document.createElement('h3');
  heading.textContent = copy.heading ?? "Slipstream can't reach the model right now";
  const body = document.createElement('p');
  body.textContent = copy.body ?? 'Your question was not lost, and nothing in the record changed. Try again in a moment.';

  const technical = document.createElement('details');
  technical.className = 'error-technical';
  const technicalSummary = document.createElement('summary');
  technicalSummary.textContent = 'Technical detail';
  const pre = document.createElement('pre');
  pre.textContent = String(detail);
  technical.append(technicalSummary, pre);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'retry';
  retryBtn.textContent = 'Try again';
  retryBtn.addEventListener('click', () => {
    card.remove();
    retry();
  });
  actions.append(retryBtn);

  card.append(heading, body, technical, actions);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/** An empty assistant bubble that fills as deltas arrive. */
function addStreamingBubble() {
  clearEmptyState();
  const div = document.createElement('div');
  div.className = 'msg assistant streaming';
  messagesEl.appendChild(div);
  return div;
}

/**
 * Streaming conversation (issue #7): read server-sent events off
 * /api/chat/stream and re-render the accumulated buffer through the same
 * markdown pipeline on every delta, morphing only changed DOM (idiomorph).
 * The pipeline is prefix-stable by property test, so intermediate states are
 * always valid; remend closes unterminated syntax mid-stream.
 */
let converseSeq = 0; // guards stale streams: input unlocks at done, so an old
// stream's trailing suggestion (or its cleanup) must not touch a newer turn

async function converse(payloadMessages, pendingLabel, question, extraHeaders = {}) {
  const myTurn = ++converseSeq;
  // The old suggestion is stale the moment a question is in flight — clear it
  // until the reply brings a fresh one (or none).
  setSuggestion(null);
  sendBtn.disabled = true;
  briefingBtn.disabled = true;
  input.disabled = true;
  const pending = addPending(pendingLabel);
  let bubble = null;
  let buffer = '';
  const retry = () => converse(payloadMessages, pendingLabel, question, extraHeaders);
  const clearPending = () => {
    pending.stop();
    pending.el.remove();
  };
  try {
    const resp = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...byoHeaders(), ...extraHeaders },
      body: JSON.stringify({ messages: payloadMessages }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      clearPending();
      if (resp.status === 401) openGate();
      addErrorCard(data.detail ?? data.error, retry);
      return;
    }

    let doneHandled = false;
    let errorEvent = null;

    // The reply renders and the input unlocks the moment done arrives — the
    // stream then stays open only for the trailing contextual suggestion,
    // which must never hold the conversation hostage.
    const renderDone = (ev) => {
      doneHandled = true;
      if (!bubble) clearPending();
      const toolEvents = ev.toolEvents ?? [];
      // Belt to the server's braces: an empty reply must read as a failure
      // with a retry, never as a silent empty bubble.
      if (!ev.reply?.trim()) {
        bubble?.remove();
        bubble = null;
        addErrorCard('The stream completed but the reply was empty.', retry, {
          heading: 'The model returned an empty answer',
          body: 'The model was reached but produced nothing this time. It happens occasionally; retrying usually fixes it.',
        });
        // Unlock here too: the stream may stay open for the trailing
        // suggestion, and an error card with a frozen input reads as a hang.
        briefingBtn.disabled = false;
        input.disabled = false;
        syncSendState();
        return;
      }
      if (!bubble) bubble = addStreamingBubble();
      // Final render replaces the streamed approximation: citation chips need
      // the turn's tool list, which only exists at completion.
      window.Idiomorph.morph(bubble, assistantHtml(ev.reply, toolEvents.map((t) => t.name)), { morphStyle: 'innerHTML' });
      bubble.classList.remove('streaming');
      history.push({ role: 'assistant', content: ev.reply });
      addReceiptGroup(question, toolEvents);
      renderApprovalCards(toolEvents);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      briefingBtn.disabled = false;
      input.disabled = false;
      syncSendState();
      input.focus();
    };

    const handleEvent = (ev) => {
      if (ev.type === 'start') {
        buffer = '';
        if (bubble) bubble.innerHTML = '';
      } else if (ev.type === 'delta') {
        if (!bubble) {
          clearPending();
          bubble = addStreamingBubble();
        }
        buffer += ev.text;
        window.Idiomorph.morph(bubble, assistantHtml(buffer, []), { morphStyle: 'innerHTML' });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (ev.type === 'done') {
        renderDone(ev);
      } else if (ev.type === 'suggestion') {
        if (converseSeq === myTurn) setSuggestion(ev.suggestion);
      } else if (ev.type === 'error') {
        errorEvent = ev;
      }
    };

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sse = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sse += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = sse.indexOf('\n\n')) !== -1) {
        const block = sse.slice(0, sep);
        sse = sse.slice(sep + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            handleEvent(JSON.parse(line.slice(5).trim()));
          } catch {
            // Malformed event: skip rather than kill the conversation.
          }
        }
      }
    }
    if (!doneHandled) {
      if (!bubble) clearPending(); // stream ended without any delta
      bubble?.remove();
      addErrorCard(errorEvent?.error ?? 'The stream ended unexpectedly.', retry);
    }
  } catch (err) {
    // After done the turn is complete and rendered; a failure in the trailing
    // suggestion window (up to ~20s of open stream) must not tear it down or
    // offer a retry that would resend a history ending in an assistant turn.
    if (!doneHandled) {
      clearPending();
      bubble?.remove();
      addErrorCard(err, retry);
    }
  } finally {
    // Idempotent when renderDone already unlocked; the seq guard keeps an old
    // stream's cleanup from re-enabling the input mid-way through a new turn.
    if (converseSeq === myTurn) {
      briefingBtn.disabled = false;
      input.disabled = false;
      syncSendState(); // stays dimmed when the input is empty again
      input.focus();
    }
    refreshStatus(); // provider failures should surface in the dot immediately
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  const usedHeaders = suggestionUseHeaders(q);
  input.value = '';
  addMsg('user', q);
  history.push({ role: 'user', content: q });
  converse(history, 'Checking the record', q, usedHeaders);
});

// The Ask button explains its own inertness: dimmed while there is nothing to
// send, rather than looking live and doing nothing when clicked.
const syncSendState = () => { sendBtn.disabled = !input.value.trim(); };
input.addEventListener('input', () => {
  // A cleared input means whatever gets typed next is a fresh question, not an
  // edit of the accepted suggestion — do not report it as adoption.
  if (!input.value.trim()) acceptedSuggestion = null;
  syncSendState();
});
syncSendState();

// Mirror of BRIEFING_PROMPT in src/server.ts — keep in sync. The history must
// record what the model was actually asked, or follow-up turns hand it a
// conversation that misdescribes its own first exchange.
const BRIEFING_PROMPT =
  "Give me the morning briefing: overnight activity, this week's biggest operational risk, and the one financial number I should act on today. Be specific and cite figures.";

briefingBtn.addEventListener('click', () => {
  addMsg('user', 'Morning briefing');
  // The briefing is a standalone morning view, not a follow-up: send it as a
  // fresh request so prior conversation cannot leak stale numbers into it
  // (issue #28). The user turn still joins the visible history, and converse()
  // appends the reply, so later questions keep their context.
  history.push({ role: 'user', content: BRIEFING_PROMPT });
  converse([{ role: 'user', content: BRIEFING_PROMPT }], 'Assembling the briefing', 'Morning briefing');
});
