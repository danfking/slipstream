// Status page (issue #5): renders /api/status as service rows. Same trust
// stance as the receipts panel — states come from the server, mocks are
// labelled, nothing is invented client-side.

const STATE_LABEL = { ok: 'Operational', degraded: 'Degraded', down: 'Down' };

function row(service) {
  const el = document.createElement('div');
  el.className = 'status-row';

  const dot = document.createElement('span');
  dot.className = `status-dot ${service.state}`;

  const name = document.createElement('div');
  name.className = 'status-name';
  name.textContent = service.name;

  const state = document.createElement('div');
  state.className = `status-state ${service.state}`;
  state.textContent = STATE_LABEL[service.state] ?? service.state;

  const detail = document.createElement('div');
  detail.className = 'status-detail';
  detail.textContent = service.detail;

  const checked = document.createElement('div');
  checked.className = 'status-checked';
  checked.textContent = `last checked ${new Date(service.lastChecked).toLocaleTimeString()}`;

  const head = document.createElement('div');
  head.className = 'status-row-head';
  head.append(dot, name, state);
  el.append(head, detail, checked);
  return el;
}

async function render() {
  try {
    const data = await fetch('/api/status').then((r) => r.json());
    document.getElementById('overall-dot').className = `status-dot ${data.overall}`;
    document.getElementById('overall-label').textContent =
      data.overall === 'ok' ? 'All services operational' : data.overall === 'degraded' ? 'Some services degraded' : 'A service is down';
    const list = document.getElementById('status-services');
    list.replaceChildren(...data.services.map(row));
  } catch {
    document.getElementById('overall-label').textContent = 'Status unavailable (is the server running?)';
    document.getElementById('overall-dot').className = 'status-dot down';
  }
}

render();
setInterval(render, 15_000);
