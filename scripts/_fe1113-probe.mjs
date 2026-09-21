/**
 * FE-1113 browser probe — the Add Meeting Minute form in a real browser.
 *
 * Requires `npm run dev` on :3000.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const USERS = {
  team_lead: 'imran.hossain@demo.local',
  hr: 'rezaul.haque@demo.local',
  admin: 'arif.mahmud@demo.local',
  employee: 'nadia.rahman@demo.local',
  management: 'ayesha.siddika@demo.local',
};

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 20000 });
  if (new URL(page.url()).pathname.startsWith('/two-factor')) {
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !new URL(url).pathname.startsWith('/two-factor'), { timeout: 20000 });
  }
}

async function run() {
  const browser = await chromium.launch();

  for (const [role, email] of Object.entries(USERS)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await signIn(page, email);
    await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');

    if (role === 'employee' || role === 'management') {
      // The layout's route guard refuses before the form or the service is
      // reached, so the copy is the shell's generic role denial.
      check(`${role}: refused`, /do not have access to this page/i.test(body), body.slice(0, 120));
      check(`${role}: no client control`, (await page.locator('select[name="clientId"]').count()) === 0);
      check(`${role}: no client name leaked`, !/Meghna|Westbridge|Bengal|Ministry/.test(body));
    } else {
      await page.waitForSelector('select[name="clientId"]', { timeout: 15000 });
      const clients = await page.locator('select[name="clientId"] option').allTextContents();
      check(`${role}: clients offered`, clients.length > 1, clients.join('|'));
      check(
        `${role}: government client hidden unless permitted`,
        role === 'admin'
          ? clients.some((c) => c.includes('Ministry'))
          : !clients.some((c) => c.includes('Ministry')),
        clients.join('|'),
      );

      check(`${role}: project disabled first`, await page.locator('select[name="projectId"]').isDisabled());

      await page.selectOption('select[name="clientId"]', 'cli-meghna');
      await page.waitForFunction(
        () => !document.querySelector('select[name="projectId"]').disabled,
        null,
        { timeout: 15000 },
      );
      const projects = await page.locator('select[name="projectId"] option').allTextContents();
      check(`${role}: only active projects`, projects.length === 2 && projects[1].includes('Vision Platform v2'), projects.join('|'));
      check(`${role}: inactive project hidden`, !projects.some((p) => p.includes('Legacy Site')), projects.join('|'));

      // Empty save shows field errors with guidance.
      await page.click('button[type="submit"]');
      await page.waitForSelector('text=This meeting minute could not be saved', { timeout: 15000 });
      const afterSubmit = await page.textContent('body');
      check(`${role}: title error with guidance`, /Enter a title for this meeting minute\. Fill this in before saving\./.test(afterSubmit));
      check(`${role}: content error with guidance`, /Write what the meeting covered\. Fill this in before saving\./.test(afterSubmit));
      check(`${role}: still on the form`, page.url().includes('/meeting-minutes/new'));

      // A real save, with AI.
      await page.fill('input[name="title"]', `Probe minute ${role}`);
      await page.selectOption('select[name="projectId"]', 'prj-vp2');
      await page.fill('textarea[name="content"]', 'Probe content.\n\nSecond paragraph.');
      await page.check('input[name="processWithAi"]');
      await page.click('button[type="submit"]');
      // `FE-1120` made the detail page real, so a save opens the new minute.
      await page.waitForURL(/\/meeting-minutes\/min-\d+$/, { timeout: 20000 });
      await page.waitForSelector(`h1:has-text("Probe minute ${role}")`, { timeout: 20000 });
      check(`${role}: opens the saved minute`, true);

      // Back to the list by clicking, not `goto`: a full reload restarts the
      // mock adapter's in-memory state, which would drop the new minute.
      await page.getByRole('link', { name: 'Meeting Minutes', exact: true }).first().click();
      await page.waitForURL(/\/meeting-minutes$/, { timeout: 20000 });
      await page.waitForSelector(`text=Probe minute ${role}`, { timeout: 20000 }).catch(() => {});
      const list = await page.textContent('body');
      check(`${role}: saved minute is listed`, list.includes(`Probe minute ${role}`));
      check(`${role}: shows Pending`, /Pending/.test(list));

      // Mobile: no horizontal scroll, action bar reachable.
      await page.setViewportSize({ width: 375, height: 720 });
      await page.goto(`${BASE}/meeting-minutes/new`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      check(`${role}: no horizontal scroll at 375 px`, overflow <= 0, `overflow ${overflow}`);
      check(`${role}: save reachable on a phone`, await page.locator('button[type="submit"]').isVisible());
    }

    check(`${role}: no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1113 probe: ${pass}/${pass + fail} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const entry of failures) console.log(` - ${entry}`);
    process.exitCode = 1;
  }
}

run();
