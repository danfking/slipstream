// Markdown soak: hammer the live server with markdown-heavy prompts and lint
// every reply through the real pipeline. This is the net for the stochastic
// defects — a malformation that appears one run in ten shows up here, not in a
// demo. Usage: npm run soak            (20 generations against :3000)
//        SOAK_N=50 GOLDEN_URL=http://localhost:3000 npm run soak

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { lintReply } from './lib/mdpipe.js';

const BASE = process.env.GOLDEN_URL ?? 'http://localhost:3000';
const N = Number(process.env.SOAK_N ?? 20);

const PROMPTS = [
  'Give me the morning briefing: overnight activity, this week\'s biggest operational risk, and the one financial number I should act on today. Be specific and cite figures.',
  'Summarise everything blocking revenue this week: unbilled work, overdue invoices, and parts-blocked jobs, with figures for each.',
  'Break down the haul-out schedule for the next three weeks by technician, and flag any capacity problems.',
  'List every overdue account with amounts and days overdue, then recommend which to chase first and why.',
  'Compare each dock\'s actual monthly revenue to its potential, and tell me where we are leaving the most money on the table.',
];

const failDir = join('artifacts', 'corpus');
mkdirSync(failDir, { recursive: true });

const health = (await fetch(`${BASE}/api/health`).then((r) => r.json())) as { model: string };
console.log(`Markdown soak: ${N} generations against ${BASE} — model: ${health.model}\n`);

let failures = 0;
for (let i = 0; i < N; i++) {
  const question = PROMPTS[i % PROMPTS.length];
  const started = Date.now();
  const resp = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });
  if (!resp.ok) {
    failures++;
    console.log(`FAIL ${String(i + 1).padStart(3)}  HTTP ${resp.status}`);
    continue;
  }
  const data = (await resp.json()) as { reply: string; toolEvents: { name: string }[] };
  const issues = lintReply(data.reply, data.toolEvents.map((t) => t.name));
  if (issues.length) {
    failures++;
    appendFileSync(join(failDir, 'soak-failures.jsonl'), JSON.stringify({ question, issues, reply: data.reply }) + '\n');
    console.log(`FAIL ${String(i + 1).padStart(3)}  ${Date.now() - started}ms  ${issues.join(' | ')}`);
  } else {
    console.log(`ok   ${String(i + 1).padStart(3)}  ${Date.now() - started}ms`);
  }
}

console.log(`\n${N - failures}/${N} lint-free${failures ? ' — raw failures saved to artifacts/corpus/soak-failures.jsonl (promote to test/fixtures/replies)' : ''}`);
process.exit(failures === 0 ? 0 : 1);
