import { describe, expect, it } from 'vitest';
import { accumulateOpenAIStream, normUsage } from '../providers.js';

describe('normUsage', () => {
  it('normalizes OpenAI and Anthropic usage shapes to one form', () => {
    expect(normUsage({ prompt_tokens: 10, completion_tokens: 3 })).toEqual({ inputTokens: 10, outputTokens: 3 });
    expect(normUsage({ input_tokens: 5, output_tokens: 2 })).toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  it('returns undefined when usage is absent', () => {
    expect(normUsage(undefined)).toBeUndefined();
    expect(normUsage({})).toBeUndefined();
  });
});

describe('accumulateOpenAIStream token usage', () => {
  it('captures the trailing usage chunk (stream_options.include_usage)', () => {
    const acc = accumulateOpenAIStream();
    const noop = () => {};
    acc.push({ choices: [{ delta: { content: 'hello' } }] }, noop);
    acc.push({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 4 } }, noop);
    expect(acc.finish().usage).toEqual({ inputTokens: 12, outputTokens: 4 });
  });

  it('leaves usage undefined when no usage chunk arrives', () => {
    const acc = accumulateOpenAIStream();
    acc.push({ choices: [{ delta: { content: 'hi' } }] }, () => {});
    expect(acc.finish().usage).toBeUndefined();
  });
});
