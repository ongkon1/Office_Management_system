/** Task-based work audit for MFE-0409. Requires a running dev server. */
import { chromium } from 'playwright';

const baseUrl = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const browser = await chromium.launch();
const failures = [];
const record = (ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${detail}`);
  if (!ok) failures.push(detail);
};

async function signIn(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', 'nadia.rahman@demo.local');
  await page.fill('input[name="password"]', 'Demo1234!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
await signIn(page);

await page.goto(`${baseUrl}/tasks`, { waitUntil: 'networkidle' });
const taskCard = () => page.locator('[data-board-layout="desktop"] [data-task-id="tsk-9"]');
const pending = taskCard();
await pending.waitFor();
const beforeStart = await pending.innerText();

// Keyboard alternative: focus and activate Start without drag-and-drop.
await pending.getByRole('button', { name: 'Start' }).focus();
await page.keyboard.press('Enter');
await page.getByRole('dialog').waitFor();
await page.getByRole('dialog').getByRole('button', { name: 'Start', exact: true }).click();
await page.getByText('Task status updated').waitFor();
await page.getByRole('button', { name: 'Done' }).click();
await page.waitForTimeout(500);
const started = taskCard();
const afterStart = await started.innerText();
const actualBefore = beforeStart.match(/Actual\s+([^\s]+)/)?.[1];
const actualAfter = afterStart.match(/Actual\s+([^\s]+)/)?.[1];
record(actualBefore === actualAfter, 'a keyboard task start creates no active minutes');

await started.getByRole('link', { name: 'Log work' }).click();
await page.getByRole('dialog', { name: 'Log work' }).waitFor();
await page.fill('input[name="durationMinutes"]', '0:15');
await page.fill('textarea[name="workDescription"]', 'Reviewed the retention requirements.');
await page.fill('textarea[name="completedWork"]', 'Documented the first retention decision.');
await page.getByRole('button', { name: 'Save work log' }).click();
await page.getByRole('dialog', { name: 'Log work' }).waitFor({ state: 'hidden' });

await page.getByRole('link', { name: 'My Tasks', exact: true }).click();
await page.waitForLoadState('networkidle');
const inProgress = taskCard();
await inProgress.getByRole('button', { name: 'Complete' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Complete', exact: true }).click();
await page.getByText('Task status updated').waitFor();
await page.getByRole('button', { name: 'Done' }).click();
await page.waitForTimeout(500);
const completed = taskCard();
record((await completed.getByRole('link', { name: 'Log work' }).count()) === 0, 'a completed task offers no Log Work action');

await completed.getByRole('button', { name: 'Reopen' }).focus();
await page.keyboard.press('Enter');
const reopen = page.getByRole('dialog');
await reopen.getByLabel('Reason').fill('Additional retention evidence must be reviewed.');
await reopen.getByRole('button', { name: 'Reopen', exact: true }).click();
await page.getByText('Task status updated').waitFor();
record(true, 'start → log → complete → reopen succeeds with keyboard-reachable actions');

// A known completed task cannot be selected for a new log.
const refusal = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await signIn(refusal);
await refusal.goto(`${baseUrl}/timesheets/2026-09-02?task=tsk-8`, { waitUntil: 'networkidle' });
await refusal.getByRole('dialog', { name: 'Log work' }).waitFor();
const completedOption = await refusal.locator('select[name="taskId"] option[value="tsk-8"]').count();
const guidance = await refusal.getByRole('dialog').innerText();
record(completedOption === 0 && /only assigned In Progress tasks/i.test(guidance), 'a completed task is refused by the Log Work selector');

await refusal.goto(`${baseUrl}/timesheets/2026-09-01`, { waitUntil: 'networkidle' });
const completeDay = await refusal.locator('main').innerText();
record(
  /Active work[\s\S]{0,40}7:00/.test(completeDay) &&
    /Daily total[\s\S]{0,40}8:00/.test(completeDay) &&
    completeDay.includes('Complete') &&
    ['PowerInAI', 'Government Projects', 'WesternCF'].every((name) => completeDay.includes(name)),
  '7:00 across three divisions plus one break classifies as Complete',
);

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} task-work audit failure(s).`);
  process.exit(1);
}
console.log('\nTask-work audit passed.');
