import { chromium } from 'playwright';
const OUT = 'C:/Users/Work/AppData/Local/Temp/claude-work/explore';
const BASE = 'http://localhost:3210';
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  await page.goto(`${BASE}/deck.html#/12`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const tableInfo = await page.$eval('#slide-12', (s) => ({
    tables: s.querySelectorAll('table').length,
    ths: s.querySelectorAll('th').length,
    rows: s.querySelectorAll('tr').length,
  }));
  console.log('SLIDE 12 table info:', JSON.stringify(tableInfo));
  await page.screenshot({ path: `${OUT}/deck-slide12-appendix.png` });
  const overflow = await page.$eval('#slide-12', (s) => {
    const t = s.querySelector('table') as HTMLElement | null;
    if (!t) return null;
    return { tableW: t.scrollWidth, slideW: (s as HTMLElement).clientWidth, overflowsSlide: t.scrollWidth > (s as HTMLElement).clientWidth };
  });
  console.log('SLIDE 12 table overflow:', JSON.stringify(overflow));
  const slideScroll = await page.$eval('#slide-12', (s) => ({ sh: (s as HTMLElement).scrollHeight, ch: (s as HTMLElement).clientHeight, oy: getComputedStyle(s as HTMLElement).overflowY }));
  console.log('SLIDE 12 vertical:', JSON.stringify(slideScroll), 'clipped?', slideScroll.sh > slideScroll.ch);
  const bodyOverflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log('SLIDE 12 body horiz overflow?', bodyOverflow.sw > bodyOverflow.cw, JSON.stringify(bodyOverflow));

  // Architecture diagram slide = 06b = slide 7
  await page.goto(`${BASE}/deck.html#/7`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const arch = await page.$eval('#slide-7', (s) => ({ imgs: s.querySelectorAll('img').length, svgs: s.querySelectorAll('svg').length, text: (s as HTMLElement).innerText.slice(0, 60) }));
  console.log('SLIDE 7 (arch):', JSON.stringify(arch));
  const imgStatus = await page.$$eval('#slide-7 img', (imgs) => imgs.map((i) => ({ src: (i as HTMLImageElement).src, natW: (i as HTMLImageElement).naturalWidth, complete: (i as HTMLImageElement).complete })));
  console.log('SLIDE 7 imgs:', JSON.stringify(imgStatus));
  const archScroll = await page.$eval('#slide-7', (s) => ({ sh: (s as HTMLElement).scrollHeight, ch: (s as HTMLElement).clientHeight }));
  console.log('SLIDE 7 vertical clipped?', archScroll.sh > archScroll.ch, JSON.stringify(archScroll));
  await page.screenshot({ path: `${OUT}/deck-slide7-arch.png` });

  // Sticky deep scroll
  await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
  await page.click('nav#collection-nav button:has-text("Slips")');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(200);
  const thRect = await page.$eval('#slips thead th', (th) => { const r = (th as HTMLElement).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  console.log('SLIPS th rect after scroll 1500:', JSON.stringify(thRect));
  await page.screenshot({ path: `${OUT}/data-06-sticky-deep.png` });

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
