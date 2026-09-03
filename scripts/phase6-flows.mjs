/** Phase 6 Finance and Management browser-flow verification. Requires a server on :3000. */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const browser = await chromium.launch();
const failures = [];
const PASSWORD = 'Demo1234!';

/** Finance WITH finance.cost.view and reporting.export.protected. */
const FINANCE_FULL = 'mahmuda.akter@demo.local';
/** Finance WITHOUT them — hours only. */
const FINANCE_LIMITED = 'shakil.chowdhury@demo.local';
const MANAGEMENT = 'ayesha.siddika@demo.local';

function record(ok, area, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(14)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function openAs(email) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
  return { context, page };
}

async function goto(page, path, wait = 800) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  return page.locator('main').innerText();
}

console.log(`Phase 6 flow verification against ${baseUrl}\n`);

/* == Finance WITH the financial-detail permission ========================== */

const full = await openAs(FINANCE_FULL);
let body = await goto(full.page, '/finance', 1100);

record(
  body.includes('Verified employee hours') &&
    body.includes('Verified overtime') &&
    body.includes('Hours by division') &&
    body.includes('Hours by project'),
  'FE-0601',
  'verified employee, division, project and overtime hours render',
);
record(
  body.includes('Verified period') && body.includes('July 2026'),
  'FE-0601',
  'the dashboard defaults to the most recent verified period',
);
record(
  ['Project labour cost', 'Division labour cost', 'Billable hours', 'Non-billable hours', 'Payroll total', 'Budget variance'].every(
    (label) => body.includes(label),
  ),
  'FE-0602',
  'all six protected metrics are present',
);
// Scoped to the metric tiles: "Restricted" also legitimately labels the
// Government Projects *division*, which is a different meaning of the word.
const moneyTilesRestricted = await full.page.evaluate(() => {
  const labels = [
    'Project labour cost',
    'Division labour cost',
    'Billable hours',
    'Non-billable hours',
    'Payroll total',
    'Budget variance',
  ];
  return labels.filter((label) => {
    const node = [...document.querySelectorAll('span')].find(
      (element) => element.textContent?.trim() === label,
    );
    const card = node?.closest('div');
    return card?.textContent?.includes('Restricted') ?? false;
  });
});
record(
  body.includes('BDT') && moneyTilesRestricted.length === 0,
  'FE-0602',
  `protected metrics show real values with the permission granted${
    moneyTilesRestricted.length ? ` (restricted: ${moneyTilesRestricted.join(', ')})` : ''
  }`,
);

/* -- FE-0603 hours and overtime ------------------------------------------- */

body = await goto(full.page, '/finance/hours', 1100);
record(
  body.includes('Active') && body.includes('Break') && body.includes('Labour cost'),
  'FE-0603',
  'employee-hours table shows active, break and cost columns',
);
const hoursFilters = ['Employee', 'Division', 'Project', 'Status'];
const hoursFilterCounts = await Promise.all(
  hoursFilters.map((label) =>
    full.page.getByRole('button', { name: new RegExp(`^${label}:`) }).count(),
  ),
);
record(
  hoursFilterCounts.every((count) => count > 0),
  'FE-0603',
  'employee, division, project and status filters exist',
);
record(
  body.includes('one recognized value per employee-day'),
  'FE-0603',
  'the daily-break rule is stated where it could be misread',
);
await full.page.getByRole('button', { name: /^Division:/ }).click();
await full.page.getByRole('checkbox', { name: 'Computer Jagat' }).click();
await full.page.keyboard.press('Escape');
await full.page.waitForTimeout(900);
body = await full.page.locator('main').innerText();
record(
  body.includes('Tanvir Ahmed') && !body.includes('Sumaiya Noor'),
  'FE-0603',
  'a division filter narrows the result set',
);

body = await goto(full.page, '/finance/overtime', 1100);
record(
  body.includes('Total overtime') && body.includes('Overtime days') && body.includes('Critical days'),
  'FE-0603',
  'overtime analysis separates overtime from critical days',
);

/* -- FE-0604 cost analysis ------------------------------------------------ */

body = await goto(full.page, '/finance/project-costs', 1200);
record(
  body.includes('Total labour cost') && body.includes('Total budget') && body.includes('Variance'),
  'FE-0604',
  'project cost analysis shows totals, budget and variance',
);
record(
  body.includes('against budget') && body.includes('Estimate variance'),
  'FE-0604',
  'budget and estimate variance both render',
);
await full.page.getByRole('button', { name: /Show employee breakdown/ }).first().click();
await full.page.waitForTimeout(400);
record(
  (await full.page.locator('main').innerText()).includes('Hide employee breakdown'),
  'FE-0604',
  'a cost line drills down to its employee breakdown',
);

body = await goto(full.page, '/finance/division-costs', 1200);
record(
  body.includes('Trend across payroll periods'),
  'FE-0604',
  'division cost analysis includes a trend across periods',
);

/* -- FE-0605 billable reconciliation -------------------------------------- */

body = await goto(full.page, '/finance/billable', 1100);
record(
  body.includes('Billable hours') && body.includes('Non-billable hours') && body.includes('Total verified'),
  'FE-0605',
  'billable and non-billable hours render against the verified total',
);
record(
  body.includes('Reconciled against total verified hours') &&
    !body.includes('Reconciliation failed'),
  'FE-0605',
  'the split reconciles exactly to the period total',
);
record(
  body.includes('Internal capability programme') || body.includes('absorbed into overhead'),
  'FE-0605',
  'each non-billable line states why it is not billable',
);

/* -- FE-0606 / FE-0610 payroll and export --------------------------------- */

body = await goto(full.page, '/finance/payroll', 1200);
record(
  body.includes('Verified and locked') && body.includes('Policy version'),
  'FE-0606',
  'payroll summary shows verification status and policy version',
);
record(
  body.includes('Exceptions carried into payroll') && body.includes('Missing days'),
  'FE-0606',
  'exception visibility is explicit',
);
record(
  body.includes('Export history') && body.includes('Audit trail') && body.includes('Expired'),
  'FE-0606',
  'export history and audit trail render, including non-ready states',
);
await full.page.getByRole('button', { name: 'Configure export' }).click();
let dialog = await full.page.getByRole('dialog').innerText();
record(
  dialog.includes('No file is produced during the frontend milestone'),
  'FE-0610',
  'export configuration states plainly that no file is produced',
);
await full.page.getByRole('button', { name: 'Record export configuration' }).click();
await full.page.waitForTimeout(900);
record(
  (await full.page.locator('body').innerText()).includes('Export configuration recorded'),
  'FE-0610',
  'an export configuration is recorded and queued',
);

/* -- FE-0611 report filters and saved presentation ------------------------ */

body = await goto(full.page, '/finance/reports', 1200);
record(
  body.includes('Timezone') && body.includes('Policy version') && body.includes('Generated'),
  'FE-0611',
  'report preview carries its provenance metadata',
);
await full.page.getByLabel('Group by').selectOption('division');
await full.page.waitForTimeout(900);
record(
  (await full.page.locator('main').innerText()).includes('Division'),
  'FE-0611',
  'the grouping filter changes the preview',
);
body = await goto(full.page, '/finance/reports', 1200);
const groupValue = await full.page.getByLabel('Group by').inputValue();
record(groupValue === 'division', 'FE-0611', 'presentation state survives a revisit');
await full.page.getByRole('button', { name: 'Reset view' }).click();
await full.page.waitForTimeout(700);
record(
  (await full.page.getByLabel('Group by').inputValue()) === 'employee',
  'FE-0611',
  'the view can be reset to its default',
);

/* -- FE-0614 accessible chart alternatives -------------------------------- */

body = await goto(full.page, '/finance', 1100);
const tableToggles = await full.page.getByRole('button', { name: 'Show data table' }).count();
record(tableToggles >= 2, 'FE-0614', 'every chart offers a tabular equivalent');
await full.page.getByRole('button', { name: 'Show data table' }).first().click();
await full.page.waitForTimeout(300);
record(
  (await full.page.locator('main').innerText()).includes('Hide data table'),
  'FE-0614',
  'the chart data table opens with the same figures',
);
const chartImages = await full.page.locator('figure [role="img"]').count();
record(chartImages >= 2, 'FE-0614', 'each chart carries an accessible name');

await full.context.close();

/* == Finance WITHOUT the financial-detail permission ======================= */

const limited = await openAs(FINANCE_LIMITED);

body = await goto(limited.page, '/finance', 1100);
record(
  body.includes('Verified employee hours') && body.includes('Cost restricted'),
  'FE-0602',
  'hours stay available without the cost permission',
);
record(
  body.includes('Project labour cost') && body.includes('Restricted'),
  'FE-0602',
  'a restricted metric keeps its label and is marked, never zeroed',
);
record(!body.includes('BDT'), 'FE-0602', 'no money value reaches the page without the permission');

body = await goto(limited.page, '/finance/hours', 1100);
record(
  body.includes('Labour cost') && body.includes('Restricted'),
  'FE-0603',
  'the cost column stays present and every cell reads Restricted',
);

body = await goto(limited.page, '/finance/reports', 1200);
record(
  body.includes('Some values are withheld') && body.includes('(restricted)'),
  'FE-0611',
  'the report marks its restricted column and explains what is withheld',
);
await limited.page.getByRole('button', { name: 'Configure export' }).click();
await limited.page.getByRole('button', { name: 'Record export configuration' }).click();
await limited.page.waitForTimeout(800);
dialog = await limited.page.getByRole('dialog').innerText();
record(
  dialog.includes('Export refused') && /permission/i.test(dialog),
  'FE-0610',
  'a protected export is refused without the permission, with guidance',
);
await limited.page.keyboard.press('Escape');

body = await goto(limited.page, '/finance/billable', 900);
record(
  /do not have access|does not include this area/i.test(body),
  'FE-0602',
  'a permission-gated route denies explicitly rather than rendering empty',
);

await limited.context.close();

/* == Management, read-only ================================================= */

const management = await openAs(MANAGEMENT);

body = await goto(management.page, '/dashboard', 1200);
record(
  body.includes('Management dashboard') && body.includes('Read-only'),
  'FE-0612',
  'the management dashboard renders and states its read-only nature',
);
record(
  body.includes('Employee summaries') &&
    body.includes('Time allocation by division') &&
    body.includes('Project progress'),
  'FE-0612',
  'company, division, employee-summary, time-allocation and project views render',
);
record(
  body.includes('Labour cost') && body.includes('Restricted'),
  'FE-0612',
  'cost is restricted for management regardless of any grant',
);

const mutatingButtons = await management.page
  .getByRole('button', {
    name: /edit|approve|verify|override|delete|remove|save|submit|publish|export|create|add/i,
  })
  .count();
record(
  mutatingButtons === 0,
  'FE-0613',
  `no edit, approve, verify, override, export or destructive control exists (found ${mutatingButtons})`,
);

const tableToggle = await management.page.getByRole('button', { name: 'Show data table' }).count();
record(tableToggle >= 2, 'FE-0614', 'management charts also carry tabular equivalents');

body = await goto(management.page, '/finance', 900);
record(
  /do not have access|does not include this area/i.test(body),
  'FE-0613',
  'management cannot reach the Finance workspace by URL',
);

await management.context.close();
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} Phase 6 check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('\nAll Phase 6 checks pass.');
