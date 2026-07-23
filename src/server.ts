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
    if (provider.source === 'server') void recordReply(corpusLabel, result.reply);
    const suggestion = suggestNext(
      result.toolEvents.map((e) => e.name),
      messages.filter((m) => m.role === 'user').map((m) => m.content),
    );
    if (suggestion) metrics.recordShown(suggestion.source);
    res.json({ ...result, suggestion });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

app.post('/api/chat', (req, res) => {
  const messages = (req.body?.messages ?? []) as ChatMessage[];
  if (!messages.length) return res.status(400).json({ error: 'messages required' });
  void conversationRoute(req, res, messages, messages[messages.length - 1].content);
});

// Progressive reveal (issue #7): same auth, same rate limit, same loop — but
// text deltas stream as server-sent events while the model generates. Events:
// {type:'start'} at each model turn (client resets its buffer), {type:'delta',
// text}, then {type:'done', reply, toolEvents} — or {type:'error', error}.
// Providers that cannot stream fall back to buffered generation server-side;
// the client code is identical either way (one big delta).
app.post('/api/chat/stream', async (req, res) => {
  const messages = (req.body?.messages ?? []) as ChatMessage[];
  if (!messages.length) return res.status(400).json({ error: 'messages required' });
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
    if (provider.source === 'server') void recordReply(messages[messages.length - 1].content, result.reply);
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

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Slipstream on http://localhost:${port} (model: ${MODEL}, today: ${ANCHOR_DATE}, auth: ${auth.mode})`);
});
