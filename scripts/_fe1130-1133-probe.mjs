/**
 * FE-1130 – FE-1133 browser probe: the seeded cases as rendered, the unassigned
 * task in the task module, role controls, and every Meeting Minutes surface at
 * 375, 768, 1024 and 1440 px — including states the responsive audit cannot
 * reach because they need a click (open filters, a failed save).
 *
 * Run against this project's dev server: `PROBE_BASE=http://localhost:3100`.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const WIDTHS = [375, 768, 1024, 1440];
const USERS = {
  team_lead: 'imran.hossain@demo.local',
  hr: 'rezaul.haque@demo.local',
  nadia: 'nadia.rahman@demo.local',
  management: 'ayesha.siddika@demo.local',
  gov_lead: 'farhana.islam@demo.local',
};

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(browser, email, width = 1440) {
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
  return { context, page, consoleErrors };
}

/**
 * Waits for a *visible* copy of `text` inside `main`. Lists render every title
 * twice — in the table and in the phone cards — and only one is shown at any
 * width, so "the first match" is often the hidden one.
 */
async function waitVisibleText(page, text, timeout = 20000) {
  await page.waitForFunction(
    (needle) =>
      [...document.querySelectorAll('main *')].some(
        (node) => node.children.length === 0 && node.textContent.includes(needle) && node.offsetParent !== null,
      ),
    text,
    { timeout },
  );
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Smallest interactive target inside the section headed `heading`, in px. */
async function smallestTarget(page, heading) {
  return page.evaluate((text) => {
    const root = [...document.querySelectorAll('section')].find(
      (section) => section.querySelector('h2')?.textContent?.trim() === text,
    );
    if (!root) return null;
    const sizes = [...root.querySelectorAll('a, button')]
      .filter((node) => node.offsetParent !== null)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return Math.min(box.width, box.height);
      });
    return sizes.length ? Math.min(...sizes) : null;
  }, heading);
}

const TASKS = 'section:has(h2:has-text("Tasks created from this meeting"))';
const FAILURE = 'section:has(h2:has-text("Task generation failed"))';

async function run() {
  const browser = await chromium.launch();

  /* ====================================== FE-1133: every surface, four widths */
  for (const width of WIDTHS) {
    const phone = width < 768;

    // --- the list, with its filters open
    {
      const { context, page, consoleErrors } = await signIn(browser, USERS.team_lead, width);
      await page.goto(`${BASE}/meeting-minutes`, { waitUntil: 'networkidle' });
      await waitVisibleText(page, 'Vision Platform v2 support rota');
      check(`${width}: list has no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      check(
        `${width}: list is ${phone ? 'cards' : 'a table'}`,
        phone ? (await page.locator('main table:visible').count()) === 0 : (await page.locator('main table:visible').count()) === 1,
      );

      // Open the filters the way a person would at this width.
      if (phone) {
        const toggle = page.getByRole('button', { name: /^Filters/ }).first();
        if (await toggle.count()) await toggle.click();
      }
      const client = page.getByRole('button', { name: /^Client/ }).first();
      await client.waitFor({ state: 'visible', timeout: 10000 });
      await client.click();
      await page.waitForSelector('[role="dialog"], [role="listbox"], [role="menu"]', { timeout: 10000 }).catch(() => {});
      check(`${width}: filters open with no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      await page.keyboard.press('Escape');
      check(`${width}: no console errors on the list`, consoleErrors.length === 0, consoleErrors.slice(0, 1).join(''));
      await context.close();
    }

    // --- the form, with errors and a long pasted title
    {
      const { context, page } = await signIn(browser, USERS.team_lead, width);
      await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
      await page.waitForSelector('select[name="clientId"]', { timeout: 20000 });
      await page.click('button[type="submit"]');
      await page.waitForSelector('text=This meeting minute could not be saved', { timeout: 15000 });
      check(`${width}: form with errors has no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      await page.fill('input[name="title"]', 'x'.repeat(260));
      await page.waitForSelector('text=characters over the limit', { timeout: 10000 });
      check(`${width}: form with an over-long title has no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      const save = await page.locator('button[type="submit"]').boundingBox();
      check(`${width}: Save stays reachable in the viewport`, save !== null && save.y + save.height <= 900 + 1, JSON.stringify(save));
      await context.close();
    }

    // --- long content, generated tasks, the failure panel
    {
      const { context, page } = await signIn(browser, USERS.hr, width);
      await page.goto(`${BASE}/meeting-minutes/min-1007`, { waitUntil: 'networkidle' });
      await page.waitForSelector('text=https://bit.example.edu.bd', { timeout: 20000 });
      check(`${width}: long minute has no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      const wraps = await page.evaluate(() => {
        const para = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('https://bit.example.edu.bd'));
        return para ? para.scrollWidth <= para.clientWidth + 1 : false;
      });
      check(`${width}: the unbroken address wraps inside its paragraph`, wraps);

      await page.goto(`${BASE}/meeting-minutes/min-1004`, { waitUntil: 'networkidle' });
      await page.waitForSelector(FAILURE, { timeout: 20000 });
      check(`${width}: failure panel has no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      const target = await smallestTarget(page, 'Task generation failed');
      check(`${width}: failure panel targets are at least 24 px`, target !== null && target >= 24, String(target));
      await context.close();
    }
    {
      const { context, page } = await signIn(browser, USERS.team_lead, width);
      await page.goto(`${BASE}/meeting-minutes/min-1008`, { waitUntil: 'networkidle' });
      await page.waitForSelector(TASKS, { timeout: 20000 });
      const table = await page.locator(`${TASKS} table:visible`).count();
      const cards = await page.locator(`${TASKS} ul:visible > li`).count();
      check(
        `${width}: generated tasks are ${phone ? 'three cards' : 'a table'}`,
        phone ? table === 0 && cards === 3 : table === 1,
        `table=${table} cards=${cards}`,
      );
      check(`${width}: generated tasks have no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      const unassigned = await page.locator(`${TASKS} :visible`, { hasText: /^Unassigned$/ }).count();
      check(`${width}: both unassigned tasks read Unassigned`, unassigned >= 2, String(unassigned));
      const target = await smallestTarget(page, 'Tasks created from this meeting');
      check(`${width}: task links are at least 24 px`, target !== null && target >= 24, String(target));
      await context.close();
    }
  }

  /* ====================================== FE-1130: the unassigned task itself */
  {
    const { context, page } = await signIn(browser, USERS.team_lead);
    await page.goto(`${BASE}/tasks/tsk-17`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Set up the weekend support rota")', { timeout: 20000 });
    const main = (await page.textContent('main')) ?? '';
    check('1130: an unassigned task says Unassigned', main.includes('Unassigned'));
    check('1130: and says where it came from', main.includes('Created by task generation from the meeting minute'));

    await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
    await waitVisibleText(page, 'Set up the weekend support rota for the October launch');
    const board = (await page.textContent('main')) ?? '';
    check('1130: the Team Lead board shows it as Unassigned', board.includes('Unassigned'));
    await context.close();
  }
  {
    // Nobody sees an unassigned task as "my task".
    const { context, page } = await signIn(browser, USERS.nadia);
    await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    check('1130: it is on no employee’s own list', !((await page.textContent('main')) ?? '').includes('weekend support rota'));
    await context.close();
  }

  /* ====================================== FE-1131 / FE-1132 in the browser */
  {
    const { context, page } = await signIn(browser, USERS.management);
    await page.goto(`${BASE}/meeting-minutes/min-1004`, { waitUntil: 'networkidle' });
    await page.waitForSelector(FAILURE, { timeout: 20000 });
    const controls = await page.locator('main').getByRole('button', { name: /Retry|Start task generation|Archive/ }).count();
    const edits = await page.locator('main').getByRole('link', { name: /^Edit$/ }).count();
    check('1131: Management sees a failure but no Retry, Start, Archive or Edit', controls === 0 && edits === 0, `${controls}/${edits}`);
    await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
    check('1131: Management is refused the Add route', /do not have access to this page/i.test((await page.textContent('body')) ?? ''));
    await context.close();
  }
  {
    const { context, page } = await signIn(browser, USERS.hr);
    await page.goto(`${BASE}/meeting-minutes/min-1009`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=That meeting minute could not be found', { timeout: 20000 });
    const hidden = await page.textContent('main');
    await page.goto(`${BASE}/meeting-minutes/min-nope`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=That meeting minute could not be found', { timeout: 20000 });
    check('1132: a government minute is not found, exactly as a missing one', hidden === (await page.textContent('main')));
    check('1132: and names nothing', !/Records digitisation|vendor|Farhana/.test(hidden ?? ''));
    await context.close();
  }
  {
    const { context, page } = await signIn(browser, USERS.gov_lead);
    await page.goto(`${BASE}/meeting-minutes/min-1009`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Records digitisation vendor review")', { timeout: 20000 });
    check('1132: the government lead reads it', true);
    await context.close();
  }
  {
    // A creator starts task generation for their own Not Processed minute.
    const { context, page } = await signIn(browser, USERS.hr);
    await page.goto(`${BASE}/meeting-minutes/min-1002`, { waitUntil: 'networkidle' });
    const start = page.getByRole('button', { name: 'Start task generation' });
    await start.waitFor({ timeout: 20000 });
    await start.dblclick();
    await page.waitForFunction(() => document.body.textContent.includes('Queued. Task generation will start shortly'), null, { timeout: 20000 });
    const runs = await page.evaluate(() => {
      const dt = [...document.querySelectorAll('dt')].find((node) => node.textContent === 'Runs');
      return dt?.nextElementSibling?.textContent?.trim();
    });
    check('1131: Start moves the minute to Pending with exactly one run', runs === '1', `Runs = ${runs}`);
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1130–FE-1133 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
