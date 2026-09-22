/**
 * FE-1122 browser probe — the AI summary and decisions, apart from the minute.
 * Run against this project's dev server: `PROBE_BASE=http://localhost:3100`.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const USERS = {
  team_lead: 'imran.hossain@demo.local', // owns min-1001
  hr: 'rezaul.haque@demo.local',
  employee: 'nadia.rahman@demo.local',
  admin: 'arif.mahmud@demo.local',
};

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(browser, email, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 });
  if (new URL(page.url()).pathname.startsWith('/two-factor')) {
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !new URL(u).pathname.startsWith('/two-factor'), { timeout: 20000 });
  }
  return { context, page, consoleErrors };
}

const SECTION = 'section[aria-labelledby]:has(h2:has-text("AI summary and decisions"))';

async function run() {
  const browser = await chromium.launch();

  /* ------------------------------------------------ the processed minute */
  {
    const { context, page, consoleErrors } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector(SECTION, { timeout: 20000 });

    const section = page.locator(SECTION);
    const text = await section.textContent();
    check('section is labelled AI-generated in words', text.includes('AI-generated'));
    check('says it is not part of the minute', text.includes('It is not part of the minute'));
    check('shows the summary', text.includes('accepted the search redesign delivered in sprint 14'));

    const decisions = await section.locator('ol > li').allTextContents();
    check('decisions are an ordered list', decisions.length === 2, decisions.join(' | '));
    check(
      'decisions in position order',
      decisions[0]?.startsWith('Accept the search redesign') && decisions[1]?.startsWith('Add export to PDF'),
    );

    // Separation: the minute's text is not in the AI section, and vice versa.
    check('minute text is outside the AI section', !text.includes('Reviewed sprint 14 with Meghna Group'));
    const order = await page.evaluate(() => {
      const minute = [...document.querySelectorAll('p')].find((p) =>
        p.textContent.includes('Reviewed sprint 14 with Meghna Group'),
      );
      const section = [...document.querySelectorAll('section[aria-labelledby]')].find((s) =>
        s.textContent.includes('AI summary and decisions'),
      );
      return Boolean(minute && section && minute.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check('the minute comes first, the reading after', order);

    // It is a real landmark with an accessible name.
    const named = await page.getByRole('region', { name: 'AI summary and decisions' }).count();
    check('exposed as a named region', named === 1);

    // Headings stay in order: h1 page, h2 section, h3 parts.
    const headings = await section.locator('h2, h3').evaluateAll((els) => els.map((e) => e.tagName));
    check('heading outline is h2 then h3s', headings.join(',') === 'H2,H3,H3', headings.join(','));
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  /* ------------------------------------------------ same reading for a reader */
  {
    const { context, page } = await signIn(browser, USERS.employee);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector(SECTION, { timeout: 20000 });
    const text = await page.locator(SECTION).textContent();
    check('a read-only viewer sees the same interpretation', text.includes('accepted the search redesign'));
    await context.close();
  }

  /* ------------------------------------------------ why there is none */
  {
    const { context, page } = await signIn(browser, USERS.admin);
    for (const [id, expected, label] of [
      ['min-1002', 'AI was not asked to read this minute', 'not processed'],
      ['min-1003', 'will appear here once task generation finishes', 'pending'],
      ['min-1005', 'will appear here once task generation finishes', 'processing'],
      ['min-1004', 'Task generation did not finish', 'failed'],
    ]) {
      await page.goto(`${BASE}/meeting-minutes/${id}`, { waitUntil: 'networkidle' });
      await page.waitForSelector(SECTION, { timeout: 20000 });
      const text = await page.locator(SECTION).textContent();
      check(`${label}: says why there is none`, text.includes(expected), text.slice(0, 120));
      check(`${label}: no decisions list`, (await page.locator(`${SECTION} ol`).count()) === 0);
    }
    await context.close();
  }

  /* ------------------------------------------------ edited since the run */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1001/edit`, { waitUntil: 'networkidle' });
    await page.waitForSelector('textarea[name="content"]', { timeout: 20000 });
    const current = await page.inputValue('textarea[name="content"]');
    await page.fill('textarea[name="content"]', `${current}\n\nAdded later: the October date is provisional.`);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/meeting-minutes\/min-1001$/, { timeout: 20000 });
    await page.waitForSelector(SECTION, { timeout: 20000 });

    const text = await page.locator(SECTION).textContent();
    check('warns that the minute was edited since', text.includes('has been edited since this was generated'));
    check('keeps the interpretation rather than dropping it', text.includes('accepted the search redesign'));
    const warnFirst = text.indexOf('has been edited since') < text.indexOf('accepted the search redesign');
    check('the warning is read before the summary', warnFirst);
    await context.close();
  }

  /* ------------------------------------------------ phone width */
  {
    const { context, page } = await signIn(browser, USERS.team_lead, 375);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector(SECTION, { timeout: 20000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check('no horizontal scroll at 375 px', overflow <= 0, `overflow ${overflow}`);
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1122 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
