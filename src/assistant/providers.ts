// Provider selection is configuration, not architecture (decision record A5).
// The default path is the Anthropic SDK. The OpenAI-compatible adapter accepts
// Anthropic-shaped params and returns Anthropic-shaped responses, so the chat
// loop and its tests never change per provider. It covers any endpoint that
// speaks the OpenAI chat-completions dialect: a local Ollama (offline demo
// fallback, no key needed) or OpenAI itself.

import Anthropic from '@anthropic-ai/sdk';
import type { ChatClient } from './chat.js';

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status?: number;
  json(): Promise<any>;
  text?(): Promise<string>;
}>;

/**
 * Incremental SSE line splitter: feed raw chunk text (which may split an event
 * anywhere), get back complete `data:` payload strings. Pure and testable.
 */
export function createSSESplitter() {
  let buffer = '';
  return {
    feed(chunk: string): string[] {
      buffer += chunk;
      const events: string[] = [];
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of block.split('\n')) {
          if (line.startsWith('data:')) events.push(line.slice(5).trim());
        }
      }
      return events;
    },
  };
}

/**
 * Accumulates OpenAI chat-completions stream deltas (text + index-keyed
 * tool-call fragments) into the same Anthropic-shaped response the buffered
 * path returns, emitting text deltas as they arrive.
 */
/** OpenAI ({prompt,completion}_tokens) and Anthropic ({input,output}_tokens)
 *  usage normalized to one shape, or undefined when the provider omits it. */
export function normUsage(u: any): { inputTokens: number; outputTokens: number } | undefined {
  if (!u) return undefined;
  const inputTokens = u.input_tokens ?? u.prompt_tokens;
  const outputTokens = u.output_tokens ?? u.completion_tokens;
  if (inputTokens == null && outputTokens == null) return undefined;
  return { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 };
}

export function accumulateOpenAIStream() {
  let text = '';
  let usage: any;
  const toolCalls = new Map<number, { id: string; name: string; args: string }>();
  return {
    push(event: any, onText: (t: string) => void) {
      // The final usage chunk (stream_options.include_usage) carries no choices.
      if (event.usage) usage = event.usage;
      const delta = event.choices?.[0]?.delta ?? {};
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content;
        onText(delta.content);
      }
      for (const frag of delta.tool_calls ?? []) {
        const entry = toolCalls.get(frag.index) ?? { id: '', name: '', args: '' };
        if (frag.id) entry.id = frag.id;
        if (frag.function?.name) entry.name = frag.function.name;
        if (frag.function?.arguments) entry.args += frag.function.arguments;
        toolCalls.set(frag.index, entry);
      }
    },
    finish() {
      const content: any[] = [];
      let clean = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
      // Orphan closing tag: some models stream reasoning with no opener.
      if (clean.includes('</think>')) clean = clean.slice(clean.lastIndexOf('</think>') + '</think>'.length);
      clean = clean.trim();
      if (clean) content.push({ type: 'text', text: clean });
      for (const tc of [...toolCalls.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)) {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.args || '{}');
        } catch {
          input = {};
        }
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
      }
      return { stop_reason: toolCalls.size ? 'tool_use' : 'end_turn', content, usage: normUsage(usage) };
    },
  };
}

export function openaiCompatClient(baseUrl: string, apiKey?: string, fetchImpl: FetchLike = fetch as any): ChatClient {
  const translate = (params: any) => {
    const messages: any[] = [];
    if (params.system) messages.push({ role: 'system', content: params.system });
    for (const m of params.messages) {
      if (typeof m.content === 'string') {
        messages.push({ role: m.role, content: m.content });
        continue;
      }
      if (m.role === 'assistant') {
        const text = m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        const toolCalls = m.content
          .filter((b: any) => b.type === 'tool_use')
          .map((b: any) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
        messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      } else {
        for (const b of m.content) {
          if (b.type === 'tool_result') {
            messages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: String(b.content) });
          } else if (b.type === 'text') {
            messages.push({ role: 'user', content: b.text });
          }
        }
      }
    }
    const tools = (params.tools ?? []).map((t: any) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
    return {
      model: params.model,
      max_tokens: params.max_tokens,
      messages,
      // Omitted when empty: some OpenAI-compatible endpoints reject tools: [].
      ...(tools.length ? { tools } : {}),
    };
  };
  const headers = () => ({
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  });
  const endpoint = () => `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    async createStreaming(params: any, onText: (t: string) => void) {
      const resp = await fetchImpl(endpoint(), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...translate(params), stream: true, stream_options: { include_usage: true } }),
      });
      if (!resp.ok) {
        const detail = resp.text ? await resp.text() : `HTTP ${resp.status}`;
        throw new Error(`Provider error: ${detail}`);
      }
      const splitter = createSSESplitter();
      const acc = accumulateOpenAIStream();
      const reader = (resp as any).body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const payload of splitter.feed(decoder.decode(value, { stream: true }))) {
          if (payload === '[DONE]') continue;
          try {
            acc.push(JSON.parse(payload), onText);
          } catch {
            // Malformed event: skip rather than kill the stream.
          }
        }
      }
      return acc.finish();
    },
    async create(params: any) {
      const body = translate(params);
      const send = async () => {
        const resp = await fetchImpl(endpoint(), {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const detail = resp.text ? await resp.text() : `HTTP ${resp.status}`;
          throw new Error(`Provider error: ${detail}`);
        }
        return resp.json();
      };
      let data;
      try {
        data = await send();
      } catch {
        data = await send(); // one retry: transient hiccups should not kill a live question
      }
      const msg = data.choices?.[0]?.message ?? {};
      const toolCalls = msg.tool_calls ?? [];
      const content: any[] = [];
      const text = (msg.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (text) content.push({ type: 'text', text });
      for (const tc of toolCalls) {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          input = {};
        }
        content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input });
      }
      return { stop_reason: toolCalls.length ? 'tool_use' : 'end_turn', content, usage: normUsage(data.usage) };
    },
  };
}

/** Anthropic SDK wrapped to the ChatClient shape, streaming included. */
function anthropicClient(anthropic: Anthropic): ChatClient {
  return {
    create: async (params: object) => {
      const m = (await anthropic.messages.create(params as any)) as any;
      return { ...m, usage: normUsage(m.usage) };
    },
    createStreaming: async (params: object, onText: (t: string) => void) => {
      const stream = anthropic.messages.stream(params as any);
      stream.on('text', onText);
      const m = (await stream.finalMessage()) as any;
      return { ...m, usage: normUsage(m.usage) };
    },
  };
}

export function makeClient(): ChatClient {
  const provider = process.env.SLIPSTREAM_PROVIDER ?? 'anthropic';
  if (provider === 'openai') {
    const baseUrl = process.env.SLIPSTREAM_BASE_URL ?? 'http://localhost:11434/v1';
    return openaiCompatClient(baseUrl, process.env.SLIPSTREAM_PROVIDER_KEY);
  }
  return anthropicClient(new Anthropic());
}

export interface ResolvedProvider {
  client: ChatClient;
  model: string;
  source: 'server' | 'byo';
}

/**
 * Per-request provider resolution (hosted mode). A visitor may bring their own
 * key via headers — their credentials build a throwaway client for this request
 * and are never stored or logged. Otherwise the server-held provider is used,
 * when the caller is authorized to spend it; null means 401 upstream.
 */
export function resolveRequest(
  headers: Record<string, string | undefined>,
  serverDefault: { client: ChatClient; model: string } | null,
  fetchImpl?: Parameters<typeof openaiCompatClient>[2],
): ResolvedProvider | null {
  const key = headers['x-llm-key'];
  if (key) {
    const provider = headers['x-llm-provider'] ?? 'openai';
    if (provider === 'anthropic') {
      return {
        client: anthropicClient(new Anthropic({ apiKey: key })),
        model: headers['x-llm-model'] ?? 'claude-sonnet-5',
        source: 'byo',
      };
    }
    const baseUrl = headers['x-llm-base-url'] ?? 'https://api.openai.com/v1';
    return {
      client: openaiCompatClient(baseUrl, key, fetchImpl),
      model: headers['x-llm-model'] ?? 'gpt-4o-mini',
      source: 'byo',
    };
  }
  if (serverDefault) return { ...serverDefault, source: 'server' };
  return null;
}

export function defaultModel(): string {
  if (process.env.SLIPSTREAM_MODEL) return process.env.SLIPSTREAM_MODEL;
  return (process.env.SLIPSTREAM_PROVIDER ?? 'anthropic') === 'anthropic' ? 'claude-sonnet-5' : 'qwen3:4b';
}
