// Temporary exploratory UI test: static pages (status, data, deck, index shell)
import { chromium, Page, ConsoleMessage } from 'playwright';

const SHOT = 'C:/Users/Work/AppData/Local/Temp/claude-work/slipstream-ui';
const BASE = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log(...a);

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrs: Record<string, string[]> = {};
  let currentPage = 'init';
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      (consoleErrs[currentPage] ??= []).push(`[${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => {
    (consoleErrs[currentPage] ??= []).push(`[pageerror] ${e.message}`);
  });

  // ---------- STATUS PAGE ----------
  currentPage = 'status';
  await page.goto(`${BASE}/status.html`);
  await page.waitForSelector('.status-row', { timeout: 15000 }).catch(() => log('STATUS: no .status-row appeared'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/01-status.png`, fullPage: true });
  const statusInfo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.status-row')];
    return {
      overall: document.getElementById('overall-label')?.textContent,
      overallDot: document.getElementById('overall-dot')?.className,
      count: rows.length,
      rows: rows.map(r => ({
        name: r.querySelector('.status-name')?.textContent,
        state: r.querySelector('.status-state')?.textContent,
        stateClass: r.querySelector('.status-state')?.className,
        detail: r.querySelector('.status-detail')?.textContent,
        box: (r as HTMLElement).getBoundingClientRect().toJSON(),
      })),
      containerDisplay: getComputedStyle(document.getElementById('status-services')!).flexDirection + '/' + getComputedStyle(document.getElementById('status-services')!).display,
      scrollW: document.documentElement.scrollWidth,
    };
  });
  log('STATUS:', JSON.stringify(statusInfo, null, 1));

  // ---------- DATA PAGE ----------
  currentPage = 'data';
  await page.goto(`${BASE}/data.html`);
  await page.waitForSelector('.collection-nav button, .collection-nav .pill, #collection-nav *', { timeout: 15000 }).catch(() => log('DATA: nav never populated'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/02-data-all.png` });
  const dataInfo = await page.evaluate(() => {
    const pills = [...document.querySelectorAll('#collection-nav *')].filter(e => e.children.length === 0 || e.tagName === 'BUTTON');
    const sections = [...document.querySelectorAll('#collections > *')];
    return {
      recordMeta: document.getElementById('record-meta')?.textContent,
      pills: pills.map(p => ({ tag: p.tagName, text: p.textContent, cls: p.className })),
      sectionCount: sections.length,
      sections: sections.map(s => ({ cls: s.className, heading: s.querySelector('h2,h3')?.textContent, visible: (s as HTMLElement).offsetParent !== null, rows: s.querySelectorAll('tbody tr').length })),
      overdueRows: document.querySelectorAll('.row-overdue').length,
      srcChips: document.querySelectorAll('.src-chip').length,
      partnerChips: document.querySelectorAll('.src-chip.partner').length,
      scrollW: document.documentElement.scrollWidth,
    };
  });
  log('DATA-ALL:', JSON.stringify(dataInfo, null, 1));

  // click each pill, verify exactly one section visible + active highlight
  const pillTexts: string[] = await page.evaluate(() =>
    [...document.querySelectorAll('#collection-nav button, #collection-nav .pill')].map(p => p.textContent || ''));
  log('PILLS:', pillTexts);
  for (const t of pillTexts) {
    await page.click(`#collection-nav >> text="${t}"`);
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => {
      const pills = [...document.querySelectorAll('#collection-nav button, #collection-nav .pill')];
      const sections = [...document.querySelectorAll('#collections > *')];
      const visible = sections.filter(s => (s as HTMLElement).offsetParent !== null);
      return {
        active: pills.filter(p => p.classList.contains('active')).map(p => p.textContent),
        visibleSections: visible.map(s => s.querySelector('h2,h3')?.textContent ?? s.className),
      };
    });
    log(`PILL "${t}" ->`, JSON.stringify(st));
  }
  // screenshot one filtered view (invoices, for overdue highlight)
  const invPill = pillTexts.find(t => /invoice/i.test(t));
  if (invPill) {
    await page.click(`#collection-nav >> text="${invPill}"`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT}/03-data-invoices.png` });
  }
  // reservations for source chips
  const resPill = pillTexts.find(t => /reserv/i.test(t));
  if (resPill) {
    await page.click(`#collection-nav >> text="${resPill}"`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT}/04-data-reservations.png` });
  }
  // back to All
  const allPill = pillTexts.find(t => /^all/i.test(t.trim()));
  if (allPill) {
    await page.click(`#collection-nav >> text="${allPill}"`);
    await page.waitForTimeout(150);
    const restored = await page.evaluate(() => [...document.querySelectorAll('#collections > *')].filter(s => (s as HTMLElement).offsetParent !== null).length);
    log('ALL restores sections visible:', restored);
  }

  // sorting: pick invoices table, click a header (amount-ish), capture col values
  if (invPill) {
    await page.click(`#collection-nav >> text="${invPill}"`);
    await page.waitForTimeout(150);
    const headers: string[] = await page.evaluate(() => [...document.querySelectorAll('#collections table th')].map(h => h.textContent || ''));
    log('INVOICE HEADERS:', headers);
    const target = headers.find(h => /amount|total/i.test(h)) ?? headers[0];
    const colIdx = headers.indexOf(target);
    const grab = () => page.evaluate((i) =>
      [...document.querySelectorAll('#collections table tbody tr')].map(tr => tr.children[i]?.textContent ?? ''), colIdx);
    const before = await grab();
    await page.click(`#collections table th >> text="${target}"`);
    await page.waitForTimeout(150);
    const asc = await grab();
    const headerAfter1 = await page.evaluate(() => [...document.querySelectorAll('#collections table th')].map(h => ({ t: h.textContent, cls: h.className, aria: h.getAttribute('aria-sort') })));
    await page.click(`#collections table th >> text=/${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim().split(/\s/)[0]}/`);
    await page.waitForTimeout(150);
    const desc = await grab();
    log('SORT target:', target, '\n before:', JSON.stringify(before), '\n click1:', JSON.stringify(asc), '\n click2:', JSON.stringify(desc));
    log('SORT header state after click1:', JSON.stringify(headerAfter1));
    await page.screenshot({ path: `${SHOT}/05-data-sorted.png` });
  }

  // sticky headers on long tables: check thead computed position + scroll behaviour
  const sticky = await page.evaluate(() => {
    const th = document.querySelector('#collections table th');
    const wrap = document.querySelector('.data-table-wrap') as HTMLElement | null;
    return {
      thPosition: th ? getComputedStyle(th).position : null,
      thTop: th ? getComputedStyle(th).top : null,
      wrapOverflow: wrap ? getComputedStyle(wrap).overflowY + '/' + getComputedStyle(wrap).overflowX : null,
      wrapMaxHeight: wrap ? getComputedStyle(wrap).maxHeight : null,
    };
  });
  log('STICKY:', JSON.stringify(sticky));
  // scroll page down mid-table and screenshot to see if header stays
  if (allPill) { await page.click(`#collection-nav >> text="${allPill}"`); await page.waitForTimeout(150); }
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOT}/06-data-scrolled.png` });

  // ---------- DECK ----------
  currentPage = 'deck';
  await page.goto(`${BASE}/deck.html`);
  await page.waitForSelector('#slides .slide, #slides > *', { timeout: 15000 }).catch(() => log('DECK: slides never rendered'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT}/10-deck-slide1.png` });
  const deckInfo = await page.evaluate(() => ({
    counter: document.getElementById('slide-counter')?.textContent,
    slideCount: document.querySelectorAll('#slides > *').length,
    progressWidth: (document.getElementById('deck-progress') as HTMLElement)?.getBoundingClientRect().width,
    progressStyle: (document.getElementById('deck-progress') as HTMLElement)?.getAttribute('style'),
    navPrevVisible: (document.getElementById('nav-prev') as HTMLElement)?.offsetParent !== null,
    navNextVisible: (document.getElementById('nav-next') as HTMLElement)?.offsetParent !== null,
    title: document.getElementById('deck-title')?.textContent,
    scrollW: document.documentElement.scrollWidth,
  }));
  log('DECK initial:', JSON.stringify(deckInfo));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const after1 = await page.evaluate(() => ({ counter: document.getElementById('slide-counter')?.textContent, progress: (document.getElementById('deck-progress') as HTMLElement)?.getBoundingClientRect().width }));
  log('DECK after ArrowRight:', JSON.stringify(after1));
  await page.screenshot({ path: `${SHOT}/11-deck-slide2.png` });
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const after2 = await page.evaluate(() => document.getElementById('slide-counter')?.textContent);
  log('DECK after Space:', after2);
  // walk through all slides, log per-slide overflow/emptiness, screenshot each
  const total = parseInt((after2 ?? '3 / 12').split('/')[1]) || 12;
  for (let n = 3; n <= total; n++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/12-deck-last.png` });
  const lastInfo = await page.evaluate(() => document.getElementById('slide-counter')?.textContent);
  log('DECK at end:', lastInfo);
  // does ArrowRight past the end break?
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  log('DECK past end counter:', await page.evaluate(() => document.getElementById('slide-counter')?.textContent));
  // go back through: find architecture diagram slide (near end): step back a few and screenshot each of last 4
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => document.getElementById('slide-counter')?.textContent);
    await page.screenshot({ path: `${SHOT}/13-deck-back-${i}-${(c ?? '').replace(/[^0-9]/g, '-')}.png` });
  }
  // edge nav click
  await page.click('#nav-next');
  await page.waitForTimeout(300);
  log('DECK after nav-next click:', await page.evaluate(() => document.getElementById('slide-counter')?.textContent));

  // ---------- INDEX SHELL (no chat yet) ----------
  currentPage = 'index';
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT}/20-index-cold.png` });
  const indexInfo = await page.evaluate(() => ({
    date: document.getElementById('meta-date')?.textContent,
    model: document.getElementById('meta-model')?.textContent,
    dotClass: document.getElementById('header-status-dot')?.className,
    gateOpen: (document.getElementById('gate') as HTMLDialogElement)?.open,
    emptyState: !!document.getElementById('empty-state'),
    placeholder: (document.getElementById('chat-input') as HTMLInputElement)?.placeholder,
    links: [...document.querySelectorAll('header a')].map(a => ({ text: a.textContent?.trim(), href: (a as HTMLAnchorElement).getAttribute('href') })),
    scrollW: document.documentElement.scrollWidth,
  }));
  log('INDEX:', JSON.stringify(indexInfo, null, 1));

  // ---------- RESPONSIVE 1024 ----------
  await page.setViewportSize({ width: 1024, height: 800 });
  for (const [name, url] of [['index', '/'], ['data', '/data.html'], ['status', '/status.html'], ['deck', '/deck.html']] as const) {
    currentPage = `1024-${name}`;
    await page.goto(`${BASE}${url}`);
    await page.waitForTimeout(900);
    const sw = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
    log(`1024 ${name}:`, JSON.stringify(sw));
    await page.screenshot({ path: `${SHOT}/30-1024-${name}.png` });
  }

  log('CONSOLE ERRORS:', JSON.stringify(consoleErrs, null, 1));
  await browser.close();
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
