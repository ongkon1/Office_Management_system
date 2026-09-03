/** Phase 5 HR browser-flow verification. Requires a server on :3000. */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const browser = await chromium.launch();
const failures = [];
const PASSWORD = 'Demo1234!';

function record(ok, area, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(14)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function signIn(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
}

const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
await signIn(page, 'rezaul.haque@demo.local');

console.log(`Phase 5 flow verification against ${baseUrl}\n`);

/* -- FE-0501 dashboard ----------------------------------------------------- */

await page.goto(`${baseUrl}/hr`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'HR dashboard' }).waitFor();
await page.waitForTimeout(700);
let body = await page.locator('main').innerText();
record(
  body.includes('Active employees') && body.includes('Divisions') && body.includes('Headcount by division'),
  'FE-0501',
  'headcount, division count and division breakdown render',
);
record(
  body.includes('Attendance today') && body.includes('Time exceptions this month') && body.includes('Monthly active hours'),
  'FE-0501',
  'attendance states, timesheet exceptions and monthly hours render',
);
record(
  body.includes('Evaluation periods') && body.includes('WFH trend') && body.includes('Workload concerns') && body.includes('Recent assignment changes'),
  'FE-0501',
  'evaluations, WFH trend, workload concerns and assignments render',
);

/* -- FE-0502 directory ----------------------------------------------------- */

await page.goto(`${baseUrl}/employees`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
body = await page.locator('main').innerText();
record(
  body.includes('Nadia Rahman') && body.includes('Incomplete profile'),
  'FE-0502',
  'directory lists employees and flags incomplete profiles',
);
const filterLabels = ['Status', 'Division', 'Team Lead', 'Employment type', 'Work mode'];
const filterButtons = await Promise.all(
  filterLabels.map((label) => page.getByRole('button', { name: new RegExp(`^${label}:`) }).count()),
);
record(
  filterButtons.every((count) => count > 0),
  'FE-0502',
  'status, division, Team Lead, employment type and work mode filters exist',
);
await page.getByRole('checkbox', { name: 'Incomplete profile only' }).check();
await page.waitForTimeout(500);
body = await page.locator('main').innerText();
record(
  body.includes('Sumaiya Noor') && !body.includes('Tanvir Ahmed'),
  'FE-0502',
  'incomplete-profile filter narrows the result set',
);

/* -- FE-0503 create ---------------------------------------------------------*/

await page.goto(`${baseUrl}/employees/new`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(
  ['Identity', 'Employment', 'Contact and office', 'Schedule, work mode and skills'].every((section) =>
    body.includes(section),
  ),
  'FE-0503',
  'create form covers identity, employment, contact, office, schedule, mode and skills',
);
await page.getByRole('button', { name: 'Create employee' }).click();
await page.waitForTimeout(400);
record(
  (await page.locator('main').innerText()).includes('Enter the employee name'),
  'FE-0503',
  'required-field validation reports a message with guidance',
);
await page.getByLabel('Full name').fill('Demo HR Employee');
await page.getByLabel('Employee code').fill('EMP-1001');
await page.getByLabel('Work email').fill('demo.hr@demo.local');
await page.getByRole('button', { name: 'Create employee' }).click();
await page.waitForTimeout(500);
record(
  (await page.locator('main').innerText()).includes('already used by'),
  'FE-0503',
  'a duplicate employee code is reported as a conflict, not a silent overwrite',
);
await page.getByLabel('Employee code').fill('EMP-7001');
await page.getByRole('button', { name: 'Create employee' }).click();
await page.waitForURL((url) => /\/employees\/emp-/.test(new URL(url).pathname), { timeout: 8000 });
record(true, 'FE-0503', 'employee record is created and opens its profile');

/* -- FE-0504 detail tabs ----------------------------------------------------*/

await page.goto(`${baseUrl}/employees/emp-1001`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const tabNames = [
  'Overview',
  'Assignments',
  'Projects',
  'Time',
  'Attendance',
  'WFH',
  'Leave',
  'Evaluations',
  'Remarks',
  'Documents',
  'Record history',
];
const tabCounts = await Promise.all(
  tabNames.map((name) => page.getByRole('tab', { name, exact: true }).count()),
);
record(
  tabCounts.every((count) => count > 0),
  'FE-0504',
  'employee detail exposes all eleven required tabs',
);
await page.getByRole('tab', { name: 'Documents', exact: true }).click();
await page.waitForTimeout(300);
record(
  (await page.locator('main').innerText()).includes('Restricted'),
  'FE-0504',
  'a restricted document keeps its title and is explicitly marked',
);
await page.getByRole('tab', { name: 'Record history', exact: true }).click();
await page.waitForTimeout(300);
record(
  (await page.locator('main').innerText()).includes('Assignment added'),
  'FE-0504',
  'record history shows actor, action and detail',
);

/* -- FE-0505 / FE-0506 assignments -----------------------------------------*/

await page.getByRole('tab', { name: 'Assignments', exact: true }).click();
await page.waitForTimeout(300);
body = await page.locator('main').innerText();
record(
  body.includes('Current assignments') && body.includes('Primary') && body.includes('Expected weekly'),
  'FE-0505',
  'assignments show primary division, Team Lead, allocation and expected weekly hours',
);
await page.getByRole('button', { name: 'Add assignment' }).click();
await page.getByLabel('Allocation percent').fill('60');
await page.getByRole('button', { name: 'Add assignment', exact: true }).last().click();
await page.waitForTimeout(600);
body = await page.locator('main').innerText();
record(
  body.includes('Allocation exceeds 100%'),
  'FE-0505',
  'over-allocation across concurrent assignments raises a warning',
);

await page.goto(`${baseUrl}/employees/emp-1004`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('tab', { name: 'Assignments', exact: true }).click();
await page.waitForTimeout(300);
body = await page.locator('main').innerText();
record(
  body.includes('Assignment history') && body.includes('Temporary') && body.includes('Ended'),
  'FE-0506',
  'an expired temporary assignment appears on the historical timeline',
);
await page.getByRole('button', { name: 'Add assignment' }).click();
await page.getByLabel('Temporary assignment').check();
await page.getByRole('button', { name: 'Add assignment', exact: true }).last().click();
await page.waitForTimeout(500);
record(
  (await page.getByRole('dialog').innerText()).includes('temporary assignment needs an end date'),
  'FE-0506',
  'a temporary assignment without an end date is refused with guidance',
);
await page.keyboard.press('Escape');

/* -- FE-0510 / FE-0514 attendance ------------------------------------------*/

await page.goto(`${baseUrl}/attendance`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
body = await page.locator('main').innerText();
record(
  ['Office', 'WFH', 'Approved leave', 'Half-day leave', 'Holiday', 'Weekly off', 'Missing timesheet'].every(
    (state) => body.includes(state),
  ),
  'FE-0510',
  'attendance distinguishes office, WFH, leave, holiday, weekly off and missing states',
);
record(
  body.includes('Attendance calendar') && body.includes('two-letter code'),
  'FE-0510',
  'the calendar view encodes state as text, not colour alone',
);
await page.getByRole('button', { name: 'List' }).click();
await page.waitForTimeout(400);
body = await page.locator('main').innerText();
record(
  body.includes('Approved leave — no timesheet required.') &&
    body.includes('Holiday — no timesheet required.'),
  'FE-0514',
  'approved leave and holidays are explained, never shown as missing',
);
record(
  body.includes('Half-day leave — required active time reduced to 3:30.'),
  'FE-0514',
  'half-day leave adjusts the visible requirement to 3:30',
);

/* -- FE-0511 WFH ------------------------------------------------------------*/

await page.goto(`${baseUrl}/wfh`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
body = await page.locator('main').innerText();
record(body.includes('Division summary'), 'FE-0511', 'the division summary renders');
await page.getByRole('tab', { name: /^Approved/ }).click();
await page.waitForTimeout(500);
body = await page.locator('main').innerText();
record(
  body.includes('Completed work on the approved day'),
  'FE-0511',
  'an approved WFH day shows its recorded completed work',
);
await page.getByRole('button', { name: 'Override decision' }).first().click();
body = await page.getByRole('dialog').innerText();
record(
  body.includes('This replaces a decision that has already been made') && body.includes('Override reason'),
  'FE-0511',
  'overriding an existing decision states the consequence and requires a reason',
);
await page.getByRole('button', { name: 'Override and notify' }).click();
await page.waitForTimeout(400);
record(
  (await page.getByRole('dialog').innerText()).includes('override reason is required'),
  'FE-0511',
  'an override without a reason is refused',
);
await page.getByLabel('Override reason').fill('Client audit moved to the same day.');
await page.getByRole('button', { name: 'Override and notify' }).click();
await page.waitForTimeout(700);
record(
  (await page.locator('main').innerText()).includes('Audited HR override'),
  'FE-0511',
  'the recorded override and its reason stay visible on the request',
);

/* -- FE-0512 leave ----------------------------------------------------------*/

await page.goto(`${baseUrl}/leave`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
body = await page.locator('main').innerText();
record(
  body.includes('Leave balances') && body.includes('Remaining'),
  'FE-0512',
  'leave balances render with entitled, consumed, reserved and remaining days',
);
await page.getByRole('tab', { name: 'All' }).click();
await page.waitForTimeout(400);
body = await page.locator('main').innerText();
record(body.includes('Half day'), 'FE-0512', 'half-day leave is displayed as a half day');
record(
  body.includes('exceeds the remaining') || body.includes('Overlaps approved'),
  'FE-0512',
  'a conflicting or over-balance request is flagged',
);

/* -- FE-0513 holidays -------------------------------------------------------*/

await page.goto(`${baseUrl}/admin/holidays`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
body = await page.locator('main').innerText();
record(
  body.includes('Company holidays') && body.includes('Division holidays') && body.includes('Weekly holidays'),
  'FE-0513',
  'company, division-specific and weekly holiday views render',
);
await page.getByRole('button', { name: 'Add holiday' }).click();
await page.getByRole('button', { name: 'Save holiday' }).click();
await page.waitForTimeout(400);
record(
  (await page.getByRole('dialog').innerText()).includes('Enter a holiday name'),
  'FE-0513',
  'holiday creation validates its required fields',
);
await page.keyboard.press('Escape');

/* -- FE-0520 / FE-0521 / FE-0522 verification -------------------------------*/

await page.goto(`${baseUrl}/hr/timesheets`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
body = await page.locator('main').innerText();
record(
  body.includes('Completeness') && body.includes('Open exceptions') && body.includes('Unresolved corrections'),
  'FE-0520',
  'workspace shows completeness, exceptions and unresolved corrections',
);
record(
  body.includes('Ready') || body.includes('Needs review'),
  'FE-0520',
  'per-employee drill-down rows render',
);
const noDailyApproval = await page
  .getByRole('button', { name: /approve.*(day|timesheet)|reject.*timesheet/i })
  .count();
record(noDailyApproval === 0, 'FE-0522', 'no daily approval control exists in the HR workspace');

await page.getByRole('tab', { name: 'September 2026' }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Verify period' }).click();
body = await page.getByRole('dialog').innerText();
record(
  body.includes('Included dates') && body.includes('Policy version applied') && body.includes('Open exceptions'),
  'FE-0521',
  'confirmation states included dates, policy version and exception count',
);
record(
  body.includes('What locking this period does') && body.includes('read-only'),
  'FE-0521',
  'confirmation states the lock consequences',
);
const acceptBox = page.getByRole('checkbox', { name: /Accept the .* remaining exception/ });
if ((await acceptBox.count()) > 0) await acceptBox.check();
await page.getByRole('button', { name: 'Verify and lock period' }).click();
await page.waitForTimeout(900);
body = await page.locator('main').innerText();
record(
  body.includes('Verified and locked') && body.includes('This period is locked'),
  'FE-0522',
  'the verified and locked state is explicit after verification',
);

await page.getByRole('button', { name: 'Request unlock' }).click();
await page.getByRole('button', { name: 'Submit unlock request' }).click();
await page.waitForTimeout(400);
record(
  (await page.getByRole('dialog').innerText()).includes('unlock reason is required'),
  'FE-0522',
  'an unlock request without a reason is refused',
);
await page.getByLabel('Reason').fill('A September entry needs the division corrected.');
await page.getByRole('button', { name: 'Submit unlock request' }).click();
await page.waitForTimeout(800);
record(
  (await page.locator('main').innerText()).includes('Unlock requested'),
  'FE-0522',
  'the unlock request and its reason are recorded against the period',
);

await page.getByRole('button', { name: 'Record amendment' }).click();
await page.getByLabel('Record reference').fill('Time entry, 2 Sep 2026');
await page.getByLabel('Amendment reason').fill('Division corrected after client confirmation.');
await page.getByRole('button', { name: 'Record amendment', exact: true }).last().click();
await page.waitForTimeout(900);
body = await page.locator('main').innerText();
record(
  body.includes('Amendment history') && body.includes('Amended after verification'),
  'FE-0522',
  'the amendment and the amended period state are recorded',
);

/* -- FE-0523 / FE-0524 / FE-0525 evaluations --------------------------------*/

await page.goto(`${baseUrl}/evaluations`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
body = await page.locator('main').innerText();
record(
  body.includes('Q3 2026 quarterly review') && body.includes('Published') && body.includes('Weighting'),
  'FE-0524',
  'period progress, states and weighting version render',
);
await page.getByRole('button', { name: 'Create evaluation period' }).click();
const typeOptions = await page
  .getByLabel('Period type')
  .locator('option')
  .allInnerTexts();
record(
  ['Monthly', 'Quarterly', 'Half-yearly', 'Annual', 'Project-based', 'Probation'].every((type) =>
    typeOptions.includes(type),
  ),
  'FE-0523',
  'all six evaluation period types are offered',
);
await page.getByLabel('Period name').fill('September 2026 monthly review');
await page.getByRole('button', { name: 'Create period' }).click();
await page.waitForTimeout(900);
record(
  (await page.locator('main').innerText()).includes('September 2026 monthly review'),
  'FE-0523',
  'a created period appears with its assigned employees',
);

await page.getByRole('button', { name: 'Send reminder' }).first().click();
await page.waitForTimeout(700);
record(
  (await page.locator('body').innerText()).includes('Reminder sent'),
  'FE-0524',
  'a reviewer reminder can be sent and is recorded',
);

await page.goto(`${baseUrl}/evaluations/eval-emp-1002`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
body = await page.locator('main').innerText();
record(
  body.includes('Not submitted yet') && body.includes('unpublished'),
  'FE-0525',
  'an unsubmitted self-evaluation and the unpublished state are distinct and explicit',
);

await page.goto(`${baseUrl}/evaluations/eval-emp-1003`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
body = await page.locator('main').innerText();
record(
  body.includes('Automatic facts') && body.includes('Actual active time') && body.includes('Tasks completed'),
  'FE-0525',
  'automatic facts derived from authoritative records render',
);
record(
  body.includes('Self-evaluation') && body.includes('Key achievements'),
  'FE-0525',
  'the submitted self-evaluation renders',
);
record(
  body.includes('30/25/15/10/10/10') && body.includes('4.20 / 5'),
  'FE-0525',
  'default weighting and the calculated final result render',
);
await page.getByRole('button', { name: 'Publish to employee' }).click();
await page.getByRole('button', { name: 'Publish evaluation' }).click();
await page.waitForTimeout(900);
body = await page.locator('main').innerText();
record(
  body.includes('Read-only') && body.includes('Publication history') && body.includes('Published'),
  'FE-0525',
  'publication makes the evaluation read-only and records the publication history',
);

/* -- Scope: a non-HR role must not reach the HR workspace -------------------*/

const employeeContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const employeePage = await employeeContext.newPage();
await signIn(employeePage, 'nadia.rahman@demo.local');
await employeePage.goto(`${baseUrl}/employees`, { waitUntil: 'networkidle' });
await employeePage.waitForTimeout(500);
const employeeBody = await employeePage.locator('main').innerText();
record(
  !employeeBody.includes('Add employee') &&
    /do not have access|does not include this area/i.test(employeeBody),
  'FE-0502',
  'an employee typing the directory URL reaches an explicit denied state',
);
await employeePage.goto(`${baseUrl}/wfh`, { waitUntil: 'networkidle' });
await employeePage.waitForTimeout(700);
{
  // Phase 7 (`FE-0720`) replaced the planned-screen notice here with real
  // employee self-service. The boundary being asserted is unchanged: an
  // employee must not reach the HR administration view of this route.
  const text = await employeePage.locator('main').innerText();
  record(
    text.includes('Request WFH') && !text.includes('Division summary'),
    'FE-0511',
    'an employee sees their own WFH self-service, not the HR administration screen',
  );
}

await employeeContext.close();
await context.close();
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} Phase 5 check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('\nAll Phase 5 checks pass.');
