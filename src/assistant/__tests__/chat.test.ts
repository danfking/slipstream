import { describe, expect, it } from 'vitest';
import { runChat } from '../chat.js';

function stubClient(turns: any[]) {
  let i = 0;
  return { create: async () => turns[i++] };
}

describe('runChat', () => {
  it('executes tool calls and returns tool events + final text', async () => {
    const client = stubClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Checking.' },
          { type: 'tool_use', id: 't1', name: 'get_receivables', input: {} },
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'You have overdue invoices.' }] },
    ]);
    const { reply, toolEvents } = await runChat(client, [{ role: 'user', content: 'Who owes us money?' }]);
    expect(reply).toBe('You have overdue invoices.');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].name).toBe('get_receivables');
    expect((toolEvents[0].result as any).totalOverdue).toBeGreaterThan(0);
  });

  it('streams deltas when hooks.onText is provided and the client can stream', async () => {
    const turns = [
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'get_receivables', input: {} }],
        streamText: 'Checking receivables.',
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'All done.' }], streamText: 'All done.' },
    ];
    let i = 0;
    const client = {
      create: async () => {
        throw new Error('buffered path must not be used when streaming is available');
      },
      createStreaming: async (_params: object, onText: (t: string) => void) => {
        const turn = turns[i++];
        for (const ch of turn.streamText.split(' ')) onText(ch + ' ');
        return turn;
      },
    };
    const deltas: string[] = [];
    let turnStarts = 0;
    const { reply, toolEvents } = await runChat(client, [{ role: 'user', content: 'q' }], 'test-model', {
      onText: (t) => deltas.push(t),
      onTurnStart: () => turnStarts++,
    });
    expect(reply).toBe('All done.');
    expect(turnStarts).toBe(2);
    expect(deltas.join('')).toContain('Checking');
    expect(toolEvents).toHaveLength(1);
  });

  // gpt-oss can spend a whole turn in its reasoning channel and stop without
  // emitting content or a tool call — seen live 2026-07-23 (empty briefing).
  // An empty visible turn is a model hiccup, not an answer: retry once, and
  // never let an empty reply leave the loop.
  it('retries once when a turn ends with no visible output', async () => {
    let calls = 0;
    const client = {
      create: async () => {
        calls++;
        return calls === 1
          ? { stop_reason: 'end_turn', content: [] }
          : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is the briefing.' }] };
      },
    };
    const { reply } = await runChat(client, [{ role: 'user', content: 'briefing' }]);
    expect(calls).toBe(2);
    expect(reply).toBe('Here is the briefing.');
  });

  it('returns an honest failure message, never an empty reply, when the retry is also empty', async () => {
    const client = { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '   ' }] }) };
    const { reply, toolEvents } = await runChat(client, [{ role: 'user', content: 'briefing' }]);
    expect(reply.trim()).not.toBe('');
    expect(reply).toContain('try');
    expect(toolEvents).toHaveLength(0);
  });

  it('survives an unknown tool with is_error rather than throwing', async () => {
    const client = stubClient([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'nope', input: {} }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry.' }] },
    ]);
    const { reply, toolEvents } = await runChat(client, [{ role: 'user', content: 'x' }]);
    expect(reply).toBe('Sorry.');
    expect(toolEvents).toHaveLength(0);
  });
});
