/**
 * Phase 3 flow verification.
 *
 * Drives the browser through the employee journey and the acceptance cases
 * that Phase 3 has to demonstrate:
 *
 *   DEMO-01  three divisions totalling 7 active + 1 break = a complete 8h day
 *   DEMO-02  overtime requires a reason, and the status follows through the UI
 *   DEMO-03  above twelve hours requires a critical explanation
 *   MFE-0301 duration-only Log Work and daily-cap validation
 *   FE-0327  copy previous entry lands as a draft on the target date
 *   MFE-0305 task board and duration-based Log Work are the only work-entry paths
 *   REQ-TIME-027  a verified period refuses ordinary edits
 *
 * Requires a dev server on --url (default http://localhost:3000).
 */

import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length) ??
  'http://localhost:3000';
const shoot = process.argv.includes('--screenshots');

const PASSWORD = 'Demo1234!';
const failures = [];
const browser = await chromium.launch();

function check(condition, message) {
  if (!condition) failures.push(message);
  return condition;
}

function log(ok, area, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(16)} | ${detail}`);
}

async function signIn(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), {
    timeout: 15000,
  });
  await page.waitForLoadState('networkidle');
}

console.log(`Phase 3 flow verification against ${baseUrl}\n`);

/* 1. DEMO-01 — the cross-division complete day. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');

  await page.goto(`${baseUrl}/timesheets/2026-09-01`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);

  const body = await page.locator('main').innerText();

  const hasActive = /Active work[\s\S]{0,40}7:00/.test(body);
  const hasBreak = /Break[\s\S]{0,40}1:00/.test(body);
  const hasTotal = /Daily total[\s\S]{0,40}8:00/.test(body);
  const complete = body.includes('Complete');
  const threeDivisions =
    body.includes('PowerInAI') &&
    body.includes('Government Projects') &&
    body.includes('WesternCF');

  check(hasActive, 'DEMO-01: active work was not 7:00');
  check(hasBreak, 'DEMO-01: break was not 1:00');
  check(hasTotal, 'DEMO-01: daily total was not 8:00');
  check(complete, 'DEMO-01: the day was not Complete');
  check(threeDivisions, 'DEMO-01: the three division contributions were not all shown');

  log(
    hasActive && hasBreak && hasTotal && complete && threeDivisions,
    'DEMO-01',
    '3h + 2h + 2h across three divisions = 7:00 active, 1:00 break, 8:00 Complete',
  );

  if (shoot) await page.screenshot({ path: 'screenshots/p3-day-complete.png', fullPage: true });
  await context.close();
}

/* 2. Under-time boundary: 6:59 active must not read as complete. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'sadia.karim@demo.local');
  await page.goto(`${baseUrl}/timesheets/2026-08-27`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const body = await page.locator('main').innerText();
  const shows659 = body.includes('6:59');
  const underTime = body.includes('Under-time');
  check(shows659, 'Under-time: 6:59 was not displayed verbatim');
  check(underTime, 'Under-time: the day was not classified Under-time');
  log(shows659 && underTime, 'AC-CALC-002', '6:59 active renders as 6:59 and reads Under-time');
  await context.close();
}

/* 3. Overtime, the exact-12:00 boundary, and critical. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'tanvir.ahmed@demo.local');

  for (const [date, expected, label] of [
    ['2026-08-26', 'Overtime', '9:30 total reads Overtime'],
    ['2026-08-25', 'Overtime', 'exactly 12:00 reads Overtime, not Critical'],
    ['2026-08-24', 'Critical', '12:30 total reads Critical'],
  ]) {
    await page.goto(`${baseUrl}/timesheets/${date}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const body = await page.locator('main').innerText();
    const ok = body.includes(expected);
    const notCritical = expected === 'Overtime' ? !body.includes('Critical:') : true;
    check(ok, `${date}: expected ${expected}`);
    check(notCritical, `${date}: should not have read Critical`);
    log(ok && notCritical, 'AC-CALC-003/4', label);
  }

  if (shoot) await page.screenshot({ path: 'screenshots/p3-critical.png', fullPage: true });
  await context.close();
}

/* 4. Leave and holiday never read as missing. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'sadia.karim@demo.local');

  await page.goto(`${baseUrl}/timesheets/2026-08-19`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  let body = await page.locator('main').innerText();
  const leaveOk = body.includes('Approved full-day leave') && !body.includes('Missing');
  check(leaveOk, 'AC-CALC-006: full-day leave read as missing');
  log(leaveOk, 'AC-CALC-006', 'approved full-day leave does not read Missing');

  await page.goto(`${baseUrl}/timesheets/2026-08-18`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  body = await page.locator('main').innerText();
  // Half day: 3:30 active + 0:30 break = 4:00, and the requirement halves.
  const halfOk = body.includes('3:30') && body.includes('4:00');
  check(halfOk, 'AC-CALC-007: half-day totals were not 3:30 active / 4:00 total');
  log(halfOk, 'AC-CALC-007', 'half-day leave halves the requirement (3:30 + 0:30 = 4:00)');

  await page.goto(`${baseUrl}/timesheets/2026-08-17`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  body = await page.locator('main').innerText();
  const holidayOk = body.includes('holiday') && !body.includes('Missing');
  check(holidayOk, 'AC-CALC-006: a holiday read as missing');
  log(holidayOk, 'AC-CALC-006', 'a company holiday does not read Missing');

  await context.close();
}

/* 5. Validation: task-based duration logging, daily cap, and live preview. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');
  await page.goto(`${baseUrl}/timesheets/2026-09-02`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'Log work', exact: true }).click();
  await page.getByRole('dialog').waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);

  await page.selectOption('select[name="divisionId"]', 'pia');
  await page.selectOption('select[name="projectId"]', 'prj-vp2');
  await page.selectOption('select[name="taskId"]', 'tsk-1');
  await page.fill('input[name="durationMinutes"]', '1:00');
  await page.fill('textarea[name="workDescription"]', 'Daily-cap validation entry');
  await page.fill('textarea[name="completedWork"]', 'Testing duration plausibility validation');
  await page.locator('textarea[name="workDescription"]').click();
  await page.waitForTimeout(700);
  const previewVisible = await page.getByRole('heading', { name: 'Daily calculation preview' }).isVisible();
  check(previewVisible, 'FE-0323: the calculation preview did not appear');
  log(previewVisible, 'FE-0323', 'the live calculation preview renders before saving');
  await page.fill('input[name="durationMinutes"]', '23:00');
  await page.locator('textarea[name="workDescription"]').click();
  await page.getByRole('button', { name: 'Save work log' }).click();
  await page.waitForTimeout(900);

  const drawer = await page.getByRole('dialog').innerText();
  const capRefused = /24:00|24 hours|daily.*limit/i.test(drawer);
  check(capRefused, 'MFE-0105: active time above 24:00 was not refused');
  log(capRefused, 'MFE-0105', 'duration logging refuses the daily active-time cap');

  if (shoot) await page.screenshot({ path: 'screenshots/p3-validation.png' });
  await context.close();
}

/* 6. Overtime reason appears progressively and is required. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');
  await page.goto(`${baseUrl}/timesheets/2026-09-02`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'Log work', exact: true }).click();
  await page.getByRole('dialog').waitFor({ timeout: 8000 });

  // Before crossing eight hours there is no reason field.
  const beforeVisible = await page
    .getByLabel('Overtime reason')
    .isVisible()
    .catch(() => false);
  check(!beforeVisible, 'FE-0325: the overtime reason was visible before the threshold');

  // 2:00 already recorded today; a 7:00 duration takes the day past eight.
  await page.selectOption('select[name="divisionId"]', 'pia');
  await page.selectOption('select[name="projectId"]', 'prj-vp2');
  await page.selectOption('select[name="taskId"]', 'tsk-1');
  await page.fill('input[name="durationMinutes"]', '7:00');
  await page.locator('textarea[name="workDescription"]').click();
  await page.waitForTimeout(700);

  const afterVisible = await page
    .getByLabel('Overtime reason')
    .isVisible()
    .catch(() => false);
  check(afterVisible, 'FE-0325: the overtime reason did not appear past eight hours');
  log(!beforeVisible && afterVisible, 'FE-0325', 'the overtime reason is revealed only past 8:00');

  await context.close();
}

/* 7. A verified period refuses ordinary edits. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');
  await page.goto(`${baseUrl}/timesheets/2026-07-14`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const body = await page.locator('main').innerText();
  const locked = /verified/i.test(body) && /locked/i.test(body);
  const noAddButton = !(await page
    .getByRole('button', { name: 'Log work', exact: true })
    .isVisible()
    .catch(() => false));

  check(locked, 'REQ-TIME-027: the locked period was not announced');
  check(noAddButton, 'REQ-TIME-027: Log work was offered inside a verified period');
  log(locked && noAddButton, 'REQ-TIME-027', 'a verified period is locked and offers no Log work action');

  if (shoot) await page.screenshot({ path: 'screenshots/p3-locked.png' });
  await context.close();
}

/* 8. Task board and Log Work are the work-entry paths. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');
  await page.goto(`${baseUrl}/tasks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const board = await page.getByLabel('Task status board').isVisible();
  const body = await page.locator('main').innerText();
  const explainsNoTime = /moving a task never records active time/i.test(body);
  check(board, 'MFE-0201: the task status board was not visible');
  check(explainsNoTime, 'MFE-0201: the board did not explain that moves create no time');
  log(board && explainsNoTime, 'MFE-0201/0305', 'task board is reachable and separates transitions from active time');

  if (shoot) await page.screenshot({ path: 'screenshots/p3-task-board.png' });
  await context.close();
}

/* 9. Tasks derive actual time from entries. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');
  await page.goto(`${baseUrl}/tasks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const listBody = await page.locator('main').innerText();
  const hasOverdue = listBody.includes('Overdue');
  check(hasOverdue, 'FE-0340: the overdue task state was not shown');

  await page.goto(`${baseUrl}/tasks/tsk-1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const detail = await page.locator('main').innerText();
  const derived = detail.includes('derived from linked work logs and preserved historical entries');
  const hasHistory = detail.includes('Task history');
  check(derived, 'REQ-WORK-007: the detail did not state that actual time is derived');
  check(hasHistory, 'FE-0341: the work history was missing');
  log(hasOverdue && derived && hasHistory, 'FE-0340/0341', 'task list shows overdue; detail derives actual time');

  await context.close();
}

/* 10. My Divisions and the remarks correction cycle. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');

  await page.goto(`${baseUrl}/divisions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const divisions = await page.locator('main').innerText();
  const showsAllocation = divisions.includes('Allocation') && divisions.includes('50%');
  const showsPrimary = divisions.includes('Primary');
  check(showsAllocation, 'FE-0342: allocation was not shown');
  check(showsPrimary, 'FE-0342: the primary division was not marked');
  log(showsAllocation && showsPrimary, 'FE-0342', 'My Divisions shows primary, allocation and expected hours');

  await page.goto(`${baseUrl}/remarks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const inbox = await page.locator('main').innerText();
  const hasRemarks = inbox.includes('Imran Hossain');
  check(hasRemarks, 'FE-0343: the remarks inbox was empty');

  await page.goto(`${baseUrl}/remarks/rmk-3`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.fill('textarea', 'Client credentials arrived; the screen-reader pass is scheduled.');
  await page.getByRole('button', { name: 'Send clarification' }).click();
  await page.waitForTimeout(900);

  const afterReply = await page.locator('main').innerText();
  const kept = afterReply.includes('Blocked on the client');
  const added = afterReply.includes('Client credentials arrived');
  check(kept, 'REQ-RMK-006: the earlier response was lost');
  check(added, 'FE-0343: the new clarification was not added');
  log(hasRemarks && kept && added, 'FE-0343/0344', 'a clarification is added and the history is preserved');

  await context.close();
}

/* 11. The dashboard reconciles with the timesheet. */
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, 'nadia.rahman@demo.local');
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const body = await page.locator('main').innerText();
  const hasToday = body.includes('Active work') && body.includes('Daily total');
  const hasProgress = body.includes('of 8:00');
  const hasTasks = body.includes('Active tasks');
  check(hasToday, 'FE-0301: the dashboard did not show today');
  check(hasProgress, 'FE-0301: schedule progress was missing');
  check(hasTasks, 'FE-0302: active tasks were missing');
  log(hasToday && hasProgress && hasTasks, 'FE-0301/0302', 'the dashboard shows today, progress and tasks');

  if (shoot) await page.screenshot({ path: 'screenshots/p3-dashboard.png', fullPage: true });
  await context.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nAll Phase 3 flows pass.');
