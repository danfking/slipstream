import { describe, expect, it } from 'vitest';
import { createMetrics } from '../metrics.js';

describe('createMetrics', () => {
  it('counts shown and used, and computes the adoption rate', () => {
    const m = createMetrics();
    m.recordShown('get_unbilled_work');
    m.recordShown('get_unbilled_work');
    m.recordShown('get_schedule_load');
    m.recordUsed('verbatim', 'get_unbilled_work');
    m.recordUsed('edited', 'get_schedule_load');
    const snap = m.snapshot();
    expect(snap.suggestionsShown).toBe(3);
    expect(snap.suggestionsUsed).toBe(2);
    expect(snap.usedVerbatim).toBe(1);
    expect(snap.usedEdited).toBe(1);
    expect(snap.adoptionRate).toBeCloseTo(2 / 3, 5);
    expect(snap.bySource.get_unbilled_work).toEqual({ shown: 2, used: 1 });
  });

  it('ignores used reports for unknown sources (no junk from headers)', () => {
    const m = createMetrics();
    m.recordShown('get_unbilled_work');
    m.recordUsed('verbatim', 'not_a_tool');
    expect(m.snapshot().suggestionsUsed).toBe(0);
  });

  it('accepts the starter pseudo-source (no-tool turns fall back to starter questions)', () => {
    const m = createMetrics();
    m.recordShown('starter');
    m.recordUsed('verbatim', 'starter');
    const snap = m.snapshot();
    expect(snap.bySource.starter).toEqual({ shown: 1, used: 1 });
  });

  it('rate is zero, not NaN, before anything is shown', () => {
    expect(createMetrics().snapshot().adoptionRate).toBe(0);
  });
});
