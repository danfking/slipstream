// Golden batch: real questions with known answers, run end-to-end through the
// same HTTP stack the demo uses (decision record A5/A6: the trust model as a
// runnable artefact). Requires the server: `npm run dev` (any provider).
// Usage: npm run golden   (GOLDEN_URL overrides the target, default :3000)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintReply } from './lib/mdpipe.js';

interface GoldenCase {
  id: string;
  question: string;
  mustInclude: string[];
  mustCallTools: string[];
}

const BASE = process.env.GOLDEN_URL ?? 'http://localhost:3000';

// Hosted (gated) targets: GOLDEN_PASSCODE buys a session so the batch can run
// against the exact demo-day deployment. Run this in your own terminal:
//   GOLDEN_URL=https://slipstream-dk.fly.dev GOLDEN_PASSCODE=... npm run golden
let sessionCookie = '';
async function establishSession() {
  const passcode = process.env.GOLDEN_PASSCODE;
  if (!passcode) return;
  const resp = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  if (!resp.ok) throw new Error(`passcode rejected (${resp.status}) — check GOLDEN_PASSCODE`);
  const setCookie = resp.headers.getSetCookie?.()[0] ?? resp.headers.get('set-cookie') ?? '';
  sessionCookie = setCookie.split(';')[0];
  if (!sessionCookie) throw new Error('no session cookie returned');
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cases: GoldenCase[] = JSON.parse(readFileSync(join(root, 'golden', 'golden.json'), 'utf-8'));

// Lowercase, drop currency/comma separators, and collapse any whitespace used
// as a thousands separator ("14 520" → "14520") without touching word spacing.
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[$,]/g, '')
    .replace(/(\d)[\s  ]+(?=\d)/g, '$1');

async function runCase(c: GoldenCase) {
  const started = Date.now();
  const resp = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(sessionCookie ? { cookie: sessionCookie } : {}) },
    body: JSON.stringify({ messages: [{ role: 'user', content: c.question }] }),
  });
  if (!resp.ok) return { c, ok: false, ms: Date.now() - started, missing: [`HTTP ${resp.status}`], reply: '' };
  const data = (await resp.json()) as { reply: string; toolEvents: { name: string }[] };
  const reply = normalize(data.reply ?? '');
  const calledTools = new Set((data.toolEvents ?? []).map((t) => t.name));
  const missing: string[] = [];
  for (const needle of c.mustInclude) if (!reply.includes(normalize(needle))) missing.push(`text:"${needle}"`);
  for (const tool of c.mustCallTools) if (!calledTools.has(tool)) missing.push(`tool:${tool}`);
  // Markdown gate: every live reply must render lint-free through the same
  // pipeline the UI uses — new model quirks fail here, not in front of a human.
  for (const issue of lintReply(data.reply ?? '', [...calledTools])) missing.push(`md:${issue}`);
  return { c, ok: missing.length === 0, ms: Date.now() - started, missing, reply: data.reply ?? '' };
}

await establishSession();
const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
console.log(`Golden batch against ${BASE} — model: ${health.model}${sessionCookie ? ' (passcode session)' : ''}\n`);

let passed = 0;
for (const c of cases) {
  const r = await runCase(c);
  if (r.ok) passed++;
  const status = r.ok ? 'PASS' : 'FAIL';
  console.log(`${status}  ${c.id.padEnd(22)} ${String(r.ms).padStart(6)}ms${r.ok ? '' : `  missing: ${r.missing.join(', ')}`}`);
  if (!r.ok && r.reply) console.log(`      reply was: ${r.reply.slice(0, 220).replace(/\n/g, ' ')}…`);
}

console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
