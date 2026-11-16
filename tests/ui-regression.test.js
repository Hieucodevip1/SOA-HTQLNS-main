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
  assert.match(source, /Không tải được danh sách tài khoản/);
  assert.match(source, /Chưa có lịch sử chấm công/);
});

test('employee creation matches the Organization API and does not hard-delete', () => {
  assert.match(source, /full_name: fullName, email, phone, department_id:/);
  assert.doesNotMatch(source, /permanent=true/);
});

test('HTML escaping prevents injected tags and attribute delimiters', () => {
  const match = source.match(/function uiEscape\(value\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'uiEscape helper must exist');
  const escape = new Function(match[0] + '\nreturn uiEscape;')();
  assert.equal(escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escape("O'Neil & Sons"), 'O&#39;Neil &amp; Sons');
});
