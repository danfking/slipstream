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

  // --- STICKY HEADER on data page ---
  await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
  await page.click('nav#collection-nav button:has-text("Slips")');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/data-05-sticky-scrolled.png` });
  // Is the header visually at/near the top of the viewport after scroll?
  const thTop = await page.$$eval('#slips thead th', (ths) => {
    const r = (ths[0] as HTMLElement).getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  console.log('SLIPS th rect after scroll 600:', JSON.stringify(thTop));

  // --- DECK ---
  const deckErrs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') deckErrs.push(m.text()); });
  await page.goto(`${BASE}/deck.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#slides section.slide');
  const total = await page.$$eval('#slides section.slide', (s) => s.length);
  const counter = await page.textContent('#slide-counter');
  console.log('DECK total slides:', total, 'counter:', counter);
  await page.screenshot({ path: `${OUT}/deck-01-slide1.png` });

  // progress bar width at slide 1
  const prog1 = await page.$eval('#deck-progress', (e) => (e as HTMLElement).style.width);
  console.log('progress at slide 1:', prog1);

  // Arrow key nav
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  console.log('after ArrowRight counter:', await page.textContent('#slide-counter'), 'hash:', await page.evaluate(() => location.hash));
  // Space advances
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  console.log('after Space counter:', await page.textContent('#slide-counter'));
  // ArrowLeft back
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  console.log('after ArrowLeft counter:', await page.textContent('#slide-counter'));

  // prev disabled at slide 1
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  const prevDisabled = await page.getAttribute('#nav-prev', 'disabled');
  const nextDisabledAt1 = await page.getAttribute('#nav-next', 'disabled');
  console.log('at slide1: prev disabled?', prevDisabled !== null, 'next disabled?', nextDisabledAt1 !== null);

  // End -> last slide, next disabled
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  const nextDisabled = await page.getAttribute('#nav-next', 'disabled');
  console.log('at last slide counter:', await page.textContent('#slide-counter'), 'next disabled?', nextDisabled !== null);
  const progEnd = await page.$eval('#deck-progress', (e) => (e as HTMLElement).style.width);
  console.log('progress at last slide:', progEnd);

  // Edge-click nav-next / nav-prev buttons
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.click('#nav-next');
  await page.waitForTimeout(100);
  console.log('after click nav-next counter:', await page.textContent('#slide-counter'));

  // Deep link #/5
  await page.goto(`${BASE}/deck.html#/5`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  console.log('deep link #/5 counter:', await page.textContent('#slide-counter'));
  await page.screenshot({ path: `${OUT}/deck-02-deeplink5.png` });

  // Check every slide for raw markdown artifacts (** or leading # or literal asterisks)
  const slideText = await page.$$eval('#slides section.slide', (secs) =>
    secs.map((s, i) => ({ i: i + 1, text: (s as HTMLElement).innerText })),
  );
  for (const s of slideText) {
    const artifacts: string[] = [];
    if (s.text.includes('**')) artifacts.push('literal **');
    if (/(^|\n)#{1,6}\s/.test(s.text)) artifacts.push('raw heading #');
    if (/\|\s*---/.test(s.text)) artifacts.push('raw table pipe/dashes');
    if (artifacts.length) console.log(`SLIDE ${s.i} artifacts:`, artifacts.join(', '), '::', s.text.slice(0, 120).replace(/\n/g, ' '));
  }

  // Find the architecture diagram slide, screenshot it
  for (let i = 1; i <= total; i++) {
    await page.goto(`${BASE}/deck.html#/${i}`, { waitUntil: 'load' });
    await page.waitForTimeout(120);
    const txt = (await page.textContent(`#slide-${i}`)) || '';
    if (/architect|diagram|receipt|tool|flow/i.test(txt)) {
      await page.screenshot({ path: `${OUT}/deck-slide-${i}.png` });
    }
  }

  // Print stylesheet
  await page.goto(`${BASE}/deck.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/deck-03-print.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  console.log('DECK console errors:', JSON.stringify(deckErrs));
  console.log('ALL console errs:', JSON.stringify(errs, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
