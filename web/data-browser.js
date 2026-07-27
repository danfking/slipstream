// Synthetic-data browser (issue #6): the honesty disclosure made explorable.
// The "synthetic demo data" pill links here so a sceptical reviewer can
// inspect the exact record the assistant answers from — receipts applied to
// the dataset itself. Pure helpers exported for tests; DOM work stays below.

import { channelLabel, isPartnerChannel } from './render.js';

/** Union of keys across rows, first-seen order — columns for a collection. */
export function collectColumns(rows) {
  const cols = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

/** Numeric when both numeric, lexical otherwise; null/undefined always last. */
export function compareValues(a, b) {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing || bMissing) return aMissing && bMissing ? 0 : aMissing ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function sortRows(rows, column, direction) {
  const flip = direction === 'desc' ? -1 : 1;
  return [...rows].sort((r1, r2) => {
    const cmp = compareValues(r1[column], r2[column]);
    // Missing values stay last in both directions: compareValues already put
    // them last, and flipping would drag them to the top.
    if (r1[column] == null || r2[column] == null) return cmp;
    return cmp * flip;
  });
}

// --- DOM below this line -----------------------------------------------------

function cellContent(column, value) {
  if (value === null || value === undefined) return document.createTextNode('');
  if (column === 'source') {
    const chip = document.createElement('span');
    chip.className = isPartnerChannel(value) ? 'src-chip partner' : 'src-chip';
    chip.textContent = channelLabel(value);
    return chip;
  }
  if (typeof value === 'object') return document.createTextNode(JSON.stringify(value));
  return document.createTextNode(String(value));
}

function renderTable(container, rows, state) {
  const table = document.createElement('table');
  table.className = 'data-table';
  const columns = collectColumns(rows);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = col;
    if (state.column === col) btn.dataset.dir = state.direction;
    btn.addEventListener('click', () => {
      state.direction = state.column === col && state.direction === 'asc' ? 'desc' : 'asc';
      state.column = col;
      container.replaceChildren(renderTable(container, rows, state));
    });
    th.appendChild(btn);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  const sorted = state.column ? sortRows(rows, state.column, state.direction) : rows;
  for (const row of sorted) {
    const tr = document.createElement('tr');
    // The engineered finding stays visible while sorting: overdue invoices
    // read as the problem the demo asks the assistant about.
    if (row.status === 'overdue') tr.className = 'row-overdue';
    for (const col of columns) {
      const td = document.createElement('td');
      td.appendChild(cellContent(col, row[col]));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  return table;
}

const TITLES = {
  customers: 'Customers',
  boats: 'Boats',
  slips: 'Slips',
  technicians: 'Technicians',
  workOrders: 'Work orders',
  workOrderLines: 'Work order lines',
  parts: 'Parts',
  invoices: 'Invoices',
  reservations: 'Reservations',
};

async function main() {
  const root = document.getElementById('collections');
  const nav = document.getElementById('collection-nav');
  try {
    const db = await fetch('/api/record').then((r) => r.json());
    document.getElementById('record-meta').textContent =
      `Anchor date ${db.anchorDate}. Every number the assistant cites resolves to a row on this page.`;

    // The pills are filters, not anchors: click one to see just that
    // collection, click it again (or All) to see everything.
    const sections = new Map(); // key → section element
    const pills = new Map(); // key → pill button (null key = All)
    let active = null;
    const setFilter = (key) => {
      active = key;
      for (const [k, section] of sections) section.hidden = key !== null && k !== key;
      for (const [k, pill] of pills) {
        pill.classList.toggle('active', k === key);
        pill.setAttribute('aria-pressed', String(k === key)); // toggle state for assistive tech
      }
    };
    const addPill = (key, label) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.textContent = label;
      pill.addEventListener('click', () => setFilter(key === active ? null : key));
      pills.set(key, pill);
      nav.appendChild(pill);
    };
    addPill(null, 'All');

    for (const [key, title] of Object.entries(TITLES)) {
      const rows = db[key];
      if (!Array.isArray(rows)) continue;

      addPill(key, `${title} (${rows.length})`);

      const section = document.createElement('section');
      section.id = key;
      const h2 = document.createElement('h2');
      h2.textContent = `${title} (${rows.length})`;
      const wrap = document.createElement('div');
      wrap.className = 'data-table-wrap';
      wrap.replaceChildren(renderTable(wrap, rows, { column: null, direction: 'asc' }));
      section.append(h2, wrap);
      sections.set(key, section);
      root.appendChild(section);
    }
    setFilter(null);
  } catch {
    document.getElementById('record-meta').textContent = 'Could not load the record (is the server running?)';
  }
}

// Demo reset: POST /api/reset restores the seeded record (undoes approved
// invoices) so the approval flow can be shown more than once. The passcode
// session cookie flows automatically; bring-your-own-key visitors send the
// same headers the chat uses (mirrors BYO_STORE in app.js).
function resetHeaders() {
  try {
    const byo = JSON.parse(localStorage.getItem('slipstream_byo') ?? 'null');
    if (!byo?.key) return {};
    const headers = { 'x-llm-key': byo.key, 'x-llm-provider': byo.provider };
    if (byo.baseUrl) headers['x-llm-base-url'] = byo.baseUrl;
    if (byo.model) headers['x-llm-model'] = byo.model;
    return headers;
  } catch {
    return {};
  }
}

async function resetDemo(btn) {
  btn.disabled = true;
  const meta = document.getElementById('record-meta');
  try {
    const resp = await fetch('/api/reset', { method: 'POST', headers: resetHeaders() });
    if (resp.status === 401) {
      meta.textContent = 'Reset needs the unlocked session: open the demo, enter the passcode (or your key), then come back.';
      return;
    }
    if (!resp.ok) {
      meta.textContent = `Reset failed (HTTP ${resp.status}).`;
      return;
    }
    location.reload();
  } catch {
    meta.textContent = 'Reset failed (is the server running?)';
  } finally {
    btn.disabled = false;
  }
}

// jsdom imports this module for the pure helpers; only run in a real page.
if (document.getElementById('collections')) {
  main();
  const resetBtn = document.getElementById('reset-demo');
  resetBtn?.addEventListener('click', () => resetDemo(resetBtn));
}
