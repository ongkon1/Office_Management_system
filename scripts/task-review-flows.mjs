/**
 * `FE-0784` — employee-raised task flow verification. Requires a server on :3000.
 *
 * The unit tests prove the rules. What only a browser can prove is that the
 * screens carry them: that an employee is told a task needs review *before*
 * they try to use it, that the blocked task is genuinely absent from the time
 * entry dropdown, and that the Team Lead is told there is something waiting.
 *
 * Cross-role steps use fixture tasks, because the mock store lives for one page
 * load — the same constraint the requisition and conveyance gates work under.
 */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';

const PASSWORD = 'Demo1234!';
const EMPLOYEE = 'nadia.rahman@demo.local'; // Team Lead: Imran Hossain
const TEAM_LEAD = 'imran.hossain@demo.local';
const OTHER_TEAM_LEAD = 'farhana.islam@demo.local';
const HR = 'rezaul.haque@demo.local';

const PENDING_TASK = '/tasks/tsk-10'; // raised by Nadia, awaiting Imran
const REJECTED_TASK = '/tasks/tsk-13'; // raised by Nadia, not approved

const browser = await chromium.launch();
const failures = [];
let checks = 0;

function record(ok, area, detail) {
  checks += 1;
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
  await page.waitForTimeout(600);
  return { context, page };
}

async function goto(page, path, wait = 1000) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  return page.locator('main').innerText();
}

console.log(`Employee task review flow verification against ${baseUrl}\n`);

/* ========================================================================== */
/* FE-0781 — an employee raises a task                                        */
/* ========================================================================== */

{
  const { context, page } = await openAs(EMPLOYEE);
  let text = await goto(page, '/tasks');

  record(/Raise a task/i.test(text), 'FE-0781', 'an Employee is offered the raise action');
  record(
    /not yet approved/i.test(text),
    'FE-0781',
    'the list explains that a raised task cannot receive time yet',
  );
  record(
    /Awaiting review/i.test(text),
    'FE-0781',
    'a pending task is labelled, not left looking ordinary',
  );
  record(
    /Not approved/i.test(text),
    'FE-0781',
    'a task the Team Lead declined is labelled distinctly',
  );
  record(
    /IT support work, not project work/i.test(text),
    'FE-0781',
    'and the reason reaches the person who raised it',
  );

  await page.getByRole('button', { name: 'Raise a task' }).click();
  await page.waitForTimeout(500);
  text = await page.locator('body').innerText();
  record(
    /Imran Hossain will review this/i.test(text),
    'FE-0781',
    'the form names the reviewer before anything is typed',
  );

  // An empty submit must produce field-level guidance, not a browser bubble.
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.waitForTimeout(700);
  text = await page.locator('body').innerText();
  record(
    /required/i.test(text) && /could not be raised/i.test(text),
    'FE-0781',
    'an empty form reports its own errors rather than the browser bubble',
  );
  record(
    /Enter a short, specific title|Choose the project/i.test(text),
    'FE-0781',
    'each failure states how to correct it',
  );

  await page.fill('input[name="title"]', 'Audit the seed script');
  await page.selectOption('select[name="projectId"]', { index: 1 });
  await page.fill('input[name="estimatedHours"]', '0');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.waitForTimeout(700);
  record(
    /positive number of hours/i.test(await page.locator('body').innerText()),
    'FE-0781',
    'a non-positive estimate is refused with guidance',
  );

  await page.fill('input[name="estimatedHours"]', '5');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.waitForTimeout(1400);
  text = await page.locator('main').innerText();
  record(
    /Audit the seed script/i.test(text),
    'FE-0781',
    'the raised task appears in the employee list',
  );

  await context.close();
}

/* ========================================================================== */
/* FE-0780 — the task cannot receive time until it is approved                */
/* ========================================================================== */

{
  const { context, page } = await openAs(EMPLOYEE);
  await goto(page, '/timesheets/2026-09-02');

  await page.getByRole('button', { name: /Add time/i }).first().click();
  await page.waitForTimeout(900);

  // Choose the division and project the pending fixture task belongs to.
  await page.selectOption('select[name="divisionId"]', 'pia');
  await page.waitForTimeout(400);
  await page.selectOption('select[name="projectId"]', 'prj-vp2');
  await page.waitForTimeout(500);

  const taskOptions = await page.locator('select[name="taskId"] option').allInnerTexts();
  record(
    !taskOptions.some((option) => /Refactor the annotation import script/i.test(option)),
    'FE-0780',
    'a task awaiting review is absent from the time-entry task list',
  );
  record(
    !taskOptions.some((option) => /Rebuild the demo laptop image/i.test(option)),
    'FE-0780',
    'and so is one the Team Lead declined',
  );
  record(
    taskOptions.some((option) => /Tidy the shared fixture folder/i.test(option)),
    'FE-0780',
    'while an approved employee-raised task is selectable',
  );

  await context.close();
}

/* ========================================================================== */
/* FE-0782, FE-0783 — the Team Lead is told, and decides                      */
/* ========================================================================== */

{
  const { context, page } = await openAs(TEAM_LEAD);

  const dashboard = await goto(page, '/dashboard', 2000);
  record(
    /waiting for you/i.test(dashboard) && /tasks? raised by your team/i.test(dashboard),
    'FE-0783',
    'the Team Lead dashboard names the tasks waiting for review',
  );

  const notifications = await goto(page, '/notifications');
  record(
    /Task raised for your review/i.test(notifications),
    'FE-0783',
    'the notification centre carries the same message',
  );

  let board = await goto(page, '/tasks');
  record(
    /raised by your team/i.test(board),
    'FE-0782',
    'the review queue appears on the team task board',
  );
  record(
    /Refactor the annotation import script/i.test(board),
    'FE-0782',
    'and lists the task itself with who raised it',
  );

  // Rejecting requires a note, and the note reaches the person who raised it.
  await page.getByRole('button', { name: 'Do not approve' }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Do not approve' }).last().click();
  await page.waitForTimeout(900);
  record(
    /note is required/i.test(await page.locator('body').innerText()),
    'FE-0782',
    'not approving without a note is refused with guidance',
  );

  await page.fill('textarea[name="note"]', 'Fold this into the existing harness task.');
  await page.getByRole('button', { name: 'Do not approve' }).last().click();
  await page.waitForTimeout(1500);
  /*
   * Scoped to the queue list, not the whole page. The task still exists and
   * still appears on the board below — leaving the *queue* is the behaviour
   * being checked, and asserting against `main` conflated the two.
   */
  const queue = page.getByRole('list', { name: 'Tasks awaiting your review' });
  const queueText = (await queue.count()) > 0 ? await queue.innerText() : '';
  record(
    !/Refactor the annotation import script/i.test(queueText),
    'FE-0782',
    'the decided task leaves the queue',
  );
  record(
    /Write a regression checklist/i.test(queueText),
    'FE-0782',
    'while another employee’s task is still waiting',
  );

  await context.close();
}

/* ========================================================================== */
/* FE-0782 — only the right Team Lead may review                              */
/* ========================================================================== */

{
  const { context, page } = await openAs(OTHER_TEAM_LEAD);
  const board = await goto(page, '/tasks');
  record(
    !/Refactor the annotation import script/i.test(board),
    'FE-0782',
    'a Team Lead the person does not report to sees no queue entry for it',
  );
  await context.close();
}

{
  const { context, page } = await openAs(HR);
  const text = await goto(page, '/tasks');
  record(
    !/raised by your team/i.test(text),
    'FE-0782',
    'HR is offered no task review queue, because review is the Team Lead’s',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0781 — a Team Lead does not raise tasks for review                      */
/* ========================================================================== */

{
  const { context, page } = await openAs(TEAM_LEAD);
  const board = await goto(page, '/tasks');
  record(
    !/Raise a task/i.test(board),
    'FE-0781',
    'a Team Lead is not offered the raise-for-review action; they create directly',
  );
  record(/New task/i.test(board), 'FE-0781', 'and still has their own create action');
  await context.close();
}

/* ========================================================================== */
/* FE-0780 — the detail screen states the block                               */
/* ========================================================================== */

{
  const { context, page } = await openAs(EMPLOYEE);
  const pending = await goto(page, PENDING_TASK);
  record(
    /Awaiting review|Team Lead reviews it/i.test(pending),
    'FE-0780',
    'the task detail says the task is awaiting review',
  );

  const rejected = await goto(page, REJECTED_TASK);
  record(
    /Not approved|did not approve/i.test(rejected),
    'FE-0780',
    'and says plainly when a task was not approved',
  );
  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} task review check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${checks} task review flow checks pass.`);
