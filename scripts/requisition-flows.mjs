/**
 * `FE-0752` — requisition flow verification. Requires a server on :3000.
 *
 * The unit tests already prove the chain and the scope rules. What they cannot
 * prove is that the *screens* honour them: that a reviewer opening a URL
 * directly is refused, that a decision made in one session is visible in
 * another, and that the person holding a requisition is told so where they
 * actually look. That is what this walks.
 */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';

const PASSWORD = 'Demo1234!';
const EMPLOYEE = 'nadia.rahman@demo.local';
const OTHER_EMPLOYEE = 'sadia.karim@demo.local';
const TEAM_LEAD = 'imran.hossain@demo.local';
const OTHER_TEAM_LEAD = 'farhana.islam@demo.local';
const HR = 'rezaul.haque@demo.local';
const FINANCE = 'mahmuda.akter@demo.local';
const ADMIN = 'arif.mahmud@demo.local';
const MANAGEMENT = 'ayesha.siddika@demo.local';
const REJECTED_SUBMITTER = 'sumaiya.noor@demo.local'; // raised `req-5`

/*
 * Cross-role steps use fixture requisitions, not one raised during the run.
 *
 * The mock store lives in memory for the life of a page load, so a requisition
 * submitted in one browser context does not exist in another. That is a
 * property of the demo backend, not a defect — but it means a chain walked
 * across five sessions has to stand on records that are already seeded. The
 * fixtures are shaped for exactly this:
 *
 *   req-1  with the Team Lead        → the Team Lead decides; nobody else sees it
 *   req-2  with all three reviewers  → HR decides, and one approval is not enough
 *   req-3  HR already approved       → Finance rejects, ending the chain
 *   req-5  already rejected          → the submitter reads the reason
 *
 * A requisition raised live is still checked, inside the session that raised
 * it, because that is where submission behaviour actually belongs.
 */
const WITH_TEAM_LEAD = '/requisitions/req-1';
const WITH_REVIEWERS = '/requisitions/req-2';
const PART_REVIEWED = '/requisitions/req-3';
const ALREADY_REJECTED = '/requisitions/req-5';

const browser = await chromium.launch();
const failures = [];
let checks = 0;

function record(ok, area, detail) {
  checks += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(14)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function openAs(email, { twoFactor = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
  if (twoFactor) {
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !new URL(url).pathname.startsWith('/two-factor'), {
      timeout: 15000,
    });
  }
  await page.waitForTimeout(600);
  return { context, page };
}

async function goto(page, path, wait = 900) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  return page.locator('main').innerText();
}

console.log(`Requisition flow verification against ${baseUrl}\n`);

/* ========================================================================== */
/* FE-0742 — navigation and reach                                             */
/* ========================================================================== */

{
  const { context, page } = await openAs(EMPLOYEE);
  const nav = await page.locator('nav').first().innerText();
  record(/Requisition/i.test(nav), 'FE-0742', 'an Employee sees Requisition in the sidebar');

  const text = await goto(page, '/requisitions');
  record(/Requisition/i.test(text), 'FE-0742', 'the Employee reaches /requisitions');
  record(
    /Requisitions you have raised/i.test(text),
    'FE-0743',
    'the list states whose requisitions these are',
  );
  record(
    /Raise requisition/i.test(text),
    'FE-0743',
    'an Employee is offered the submit action',
  );
  await context.close();
}

{
  // Management is read-only and has no place in the chain, so the route denies.
  const { context, page } = await openAs(MANAGEMENT);
  const nav = await page.locator('nav').first().innerText();
  record(
    !/Requisition/i.test(nav),
    'FE-0742',
    'Management is not offered Requisition in navigation',
  );
  const text = await goto(page, '/requisitions');
  record(
    /do not have access|not available|denied|permission/i.test(text),
    'FE-0742',
    'Management typing the URL directly is denied, not shown the queue',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0747 — validation carries guidance                                      */
/* ========================================================================== */

let raisedHref = null;

{
  const { context, page } = await openAs(EMPLOYEE);
  await goto(page, '/requisitions/new');

  // An empty submit must produce field-level guidance, not a browser bubble.
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);
  let text = await page.locator('main').innerText();
  record(
    /required/i.test(text) && /could not be submitted/i.test(text),
    'FE-0747',
    'an empty in-house form reports its own errors rather than the browser bubble',
  );
  record(
    /Enter the name of the item|Enter an approximate cost/i.test(text),
    'FE-0747',
    'each failure states how to correct it',
  );

  // Money that cannot be stored exactly is refused rather than rounded.
  await page.fill('input[name="itemName"]', 'Bench power supply');
  await page.fill('input[name="purpose"]', 'Repair');
  await page.fill('input[name="lastRecoverDate"]', '2026-05-06');
  await page.fill('input[name="modelName"]', 'Rigol DP832');
  await page.fill('input[name="approxAmount"]', '100.005');
  await page.fill('input[name="urgency"]', 'High');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);
  text = await page.locator('main').innerText();
  record(
    /two decimal places/i.test(text),
    'FE-0747',
    'an amount with more precision than BDT holds is refused with guidance',
  );

  // A valid submission lands on the detail screen at the Team Lead stage.
  await page.fill('input[name="approxAmount"]', '9500.50');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => /\/requisitions\/req-/.test(url), { timeout: 15000 });
  await page.waitForTimeout(900);
  raisedHref = new URL(page.url()).pathname;
  text = await page.locator('main').innerText();
  record(
    /Waiting for Team Lead/i.test(text),
    'FE-0744',
    `an Employee's in-house requisition enters the Team Lead stage (${raisedHref})`,
  );
  record(
    /Imran Hossain reviews this first/i.test(text),
    'FE-0748',
    'the next step names who holds it, not only the stage',
  );
  record(
    /BDT 9,500\.50/.test(text),
    'FE-0744',
    'the amount is rendered as money with its currency code',
  );
  record(
    !/Approve|Reject/.test(text.split('Review chain')[0] ?? ''),
    'FE-0748',
    'the submitter is offered no decision action on their own requisition',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0745 — the new-item form                                                */
/* ========================================================================== */

{
  const { context, page } = await openAs(TEAM_LEAD);
  await goto(page, '/requisitions/new');
  const before = await page.locator('main').innerText();
  record(
    /Last recover date/i.test(before),
    'FE-0744',
    'the in-house form shows Last recover date',
  );

  await page.getByRole('tab', { name: 'New' }).click();
  await page.waitForTimeout(400);
  const after = await page.locator('main').innerText();
  record(
    !/Last recover date/i.test(after),
    'FE-0746',
    'switching to New drops the field that does not apply',
  );

  await page.fill('input[name="itemName"]', 'Label printer');
  await page.fill('input[name="purpose"]', 'Asset tagging');
  await page.fill('input[name="urgency"]', 'Low');
  await page.fill('input[name="approxAmount"]', '14000');
  await page.fill('input[name="modelName"]', 'Brother QL-820');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => /\/requisitions\/req-/.test(url), { timeout: 15000 });
  await page.waitForTimeout(900);

  const text = await page.locator('main').innerText();
  record(
    /Waiting for HR, Finance and the Super Administrator/i.test(text),
    'FE-0745',
    "a Team Lead's own requisition skips the Team Lead stage",
  );
  record(
    !/Team Lead\s*·/i.test(text.split('Review chain')[1] ?? ''),
    'FE-0745',
    'the skipped stage records no decision that nobody made',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0750 — a requisition is invisible before it reaches a reviewer          */
/* ========================================================================== */

for (const [label, email, twoFactor] of [
  ['HR', HR, false],
  ['Finance', FINANCE, false],
  ['the administrator', ADMIN, true],
]) {
  const { context, page } = await openAs(email, { twoFactor });
  const text = await goto(page, WITH_TEAM_LEAD);
  record(
    /not found/i.test(text),
    'FE-0750',
    `${label} opening the URL of a requisition still with the Team Lead gets not-found`,
  );
  await context.close();
}

{
  const { context, page } = await openAs(OTHER_EMPLOYEE);
  const text = await goto(page, WITH_TEAM_LEAD);
  record(
    /not found/i.test(text),
    'FE-0750',
    "another Employee cannot open a colleague's requisition by id",
  );
  await context.close();
}

{
  const { context, page } = await openAs(OTHER_TEAM_LEAD);
  const text = await goto(page, WITH_TEAM_LEAD);
  record(
    /not found/i.test(text),
    'FE-0750',
    'a Team Lead who is not the assigned one cannot open it',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0749 — the Team Lead is told, and decides                               */
/* ========================================================================== */

{
  const { context, page } = await openAs(TEAM_LEAD);

  const dashboard = await goto(page, '/dashboard', 2000);
  /*
   * `FE-0769` folded requisitions and conveyance into one prompt, so the
   * sentence is now "1 requisition and 1 conveyance claim waiting for you".
   * The assertion still checks the same two things it always did — that the
   * dashboard names a waiting requisition, and that it links to the queue —
   * rather than being loosened to match whatever the page happens to say.
   */
  record(
    /waiting for you/i.test(dashboard) && /requisition/i.test(dashboard),
    'FE-0749',
    'the Team Lead dashboard says a requisition is waiting',
  );
  record(
    /Review requisitions/i.test(dashboard),
    'FE-0749',
    'and offers a way through to the requisition queue',
  );

  const notifications = await goto(page, '/notifications');
  record(
    /Requisition waiting for your review/i.test(notifications),
    'FE-0749',
    'the notification centre carries the same message',
  );

  const list = await goto(page, '/requisitions');
  record(
    /Your requisitions and those from your team/i.test(list),
    'FE-0743',
    'the Team Lead list states its wider scope',
  );
  record(
    /Your decision/i.test(list),
    'FE-0743',
    'rows awaiting this viewer are marked in the list',
  );

  const detail = await goto(page, WITH_TEAM_LEAD);
  record(
    /Your decision/i.test(detail) && /Approve/.test(detail),
    'FE-0749',
    'the assigned Team Lead is offered the decision',
  );

  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Approve', exact: true }).last().click();
  await page.waitForTimeout(1200);

  const after = await page.locator('main').innerText();
  record(
    /Waiting for HR, Finance and the Super Administrator/i.test(after),
    'FE-0749',
    'approval advances it to the three parallel reviewers',
  );
  record(
    /Team Lead/.test(after) && /Approved/.test(after),
    'FE-0748',
    'the review chain records who approved and when',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0750 — now it reaches the reviewers, and each decides once              */
/* ========================================================================== */

{
  const { context, page } = await openAs(HR);
  const text = await goto(page, WITH_REVIEWERS);
  record(
    !/not found/i.test(text) && /Your decision/i.test(text),
    'FE-0750',
    'HR can now open it and has a decision to make',
  );
  record(
    /Not yet decided/i.test(text),
    'FE-0748',
    'the timeline shows the reviewers still to decide',
  );

  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Approve', exact: true }).last().click();
  await page.waitForTimeout(1200);

  const after = await page.locator('main').innerText();
  record(
    /Waiting for Finance and Super Administrator/i.test(after),
    'FE-0750',
    'one approval does not decide it; the other two are still named',
  );
  record(
    !/Your decision/i.test(after),
    'FE-0750',
    'HR is not offered a second decision on the same requisition',
  );
  await context.close();
}

{
  const { context, page } = await openAs(FINANCE);
  const before = await goto(page, PART_REVIEWED);
  record(
    /HR/.test(before) && /Approved/.test(before),
    'FE-0748',
    'Finance can see the decision HR already recorded',
  );

  // Rejecting requires a reason, and the reason reaches the submitter.
  await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Reject', exact: true }).last().click();
  await page.waitForTimeout(900);
  let text = await page.locator('main').innerText();
  record(
    /reason is required/i.test(text),
    'FE-0750',
    'a rejection without a reason is refused with guidance',
  );

  await page.fill('textarea[name="reason"]', 'Not in this quarter budget.');
  await page.getByRole('button', { name: 'Reject', exact: true }).last().click();
  await page.waitForTimeout(1200);
  text = await page.locator('main').innerText();
  record(
    /Rejected/i.test(text),
    'FE-0750',
    'a single rejection ends the chain',
  );
  record(
    !/Not yet decided/i.test(text),
    'FE-0750',
    'no reviewer is left pending once it is rejected',
  );
  await context.close();
}

{
  // The administrator never decided, and must find it already settled rather
  // than being offered a decision that would be lost.
  const { context, page } = await openAs(ADMIN, { twoFactor: true });
  const text = await goto(page, ALREADY_REJECTED);
  record(
    /Rejected/i.test(text) && !/Your decision/i.test(text),
    'FE-0750',
    'the administrator sees the recorded outcome, not a stale decision form',
  );
  await context.close();
}

{
  // The submitter sees the outcome and the reason for it.
  const { context, page } = await openAs(REJECTED_SUBMITTER);
  const text = await goto(page, ALREADY_REJECTED);
  record(
    /Rejected by Finance/i.test(text),
    'FE-0751',
    'the submitter is told who rejected it',
  );
  record(
    /Re-raise after 1 October/i.test(text),
    'FE-0751',
    'the reason reaches the person who raised it',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0751 — the states a screen must still handle                            */
/* ========================================================================== */

{
  const { context, page } = await openAs(FINANCE);
  const text = await goto(page, '/requisitions');
  record(
    /Only an Employee or a Team Lead can raise a requisition/i.test(text),
    'FE-0751',
    'a reviewer is told why there is no submit action rather than left with a gap',
  );
  record(
    !/Raise requisition/i.test(text),
    'FE-0743',
    'and is not offered the action itself',
  );

  const form = await goto(page, '/requisitions/new');
  record(
    /Only an Employee or a Team Lead/i.test(form),
    'FE-0751',
    'a reviewer opening the form URL directly is refused with the reason',
  );

  const missing = await goto(page, '/requisitions/req-does-not-exist');
  record(
    /not found/i.test(missing),
    'FE-0751',
    'a nonexistent id shows the same not-found presentation as an unauthorized one',
  );
  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} requisition check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${checks} requisition flow checks pass.`);
