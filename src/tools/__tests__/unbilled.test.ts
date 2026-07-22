import { describe, expect, it } from 'vitest';
import { db, lineTotal } from '../../data/store.js';
import { getUnbilledWork } from '../unbilled.js';

describe('getUnbilledWork', () => {
  it('totals unbilled lines on completed work orders', () => {
    const expected = db.workOrders
      .filter((w) => w.status === 'completed')
      .reduce((sum, w) => sum + lineTotal(w.id), 0);
    const result = getUnbilledWork();
    expect(result.totalAmount).toBeCloseTo(expected, 2);
    expect(result.totalAmount).toBeGreaterThan(10000); // engineered finding is material
  });

  it('sorts oldest completion first and computes days since', () => {
    const { items } = getUnbilledWork();
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0].daysSinceCompletion).toBeGreaterThanOrEqual(items[items.length - 1].daysSinceCompletion);
    expect(items[0].daysSinceCompletion).toBeGreaterThanOrEqual(28);
  });
});
