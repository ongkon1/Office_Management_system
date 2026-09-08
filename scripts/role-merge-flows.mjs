/**
 * `FE-1013` — role consolidation verification. Requires a running server.
 *
 * This gate exists for two specific regressions, not for general coverage.
 * Both are silent: nothing crashes, no test elsewhere fails, and the screens
 * look right.
 *
 *   1. Merging Finance into HR must not grant cost or salary data to HR users
 *      who were never given the financial permission. A role merge that
 *      quietly widens access is the failure mode of exactly this kind of
 *      change, and the only way to see it is to sign in as an HR account
 *      without the permission and look for money.
 *
 *   2. Retiring the role must not make history unreadable. A requisition or
 *      conveyance decided by a Finance Manager before the merge still has to
 *      render its timeline.
 */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';

const PASSWORD = 'Demo1234!';
const HR_WITH_COST = 'mahmuda.akter@demo.local';
const HR_WITHOUT_COST = 'shakil.chowdhury@demo.local';
const HR_CORE = 'rezaul.haque@demo.local';
const EMPLOYEE = 'nadia.rahman@demo.local';
const TEAM_LEAD = 'imran.hossain@demo.local';
const ADMIN = 'arif.mahmud@demo.local';

/** Records already decided by a Finance Manager, before the role was retired. */
const FINANCE_DECIDED_REQUISITION = '/requisitions/req-5';
const FINANCE_DECIDED_CONVEYANCE = '/conveyance/cnv-5';

/** Every route that shows money, or is gated on the financial permission. */
const MONEY_ROUTES = [
  '/finance',
  '/finance/hours',
  '/finance/overtime',
  '/finance/payroll',
  '/finance/reports',
];

const COST_ONLY_ROUTES = ['/finance/billable', '/finance/project-costs', '/finance/division-costs'];

const browser = await chromium.launch();
const failures = [];
let checks = 0;

function record(ok, area, detail) {
  checks += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(10)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function openAs(email, { twoFactor = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
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
  await page.waitForTimeout(600);
  return { context, page };
}

async function goto(page, path, wait = 1000) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  return page.locator('main').innerText();
}

/** A BDT figure anywhere on the page. The thing that must not leak. */
const MONEY = /BDT\s?[\d,]+\.\d{2}/;

console.log(`Role consolidation verification against ${baseUrl}\n`);

/* ========================================================================== */
/* FE-1002 — the role is gone from the product                                */
/* ========================================================================== */

{
  const { context, page } = await openAs(ADMIN, { twoFactor: true });
  const roles = await goto(page, '/admin/roles');

  record(
    /Finance Manager \(retired\)/i.test(roles),
    'FE-1010',
    'the retired role is listed as history rather than silently vanishing',
  );
  record(
    /Retired/i.test(roles) && !/Finance Manager(?! \(retired\))/i.test(roles),
    'FE-1010',
    'and is marked retired, not offered as an assignable role',
  );

  const users = await goto(page, '/admin/users');
  record(
    !/Finance Manager(?! \(retired\))/i.test(users),
    'FE-1010',
    'no account is presented as holding the Finance Manager role',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-1004, FE-1007 — HR reaches the finance screens                          */
/* ========================================================================== */

{
  const { context, page } = await openAs(HR_WITH_COST);
  const nav = await page.locator('nav').first().innerText();
  record(/Finance/i.test(nav), 'FE-1003', 'an HR user sees the Finance section in navigation');

  for (const route of [...MONEY_ROUTES, ...COST_ONLY_ROUTES]) {
    const text = await goto(page, route);
    record(
      !/do not have access|denied|not found/i.test(text),
      'FE-1004',
      `HR with the financial permission reaches ${route}`,
    );
  }
  await context.close();
}

/* ========================================================================== */
/* FE-1005 — TRAP ONE: the merge granted nobody cost access                   */
/* ========================================================================== */

{
  const { context, page } = await openAs(HR_WITHOUT_COST);

  for (const route of MONEY_ROUTES) {
    const text = await goto(page, route);
    record(
      !MONEY.test(text),
      'FE-1005',
      `HR without the permission sees no money on ${route}`,
    );
  }

  for (const route of COST_ONLY_ROUTES) {
    const text = await goto(page, route);
    record(
      /do not have access|denied|permission/i.test(text) && !MONEY.test(text),
      'FE-1005',
      `HR without the permission is refused ${route} outright`,
    );
  }

  const hours = await goto(page, '/finance/hours');
  record(
    /Restricted/i.test(hours),
    'FE-1005',
    'a redacted field is marked Restricted rather than blanked or zeroed',
  );
  await context.close();
}

{
  // The core HR account was never a Finance user at all. If the merge widened
  // anything by role, this is where it shows.
  const { context, page } = await openAs(HR_CORE);
  for (const route of MONEY_ROUTES) {
    const text = await goto(page, route);
    record(
      !MONEY.test(text),
      'FE-1005',
      `the pre-existing HR account sees no money on ${route}`,
    );
  }
  await context.close();
}

/* ========================================================================== */
/* FE-1002 — TRAP TWO: history recorded under the retired role still reads    */
/* ========================================================================== */

{
  const { context, page } = await openAs(ADMIN, { twoFactor: true });

  const requisition = await goto(page, FINANCE_DECIDED_REQUISITION);
  record(
    /Finance \(retired\)/i.test(requisition),
    'FE-1002',
    'a requisition decided by Finance still names who decided it',
  );
  record(
    /Rejected/i.test(requisition) && /Re-raise after 1 October/i.test(requisition),
    'FE-1002',
    'and its recorded decision and reason survive the role being retired',
  );

  const conveyance = await goto(page, FINANCE_DECIDED_CONVEYANCE);
  record(
    /Finance \(retired\)/i.test(conveyance),
    'FE-1002',
    'a conveyance claim decided by Finance still names who decided it',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-1001 — the chain is two parallel reviewers, not three                   */
/* ========================================================================== */

{
  const { context, page } = await openAs(EMPLOYEE);
  const form = await goto(page, '/requisitions/new');
  record(
    /HR and the Super Administrator/i.test(form) && !/HR, Finance/i.test(form),
    'FE-1001',
    'the requisition form describes a two-reviewer chain',
  );
  await context.close();
}

{
  const { context, page } = await openAs(TEAM_LEAD);
  const text = await goto(page, '/requisitions/req-2');
  record(
    /Waiting for HR and the Super Administrator/i.test(text),
    'FE-1001',
    'a record awaiting review names two reviewers',
  );
  record(
    !/Waiting for.*Finance/i.test(text),
    'FE-1001',
    'and never waits on a role nobody can hold',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-1004 — the roles that must still be refused                             */
/* ========================================================================== */

for (const [label, email] of [
  ['an Employee', EMPLOYEE],
  ['a Team Lead', TEAM_LEAD],
]) {
  const { context, page } = await openAs(email);
  const text = await goto(page, '/finance/hours');
  record(
    /do not have access|denied|permission/i.test(text),
    'FE-1004',
    `${label} is still refused the finance screens`,
  );
  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} role consolidation check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${checks} role consolidation checks pass.`);
