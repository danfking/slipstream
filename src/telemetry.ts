// OpenTelemetry tracing (issue #4). Chat turns and tool calls become spans
// with token-usage attributes. The console exporter is the default so the
// telemetry is visible in a demo with no collector running; set
// OTEL_EXPORTER_OTLP_ENDPOINT to ship spans to a real backend, or
// SLIPSTREAM_OTEL=off to disable entirely.
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let started = false;

/** Start tracing once. No-op if disabled or already started. */
export function startTelemetry(): void {
  if (started || process.env.SLIPSTREAM_OTEL === 'off') return;
  started = true;
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  // OTLP batches to a collector; the console exporter emits one span at a time
  // so it reads sensibly in a terminal during a demo.
  const processor = otlpEndpoint
    ? new BatchSpanProcessor(new OTLPTraceExporter())
    : new SimpleSpanProcessor(new ConsoleSpanExporter());
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'slipstream',
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    spanProcessors: [processor],
  });
  provider.register();
  console.log(`Telemetry: ON (${otlpEndpoint ? `OTLP -> ${otlpEndpoint}` : 'console exporter'})`);
}

export const tracer = trace.getTracer('slipstream');
