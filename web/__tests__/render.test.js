import { describe, expect, test } from 'vitest';
import { channelLabel, collectSources, linkifyToolCitations, summarizeInput } from '../render.js';

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
