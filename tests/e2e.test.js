/**
 * tests/e2e.test.js
 * Bộ kiểm thử Tích hợp Đầu-Cuối (End-to-End E2E Integration Tests)
 * Kiểm thử toàn diện 8 Microservices của Hệ thống HTQLNS thông qua API Gateway (:3000):
 *  1. auth-service (:3001)
 *  2. organization-service (:3002)
 *  3. attendance-service (:3003)
 *  4. leave-service (:3004)
 *  5. shift-service (:3005)
 *  6. payroll-service (:3006)
 *  7. notification-service (:3007)
 *  8. analytics-service (:3008)
 *  + Cụm Hạ tầng SOA: API Gateway (:3000), Registry (:3500), Event Bus (:3600)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('../shared/jwt');
const db = require('../shared/db');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:3500';
const EVENT_BUS_URL = process.env.EVENT_BUS_URL || 'http://localhost:3600';

describe('Kiểm thử E2E Toàn bộ 8 Microservices qua API Gateway (:3000)', () => {
  let adminToken = '';
  let employeeToken = '';
  let employeeId = 'e0000001-0000-0000-0000-000000000004';

  before(async () => {
    // Đảm bảo Gateway đã sẵn sàng
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`${GATEWAY_URL}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Đảm bảo tính idempotent: Mở kỳ lương test tháng 11/2026 để có thể tính lại
    try {
      const pool = db.getPool(process.env.PAYROLL_DB_NAME || 'htqlns_payroll');
      await pool.query("UPDATE payroll_periods SET status = 'CALCULATED' WHERE month = 11 AND year = 2026");
    } catch {}
  });

  after(async () => {
    try {
      await db.closeAllPools();
    } catch {}
  });

  // ============================================================================
  // CỤM HẠ TẦNG SOA CỐT LÕI (Gateway, Registry, Event Bus)
  // ============================================================================
  describe('Cụm Hạ tầng SOA Cốt lõi', () => {
    test('API Gateway /health phản hồi UP (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'UP');
      assert.strictEqual(data.service, 'api-gateway');
    });

    test('Service Registry /health phản hồi UP và quản lý đủ các instance dịch vụ', async () => {
      const res = await fetch(`${REGISTRY_URL}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'UP');
      assert.ok(data.instancesCount >= 8, `Số instance trong registry phải >= 8 (hiện tại: ${data.instancesCount})`);
    });

    test('Event Bus /health phản hồi UP sẵn sàng điều phối sự kiện pub/sub', async () => {
      const res = await fetch(`${EVENT_BUS_URL}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'UP');
      assert.strictEqual(data.service, 'event-bus');
    });

    test('API Gateway từ chối truy cập khi thiếu Bearer Token (HTTP 401)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/auth/me`);
      assert.strictEqual(res.status, 401);
    });
  });

  // ============================================================================
  // MICROSERVICE 1: AUTH-SERVICE (:3001)
  // ============================================================================
  describe('1. Auth Service (:3001) qua Gateway', () => {
    test('Đăng nhập tài khoản Quản trị (admin / 123456) cấp JWT Token (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: '123456' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      adminToken = data.data.token || data.data.accessToken;
      assert.ok(adminToken);
      assert.strictEqual(data.data.user.role, 'ADMIN');
    });

    test('Đăng nhập tài khoản Nhân viên (employee / 123456) (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'employee', password: '123456' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      employeeToken = data.data.token || data.data.accessToken;
      assert.ok(employeeToken);
      assert.strictEqual(data.data.user.role, 'EMPLOYEE');
      if (data.data.user.empId || data.data.user.emp_id) {
        employeeId = data.data.user.empId || data.data.user.emp_id;
      }
    });

    test('Lấy thông tin tài khoản hiện tại qua /api/auth/me (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.username, 'admin');
    });

    test('RBAC: Nhân viên thường bị cấm truy cập danh sách người dùng /api/auth/users (HTTP 403)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/auth/users`, {
        headers: { Authorization: `Bearer ${employeeToken}` }
      });
      assert.strictEqual(res.status, 403);
    });
  });

  // ============================================================================
  // MICROSERVICE 2: ORGANIZATION-SERVICE (:3002)
  // ============================================================================
  describe('2. Organization Service (:3002) qua Gateway', () => {
    test('Tra cứu danh sách cơ cấu phòng ban /api/organization/departments (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/organization/departments`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });

    test('Tra cứu danh mục vị trí việc làm /api/organization/positions (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/organization/positions`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });

    test('Tra cứu danh sách hồ sơ nhân sự /api/organization/employees (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/organization/employees`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });
  });

  // ============================================================================
  // MICROSERVICE 3: ATTENDANCE-SERVICE (:3003)
  // ============================================================================
  describe('3. Attendance Service (:3003) qua Gateway', () => {
    test('Tra cứu danh sách địa điểm chấm công /api/attendance/work-locations (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/attendance/work-locations`, {
        headers: { Authorization: `Bearer ${employeeToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });

    test('Lấy danh sách lịch sử chấm công /api/attendance (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/attendance`, {
        headers: { Authorization: `Bearer ${employeeToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });
  });

  // ============================================================================
  // MICROSERVICE 4: LEAVE-SERVICE (:3004)
  // ============================================================================
  describe('4. Leave Service (:3004) qua Gateway', () => {
    test('Tra cứu danh mục loại nghỉ phép /api/leave/types (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/leave/types`, {
        headers: { Authorization: `Bearer ${employeeToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });

    test('Tra cứu quỹ phép năm của nhân viên /api/leave/balances (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/leave/balances`, {
        headers: { Authorization: `Bearer ${employeeToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });

    test('Lấy danh sách đơn xin nghỉ phép /api/leave (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/leave`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });
  });

  // ============================================================================
  // MICROSERVICE 5: SHIFT-SERVICE (:3005)
  // ============================================================================
  describe('5. Shift Service (:3005) qua Gateway', () => {
    test('Tra cứu danh mục ca làm việc /api/v1/shifts (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/shifts`, {
        headers: { Authorization: `Bearer ${employeeToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });

    test('Tra cứu lịch phân ca nhân sự /api/v1/shift-assignments (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/shift-assignments`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });

    test('Tra cứu danh sách đơn đăng ký tăng ca OT /api/v1/ot-requests (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/ot-requests`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });
  });

  // ============================================================================
  // MICROSERVICE 6: PAYROLL-SERVICE (:3006)
  // ============================================================================
  describe('6. Payroll Service (:3006) qua Gateway', () => {
    test('Admin tra cứu cấu hình lương /api/v1/payroll-configs (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/payroll-configs`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });

    test('Admin kích hoạt chạy tính lương tự động /api/v1/payrolls/calculate (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/payrolls/calculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          month: 11,
          year: 2026,
          standardWorkingDays: 22
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });

    test('Admin tra cứu danh sách phiếu lương toàn công ty /api/v1/payslips (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/payslips?month=11&year=2026`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length >= 1);
    });

    test('Nhân viên tra cứu phiếu lương cá nhân /api/v1/payslips (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/payslips?month=11&year=2026`, {
        headers: { Authorization: `Bearer ${employeeToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
      data.data.forEach((slip) => {
        assert.strictEqual(slip.emp_id, employeeId);
      });
    });
  });

  // ============================================================================
  // MICROSERVICE 7: NOTIFICATION-SERVICE (:3007)
  // ============================================================================
  describe('7. Notification Service (:3007) qua Gateway', () => {
    test('Tra cứu thông báo hệ thống của người dùng /api/v1/notifications (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/notifications`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });
  });

  // ============================================================================
  // MICROSERVICE 8: ANALYTICS-SERVICE (:3008)
  // ============================================================================
  describe('8. Analytics Service (:3008) qua Gateway', () => {
    test('Dashboard tổng hợp chỉ số chuyên cần, OT, nghỉ phép & lương /api/v1/analytics/dashboard (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/analytics/dashboard?month=11&year=2026`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.data.kpis);
      assert.ok(typeof data.data.kpis.totalWorkDays === 'number');
      assert.ok(typeof data.data.kpis.totalNetPayroll === 'number');
    });

    test('Tra cứu danh mục cấu hình ngưỡng cảnh báo /api/v1/analytics/thresholds (HTTP 200)', async () => {
      const res = await fetch(`${GATEWAY_URL}/api/v1/analytics/thresholds`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });
  });
  test('E2E: upload và tải PDF riêng tư qua Gateway → Leave Service → MySQL', async () => {
    assert.ok(employeeToken, 'Cần đăng nhập EMPLOYEE trước khi chạy bài kiểm thử');
    const pdfBase64 = Buffer.from('%PDF-1.4\\n1 0 obj\\n<<>>\\nendobj\\n%%EOF').toString('base64');
    const upload = await fetch(GATEWAY_URL + '/api/v1/leave-attachments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + employeeToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'e2e-evidence.pdf', mediaType: 'application/pdf',
        contentBase64: pdfBase64 })
    });
    assert.equal(upload.status, 201, JSON.stringify(await upload.clone().json()));
    const payload = await upload.json();
    const url = payload.data.attachmentUrl;
    const id = payload.data.id;
    try {
      const owner = await fetch(GATEWAY_URL + url, {
        headers: { Authorization: 'Bearer ' + employeeToken }
      });
      assert.equal(owner.status, 200);
      assert.match(owner.headers.get('content-type'), /application\\/pdf/);
      assert.match(await owner.text(), /%PDF-1\\.4/);
      assert.equal((await fetch(GATEWAY_URL + url)).status, 401);
      const unrelated = jwt.signToken({userId: 'another-account', empId:'another-employee',
        role:'EMPLOYEE'});
      assert.equal((await fetch(GATEWAY_URL + url, {
        headers: { Authorization: 'Bearer ' + unrelated }
      })).status, 404);
      assert.equal((await fetch(GATEWAY_URL + url, {
        headers: { Authorization: 'Bearer ' + adminToken }
      })).status, 200);
    } finally {
      const pool = db.getPool(process.env.LEAVE_DB_NAME || 'htqlns_leave');
      await pool.query('DELETE FROM leave_attachments WHERE id = ?', [id]);
    }
  });

});
