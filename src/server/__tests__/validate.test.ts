import { describe, expect, it } from 'vitest';
import { parseMessages } from '../validate.js';

describe('parseMessages', () => {
  it('accepts a non-empty array of string-content turns', () => {
    const m = [{ role: 'user', content: 'hi' }];
    expect(parseMessages({ messages: m })).toEqual(m);
  });

  it('accepts block-array content (API callers may send it)', () => {
    const m = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
    expect(parseMessages({ messages: m })).toEqual(m);
  });

  it('rejects a non-array messages value', () => {
    expect(parseMessages({ messages: 'hello' })).toBeNull();
    expect(parseMessages({})).toBeNull();
    expect(parseMessages(null)).toBeNull();
  });

  it('rejects an empty array', () => {
    expect(parseMessages({ messages: [] })).toBeNull();
  });

  it('rejects a turn with no content or non-string/array content', () => {
    expect(parseMessages({ messages: [{ role: 'user' }] })).toBeNull();
    expect(parseMessages({ messages: [{ role: 'user', content: 123 }] })).toBeNull();
    expect(parseMessages({ messages: [{ role: 'user', content: null }] })).toBeNull();
  });

  it('rejects an unknown role', () => {
    expect(parseMessages({ messages: [{ role: 'system', content: 'x' }] })).toBeNull();
  });
});
