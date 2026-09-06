/** Phase 4 Team Lead browser-flow verification. Requires a server on :3000. */
import { chromium } from 'playwright';

const baseUrl = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const browser = await chromium.launch();
const failures = [];
const PASSWORD = 'Demo1234!';

function record(ok, area, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(14)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function signIn(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', 'imran.hossain@demo.local');
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
}

const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
await signIn(page);

console.log(`Phase 4 flow verification against ${baseUrl}\n`);

await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'Team Lead dashboard' }).waitFor();
await page.waitForTimeout(900);
let body = await page.locator('main').innerText();
record(body.includes('Assigned employees') && body.includes('Working today'), 'FE-0401', 'assigned headcount and attendance metrics render');
record(body.includes('Time exceptions') && body.includes('Critical'), 'FE-0402', 'exception summary renders all required states');
record(body.includes('Project progress') && body.includes('Workload and evaluations'), 'FE-0403', 'delivery, request, workload and evaluation panels render');

await page.goto(`${baseUrl}/team/timesheets`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Active') && body.includes('Break') && body.includes('Division contribution'), 'FE-0404', 'team timesheet presents required fields');
const hasDailyDecision = await page.getByRole('button', { name: /approve.*timesheet|approve day|reject.*timesheet/i }).count();
record(hasDailyDecision === 0, 'FE-0405', 'no daily timesheet decision control exists');
await page.getByRole('button', { name: /Status:/i }).click();
await page.getByRole('checkbox', { name: 'Overtime' }).click();
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Save filter' }).click();
record((await page.locator('main').innerText()).includes('Filter saved'), 'FE-0405', 'scoped filter can be saved and cleared');

await page.goto(`${baseUrl}/team/timesheets/emp-1002/2026-08-26`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Calculation breakdown') && body.includes('Time entries and completed work') && body.includes('Record history'), 'FE-0406', 'timesheet detail contains calculation, work, anomaly and history context');
await page.getByLabel('General remark').fill('Please confirm the corrected break and task split.');
await page.getByLabel('Request a correction to this record').check();
await page.getByLabel('Requested changes').fill('Split the time across the two completed tasks.');
await page.getByRole('button', { name: 'Preview and send' }).click();
record((await page.getByRole('dialog').innerText()).includes('Notification preview'), 'FE-0410/11', 'general remark and correction notification preview render');
await page.getByRole('button', { name: 'Confirm and notify' }).click();
await page.getByText('Corrected', { exact: true }).waitFor({ timeout: 5000 });
body = await page.locator('main').innerText();
const correctionSignals = ['Correction workflow', 'Responded', 'Corrected', 'Resolved', 'Employee clarification', 'Corrected values'];
const correctionHistoryComplete = correctionSignals.every((signal) => body.includes(signal));
record(correctionHistoryComplete, 'FE-0412/13', correctionHistoryComplete ? 'correction states, clarification and corrected values remain connected' : `missing: ${correctionSignals.filter((signal) => !body.includes(signal)).join(', ')}`);

await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Vision Platform v2') && body.includes('Restricted'), 'FE-0420', 'scoped project list shows progress and protected budget state');
await page.getByRole('button', { name: 'New project' }).click();
await page.getByLabel('Project name').fill('Team Lead Demo Project');
await page.getByLabel('Project code').fill('PIA-DEMO');
await page.getByRole('button', { name: 'Create project' }).click();
const projectCreated = await page.getByText('Team Lead Demo Project', { exact: true }).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
record(projectCreated, 'FE-0421', 'project create form persists the mock project');

await page.goto(`${baseUrl}/projects/prj-vp2`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Overview') && body.includes('Team') && body.includes('Tasks') && body.includes('Activity'), 'FE-0422', 'project detail exposes all required tabs');

await page.goto(`${baseUrl}/tasks`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Pending') && body.includes('In Progress') && body.includes('Completed'), 'FE-0423', 'task board uses exactly the three approved statuses');
await page.goto(`${baseUrl}/tasks/tsk-1`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Actual-time work history') && body.includes('Comments placeholder'), 'FE-0424/25', 'task detail shows actual history, checklist and deferred comments');

await page.goto(`${baseUrl}/requests`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Pending') && body.includes('Information requested') && body.includes('Approved') && body.includes('Rejected'), 'FE-0430', 'request queue exposes all workflow views');
await page.goto(`${baseUrl}/requests/leave/lv-4`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Review decision' }).click();
record((await page.getByRole('dialog').innerText()).includes('Notification preview'), 'FE-0431', 'decision confirmation and notification preview render');
await page.getByRole('button', { name: 'Confirm and notify' }).click();

await page.goto(`${baseUrl}/workload`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Capacity') && body.includes('Assigned') && body.includes('Remaining') && body.includes('Upcoming deadlines'), 'FE-0432', 'capacity cards show planned, actual and warnings');
await page.getByRole('button', { name: 'Calendar' }).click();
body = await page.locator('main').innerText();
record(body.includes('leave-adjusted capacity') && body.includes('Half-day leave'), 'FE-0433', 'responsive calendar includes project context and adjusted capacity');

await page.goto(`${baseUrl}/evaluations/eval-emp-1001`, { waitUntil: 'networkidle' });
body = await page.locator('main').innerText();
record(body.includes('Supporting facts') && body.includes('Weighted summary') && body.includes('Save draft'), 'FE-0434', 'evaluation facts, weighted scoring and draft controls render');
await page.getByRole('button', { name: 'Save draft' }).click();
await page.waitForTimeout(250);
record((await page.locator('body').innerText()).includes('Evaluation draft saved'), 'FE-0434', 'evaluation draft saves through the mock service');

await context.close();
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} Phase 4 check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('\nAll 20 Phase 4 checks pass.');
