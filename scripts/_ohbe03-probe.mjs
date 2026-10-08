/**
 * Phase B3 browser probe — the department filter on a real report.
 *
 * `OH-BE-0306` added a department filter to the authorized employee,
 * attendance, workload, time and evaluation reports. The report builder renders
 * any option-bearing filter generically, so the only way to know the new kind
 * actually reaches a person is to open the page the server serves and use it.
 *
 * Requires a dev server with a migrated and seeded database. `PROBE_BASE`
 * selects it (default :3000).
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.PROBE_PASSWORD ?? 'Demo1234!';
const ADMIN = process.env.PROBE_ADMIN ?? 'admin@powerin.ai';

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="identifier"]', ADMIN);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
const signedIn = !new URL(page.url()).pathname.startsWith('/login');
check('a Super Administrator can sign in', signedIn, page.url());
if (!signedIn) {
  await browser.close();
  process.exit(1);
}

await page.goto(`${BASE}/reports/timesheet-detail`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const filterBar = page.locator('main');
const body = await filterBar.innerText();

/*
 * Precondition, stated rather than failed past: the server's reporting
 * composition builds the protected export storage eagerly, so every
 * `/api/reporting` request answers 503 until a private export bucket is
 * configured (`S3_BUCKET` / `EXPORT_S3_BUCKET`). That is a Backend Phase 6
 * deployment requirement, unrelated to the department filter — but it does mean
 * this probe cannot see the filter in this environment, and a pass must not be
 * claimed from it.
 */
if (/Report unavailable|could not be loaded/i.test(body)) {
  console.log('SKIP | the server reporting module is unavailable in this environment');
  console.log('     | /api/reporting answers 503 because the private export bucket is not configured.');
  console.log('     | Until a bucket exists, the department filter is covered by');
  console.log('     | src/server/reporting/reporting.integration.test.ts and');
  console.log('     | src/features/reports/department-filter.test.tsx.');
  await context.close();
  await browser.close();
  process.exit(2);
}

check('the report page loaded from the server', /Filters/.test(body), body.slice(0, 160).replace(/\n/g, ' '));

/* The filter is a generic multi-select, labelled by the server's definition. */
const department = page.getByRole('button', { name: /^Department/ });
const present = (await department.count()) > 0;
check('a Department filter is offered on the report', present);

if (present) {
  await department.first().click();
  await page.waitForTimeout(600);
  const options = await page.getByRole('option').allInnerTexts().catch(() => []);
  const checkboxes = await page.locator('[role="dialog"] label, [role="menu"] label').allInnerTexts().catch(() => []);
  const labels = [...options, ...checkboxes].join(' | ');
  check(
    'the options name their division, because a department name is unique only inside one',
    /·/.test(labels),
    labels.slice(0, 200),
  );

  /* Apply the first option and confirm the report answers rather than errors. */
  const first = page.locator('[role="dialog"] input[type="checkbox"], [role="menu"] input[type="checkbox"]').first();
  if ((await first.count()) > 0) {
    await first.check();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2500);
    const after = await filterBar.innerText();
    check(
      'filtering by department returns a report rather than a failure',
      !/could not be loaded|unavailable|not available/i.test(after),
      after.slice(0, 200).replace(/\n/g, ' '),
    );
  }
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors[0] ?? '');

await context.close();
await browser.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
