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

function addMsg(role, text, pending = false) {
  const div = document.createElement('div');
  div.className = `msg ${role}${pending ? ' pending' : ''}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function renderReceipts(toolEvents) {
  receiptsEl.innerHTML = '';
  for (const ev of toolEvents) {
    const details = document.createElement('details');
    details.className = 'receipt';
    const summary = document.createElement('summary');
    summary.textContent = ev.name;
    const inputLine = document.createElement('div');
    inputLine.className = 'input-line';
    inputLine.textContent = `input: ${JSON.stringify(ev.input)}`;
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(ev.result, null, 2);
    details.append(summary, inputLine, pre);
    receiptsEl.appendChild(details);
  }
}

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

async function converse(url, options, pendingLabel) {
  sendBtn.disabled = true;
  briefingBtn.disabled = true;
  const pending = addMsg('assistant', pendingLabel, true);
  try {
    const resp = await fetch(url, options);
    const data = await resp.json();
    pending.remove();
    if (data.error) {
      addMsg('assistant', `Error: ${data.error}`);
      return;
    }
    addMsg('assistant', data.reply);
    history.push({ role: 'assistant', content: data.reply });
    renderReceipts(data.toolEvents);
    renderApprovalCards(data.toolEvents);
  } catch (err) {
    pending.remove();
    addMsg('assistant', `Error: ${err}`);
  } finally {
    sendBtn.disabled = false;
    briefingBtn.disabled = false;
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
  }, 'Checking the record…');
});

briefingBtn.addEventListener('click', () => {
  addMsg('user', 'Morning briefing');
  // Keep history well-formed: the API requires the first message to be a user
  // turn, and converse() appends the assistant reply to history.
  history.push({ role: 'user', content: 'Give me the morning briefing.' });
  converse('/api/briefing', undefined, 'Assembling the briefing…');
});
