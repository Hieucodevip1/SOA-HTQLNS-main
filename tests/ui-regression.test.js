const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../public/js/app.js'), 'utf8');

test('personnel UI does not fall back to hard-coded employees or departments', () => {
  assert.doesNotMatch(source, /\bMOCK_(?:EMPLOYEES|DEPARTMENTS)\b/);
  assert.match(source, /state\.employees = res\.data/);
  assert.match(source, /state\.departments = res\.data/);
});

test('attendance, accounts and leave history do not fabricate demonstration rows', () => {
  assert.doesNotMatch(source, /id: 'att-1'/);
  assert.doesNotMatch(source, /id: 'usr_admin'/);
  assert.doesNotMatch(source, /'NP-2026-024'/);
  assert.match(source, /Không tải được (danh sách )?tài khoản/);
  assert.match(source, /Chưa có lịch sử chấm công/);
});

test('employee creation matches the Organization API and does not hard-delete', () => {
  assert.match(source, /full_name: fullName, email, phone,\s*department_id:/);
  assert.doesNotMatch(source, /permanent=true/);
});

test('HTML escaping prevents injected tags and attribute delimiters', () => {
  const match = source.match(/function uiEscape\(value\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'uiEscape helper must exist');
  const escape = new Function(match[0] + '\nreturn uiEscape;')();
  assert.equal(escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escape("O'Neil & Sons"), 'O&#39;Neil &amp; Sons');
});


const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

test('profile changes and notifications use authenticated API endpoints', () => {
  assert.match(source, /api\/auth\/change-password/);
  assert.match(source, /api\/auth\/me/);
  assert.match(source, /api\/v1\/notifications/);
  assert.match(source, /markNotificationRead/);
  assert.match(html, /changePasswordForm/);
  assert.match(html, /profileOldPassword/);
});

test('employee, department and position screens support real Organization APIs', () => {
  assert.match(source, /openEditDepartmentModal/);
  assert.match(source, /handleUpdateDepartmentSubmit/);
  assert.match(source, /\/api\/organization\/departments\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(source, /openEditEmployeeModal/);
  assert.match(source, /handleUpdateEmployeeSubmit/);
  assert.match(source, /\/api\/organization\/employees\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(source, /api\/organization\/positions/);
  assert.match(html, /positionsTableBody/);
  assert.match(source, /position_id: positionId/);
});

test('timesheets, reports and payroll actions are backed by real APIs', () => {
  assert.match(source, /exportAttendanceCsv/);
  assert.match(source, /statRange/);
  assert.match(source, /api\/v1\/analytics\/dashboard/);
  assert.match(source, /api\/v1\/work-locations/);
  assert.match(source, /openCreatePayrollConfigModal/);
  assert.match(source, /api\/v1\/payroll-configs/);
  assert.match(source, /api\/system\/services/);
  assert.match(html, /workLocationsTableBody/);
  assert.doesNotMatch(source, /id: 'my-1'/);
});

test('registration does not advertise privileged public role or demo bypass', () => {
  assert.doesNotMatch(source, /username: 'manager',\s*role: 'MANAGER',\s*fullName: 'Thầy Lâm'/);
  assert.match(source, /const role = 'EMPLOYEE'/);
  assert.doesNotMatch(html, /option value="MANAGER"/);
  assert.match(html, /FaceID \/ Vân tay — chưa hỗ trợ/);
});


test('Attendance locations expose edit and deactivate actions with real API calls', () => {
  assert.match(source, /handleSaveWorkLocation/);
  assert.match(source, /deactivateWorkLocation/);
  assert.match(source, /\/api\/v1\/work-locations\/.*encodeURIComponent\(id\)/);
  assert.match(html, /id="workLocationsTableBody"/);
  assert.match(html, /<th>Thao tác<\/th>/);
});

test('Leave evidence uses real file input, authenticated binary upload and gated download', () => {
  assert.match(html, /type="file" id="leaveFormAttachment"/);
  assert.match(html, /id="btnDownloadLeaveAttachment"/);
  assert.match(source, /\/api\/v1\/leave-attachments/);
  assert.match(source, /FileReader/);
  assert.match(source, /contentBase64/);
  assert.match(source, /downloadLeaveAttachment/);
  assert.doesNotMatch(html, /value="Bien-ban-ban-giao\.pdf"/);
});

test('Password recovery calls real OTP endpoints and uses password-type inputs', () => {
  assert.match(source, /handleForgotEmailSubmit/);
  assert.match(source, /handleResetPasswordSubmit/);
  assert.match(source, /api\/auth\/forgot-password/);
  assert.match(source, /api\/auth\/reset-password/);
  assert.match(source, /id="resetNewPassword" type="password"/);
});


test('RBAC users expose supported Auth operations without hardcoded user fixtures', () => {
  assert.match(source, /function saveRbacRole\(/);
  assert.match(source, /function saveRbacStatus\(/);
  assert.match(source, /function deleteAuthUser\(/);
  assert.match(source, /api\/auth\/users\/' \+ encodeURIComponent\(id\) \+ '\/status'/);
  assert.match(source, /api\/auth\/users\/' \+ encodeURIComponent\(id\) \+ '\/role'/);
  assert.match(source, /validRbacTarget\(id\)/);
  assert.match(html, /id="rbacUsersTableBody"/);
  assert.doesNotMatch(source, /id: 'usr_admin'/);
});

test('Department audit logs and soft-deactivation are wired to existing API', () => {
  assert.match(source, /function deactivateDepartment\(/);
  assert.match(source, /function loadOrganizationAuditLogs\(/);
  assert.match(source, /api\/organization\/audit-logs/);
  assert.match(source, /status: 'INACTIVE'/);
  assert.match(html, /id="auditLogsPanel"/);
  assert.match(html, /id="auditLogsTableBody"/);
});

test('Leave type catalog and Shift deactivation use real backend operations', () => {
  assert.match(source, /function loadLeaveTypeAdminList\(/);
  assert.match(source, /function openCreateLeaveTypeModal\(/);
  assert.match(source, /function submitCreateLeaveType\(/);
  assert.match(source, /api\/v1\/leave-types/);
  assert.match(html, /id="leaveTypeAdminPanel"/);
  assert.match(html, /id="leaveTypesAdminTableBody"/);
  assert.match(source, /function setShiftActiveState\(/);
  assert.match(source, /api\/v1\/shifts\/' \+ encodeURIComponent\(id\)/);
});
