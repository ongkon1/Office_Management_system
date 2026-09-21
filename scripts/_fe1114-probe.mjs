/**
 * FE-1114 browser probe — validation presentation on the Add Meeting Minute
 * form. Requires `npm run dev` on :3000.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const ADMIN = 'arif.mahmud@demo.local';
const TEAM_LEAD = 'imran.hossain@demo.local';

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function openForm(browser, email, width = 1440) {
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
  await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('select[name="clientId"]', { timeout: 20000 });
  return { context, page, consoleErrors };
}

/** The message and guidance a field's own `aria-describedby` actually carries. */
async function describedText(page, name) {
  return page.evaluate((field) => {
    const control = document.querySelector(`[name="${field}"]`);
    const ids = (control?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
  }, name);
}

async function run() {
  const browser = await chromium.launch();

  /* ---------------------------------------------------------------- */
  /* Every field carries its own message plus guidance                 */
  /* ---------------------------------------------------------------- */
  {
    const { context, page, consoleErrors } = await openForm(browser, TEAM_LEAD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=This meeting minute could not be saved', { timeout: 15000 });

    for (const [field, message, guidance] of [
      ['title', 'Enter a title for this meeting minute.', 'Fill this in before saving.'],
      ['clientId', 'Choose the client this meeting was with.', 'Fill this in before saving.'],
      ['projectId', 'Choose the project this meeting was about.', 'Fill this in before saving.'],
      ['content', 'Write what the meeting covered.', 'Fill this in before saving.'],
    ]) {
      const text = await describedText(page, field);
      check(`${field}: message on the field`, text.includes(message), text.slice(0, 80));
      check(`${field}: guidance on the field`, text.includes(guidance), text.slice(0, 80));
      check(
        `${field}: marked invalid`,
        (await page.getAttribute(`[name="${field}"]`, 'aria-invalid')) === 'true',
      );
    }

    // The summary took focus, because there is more than one failure.
    check(
      'summary takes focus for several failures',
      await page.evaluate(() => document.activeElement?.getAttribute('role') === 'alert'),
    );

    // Editing one field drops only its own error.
    await page.fill('input[name="title"]', 'Probe title');
    await page.waitForFunction(
      () => !document.body.textContent.includes('Enter a title for this meeting minute'),
      null,
      { timeout: 10000 },
    );
    check(
      'other errors survive editing one field',
      (await page.textContent('body')).includes('Write what the meeting covered'),
    );

    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  /* ---------------------------------------------------------------- */
  /* Changing the client clears the project and its error              */
  /* ---------------------------------------------------------------- */
  {
    const { context, page } = await openForm(browser, TEAM_LEAD);
    await page.selectOption('select[name="clientId"]', 'cli-meghna');
    await page.waitForFunction(() => !document.querySelector('select[name="projectId"]').disabled, null, { timeout: 15000 });
    await page.selectOption('select[name="projectId"]', 'prj-vp2');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=This meeting minute could not be saved', { timeout: 15000 });

    await page.selectOption('select[name="clientId"]', 'cli-bit');
    await page.waitForFunction(
      () => document.querySelector('select[name="projectId"]').value === '',
      null,
      { timeout: 15000 },
    );
    check('project cleared when the client changes', true);
    check(
      'project error cleared with it',
      !(await page.textContent('body')).includes('Choose the project this meeting was about'),
    );
    await context.close();
  }

  /* ---------------------------------------------------------------- */
  /* An inactive project is named; a hidden one is not                 */
  /* ---------------------------------------------------------------- */
  {
    const { context, page } = await openForm(browser, ADMIN);
    const options = await page.$$eval('select[name="clientId"] option', (els) => els.map((e) => e.value));
    check('admin sees the government client', options.includes('cli-mopa'), options.join('|'));

    // `prj-lsm` is Meghna's inactive project: it is not offered at all, which
    // is the screen's half of the rule.
    await page.selectOption('select[name="clientId"]', 'cli-meghna');
    await page.waitForFunction(() => !document.querySelector('select[name="projectId"]').disabled, null, { timeout: 15000 });
    const projects = await page.$$eval('select[name="projectId"] option', (els) => els.map((e) => e.value));
    check('inactive project is not offered', !projects.includes('prj-lsm'), projects.join('|'));
    await context.close();
  }

  /* ---------------------------------------------------------------- */
  /* Length limits are reachable, stated in words, and focus one field */
  /* ---------------------------------------------------------------- */
  {
    const { context, page } = await openForm(browser, TEAM_LEAD);
    check(
      'title is not capped by the control',
      (await page.getAttribute('input[name="title"]', 'maxlength')) === null,
    );
    check(
      'content is not capped by the control',
      (await page.getAttribute('textarea[name="content"]', 'maxlength')) === null,
    );

    await page.fill('input[name="title"]', 'x'.repeat(205));
    await page.waitForSelector('text=5 characters over the limit', { timeout: 10000 });
    check('over-length title is stated in words', true);

    await page.fill('textarea[name="content"]', 'y'.repeat(50_010));
    await page.waitForSelector('text=10 over the limit', { timeout: 10000 });
    const counterTone = await page.evaluate(() => {
      const node = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('over the limit'));
      return { text: node?.textContent ?? '', colour: node ? getComputedStyle(node).color : '' };
    });
    check('counter says it, not just colours it', counterTone.text.includes('over the limit'), counterTone.text.slice(0, 60));

    // One failure: focus goes to the field itself, not to a one-item summary.
    await page.fill('input[name="title"]', 'Probe title');
    await page.fill('textarea[name="content"]', 'Probe content.');
    await page.selectOption('select[name="clientId"]', 'cli-meghna');
    await page.waitForFunction(() => !document.querySelector('select[name="projectId"]').disabled, null, { timeout: 15000 });
    await page.click('button[type="submit"]');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('name') === 'projectId',
      null,
      { timeout: 15000 },
    );
    check('a single failure focuses its own field', true);
    await context.close();
  }

  /* ---------------------------------------------------------------- */
  /* Errors are readable on a phone without horizontal scrolling       */
  /* ---------------------------------------------------------------- */
  {
    const { context, page } = await openForm(browser, TEAM_LEAD, 375);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=This meeting minute could not be saved', { timeout: 15000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check('no horizontal scroll with errors shown at 375 px', overflow <= 0, `overflow ${overflow}`);
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1114 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
