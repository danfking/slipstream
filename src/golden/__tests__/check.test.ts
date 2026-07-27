import { describe, expect, it } from 'vitest';
import { checkReply, loadGoldenCases, normalize } from '../check.js';

const CASE = { id: 't', question: 'q', mustInclude: ['16419'], mustCallTools: ['get_unbilled_work'] };

describe('normalize', () => {
  it('drops currency and comma separators and joins digit-space-digit', () => {
    expect(normalize('$16,419')).toBe('16419');
    expect(normalize('14 520')).toBe('14520');
    expect(normalize('Bayline Charters')).toBe('bayline charters');
  });
});

describe('checkReply', () => {
  it('passes when the figure appears (any formatting) and the tool was called', () => {
    expect(checkReply('The total is **$16,419**.', ['get_unbilled_work'], CASE)).toEqual([]);
  });

  it('reports a missing figure', () => {
    const missing = checkReply('The total is $9,000.', ['get_unbilled_work'], CASE);
    expect(missing).toContain('text:"16419"');
  });

  it('reports a missing tool call', () => {
    const missing = checkReply('The total is $16,419.', [], CASE);
    expect(missing).toContain('tool:get_unbilled_work');
  });
});

// Out-of-scope cases invert the assertions: the reply must say it cannot answer
// rather than reaching for the nearest tool and producing a plausible figure.
const REFUSAL = {
  id: 'r',
  question: 'q',
  mustInclude: [],
  mustCallTools: [],
  mustNotInclude: ['16419'],
  mustNotCallTools: ['get_unbilled_work'],
};

describe('checkReply, out-of-scope cases', () => {
  it('passes when the reply neither cites the figure nor calls the tool', () => {
    expect(checkReply("I can't answer that from the record.", [], REFUSAL)).toEqual([]);
  });

  it('reports a figure the reply should not have stated', () => {
    const missing = checkReply('That comes to $16,419.', [], REFUSAL);
    expect(missing).toContain('unexpected-text:"16419"');
  });

  it('reports a tool the reply should not have called', () => {
    const missing = checkReply('Let me check.', ['get_unbilled_work'], REFUSAL);
    expect(missing).toContain('unexpected-tool:get_unbilled_work');
  });

  it('treats the negative assertions as optional on ordinary cases', () => {
    expect(checkReply('The total is $16,419.', ['get_unbilled_work'], CASE)).toEqual([]);
  });
});

describe('loadGoldenCases', () => {
  it('loads the case file as a non-empty array of well-formed cases', () => {
    const cases = loadGoldenCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(typeof c.question).toBe('string');
      expect(Array.isArray(c.mustInclude)).toBe(true);
      expect(Array.isArray(c.mustCallTools)).toBe(true);
    }
  });

  // /api/golden/cases serialises these fields for the modal's expandable
  // detail; every case must expose usable ids and (possibly empty) negative
  // assertion arrays after the ?? [] defaulting the route applies.
  it('exposes the fields the cases endpoint serialises', () => {
    const cases = loadGoldenCases();
    const ids = new Set(cases.map((c) => c.id));
    expect(ids.size).toBe(cases.length);
    for (const c of cases) {
      expect(typeof c.id).toBe('string');
      expect(Array.isArray(c.mustNotInclude ?? [])).toBe(true);
      expect(Array.isArray(c.mustNotCallTools ?? [])).toBe(true);
      const total =
        c.mustInclude.length + c.mustCallTools.length + (c.mustNotInclude ?? []).length + (c.mustNotCallTools ?? []).length;
      expect(total).toBeGreaterThan(0);
    }
  });
});
