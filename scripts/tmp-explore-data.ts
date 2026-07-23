import { chromium } from 'playwright';

const OUT = 'C:/Users/Work/AppData/Local/Temp/claude-work/explore';
const BASE = 'http://localhost:3210';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));

  await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('nav#collection-nav button');
  await page.screenshot({ path: `${OUT}/data-01-load.png` });

  // Pills present
  const pills = await page.$$eval('nav#collection-nav button', (bs) =>
    bs.map((b) => ({ text: b.textContent, pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('active') })),
  );
  console.log('PILLS:', JSON.stringify(pills, null, 2));

  // Click Invoices pill -> only invoices visible
  const invoicePill = (await page.$$('nav#collection-nav button')).find(async () => true);
  await page.click('nav#collection-nav button:has-text("Invoices")');
  await page.waitForTimeout(200);
  const visibleSections = await page.$$eval('section[id]', (ss) =>
    ss.filter((s) => !(s as HTMLElement).hidden).map((s) => s.id),
  );
  console.log('AFTER Invoices pill, visible sections:', visibleSections);
  await page.screenshot({ path: `${OUT}/data-02-invoices-filter.png` });

  // Overdue highlight present in invoices
  const overdueCount = await page.$$eval('#invoices tr.row-overdue', (rs) => rs.length);
  console.log('overdue rows in invoices:', overdueCount);

  // Sort the amount column: click header button for "amount" and read values
  // Find a numeric column header in invoices
  const invoiceHeaders = await page.$$eval('#invoices thead button', (bs) => bs.map((b) => b.textContent));
  console.log('INVOICE HEADERS:', invoiceHeaders);

  // Click "amount" header once (asc), capture column values
  async function amountValues(): Promise<string[]> {
    return page.$$eval('#invoices tbody tr', (rows) => {
      // find amount column index from header
      const headerBtns = Array.from(document.querySelectorAll('#invoices thead button')).map((b) => b.textContent);
      const idx = headerBtns.findIndex((t) => t === 'amount');
      if (idx < 0) return [];
      return rows.map((r) => (r.children[idx] as HTMLElement).textContent || '');
    });
  }
  const hasAmount = invoiceHeaders.includes('amount');
  if (hasAmount) {
    await page.click('#invoices thead button:has-text("amount")');
    await page.waitForTimeout(150);
    const asc = await amountValues();
    console.log('AMOUNT asc:', asc.slice(0, 20));
    await page.click('#invoices thead button:has-text("amount")');
    await page.waitForTimeout(150);
    const desc = await amountValues();
    console.log('AMOUNT desc:', desc.slice(0, 20));
    // numeric check
    const nums = asc.map((s) => Number(String(s).replace(/[^0-9.-]/g, ''))).filter((n) => !Number.isNaN(n));
    const sortedNumerically = nums.every((n, i) => i === 0 || nums[i - 1] <= n);
    console.log('AMOUNT asc numerically sorted?', sortedNumerically, nums.slice(0, 20));
    await page.screenshot({ path: `${OUT}/data-03-amount-sorted-desc.png` });
  }

  // Sticky header test: scroll the invoices section and see if thead sticks
  await page.click('nav#collection-nav button:has-text("Work order lines")').catch(() => {});
  await page.waitForTimeout(150);
  // Actually test sticky on a long table: reset to All, scroll page
  await page.click('nav#collection-nav button:has-text("All")');
  await page.waitForTimeout(150);
  const theadPosition = await page.$$eval('table.data-table thead', (ts) =>
    ts.slice(0, 1).map((t) => getComputedStyle(t).position),
  );
  const thPosition = await page.$$eval('table.data-table thead th', (ts) =>
    ts.slice(0, 1).map((t) => getComputedStyle(t).position),
  );
  console.log('thead position:', theadPosition, 'th position:', thPosition);

  // Source chips
  const chips = await page.$$eval('.src-chip', (cs) => cs.slice(0, 8).map((c) => ({ text: c.textContent, partner: c.classList.contains('partner') })));
  console.log('SOURCE CHIPS sample:', JSON.stringify(chips));

  // Back link round-trip
  const backHref = await page.getAttribute('a.deck-link', 'href');
  console.log('data back link href:', backHref);

  // 1024x768 responsive
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/data-04-1024x768.png` });

  // Check horizontal body scroll (page should not scroll horizontally)
  const bodyScroll = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  console.log('BODY at 1024:', JSON.stringify(bodyScroll), 'overflowX?', bodyScroll.scrollW > bodyScroll.clientW);

  console.log('CONSOLE ERRORS/WARNINGS:', JSON.stringify(errs, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
