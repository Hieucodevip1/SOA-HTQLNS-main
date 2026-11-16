/**
 * Integration test: swap requests, authorization, atomic exchange, schedule discovery.
 * Requires MySQL schemas seeded via npm run db:init.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('../shared/jwt');
const env = require('../shared/env');
const db = require('../shared/db');

describe('Shift swapping integration', () => {
  const port = 3115;
  const base = `http://127.0.0.1:${port}`;
  const pool = db.getPool(process.env.SHIFT_DB_NAME || 'htqlns_shift');
  const empA = crypto.randomUUID(), empB = crypto.randomUUID();
  const idA = crypto.randomUUID(), idB = crypto.randomUUID();
  const employeeToken = jwt.signToken({ userId: crypto.randomUUID(), empId: empA, role: 'EMPLOYEE' });
  const otherToken = jwt.signToken({ userId: crypto.randomUUID(), empId: empB, role: 'EMPLOYEE' });
  const adminToken = jwt.signToken({ userId: crypto.randomUUID(), empId: crypto.randomUUID(), role: 'ADMIN' });
  let child, shiftA, shiftB, date, swapId, secondSwapId;

  before(async () => {
    const [shifts] = await pool.query("SELECT id FROM shifts WHERE status = 'ACTIVE' ORDER BY code LIMIT 2");
    assert.ok(shifts.length >= 2, 'Seed at least two active shifts using npm run db:init');
    [shiftA, shiftB] = shifts.map(s => s.id);
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 14);
    date = d.toISOString().slice(0, 10);
    for (const [id, emp, shift] of [[idA, empA, shiftA], [idB, empB, shiftB]]) {
      await pool.query(
        `INSERT INTO shift_assignments (id, emp_id, shift_id, work_date, status)
         VALUES (?, ?, ?, ?, 'SCHEDULED')`, [id, emp, shift, date]
      );
    }
    child = fork(path.resolve(__dirname, '..', 'services', 'shift-service', 'index.js'), [], {
      env: { ...process.env, SHIFT_SERVICE_PORT: String(port), NODE_ENV: 'test' }, stdio: 'pipe'
    });
    let ready = false;
    for (let n = 0; n < 45; n++) {
      try { const r = await fetch(base + '/health'); if (r.ok) { ready = true; break; } }
      catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(ready, true, 'Shift service did not become healthy');
  });

  after(async () => {
    await pool.query('DELETE FROM shift_swaps WHERE requester_assignment_id IN (?, ?) OR target_assignment_id IN (?, ?)',
      [idA, idB, idA, idB]);
    await pool.query('DELETE FROM shift_assignments WHERE id IN (?, ?)', [idA, idB]);
    if (child) child.kill();
    await db.closeAllPools();
  });

  test('employee finds same-date swap candidates', async () => {
    const res = await fetch(base + `/api/v1/shift-swaps/candidates?date=${date}`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok((await res.json()).data.some(a => a.id === idB));
  });

  test('employee creates a swap request (pending)', async () => {
    const res = await fetch(base + '/api/v1/shift-swaps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterAssignmentId: idA, targetAssignmentId: idB, reason: 'Test exchange of shifts' })
    });
    assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
    swapId = (await res.json()).data.id;
  });

  test('employee cannot approve a swap', async () => {
    const res = await fetch(base + `/api/v1/shift-swaps/${swapId}/decision`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${otherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVED' })
    });
    assert.equal(res.status, 403);
  });

  test('manager approval exchanges shifts and internal schedule uses swapped assignment', async () => {
    const res = await fetch(base + `/api/v1/shift-swaps/${swapId}/decision`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVED' })
    });
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    const [rows] = await pool.query('SELECT id, shift_id, status FROM shift_assignments WHERE id IN (?, ?)', [idA, idB]);
    assert.equal(rows.find(r => r.id === idA).shift_id, shiftB);
    assert.equal(rows.find(r => r.id === idB).shift_id, shiftA);
    assert.ok(rows.every(r => r.status === 'SWAPPED'));
    const internal = await fetch(base + `/internal/shifts/schedule?empId=${empA}&date=${date}`, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    assert.equal(internal.status, 200);
    assert.equal((await internal.json()).data.shift_id, shiftB);
  });

  test('request cannot be approved twice', async () => {
    const res = await fetch(base + `/api/v1/shift-swaps/${swapId}/decision`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVED' })
    });
    assert.equal(res.status, 409);
  });

  test('request owner can cancel another pending request', async () => {
    const create = await fetch(base + '/api/v1/shift-swaps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterAssignmentId: idA, targetAssignmentId: idB, reason: 'Cancel me' })
    });
    assert.equal(create.status, 201);
    secondSwapId = (await create.json()).data.id;
    const cancel = await fetch(base + `/api/v1/shift-swaps/${secondSwapId}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.equal(cancel.status, 200);
  });
});
