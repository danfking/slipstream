import express from 'express';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ANCHOR_DATE } from './data/types.js';
import { MODEL } from './assistant/config.js';
import { makeClient } from './assistant/providers.js';
import { runChat, type ChatMessage } from './assistant/chat.js';
import { applyInvoiceDrafts, type InvoiceDraft } from './tools/actions.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('web'));

const client = makeClient();

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

const BRIEFING_PROMPT =
  'Give me the morning briefing: overnight activity, this week\'s biggest operational risk, and the one financial number I should act on today. Be specific and cite figures.';

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, anchorDate: ANCHOR_DATE });
});

app.post('/api/chat', async (req, res) => {
  try {
    const messages = (req.body?.messages ?? []) as ChatMessage[];
    if (!messages.length) return res.status(400).json({ error: 'messages required' });
    const result = await runChat(client, messages);
    void recordReply(messages[messages.length - 1].content, result.reply);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/briefing', async (_req, res) => {
  try {
    const result = await runChat(client, [{ role: 'user', content: BRIEFING_PROMPT }]);
    void recordReply('(briefing)', result.reply);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/approve', (req, res) => {
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
  console.log(`Slipstream on http://localhost:${port} (model: ${MODEL}, today: ${ANCHOR_DATE})`);
});
