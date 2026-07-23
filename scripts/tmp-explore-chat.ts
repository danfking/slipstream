// Temporary: chat flow — approval ask, Tab suggestion, briefing, scroll
import { chromium } from 'playwright';
const SHOT = 'C:/Users/Work/AppData/Local/Temp/claude-work/slipstream-ui';

async function waitForIdle(page: any, label: string, timeoutMs = 120000) {
  // wait until no .streaming/.pending bubble remains and input is enabled
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const busy = await page.evaluate(() => ({
      streaming: document.querySelectorAll('.msg.streaming, .msg.pending').length,
      inputDisabled: (document.getElementById('chat-input') as HTMLInputElement).disabled,
      sendDisabled: (document.getElementById('send-btn') as HTMLButtonElement).disabled,
    }));
    if (!busy.streaming && !busy.inputDisabled && !busy.sendDisabled) return true;
    await page.waitForTimeout(1500);
  }
  console.log(`TIMEOUT waiting for idle: ${label}`);
  return false;
}

function snapshotState(page: any) {
  return page.evaluate(() => {
    const msgs = [...document.querySelectorAll('#messages .msg')].map(m => ({
      cls: m.className,
      textStart: (m.textContent || '').slice(0, 300),
      rawMarkdownArtifacts: /(\*\*|^#{1,3} |<think>|\|\s*---)/m.test(m.textContent || ''),
      hasTable: !!m.querySelector('table'),
      hasList: !!m.querySelector('ul,ol'),
      citations: [...m.querySelectorAll('.citation')].map(c => c.textContent),
    }));
    const turns = [...document.querySelectorAll('.receipt-turn')].map(t => ({
      q: t.querySelector('.turn-question')?.textContent,
      receipts: [...t.querySelectorAll('.receipt .tool-name')].map(r => r.textContent),
    }));
    const approval = document.querySelector('.approval-card');
    return {
      msgCount: msgs.length,
      msgs,
      turns,
      approvalPresent: !!approval,
      approvalText: approval ? (approval.textContent || '').slice(0, 600) : null,
      approvalButtons: approval ? [...approval.querySelectorAll('button')].map(b => b.textContent) : null,
      placeholder: (document.getElementById('chat-input') as HTMLInputElement).placeholder,
      errCards: document.querySelectorAll('.error-card').length,
    };
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs: string[] = [];
  page.on('console', (m: any) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e: any) => errs.push('pageerror: ' + e.message));

  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(800);

  // 1) approval ask
  await page.fill('#chat-input', 'Draft invoices for the completed unbilled work');
  await page.click('#send-btn');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT}/40-chat-pending.png` });
  // catch it mid-stream
  await page.waitForSelector('.msg.streaming', { timeout: 60000 }).catch(() => console.log('no streaming class seen'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT}/41-chat-streaming.png` });
  await waitForIdle(page, 'approval ask');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT}/42-chat-approval.png`, fullPage: false });
  console.log('AFTER APPROVAL ASK:', JSON.stringify(await snapshotState(page), null, 1));

  // wait extra for trailing suggestion (up to 25s)
  for (let i = 0; i < 12; i++) {
    const ph = await page.evaluate(() => (document.getElementById('chat-input') as HTMLInputElement).placeholder);
    if (/Tab to use/.test(ph)) break;
    await page.waitForTimeout(2500);
  }
  const ph1 = await page.evaluate(() => (document.getElementById('chat-input') as HTMLInputElement).placeholder);
  console.log('PLACEHOLDER after turn 1:', ph1);

  // 2) Tab to accept suggestion
  await page.click('#chat-input');
  await page.keyboard.press('Tab');
  const filled = await page.evaluate(() => (document.getElementById('chat-input') as HTMLInputElement).value);
  console.log('INPUT after Tab:', filled);
  await page.screenshot({ path: `${SHOT}/43-chat-tab-filled.png` });
  if (filled) {
    await page.click('#send-btn');
    await waitForIdle(page, 'suggestion turn');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOT}/44-chat-suggestion-reply.png` });
    console.log('AFTER SUGGESTION TURN:', JSON.stringify(await snapshotState(page), null, 1));
  }

  // 3) briefing
  await page.click('#briefing-btn');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/45-briefing-pending.png` });
  await waitForIdle(page, 'briefing', 150000);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT}/46-briefing-done.png` });
  const brief = await snapshotState(page);
  console.log('AFTER BRIEFING:', JSON.stringify(brief, null, 1));
  const has17k = await page.evaluate(() => /17,?000/.test(document.getElementById('messages')!.textContent || ''));
  console.log('BRIEFING mentions 17000:', has17k);

  // full-page screenshot of receipts pane
  await page.screenshot({ path: `${SHOT}/47-receipts.png` });
  // open first receipt
  await page.evaluate(() => (document.querySelector('.receipt') as HTMLElement)?.querySelector('summary')?.click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/48-receipt-open.png` });

  // 4) scroll test: can we reach the top of the chat pane?
  const scrollInfo = await page.evaluate(() => {
    const el = document.getElementById('messages')!;
    const before = el.scrollTop;
    el.scrollTop = 0;
    return { beforeScrollTop: before, afterSet: el.scrollTop, scrollH: el.scrollHeight, clientH: el.clientHeight };
  });
  await page.waitForTimeout(600);
  const scrollAfter = await page.evaluate(() => document.getElementById('messages')!.scrollTop);
  console.log('SCROLL:', JSON.stringify(scrollInfo), 'after 600ms:', scrollAfter);
  await page.screenshot({ path: `${SHOT}/49-chat-scrolled-top.png` });
  // also try wheel scroll like a user
  await page.mouse.move(500, 400);
  await page.evaluate(() => { const el = document.getElementById('messages')!; el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, -3000);
  await page.waitForTimeout(500);
  const wheelTop = await page.evaluate(() => document.getElementById('messages')!.scrollTop);
  console.log('SCROLL via wheel from bottom, -3000 ->', wheelTop);

  console.log('CONSOLE ERRORS:', JSON.stringify(errs));
  await browser.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
