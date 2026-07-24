import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from '../system.js';
import { generateSuggestion } from '../suggest.js';

// This PR rewrote the anti-fabrication prose. These guards lock in the
// invariants that make the trust story hold, so a future edit cannot silently
// drop them.
describe('SYSTEM_PROMPT trust invariants', () => {
  it('requires every number to come from a tool result', () => {
    expect(SYSTEM_PROMPT).toContain('must come from a tool result');
  });

  it('forbids inventing figures', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('never estimate, extrapolate, or invent');
  });

  it('tells the model to say it cannot determine what the tools do not cover', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('cannot determine');
  });

  it('keeps the backtick tool-citation rule (receipts depend on it)', () => {
    expect(SYSTEM_PROMPT).toContain('backticks');
  });
});

describe('generateSuggestion constrains suggestions to tool-answerable questions', () => {
  it('passes a system prompt that limits suggestions to what the tools cover', async () => {
    let captured: any;
    const client = {
      create: async (params: any) => {
        captured = params;
        return { content: [{ type: 'text', text: 'Who owes us money, and how overdue are they?' }] };
      },
    };
    await generateSuggestion(client, 'test-model', [{ role: 'user', content: 'hi' }], []);
    expect(captured.system.toLowerCase()).toContain('data tools');
    expect(captured.system.toLowerCase()).toMatch(/only answer questions its data tools directly cover/);
  });
});
