/**
 * Phase B2 browser probe — `/admin/departments` served by MySQL.
 *
 * Phase F2's probe exercised the same screen against the mock. This one runs it
 * against the real path: the Next.js route handler, the session cookie, the
 * policy context, the MySQL application service and the audit writer. It proves
 * `OH-BE-0201` and `OH-BE-0216` end to end — the screen was not changed, and
 * the backend answers the contract it was written against.
 *
 * Requires a dev server with a migrated and seeded database. `PROBE_BASE`
 * selects it (default :3000).
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.PROBE_PASSWORD ?? 'Demo1234!';
/* The seeded database's own accounts, not the frontend demo fixtures. */
const ADMIN = process.env.PROBE_ADMIN ?? 'admin@powerin.ai';
const HR = process.env.PROBE_HR ?? 'hr@powerin.ai';

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

async function signIn(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  /*
   * A refused save answers with HTTP 400 by design (`resultResponse` maps a
   * validation failure to 400), and Chrome logs every non-2xx fetch as a
   * console error. Counting those would be asserting that the probe never
   * exercises a refusal, so only genuine page failures are collected:
   * uncaught exceptions, and console errors that are not a reported response
   * status the product means to return.
   */
  const consoleErrors = [];
  const expectedStatus = /Failed to load resource: the server responded with a status of (400|401|403|404|409)/;
  page.on('console', (message) => {
    if (message.type() === 'error' && !expectedStatus.test(message.text())) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`uncaught: ${error.message}`));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const signedIn = !new URL(page.url()).pathname.startsWith('/login');
  return { context, page, consoleErrors, signedIn };
}

const browser = await chromium.launch();

/* == 1. The catalogue, from MySQL ========================================== */
const admin = await signIn(browser, ADMIN);
check('a Super Administrator can sign in against the database', admin.signedIn, admin.page.url());
if (!admin.signedIn) {
  console.log('\nCannot continue without a session. Is the database migrated and seeded?');
  await browser.close();
  process.exit(1);
}

{
  const { page } = admin;
  await page.goto(`${BASE}/admin/departments`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Departments', level: 1 }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const body = await page.locator('main').innerText();

  check(
    'the catalogue renders server data rather than an unavailable state',
    !/not available from the server yet/i.test(body),
    body.slice(0, 160).replace(/\n/g, ' '),
  );

  for (const division of ['PowerInAI', 'PowerInAI Training', 'Government Projects', 'Computer Jagat', 'WesternCF']) {
    check(
      `${division} is grouped from the database`,
      (await page.getByRole('heading', { name: division, level: 2, exact: true }).count()) === 1,
    );
  }

  /* The seeded hierarchy: a duplicate name, an inactive department, a current
     appointment and a scheduled one. */
  const pia = page.getByRole('table', { name: 'Departments in PowerInAI', exact: true });
  const wcf = page.getByRole('table', { name: 'Departments in WesternCF', exact: true });
  check(
    'the same department name appears under two divisions',
    (await pia.locator('tbody tr', { hasText: 'Sales' }).count()) === 1 &&
      (await wcf.locator('tbody tr', { hasText: 'Sales' }).count()) === 1,
  );
  const technical = await pia.locator('tbody tr', { hasText: 'Technical' }).first().innerText();
  check(
    'a row states its lead and the appointment effective date',
    /Tanvir Hasan/.test(technical) && /Effective from 1 Jan 2026/.test(technical),
    technical.replace(/\n/g, ' '),
  );
  const legacy = await pia.locator('tbody tr', { hasText: 'Legacy Desk' }).first().innerText();
  check('an inactive department is labelled inactive', /Inactive/.test(legacy));
  const wcfSales = await wcf.locator('tbody tr', { hasText: 'Sales' }).first().innerText();
  check(
    'a scheduled appointment is named without replacing the current lead',
    /Scheduled: Nadia Islam from 1 Dec 2026/.test(wcfSales),
    wcfSales.replace(/\n/g, ' '),
  );

  /* Leadership history from the database, including the closed period. */
  const row = pia.locator('tbody tr', { hasText: 'Technical' }).first();
  await row.getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: /View placements and leadership/ }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Leadership history' }).waitFor({ timeout: 15000 });
  const drawer = await page.getByRole('dialog').innerText();
  check('the panel lists the appointment in force', /Current/.test(drawer));
  check('the panel keeps the closed period', /1 Jan 2025 – 31 Dec 2025/.test(drawer), drawer.slice(0, 200).replace(/\n/g, ' '));
  check('the panel lists placements from the database', /EMP-001|TL-001/.test(drawer));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

/* == 2. A mutation all the way through ==================================== */
const CREATED = `Probe ${Date.now().toString().slice(-6)}`;
{
  const { page } = admin;
  await page.getByRole('button', { name: 'New department' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByLabel(/^Division/).selectOption({ label: 'Computer Jagat' });
  await dialog.getByLabel(/^Name/).fill(CREATED);
  await dialog.getByLabel(/^Code/).fill('PROBE');
  await dialog.getByRole('button', { name: 'Create department' }).click();
  await page.waitForTimeout(2000);

  check('a create reaches the database and is reported', await page.getByText('Department created').first().isVisible());
  const cjg = page.getByRole('table', { name: 'Departments in Computer Jagat', exact: true });
  check(
    'the new department appears under its division after the server answered',
    (await cjg.locator('tbody tr', { hasText: CREATED }).count()) === 1,
  );

  /* Uniqueness is enforced by the database, not the screen. */
  await page.getByRole('button', { name: 'New department' }).click();
  await dialog.waitFor();
  await dialog.getByLabel(/^Division/).selectOption({ label: 'Computer Jagat' });
  await dialog.getByLabel(/^Name/).fill(CREATED);
  await dialog.getByLabel(/^Code/).fill('PROBE2');
  await dialog.getByRole('button', { name: 'Create department' }).click();
  await page.waitForTimeout(1500);
  const refusal = await dialog.innerText();
  check(
    'a duplicate name is refused and names the division',
    /Computer Jagat already has a department with this name/.test(refusal),
    refusal.slice(0, 180).replace(/\n/g, ' '),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  /* Appointing a lead: the eligible list comes from the division's assignments. */
  const row = cjg.locator('tbody tr', { hasText: CREATED }).first();
  await row.getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: 'Appoint lead' }).click();
  await dialog.waitFor();
  await page.waitForTimeout(1200);
  const options = await dialog.getByLabel(/^Lead/).locator('option').allInnerTexts();
  check(
    'the eligible-lead list is answered by the server',
    options.length >= 1,
    options.join(' | ').slice(0, 160),
  );

  /* Clean up the probe's own record so the screen is left as it was found. */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await row.getByRole('button', { name: 'Row actions' }).click();
  const remove = page.getByRole('menuitem', { name: /Delete department/ });
  const removable = !(await remove.isDisabled());
  check('a department nothing references can be deleted', removable);
  if (removable) {
    await remove.click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Delete department' }).click();
    await page.waitForTimeout(1800);
    check(
      'the delete is reported and the row is gone',
      (await cjg.locator('tbody tr', { hasText: CREATED }).count()) === 0,
    );
  }

  check('no console errors across the administration flow', admin.consoleErrors.length === 0, admin.consoleErrors[0] ?? '');
}

await admin.context.close();

/* == 3. HR reaches none of it ============================================= */
{
  const hr = await signIn(browser, HR);
  check('an HR Manager can sign in', hr.signedIn, hr.page.url());
  if (hr.signedIn) {
    await hr.page.goto(`${BASE}/admin/departments`, { waitUntil: 'networkidle' });
    await hr.page.waitForTimeout(1800);
    const body = await hr.page.locator('main').innerText();
    check(
      'HR is refused the catalogue by the server, not only by the route guard',
      /do not have access|Not available to your role|limited to Super Administrators/i.test(body),
      body.slice(0, 160).replace(/\n/g, ' '),
    );
    check('HR sees no department table', (await hr.page.getByRole('table').count()) === 0);
  }
  await hr.context.close();
}

await browser.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
