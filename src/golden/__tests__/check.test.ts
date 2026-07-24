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
});
