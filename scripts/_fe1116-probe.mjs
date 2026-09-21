/**
 * FE-1116 browser probe — Edit and Archive. Requires `npm run dev` on :3000.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const USERS = {
  team_lead: 'imran.hossain@demo.local', // owns min-1001
  hr: 'rezaul.haque@demo.local', // owns min-1002, no government scope
  admin: 'arif.mahmud@demo.local',
  employee: 'nadia.rahman@demo.local',
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

async function run() {
  const browser = await chromium.launch();

  /* ------------------------------------------- the list's Edit link lands here */
  {
    const { context, page, consoleErrors } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes`, { waitUntil: 'networkidle' });
    // The title renders in both the table and the mobile cards, so wait for
    // the link that is actually clicked rather than for the text.
    const editLink = page
      .getByRole('link', { name: /^Edit Vision Platform v2 sprint review$/ })
      .first();
    await editLink.waitFor({ state: 'visible', timeout: 20000 });
    await editLink.click();
    await page.waitForURL(/\/meeting-minutes\/min-\d+\/edit$/, { timeout: 20000 });
    await page.waitForSelector('input[name="title"]', { timeout: 20000 });

    check('list Edit link opens the real edit page', true);
    check(
      'loads the stored title',
      (await page.inputValue('input[name="title"]')) === 'Vision Platform v2 sprint review',
    );
    const content = await page.inputValue('textarea[name="content"]');
    check('content is editable text, not markup', content.includes('Reviewed sprint 14') && !content.includes('<p>'));
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  /* ------------------------------------------- saving an edit */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1001/edit`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[name="title"]', { timeout: 20000 });

    await page.fill('input[name="title"]', 'Sprint 14 review, corrected in a browser');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/meeting-minutes\/min-1001$/, { timeout: 20000 });
    check('saving returns to the minute', true);

    await page.getByRole('link', { name: 'Meeting Minutes', exact: true }).first().click();
    await page.waitForURL(/\/meeting-minutes$/, { timeout: 20000 });
    await page.waitForSelector('text=Sprint 14 review, corrected in a browser', { timeout: 20000 }).catch(() => {});
    check(
      'the edit is visible in the list',
      (await page.textContent('body')).includes('Sprint 14 review, corrected in a browser'),
    );
    await context.close();
  }

  /* ------------------------------------------- refusals */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    // Someone else's readable minute.
    await page.goto(`${BASE}/meeting-minutes/min-1002/edit`, { waitUntil: 'networkidle' });
    let body = await page.textContent('body');
    check('refuses another creator’s minute', body.includes('You cannot change this meeting minute'));
    check('and offers no Save', !body.includes('Save changes'));
    await context.close();
  }
  {
    const { context, page } = await signIn(browser, USERS.hr);
    // A government-project minute is not found for this viewer.
    await page.goto(`${BASE}/meeting-minutes/min-1003/edit`, { waitUntil: 'networkidle' });
    const hidden = await page.textContent('main');
    await page.goto(`${BASE}/meeting-minutes/min-nope/edit`, { waitUntil: 'networkidle' });
    const missing = await page.textContent('main');
    check('a hidden minute is not found', hidden.includes('could not be found'));
    check('and reads exactly as a nonexistent one', hidden === missing);
    check('no project name leaked', !hidden.includes('National Records'));
    await context.close();
  }
  {
    const { context, page } = await signIn(browser, USERS.employee);
    await page.goto(`${BASE}/meeting-minutes/min-1001/edit`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');
    // The route guard refuses read-only roles before the service is reached.
    check('an Employee is refused the edit route', /do not have access to this page/i.test(body));
    await context.close();
  }

  /* ------------------------------------------- archived minute */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1006/edit`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');
    check('an archived minute is refused', body.includes('This meeting minute is archived'));
    check('and says it is kept as it was', body.includes('kept exactly as it was'));
    await context.close();
  }

  /* ------------------------------------------- version conflict */
  {
    const { context, page } = await signIn(browser, USERS.admin);
    await page.goto(`${BASE}/meeting-minutes/min-1002/edit`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[name="title"]', { timeout: 20000 });
    await page.fill('input[name="title"]', 'My edit');

    // A second tab saves the same minute first.
    const second = await context.newPage();
    await second.goto(`${BASE}/meeting-minutes/min-1002/edit`, { waitUntil: 'networkidle' });
    await second.waitForSelector('input[name="title"]', { timeout: 20000 });
    await second.fill('input[name="title"]', 'Their edit');
    await second.click('button[type="submit"]');
    await second.waitForURL(/\/meeting-minutes\/min-1002$/, { timeout: 20000 }).catch(() => {});
    await second.close();

    // Each tab has its own module state in the mock, so the first tab's save
    // still succeeds here; the conflict path itself is covered by unit tests.
    await page.click('button[type="submit"]');
    await page.waitForFunction(
      () =>
        location.pathname === '/meeting-minutes/min-1002' ||
        document.body.textContent.includes('changed while you were editing it'),
      null,
      { timeout: 20000 },
    );
    check('a save either lands or conflicts, never silently does nothing', true);
    await context.close();
  }

  /* ------------------------------------------- archive flow and focus */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1001/edit`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[name="title"]', { timeout: 20000 });

    const body = await page.textContent('body');
    check('says what archiving keeps', body.includes('Archiving keeps this minute and everything linked to it'));
    check('and that nothing is deleted', body.includes('Nothing is deleted'));

    await page.click('button:has-text("Archive this minute")');
    await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
    const dialog = await page.textContent('[role="dialog"]');
    check('confirmation names what is kept', /processing history and any generated tasks/.test(dialog));

    // Cancelling returns focus to the trigger.
    await page.click('button:has-text("Keep it active")');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 20000 });
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    check('focus returns to the archive trigger', focused.includes('Archive this minute'), focused);

    // Confirming archives and returns to the list.
    await page.click('button:has-text("Archive this minute")');
    await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await page.click('[role="dialog"] button:has-text("Archive minute")');
    await page.waitForURL(/\/meeting-minutes$/, { timeout: 20000 });
    check('archiving returns to the list', true);

    const list = await page.textContent('body');
    check('archived minute leaves the default list', !list.includes('Vision Platform v2 sprint review'));

    // It stays findable with Include archived.
    await page.check('input[name="archived"]').catch(async () => {
      const toggle = page.getByLabel(/Include archived/i);
      await toggle.check();
    });
    await page.waitForSelector('text=Vision Platform v2 sprint review', { timeout: 20000 }).catch(() => {});
    const withArchived = await page.textContent('body');
    check('and is still findable with Include archived', withArchived.includes('Vision Platform v2 sprint review'));
    check('shown as Archived', withArchived.includes('Archived'));
    await context.close();
  }

  /* ------------------------------------------- phone width */
  {
    const { context, page } = await signIn(browser, USERS.team_lead, 375);
    await page.goto(`${BASE}/meeting-minutes/min-1001/edit`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[name="title"]', { timeout: 20000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check('no horizontal scroll at 375 px', overflow <= 0, `overflow ${overflow}`);

    await page.click('button:has-text("Archive this minute")');
    await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
    const confirmVisible = await page.isVisible('[role="dialog"] button:has-text("Archive minute")');
    check('confirmation action is reachable on a phone', confirmVisible);
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1116 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
