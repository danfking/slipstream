// Temporary: targeted sort test on the invoices table
import { chromium } from 'playwright';
const SHOT = 'C:/Users/Work/AppData/Local/Temp/claude-work/slipstream-ui';

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('http://localhost:3000/data.html');
  await page.waitForSelector('#collection-nav button');
  await page.click('#collection-nav >> text=Invoices');
  await page.waitForTimeout(200);
  const visTable = () => page.evaluate(() => {
    const sec = [...document.querySelectorAll('#collections > *')].find(s => (s as HTMLElement).offsetParent !== null)!;
    const tbl = sec.querySelector('table')!;
    const heads = [...tbl.querySelectorAll('th button')].map(b => ({ t: b.textContent, dir: (b as HTMLElement).dataset.dir ?? null }));
    const cols = heads.map(h => h.t);
    const ai = cols.indexOf('amount');
    const amounts = [...tbl.querySelectorAll('tbody tr')].map(tr => tr.children[ai]?.textContent);
    const overdue = [...tbl.querySelectorAll('tbody tr')].map((tr, i) => tr.className === 'row-overdue' ? i : -1).filter(i => i >= 0);
    return { heads, amounts: amounts.slice(0, 33), overdueIdx: overdue };
  });
  const before = await visTable();
  console.log('BEFORE heads:', JSON.stringify(before.heads));
  console.log('BEFORE amounts:', JSON.stringify(before.amounts));
  console.log('BEFORE overdue rows at idx:', JSON.stringify(before.overdueIdx));

  // click amount header button on the VISIBLE table
  const clickAmount = () => page.evaluate(() => {
    const sec = [...document.querySelectorAll('#collections > *')].find(s => (s as HTMLElement).offsetParent !== null)!;
    const btn = [...sec.querySelectorAll('th button')].find(b => b.textContent === 'amount') as HTMLElement;
    btn.click();
  });
  await clickAmount();
  await page.waitForTimeout(200);
  const asc = await visTable();
  console.log('ASC heads:', JSON.stringify(asc.heads));
  console.log('ASC amounts:', JSON.stringify(asc.amounts));
  console.log('ASC overdue idx:', JSON.stringify(asc.overdueIdx));
  await page.screenshot({ path: `${SHOT}/07-data-sort-asc.png` });
  await clickAmount();
  await page.waitForTimeout(200);
  const desc = await visTable();
  console.log('DESC heads:', JSON.stringify(desc.heads));
  console.log('DESC amounts:', JSON.stringify(desc.amounts));
  await page.screenshot({ path: `${SHOT}/08-data-sort-desc.png` });

  // sticky header within the wrap: scroll wrap, screenshot
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('#collections > *')].find(s => (s as HTMLElement).offsetParent !== null)!;
    const wrap = sec.querySelector('.data-table-wrap') as HTMLElement;
    wrap.scrollTop = 400;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOT}/09-data-sticky-scroll.png` });
  await browser.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
