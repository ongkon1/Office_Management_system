/**
 * Phase F2 browser probe — `/admin/departments` (`OH-FE-0201`–`OH-FE-0211`).
 *
 * What the route-level audits cannot reach: the catalogue grouped by division,
 * the two appointment flows, retained leadership history, deactivation, the
 * blocked destructive actions, and all of it behind a keyboard at four widths.
 *
 * Requires a dev server. `PROBE_BASE` selects it (default :3000).
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const ADMIN = 'arif.mahmud@demo.local';
const HR = 'rezaul.haque@demo.local';

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

async function signIn(browser, email, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
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

async function openCatalogue(page) {
  await page.goto(`${BASE}/admin/departments`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Departments', level: 1 }).waitFor({ timeout: 15000 });
  await page.getByRole('table', { name: 'Departments in PowerInAI', exact: true }).waitFor({ timeout: 15000 });
}

/** The action menu of a named row inside a named division's table. */
async function openRowMenu(page, division, department) {
  const table = page.getByRole('table', { name: `Departments in ${division}`, exact: true });
  const row = table.locator('tbody tr', { hasText: department }).first();
  await row.getByRole('button', { name: 'Row actions' }).click();
  await page.waitForTimeout(250);
}

/**
 * Opens a department's detail panel.
 *
 * Below `md` the shared table is CSS-hidden and its cards are shown, and a card
 * carries no action menu — the card itself opens the panel, whose footer holds
 * every action. So the route to the panel differs by width, and both are worth
 * exercising.
 */
async function openDetail(page, division, department, width) {
  if (width < 768) {
    await page.locator('li', { hasText: department }).first().click();
  } else {
    await openRowMenu(page, division, department);
    await page.getByRole('menuitem', { name: /View placements and leadership/ }).click();
  }
  await page
    .getByRole('dialog')
    .getByRole('heading', { name: 'Leadership history' })
    .waitFor({ timeout: 15000 });
}

/** The eligible-lead list is fetched per date; wait for the real options. */
async function waitForLeadOptions(page, dialog) {
  await page
    .waitForFunction(
      () => {
        const select = document.querySelector('[role="dialog"] select[name="leadEmployeeId"]');
        return Boolean(select && select.options.length > 1);
      },
      undefined,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(200);
  return dialog;
}

/** Smallest interactive target inside a container, in CSS pixels. */
async function smallestTarget(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    let min = Infinity;
    let name = '';
    const focusable = root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    for (const el of focusable) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      /* A control may claim its target through a pseudo-element, as Button
         does with `after:h-11`; take the larger of the two boxes. */
      const after = getComputedStyle(el, '::after');
      const afterHeight = parseFloat(after.height) || 0;
      const height = Math.max(rect.height, after.content !== 'none' ? afterHeight : 0);
      const size = Math.min(rect.width, height);
      if (size < min) {
        min = size;
        name = `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)}"`;
      }
    }
    return min === Infinity ? null : { size: Math.round(min), name };
  }, selector);
}

async function pageOverflow(page, width) {
  return page.evaluate(
    (viewport) => document.documentElement.scrollWidth - viewport,
    width,
  );
}

const browser = await chromium.launch();

/* == 1. Access: only a Super Administrator ================================== */
{
  const { context, page } = await signIn(browser, HR);
  await page.goto(`${BASE}/admin/departments`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const body = await page.locator('main').innerText();
  check(
    'HR Manager is refused the catalogue',
    /do not have access|Not available to your role/i.test(body),
    body.slice(0, 120).replace(/\n/g, ' '),
  );
  check(
    'a refused viewer sees no department table',
    (await page.getByRole('table').count()) === 0,
  );
  check(
    'a refused viewer is offered no mutation control',
    (await page.getByRole('button', { name: /New department|Appoint lead|Deactivate/ }).count()) === 0,
  );
  await context.close();
}

/* == 2. The catalogue, grouped and filterable =============================== */
const admin = await signIn(browser, ADMIN);
{
  const { page } = admin;
  await openCatalogue(page);

  for (const division of [
    'PowerInAI',
    'PowerInAI Training',
    'Government Projects',
    'Computer Jagat',
    'WesternCF',
  ]) {
    check(
      `${division} has its own group`,
      await page.getByRole('heading', { name: division, level: 2, exact: true }).isVisible(),
    );
  }

  /* `OH-FE-0202` — every fact the row must state. */
  const wcf = page.getByRole('table', { name: 'Departments in WesternCF', exact: true });
  const clientServices = wcf.locator('tbody tr', { hasText: 'Client Services' }).first();
  const rowText = await clientServices.innerText();
  check('a row states its code', rowText.includes('CLIENT'), rowText.replace(/\n/g, ' '));
  check('a row states its status', rowText.includes('Active'));
  check('a row states its current lead', rowText.includes('Farhana Islam'));
  check('a row states the lead effective date', rowText.includes('Effective from 1 Jan 2025'));
  check('a row states its active employee count', /(^|\s)2(\s|$)/m.test(rowText));

  /* Duplicate names live under different divisions. */
  const piaSales = await page
    .getByRole('table', { name: 'Departments in PowerInAI', exact: true })
    .locator('tbody tr', { hasText: 'Sales' })
    .count();
  const wcfSales = await wcf.locator('tbody tr', { hasText: 'Sales' }).count();
  check('the same name exists in two divisions', piaSales === 1 && wcfSales === 1, `${piaSales}/${wcfSales}`);

  /* Filters. */
  await page.getByLabel('Division').selectOption('gov');
  await page.waitForTimeout(700);
  check(
    'the division filter narrows the catalogue',
    (await page.getByRole('heading', { name: 'WesternCF', level: 2, exact: true }).count()) === 0 &&
      (await page.getByRole('heading', { name: 'Government Projects', level: 2, exact: true }).isVisible()),
  );

  await page.getByRole('searchbox', { name: 'Search' }).fill('zzz');
  await page.waitForTimeout(700);
  check(
    'an empty result says so and offers a way back',
    await page.getByText('No department matches these filters').isVisible(),
  );
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.waitForTimeout(700);
  check(
    'clearing the filters restores every group',
    await page.getByRole('heading', { name: 'WesternCF', level: 2, exact: true }).isVisible(),
  );
}

/* == 3. Create, with in-division uniqueness guidance ======================== */
{
  const { page } = admin;
  await page.getByRole('button', { name: 'New department' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();

  await dialog.getByLabel(/^Division/).selectOption('wcf');
  await dialog.getByLabel(/^Name/).fill('Sales');
  await dialog.getByLabel(/^Code/).fill('SALES2');
  await dialog.getByRole('button', { name: 'Create department' }).click();
  await page.waitForTimeout(900);
  const refusal = await dialog.innerText();
  check(
    'a duplicate name is refused and names the division',
    refusal.includes('WesternCF already has a department with this name'),
    refusal.slice(0, 160).replace(/\n/g, ' '),
  );
  check(
    'the refusal states the correction',
    refusal.includes('unique inside this division'),
  );

  await dialog.getByLabel(/^Name/).fill('Renewals');
  await dialog.getByLabel(/^Code/).fill('RENEW');
  await dialog.getByRole('button', { name: 'Create department' }).click();
  await page.waitForTimeout(1200);
  check(
    'a department is created and reported',
    await page.getByText('Department created').first().isVisible(),
  );
  const wcf = page.getByRole('table', { name: 'Departments in WesternCF', exact: true });
  check(
    'the new department appears under its division',
    (await wcf.locator('tbody tr', { hasText: 'Renewals' }).count()) === 1,
  );
}

/* == 4. Appointment: effective now, then scheduled ========================== */
{
  const { page } = admin;
  await openRowMenu(page, 'WesternCF', 'Renewals');
  await page.getByRole('menuitem', { name: 'Appoint lead' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();

  await waitForLeadOptions(page, dialog);
  const options = await dialog.getByLabel(/^Lead/).locator('option').allInnerTexts();
  check(
    'the lead list holds only employees assigned to the division',
    options.some((name) => name.includes('Sumaiya Noor')) &&
      !options.some((name) => name.includes('Tanvir Ahmed')),
    options.join(' | '),
  );
  await dialog.getByLabel(/^Lead/).selectOption('emp-1004');
  await dialog.getByRole('button', { name: 'Appoint lead' }).click();
  await page.waitForTimeout(1300);
  check('an appointment is reported', await page.getByText('Lead appointed').first().isVisible());

  const row = page
    .getByRole('table', { name: 'Departments in WesternCF', exact: true })
    .locator('tbody tr', { hasText: 'Renewals' })
    .first();
  const rowText = await row.innerText();
  check(
    'the new lead and effective date are shown',
    rowText.includes('Sumaiya Noor') && rowText.includes('Effective from 2 Sep 2026'),
    rowText.replace(/\n/g, ' '),
  );

  /* Scheduled: the current lead stays in force. */
  await openRowMenu(page, 'WesternCF', 'Renewals');
  await page.getByRole('menuitem', { name: 'Appoint lead' }).click();
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: /Scheduled for a later date/ }).check();
  await dialog.getByLabel(/^Effective from/).fill('2026-12-01');
  await page.waitForTimeout(800);
  await waitForLeadOptions(page, dialog);
  await dialog.getByLabel(/^Lead/).selectOption('emp-2002');
  await dialog.getByRole('button', { name: 'Appoint lead' }).click();
  await page.waitForTimeout(1300);
  const scheduledRow = await page
    .getByRole('table', { name: 'Departments in WesternCF', exact: true })
    .locator('tbody tr', { hasText: 'Renewals' })
    .first()
    .innerText();
  check(
    'a scheduled appointment is named without replacing the current lead',
    scheduledRow.includes('Sumaiya Noor') &&
      /Scheduled: Farhana Islam from 1 Dec 2026/.test(scheduledRow),
    scheduledRow.replace(/\n/g, ' '),
  );

  /* A past date is refused with its correction. */
  await openRowMenu(page, 'PowerInAI', 'People');
  await page.getByRole('menuitem', { name: 'Appoint lead' }).click();
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: /Scheduled for a later date/ }).check();
  await dialog.getByLabel(/^Effective from/).fill('2026-01-01');
  await page.waitForTimeout(800);
  await waitForLeadOptions(page, dialog);
  await dialog.getByLabel(/^Lead/).selectOption('emp-1001');
  await dialog.getByRole('button', { name: 'Appoint lead' }).click();
  await page.waitForTimeout(900);
  const pastRefusal = await dialog.innerText();
  check(
    'a past effective date is refused',
    pastRefusal.includes('An appointment cannot start in the past'),
    pastRefusal.slice(0, 140).replace(/\n/g, ' '),
  );
  check('the refusal explains why', pastRefusal.includes('never rewritten'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

/* == 5. Leadership history is a record, not an editable field =============== */
{
  const { page } = admin;
  await openRowMenu(page, 'PowerInAI', 'Technical');
  await page.getByRole('menuitem', { name: /View placements and leadership/ }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('heading', { name: 'Leadership history' }).waitFor({ timeout: 10000 });
  const text = await drawer.innerText();
  check('the history lists the current period', text.includes('Current'));
  check('the history keeps an ended period', /1 Jan 2024 – 31 Dec 2024/.test(text));
  check(
    'the history says recorded periods cannot be edited',
    text.includes('cannot be edited'),
  );
  check(
    'no control offers to rewrite a recorded period',
    (await drawer.getByRole('button', { name: /Edit appointment|End period|Change date/ }).count()) === 0,
  );
  check(
    'placements are listed with their own dates',
    text.includes('Nadia Rahman') && text.includes('Placed now'),
  );
  check(
    'a referenced department explains why it cannot be deleted or moved',
    text.includes('cannot be deleted or moved to another division'),
  );
  check(
    'no delete control is offered for it',
    (await drawer.getByRole('button', { name: 'Delete' }).count()) === 0,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

/* == 6. Deactivation ======================================================== */
{
  const { page } = admin;
  await openRowMenu(page, 'Government Projects', 'Compliance');
  await page.getByRole('menuitem', { name: /Deactivate department/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Deactivate department' }).click();
  await page.waitForTimeout(900);
  check(
    'deactivation asks for a reason before it proceeds',
    (await dialog.innerText()).includes('Say why the department is being deactivated'),
  );
  await dialog.getByLabel(/^Reason/).fill('Paused for the quarter.');
  await dialog.getByRole('button', { name: 'Deactivate department' }).click();
  await page.waitForTimeout(1300);
  const row = await page
    .getByRole('table', { name: 'Departments in Government Projects', exact: true })
    .locator('tbody tr', { hasText: 'Compliance' })
    .first()
    .innerText();
  check('the row becomes inactive', row.includes('Inactive'), row.replace(/\n/g, ' '));

  await openRowMenu(page, 'Government Projects', 'Compliance');
  const appoint = page.getByRole('menuitem', { name: 'Appoint lead' });
  check(
    'an inactive department is not offered a lead appointment',
    await appoint.isDisabled(),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/* == 7. Keyboard and focus restoration (OH-FE-0210) ======================== */
{
  const { page } = admin;
  await openCatalogue(page);

  const trigger = page.getByRole('button', { name: 'New department' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const insideDialog = await page.evaluate(() => {
    const dialogEl = document.querySelector('[role="dialog"]');
    return Boolean(dialogEl && dialogEl.contains(document.activeElement));
  });
  check('opening a dialog moves focus into it', insideDialog);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const restored = await page.evaluate(
    () => (document.activeElement?.textContent ?? '').trim(),
  );
  check('closing it returns focus to the control that opened it', /New department/.test(restored), restored);

  /* The whole flow by keyboard: open the row menu, reach the drawer. */
  const row = page
    .getByRole('table', { name: 'Departments in PowerInAI', exact: true })
    .locator('tbody tr', { hasText: 'Technical' })
    .first();
  await row.getByRole('button', { name: 'Row actions' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const menuFocus = await page.evaluate(() =>
    (document.activeElement?.textContent ?? '').trim(),
  );
  check('the row menu takes focus on its first item', menuFocus.length > 0, menuFocus);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check(
    'the menu item opens the panel it names',
    await page.getByRole('dialog').getByRole('heading', { name: 'Leadership history' }).isVisible(),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

await admin.context.close();

/* == 8. Four widths, no page-level overflow, 24 px targets ================== */
for (const width of [375, 768, 1024, 1440]) {
  const session = await signIn(browser, ADMIN, width);
  const { page } = session;
  await page.goto(`${BASE}/admin/departments`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Departments', level: 1 }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);

  check(`${width}px catalogue does not scroll sideways`, (await pageOverflow(page, width)) <= 1);
  const target = await smallestTarget(page, 'main');
  check(
    `${width}px every catalogue target is at least 24 px`,
    target !== null && target.size >= 24,
    target ? `${target.size}px ${target.name}` : 'no targets found',
  );

  /* The form, with every field and an over-long name in it. */
  await page.getByRole('button', { name: 'New department' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByLabel(/^Name/).fill('A'.repeat(90));
  await dialog.getByLabel(/^Code/).fill('X');
  await dialog.getByRole('button', { name: 'Create department' }).click();
  await page.waitForTimeout(900);
  check(`${width}px the refused form does not scroll sideways`, (await pageOverflow(page, width)) <= 1);
  check(
    `${width}px the form's submit stays in the viewport`,
    await dialog.getByRole('button', { name: 'Create department' }).isVisible(),
  );
  const dialogTarget = await smallestTarget(page, '[role="dialog"]');
  check(
    `${width}px every form target is at least 24 px`,
    dialogTarget !== null && dialogTarget.size >= 24,
    dialogTarget ? `${dialogTarget.size}px ${dialogTarget.name}` : 'no targets found',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* The detail panel, which carries the longest content on the screen. */
  await openDetail(page, 'PowerInAI', 'Technical', width);
  await page.waitForTimeout(400);
  check(
    `${width}px every action stays reachable from the detail panel`,
    (await page.getByRole('dialog').getByRole('button', { name: 'Appoint lead' }).count()) === 1 &&
      (await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).count()) === 1,
  );
  check(`${width}px the detail panel does not scroll sideways`, (await pageOverflow(page, width)) <= 1);
  const drawerTarget = await smallestTarget(page, '[role="dialog"]');
  check(
    `${width}px every detail-panel target is at least 24 px`,
    drawerTarget !== null && drawerTarget.size >= 24,
    drawerTarget ? `${drawerTarget.size}px ${drawerTarget.name}` : 'no targets found',
  );

  check(`${width}px no console errors`, session.consoleErrors.length === 0, session.consoleErrors[0] ?? '');
  await session.context.close();
}

await browser.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
