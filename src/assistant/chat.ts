// Manual tool-use loop over the shared registry. Deliberately not the SDK's
// beta tool runner: the registry is consumed by more than one surface (web
// app now, MCP server later), the loop is the demo's architecture exhibit,
// and avoiding a beta dependency keeps it legible.

import { MAX_LOOP_ITERATIONS, MAX_TOKENS, MODEL } from './config.js';
import { SYSTEM_PROMPT } from './system.js';
import { TOOLS, runTool } from '../tools/registry.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolEvent {
  name: string;
  input: unknown;
  result: unknown;
}

export interface ChatClient {
  create(params: object): Promise<any>;
  /** Stream text deltas while producing the same final response shape as create. */
  createStreaming?(params: object, onText: (delta: string) => void): Promise<any>;
}

export interface ChatHooks {
  /** Called as each model turn begins — the client resets its visible buffer. */
  onTurnStart?: () => void;
  /** Text deltas as the model produces them. Presence enables streaming. */
  onText?: (delta: string) => void;
}

const apiTools = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export async function runChat(client: ChatClient, messages: ChatMessage[], model: string = MODEL, hooks?: ChatHooks) {
  const convo: any[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolEvents: ToolEvent[] = [];
  // Reasoning models (gpt-oss) can spend an entire turn thinking and stop
  // without any visible content or tool call. That is a hiccup, not an answer:
  // retry the turn once, and never return an empty reply as success.
  let emptyRetries = 0;

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    hooks?.onTurnStart?.();
    const params = {
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: apiTools,
      messages: convo,
    };
    const response =
      hooks?.onText && client.createStreaming
        ? await client.createStreaming(params, hooks.onText)
        : await client.create(params);

    if (response.stop_reason !== 'tool_use') {
      const reply = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      if (!reply.trim()) {
        if (emptyRetries < 1) {
          emptyRetries++;
          continue; // nothing was added to convo, so this re-asks the same turn
        }
        return { reply: 'I did not get a usable answer from the model that time. Please try asking again.', toolEvents };
      }
      return { reply, toolEvents };
    }

    convo.push({ role: 'assistant', content: response.content });
    const results = response.content
      .filter((b: any) => b.type === 'tool_use')
      .map((b: any) => {
        try {
          const result = runTool(b.name, b.input);
          toolEvents.push({ name: b.name, input: b.input, result });
          return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(result) };
        } catch (err) {
          return { type: 'tool_result', tool_use_id: b.id, content: String(err), is_error: true };
        }
      });
    convo.push({ role: 'user', content: results });
  }

  return { reply: 'I could not complete that within my step limit.', toolEvents };
}
