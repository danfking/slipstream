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
  input.placeholder = suggestion ? `Try: "${suggestion.text}" (Tab to use)` : DEFAULT_PLACEHOLDER;
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

fetch('/api/health').then((r) => r.json()).then((h) => {
  document.getElementById('meta-date').textContent = `today: ${h.anchorDate}`;
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
      <h3>Approval required: ${r.drafts.length} invoice ${r.drafts.length === 1 ? 'draft' : 'drafts'}, $${total.toLocaleString()}</h3>
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
async function converse(payloadMessages, pendingLabel, question, extraHeaders = {}) {
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

    let doneEvent = null;
    let errorEvent = null;
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
        doneEvent = ev;
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
    if (!bubble) clearPending(); // stream ended without any delta

    if (errorEvent || !doneEvent) {
      bubble?.remove();
      addErrorCard(errorEvent?.error ?? 'The stream ended unexpectedly.', retry);
      return;
    }
    const toolEvents = doneEvent.toolEvents ?? [];
    // Belt to the server's braces: an empty reply must read as a failure with
    // a retry, never as a silent empty bubble.
    if (!doneEvent.reply?.trim()) {
      bubble?.remove();
      addErrorCard('The stream completed but the reply was empty.', retry, {
        heading: 'The model returned an empty answer',
        body: 'The model was reached but produced nothing this time. It happens occasionally; retrying usually fixes it.',
      });
      return;
    }
    if (!bubble) bubble = addStreamingBubble();
    // Final render replaces the streamed approximation: citation chips need
    // the turn's tool list, which only exists at completion.
    window.Idiomorph.morph(bubble, assistantHtml(doneEvent.reply, toolEvents.map((t) => t.name)), { morphStyle: 'innerHTML' });
    bubble.classList.remove('streaming');
    setSuggestion(doneEvent.suggestion);
    history.push({ role: 'assistant', content: doneEvent.reply });
    addReceiptGroup(question, toolEvents);
    renderApprovalCards(toolEvents);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    clearPending();
    bubble?.remove();
    addErrorCard(err, retry);
  } finally {
    briefingBtn.disabled = false;
    input.disabled = false;
    syncSendState(); // stays dimmed when the input is empty again
    input.focus();
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
  // Keep history well-formed: the API requires the first message to be a user
  // turn, and converse() appends the assistant reply to history.
  history.push({ role: 'user', content: BRIEFING_PROMPT });
  converse(history, 'Assembling the briefing', 'Morning briefing');
});
