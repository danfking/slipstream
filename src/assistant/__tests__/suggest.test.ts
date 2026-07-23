import { describe, expect, it } from 'vitest';
import { suggestNext } from '../suggest.js';

describe('suggestNext', () => {
  it('suggests the natural follow-up for the most recent tool', () => {
    const s = suggestNext(['get_unbilled_work']);
    expect(s?.source).toBe('get_unbilled_work');
    expect(s?.text.toLowerCase()).toContain('invoice');
  });

  it('uses the LAST tool called when several ran (most recent intent wins)', () => {
    const s = suggestNext(['get_receivables', 'get_parts_blockers']);
    expect(s?.source).toBe('get_parts_blockers');
  });

  it('falls back to an earlier tool when the last has no mapping', () => {
    const s = suggestNext(['get_unbilled_work', 'made_up_tool']);
    expect(s?.source).toBe('get_unbilled_work');
  });

  it('returns null when nothing maps', () => {
    expect(suggestNext([])).toBeNull();
    expect(suggestNext(['made_up_tool'])).toBeNull();
  });

  it('never suggests the question that leads back to the same tool (no loops)', () => {
    for (const tool of ['get_unbilled_work', 'get_schedule_load', 'get_parts_blockers', 'get_receivables', 'get_overnight_activity', 'get_occupancy', 'draft_invoices']) {
      const s = suggestNext([tool]);
      if (s) expect(s.source).toBe(tool);
    }
  });
});
