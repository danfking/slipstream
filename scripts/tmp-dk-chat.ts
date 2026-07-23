import { chromium } from 'playwright';
const OUT = 'C:/Users/Work/AppData/Local/Temp/claude-work/explore';
const BASE = 'http://localhost:3210';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/chat-01-cold.png` });

  // header meta populated?
  const meta = await page.evaluate(() => ({ date: document.getElementById('meta-date')?.textContent, model: document.getElementById('meta-model')?.textContent, dot: document.getElementById('header-status-dot')?.className }));
  console.log('HEADER meta:', JSON.stringify(meta));

  // Send-button disabled while empty
  const sendDisabledEmpty = await page.getAttribute('#send-btn', 'disabled');
  console.log('send disabled when empty?', sendDisabledEmpty !== null);
  await page.fill('#chat-input', 'How many slips are vacant?');
  const sendDisabledFilled = await page.getAttribute('#send-btn', 'disabled');
  console.log('send disabled when filled?', sendDisabledFilled !== null);

  // Submit and capture streaming progression
  const lens: number[] = [];
  await page.click('#send-btn');
  // Poll assistant bubble text length while streaming
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const bubbles = document.querySelectorAll('.msg.assistant');
      const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
      const pending = document.querySelector('.msg.assistant.pending');
      const streaming = document.querySelector('.msg.assistant.streaming');
      const inputDisabled = (document.getElementById('chat-input') as HTMLInputElement).disabled;
      return { len: last?.innerText?.length ?? 0, pending: !!pending, streaming: !!streaming, inputDisabled };
    });
    lens.push(info.len);
    if (i === 2) await page.screenshot({ path: `${OUT}/chat-02-streaming-early.png` });
    if (!info.pending && !info.streaming && !info.inputDisabled && info.len > 0) { console.log(`settled at poll ${i}`); break; }
  }
  console.log('STREAM lengths over time:', JSON.stringify(lens));
  const monotone = lens.filter((n) => n > 0).every((n, i, a) => i === 0 || a[i - 1] <= n || Math.abs(a[i-1]-n) < 5);
  console.log('stream length grew roughly monotonically?', monotone);
  await page.screenshot({ path: `${OUT}/chat-03-settled.png` });

  // Suggestion placeholder after reply
  await page.waitForTimeout(1500); // trailing suggestion event
  const placeholder = await page.getAttribute('#chat-input', 'placeholder');
  console.log('PLACEHOLDER after reply:', JSON.stringify(placeholder));

  // Tab accepts suggestion when input empty
  await page.focus('#chat-input');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const afterTab = await page.inputValue('#chat-input');
  console.log('input value after Tab (empty):', JSON.stringify(afterTab));

  // Clear, then Shift+Tab must NOT accept
  await page.fill('#chat-input', '');
  await page.waitForTimeout(100);
  await page.focus('#chat-input');
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(150);
  const afterShiftTab = await page.inputValue('#chat-input');
  console.log('input value after Shift+Tab (should stay empty):', JSON.stringify(afterShiftTab));

  // Tab with non-empty input must NOT overwrite
  await page.fill('#chat-input', 'my own text');
  await page.focus('#chat-input');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const afterTabNonEmpty = await page.inputValue('#chat-input');
  console.log('input value after Tab (non-empty, should stay):', JSON.stringify(afterTabNonEmpty));
  await page.fill('#chat-input', '');

  // Receipts populated
  const receipts = await page.evaluate(() => {
    const groups = document.querySelectorAll('#receipts .receipt-turn');
    const rows = document.querySelectorAll('#receipts details.receipt');
    return { groups: groups.length, rows: rows.length, firstHeading: document.querySelector('.turn-question')?.textContent };
  });
  console.log('RECEIPTS:', JSON.stringify(receipts));
  // Expand first receipt
  await page.click('#receipts details.receipt summary').catch(() => console.log('no receipt to expand'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/chat-04-receipt-expanded.png` });

  // Citation chip click (if any)
  const chipCount = await page.$$eval('.msg.assistant .citation', (c) => c.length);
  console.log('citation chips in reply:', chipCount);
  if (chipCount > 0) {
    await page.click('.msg.assistant .citation');
    await page.waitForTimeout(500);
    const flashed = await page.$$eval('#receipts details.receipt.flash', (f) => f.length);
    console.log('receipt flashed after chip click?', flashed > 0);
    await page.screenshot({ path: `${OUT}/chat-05-citation-flash.png` });
  }

  // Briefing button
  await page.click('#briefing-btn');
  await page.waitForTimeout(500);
  const briefingUserMsg = await page.evaluate(() => document.querySelector('.msg.user:last-of-type')?.textContent);
  const briefingDisabled = await page.getAttribute('#briefing-btn', 'disabled');
  console.log('briefing user bubble text:', JSON.stringify(briefingUserMsg), 'briefing btn disabled during?', briefingDisabled !== null);
  // wait for briefing reply
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(500);
    const done = await page.evaluate(() => !document.querySelector('.msg.assistant.pending') && !document.querySelector('.msg.assistant.streaming') && !(document.getElementById('chat-input') as HTMLInputElement).disabled);
    if (done) { console.log(`briefing settled at ${i}`); break; }
  }
  await page.screenshot({ path: `${OUT}/chat-06-briefing.png`, fullPage: true });

  console.log('CONSOLE ERRS:', JSON.stringify(errs, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
