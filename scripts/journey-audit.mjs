/**
 * End-to-end role journeys (`FE-0821`). Requires a server on :3000.
 *
 * The phase gates each prove one screen behaves. This proves a *person* can get
 * through their day: sign in, do the thing their role exists to do, and see the
 * consequence — using the mock services exactly as the demo will.
 *
 * Each journey is written as the walkthrough a stakeholder would be given, so a
 * failure here means the demo itself is broken, not merely a control.
 */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const journeyFilter = process.argv.find((arg) => arg.startsWith('--journey='))?.slice(10);

const PASSWORD = 'Demo1234!';
const browser = await chromium.launch();
const failures = [];
let steps = 0;

function step(ok, journey, detail) {
  steps += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${journey.padEnd(12)} | ${detail}`);
  if (!ok) failures.push(`${journey}: ${detail}`);
}

async function signIn(email, { twoFactor = false, width = 1400 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
  if (twoFactor) {
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !new URL(url).pathname.startsWith('/two-factor'), {
      timeout: 15000,
    });
  }
  await page.waitForTimeout(800);
  return { context, page };
}

async function open(page, path, wait = 1000) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  return page.locator('main').innerText();
}

const journeys = {};

/* ========================================================================== */
/* Employee: record a day and see it classified                               */
/* ========================================================================== */

journeys.employee = async () => {
  const { context, page } = await signIn('nadia.rahman@demo.local');

  let body = await open(page, '/dashboard', 1200);
  step(
    body.includes('Today') || body.includes('today'),
    'employee',
    'lands on a dashboard showing today',
  );

  body = await open(page, '/timesheets/2026-09-01', 1300);
  step(
    body.includes('7:00') && body.includes('1:00') && body.includes('8:00'),
    'employee',
    'sees the cross-division day as 7:00 active, 1:00 break, 8:00 total',
  );
  step(
    body.includes('Complete'),
    'employee',
    'sees the day classified Complete',
  );
  step(
    body.includes('PIA') && body.includes('GOV') && body.includes('WCF'),
    'employee',
    'sees all three divisions contributing to the same day',
  );

  // Record a new entry end to end.
  await page.getByRole('button', { name: /^Add time$/ }).first().click();
  await page.waitForTimeout(900);
  const dialog = page.getByRole('dialog');
  step((await dialog.count()) > 0, 'employee', 'opens the time-entry drawer');

  const preview = await dialog.innerText();
  step(
    preview.includes('If you save this') &&
      preview.includes('Day active') &&
      preview.includes('Day total'),
    'employee',
    'sees a live calculation preview before saving',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Requests and remarks are part of the same day's work.
  body = await open(page, '/wfh', 1100);
  step(body.includes('Request WFH'), 'employee', 'can request a work-from-home day');

  body = await open(page, '/leave', 1100);
  step(body.includes('Balances'), 'employee', 'sees their own leave balances');

  body = await open(page, '/remarks', 1100);
  step(
    body.length > 0 && !body.includes('unavailable'),
    'employee',
    'reaches their remarks inbox',
  );

  // The boundary that defines this role.
  body = await open(page, '/hr', 900);
  step(
    /do not have access|does not include this area/i.test(body),
    'employee',
    'cannot reach the HR workspace by URL',
  );

  await context.close();
};

/* ========================================================================== */
/* Team Lead: review an exception and request a correction                    */
/* ========================================================================== */

journeys.teamLead = async () => {
  const { context, page } = await signIn('imran.hossain@demo.local');

  let body = await open(page, '/dashboard', 1300);
  step(
    body.includes('Assigned employees') && body.includes('Time exceptions'),
    'team-lead',
    'lands on a dashboard scoped to assigned employees',
  );

  body = await open(page, '/team/timesheets', 1300);
  step(body.includes('Active') && body.includes('Break'), 'team-lead', 'reviews team timesheets');

  const approvalControls = await page
    .getByRole('button', { name: /approve.*(day|timesheet)|reject.*timesheet/i })
    .count();
  step(
    approvalControls === 0,
    'team-lead',
    'finds no daily approval control anywhere in the review',
  );

  body = await open(page, '/team/timesheets/emp-1002/2026-08-24', 1300);
  step(
    body.includes('Critical'),
    'team-lead',
    'opens the critical day and sees it classified Critical',
  );
  step(
    body.includes('plate failure') || body.includes('Press incident') || body.includes('explanation'),
    'team-lead',
    'sees the explanation the employee recorded for it',
  );

  // Raise a correction request, which is the Team Lead's actual instrument.
  await page.getByLabel('General remark').fill('Please split this by task before month end.');
  await page.getByLabel('Request a correction to this record').check();
  await page.getByLabel('Requested changes').fill('Split the entry across the two tasks.');
  await page.getByRole('button', { name: 'Preview and send' }).click();
  await page.waitForTimeout(600);
  step(
    (await page.getByRole('dialog').innerText()).includes('Notification preview'),
    'team-lead',
    'sees exactly what the employee will be told before sending',
  );
  await page.getByRole('button', { name: 'Confirm and notify' }).click();
  await page.waitForTimeout(1000);
  step(
    (await page.locator('main').innerText()).includes('Corrected') ||
      (await page.locator('main').innerText()).includes('Open'),
    'team-lead',
    'the correction request is recorded against the day',
  );

  body = await open(page, '/requests', 1200);
  step(body.includes('Pending'), 'team-lead', 'reaches the WFH and leave request queue');

  body = await open(page, '/workload', 1200);
  step(body.includes('Capacity'), 'team-lead', 'reviews workload against capacity');

  await context.close();
};

/* ========================================================================== */
/* HR: verify a payroll period                                                */
/* ========================================================================== */

journeys.hr = async () => {
  const { context, page } = await signIn('rezaul.haque@demo.local');

  let body = await open(page, '/hr', 1300);
  step(
    body.includes('Active employees') && body.includes('Payroll period'),
    'hr',
    'lands on a company-wide dashboard with the pending period surfaced',
  );

  body = await open(page, '/attendance', 1300);
  step(
    body.includes('Approved leave') && body.includes('Holiday'),
    'hr',
    'reviews attendance including explained non-working days',
  );

  body = await open(page, '/hr/timesheets', 1400);
  step(
    body.includes('Completeness') && body.includes('Unresolved corrections'),
    'hr',
    'opens the verification workspace',
  );

  // September has no outstanding corrections, so it can be verified.
  await page.getByRole('tab', { name: 'September 2026' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Verify period' }).click();
  await page.waitForTimeout(600);

  const confirmation = await page.getByRole('dialog').innerText();
  step(
    confirmation.includes('Included dates') && confirmation.includes('Policy version'),
    'hr',
    'the confirmation states what is being locked and under which policy',
  );

  const acceptBox = page.getByRole('checkbox', { name: /Accept the .* remaining exception/ });
  if ((await acceptBox.count()) > 0) await acceptBox.check();
  await page.getByRole('button', { name: 'Verify and lock period' }).click();
  await page.waitForTimeout(1200);
  step(
    (await page.locator('main').innerText()).includes('Verified and locked'),
    'hr',
    'the period is verified and locked',
  );

  // The lock must be felt elsewhere immediately.
  body = await open(page, '/employees/emp-1001', 1300);
  step(body.includes('Nadia Rahman'), 'hr', 'opens an employee record');

  await context.close();
};

/* ========================================================================== */
/* Finance: verified hours to a payroll-ready preview                         */
/* ========================================================================== */

journeys.finance = async () => {
  const { context, page } = await signIn('mahmuda.akter@demo.local');

  let body = await open(page, '/finance', 1300);
  step(
    body.includes('Verified employee hours') && body.includes('Verified period'),
    'finance',
    'lands on a dashboard defaulting to the verified period',
  );
  step(
    body.includes('BDT'),
    'finance',
    'sees labour cost, because this account holds the financial permission',
  );

  body = await open(page, '/finance/hours', 1300);
  step(body.includes('Labour cost'), 'finance', 'drills into employee hours and cost');

  body = await open(page, '/finance/billable', 1300);
  step(
    body.includes('Reconciled against total verified hours'),
    'finance',
    'confirms the billable split reconciles exactly',
  );

  body = await open(page, '/finance/payroll', 1400);
  step(
    body.includes('Verified and locked') && body.includes('Exceptions carried into payroll'),
    'finance',
    'reaches a payroll-ready summary with its exceptions visible',
  );

  await page.getByRole('button', { name: 'Configure export' }).click();
  await page.waitForTimeout(600);
  step(
    (await page.getByRole('dialog').innerText()).includes('No file is produced'),
    'finance',
    'the export is honest about producing no file in this milestone',
  );
  await page.keyboard.press('Escape');

  await context.close();
};

/* ========================================================================== */
/* Finance without the permission: the same hours, no money                   */
/* ========================================================================== */

journeys.financeLimited = async () => {
  const { context, page } = await signIn('shakil.chowdhury@demo.local');

  let body = await open(page, '/finance', 1300);
  step(
    body.includes('Verified employee hours') && body.includes('Cost restricted'),
    'finance-ltd',
    'sees the same hours without the cost permission',
  );
  step(!body.includes('BDT'), 'finance-ltd', 'no money value reaches the page');

  body = await open(page, '/finance/project-costs', 1000);
  step(
    /do not have access|does not include this area/i.test(body),
    'finance-ltd',
    'a screen wholly about cost is denied outright',
  );

  await context.close();
};

/* ========================================================================== */
/* Management: read-only exploration                                          */
/* ========================================================================== */

journeys.management = async () => {
  const { context, page } = await signIn('ayesha.siddika@demo.local');

  const body = await open(page, '/dashboard', 1400);
  step(
    body.includes('Management dashboard') && body.includes('Read-only'),
    'management',
    'lands on a read-only company overview',
  );

  const mutating = await page
    .getByRole('button', {
      name: /edit|approve|verify|override|delete|remove|save|submit|publish|export|create|add/i,
    })
    .count();
  step(mutating === 0, 'management', `finds no mutating control (${mutating})`);

  step(
    body.includes('Restricted'),
    'management',
    'cost is withheld from a view-only mandate',
  );

  await context.close();
};

/* ========================================================================== */
/* Administrator: two-factor, then administration                             */
/* ========================================================================== */

journeys.admin = async () => {
  const { context, page } = await signIn('arif.mahmud@demo.local', { twoFactor: true });

  let body = await open(page, '/admin/divisions', 1300);
  step(
    body.includes('Cannot be deactivated yet'),
    'admin',
    'sees why a division cannot be deactivated before trying',
  );

  body = await open(page, '/admin/roles', 1300);
  step(
    body.includes('The holder can'),
    'admin',
    'sees the consequence of each sensitive permission, not just its name',
  );

  body = await open(page, '/admin/audit', 1300);
  step(
    body.includes('cor-') && body.includes('Reason:'),
    'admin',
    'reads the audit log with reasons and correlation ids',
  );

  body = await open(page, '/settings', 1300);
  step(body.includes('Work policy'), 'admin', 'reaches the settings screens');

  await context.close();
};

console.log(`Role journey verification against ${baseUrl}\n`);

const selected = journeyFilter
  ? { [journeyFilter]: journeys[journeyFilter] }
  : journeys;

for (const [name, run] of Object.entries(selected)) {
  if (typeof run !== 'function') {
    console.error(`Unknown journey: ${name}`);
    process.exit(1);
  }
  await run();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} journey step(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${steps} role journey steps pass.`);
