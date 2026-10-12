import { describe, expect, test } from 'vitest';
import { chartHtml, pickChart, shortDate } from '../charts.js';
import { runTool } from '../../src/tools/registry.ts';

// Fixtures are the real tool results over the deterministic seed, so the
// charts are tested against the same numbers the receipts show.
const result = (name) => runTool(name, {});

describe('pickChart', () => {
  test('receivables: one bar per overdue invoice, largest first, values from the tool', () => {
    const r = result('get_receivables');
    const spec = pickChart('get_receivables', r);
    expect(spec.kind).toBe('bar');
    expect(spec.rows).toHaveLength(r.overdue.length);
    expect(spec.rows.map((x) => x.value)).toEqual(r.overdue.map((i) => i.amount).sort((a, b) => b - a));
    expect(spec.rows[0].valueLabel).toBe('$12,400');
  });

  test('unbilled work: sums by customer and reconciles to the tool total', () => {
    const r = result('get_unbilled_work');
    const spec = pickChart('get_unbilled_work', r);
    expect(spec.kind).toBe('bar');
    expect(spec.rows.length).toBeLessThanOrEqual(8);
    const sum = spec.rows.reduce((s, x) => s + x.value, 0);
    expect(Math.round(sum * 100) / 100).toBe(r.totalAmount);
  });

  test('occupancy: stacked occupied and vacant per dock', () => {
    const r = result('get_occupancy');
    const spec = pickChart('get_occupancy', r);
    expect(spec.kind).toBe('stacked');
    expect(spec.rows).toHaveLength(r.docks.length);
    r.docks.forEach((d, i) => expect(spec.rows[i].parts).toEqual([d.occupied, d.total - d.occupied]));
  });

  test('schedule load: bullet rows flag the haul shortfall', () => {
    const spec = pickChart('get_schedule_load', result('get_schedule_load'));
    expect(spec.kind).toBe('bullet');
    const haul = spec.rows.find((x) => x.label === '12-18 Oct, haul');
    expect(haul).toMatchObject({ value: 54, target: 38, over: true, valueLabel: '16 h short' });
    expect(spec.rows.every((x) => x.value > 0)).toBe(true);
  });

  test('parts blockers: days late per job, longest wait first', () => {
    const spec = pickChart('get_parts_blockers', result('get_parts_blockers'));
    expect(spec.kind).toBe('bar');
    expect(spec.rows[0]).toMatchObject({ label: 'WO-0044 Rum Line', value: 9 });
  });

  test('record lists and actions get no chart', () => {
    for (const name of ['search_customers', 'get_work_orders', 'get_overnight_activity', 'draft_invoices']) {
      expect(pickChart(name, { items: [{ a: 'x', n: 1 }, { a: 'y', n: 2 }] })).toBeNull();
    }
  });

  test('a single data point is a figure, not a chart', () => {
    expect(pickChart('get_receivables', { overdue: [{ customerName: 'A', amount: 5, invoiceId: 'I', daysOverdue: 1 }] })).toBeNull();
  });

  test('unknown tool: text and number fields make a bar chart', () => {
    const spec = pickChart('get_new_thing', { rows: [{ name: 'a', n: 1 }, { name: 'b', n: 3 }] });
    expect(spec).toMatchObject({ kind: 'bar', rows: [{ label: 'b', value: 3 }, { label: 'a', value: 1 }] });
  });

  test('unknown tool: date and number fields make a line in date order', () => {
    const spec = pickChart('get_new_thing', { series: [{ day: '2026-10-02', n: 4 }, { day: '2026-10-01', n: 2 }] });
    expect(spec.kind).toBe('line');
    expect(spec.points.map((p) => p.label)).toEqual(['1 Oct', '2 Oct']);
  });

  test('bad input never throws', () => {
    expect(pickChart('get_receivables', null)).toBeNull();
    expect(pickChart('get_occupancy', 'oops')).toBeNull();
    expect(pickChart('get_new_thing', { rows: [] })).toBeNull();
  });
});

describe('chartHtml', () => {
  test('draws every chartable tool result without throwing', () => {
    for (const name of ['get_receivables', 'get_unbilled_work', 'get_occupancy', 'get_schedule_load', 'get_parts_blockers']) {
      const html = chartHtml(pickChart(name, result(name)));
      expect(html).toMatch(/^<figure class="chart"/);
      expect(html).toContain('<svg');
      expect(html).not.toContain('NaN');
    }
  });

  test('escapes record text in labels and tooltips', () => {
    const html = chartHtml({ kind: 'bar', title: 't', rows: [
      { label: '<img src=x onerror=alert(1)>', value: 1, valueLabel: '1' },
      { label: 'b', value: 2, valueLabel: '2' },
    ] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('stacked and bullet charts carry a legend; a single series does not', () => {
    expect(chartHtml(pickChart('get_occupancy', result('get_occupancy')))).toContain('chart-legend');
    expect(chartHtml(pickChart('get_schedule_load', result('get_schedule_load')))).toContain('Over capacity');
    expect(chartHtml(pickChart('get_receivables', result('get_receivables')))).not.toContain('chart-legend');
  });
});

describe('review fixes', () => {
  test('occupancy: slips in maintenance keep the bar at the dock size', () => {
    const spec = pickChart('get_occupancy', { docks: [
      { dock: 'A', type: 'wet', total: 10, occupied: 4, vacant: 4 },
      { dock: 'B', type: 'wet', total: 10, occupied: 10, vacant: 0 },
    ] });
    expect(spec.rows[0].parts).toEqual([4, 6]);
    expect(spec.rows[0].note).toBe('4 vacant, 2 in maintenance');
  });

  test('schedule load: a long horizon is capped but keeps every shortfall', () => {
    const weeks = Array.from({ length: 13 }, (_, w) => ({
      weekStart: `2026-10-${String(1 + w).padStart(2, '0')}`,
      weekEnd: `2026-10-${String(1 + w).padStart(2, '0')}`,
      skills: ['haul', 'engine', 'rigging'].map((skill) => ({
        skill, demandHrs: 10, capacityHrs: w === 12 && skill === 'rigging' ? 5 : 40, shortfallHrs: w === 12 && skill === 'rigging' ? 5 : 0,
      })),
    }));
    const spec = pickChart('get_schedule_load', { weeks });
    expect(spec.rows).toHaveLength(12);
    expect(spec.rows.at(-1)).toMatchObject({ over: true });
    expect(spec.title).toContain('12 of 39 rows');
  });

  test('receivables: many invoices are capped with a title that says so', () => {
    const overdue = Array.from({ length: 11 }, (_, i) => ({ invoiceId: `I${i}`, customerName: `C${i}`, amount: i + 1, daysOverdue: 1 }));
    const spec = pickChart('get_receivables', { overdue });
    expect(spec.rows).toHaveLength(8);
    expect(spec.title).toBe('Largest 8 of 11 overdue invoices');
  });

  test('missing or non-string fields never throw', () => {
    const parts = pickChart('get_parts_blockers', { items: [
      { workOrderId: 'WO-1', gapDays: 3, partDescription: 'x', poEta: '2026-10-20' },
      { workOrderId: 'WO-2', title: 'A — B', gapDays: 2, partDescription: 'y', poEta: '2026-10-21' },
    ] });
    expect(() => chartHtml(parts)).not.toThrow();
    expect(() => chartHtml({ kind: 'bar', title: 't', rows: [{ label: 42, value: 1, valueLabel: '1' }, { label: null, value: 2, valueLabel: '2' }] })).not.toThrow();
  });
});

test('shortDate names the month', () => {
  expect(shortDate('2026-10-12')).toBe('12 Oct');
});
