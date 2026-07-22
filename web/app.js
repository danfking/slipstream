import { channelLabel, collectSources, linkifyToolCitations, summarizeInput } from './render.js';

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
  const dirty = window.marked.parse(text, { breaks: true });
  const clean = window.DOMPurify.sanitize(dirty);
  return linkifyToolCitations(clean, toolNames);
}

function addMsg(role, text, toolNames = []) {
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
    chip.className = 'src-chip';
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
      <h3>Approval required: ${r.drafts.length} invoice draft(s), $${total.toLocaleString()}</h3>
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
      addMsg('assistant', `Approved. Created ${out.created.length} invoice(s): ${out.created.join(', ')}.`);
    });
    card.querySelector('.reject').addEventListener('click', () => {
      card.remove();
      addMsg('assistant', 'Drafts rejected. Nothing was created.');
    });
    messagesEl.appendChild(card);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
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
      addMsg('assistant', `Error: ${data.error}`);
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
    addMsg('assistant', `Error: ${err}`);
  } finally {
    sendBtn.disabled = false;
    briefingBtn.disabled = false;
    input.disabled = false;
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

briefingBtn.addEventListener('click', () => {
  addMsg('user', 'Morning briefing');
  // Keep history well-formed: the API requires the first message to be a user
  // turn, and converse() appends the assistant reply to history.
  history.push({ role: 'user', content: 'Give me the morning briefing.' });
  converse('/api/briefing', undefined, 'Assembling the briefing', 'Morning briefing');
});
