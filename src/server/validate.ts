// Request-body validation (issue #30). The routes cast the JSON body without
// checking its shape, so a malformed body threw deep in the loop and surfaced
// as a 500 with a raw internal error. This turns those into clean 400s.
import type { ChatMessage } from '../assistant/chat.js';

// String is the documented contract; block arrays are tolerated because the
// provider adapters accept them. Anything else (number, object, missing) is a
// malformed turn.
const validContent = (c: unknown): boolean => typeof c === 'string' || Array.isArray(c);

/** Returns the validated messages array, or null if the body is malformed. */
export function parseMessages(body: unknown): ChatMessage[] | null {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  for (const m of messages) {
    if (!m || typeof m !== 'object') return null;
    if (m.role !== 'user' && m.role !== 'assistant') return null;
    if (!validContent(m.content)) return null;
  }
  return messages as ChatMessage[];
}

/** A turn's content as a string for logging/labels, never throwing. */
export function contentLabel(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}
