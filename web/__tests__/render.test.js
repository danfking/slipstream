import { describe, expect, test } from 'vitest';
import { channelLabel, collectSources, isPartnerChannel, linkifyToolCitations, normalizeMarkdown, summarizeInput } from '../render.js';

describe('channelLabel', () => {
  test('names the Blu voice channel in full', () => {
    expect(channelLabel('blu_voice_agent')).toBe('Blu Voice Agent');
  });

  test('names the customer portal channel', () => {
    expect(channelLabel('customer_portal')).toBe('Customer Portal');
  });

  test('title-cases an unknown channel rather than showing a raw key', () => {
    expect(channelLabel('dock_walk_up')).toBe('Dock Walk Up');
  });
});

describe('collectSources', () => {
  test('finds a source nested inside an array of records', () => {
    const result = { workOrders: [{ workOrderId: 'WO-0059', source: 'blu_voice_agent' }] };
    expect(collectSources(result)).toEqual(['blu_voice_agent']);
  });

  test('returns each distinct source once, in order of first appearance', () => {
    const result = {
      reservations: [{ source: 'blu_voice_agent' }, { source: 'customer_portal' }, { source: 'blu_voice_agent' }],
    };
    expect(collectSources(result)).toEqual(['blu_voice_agent', 'customer_portal']);
  });

  test('ignores staff-entered records — only partner channels are worth badging', () => {
    const result = { workOrders: [{ source: 'staff' }, { source: 'blu_voice_agent' }] };
    expect(collectSources(result)).toEqual(['blu_voice_agent']);
  });

  test('returns nothing for a result with no provenance', () => {
    expect(collectSources({ totalUnbilled: 16419, jobs: [{ id: 'WO-0027' }] })).toEqual([]);
  });

  test('survives null and primitive results without throwing', () => {
    expect(collectSources(null)).toEqual([]);
    expect(collectSources(42)).toEqual([]);
  });
});

describe('summarizeInput', () => {
  test('says so plainly when a tool took no arguments', () => {
    expect(summarizeInput({})).toBe('no arguments');
  });

  test('renders a single argument as a readable pair, not JSON', () => {
    expect(summarizeInput({ weeks: 3 })).toBe('weeks: 3');
  });

  test('joins multiple arguments', () => {
    expect(summarizeInput({ customerId: 'C-014', includeClosed: false })).toBe('customerId: C-014, includeClosed: false');
  });

  test('truncates a long value so the receipt row stays one line', () => {
    expect(summarizeInput({ note: 'x'.repeat(80) })).toBe(`note: ${'x'.repeat(40)}…`);
  });

  test('handles a missing input object', () => {
    expect(summarizeInput(undefined)).toBe('no arguments');
  });
});

describe('linkifyToolCitations', () => {
  const tools = ['get_unbilled_work', 'draft_invoices'];

  test('turns an emphasised tool name into a citation chip', () => {
    expect(linkifyToolCitations('<p>from <em>get_unbilled_work</em></p>', tools)).toBe(
      '<p>from <button type="button" class="citation" data-tool="get_unbilled_work">get_unbilled_work</button></p>',
    );
  });

  test('turns a code-formatted tool name into a citation chip', () => {
    expect(linkifyToolCitations('<p>via <code>draft_invoices</code></p>', tools)).toBe(
      '<p>via <button type="button" class="citation" data-tool="draft_invoices">draft_invoices</button></p>',
    );
  });

  test('leaves emphasis that is not a tool name alone', () => {
    expect(linkifyToolCitations('<p><em>drafts only</em></p>', tools)).toBe('<p><em>drafts only</em></p>');
  });

  test('leaves a tool named in plain prose alone — only marked-up mentions become chips', () => {
    expect(linkifyToolCitations('<p>I called get_unbilled_work today</p>', tools)).toBe(
      '<p>I called get_unbilled_work today</p>',
    );
  });

  test('does not chip a tool that was never called this turn', () => {
    expect(linkifyToolCitations('<p><code>get_schedule_load</code></p>', tools)).toBe('<p><code>get_schedule_load</code></p>');
  });
});

describe('normalizeMarkdown', () => {
  test('separates a bullet list from the line above so it parses as a list', () => {
    expect(normalizeMarkdown('**Overdue total $17,000**\n* $12,400 — Bayline\n* $3,180 — Coastal')).toBe(
      '**Overdue total $17,000**\n\n* $12,400 — Bayline\n* $3,180 — Coastal',
    );
  });

  test('separates a dash list from the line above', () => {
    expect(normalizeMarkdown('Blocked jobs:\n- WO-0041\n- WO-0042')).toBe('Blocked jobs:\n\n- WO-0041\n- WO-0042');
  });

  test('separates a numbered list from the line above', () => {
    expect(normalizeMarkdown('Steps:\n1. First\n2. Second')).toBe('Steps:\n\n1. First\n2. Second');
  });

  test('leaves a list that is already separated untouched', () => {
    expect(normalizeMarkdown('Blocked jobs:\n\n- WO-0041')).toBe('Blocked jobs:\n\n- WO-0041');
  });

  test('does not split consecutive items within one list', () => {
    expect(normalizeMarkdown('- one\n- two\n- three')).toBe('- one\n- two\n- three');
  });

  test('leaves a table alone — its rows are not list items', () => {
    expect(normalizeMarkdown('| A | B |\n|---|---|\n| 1 | 2 |')).toBe('| A | B |\n|---|---|\n| 1 | 2 |');
  });
});

describe('summarizeInput with empty values', () => {
  test('omits arguments the model sent as empty strings rather than showing a bare colon', () => {
    expect(summarizeInput({ customerName: '', status: '' })).toBe('no arguments');
  });

  test('keeps the arguments that do have values', () => {
    expect(summarizeInput({ customerName: '', status: 'open' })).toBe('status: open');
  });
});

describe('isPartnerChannel', () => {
  test('the voice agent is a partner channel — the chip that must stand out', () => {
    expect(isPartnerChannel('blu_voice_agent')).toBe(true);
  });

  test('the marina\'s own portal is first-party, not a partner integration', () => {
    expect(isPartnerChannel('customer_portal')).toBe(false);
  });

  test('staff entry is not a channel at all', () => {
    expect(isPartnerChannel('staff')).toBe(false);
  });
});

describe('normalizeMarkdown spacing', () => {
  test('inserts the space a bold label needs when the model runs the value straight on', () => {
    expect(normalizeMarkdown('**Unbilled completed work:**$16,419')).toBe('**Unbilled completed work:** $16,419');
  });

  test('leaves a correctly spaced bold label alone', () => {
    expect(normalizeMarkdown('**Total:** $16,419')).toBe('**Total:** $16,419');
  });

  test('does not touch bold at the end of a line', () => {
    expect(normalizeMarkdown('the total is **$16,419**')).toBe('the total is **$16,419**');
  });

  test('does not insert a space before punctuation that legitimately follows', () => {
    expect(normalizeMarkdown('total **$16,419**.')).toBe('total **$16,419**.');
  });
});

describe('normalizeMarkdown repairs model typography', () => {
  test('tightens a bold marker the model opened with a space, which renders literally', () => {
    expect(normalizeMarkdown('source ** Blu Voice Agent**.')).toBe('source **Blu Voice Agent**.');
  });

  test('tightens a trailing space inside a bold marker', () => {
    expect(normalizeMarkdown('the **total **is high')).toBe('the **total** is high');
  });

  test('replaces non-breaking hyphens, which render too tight to read on a projector', () => {
    expect(normalizeMarkdown('haul‑out for 10‑12')).toBe('haul-out for 10-12');
  });

  test('replaces narrow no-break spaces with ordinary spaces', () => {
    expect(normalizeMarkdown('54 hrs')).toBe('54 hrs');
  });

  test('leaves ordinary hyphens and dashes alone', () => {
    expect(normalizeMarkdown('haul-out, 12 – 18 Oct')).toBe('haul-out, 12 – 18 Oct');
  });
});

describe('normalizeMarkdown spacing before bold', () => {
  test('separates a bold label the model ran onto the end of the previous sentence', () => {
    expect(normalizeMarkdown('no shortfall.**Next steps:** If we')).toBe('no shortfall. **Next steps:** If we');
  });

  test('leaves bold at the start of a line alone', () => {
    expect(normalizeMarkdown('**Headline:** we are short')).toBe('**Headline:** we are short');
  });

  test('leaves bold that already has a space before it alone', () => {
    expect(normalizeMarkdown('the **total** is high')).toBe('the **total** is high');
  });

  test('does not insert a space after an opening bracket', () => {
    expect(normalizeMarkdown('(**note:** see below)')).toBe('(**note:** see below)');
  });
});
