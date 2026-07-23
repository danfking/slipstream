// Temporary: deck slide 7 (architecture diagram) + in-slide scrolling
import { chromium } from 'playwright';
const SHOT = 'C:/Users/Work/AppData/Local/Temp/claude-work/slipstream-ui';

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('http://localhost:3000/deck.html');
  await page.waitForSelector('#slides > *');
  await page.waitForTimeout(500);

  // can slide 1 scroll? (content taller than viewport)
  const s1 = await page.evaluate(() => {
    const slide = [...document.querySelectorAll('.slide')].find(s => (s as HTMLElement).offsetParent !== null) as HTMLElement
      ?? document.querySelector('#slides > *') as HTMLElement;
    return { scrollH: slide.scrollHeight, clientH: slide.clientHeight, overflowY: getComputedStyle(slide).overflowY };
  });
  console.log('SLIDE1 scroll:', JSON.stringify(s1));
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  const s1after = await page.evaluate(() => {
    const slide = [...document.querySelectorAll('.slide')].find(s => (s as HTMLElement).offsetParent !== null) as HTMLElement;
    return { scrollTop: slide?.scrollTop, counter: document.getElementById('slide-counter')?.textContent };
  });
  console.log('SLIDE1 after wheel:', JSON.stringify(s1after));
  await page.screenshot({ path: `${SHOT}/14-deck-slide1-scrolled.png` });

  // go to slide 7
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200); }
  await page.waitForTimeout(500);
  console.log('counter now:', await page.evaluate(() => document.getElementById('slide-counter')?.textContent));
  await page.screenshot({ path: `${SHOT}/15-deck-slide7.png` });
  const imgInfo = await page.evaluate(() => {
    const slide = [...document.querySelectorAll('.slide')].find(s => (s as HTMLElement).offsetParent !== null) as HTMLElement;
    const imgs = [...(slide?.querySelectorAll('img') ?? [])].map(i => ({
      src: (i as HTMLImageElement).src.slice(0, 80), w: (i as HTMLImageElement).clientWidth, h: (i as HTMLImageElement).clientHeight,
      natW: (i as HTMLImageElement).naturalWidth, natH: (i as HTMLImageElement).naturalHeight,
      complete: (i as HTMLImageElement).complete,
    }));
    return { imgs, svgs: slide?.querySelectorAll('svg').length, heading: slide?.querySelector('h1,h2')?.textContent };
  });
  console.log('SLIDE7:', JSON.stringify(imgInfo));
  // scroll down inside slide 7 to see full diagram if tall
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT}/16-deck-slide7-scrolled.png` });

  // also check slides 5 and 6 quickly for render issues
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT}/17-deck-slide6.png` });
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT}/18-deck-slide5.png` });
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT}/19-deck-slide4.png` });
  // deck at 1024 on the diagram slide
  await page.setViewportSize({ width: 1024, height: 768 });
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200); }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/31-1024-deck-slide7.png` });
  await browser.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
