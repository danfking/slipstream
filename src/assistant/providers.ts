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

export function openaiCompatClient(baseUrl: string, apiKey?: string, fetchImpl: FetchLike = fetch as any): ChatClient {
  return {
    async create(params: any) {
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
      const body = {
        model: params.model,
        max_tokens: params.max_tokens,
        messages,
        tools: (params.tools ?? []).map((t: any) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.input_schema },
        })),
      };
      const send = async () => {
        const resp = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
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
      return { stop_reason: toolCalls.length ? 'tool_use' : 'end_turn', content };
    },
  };
}

export function makeClient(): ChatClient {
  const provider = process.env.SLIPSTREAM_PROVIDER ?? 'anthropic';
  if (provider === 'openai') {
    const baseUrl = process.env.SLIPSTREAM_BASE_URL ?? 'http://localhost:11434/v1';
    return openaiCompatClient(baseUrl, process.env.SLIPSTREAM_PROVIDER_KEY);
  }
  const anthropic = new Anthropic();
  return { create: (params: object) => anthropic.messages.create(params as any) as Promise<any> };
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
      const anthropic = new Anthropic({ apiKey: key });
      return {
        client: { create: (params: object) => anthropic.messages.create(params as any) as Promise<any> },
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
