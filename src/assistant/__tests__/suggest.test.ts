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

  // Live feedback 2026-07-23: a turn that calls no tools left the default
  // hint text in the placeholder — it looks like a prompt but Tab does
  // nothing. After any reply there should always be a real question to take.
  it('falls back to a starter question when no tool maps', () => {
    for (const s of [suggestNext([]), suggestNext(['made_up_tool'])]) {
      expect(s?.source).toBe('starter');
      expect(s?.text.length).toBeGreaterThan(0);
    }
  });

  it('starter fallback skips starters already asked', () => {
    const first = suggestNext([]);
    const second = suggestNext([], [first!.text]);
    expect(second?.source).toBe('starter');
    expect(second?.text).not.toBe(first!.text);
  });

  it('returns null only when every follow-up and starter has been asked', () => {
    let asked: string[] = [];
    for (;;) {
      const s = suggestNext(['get_schedule_load', 'get_unbilled_work'], asked);
      if (!s) break;
      asked = [...asked, s.text];
      expect(asked.length).toBeLessThan(30); // exhaustion must terminate
    }
    expect(suggestNext([], asked)).toBeNull();
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
    const s = suggestNext(['get_unbilled_work'], asked);
    expect(s?.source).toBe('starter'); // the follow-up was excluded despite case/whitespace noise
  });

  it('prefers a tool follow-up over a starter, and an earlier tool over the fallback', () => {
    const asked = ['Draft invoices for the completed work we have not billed yet.'];
    const s = suggestNext(['get_schedule_load', 'get_unbilled_work'], asked);
    expect(s?.source).toBe('get_schedule_load');
  });

  it('tolerates non-string conversation content without throwing (API callers send block arrays)', () => {
    const asked = [[{ type: 'text', text: 'hi' }] as unknown as string, 'Which jobs are blocked waiting on parts?'];
    const s = suggestNext(['get_schedule_load'], asked);
    expect(s?.source).toBe('starter');
  });

  it('never suggests the question that leads back to the same tool (no loops)', () => {
    for (const tool of ['get_unbilled_work', 'get_schedule_load', 'get_parts_blockers', 'get_receivables', 'get_overnight_activity', 'get_occupancy', 'draft_invoices']) {
      const s = suggestNext([tool]);
      if (s) expect(s.source).toBe(tool);
    }
  });
});
