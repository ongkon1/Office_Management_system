/**
 * FE-1115 browser probe — what Save communicates. Requires `npm run dev` on :3000.
 *
 * The queue-failure path is reached through the mock adapter's create-fault
 * localStorage key, since nothing in the seed data refuses a job.
 *
 * Updated for `FE-1120`: a save now opens the new minute's own page, as the
 * information architecture specifies, so what Save communicates is read from
 * the notice it raises and from the page it lands on.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const TEAM_LEAD = 'imran.hossain@demo.local';
const FAULT_KEY = 'oms.mock-fault.meeting-minutes-create';

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function openForm(browser, { fault = null, width = 1440 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', TEAM_LEAD);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 });

  if (fault) {
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [FAULT_KEY, fault],
    );
  } else {
    await page.evaluate((key) => window.localStorage.removeItem(key), FAULT_KEY);
  }

  await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('select[name="clientId"]', { timeout: 20000 });
  return { context, page, consoleErrors };
}

async function fillMinute(page, title, withAi) {
  await page.fill('input[name="title"]', title);
  await page.selectOption('select[name="clientId"]', 'cli-meghna');
  await page.waitForFunction(() => !document.querySelector('select[name="projectId"]').disabled, null, { timeout: 15000 });
  await page.selectOption('select[name="projectId"]', 'prj-vp2');
  await page.fill('textarea[name="content"]', 'Probe content.\n\nSecond paragraph.');
  if (withAi) await page.check('input[name="processWithAi"]');
}

async function run() {
  const browser = await chromium.launch();

  /* ----------------------------------------------- saved, no AI requested */
  {
    const { context, page, consoleErrors } = await openForm(browser);
    check(
      'the form says the minute is stored first',
      (await page.textContent('body')).includes('Saving stores the minute first'),
    );

    await fillMinute(page, 'Probe saved without AI', false);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });
    await page.waitForSelector('h1:has-text("Probe saved without AI")', { timeout: 20000 });

    const body = await page.textContent('body');
    check('the save is announced', body.includes('Meeting minute saved'));
    check('lands on the new minute', true);
    check('shown as not processed', /Not processed/i.test(body));
    check('no run claimed', !body.includes('Task generation is queued'));
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  /* ----------------------------------------------- saved, run queued */
  {
    const { context, page } = await openForm(browser);
    await fillMinute(page, 'Probe saved with AI', true);

    const started = Date.now();
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });
    await page.waitForSelector('h1:has-text("Probe saved with AI")', { timeout: 20000 });
    const elapsed = Date.now() - started;

    // Non-blocking: the answer is the length of a write, not of a provider
    // call. The mock's own latency is 140 ms, so anything near it is fine.
    check('save does not wait on AI', elapsed < 8000, `${elapsed}ms`);
    const body = await page.textContent('body');
    check('the notice says the minute is saved either way', body.includes('The minute is saved either way'));
    check('and the minute opens showing Pending', /Pending/.test(body));
    await context.close();
  }

  /* ----------------------------------------------- saved, run refused */
  {
    const { context, page } = await openForm(browser, { fault: 'queue' });
    await fillMinute(page, 'Probe queue refused', true);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });
    await page.waitForSelector('h1:has-text("Probe queue refused")', { timeout: 20000 });

    const body = await page.textContent('body');
    check('still reported as saved', body.includes('Meeting minute saved'));
    check('says the run could not be started', body.includes('Task generation could not be started'));
    check('and the minute itself reassures', body.includes('Your meeting minute was saved'));
    check('does not claim the run is pending', !/\bPending\b/.test(body));
    await context.close();
  }

  /* ----------------------------------------------- save itself failed */
  {
    const { context, page } = await openForm(browser, { fault: 'error' });
    await fillMinute(page, 'Probe save failed', false);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=The meeting minute could not be saved', { timeout: 20000 });

    const body = await page.textContent('body');
    check('no saved state on a failed save', !body.includes('Meeting minute saved'));
    check(
      'input is kept for another try',
      (await page.inputValue('input[name="title"]')) === 'Probe save failed',
    );

    // Clearing the fault and pressing Save again must produce one minute.
    await page.evaluate((key) => window.localStorage.removeItem(key), FAULT_KEY);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });

    await page.getByRole('link', { name: 'Meeting Minutes', exact: true }).first().click();
    await page.waitForURL(/\/meeting-minutes$/, { timeout: 20000 });
    await page.waitForSelector('text=Probe save failed', { timeout: 20000 }).catch(() => {});
    /*
     * Count records, not text: one row renders its title in the table, again
     * in the mobile card, and again inside each action's accessible name, so
     * counting occurrences of the string would report a single minute several
     * times. Distinct minute ids is what "one minute" means here.
     */
    const minuteIds = await page.$$eval('a[href^="/meeting-minutes/min-"]', (links) => [
      ...new Set(
        links
          .filter((link) => link.textContent.trim().includes('Probe save failed'))
          // `/min-2001` and `/min-2001/edit` are two links to one record.
          .map((link) => link.getAttribute('href').match(/min-\d+/)?.[0] ?? ''),
      ),
    ]);
    check('a retried save produced exactly one minute', minuteIds.length === 1, minuteIds.join('|'));
    await context.close();
  }

  /* ----------------------------------------------- phone width */
  {
    const { context, page } = await openForm(browser, { width: 375 });
    await fillMinute(page, 'Probe on a phone', true);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });
    await page.waitForSelector('h1:has-text("Probe on a phone")', { timeout: 20000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check('no horizontal scroll at 375 px', overflow <= 0, `overflow ${overflow}`);
    check('the saved minute opens on a phone', /Pending/.test(await page.textContent('body')));
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1115 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
