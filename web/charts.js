// Charts drawn from tool results. Pure, like render.js: data in, spec or SVG
// string out, no DOM. The trust model holds here too: every value a chart
// shows comes from a tool result in the turn's toolEvents, never from the
// model's prose, so a chart is one more receipt view over the same numbers.
//
// pickChart(toolName, result) decides whether a result is worth a chart and
// which form suits it; chartSvg(spec) draws it. A spec is one of:
//   { kind: 'bar', title, rows: [{ label, value, valueLabel, note? }] }
//   { kind: 'stacked', title, legend: [a, b], rows: [{ label, parts: [x, y], valueLabel }] }
//   { kind: 'bullet', title, rows: [{ label, value, target, valueLabel, over }] }
//   { kind: 'line', title, points: [{ label, value, valueLabel }] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_BARS = 8;

// Lists of records and single actions read better as the reply's own table.
const NO_CHART = new Set(['search_customers', 'get_work_orders', 'get_overnight_activity', 'draft_invoices']);

export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function hours(n) {
  return `${Math.round(n * 10) / 10} h`;
}

/** "2026-10-12" → "12 Oct"; matches the date style the system prompt asks for. */
export function shortDate(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "12-18 Oct", or "28 Sep-4 Oct" across a month boundary. */
function dateRange(fromIso, toIso) {
  const [from, to] = [shortDate(fromIso), shortDate(toIso)];
  const [fd, fm] = from.split(' ');
  const [td, tm] = to.split(' ');
  return fm === tm ? `${fd}-${td} ${tm}` : `${from}-${to}`;
}

/** Sum amounts by key, largest first, folding the tail past MAX_BARS into one row. */
function groupTop(items, keyFn, valueFn) {
  const totals = new Map();
  const counts = new Map();
  for (const it of items) {
    const k = keyFn(it);
    totals.set(k, (totals.get(k) ?? 0) + valueFn(it));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rows = [...totals].map(([label, value]) => ({ label, value, count: counts.get(label) })).sort((a, b) => b.value - a.value);
  if (rows.length <= MAX_BARS) return rows;
  const head = rows.slice(0, MAX_BARS - 1);
  const tail = rows.slice(MAX_BARS - 1);
  head.push({
    label: `${tail.length} others`,
    value: tail.reduce((s, r) => s + r.value, 0),
    count: tail.reduce((s, r) => s + r.count, 0),
  });
  return head;
}

const PICKERS = {
  get_receivables(r) {
    const rows = (r?.overdue ?? [])
      .map((i) => ({ label: i.customerName, value: i.amount, valueLabel: money(i.amount), note: `${i.invoiceId}, ${i.daysOverdue} days overdue` }))
      .sort((a, b) => b.value - a.value);
    return { kind: 'bar', title: 'Overdue invoices by amount', rows };
  },

  get_unbilled_work(r) {
    const rows = groupTop(r?.items ?? [], (i) => i.customerName, (i) => i.amount).map((g) => ({
      label: g.label,
      value: g.value,
      valueLabel: money(g.value),
      note: `${g.count} ${g.count === 1 ? 'job' : 'jobs'}`,
    }));
    return { kind: 'bar', title: 'Unbilled work by customer', rows };
  },

  get_occupancy(r) {
    const rows = (r?.docks ?? []).map((d) => ({
      label: `Dock ${d.dock} (${d.type === 'dry_stack' ? 'dry stack' : d.type})`,
      parts: [d.occupied, d.vacant],
      valueLabel: `${d.occupied} of ${d.total}`,
    }));
    return { kind: 'stacked', title: 'Slips occupied by dock', legend: ['Occupied', 'Vacant'], rows };
  },

  get_schedule_load(r) {
    const rows = [];
    for (const w of r?.weeks ?? []) {
      for (const s of w.skills ?? []) {
        if (!s.demandHrs) continue;
        const over = s.shortfallHrs > 0;
        rows.push({
          label: `${dateRange(w.weekStart, w.weekEnd)}, ${s.skill}`,
          value: s.demandHrs,
          target: s.capacityHrs,
          over,
          valueLabel: over ? `${hours(s.shortfallHrs)} short` : `${hours(s.demandHrs)} of ${hours(s.capacityHrs)}`,
        });
      }
    }
    return { kind: 'bullet', title: 'Booked hours against technician capacity', rows };
  },

  get_parts_blockers(r) {
    const rows = (r?.items ?? [])
      .map((i) => ({
        label: `${i.workOrderId} ${i.title.split(' — ').pop()}`,
        value: i.gapDays,
        valueLabel: `${i.gapDays} days`,
        note: `${i.partDescription}, ETA ${shortDate(i.poEta)}`,
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_BARS);
    return { kind: 'bar', title: 'Days each job waits for its part', rows };
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fallback for a tool with no picker: the first array of records with a text
 * or date field and a numeric field. Dates make a line (change over time),
 * text makes a bar chart (magnitude by category).
 */
function genericChart(result) {
  const arrays = Array.isArray(result) ? [result] : Object.values(result ?? {}).filter(Array.isArray);
  for (const arr of arrays) {
    const recs = arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    if (recs.length < 2) continue;
    const keys = Object.keys(recs[0]);
    const numKey = keys.find((k) => recs.every((x) => typeof x[k] === 'number'));
    const textKey = keys.find((k) => recs.every((x) => typeof x[k] === 'string'));
    if (!numKey || !textKey) continue;
    if (recs.every((x) => ISO_DATE.test(x[textKey]))) {
      const points = recs
        .map((x) => ({ label: shortDate(x[textKey]), iso: x[textKey], value: x[numKey], valueLabel: String(x[numKey]) }))
        .sort((a, b) => a.iso.localeCompare(b.iso));
      return { kind: 'line', title: numKey, points };
    }
    const rows = recs
      .map((x) => ({ label: x[textKey], value: x[numKey], valueLabel: String(x[numKey]) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_BARS);
    return { kind: 'bar', title: numKey, rows };
  }
  return null;
}

/** A chart spec for this tool result, or null when a chart would not help. */
export function pickChart(toolName, result) {
  if (NO_CHART.has(toolName) || !result || typeof result !== 'object') return null;
  const spec = PICKERS[toolName] ? PICKERS[toolName](result) : genericChart(result);
  if (!spec) return null;
  const count = (spec.rows ?? spec.points).length;
  // One bar is a figure, not a comparison: the reply's headline already says it.
  return count >= 2 ? spec : null;
}

// ---------------------------------------------------------------------------
// SVG drawing. Colors are CSS variables set in style.css (.chart), so the
// string carries roles, not hex. Labels are escaped: customer names and note
// text come from the record and reach this string.
// ---------------------------------------------------------------------------

const W = 560;
const LABEL_W = 190;
const VALUE_W = 110;
const ROW_H = 30;
const BAR_H = 16;
const PAD_TOP = 4;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Truncate a label to fit the label column; the full text stays in the tooltip. */
function fit(s, max = 26) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Bar from x0 to x0+w with a 4px rounded data end and a square baseline end. */
function barPath(x0, y, w, h, roundEnd = true) {
  if (w <= 0) return '';
  const r = roundEnd ? Math.min(4, w, h / 2) : 0;
  return `M${x0},${y}H${x0 + w - r}${r ? `Q${x0 + w},${y} ${x0 + w},${y + r}` : ''}V${y + h - r}${r ? `Q${x0 + w},${y + h} ${x0 + w - r},${y + h}` : ''}H${x0}Z`;
}

function svgOpen(height, title) {
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${height}" width="100%" role="img" aria-label="${esc(title)}">`;
}

function rowLabel(y, text) {
  return `<text class="chart-label" x="${LABEL_W - 10}" y="${y + BAR_H / 2}" text-anchor="end" dominant-baseline="central">${esc(fit(text))}</text>`;
}

function valueText(x, y, text) {
  return `<text class="chart-value" x="${x + 8}" y="${y + BAR_H / 2}" dominant-baseline="central">${esc(text)}</text>`;
}

function hRows(rows, drawRow) {
  const plotW = W - LABEL_W - VALUE_W;
  const height = PAD_TOP + rows.length * ROW_H;
  let body = '';
  rows.forEach((row, i) => {
    const y = PAD_TOP + i * ROW_H + (ROW_H - BAR_H) / 2;
    body += `<g class="chart-row">${drawRow(row, y, plotW)}</g>`;
  });
  const axis = `<line class="chart-axis" x1="${LABEL_W}" x2="${LABEL_W}" y1="0" y2="${height}"/>`;
  return { height, body: axis + body };
}

function tooltip(parts) {
  return `<title>${esc(parts.filter(Boolean).join('\n'))}</title>`;
}

function drawBar(spec) {
  const max = Math.max(...spec.rows.map((r) => r.value), 1);
  const { height, body } = hRows(spec.rows, (row, y, plotW) => {
    const w = (row.value / max) * plotW;
    // The hit target is the whole row, wider than the mark, so hover is easy.
    return `${tooltip([row.label, row.valueLabel, row.note])}<rect class="chart-hit" x="0" y="${y - (ROW_H - BAR_H) / 2}" width="${W}" height="${ROW_H}"/>`
      + rowLabel(y, row.label)
      + `<path class="chart-mark s1" d="${barPath(LABEL_W, y, w, BAR_H)}"/>`
      + valueText(LABEL_W + w, y, row.valueLabel);
  });
  return { svg: svgOpen(height, spec.title) + body + '</svg>', legend: [] };
}

function drawStacked(spec) {
  const max = Math.max(...spec.rows.map((r) => r.parts[0] + r.parts[1]), 1);
  const GAP = 2;
  const { height, body } = hRows(spec.rows, (row, y, plotW) => {
    const [a, b] = row.parts;
    const wa = (a / max) * plotW;
    const wb = (b / max) * plotW;
    const gap = wa > 0 && wb > 0 ? GAP : 0;
    return `${tooltip([row.label, `${spec.legend[0]}: ${a}`, `${spec.legend[1]}: ${b}`])}<rect class="chart-hit" x="0" y="${y - (ROW_H - BAR_H) / 2}" width="${W}" height="${ROW_H}"/>`
      + rowLabel(y, row.label)
      + `<path class="chart-mark s1" d="${barPath(LABEL_W, y, wa, BAR_H, wb === 0)}"/>`
      + `<path class="chart-mark track" d="${barPath(LABEL_W + wa + gap, y, wb - gap, BAR_H)}"/>`
      + valueText(LABEL_W + wa + wb, y, row.valueLabel);
  });
  return { svg: svgOpen(height, spec.title) + body + '</svg>', legend: [['s1', spec.legend[0]], ['track', spec.legend[1]]] };
}

function drawBullet(spec) {
  const max = Math.max(...spec.rows.map((r) => Math.max(r.value, r.target)), 1);
  const { height, body } = hRows(spec.rows, (row, y, plotW) => {
    const scale = (v) => (v / max) * plotW;
    const wIn = scale(Math.min(row.value, row.target));
    const wAll = scale(row.value);
    const tx = LABEL_W + scale(row.target);
    const overPart = row.over
      ? `<path class="chart-mark critical" d="${barPath(LABEL_W + wIn + 2, y, wAll - wIn - 2, BAR_H)}"/>`
      : '';
    return `${tooltip([row.label, `Booked: ${hours(row.value)}`, `Capacity: ${hours(row.target)}`, row.over ? row.valueLabel : ''])}<rect class="chart-hit" x="0" y="${y - (ROW_H - BAR_H) / 2}" width="${W}" height="${ROW_H}"/>`
      + rowLabel(y, row.label)
      + `<path class="chart-mark s1" d="${barPath(LABEL_W, y, wIn, BAR_H, !row.over)}"/>`
      + overPart
      + `<line class="chart-target" x1="${tx}" x2="${tx}" y1="${y - 4}" y2="${y + BAR_H + 4}"/>`
      + valueText(LABEL_W + Math.max(wAll, scale(row.target)), y, row.valueLabel);
  });
  const legend = [['s1', 'Booked'], ['target', 'Capacity']];
  if (spec.rows.some((r) => r.over)) legend.push(['critical', 'Over capacity']);
  return { svg: svgOpen(height, spec.title) + body + '</svg>', legend };
}

function drawLine(spec) {
  const H = 180;
  const left = 40;
  const right = W - 20;
  const top = 16;
  const bottom = H - 28;
  const max = Math.max(...spec.points.map((p) => p.value), 1);
  const n = spec.points.length;
  const px = (i) => left + (n === 1 ? 0 : (i / (n - 1)) * (right - left));
  const py = (v) => bottom - (v / max) * (bottom - top);
  const d = spec.points.map((p, i) => `${i ? 'L' : 'M'}${px(i)},${py(p.value)}`).join('');
  let body = `<line class="chart-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
  body += `<path class="chart-line s1" d="${d}"/>`;
  spec.points.forEach((p, i) => {
    body += `<g class="chart-row">${tooltip([p.label, p.valueLabel])}<circle class="chart-hit" cx="${px(i)}" cy="${py(p.value)}" r="12"/>`
      + `<circle class="chart-dot s1" cx="${px(i)}" cy="${py(p.value)}" r="4"/></g>`;
  });
  body += `<text class="chart-label" x="${left}" y="${H - 8}">${esc(spec.points[0].label)}</text>`;
  body += `<text class="chart-label" x="${right}" y="${H - 8}" text-anchor="end">${esc(spec.points[n - 1].label)}</text>`;
  const last = spec.points[n - 1];
  body += `<text class="chart-value" x="${px(n - 1)}" y="${py(last.value) - 10}" text-anchor="end">${esc(last.valueLabel)}</text>`;
  return { svg: svgOpen(H, spec.title) + body + '</svg>', legend: [] };
}

const DRAW = { bar: drawBar, stacked: drawStacked, bullet: drawBullet, line: drawLine };

/** The chart as an HTML string: a figure with caption, SVG, and legend. */
export function chartHtml(spec) {
  const { svg, legend } = DRAW[spec.kind](spec);
  const legendHtml = legend.length
    ? `<div class="chart-legend">${legend.map(([cls, text]) => `<span><i class="key ${cls}"></i>${esc(text)}</span>`).join('')}</div>`
    : '';
  return `<figure class="chart" data-kind="${spec.kind}"><figcaption>${esc(spec.title)}</figcaption>${svg}${legendHtml}</figure>`;
}
