/**
 * Phase 2 flow verification.
 *
 * Drives the real browser through each Phase 2 exit criterion:
 *  - every demo role signs in and lands on its own dashboard
 *  - a restricted route renders a denied state in place, keeping the URL
 *  - sign-out returns to /login and the session does not survive it
 *  - the two-factor step is required where the account demands it
 *  - locked and inactive accounts are refused with their own screens
 *
 * Requires a dev server on --url (default http://localhost:3000).
 */

import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length) ??
  'http://localhost:3000';
const shoot = process.argv.includes('--screenshots');

const PASSWORD = 'Demo1234!';

const ROLES = [
  ['nadia.rahman@demo.local', 'Employee', '/dashboard'],
  ['imran.hossain@demo.local', 'Team Lead', '/dashboard'],
  ['rezaul.haque@demo.local', 'HR Manager', '/hr'],
  ['mahmuda.akter@demo.local', 'HR (with cost)', '/hr'],
  ['shakil.chowdhury@demo.local', 'HR (no cost)', '/hr'],
  ['ayesha.siddika@demo.local', 'Management', '/dashboard'],
];

const failures = [];
const browser = await chromium.launch();

function check(condition, message) {
  if (!condition) failures.push(message);
  return condition;
}

async function signIn(page, email, { expectTwoFactor = false } = {}) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  if (expectTwoFactor) {
    await page.waitForURL('**/two-factor', { timeout: 10000 });
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
  }

  // Sign-in is asynchronous. `networkidle` can settle before the session is
  // stored, so wait until the router has actually left the login screen —
  // navigating sooner races the session and produces false failures.
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), {
    timeout: 15000,
  });
  await page.waitForLoadState('networkidle');
}

console.log(`Phase 2 flow verification against ${baseUrl}\n`);

/* 1. Each role lands on its own dashboard. */
for (const [email, label, expected] of ROLES) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, email);
  await page.waitForURL(`**${expected}`, { timeout: 10000 }).catch(() => {});
  const path = new URL(page.url()).pathname;
  const ok = check(path === expected, `${label}: landed on ${path}, expected ${expected}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} | login → ${expected.padEnd(11)} | ${label}`);
  await context.close();
}

/* 2. Restricted route renders denied in place, URL preserved. */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, 'shakil.chowdhury@demo.local');
  // `/finance/project-costs` is wholly about money and stays permission-gated.
  // Payroll and reports are deliberately reachable without the permission —
  // they redact the money inside instead (`FE-0611`).
  await page.goto(`${baseUrl}/finance/project-costs`, { waitUntil: 'networkidle' });

  const path = new URL(page.url()).pathname;
  const denied = await page.getByText('You do not have access to this page').isVisible();
  const namesPermission = await page.getByText('finance.cost.view').isVisible();

  check(path === '/finance/project-costs', `denied route redirected to ${path} instead of staying`);
  check(denied, 'denied screen was not shown for /finance/project-costs');
  check(namesPermission, 'denied screen did not name the required permission');
  /*
   * The printed verdict compared against `/finance/payroll` while the page had
   * navigated to `/finance/project-costs`, so this line always printed FAIL
   * even though the `check()` calls above passed and the gate exited zero. A
   * permanently red line that never fails the build teaches people to ignore
   * red lines.
   */
  console.log(
    `${denied && path === '/finance/project-costs' ? 'PASS' : 'FAIL'} | denied in place | HR without cost permission → /finance/project-costs`,
  );

  if (shoot) await page.screenshot({ path: 'screenshots/phase2-denied.png' });
  await context.close();
}

/* 3. An Employee is refused HR and admin routes. */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');

  for (const route of ['/hr', '/admin/users', '/attendance']) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    // The guard renders after hydration, so wait for the outcome rather than
    // sampling once — a single check races the client boundary.
    const denied = await page
      .getByRole('heading', { name: 'You do not have access to this page' })
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (!denied) {
      const heading = await page
        .getByRole('heading', { level: 1 })
        .first()
        .innerText()
        .catch(() => '(no h1)');
      failures.push(`Employee was not denied ${route} — page showed "${heading}"`);
    }
    console.log(`${denied ? 'PASS' : 'FAIL'} | denied         | Employee → ${route}`);
  }
  await context.close();
}

/* 4. Unauthenticated access redirects to login and preserves the target. */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
  const url = new URL(page.url());
  const ok = check(
    url.pathname === '/login' && url.searchParams.get('returnTo') === '/dashboard',
    `unauthenticated /dashboard went to ${page.url()}`,
  );
  console.log(`${ok ? 'PASS' : 'FAIL'} | guard          | signed out → /login?returnTo=/dashboard`);
  await context.close();
}

/* 5. Two-factor is required for the account that demands it. */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', 'arif.mahmud@demo.local');
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/two-factor', { timeout: 10000 }).catch(() => {});
  const atTwoFactor = new URL(page.url()).pathname === '/two-factor';
  check(atTwoFactor, 'password step did not stop at two-factor for the 2FA account');

  if (atTwoFactor) {
    await page.fill('input[name="one-time-code"]', '000000');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(800);
    const stillThere = new URL(page.url()).pathname === '/two-factor';
    check(stillThere, 'a wrong code let the sign-in through');

    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});
    check(
      new URL(page.url()).pathname === '/dashboard',
      'correct code did not complete sign-in',
    );
  }
  console.log(`${atTwoFactor ? 'PASS' : 'FAIL'} | two-factor     | wrong code refused, correct code accepted`);
  if (shoot) await page.screenshot({ path: 'screenshots/phase2-dashboard-admin.png' });
  await context.close();
}

/* 6. Locked and inactive accounts get their own screens. */
{
  for (const [email, expected, label] of [
    ['rafiq.chowdhury@demo.local', '/account-locked', 'locked'],
    ['nusrat.jahan@demo.local', '/account-inactive', 'inactive'],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="identifier"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**${expected}`, { timeout: 10000 }).catch(() => {});
    const ok = check(
      new URL(page.url()).pathname === expected,
      `${label} account went to ${page.url()} instead of ${expected}`,
    );
    console.log(`${ok ? 'PASS' : 'FAIL'} | account state  | ${label} → ${expected}`);
    await context.close();
  }
}

/* 7. Sign-out clears the session and returns to login. */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');

  await page.getByRole('button', { name: /Account menu/i }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});

  const atLogin = new URL(page.url()).pathname === '/login';
  check(atLogin, `sign-out landed on ${page.url()}`);

  // The session must not survive a reload after sign-out.
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
  const stillOut = new URL(page.url()).pathname === '/login';
  check(stillOut, 'session survived sign-out');
  console.log(`${atLogin && stillOut ? 'PASS' : 'FAIL'} | sign-out       | returns to /login and session is cleared`);
  await context.close();
}

/* 8. Navigation reflects role scope. */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, 'shakil.chowdhury@demo.local');
  const nav = await page.getByRole('navigation', { name: 'Main' }).innerText();
  const hidesCost =
    !nav.includes('Project Costs') &&
    !nav.includes('Division Costs') &&
    !nav.includes('Billable Analysis');
  const showsHours = nav.includes('Employee Hours');
  check(hidesCost, 'cost destinations were visible without the permission');
  check(showsHours, 'Employee Hours was missing for a Finance user');
  console.log(
    `${hidesCost && showsHours ? 'PASS' : 'FAIL'} | navigation     | cost destinations hidden without the permission`,
  );
  await context.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nAll Phase 2 flows pass.');
