/**
 * Phase F3 browser journeys — multi-division placement and department-lead
 * access (`OH-FE-0314`).
 *
 * Two journeys:
 *
 * 1. HR places one employee in a department in two different divisions, and the
 *    placement history shows the move.
 * 2. An employee who holds a department appointment signs in and reaches the
 *    Team Lead surfaces that appointment grants — and nothing else.
 *
 * Requires a dev server. `PROBE_BASE` selects it (default :3000).
 *
 * **Precondition.** These journeys need the placement and Team Lead operations
 * to be answerable in the browser. The runtime adapters currently route them to
 * the server, where `listDepartmentOptions`, `saveAssignment` and the whole
 * Team Lead service are not implemented yet (Backend Phase 9 `BE-0902` for the
 * adapters, and the organization-hierarchy F3 service work for placement), so
 * the screens answer "not available from the server yet". The probe detects
 * that and exits 2 with the reason rather than reporting a pass or a failure
 * that says nothing about this phase.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.PROBE_PASSWORD ?? 'Demo1234!';
/* Seeded database accounts, not the frontend demo fixtures. */
const HR = process.env.PROBE_HR ?? 'hr@powerin.ai';
const APPOINTED_LEAD = process.env.PROBE_LEAD ?? 'employee@powerin.ai';

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

function unavailable(text) {
  return /not available from the server yet|unavailable/i.test(text);
}

async function signIn(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return { context, page, pageErrors, signedIn: !new URL(page.url()).pathname.startsWith('/login') };
}

function skip(reason) {
  console.log('SKIP | the placement and Team Lead operations are not answerable in this environment');
  console.log(`     | ${reason}`);
  console.log('     | Until the adapters exist, the F3 behaviour is covered by');
  console.log('     | src/features/hr/placement-form.test.tsx, placement-history.test.ts,');
  console.log('     | src/features/team-lead/department-scope.test.tsx and');
  console.log('     | src/features/access/department-capabilities.test.ts.');
}

const browser = await chromium.launch();

/* == Journey 1: HR places one employee in two divisions =================== */
const hr = await signIn(browser, HR);
check('HR can sign in', hr.signedIn, hr.page.url());
if (!hr.signedIn) {
  await browser.close();
  process.exit(1);
}

await hr.page.goto(`${BASE}/employees`, { waitUntil: 'networkidle' });
await hr.page.waitForTimeout(1500);
const directory = await hr.page.locator('main').innerText();
if (unavailable(directory)) {
  skip('/employees answers "not available from the server yet" for the HR read it needs.');
  await hr.context.close();
  await browser.close();
  process.exit(2);
}

check('the employee directory loaded', /Employees/.test(directory), directory.slice(0, 160).replace(/\n/g, ' '));

const firstEmployee = hr.page.locator('main a[href^="/employees/"]').first();
if ((await firstEmployee.count()) === 0) {
  skip('the directory returned no employee rows, so no placement can be opened.');
  await hr.context.close();
  await browser.close();
  process.exit(2);
}

await firstEmployee.click();
await hr.page.waitForTimeout(1500);
const assignmentsTab = hr.page.getByRole('tab', { name: /Assignments/i });
check('the employee detail offers an Assignments tab', (await assignmentsTab.count()) > 0);
if ((await assignmentsTab.count()) > 0) {
  await assignmentsTab.click();
  await hr.page.waitForTimeout(1200);
  const placements = await hr.page.locator('main').innerText();
  if (unavailable(placements)) {
    skip('the placement card answers "not available from the server yet" (no server assignment operations).');
    await hr.context.close();
    await browser.close();
    process.exit(2);
  }

  check('the card states where the employee is placed', /Placed in/.test(placements), placements.slice(0, 200).replace(/\n/g, ' '));
  check('placement history is present', /Placement history/.test(placements));

  /* The dependent control: a department belongs to the selected division. */
  const add = hr.page.getByRole('button', { name: /assignment/i }).first();
  if ((await add.count()) > 0) {
    await add.click();
    const dialog = hr.page.getByRole('dialog');
    await dialog.waitFor({ timeout: 10000 });
    await dialog.getByLabel(/^Division/).selectOption({ index: 1 });
    await hr.page.waitForTimeout(900);
    const department = dialog.getByLabel(/^Department/);
    const options = await department.locator('option').allInnerTexts();
    check('the department list follows the selected division', options.length > 1, options.join(' | ').slice(0, 160));
    const lead = dialog.getByLabel(/Effective Team Lead/);
    check('the effective lead is shown as context, not an editable field', await lead.isEditable() === false || (await lead.getAttribute('readonly')) !== null);
    await hr.page.keyboard.press('Escape');
  }
}
check('no uncaught page errors in the HR journey', hr.pageErrors.length === 0, hr.pageErrors[0] ?? '');
await hr.context.close();

/* == Journey 2: a department lead by appointment ========================== */
{
  const lead = await signIn(browser, APPOINTED_LEAD);
  check('an appointed department lead can sign in', lead.signedIn, lead.page.url());
  if (lead.signedIn) {
    const navigation = await lead.page.getByRole('navigation', { name: 'Main' }).innerText().catch(() => '');
    check('the navigation offers a team destination', /My Team|Team/.test(navigation), navigation.replace(/\n/g, ' ').slice(0, 160));

    await lead.page.goto(`${BASE}/team`, { waitUntil: 'networkidle' });
    await lead.page.waitForTimeout(1500);
    const team = await lead.page.locator('main').innerText();
    if (unavailable(team)) {
      skip('/team answers "not available from the server yet" (no server Team Lead service).');
      await lead.context.close();
      await browser.close();
      process.exit(2);
    }
    check('the team screen explains the scope the appointment grants', /You lead/.test(team), team.slice(0, 200).replace(/\n/g, ' '));

    /* Administration stays closed: the appointment is not a role. */
    await lead.page.goto(`${BASE}/admin/departments`, { waitUntil: 'networkidle' });
    await lead.page.waitForTimeout(1200);
    const admin = await lead.page.locator('main').innerText();
    check('department administration stays denied', /do not have access|Not available to your role/i.test(admin), admin.slice(0, 140).replace(/\n/g, ' '));
  }
  await lead.context.close();
}

await browser.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
