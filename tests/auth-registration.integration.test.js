const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('../shared/jwt');
const db = require('../shared/db');

describe('Auth + Organization registration transaction', () => {
  const port = 3111;
  const url = `http://127.0.0.1:${port}`;
  const authDb = db.getPool(process.env.AUTH_DB_NAME || 'htqlns_auth');
  const orgDb = db.getPool(process.env.ORGANIZATION_DB_NAME || 'htqlns_organization');
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `new-${suffix}@example.test`;
  const otherEmail = `existing-${suffix}@example.test`;
  const adminJwt = jwt.signToken({ userId: 'integration-admin', role: 'ADMIN' });
  let child, userId, empId;

  before(async () => {
    // Simulate an employee record that must not be claimed by an unrelated registration.
    await orgDb.query(
      `INSERT INTO employees (id, code, full_name, email, join_date, status)
       VALUES (?, ?, ?, ?, CURDATE(), 'ACTIVE')`,
      [crypto.randomUUID(), `E-${suffix}`, 'Existing Employee', otherEmail]
    );
    child = fork(path.resolve(__dirname, '../services/auth-service/index.js'), [], {
      env: { ...process.env, AUTH_PORT: String(port), NODE_ENV: 'test' }, stdio: 'pipe'
    });
    let healthy = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch(url + '/health');
        if (response.ok) { healthy = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.ok(healthy, 'Auth did not become healthy');
  });

  after(async () => {
    if (userId) {
      await authDb.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
      await authDb.query('DELETE FROM users WHERE id = ?', [userId]);
    }
    await orgDb.query('DELETE FROM employees WHERE email IN (?, ?)', [email, otherEmail]);
    if (child) child.kill();
    await db.closeAllPools();
  });

  test('public registration creates matching rows in both databases', async () => {
    const res = await fetch(url + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `user_${suffix}`, email, password: 'password123',
        first_name: 'New', last_name: 'Employee', biometric_enabled: true
      })
    });
    const payload = await res.json();
    assert.equal(res.status, 201, JSON.stringify(payload));
    userId = payload.data.id;
    empId = payload.data.emp_id;
    assert.ok(empId);
    const [[account]] = await authDb.query('SELECT emp_id, role, biometric_enabled FROM users WHERE id = ?', [userId]);
    const [[employee]] = await orgDb.query('SELECT id, email FROM employees WHERE id = ?', [empId]);
    assert.equal(account.emp_id, empId);
    assert.equal(account.role, 'EMPLOYEE');
    assert.equal(Number(account.biometric_enabled), 0);
    assert.equal(employee.email, email);
  });

  test('public registration cannot claim an existing personnel email', async () => {
    const res = await fetch(url + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `claim_${suffix}`, email: otherEmail, password: 'password123' })
    });
    assert.equal(res.status, 403);
    const [[count]] = await authDb.query('SELECT COUNT(*) AS total FROM users WHERE email = ?', [otherEmail]);
    assert.equal(Number(count.total), 0);
  });

  test('admin cannot link to an unknown employee ID', async () => {
    const res = await fetch(url + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({
        username: `admin_link_${suffix}`,
        email: `missing-${suffix}@example.test`,
        password: 'password123', role: 'MANAGER', emp_id: crypto.randomUUID()
      })
    });
    assert.equal(res.status, 400);
    const [[count]] = await authDb.query('SELECT COUNT(*) AS total FROM users WHERE username = ?', [`admin_link_${suffix}`]);
    assert.equal(Number(count.total), 0);
  });
});
