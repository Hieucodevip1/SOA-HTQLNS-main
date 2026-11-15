/**
 * Regression checks for signed identity enforcement without a database.
 * Run: npm run test:security
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServiceApp, requireAuth } = require('../shared/service-base');
const jwt = require('../shared/jwt');

describe('Protected service endpoints', () => {
  const app = createServiceApp('security-regression', { port: 0 });
  app.get('/protected', requireAuth(['ADMIN']), (req, res) => {
    res.json({ success: true, role: req.user.role });
  });

  let server;
  let baseUrl;
  before(async () => {
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('forged x-user without JWT is rejected', async () => {
    const forged = Buffer.from(JSON.stringify({ role: 'ADMIN', userId: 'attacker' })).toString('base64');
    const res = await fetch(`${baseUrl}/protected`, { headers: { 'x-user': forged } });
    assert.equal(res.status, 401);
  });

  test('a valid employee token cannot access admin route', async () => {
    const token = jwt.signToken({ userId: 'staff', role: 'EMPLOYEE' });
    const res = await fetch(`${baseUrl}/protected`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 403);
  });

  test('a valid admin token accesses admin route', async () => {
    const token = jwt.signToken({ userId: 'admin', role: 'ADMIN' });
    const res = await fetch(`${baseUrl}/protected`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).role, 'ADMIN');
  });

  test('a forged x-user cannot override a valid employee token', async () => {
    const token = jwt.signToken({ userId: 'staff', role: 'EMPLOYEE' });
    const forged = Buffer.from(JSON.stringify({ role: 'ADMIN', userId: 'attacker' })).toString('base64');
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: `Bearer ${token}`, 'x-user': forged }
    });
    assert.equal(res.status, 403);
  });

  test('an invalid JWT is rejected', async () => {
    const res = await fetch(`${baseUrl}/protected`, { headers: { Authorization: 'Bearer invalid.token.value' } });
    assert.equal(res.status, 401);
  });
});
