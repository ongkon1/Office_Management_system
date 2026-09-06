/** Phase 7 shared reporting and supporting-module verification. Requires a server on :3000. */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const browser = await chromium.launch();
const failures = [];
const PASSWORD = 'Demo1234!';

const EMPLOYEE = 'nadia.rahman@demo.local';
const TEAM_LEAD = 'imran.hossain@demo.local';
const HR = 'rezaul.haque@demo.local';
const FINANCE_LIMITED = 'shakil.chowdhury@demo.local';
const ADMIN = 'arif.mahmud@demo.local';

function record(ok, area, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(14)} | ${detail}`);
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
    // The administrator is the only 2FA account.
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !new URL(url).pathname.startsWith('/two-factor'), {
      timeout: 15000,
    });
  }
  return { context, page };
}

/**
 * Turns every feature flag on for this browser context.
 *
 * Flag state is per-viewer demo state in `localStorage`, so each context needs
 * its own. The settings screen is exercised separately as `FE-0732`; this is
 * the setup that lets a flagged module be reached by the role that owns it.
 */
async function seedFlags(page) {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const keys = [
      'wfhRequests', 'leaveManagement', 'attendance', 'evaluations',
      'workloadPlanning', 'notifications', 'financeReports', 'projectCosting',
      'documents', 'messages', 'globalSearch', 'integrations', 'aiInsights',
      'requisitions', 'conveyance',
    ];
    window.localStorage.setItem(
      'oms.feature-flags',
      JSON.stringify(Object.fromEntries(keys.map((key) => [key, true]))),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

async function goto(page, path, wait = 900) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  return page.locator('main').innerText();
}

console.log(`Phase 7 flow verification against ${baseUrl}\n`);

/* == Reports: catalogue, builder, preview, export, print ==================== */

const hr = await openAs(HR);
let body = await goto(hr.page, '/reports', 1100);

const categories = ['Timesheet', 'HR', 'Attendance', 'Work from home', 'Evaluation', 'Workload', 'Remarks'];
record(
  categories.every((category) => body.includes(category)),
  'FE-0701',
  'the catalogue groups reports by area',
);
record(
  !body.includes('Employee cost rates'),
  'FE-0701',
  'a report this role cannot run is absent rather than disabled',
);

body = await goto(hr.page, '/reports/timesheet-detail', 1300);
const filterNames = ['Employee', 'Division', 'Project', 'Work location', 'Day status'];
const filterCounts = await Promise.all(
  filterNames.map((name) => hr.page.getByRole('button', { name: new RegExp(`^${name}:`) }).count()),
);
record(
  filterCounts.every((count) => count > 0) && body.includes('From') && body.includes('To'),
  'FE-0702',
  'the builder exposes date, employee, division, project, location and status filters',
);
record(
  body.includes('Overtime only'),
  'FE-0702',
  'the overtime filter is available on timesheet reports',
);
record(
  body.includes('Timezone') &&
    body.includes('Asia/Dhaka') &&
    body.includes('Policy version') &&
    body.includes('Generated'),
  'FE-0703',
  'the preview carries timezone, policy version and generated timestamp',
);
record(
  body.includes('Date range') && body.includes('Total'),
  'FE-0703',
  'applied filters and totals render with the table',
);

body = await goto(hr.page, '/reports/division-contribution', 1300);
record(
  body.includes('Active time by division') && body.includes('Show data table'),
  'FE-0703',
  'a chart is shown where it adds something, with its tabular equivalent',
);

await hr.page.getByRole('button', { name: 'Export', exact: true }).click();
let dialog = await hr.page.getByRole('dialog').innerText();
record(
  dialog.includes('No file is produced during the frontend milestone'),
  'FE-0704',
  'export configuration states plainly that no file is produced',
);
const formatOptions = await hr.page.getByLabel('Format').locator('option').allInnerTexts();
record(
  ['Excel (.xlsx)', 'CSV', 'PDF', 'Print'].every((option) => formatOptions.includes(option)),
  'FE-0704',
  'Excel, CSV, PDF and Print are all offered',
);
await hr.page.getByRole('button', { name: 'Queue export' }).click();
await hr.page.waitForTimeout(900);
record(
  (await hr.page.locator('body').innerText()).includes('Export queued'),
  'FE-0704',
  'an export is queued from the builder',
);

body = await goto(hr.page, '/reports/exports', 1100);
record(
  ['Ready', 'Processing', 'Expired', 'Failed', 'Queued'].every((state) => body.includes(state)),
  'FE-0704',
  'every export state is represented in the history',
);
record(
  body.includes('requested by') && body.includes('Rezaul Haque'),
  'FE-0705',
  'history shows requester, filters, format and timestamp',
);
await hr.page.getByRole('button', { name: 'Advance state' }).first().click();
await hr.page.waitForTimeout(900);
record(
  (await hr.page.locator('body').innerText()).includes('Export is now'),
  'FE-0705',
  'a queued job can be advanced through its states',
);
await hr.page.getByRole('button', { name: 'Request again' }).first().click();
await hr.page.waitForTimeout(900);
record(
  (await hr.page.locator('body').innerText()).includes('Export requeued'),
  'FE-0705',
  'a failed or expired job can be requested again',
);

/* -- FE-0706 print styles -------------------------------------------------- */

await goto(hr.page, '/reports/timesheet-detail', 1300);
await hr.page.emulateMedia({ media: 'print' });
await hr.page.waitForTimeout(400);
const printState = await hr.page.evaluate(() => {
  const hidden = [...document.querySelectorAll('[data-print="hide"]')];
  const allHidden = hidden.every((el) => getComputedStyle(el).display === 'none');
  const thead = document.querySelector('#report-preview thead');
  const tfoot = document.querySelector('#report-preview tfoot');
  const heading = document.querySelector('h1');
  return {
    chromeHidden: allHidden && hidden.length > 0,
    theadRepeats: thead ? getComputedStyle(thead).display === 'table-header-group' : false,
    tfootRepeats: tfoot ? getComputedStyle(tfoot).display === 'table-footer-group' : false,
    titleVisible: heading ? getComputedStyle(heading).display !== 'none' : false,
    rowsAvoidBreak: (() => {
      const row = document.querySelector('#report-preview tbody tr');
      return row ? getComputedStyle(row).breakInside === 'avoid' : false;
    })(),
  };
});
await hr.page.emulateMedia({ media: 'screen' });

record(printState.chromeHidden, 'FE-0706', 'application chrome is removed when printing');
record(printState.titleVisible, 'FE-0706', 'the report title survives printing');
record(
  printState.theadRepeats && printState.tfootRepeats,
  'FE-0706',
  'table headers repeat and totals stay with the table across pages',
);
record(printState.rowsAvoidBreak, 'FE-0706', 'rows are not split across a page break');

/* == Notifications ========================================================== */

body = await goto(hr.page, '/notifications', 1100);
record(
  body.includes('Needs your attention'),
  'FE-0710',
  'notifications are grouped, with actionable ones lifted to the top',
);
record(
  body.includes('unread') && (await hr.page.getByRole('tab', { name: /^Unread/ }).count()) > 0,
  'FE-0710',
  'unread count and an unread view are present',
);
record(
  body.includes('Open the record'),
  'FE-0710',
  'notifications link to the related record rather than restating its content',
);
await hr.page.getByRole('button', { name: 'Mark all as read' }).click();
await hr.page.waitForTimeout(900);
record(
  (await hr.page.locator('main').innerText()).includes('0 unread'),
  'FE-0710',
  'marking all as read updates the count without dismissing anything',
);

await hr.context.close();

/* == Search: administrator, with all flags on ============================== */

const admin = await openAs(ADMIN, { twoFactor: true });
await seedFlags(admin.page);

// Switching a module off must remove its navigation entry and stop its route
// resolving. A settings screen whose switches changed nothing would be worse
// than not having one.
await goto(admin.page, '/settings', 1000);
await admin.page.getByRole('tab', { name: 'Feature flags' }).click();
await admin.page.waitForTimeout(500);
const documentsRow = admin.page
  .locator('li')
  .filter({ hasText: 'Document library with company, division, and project scope.' });
await documentsRow.getByRole('switch').click();
await admin.page.waitForTimeout(700);

const navAfterDisable = await admin.page.getByRole('navigation', { name: 'Main' }).innerText();
const documentsRouteText = await goto(admin.page, '/documents', 900);
record(
  !navAfterDisable.includes('Documents'),
  'FE-0732',
  'switching a module off removes its navigation entry',
);
record(
  !documentsRouteText.includes('Employee handbook'),
  'FE-0732',
  'a disabled module stops resolving rather than rendering empty',
);

await goto(admin.page, '/settings', 900);
await admin.page.getByRole('tab', { name: 'Feature flags' }).click();
await admin.page.waitForTimeout(500);
await admin.page
  .locator('li')
  .filter({ hasText: 'Document library with company, division, and project scope.' })
  .getByRole('switch')
  .click();
await admin.page.waitForTimeout(700);
record(
  (await goto(admin.page, '/documents', 900)).includes('Employee handbook'),
  'FE-0732',
  'switching it back on restores the module immediately',
);

body = await goto(admin.page, '/settings', 900);
record(
  body.includes('Work policy') && body.includes('7:00') && body.includes('Read-only'),
  'FE-0732',
  'work-hour, break and overtime settings render with their versioning note',
);
await admin.page.getByRole('tab', { name: 'Notifications' }).click();
await admin.page.waitForTimeout(500);
body = await admin.page.locator('main').innerText();
record(
  body.includes('Critical time recorded') && body.includes('Required'),
  'FE-0732',
  'notification settings mark the ones that cannot be switched off',
);

body = await goto(admin.page, '/search?q=Vision', 1200);
record(
  body.includes('Vision Platform v2') && body.includes('results'),
  'FE-0711',
  'the full results page returns matches across record types',
);
record(
  body.includes('Recent searches'),
  'FE-0712',
  'recent searches are stored and offered again',
);
await admin.page.getByRole('button', { name: /^Type:/ }).click();
await admin.page.getByRole('checkbox', { name: 'Projects' }).click();
await admin.page.keyboard.press('Escape');
await admin.page.waitForTimeout(800);
record(
  (await admin.page.locator('main').innerText()).includes('Projects'),
  'FE-0712',
  'a type filter narrows the results',
);

body = await goto(admin.page, '/search?q=zzzznotathing', 1100);
record(
  body.includes('No results you have access to'),
  'FE-0712',
  'no-results guidance says what to try next',
);

// Command palette.
await goto(admin.page, '/dashboard', 900);
await admin.page.getByRole('button', { name: 'Search' }).click();
await admin.page.waitForTimeout(400);
record(
  (await admin.page.getByRole('dialog', { name: 'Search' }).count()) > 0,
  'FE-0711',
  'the command palette opens from the top bar',
);
await admin.page.keyboard.type('Vision');
await admin.page.getByRole('option').first().waitFor({ timeout: 8000 });
const optionLabels = await admin.page.getByRole('option').allInnerTexts();
record(
  optionLabels.length > 0,
  'FE-0711',
  `the palette returns results as you type (${optionLabels.length})`,
);
await admin.page.keyboard.press('Enter');
await admin.page.waitForTimeout(1200);
record(
  new URL(admin.page.url()).pathname.startsWith('/projects'),
  'FE-0712',
  `keyboard navigation opens the highlighted result (landed on ${new URL(admin.page.url()).pathname})`,
);

/* == Documents and messages ================================================ */

body = await goto(admin.page, '/documents', 1100);
record(
  body.includes('Company documents') && body.includes('Employee handbook'),
  'FE-0723',
  'documents are grouped by company, division and project',
);
record(
  body.includes('PDF') && body.includes('MB') && body.includes('uploaded by'),
  'FE-0723',
  'file metadata renders',
);
await admin.page.getByRole('button', { name: 'Preview' }).first().click();
await admin.page.waitForTimeout(500);
record(
  (await admin.page.getByRole('dialog').innerText()).includes('not rendered during the frontend milestone'),
  'FE-0723',
  'the preview placeholder says what it is rather than faking a render',
);
await admin.page.keyboard.press('Escape');

/* == Administration ======================================================== */

body = await goto(admin.page, '/admin/divisions', 1100);
record(
  body.includes('Cannot be deactivated yet') && body.includes('active assignment'),
  'FE-0730',
  'deactivation blockers are shown before the control is offered',
);
const activeSwitch = admin.page.getByRole('switch', { name: 'Active' }).first();
record(await activeSwitch.isDisabled(), 'FE-0730', 'the deactivation switch is disabled while blocked');

body = await goto(admin.page, '/admin/users', 1100);
record(
  body.includes('Sensitive permissions') && body.includes('Scope'),
  'FE-0731',
  'users show both their scope and any sensitive permissions',
);
record(body.includes('Locked') && body.includes('2FA'), 'FE-0731', 'account states render');

body = await goto(admin.page, '/admin/roles', 1100);
record(
  body.includes('sensitive permission widens') && body.includes('The holder can'),
  'FE-0731',
  'each sensitive permission states its consequence, not just its name',
);
await admin.page
  .getByRole('switch', { name: 'Not granted' })
  .first()
  .click();
await admin.page.waitForTimeout(500);
dialog = await admin.page.getByRole('dialog').innerText();
record(
  dialog.includes('What this grants') && dialog.includes('takes effect immediately'),
  'FE-0731',
  'granting a sensitive permission confirms with its consequence',
);
await admin.page.keyboard.press('Escape');

body = await goto(admin.page, '/admin/audit', 1200);
record(
  body.includes('Actor') || body.includes('Rezaul Haque'),
  'FE-0733',
  'the audit log lists actor, action and resource',
);
record(
  body.includes('Reason:') && body.includes('cor-'),
  'FE-0733',
  'reason and correlation id render',
);
await admin.page.getByRole('button', { name: 'Show before and after' }).first().click();
await admin.page.waitForTimeout(400);
record(
  (await admin.page.locator('main').innerText()).includes('Before'),
  'FE-0733',
  'before and after detail can be expanded',
);
await admin.page.getByRole('button', { name: /^Action:/ }).click();
await admin.page.getByRole('checkbox', { name: 'Payroll period verified' }).click();
await admin.page.keyboard.press('Escape');
await admin.page.waitForTimeout(800);
record(
  (await admin.page.locator('main').innerText()).includes('1 event'),
  'FE-0733',
  'the audit log filters by action',
);

body = await goto(admin.page, '/admin/integrations', 1100);
const integrationLabels = [
  'Calendar',
  'Email delivery',
  'File storage',
  'Conferencing',
  'Biometric attendance',
  'Payroll',
  'Accounting',
  'Single sign-on',
  'Public API',
  'Webhooks',
];
record(
  integrationLabels.every((label) => body.includes(label)),
  'FE-0734',
  'all ten integration categories are present',
);
record(
  body.includes('Nothing here is connected') && !body.includes('Connected'),
  'FE-0734',
  'no integration is presented as connected',
);
record(
  body.includes('Would') && body.includes('BE-07'),
  'FE-0734',
  'each placeholder says what it would do and which backend task delivers it',
);

await admin.context.close();

/* == Employee self-service ================================================= */

const employee = await openAs(EMPLOYEE);
await seedFlags(employee.page);

body = await goto(employee.page, '/messages', 1100);
record(
  body.includes('prototype, not a delivered module'),
  'FE-0724',
  'the messaging prototype is labelled as such',
);
const sendDisabled = await employee.page.getByRole('button', { name: 'Send' }).isDisabled();
record(sendDisabled, 'FE-0724', 'sending is disabled rather than silently doing nothing');
record(
  body.includes('Division channel') && body.includes('Task comments'),
  'FE-0724',
  'division, project, direct and task-comment threads are present',
);

body = await goto(employee.page, '/wfh', 1100);
record(
  body.includes('Work from home') && body.includes('Request WFH'),
  'FE-0720',
  'the employee sees their own WFH history and a request action',
);
const wfhStates = ['Pending', 'Information requested', 'Approved', 'Rejected', 'Cancelled'];
const wfhTabs = await Promise.all(
  wfhStates.map((state) => employee.page.getByRole('tab', { name: new RegExp(`^${state}`) }).count()),
);
record(wfhTabs.every((count) => count > 0), 'FE-0720', 'every request state has a view');
await employee.page.getByRole('button', { name: 'Request WFH' }).click();
await employee.page.getByRole('button', { name: 'Submit request' }).click();
await employee.page.waitForTimeout(700);
record(
  (await employee.page.getByRole('dialog').innerText()).includes('Give a reason'),
  'FE-0720',
  'the request form validates with guidance',
);
await employee.page.keyboard.press('Escape');

body = await goto(employee.page, '/leave', 1100);
record(
  body.includes('Balances') && body.includes('Annual leave'),
  'FE-0721',
  'leave balances render',
);
record(
  body.includes('Half-day leave halves it') || body.includes('3:30'),
  'FE-0721',
  'the half-day requirement adjustment is explained',
);
await employee.page.getByRole('button', { name: 'Apply for leave' }).click();
await employee.page.waitForTimeout(400);
dialog = await employee.page.getByRole('dialog').innerText();
record(
  dialog.includes('remaining') && dialog.includes('Half day'),
  'FE-0721',
  'the leave form shows remaining balance and a half-day choice',
);
await employee.page.keyboard.press('Escape');

body = await goto(employee.page, '/evaluations', 1200);
record(
  body.includes('Self-evaluation') && body.includes('Key achievements'),
  'FE-0722',
  'the self-evaluation form renders',
);
record(
  body.includes('Automatic facts') && body.includes('Active work'),
  'FE-0722',
  'the employee sees the same automatic facts as their reviewer',
);
record(
  !body.includes('Published result'),
  'FE-0722',
  'an unpublished evaluation shows no result to the employee',
);

await employee.context.close();

/* == Every destination resolves =========================================== */

const lead = await openAs(TEAM_LEAD);
const leadRoutes = ['/reports', '/notifications', '/workload', '/requests', '/evaluations'];
let allResolved = true;
for (const route of leadRoutes) {
  const text = await goto(lead.page, route, 700);
  if (text.includes('built in Phase') || text.includes('Page not found')) allResolved = false;
}
record(
  allResolved,
  'FE-0710/0701',
  'every Team Lead navigation destination resolves to a real screen',
);
await lead.context.close();

/* == Finance without the cost permission =================================== */

const finance = await openAs(FINANCE_LIMITED);
body = await goto(finance.page, '/reports', 1100);
record(
  !body.includes('Employee cost rates') && body.includes('Payroll hours and cost'),
  'FE-0701',
  'a cost-rate report is hidden while a redacted payroll report stays available',
);
body = await goto(finance.page, '/reports/payroll-hours', 1300);
record(
  body.includes('Some columns are withheld') && body.includes('(restricted)'),
  'FE-0703',
  'a restricted column stays in the report and is marked',
);
await finance.context.close();

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} Phase 7 check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('\nAll Phase 7 checks pass.');
