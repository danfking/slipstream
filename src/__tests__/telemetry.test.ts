import { describe, expect, it } from 'vitest';
import { startTelemetry, tracer } from '../telemetry.js';

// Do not start a real provider in the suite (it would register globally and
// print spans across every other test). Cover the disabled path and that the
// tracer is a working no-op until a provider is registered.
describe('telemetry', () => {
  it('is a no-op when disabled and never throws', () => {
    const prev = process.env.SLIPSTREAM_OTEL;
    process.env.SLIPSTREAM_OTEL = 'off';
    expect(() => startTelemetry()).not.toThrow();
    if (prev === undefined) delete process.env.SLIPSTREAM_OTEL;
    else process.env.SLIPSTREAM_OTEL = prev;
  });

  it('exposes a usable tracer whose spans no-op without a provider', () => {
    const span = tracer.startSpan('test');
    span.setAttribute('slipstream.tool', 'x');
    expect(() => span.end()).not.toThrow();
  });
});
