import { startTelemetry } from './telemetry.js';
import express from 'express';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ANCHOR_DATE } from './data/types.js';
import { MODEL } from './assistant/config.js';
import { makeClient, resolveRequest, type ResolvedProvider } from './assistant/providers.js';
import { runChat, type ChatMessage } from './assistant/chat.js';
import { applyInvoiceDrafts, type InvoiceDraft } from './tools/actions.js';
import { createAuth, parseCookies, TokenBucket } from './server/auth.js';
import { generateSuggestion, suggestNext } from './assistant/suggest.js';
import { createMetrics, type UsedKind } from './server/metrics.js';
import { createProviderHealth, recordStoreStatus, worstState, type ServiceStatus } from './server/status.js';
import { contentLabel, parseMessages } from './server/validate.js';
import { checkReply, loadGoldenCases } from './golden/check.js';
import { db } from './data/store.js';

// Tracing first, before anything it should instrument (issue #4).
startTelemetry();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('web'));
// The written pack, served to the in-app deck (web/deck.html) so the whole
// debrief — slides and live demo — happens in one browser tab. Public on
// purpose: the deck is the pitch and burns no model credits.
app.use('/pack', express.static('docs/pack'));

// --- credential gate (hosted mode; open locally when no passcode is set) -----
const auth = createAuth(process.env.SLIPSTREAM_PASSCODE);
const serverClient = { client: makeClient(), model: MODEL };
const SESSION_COOKIE = 'slipstream_session';
if (auth.mode === 'gated') {
  console.log('Credential gate: ON (passcode session unlocks the server provider; visitors may bring their own key)');
}

// Abuse ceiling for the shared hosted key (burnish's pattern). Generous enough
// for a live demo with retries, tight enough that a stranger cannot drain the
// credit. A separate, stricter bucket guards the passcode endpoint — that is
// the one worth brute-forcing.
const bucket = new TokenBucket(20, 60_000);
const passcodeBucket = new TokenBucket(5, 60_000);
const trustProxy = process.env.TRUST_PROXY === 'true';
if (trustProxy) app.set('trust proxy', true);
const clientIp = (req: express.Request) => (trustProxy ? req.ip : req.socket.remoteAddress) ?? 'unknown';

/** Resolve who pays for this request's model usage; null → 401. */
function providerFor(req: express.Request): ResolvedProvider | null {
  const cookies = parseCookies(req.headers.cookie);
  const authorized = auth.isAuthorized(cookies[SESSION_COOKIE]);
  return resolveRequest(
    {
      'x-llm-key': req.header('x-llm-key'),
      'x-llm-provider': req.header('x-llm-provider'),
      'x-llm-base-url': req.header('x-llm-base-url'),
      'x-llm-model': req.header('x-llm-model'),
    },
    authorized ? serverClient : null,
  );
}

// Every raw reply is corpus: real model output is the only honest source of
// markdown-defect fixtures, and appending here turns each session into
// regression material (curated samples get promoted to test/fixtures/replies).
const corpusDir = join('artifacts', 'corpus');
const corpusReady = mkdir(corpusDir, { recursive: true }).catch(() => undefined);
async function recordReply(question: string, reply: string) {
  try {
    await corpusReady;
    await appendFile(join(corpusDir, 'replies.jsonl'), JSON.stringify({ model: MODEL, question, reply }) + '\n');
  } catch {
    // Corpus capture must never break serving.
  }
}

// Advisor-tier gate (issue #3): the assistant suggests a likely next question;
// these counters measure whether people take it. Shown is counted where the
// suggestion is served (one source of truth); used arrives back on the next
// question via headers the client sets when a suggestion was accepted.
const metrics = createMetrics();
function recordSuggestionUse(req: express.Request) {
  const kind = req.header('x-suggestion-used');
  const source = req.header('x-suggestion-source');
  if ((kind === 'verbatim' || kind === 'edited') && source) {
    metrics.recordUsed(kind as UsedKind, source);
  }
}

const BRIEFING_PROMPT =
  'Give me the morning briefing: overnight activity, this week\'s biggest operational risk, and the one financial number I should act on today. Be specific and cite figures.';

app.get('/api/health', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  res.json({
    ok: true,
    model: MODEL,
    anchorDate: ANCHOR_DATE,
    authMode: auth.mode,
    authorized: auth.isAuthorized(cookies[SESSION_COOKIE]),
  });
});

// Nothing sensitive in here — counts only — so public like /api/health.
app.get('/api/metrics', (_req, res) => {
  res.json(metrics.snapshot());
});

// The golden batch, runnable from the UI (slide 7: "run live"). The case list
// is public (just questions); running them spends model credits, so the run is
// auth-gated, rate-limited, and streams each result as it completes.
const goldenCases = loadGoldenCases();
const goldenBucket = new TokenBucket(3, 60_000);

app.get('/api/golden/cases', (_req, res) => {
  res.json(goldenCases.map((c) => ({ id: c.id, question: c.question })));
});

app.get('/api/golden/run', async (req, res) => {
  if (!goldenBucket.take(clientIp(req))) return res.status(429).json({ error: 'Give the accuracy checks a minute between runs.' });
  const provider = providerFor(req);
  if (!provider) return res.status(401).json({ error: 'unlock required', detail: 'Enter the passcode, or bring your own model API key.' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const emit = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  emit({ type: 'start', total: goldenCases.length });
  let passed = 0;
  for (const c of goldenCases) {
    const started = Date.now();
    try {
      const result = await runChat(provider.client, [{ role: 'user', content: c.question }], provider.model);
      if (provider.source === 'server') providerHealth.recordSuccess();
      const missing = checkReply(result.reply, result.toolEvents.map((e) => e.name), c);
      if (!missing.length) passed++;
      emit({ type: 'case', id: c.id, question: c.question, ok: missing.length === 0, missing, ms: Date.now() - started });
    } catch (err) {
      if (provider.source === 'server') providerHealth.recordError(String(err));
      emit({ type: 'case', id: c.id, question: c.question, ok: false, missing: [String(err)], ms: Date.now() - started });
    }
  }
  emit({ type: 'done', passed, total: goldenCases.length });
  res.end();
});

// Synthetic-data browser (issue #6): the honesty disclosure made explorable.
// Read-only by construction — a GET returning the seed; the only mutation
// surface in the app stays /api/approve. Live db on purpose: invoices created
// through the approval flow show up here, which is part of the demo.
app.get('/api/record', (_req, res) => {
  res.json(db);
});

// Service status (issue #5): receipts for answers, status for infrastructure.
// Provider health comes from real request outcomes; Blu and telemetry are
// labelled mocks — the honesty line applies to the status page too.
const providerHealth = createProviderHealth();
app.get('/api/status', (_req, res) => {
  const nowIso = new Date().toISOString();
  const services: ServiceStatus[] = [
    recordStoreStatus(db as unknown as Record<string, unknown>, ANCHOR_DATE),
    providerHealth.status(MODEL),
    { name: 'Blu webhook (mock)', state: 'ok', lastChecked: nowIso, detail: 'Simulated partner feed: voice-agent and portal events land in the record with source badges.' },
    {
      name: 'Telemetry',
      state: 'ok',
      lastChecked: nowIso,
      detail: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? `OpenTelemetry tracing chat turns and tool calls; exporting to ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}.`
        : 'OpenTelemetry tracing chat turns and tool calls with token usage; console exporter (set OTEL_EXPORTER_OTLP_ENDPOINT to ship spans).',
    },
  ];
  res.json({ overall: worstState(services.map((s) => s.state)), services });
});

app.post('/api/session', (req, res) => {
  if (!passcodeBucket.take(clientIp(req))) return res.status(429).json({ error: 'Too many attempts: give it a minute.' });
  const token = auth.login(String(req.body?.passcode ?? ''));
  if (!token) return res.status(401).json({ error: 'wrong passcode' });
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${trustProxy ? '; Secure' : ''}`,
  );
  res.json({ ok: true });
});

async function conversationRoute(req: express.Request, res: express.Response, messages: ChatMessage[], corpusLabel: string) {
  if (!bucket.take(clientIp(req))) return res.status(429).json({ error: 'Rate limit: give it a minute.' });
  const provider = providerFor(req);
  if (!provider) {
    return res.status(401).json({ error: 'unlock required', detail: 'Enter the passcode, or bring your own model API key.' });
  }
  recordSuggestionUse(req);
  try {
    const result = await runChat(provider.client, messages, provider.model);
    // Status tracks the SERVER provider only: a visitor's broken BYO key says
    // nothing about our service, and its error text can echo their key.
    if (provider.source === 'server') providerHealth.recordSuccess();
    if (provider.source === 'server') void recordReply(corpusLabel, result.reply);
    const suggestion = suggestNext(
      result.toolEvents.map((e) => e.name),
      messages.filter((m) => m.role === 'user').map((m) => m.content),
    );
    if (suggestion) metrics.recordShown(suggestion.source);
    res.json({ ...result, suggestion });
  } catch (err) {
    if (provider.source === 'server') providerHealth.recordError(String(err));
    res.status(500).json({ error: String(err) });
  }
}

const BAD_MESSAGES = 'messages must be a non-empty array of { role, content } turns';

app.post('/api/chat', (req, res) => {
  const messages = parseMessages(req.body);
  if (!messages) return res.status(400).json({ error: BAD_MESSAGES });
  void conversationRoute(req, res, messages, contentLabel(messages[messages.length - 1].content));
});

// Progressive reveal (issue #7): same auth, same rate limit, same loop — but
// text deltas stream as server-sent events while the model generates. Events:
// {type:'start'} at each model turn (client resets its buffer), {type:'delta',
// text}, then {type:'done', reply, toolEvents} — or {type:'error', error}.
// Providers that cannot stream fall back to buffered generation server-side;
// the client code is identical either way (one big delta).
app.post('/api/chat/stream', async (req, res) => {
  const messages = parseMessages(req.body);
  if (!messages) return res.status(400).json({ error: BAD_MESSAGES });
  if (!bucket.take(clientIp(req))) return res.status(429).json({ error: 'Rate limit: give it a minute.' });
  const provider = providerFor(req);
  if (!provider) {
    return res.status(401).json({ error: 'unlock required', detail: 'Enter the passcode, or bring your own model API key.' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  recordSuggestionUse(req);
  const emit = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const result = await runChat(provider.client, messages, provider.model, {
      onTurnStart: () => emit({ type: 'start' }),
      onText: (text) => emit({ type: 'delta', text }),
    });
    if (provider.source === 'server') providerHealth.recordSuccess();
    if (provider.source === 'server') void recordReply(contentLabel(messages[messages.length - 1].content), result.reply);
    // The reply ships first — the suggestion must never delay the answer. The
    // contextual (model-generated) suggestion follows as a trailing event; on
    // any failure it degrades to the static map. The client re-enables input
    // at done, so a slow suggestion never holds the UI hostage.
    emit({ type: 'done', reply: result.reply, toolEvents: result.toolEvents });
    const asked = messages.filter((m) => m.role === 'user').map((m) => m.content);
    const suggestion =
      (await generateSuggestion(provider.client, provider.model, [...messages, { role: 'assistant', content: result.reply }], asked)) ??
      suggestNext(result.toolEvents.map((e) => e.name), asked);
    if (suggestion) {
      metrics.recordShown(suggestion.source);
      emit({ type: 'suggestion', suggestion });
    }
  } catch (err) {
    if (provider.source === 'server') providerHealth.recordError(String(err));
    emit({ type: 'error', error: String(err) });
  }
  res.end();
});

app.get('/api/briefing', (req, res) => {
  void conversationRoute(req, res, [{ role: 'user', content: BRIEFING_PROMPT }], '(briefing)');
});

app.post('/api/approve', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const hasByoKey = Boolean(req.header('x-llm-key'));
  if (!auth.isAuthorized(cookies[SESSION_COOKIE]) && !hasByoKey) {
    return res.status(401).json({ error: 'unlock required' });
  }
  try {
    const drafts = (req.body?.drafts ?? []) as InvoiceDraft[];
    if (!drafts.length) return res.status(400).json({ error: 'drafts required' });
    res.json(applyInvoiceDrafts(drafts));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Malformed JSON otherwise falls through to Express's default HTML error page,
// which leaks a stack trace and absolute file paths (issue #30). Return a clean
// 400 instead. Registered last so it catches body-parser errors from any route.
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  next(err);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Slipstream on http://localhost:${port} (model: ${MODEL}, today: ${ANCHOR_DATE}, auth: ${auth.mode})`);
});
