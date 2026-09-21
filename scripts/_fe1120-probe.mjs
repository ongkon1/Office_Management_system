/**
 * FE-1120 browser probe — the minute's detail page. Requires `npm run dev`.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const USERS = {
  team_lead: 'imran.hossain@demo.local', // owns min-1001
  hr: 'rezaul.haque@demo.local', // owns min-1004, no government scope
  employee: 'nadia.rahman@demo.local',
  management: 'ayesha.siddika@demo.local',
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

async function run() {
  const browser = await chromium.launch();

  /* ------------------------------------------------ the page itself */
  {
    const { context, page, consoleErrors } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Vision Platform v2 sprint review")', { timeout: 20000 });

    check('no placeholder screen remains', !(await page.textContent('body')).includes('Phase 11'));

    const body = await page.textContent('body');
    for (const [label, value] of [
      ['client', 'Meghna Group'],
      ['project', 'Vision Platform v2'],
      ['creator', 'Imran Hossain'],
      ['AI choice', 'AI requested'],
      ['status', 'Processed'],
    ]) {
      check(`shows the ${label}`, body.includes(value), value);
    }

    // Content is rendered as markup, not printed as escaped text.
    const rendered = await page.$$eval('p', (nodes) =>
      nodes.some((n) => n.textContent.includes('Reviewed sprint 14 with Meghna Group')),
    );
    check('content renders as markup', rendered);
    check('no markup shown as text', !body.includes('<p>'));

    check('offers Edit to the creator', await page.isVisible('a:has-text("Edit")'));
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  /* ------------------------------------------------ never processed */
  {
    const { context, page } = await signIn(browser, USERS.hr);
    await page.goto(`${BASE}/meeting-minutes/min-1002`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Bootcamp curriculum sign-off")', { timeout: 20000 });
    const body = await page.textContent('body');
    check('AI requested reads No', body.includes('No'));
    check('processed time is an em dash', body.includes('—'));
    check('status reads Not processed', /Not processed/i.test(body));
    await context.close();
  }

  /* ------------------------------------------------ failed run */
  {
    const { context, page } = await signIn(browser, USERS.hr);
    await page.goto(`${BASE}/meeting-minutes/min-1004`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Westbridge portal go-live readiness")', { timeout: 20000 });
    const body = await page.textContent('body');
    check('shows the safe error', body.includes('The AI service took too long to respond'));
    check('and the reassurance', body.includes('Your meeting minute was saved'));
    check('no provider detail', !/provider_timeout|stacktrace|model/i.test(body));
    await context.close();
  }

  /* ------------------------------------------------ archived */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1006`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Legacy site handover")', { timeout: 20000 });
    const body = await page.textContent('body');
    check('archived minute stays readable', body.includes('Handed the legacy site over'));
    check('says what archiving kept', body.includes('kept exactly as it was'));
    check('offers no Edit', !(await page.isVisible('a:has-text("Edit")')));
    await context.close();
  }

  /* ------------------------------------------------ read-only roles */
  for (const role of ['employee', 'management']) {
    const { context, page } = await signIn(browser, USERS[role]);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Vision Platform v2 sprint review")', { timeout: 20000 });
    check(`${role} can read the minute`, true);
    check(`${role} is offered no Edit`, !(await page.isVisible('a:has-text("Edit")')));
    await context.close();
  }

  /* ------------------------------------------------ hidden equals missing */
  {
    const { context, page } = await signIn(browser, USERS.hr);
    await page.goto(`${BASE}/meeting-minutes/min-1003`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=That meeting minute could not be found', { timeout: 20000 });
    const hidden = await page.textContent('main');

    await page.goto(`${BASE}/meeting-minutes/min-nope`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=That meeting minute could not be found', { timeout: 20000 });
    const missing = await page.textContent('main');

    check('an out-of-scope minute is not found', hidden.includes('could not be found'));
    check('and reads exactly as a nonexistent one', hidden === missing);
    check('nothing about it leaks', !/Records digitisation|Ministry|Arif/.test(hidden));
    await context.close();
  }

  /* ------------------------------------------------ the links that reach it */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes`, { waitUntil: 'networkidle' });
    const view = page.getByRole('link', { name: /^View Vision Platform v2 sprint review$/ }).first();
    await view.waitFor({ state: 'visible', timeout: 20000 });
    await view.click();
    await page.waitForURL(/\/meeting-minutes\/min-1001$/, { timeout: 20000 });
    check('the list View link opens the detail page', true);

    // Saving a new minute now lands on its own page (`FE-1115` redirect).
    await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
    await page.waitForSelector('select[name="clientId"]', { timeout: 20000 });
    await page.fill('input[name="title"]', 'Probe minute for the detail page');
    await page.selectOption('select[name="clientId"]', 'cli-meghna');
    await page.waitForFunction(() => !document.querySelector('select[name="projectId"]').disabled, null, { timeout: 15000 });
    await page.selectOption('select[name="projectId"]', 'prj-vp2');
    await page.fill('textarea[name="content"]', 'Probe content.');
    await page.check('input[name="processWithAi"]');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });
    await page.waitForSelector('h1:has-text("Probe minute for the detail page")', { timeout: 20000 });
    const saved = await page.textContent('body');
    check('saving opens the new minute', true);
    check('and it opens showing Pending', /Pending/.test(saved), saved.slice(0, 80));
    await context.close();
  }

  /* ------------------------------------------------ phone width */
  {
    const { context, page } = await signIn(browser, USERS.team_lead, 375);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Vision Platform v2 sprint review")', { timeout: 20000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check('no horizontal scroll at 375 px', overflow <= 0, `overflow ${overflow}`);
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1120 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
