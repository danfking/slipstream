import { describe, expect, it } from 'vitest';
import { createSSESplitter, accumulateOpenAIStream, openaiCompatClient, resolveRequest } from '../providers.js';

describe('createSSESplitter', () => {
  it('reassembles events across arbitrary chunk boundaries', () => {
    const split = createSSESplitter();
    const events = [
      ...split.feed('data: {"a"'),
      ...split.feed(':1}\n\ndata: {"b":2}\n\nda'),
      ...split.feed('ta: [DONE]\n\n'),
    ];
    expect(events).toEqual(['{"a":1}', '{"b":2}', '[DONE]']);
  });

  it('ignores comments and empty lines', () => {
    const split = createSSESplitter();
    expect(split.feed(': keepalive\n\ndata: {"x":1}\n\n')).toEqual(['{"x":1}']);
  });
});

describe('accumulateOpenAIStream', () => {
  it('accumulates text deltas and tool-call fragments into an Anthropic-shaped response', () => {
    const acc = accumulateOpenAIStream();
    const texts: string[] = [];
    const push = (json: string) => acc.push(JSON.parse(json), (t) => texts.push(t));
    push('{"choices":[{"delta":{"content":"Check"}}]}');
    push('{"choices":[{"delta":{"content":"ing."}}]}');
    push('{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"get_unbilled_work","arguments":""}}]}}]}');
    push('{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":"}}]}}]}');
    push('{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}');
    const resp = acc.finish();
    expect(texts).toEqual(['Check', 'ing.']);
    expect(resp.stop_reason).toBe('tool_use');
    expect(resp.content[0]).toEqual({ type: 'text', text: 'Checking.' });
    expect(resp.content[1]).toEqual({ type: 'tool_use', id: 'c1', name: 'get_unbilled_work', input: { a: 1 } });
  });

  it('text-only stream finishes as end_turn', () => {
    const acc = accumulateOpenAIStream();
    acc.push({ choices: [{ delta: { content: 'Done.' } }] }, () => {});
    const resp = acc.finish();
    expect(resp.stop_reason).toBe('end_turn');
    expect(resp.content).toEqual([{ type: 'text', text: 'Done.' }]);
  });
});

describe('resolveRequest (per-request provider)', () => {
  const serverDefault = { client: { create: async () => ({}) }, model: 'server-model' };

  it('no BYO headers → server default when authorized', () => {
    const r = resolveRequest({}, serverDefault);
    expect(r?.source).toBe('server');
    expect(r?.model).toBe('server-model');
  });

  it('no BYO headers and no server credentials → null (401 upstream)', () => {
    expect(resolveRequest({}, null)).toBeNull();
  });

  it('BYO openai-compatible headers build a visitor client with their model', async () => {
    let captured: any;
    const fetchStub = async (url: string, init: any) => {
      captured = { url, auth: init.headers.authorization, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) } as any;
    };
    const r = resolveRequest(
      { 'x-llm-key': 'sk-visitor', 'x-llm-provider': 'openai', 'x-llm-model': 'gpt-4o-mini' },
      serverDefault,
      fetchStub as any,
    );
    expect(r?.source).toBe('byo');
    expect(r?.model).toBe('gpt-4o-mini');
    await r!.client.create({ model: r!.model, max_tokens: 5, messages: [] });
    expect(captured.url).toContain('api.openai.com');
    expect(captured.auth).toBe('Bearer sk-visitor');
  });

  it('BYO with custom base url is honoured', async () => {
    let url = '';
    const fetchStub = async (u: string) => {
      url = u;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'x' } }] }) } as any;
    };
    const r = resolveRequest(
      { 'x-llm-key': 'k', 'x-llm-provider': 'openai', 'x-llm-base-url': 'http://localhost:11434/v1', 'x-llm-model': 'qwen3:4b' },
      null,
      fetchStub as any,
    );
    await r!.client.create({ model: 'qwen3:4b', max_tokens: 5, messages: [] });
    expect(url).toContain('localhost:11434');
  });

  it('BYO anthropic provider resolves with a client and the requested model', () => {
    const r = resolveRequest({ 'x-llm-key': 'sk-ant-x', 'x-llm-provider': 'anthropic', 'x-llm-model': 'claude-sonnet-5' }, null);
    expect(r?.source).toBe('byo');
    expect(r?.model).toBe('claude-sonnet-5');
    expect(typeof r?.client.create).toBe('function');
  });
});

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
