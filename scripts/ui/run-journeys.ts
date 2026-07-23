// Journey capture harness: boots the server, replays every journey in a real
// browser, and writes screenshots plus console/timing artefacts for critique.
//
// Capture is sequential by design. One server and one local model serve every
// journey, so running them concurrently would only queue at the model and make
// the timings meaningless.
//
// Usage: npm run ui:capture            (writes artifacts/ui/run<N>/)
//        UI_RUN=v2 npm run ui:capture  (fixed run label, for before/after pairs)
//        UI_JOURNEYS=core-qa,edges npm run ui:capture   (subset, for re-critique)

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { JOURNEYS, type Journey, type Step, type Target } from './journeys.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL = process.env.SLIPSTREAM_MODEL ?? 'gpt-oss:20b';
const PROVIDER = process.env.SLIPSTREAM_PROVIDER ?? 'openai';

// Not 3000: a dev server is often already there, and silently capturing against
// someone else's process is exactly the failure this harness must not have.
const PORTS: Record<Target, number> = { main: 3100, brokenProvider: 3101 };
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * Kill whatever is listening on a port. The node server detaches from the npx
 * wrapper, so killing the spawned PID leaves it bound — and the next boot then
 * silently serves the previous config. Learned the hard way while benchmarking.
 */
function freePort(port: number) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8' });
      const pids = new Set(out.trim().split('\n').map((l) => l.trim().split(/\s+/).pop()!));
      for (const pid of pids) if (pid) execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'ignore' });
    }
  } catch {
    // Nothing listening — the normal case.
  }
}

async function bootServer(target: Target) {
  const port = PORTS[target];
  freePort(port);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    SLIPSTREAM_PROVIDER: PROVIDER,
    SLIPSTREAM_MODEL: MODEL,
  };
  // The broken-provider server is a real server pointed at a dead endpoint, so
  // the UI's error state is captured as it actually renders, not mocked.
  if (target === 'brokenProvider') env.SLIPSTREAM_BASE_URL = 'http://127.0.0.1:9/v1';

  const child = spawn('npx', ['tsx', 'src/server.ts'], { cwd: root, env, shell: true, stdio: 'ignore' });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const health = (await fetch(`http://localhost:${port}/api/health`).then((r) => r.json())) as {
        model?: string;
      };
      // Guard: a stale server on this port would report a different model and
      // quietly invalidate the whole capture run.
      if (health.model !== MODEL) throw new Error(`port ${port} serves "${health.model}", expected "${MODEL}"`);
      return { child, port };
    } catch (err) {
      if (String(err).includes('expected')) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`server on :${port} did not become healthy in 60s`);
}

const sel = {
  input: '#chat-input',
  send: '#send-btn',
  briefing: '#briefing-btn',
  pending: '.msg.pending',
  assistant: '.msg.assistant',
  receipt: 'details.receipt',
};

/** Settled = no pending bubble left and at least one assistant reply present. */
async function waitForReply(page: Page, timeoutMs = 180_000) {
  await page.waitForSelector(sel.pending, { timeout: 5_000 }).catch(() => {});
  // An error card settles a turn just as a reply does — the provider-down
  // journey ends in one, and waiting only for .msg.assistant hangs there.
  await page.waitForFunction(
    () =>
      !document.querySelector('.msg.pending') &&
      (document.querySelectorAll('.msg.assistant').length > 0 || document.querySelector('.error-card') !== null),
    undefined,
    { timeout: timeoutMs },
  );
}

async function runStep(page: Page, step: Step, ctx: { dir: string; index: number; origin: (t?: Target) => string }) {
  switch (step.action) {
    case 'goto':
      await page.goto(ctx.origin(step.target), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(sel.input);
      break;
    case 'resize':
      await page.setViewportSize({ width: step.width, height: step.height });
      break;
    case 'ask':
      await page.fill(sel.input, step.text);
      await page.press(sel.input, 'Enter');
      await waitForReply(page, step.timeoutMs);
      break;
    case 'briefing':
      await page.click(sel.briefing);
      await waitForReply(page, step.timeoutMs);
      break;
    case 'type':
      await page.fill(sel.input, step.text);
      break;
    case 'submit':
      await page.press(sel.input, 'Enter');
      break;
    case 'click':
      await page.click(step.selector, { timeout: 30_000 });
      break;
    case 'waitForReply':
      await waitForReply(page, step.timeoutMs);
      break;
    case 'wait':
      await page.waitForTimeout(step.ms);
      break;
    case 'expandReceipts': {
      for (const d of await page.$$(sel.receipt)) await d.evaluate((el: Element) => el.setAttribute('open', ''));
      await page.waitForTimeout(300);
      break;
    }
    case 'screenshot':
      await page.screenshot({
        path: join(ctx.dir, `${String(ctx.index).padStart(2, '0')}-${step.name}.png`),
        fullPage: step.fullPage ?? false,
      });
      break;
  }
}

async function runJourney(browser: Browser, journey: Journey, runDir: string, origin: (t?: Target) => string) {
  // Wipe first: step indexes shift when a journey is edited, so a re-run into
  // the same label would leave orphaned screenshots from the previous shape —
  // and a critique agent reading those reports findings against dead frames.
  const dir = join(runDir, journey.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({ viewport: journey.viewport ?? DEFAULT_VIEWPORT });
  const page = await context.newPage();

  const console_: { type: string; text: string }[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console_.push({ type: m.type(), text: m.text() });
  });
  page.on('pageerror', (e) => console_.push({ type: 'pageerror', text: String(e) }));

  const steps: { i: number; action: string; label?: string; ms: number; ok: boolean; error?: string }[] = [];
  let failures = 0;

  for (const [i, step] of journey.steps.entries()) {
    const started = Date.now();
    const label = step.action === 'screenshot' ? step.name : step.action === 'ask' ? step.text.slice(0, 48) : undefined;
    try {
      await runStep(page, step, { dir, index: i, origin });
      steps.push({ i, action: step.action, label, ms: Date.now() - started, ok: true });
      process.stdout.write(`    ${String(i).padStart(2)} ${step.action.padEnd(15)} ${Date.now() - started}ms\n`);
    } catch (err) {
      failures++;
      steps.push({ i, action: step.action, label, ms: Date.now() - started, ok: false, error: String(err).slice(0, 300) });
      process.stdout.write(`    ${String(i).padStart(2)} ${step.action.padEnd(15)} FAILED: ${String(err).slice(0, 120)}\n`);
      // Capture the failure state — a broken step is itself a finding.
      await page
        .screenshot({ path: join(dir, `${String(i).padStart(2, '0')}-FAILED-${step.action}.png`) })
        .catch(() => {});
    }
  }

  // Markdown lint gate: run the UI's own lint over every rendered assistant
  // message, in-page, so a marker artifact fails the journey with a screenshot
  // already on disk showing it.
  let mdIssues: string[] = [];
  try {
    mdIssues = await page.evaluate(async () => {
      // Browser-side dynamic import of the served module; the specifier is a
      // URL, not a node module, so keep TS out of resolving it.
      const mod = (await import(/* @vite-ignore */ String('/render.js'))) as {
        lintRendered: (raw: string, html: string) => string[];
      };
      const { lintRendered } = mod;
      const issues = [...document.querySelectorAll('.msg.assistant:not(.pending)')].flatMap((el, i) =>
        lintRendered('', el.innerHTML).map((issue) => `message ${i}: ${issue}`),
      );
      // Scroll-reachability: every pixel of the thread must be scrollable.
      // justify-content:flex-end once pushed overflow above the scroll origin —
      // screenshots looked fine on short threads and the top of long ones was
      // unreachable. Assert the container scrolls to its own top.
      const messages = document.getElementById('messages');
      if (messages && messages.scrollHeight > messages.clientHeight + 1) {
        messages.scrollTop = 0;
        const first = messages.firstElementChild?.getBoundingClientRect();
        const box = messages.getBoundingClientRect();
        if (first && first.top < box.top - 1) issues.push('chat overflow is unreachable above the scroll origin');
        messages.scrollTop = messages.scrollHeight;
      }
      return issues;
    });
  } catch (err) {
    mdIssues = [`lint gate failed to run: ${String(err).slice(0, 120)}`];
  }
  if (mdIssues.length) failures += mdIssues.length;

  writeFileSync(join(dir, 'console.json'), JSON.stringify(console_, null, 2));
  writeFileSync(
    join(dir, 'journey.json'),
    JSON.stringify(
      { name: journey.name, description: journey.description, model: MODEL, steps, failures, consoleIssues: console_.length, mdIssues },
      null,
      2,
    ),
  );
  await context.close();
  return { failures, consoleIssues: console_.length };
}

// --- main -------------------------------------------------------------------

const wanted = process.env.UI_JOURNEYS?.split(',').map((s) => s.trim()).filter(Boolean);
const journeys = wanted?.length ? JOURNEYS.filter((j) => wanted.includes(j.name)) : JOURNEYS;
if (!journeys.length) throw new Error(`no journeys matched UI_JOURNEYS="${process.env.UI_JOURNEYS}"`);

const uiRoot = join(root, 'artifacts', 'ui');
mkdirSync(uiRoot, { recursive: true });
const runLabel =
  process.env.UI_RUN ??
  `run${Math.max(0, ...readdirSync(uiRoot).map((d) => Number(/^run(\d+)$/.exec(d)?.[1] ?? 0))) + 1}`;
const runDir = join(uiRoot, runLabel);
if (existsSync(runDir)) console.log(`(reusing ${runLabel} — existing screenshots will be overwritten)`);
mkdirSync(runDir, { recursive: true });

console.log(`UI capture "${runLabel}" — model: ${MODEL}, journeys: ${journeys.map((j) => j.name).join(', ')}\n`);

const needsBroken = journeys.some((j) => j.steps.some((s) => s.action === 'goto' && s.target === 'brokenProvider'));
const servers = [await bootServer('main'), ...(needsBroken ? [await bootServer('brokenProvider')] : [])];
const origin = (t: Target = 'main') => `http://localhost:${PORTS[t]}`;

const browser = await chromium.launch();
const summary: { name: string; failures: number; consoleIssues: number; ms: number }[] = [];

try {
  for (const journey of journeys) {
    console.log(`  ${journey.name} — ${journey.description}`);
    const started = Date.now();
    const r = await runJourney(browser, journey, runDir, origin);
    summary.push({ name: journey.name, ...r, ms: Date.now() - started });
    console.log('');
  }
} finally {
  await browser.close();
  for (const s of servers) {
    s.child.kill();
    freePort(s.port);
  }
}

writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ run: runLabel, model: MODEL, journeys: summary }, null, 2));

for (const s of summary) {
  console.log(`${s.failures ? 'FAIL' : 'OK  '}  ${s.name.padEnd(20)} ${String(Math.round(s.ms / 1000)).padStart(4)}s  ${s.failures} step failures, ${s.consoleIssues} console issues`);
}
const totalFailures = summary.reduce((n, s) => n + s.failures, 0);
console.log(`\nartefacts: artifacts/ui/${runLabel}`);
process.exit(totalFailures === 0 ? 0 : 1);
