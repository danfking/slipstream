// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { collectColumns, compareValues, sortRows } from '../data-browser.js';

describe('collectColumns', () => {
  it('takes the union of keys across rows, first-seen order', () => {
    const rows = [
      { id: 'A', name: 'x' },
      { id: 'B', name: 'y', extra: 1 },
    ];
    expect(collectColumns(rows)).toEqual(['id', 'name', 'extra']);
  });

  it('is empty for an empty collection', () => {
    expect(collectColumns([])).toEqual([]);
  });
});

describe('compareValues', () => {
  it('compares numbers numerically and strings lexically', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues('WO-0002', 'WO-0010')).toBeLessThan(0);
    expect(compareValues('b', 'a')).toBeGreaterThan(0);
  });

  it('sorts null and undefined last regardless of direction', () => {
    expect(compareValues(undefined, 'a')).toBeGreaterThan(0);
    expect(compareValues('a', null)).toBeLessThan(0);
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 'INV-2', amount: 300 },
    { id: 'INV-1', amount: 1200 },
    { id: 'INV-3' },
  ];

  it('sorts by column ascending and descending without mutating the input', () => {
    const asc = sortRows(rows, 'amount', 'asc');
    expect(asc.map((r) => r.id)).toEqual(['INV-2', 'INV-1', 'INV-3']); // missing value last
    const desc = sortRows(rows, 'amount', 'desc');
    expect(desc.map((r) => r.id)).toEqual(['INV-1', 'INV-2', 'INV-3']); // missing still last
    expect(rows[0].id).toBe('INV-2'); // untouched
  });
});
