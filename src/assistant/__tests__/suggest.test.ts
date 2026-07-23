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

  // Seen live 2026-07-23: get_unbilled_work suggested "draft invoices", the
  // model answered that by running get_unbilled_work again (nothing left to
  // draft), and the identical suggestion came straight back — a loop.
  it('skips a follow-up the user has already asked, falling back to an earlier tool', () => {
    const asked = ['Draft invoices for the completed work we have not billed yet.'];
    const s = suggestNext(['get_parts_blockers', 'get_unbilled_work'], asked);
    expect(s?.source).toBe('get_parts_blockers');
  });

  it('matching against asked questions is trim- and case-insensitive', () => {
    const asked = ['  draft INVOICES for the completed work we have not billed yet.  '];
    expect(suggestNext(['get_unbilled_work'], asked)).toBeNull();
  });

  it('returns null when every candidate follow-up has already been asked', () => {
    const asked = [
      'Draft invoices for the completed work we have not billed yet.',
      'Which jobs are blocked waiting on parts?',
    ];
    expect(suggestNext(['get_schedule_load', 'get_unbilled_work'], asked)).toBeNull();
  });

  it('never suggests the question that leads back to the same tool (no loops)', () => {
    for (const tool of ['get_unbilled_work', 'get_schedule_load', 'get_parts_blockers', 'get_receivables', 'get_overnight_activity', 'get_occupancy', 'draft_invoices']) {
      const s = suggestNext([tool]);
      if (s) expect(s.source).toBe(tool);
    }
  });
});
