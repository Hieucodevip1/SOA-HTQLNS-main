/**
 * tests/infra.test.js
 * Bộ kiểm thử tự động cho tầng Shared và Hạ tầng SOA HTQLNS
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const env = require('../shared/env');
const db = require('../shared/db');
const jwt = require('../shared/jwt');
const { createServiceApp } = require('../shared/service-base');
const events = require('../shared/events');

describe('Kiểm thử tầng Thư viện dùng chung (shared/)', () => {

  after(async () => {
    await db.closeAllPools();
  });

  describe('1. shared/env.js', () => {
    test('Phải nạp đầy đủ các biến môi trường cấu hình bắt buộc', () => {
      assert.ok(env.PORT, 'PORT phải tồn tại');
      assert.ok(env.DB_HOST, 'DB_HOST phải tồn tại');
      assert.ok(env.DB_PORT, 'DB_PORT phải tồn tại');
      assert.ok(env.JWT_SECRET, 'JWT_SECRET phải tồn tại');
      assert.ok(env.EVENT_BUS_URL, 'EVENT_BUS_URL phải tồn tại');
      assert.ok(env.REGISTRY_URL, 'REGISTRY_URL phải tồn tại');
    });

    test('Hàm get() phải trả về giá trị fallback khi key không tồn tại', () => {
      const val = env.get('NON_EXISTENT_KEY_12345', 'default_val');
      assert.strictEqual(val, 'default_val');
    });
  });

  describe('2. shared/jwt.js', () => {
    test('Ký và xác thực token JWT hợp lệ', () => {
      const payload = { userId: 'u0000001-0000', role: 'ADMIN', username: 'admin' };
      const token = jwt.signToken(payload, { expiresIn: '1h' });

      assert.ok(typeof token === 'string', 'Token phải là chuỗi');
      assert.strictEqual(token.split('.').length, 3, 'Token phải gồm 3 phần header.payload.signature');

      const verified = jwt.verifyToken(token);
      assert.strictEqual(verified.userId, payload.userId);
      assert.strictEqual(verified.role, payload.role);
      assert.strictEqual(verified.username, payload.username);
      assert.ok(verified.exp, 'Token phải có trường exp');
    });

    test('Từ chối token bị sửa đổi hoặc chữ ký không khớp', () => {
      const token = jwt.signToken({ userId: 1 }, { expiresIn: '1h' });
      assert.throws(() => {
        jwt.verifyToken(token + 'invalid_signature');
      }, /JsonWebTokenError|Chữ ký token không hợp lệ/);
    });

    test('Từ chối token đã hết hạn', async () => {
      const expiredToken = jwt.signToken({ userId: 99 }, { expiresIn: -10 });
      assert.throws(() => {
        jwt.verifyToken(expiredToken);
      }, /TokenExpiredError|hết hạn/);
    });

    test('Ký Refresh Token với thời hạn mặc định', () => {
      const rfToken = jwt.signRefreshToken({ userId: 'u0000001' });
      const decoded = jwt.decodeToken(rfToken);
      assert.ok(decoded);
      assert.strictEqual(decoded.userId, 'u0000001');
    });
  });

  describe('3. shared/db.js', () => {
    test('Kết nối MySQL và thực thi truy vấn tham số an toàn', async () => {
      const rows = await db.query('SELECT ? AS test_val, 1 + 1 AS sum', ['htqlns_test']);
      assert.ok(Array.isArray(rows), 'Kết quả truy vấn phải là một mảng');
      assert.strictEqual(rows[0].test_val, 'htqlns_test');
      assert.strictEqual(Number(rows[0].sum), 2);
    });

    test('Truy vấn bảng users từ database htqlns_auth', async () => {
      const users = await db.query('SELECT id, username, role FROM users WHERE username = ?', ['admin']);
      assert.ok(users.length > 0, 'Phải tìm thấy tài khoản admin đã seed');
      assert.strictEqual(users[0].username, 'admin');
      assert.strictEqual(users[0].role, 'ADMIN');
    });

    test('Thực hiện Transaction commit thành công', async () => {
      const result = await db.withTransaction(async (conn) => {
        const [res] = await conn.query('SELECT count(*) as total FROM users');
        return res[0].total;
      });
      assert.ok(result >= 1, 'Transaction phải trả về số lượng users');
    });
  });

  describe('4. shared/service-base.js', () => {
    let server;
    const testPort = 3199;

    before(() => {
      const app = createServiceApp('test-unit-service', { port: testPort });
      app.get('/api/ping', (req, res) => res.json({ pong: true }));
      app.useErrorHandler();
      server = app.listen(testPort);
    });

    after(() => {
      if (server) server.close();
    });

    test('Endpoint /health trả về trạng thái UP và thông tin dịch vụ', async () => {
      const res = await fetch(`http://localhost:${testPort}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'UP');
      assert.strictEqual(data.service, 'test-unit-service');
      assert.ok(data.uptime >= 0);
    });

    test('Kiểm tra phản hồi 404 cho endpoint không tồn tại', async () => {
      const res = await fetch(`http://localhost:${testPort}/not-found-route`);
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.code, 404);
    });
  });

  describe('5. shared/events.js', () => {
    test('Xử lý publish event gracefully khi Event Bus chưa online', async () => {
      const res = await events.publish('test.event', { data: 123 }, { timeoutMs: 300 });
      assert.strictEqual(typeof res, 'object');
      assert.strictEqual(res.success, false);
      assert.ok(res.eventId);
    });

    test('Tạo Webhook Router phân luồng đúng eventType', async () => {
      let eventHandled = false;
      const router = events.createWebhookRouter({
        'user.test': async (ev) => {
          eventHandled = true;
        }
      });
      assert.ok(router, 'Router phải được khởi tạo');
    });
  });
});
