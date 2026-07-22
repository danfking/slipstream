import { channelLabel, collectSources, isPartnerChannel, renderMarkdown, summarizeInput } from './render.js';
import remend from './vendor/remend.js';

const messagesEl = document.getElementById('messages');
const receiptsEl = document.getElementById('receipts');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const briefingBtn = document.getElementById('briefing-btn');

const history = []; // {role, content} resent each turn

fetch('/api/health').then((r) => r.json()).then((h) => {
  document.getElementById('meta-date').textContent = `today: ${h.anchorDate}`;
  document.getElementById('meta-model').textContent = h.model;
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
        headers: { 'content-type': 'application/json' },
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
function addErrorCard(detail, retry) {
  clearEmptyState();
  const card = document.createElement('div');
  card.className = 'error-card';

  const heading = document.createElement('h3');
  heading.textContent = "Slipstream can't reach the model right now";
  const body = document.createElement('p');
  body.textContent = 'Your question was not lost, and nothing in the record changed. Try again in a moment.';

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

async function converse(url, options, pendingLabel, question) {
  sendBtn.disabled = true;
  briefingBtn.disabled = true;
  input.disabled = true;
  const pending = addPending(pendingLabel);
  try {
    const resp = await fetch(url, options);
    const data = await resp.json();
    pending.stop();
    pending.el.remove();
    if (data.error) {
      addErrorCard(data.error, () => converse(url, options, pendingLabel, question));
      return;
    }
    const toolEvents = data.toolEvents ?? [];
    addMsg('assistant', data.reply, toolEvents.map((t) => t.name));
    history.push({ role: 'assistant', content: data.reply });
    addReceiptGroup(question, toolEvents);
    renderApprovalCards(toolEvents);
  } catch (err) {
    pending.stop();
    pending.el.remove();
    addErrorCard(err, () => converse(url, options, pendingLabel, question));
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
  input.value = '';
  addMsg('user', q);
  history.push({ role: 'user', content: q });
  converse('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: history }),
  }, 'Checking the record', q);
});

// The Ask button explains its own inertness: dimmed while there is nothing to
// send, rather than looking live and doing nothing when clicked.
const syncSendState = () => { sendBtn.disabled = !input.value.trim(); };
input.addEventListener('input', syncSendState);
syncSendState();

briefingBtn.addEventListener('click', () => {
  addMsg('user', 'Morning briefing');
  // Keep history well-formed: the API requires the first message to be a user
  // turn, and converse() appends the assistant reply to history.
  history.push({ role: 'user', content: 'Give me the morning briefing.' });
  converse('/api/briefing', undefined, 'Assembling the briefing', 'Morning briefing');
});
