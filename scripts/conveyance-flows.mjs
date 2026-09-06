/**
 * `FE-0773` — conveyance flow verification. Requires a server on :3000.
 *
 * The chain itself is proven by the requisition gate, since both workflows run
 * on the same implementation after `FE-0760`. What this walks is what a browser
 * can prove and a unit test cannot: that the read-only date/time is real, that
 * the optional upload is genuinely optional on screen, that a receipt is
 * unreachable to someone who cannot see its claim, and that a reviewer opening
 * a URL early is refused.
 *
 * Cross-role steps stand on fixtures for the same reason the requisition gate
 * does: the mock store lives for one page load, so a claim submitted in one
 * browser context does not exist in another.
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
const REJECTED_SUBMITTER = 'sumaiya.noor@demo.local'; // claimed `cnv-5`

const WITH_TEAM_LEAD = '/conveyance/cnv-1'; // no receipt
const WITH_REVIEWERS = '/conveyance/cnv-2'; // has a receipt
const PART_REVIEWED = '/conveyance/cnv-3'; // HR already approved
const ALREADY_REJECTED = '/conveyance/cnv-5';

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

console.log(`Conveyance flow verification against ${baseUrl}\n`);

/* ========================================================================== */
/* FE-0763 — navigation and reach                                             */
/* ========================================================================== */

{
  const { context, page } = await openAs(EMPLOYEE);
  const nav = await page.locator('nav').first().innerText();
  record(/Conveyance/i.test(nav), 'FE-0763', 'an Employee sees Conveyance in the sidebar');

  const text = await goto(page, '/conveyance');
  record(
    /Conveyance claims you have raised/i.test(text),
    'FE-0764',
    'the list states whose claims these are',
  );
  record(/New claim/i.test(text), 'FE-0764', 'an Employee is offered the submit action');
  await context.close();
}

{
  const { context, page } = await openAs(MANAGEMENT);
  const nav = await page.locator('nav').first().innerText();
  record(
    !/Conveyance/i.test(nav),
    'FE-0763',
    'Management is not offered Conveyance in navigation',
  );
  const text = await goto(page, '/conveyance');
  record(
    /do not have access|not available|denied|permission/i.test(text),
    'FE-0763',
    'Management typing the URL directly is denied',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0765, FE-0766, FE-0767 — the form                                       */
/* ========================================================================== */

let claimedHref = null;

{
  const { context, page } = await openAs(EMPLOYEE);
  await goto(page, '/conveyance/new');

  // The read-only date/time must carry a real value, not an empty box.
  const submittedAt = await page.inputValue('input[name="submittedAt"]');
  record(
    submittedAt.trim().length > 0 && /2026/.test(submittedAt),
    'FE-0765',
    `the date/time field is pre-filled from the service ("${submittedAt}")`,
  );
  const readOnly = await page.getAttribute('input[name="submittedAt"]', 'readonly');
  record(readOnly !== null, 'FE-0765', 'the date/time field is not editable');
  record(
    (await page.getAttribute('input[name="submittedAt"]', 'disabled')) === null,
    'FE-0765',
    'and is read-only rather than disabled, so it stays reachable by keyboard',
  );

  // An empty submit reports its own errors with guidance.
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);
  let text = await page.locator('main').innerText();
  record(
    /required/i.test(text) && /could not be submitted/i.test(text),
    'FE-0767',
    'an empty form reports field-level errors rather than the browser bubble',
  );
  record(
    /Enter the business you travelled to|Enter what the journey cost/i.test(text),
    'FE-0767',
    'each failure states how to correct it',
  );

  // "Other" reveals a required description.
  await page.getByRole('radio', { name: 'Other' }).check();
  await page.waitForTimeout(300);
  text = await page.locator('main').innerText();
  record(
    /Describe the mode/i.test(text),
    'FE-0765',
    'choosing Other reveals the required description',
  );
  await page.getByRole('radio', { name: 'Uber' }).check();
  await page.waitForTimeout(300);
  record(
    !/Describe the mode/i.test(await page.locator('main').innerText()),
    'FE-0765',
    'and it disappears again when the mode no longer needs it',
  );

  // A future journey is refused.
  await page.fill('input[name="businessName"]', 'Meghna Group');
  await page.fill('input[name="clientName"]', 'Meghna Group');
  await page.fill('input[name="visitedDate"]', '2026-12-01');
  await page.fill('input[name="visitedTime"]', '10:00');
  await page.fill('input[name="amount"]', '480.50');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);
  text = await page.locator('main').innerText();
  record(
    /future/i.test(text),
    'FE-0767',
    'a journey in the future is refused with guidance',
  );

  // Money that cannot be stored exactly is refused rather than rounded.
  await page.fill('input[name="visitedDate"]', '2026-08-28');
  await page.fill('input[name="amount"]', '10.005');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);
  record(
    /two decimal places/i.test(await page.locator('main').innerText()),
    'FE-0767',
    'an amount with more precision than BDT holds is refused',
  );

  // A valid claim, deliberately with no receipt: the upload is optional.
  await page.fill('input[name="amount"]', '480.50');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => /\/conveyance\/cnv-/.test(url), { timeout: 15000 });
  await page.waitForTimeout(900);
  claimedHref = new URL(page.url()).pathname;
  text = await page.locator('main').innerText();
  record(
    /Waiting for Team Lead/i.test(text),
    'FE-0765',
    `an Employee's claim enters the Team Lead stage (${claimedHref})`,
  );
  record(
    /No receipt was attached/i.test(text) && /optional/i.test(text),
    'FE-0766',
    'a claim submitted without a receipt is complete, and says so',
  );
  record(
    /BDT 480\.50/.test(text),
    'FE-0767',
    'the amount is rendered as money with its currency code',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0765 — a Team Lead's own claim skips the Team Lead stage                */
/* ========================================================================== */

{
  const { context, page } = await openAs(TEAM_LEAD);
  await goto(page, '/conveyance/new');
  await page.fill('input[name="businessName"]', 'Westbridge Capital');
  await page.fill('input[name="clientName"]', 'Westbridge Capital');
  await page.fill('input[name="visitedDate"]', '2026-08-29');
  await page.fill('input[name="visitedTime"]', '09:15');
  await page.fill('input[name="amount"]', '900');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => /\/conveyance\/cnv-/.test(url), { timeout: 15000 });
  await page.waitForTimeout(900);

  const text = await page.locator('main').innerText();
  record(
    /Waiting for HR, Finance and the Super Administrator/i.test(text),
    'FE-0765',
    "a Team Lead's own claim skips the Team Lead stage",
  );
  record(
    !/Team Lead\s*·/i.test(text.split('Review chain')[1] ?? ''),
    'FE-0765',
    'and records no decision that nobody made',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0771 — the claim, and its receipt, are invisible before they arrive     */
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
    'FE-0771',
    `${label} opening a claim still with the Team Lead gets not-found`,
  );
  await context.close();
}

{
  const { context, page } = await openAs(OTHER_EMPLOYEE);
  const text = await goto(page, WITH_TEAM_LEAD);
  record(
    /not found/i.test(text),
    'FE-0771',
    "another Employee cannot open a colleague's claim by id",
  );
  await context.close();
}

{
  const { context, page } = await openAs(OTHER_TEAM_LEAD);
  const text = await goto(page, WITH_TEAM_LEAD);
  record(
    /not found/i.test(text),
    'FE-0771',
    'a Team Lead who is not the assigned one cannot open it',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0769 — the Team Lead is told, and decides                               */
/* ========================================================================== */

{
  const { context, page } = await openAs(TEAM_LEAD);

  const dashboard = await goto(page, '/dashboard', 2000);
  record(
    /waiting for you/i.test(dashboard) && /conveyance claim/i.test(dashboard),
    'FE-0769',
    'the Team Lead dashboard names the conveyance claim waiting',
  );
  record(
    /requisition/i.test(dashboard),
    'FE-0769',
    'and folds requisitions into the same prompt rather than a second banner',
  );

  const notifications = await goto(page, '/notifications');
  record(
    /Conveyance claim waiting for your review/i.test(notifications),
    'FE-0769',
    'the notification centre carries the same message',
  );

  const list = await goto(page, '/conveyance');
  record(
    /Your conveyance claims and those from your team/i.test(list),
    'FE-0764',
    'the Team Lead list states its wider scope',
  );

  const detail = await goto(page, WITH_TEAM_LEAD);
  record(
    /Your decision/i.test(detail) && /Approve/.test(detail),
    'FE-0769',
    'the assigned Team Lead is offered the decision',
  );

  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Approve', exact: true }).last().click();
  await page.waitForTimeout(1200);

  const after = await page.locator('main').innerText();
  record(
    /Waiting for HR, Finance and the Super Administrator/i.test(after),
    'FE-0769',
    'approval advances it to the three parallel reviewers',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0770, FE-0771 — reviewers, and the receipt they may now see            */
/* ========================================================================== */

{
  const { context, page } = await openAs(HR);
  const text = await goto(page, WITH_REVIEWERS);
  record(
    !/not found/i.test(text) && /Your decision/i.test(text),
    'FE-0770',
    'HR can open a claim that has reached them, and has a decision to make',
  );
  record(
    /shuttle-receipt\.pdf/i.test(text),
    'FE-0771',
    'the receipt is visible to a reviewer the claim has reached',
  );
  record(
    /Not yet decided/i.test(text),
    'FE-0768',
    'the timeline shows the reviewers still to decide',
  );

  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Approve', exact: true }).last().click();
  await page.waitForTimeout(1200);

  const after = await page.locator('main').innerText();
  record(
    /Waiting for Finance and Super Administrator/i.test(after),
    'FE-0770',
    'one approval does not decide it; the others are still named',
  );
  record(
    !/Your decision/i.test(after),
    'FE-0770',
    'HR is not offered a second decision on the same claim',
  );
  await context.close();
}

{
  const { context, page } = await openAs(FINANCE);
  const before = await goto(page, PART_REVIEWED);
  record(
    /HR/.test(before) && /Approved/.test(before),
    'FE-0768',
    'Finance can see the decision HR already recorded',
  );

  await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Reject', exact: true }).last().click();
  await page.waitForTimeout(900);
  record(
    /reason is required/i.test(await page.locator('main').innerText()),
    'FE-0770',
    'a rejection without a reason is refused with guidance',
  );

  await page.fill('textarea[name="reason"]', 'Fuel slip does not match the route claimed.');
  await page.getByRole('button', { name: 'Reject', exact: true }).last().click();
  await page.waitForTimeout(1200);
  const text = await page.locator('main').innerText();
  record(/Rejected/i.test(text), 'FE-0770', 'a single rejection ends the chain');
  record(
    !/Not yet decided/i.test(text),
    'FE-0770',
    'no reviewer is left pending once it is rejected',
  );
  await context.close();
}

{
  const { context, page } = await openAs(REJECTED_SUBMITTER);
  const text = await goto(page, ALREADY_REJECTED);
  record(/Rejected by Finance/i.test(text), 'FE-0772', 'the claimant is told who rejected it');
  record(
    /Re-submit with one attached/i.test(text),
    'FE-0772',
    'the reason reaches the person who claimed',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0772 — the states a screen must still handle                            */
/* ========================================================================== */

{
  const { context, page } = await openAs(FINANCE);
  const text = await goto(page, '/conveyance');
  record(
    /Only an Employee or a Team Lead can raise a conveyance claim/i.test(text),
    'FE-0772',
    'a reviewer is told why there is no submit action',
  );
  record(!/New claim/i.test(text), 'FE-0764', 'and is not offered the action itself');

  const form = await goto(page, '/conveyance/new');
  record(
    /Only an Employee or a Team Lead/i.test(form),
    'FE-0772',
    'a reviewer opening the form URL directly is refused with the reason',
  );

  const missing = await goto(page, '/conveyance/cnv-does-not-exist');
  record(
    /not found/i.test(missing),
    'FE-0772',
    'a nonexistent id shows the same not-found presentation as an unauthorized one',
  );
  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} conveyance check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${checks} conveyance flow checks pass.`);
