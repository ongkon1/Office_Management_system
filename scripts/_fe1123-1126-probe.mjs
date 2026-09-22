/**
 * FE-1123 – FE-1126 browser probe: generated tasks, traceability, failure and
 * retry, and background refresh. Run against this project's dev server:
 * `PROBE_BASE=http://localhost:3100`.
 *
 * Live runs are driven by the mock worker. Its outcome is set per browser
 * context through the `oms.mock-outcome.meeting-minutes-worker` key.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const OUTCOME_KEY = 'oms.mock-outcome.meeting-minutes-worker';
const USERS = {
  team_lead: 'imran.hossain@demo.local',
  nadia: 'nadia.rahman@demo.local',
  tanvir: 'tanvir.ahmed@demo.local',
  hr: 'rezaul.haque@demo.local',
  admin: 'arif.mahmud@demo.local',
};

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(browser, email, { width = 1440, outcome = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 });
  if (new URL(page.url()).pathname.startsWith('/two-factor')) {
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !new URL(u).pathname.startsWith('/two-factor'), { timeout: 20000 });
  }
  await page.evaluate(
    ([key, value]) => (value ? window.localStorage.setItem(key, value) : window.localStorage.removeItem(key)),
    [OUTCOME_KEY, outcome],
  );
  return { context, page, consoleErrors };
}

const TASKS = 'section:has(h2:has-text("Tasks created from this meeting"))';

async function saveMinuteWithAi(page, title) {
  await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('select[name="clientId"]', { timeout: 20000 });
  await page.fill('input[name="title"]', title);
  await page.selectOption('select[name="clientId"]', 'cli-meghna');
  await page.waitForFunction(() => !document.querySelector('select[name="projectId"]').disabled, null, { timeout: 15000 });
  await page.selectOption('select[name="projectId"]', 'prj-vp2');
  await page.fill('textarea[name="content"]', 'The team agreed to ship the redesign. The backlog is next.');
  await page.check('input[name="processWithAi"]');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });
  await page.waitForSelector(`h1:has-text("${title}")`, { timeout: 20000 });
  return new URL(page.url()).pathname.split('/').at(-1);
}

async function run() {
  const browser = await chromium.launch();

  /* ============================================ FE-1123 generated tasks */
  {
    const { context, page, consoleErrors } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector(TASKS, { timeout: 20000 });
    const section = page.locator(TASKS);
    const rows = section.locator('table tbody tr');
    check('1123: both tasks listed for the Team Lead', (await rows.count()) === 2, String(await rows.count()));

    const first = (await rows.nth(0).textContent()) ?? '';
    for (const [label, value] of [
      ['title', 'Add export to PDF to the search results'],
      ['assignee', 'Nadia Rahman'],
      ['priority', 'High'],
      ['status', 'Pending'],
      ['match outcome', 'Named in the minute'],
    ]) {
      check(`1123: row shows the ${label}`, first.includes(value), first.slice(0, 120));
    }
    check('1123: second row matched on grounds', ((await rows.nth(1).textContent()) ?? '').includes('Matched on project membership and workload'));

    const open = section.getByRole('link', { name: /^Open task Add export to PDF/ });
    check('1123: Open task link present', (await open.count()) === 1);
    await open.click();
    await page.waitForURL(/\/tasks\/tsk-15$/, { timeout: 20000 });
    await page.waitForSelector('h1:has-text("Add export to PDF to the search results")', { timeout: 20000 });
    check('1123: Open task lands on the task, not on not-found', true);

    /* FE-1124 on the task page, reached from the minute. The source panel
       loads after the task, so wait for it. */
    await page.waitForSelector('text=Created by task generation', { timeout: 20000 });
    const source = await page.getByRole('link', { name: 'Vision Platform v2 sprint review' }).count();
    check('1124: task page links back to its source minute', source === 1);
    const body = await page.textContent('main');
    check('1124: says it was created by task generation', body.includes('Created by task generation from the meeting minute'));
    check('1124: says access follows project and assignment', body.includes('follows its project and assignment'));
    check('1124: no authority wording', !/approved by ai|authori[sz]ed by ai|ai (granted|decided)/i.test(body));
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  {
    // An employee: one task visible, one counted and not named.
    const { context, page } = await signIn(browser, USERS.nadia);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector(TASKS, { timeout: 20000 });
    const section = page.locator(TASKS);
    const text = (await section.textContent()) ?? '';
    check('1123: employee sees her own task', text.includes('Add export to PDF'));
    check('1123: and not the other one', !text.includes('Confirm the October release date') && !text.includes('Tanvir'));
    check('1123: the other is counted, not named', text.includes('One task created from this meeting is not shown'));
    await context.close();
  }

  {
    // The assignee who cannot read the minute: FE-1124's restricted view.
    const { context, page } = await signIn(browser, USERS.tanvir);
    await page.goto(`${BASE}/tasks/tsk-16`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Confirm the October release date")', { timeout: 20000 });
    await page.waitForSelector('text=Created by task generation', { timeout: 20000 });
    // Only the source panel is under test: the task page rightly shows the
    // task's own project, which says nothing about the minute.
    const panel = (await page.locator('text=Created by task generation').first().textContent()) ?? '';
    check('1124: restricted source says only that a minute exists', panel.includes('from a meeting minute you do not have access to'));
    check('1124: restricted source names nothing about the minute', !/sprint review|Vision Platform v2 sprint/.test(panel), panel);
    check('1124: restricted source has no link to the minute', (await page.locator('a[href^="/meeting-minutes/"]').count()) === 0);
    await context.close();
  }

  {
    // An ordinary task shows no source panel at all.
    const { context, page } = await signIn(browser, USERS.nadia);
    await page.goto(`${BASE}/tasks/tsk-1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Model evaluation harness")', { timeout: 20000 });
    await page.waitForTimeout(800);
    check('1124: an ordinary task shows no AI origin', !((await page.textContent('main')) ?? '').includes('task generation'));
    await context.close();
  }

  /* ============================================ FE-1125 failure and retry */
  {
    const { context, page } = await signIn(browser, USERS.hr);
    await page.goto(`${BASE}/meeting-minutes/min-1004`, { waitUntil: 'networkidle' });
    const failure = page.locator('section:has(h2:has-text("Task generation failed"))');
    await failure.waitFor({ timeout: 20000 });
    const text = (await failure.textContent()) ?? '';
    check('1125: safe error shown', text.includes('The AI service took too long to respond'));
    check('1125: minute reassurance shown', text.includes('The minute below is saved and unchanged'));
    check('1125: no provider detail', !/provider_timeout|stack|model/i.test(text));

    // The failure comes before the minute on the page.
    const order = await page.evaluate(() => {
      const failure = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Task generation failed');
      const minute = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Minute');
      return Boolean(failure && minute && failure.compareDocumentPosition(minute) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check('1125: failure is read before the minute', order);

    // Double click: one retry, busy state, then Pending.
    const button = failure.getByRole('button', { name: 'Retry task generation' });
    await button.dblclick();
    await page.waitForSelector('text=Task generation queued again', { timeout: 20000 });
    await page.waitForFunction(() => document.body.textContent.includes('Queued. Task generation will start shortly'), null, { timeout: 20000 });
    check('1125: retry moves the minute to Pending', true);
    const runs = await page.evaluate(() => {
      const dt = [...document.querySelectorAll('dt')].find((node) => node.textContent === 'Runs');
      return dt?.nextElementSibling?.textContent?.trim();
    });
    check('1125: exactly one new run for a double click', runs === '2', `Runs = ${runs}`);
    check('1125: failure panel gone once retried', (await page.locator('section:has(h2:has-text("Task generation failed"))').count()) === 0);
    await context.close();
  }

  {
    const { context, page } = await signIn(browser, USERS.nadia);
    await page.goto(`${BASE}/meeting-minutes/min-1004`, { waitUntil: 'networkidle' });
    const failure = page.locator('section:has(h2:has-text("Task generation failed"))');
    await failure.waitFor({ timeout: 20000 });
    check('1125: a reader gets no retry button', (await failure.getByRole('button').count()) === 0);
    check('1125: and is told who can retry', ((await failure.textContent()) ?? '').includes("Only the minute's creator or a Super Administrator"));
    await context.close();
  }

  /* ============================================ FE-1126 background refresh */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    const id = await saveMinuteWithAi(page, 'Probe live run');
    const live = page.locator('[role="status"][aria-atomic="true"]');

    await page.waitForFunction(
      () => document.querySelector('[role="status"][aria-atomic="true"]')?.textContent.includes('has started'),
      null,
      { timeout: 20000 },
    );
    check('1126: the start is announced', true);
    await page.waitForSelector('text=Task generation finished', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelector('[role="status"][aria-atomic="true"]')?.textContent.includes('has finished'),
      null,
      { timeout: 20000 },
    );
    check('1126: the finish is announced', (await live.textContent()).includes('Task generation has finished.'));
    check('1126: page shows the finished summary', ((await page.textContent('main')) ?? '').includes('The team agreed to ship the redesign.'));
    check('1126: page shows no tasks were created', ((await page.textContent('main')) ?? '').includes('found no tasks to create'));

    // The creator is notified, wherever they are. Reached by clicking: a full
    // reload restarts the in-memory mock and would drop the notification.
    await page.locator('a[href="/notifications"]').first().click();
    await page.waitForURL(/\/notifications$/, { timeout: 20000 });
    // Wait inside the page: the detail page's toast lives in the shell and is
    // still showing "Task generation finished" when this page opens.
    await page.locator('main').getByText('Probe live run').first().waitFor({ timeout: 20000 });
    const notes = (await page.textContent('main')) ?? '';
    check('1126: creator notified in Notifications', notes.includes('Task generation finished') && notes.includes('Probe live run'));
    void id;
    await context.close();
  }

  {
    // Failure arriving in the background, seen on the detail page.
    const { context, page } = await signIn(browser, USERS.team_lead, { outcome: 'fail' });
    await saveMinuteWithAi(page, 'Probe live failure');
    const failure = page.locator('section:has(h2:has-text("Task generation failed"))');
    await failure.waitFor({ timeout: 20000 });
    check('1126: a background failure appears with its retry', (await failure.getByRole('button', { name: 'Retry task generation' }).count()) === 1);
    const toasts = await page.locator('p', { hasText: /^Task generation failed$/ }).count();
    check('1126: one notice for one failure', toasts === 1, String(toasts));
    await context.close();
  }

  {
    // The list, scrolled, while a row finishes in the background. Reached by
    // clicking, not by `goto`: a full reload restarts the in-memory mock and
    // would drop the run. Filter preservation is covered in the unit tests.
    const { context, page } = await signIn(browser, USERS.team_lead, { width: 1024 });
    await saveMinuteWithAi(page, 'Probe list run');
    await page.getByRole('link', { name: 'Meeting Minutes', exact: true }).first().click();
    await page.waitForURL(/\/meeting-minutes$/, { timeout: 20000 });
    // The title renders twice (table and phone card); wait for the table's.
    await page.locator('tbody').getByText('Probe list run').first().waitFor({ timeout: 20000 });
    const before = page.url();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.waitForSelector('text=Task generation finished', { timeout: 25000 });
    await page.waitForTimeout(600);
    check('1126: the list says the run finished', true);
    check('1126: the list keeps its address', page.url() === before, page.url());
    const scrollAfter = await page.evaluate(() => window.scrollY);
    check('1126: the list keeps its scroll position', scrollBefore > 0 && Math.abs(scrollAfter - scrollBefore) <= 2, `${scrollBefore} → ${scrollAfter}`);
    const rowText = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Probe list run'));
      return cell?.textContent ?? '';
    });
    check('1126: the row now reads Processed', rowText.includes('Processed'), rowText.slice(0, 120));
    await context.close();
  }

  /* ============================================ phone width */
  {
    const { context, page } = await signIn(browser, USERS.team_lead, { width: 375 });
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector(TASKS, { timeout: 20000 });
    const cards = await page.locator(`${TASKS} ul li`).count();
    check('1123: tasks become cards on a phone', cards === 2, String(cards));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('no horizontal scroll at 375 px', overflow <= 0, `overflow ${overflow}`);
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1123–FE-1126 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
