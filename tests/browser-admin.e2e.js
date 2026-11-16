/**
 * Interactive Chromium smoke test. Run after starting all services with seeded MySQL.
 * CI installs Playwright just for this test so app runtime dependencies stay minimal.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';
const EMPLOYEE_ACCOUNT_ID = 'u0000001-0000-0000-0000-000000000004';

async function signIn(browser, username) {
  const context = await browser.newContext({ viewport: {width: 1440, height: 900} });
  const page = await context.newPage();
  page.on('dialog', async dialog => dialog.accept());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#loginUsername').fill(username);
  await page.locator('#loginPassword').fill('123456');
  await page.locator('#btnLoginAction').click();
  await page.locator('#portalApp').waitFor({ state: 'visible', timeout: 20000 });
  return { context, page };
}
async function waitForResponse(page, predicate, click) {
  const reply = page.waitForResponse(predicate, {timeout: 15000});
  await click();
  const res = await reply;
  assert.equal(res.status(), 200, 'Unexpected API response ' + res.url());
  return res;
}

async function run() {
  const browser = await chromium.launch({headless:true, args: ['--no-sandbox']});
  try {
    const admin = await signIn(browser, 'admin');
    try {
      const page = admin.page;
      await waitForResponse(page, r => r.url().includes('/api/auth/users') && r.request().method() === 'GET',
        () => page.locator('#nav-rbac').click());
      await page.locator('#rbacUsersTableBody tr').first().waitFor();
      assert.ok(await page.locator('#rbacUsersTableBody tr').count() >= 3);
      const ownId = 'u0000001-0000-0000-0000-000000000001';
      assert.equal(await page.locator('#rbac-status-' + ownId).isDisabled(), true);

      // Lock/unlock an existing seeded employee. Confirm the server result each time.
      const userRow = page.locator('#rbac-status-' + EMPLOYEE_ACCOUNT_ID).locator('xpath=ancestor::tr');
      await page.locator('#rbac-status-' + EMPLOYEE_ACCOUNT_ID).selectOption('LOCKED');
      const updatedLOCKED = page.waitForResponse(r =>
        r.url().includes('/api/auth/users/' + EMPLOYEE_ACCOUNT_ID + '/status') &&
        r.request().method() === 'PUT', { timeout: 15000 });
      const refreshedLOCKED = page.waitForResponse(r =>
        r.url().endsWith('/api/auth/users') && r.request().method() === 'GET', { timeout: 15000 });
      await userRow.getByRole('button', {name:'Lưu trạng thái'}).click();
      assert.equal((await updatedLOCKED).status(), 200);
      await refreshedLOCKED;
      await page.waitForFunction(id => document.querySelector('#rbac-status-' + id)?.value === 'LOCKED',
        EMPLOYEE_ACCOUNT_ID);
      await page.locator('#rbac-status-' + EMPLOYEE_ACCOUNT_ID).selectOption('ACTIVE');
      const updatedACTIVE = page.waitForResponse(r =>
        r.url().includes('/api/auth/users/' + EMPLOYEE_ACCOUNT_ID + '/status') &&
        r.request().method() === 'PUT', { timeout: 15000 });
      const refreshedACTIVE = page.waitForResponse(r =>
        r.url().endsWith('/api/auth/users') && r.request().method() === 'GET', { timeout: 15000 });
      await userRow.getByRole('button', {name:'Lưu trạng thái'}).click();
      assert.equal((await updatedACTIVE).status(), 200);
      await refreshedACTIVE;
      await page.waitForFunction(id => document.querySelector('#rbac-status-' + id)?.value === 'ACTIVE',
        EMPLOYEE_ACCOUNT_ID);

      await waitForResponse(page, r => r.url().includes('/api/organization/audit-logs'),
        () => page.locator('#nav-departments').click());
      await page.locator('#auditLogsPanel').waitFor({state:'visible'});
      await page.locator('#departmentsTableFullBody').waitFor();

      await waitForResponse(page, r => r.url().includes('/api/v1/leave-types') && r.request().method() === 'GET',
        () => page.locator('#nav-requests').click());
      await page.locator('#leaveTypeAdminPanel').waitFor({state:'visible'});
      await page.getByRole('button',{name:'+ Thêm loại phép'}).click();
      const code = 'BROWSE' + Date.now().toString().slice(-9);
      await page.locator('#newLeaveTypeCode').fill(code);
      await page.locator('#newLeaveTypeName').fill('Phép trình duyệt kiểm thử');
      await page.locator('#newLeaveTypeMaxDays').fill('3');
      const posted = page.waitForResponse(r =>
        r.url().includes('/api/v1/leave-types') && r.request().method() === 'POST', {timeout:15000});
      await page.locator('#btnCreateLeaveType').click();
      assert.equal((await posted).status(), 201);
      await page.locator('#leaveTypesAdminTableBody').getByText(code).waitFor({timeout:10000});

      await page.locator('#nav-shifts').click();
      await page.locator('#tabBtnShifts').click();
      await page.locator('#tableBodyShiftsList').getByRole('button',{name:'Ngừng dùng'}).first()
        .waitFor({timeout:12000});
    } finally { await admin.context.close(); }

    const hr = await signIn(browser, 'hr_admin');
    try {
      assert.equal(await hr.page.locator('#nav-departments').isVisible(), true);
      await hr.page.locator('#nav-departments').click();
      assert.equal(await hr.page.locator('#auditLogsPanel').isVisible(), false);
      await hr.page.locator('#nav-requests').click();
      assert.equal(await hr.page.locator('#leaveTypeAdminPanel').isVisible(), true);
    } finally { await hr.context.close(); }

    const employee = await signIn(browser, 'employee');
    try {
      assert.equal(await employee.page.locator('#nav-rbac').isVisible(), false);
      assert.equal(await employee.page.locator('#nav-departments').isVisible(), false);
      await employee.page.locator('#nav-requests').click();
      assert.equal(await employee.page.locator('#leaveTypeAdminPanel').isVisible(), false);
    } finally { await employee.context.close(); }

    console.log('Browser smoke PASS: ADMIN role/status, audit, leave-type creation, shifts; HR and EMPLOYEE visibility.');
  } finally { await browser.close(); }
}

run().catch(err=>{console.error(err);process.exitCode=1;});
