import { describe, expect, it } from 'vitest';
import { openaiCompatClient } from '../providers.js';

describe('openaiCompatClient', () => {
  it('translates Anthropic-shaped params to an OpenAI-compatible request', async () => {
    let captured: any;
    const fetchStub = async (_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'hi', tool_calls: null } }] }),
      } as any;
    };
    const client = openaiCompatClient('http://localhost:11434/v1', undefined, fetchStub as any);
    await client.create({
      model: 'qwen3:4b',
      max_tokens: 512,
      system: 'be brief',
      tools: [{ name: 'get_x', description: 'd', input_schema: { type: 'object', properties: {} } }],
      messages: [
        { role: 'user', content: 'q1' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'checking' },
            { type: 'tool_use', id: 't1', name: 'get_x', input: { a: 1 } },
          ],
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' }] },
      ],
    });
    expect(captured.messages[0]).toEqual({ role: 'system', content: 'be brief' });
    expect(captured.messages[1]).toEqual({ role: 'user', content: 'q1' });
    expect(captured.messages[2].tool_calls[0].function.name).toBe('get_x');
    expect(JSON.parse(captured.messages[2].tool_calls[0].function.arguments)).toEqual({ a: 1 });
    expect(captured.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"ok":true}' });
    expect(captured.tools[0].function.name).toBe('get_x');
  });

  it('retries once on a transient provider failure', async () => {
    let calls = 0;
    const fetchStub = async () => {
      calls++;
      if (calls === 1) throw new Error('socket hang up');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as any;
    };
    const client = openaiCompatClient('http://x/v1', undefined, fetchStub as any);
    const resp = await client.create({ model: 'm', max_tokens: 10, messages: [] });
    expect(calls).toBe(2);
    expect(resp.content[0].text).toBe('ok');
  });

  it('strips <think> blocks from reply text', async () => {
    const fetchStub = async () =>
      ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '<think>secret plan</think>The answer is 5.' } }] }),
      }) as any;
    const client = openaiCompatClient('http://x/v1', undefined, fetchStub as any);
    const resp = await client.create({ model: 'm', max_tokens: 10, messages: [] });
    expect(resp.content[0].text).toBe('The answer is 5.');
  });

  it('translates an OpenAI tool-call response into Anthropic shape', async () => {
    const fetchStub = async () =>
      ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: 'c1', function: { name: 'get_x', arguments: '{"a":2}' } }],
              },
            },
          ],
        }),
      }) as any;
    const client = openaiCompatClient('http://x/v1', 'key', fetchStub as any);
    const resp = await client.create({ model: 'm', max_tokens: 10, system: 's', tools: [], messages: [] });
    expect(resp.stop_reason).toBe('tool_use');
    expect(resp.content[0]).toEqual({ type: 'tool_use', id: 'c1', name: 'get_x', input: { a: 2 } });
  });
});
