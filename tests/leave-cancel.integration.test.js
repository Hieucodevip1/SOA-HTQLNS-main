/**
 * Integration test: pending leave cancellation restores reserved quota.
 * Requires MySQL schemas seeded via npm run db:init.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('../shared/jwt');
const db = require('../shared/db');

describe('Leave cancellation integration', () => {
  const port = 3114;
  const base = `http://127.0.0.1:${port}`;
  const pool = db.getPool(process.env.LEAVE_DB_NAME || 'htqlns_leave');
  const empId = crypto.randomUUID();
  const otherId = crypto.randomUUID();
  const token = jwt.signToken({ userId: crypto.randomUUID(), empId, role: 'EMPLOYEE' });
  const otherToken = jwt.signToken({ userId: crypto.randomUUID(), empId: otherId, role: 'EMPLOYEE' });
  let child, leaveTypeId, requestId;
  let startDate;

  before(async () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 10);
    while ([0,6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
    startDate = d.toISOString().slice(0, 10);
    const [[lt]] = await pool.query("SELECT id FROM leave_types WHERE code = 'AL' LIMIT 1");
    assert.ok(lt, 'Seed an active Annual Leave type with npm run db:init');
    leaveTypeId = lt.id;
    child = fork(path.resolve(__dirname, '..', 'services', 'leave-service', 'index.js'), [], {
      env: { ...process.env, LEAVE_SERVICE_PORT: String(port), NODE_ENV: 'test' }, stdio: 'pipe'
    });
    let ready = false;
    for (let n = 0; n < 45; n++) {
      try { const r = await fetch(base + '/health'); if (r.ok) { ready = true; break; } }
      catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(ready, true, 'Leave service did not become healthy');
  });

  after(async () => {
    if (requestId) await pool.query('DELETE FROM leave_requests WHERE id = ?', [requestId]);
    await pool.query('DELETE FROM leave_balances WHERE emp_id = ?', [empId]);
    if (child) child.kill();
    await db.closeAllPools();
  });

  test('employee submits a leave request with server-calculated days', async () => {
    const res = await fetch(base + '/api/v1/leave-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaveTypeId, startDate, endDate: startDate, session: 'FULL_DAY', reason: 'Integration test leave' })
    });
    assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
    requestId = (await res.json()).data.id;
    const [[balance]] = await pool.query(
      'SELECT pending_days FROM leave_balances WHERE emp_id = ? AND leave_type_id = ?', [empId, leaveTypeId]
    );
    assert.equal(Number(balance.pending_days), 1);
  });

  test('another employee cannot view private leave details', async () => {
    const res = await fetch(base + `/api/v1/leave-requests/${requestId}`, {
      headers: { Authorization: `Bearer ${otherToken}` }
    });
    assert.equal(res.status, 403);
  });

  test('another employee may not cancel a request', async () => {
    const res = await fetch(base + `/api/v1/leave-requests/${requestId}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${otherToken}` }
    });
    assert.equal(res.status, 403);
  });

  test('employee cancels own request and restores pending balance', async () => {
    const res = await fetch(base + `/api/v1/leave-requests/${requestId}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200);
    const [[request]] = await pool.query('SELECT status FROM leave_requests WHERE id = ?', [requestId]);
    assert.equal(request.status, 'CANCELLED');
    const [[balance]] = await pool.query('SELECT pending_days FROM leave_balances WHERE emp_id = ?', [empId]);
    assert.equal(Number(balance.pending_days), 0);
  });

  test('canceling again does not reduce quota a second time', async () => {
    const res = await fetch(base + `/api/v1/leave-requests/${requestId}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 409);
  });
});
