/**
 * tests/shift.test.js
 * Bộ kiểm thử tự động cho Shift Service (feature/shift-and-ot & feature/05-shift-ot)
 * Phân hệ Quản lý Ca làm việc, Phân ca & Tăng ca OT (SCR_SHIFT_01, SCR_OT_01, SCR_OT_02, SCR_ADM_03)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');
const env = require('../shared/env');

describe('Kiểm thử Phân hệ Shift Service (:3105)', () => {
  let shiftProcess = null;
  const SHIFT_PORT = 3105;

  const adminToken = jwt.signToken({
    userId: 'u_admin_test',
    empId: 'e0000001-0000-0000-0000-000000000001',
    username: 'admin',
    role: 'ADMIN'
  });

  const managerToken = jwt.signToken({
    userId: 'u_mgr_test',
    empId: 'e0000001-0000-0000-0000-000000000003',
    username: 'manager',
    role: 'MANAGER'
  });

  const employeeToken = jwt.signToken({
    userId: 'u_emp_shift_test',
    empId: 'e0000001-0000-0000-0000-000000000004',
    username: 'employee',
    role: 'EMPLOYEE'
  });

  let createdShiftId = null;
  let createdOtRequestId = null;

  before(async () => {
    // Khởi chạy shift-service trên cổng kiểm thử độc lập :3105
    shiftProcess = fork(path.resolve(__dirname, '..', 'services', 'shift-service', 'index.js'), [], {
      env: {
        ...process.env,
        SHIFT_SERVICE_PORT: String(SHIFT_PORT),
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    // Chờ service sẵn sàng
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${SHIFT_PORT}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  after(async () => {
    try {
      const db = require('../shared/db');
      const pool = db.getPool('htqlns_shift');
      if (createdShiftId) {
        await pool.query('DELETE FROM shift_assignments WHERE shift_id = ?', [createdShiftId]).catch(() => {});
        await pool.query('DELETE FROM shifts WHERE id = ? OR code LIKE "CA_TEST_%"', [createdShiftId]).catch(() => {});
      } else {
        await pool.query('DELETE FROM shifts WHERE code LIKE "CA_TEST_%"').catch(() => {});
      }
      if (createdOtRequestId) {
        await pool.query('DELETE FROM overtime_requests WHERE id = ?', [createdOtRequestId]).catch(() => {});
      }
      await db.closeAllPools().catch(() => {});
    } catch {}
    if (shiftProcess) shiftProcess.kill();
  });

  // 1. Health check
  test('Health check /health trả về UP và database UP', async () => {
    const res = await fetch(`http://localhost:${SHIFT_PORT}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.status === 'UP' || data.status === 'ok');
    assert.strictEqual(data.service, 'shift-service');
  });

  // 2. Tra cứu danh mục ca làm việc
  test('Tra cứu danh mục ca làm việc /api/v1/shifts (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/shifts`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);
  });

  // 3. Nhân viên không có quyền tạo ca làm việc mới (HTTP 403)
  test('Từ chối khi Nhân viên tạo ca làm việc mới (HTTP 403)', async () => {
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/shifts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'TEST_DENIED',
        name: 'Ca nhân viên tự tạo',
        startTime: '08:00:00',
        endTime: '17:00:00'
      })
    });
    assert.strictEqual(res.status, 403);
  });

  // 4. Admin tạo ca làm việc mới (HTTP 201)
  const testShiftCode = `CA_TEST_${Date.now().toString().slice(-6)}`;
  test('Admin tạo ca làm việc mới thành công (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/shifts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: testShiftCode,
        name: 'Ca Kiểm Thử Tự Động',
        startTime: '07:30:00',
        endTime: '16:30:00',
        breakMinutes: 60,
        graceLateMinutes: 15,
        workingHours: 8.0
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.code, testShiftCode);
    createdShiftId = data.data.id;
  });

  // 5. Tra cứu chi tiết một ca làm việc (HTTP 200)
  test('Tra cứu chi tiết một ca làm việc theo ID (HTTP 200)', async () => {
    assert.ok(createdShiftId, 'createdShiftId phải tồn tại');
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/shifts/${createdShiftId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.id, createdShiftId);
  });

  // 6. Admin cập nhật ca làm việc (HTTP 200)
  test('Admin cập nhật thông tin ca làm việc (HTTP 200)', async () => {
    assert.ok(createdShiftId, 'createdShiftId phải tồn tại');
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/shifts/${createdShiftId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Ca Kiểm Thử Tự Động (Đã Cập Nhật)',
        graceLateMinutes: 20
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.name, 'Ca Kiểm Thử Tự Động (Đã Cập Nhật)');
    assert.strictEqual(data.data.grace_late_minutes, 20);
  });

  // 7. Manager phân ca cho nhân viên (HTTP 201)
  test('Quản lý phân ca làm việc cho nhân viên thành công (HTTP 201)', async () => {
    assert.ok(createdShiftId, 'createdShiftId phải tồn tại');
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/shift-assignments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        empIds: ['e0000001-0000-0000-0000-000000000004'],
        shiftId: createdShiftId,
        workDates: ['2026-11-20'],
        note: 'Kiểm thử phân ca dự án'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  // 8. Tra cứu lịch phân ca có đầy đủ thông tin nhân viên & ca (HTTP 200)
  test('Tra cứu lịch phân ca trả về dữ liệu chuẩn hoá (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/shift-assignments?fromDate=2026-11-20&toDate=2026-11-20`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    const assigned = data.data.find((a) => a.emp_id === 'e0000001-0000-0000-0000-000000000004');
    assert.ok(assigned, 'Phải tìm thấy ca đã phân');
    assert.ok(assigned.emp_name);
    assert.ok(assigned.shift_name);
  });

  // 9. Nhân viên gửi đơn đăng ký tăng ca OT (HTTP 201)
  test('Nhân viên gửi đơn đăng ký tăng ca OT thành công (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/ot-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workDate: '2026-11-21',
        startTime: '18:00:00',
        endTime: '21:00:00',
        totalHours: 3.0,
        otType: 'WEEKDAY',
        reason: 'Triển khai bảo trì hệ thống máy chủ'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'PENDING');
    assert.strictEqual(Number(data.data.total_hours), 3.0);
    createdOtRequestId = data.data.id;
  });

  // 10. Tra cứu danh sách đơn tăng ca (HTTP 200)
  test('Tra cứu danh sách đơn tăng ca kèm thông tin nhân viên (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/ot-requests`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    const ot = data.data.find((o) => o.id === createdOtRequestId);
    assert.ok(ot, 'Phải tìm thấy đơn OT vừa tạo');
    assert.strictEqual(ot.status, 'PENDING');
  });

  // 11. Quản lý phê duyệt đơn tăng ca (HTTP 200)
  test('Quản lý phê duyệt đơn đăng ký tăng ca (HTTP 200)', async () => {
    assert.ok(createdOtRequestId, 'createdOtRequestId phải tồn tại');
    const res = await fetch(`http://localhost:${SHIFT_PORT}/api/v1/ot-requests/${createdOtRequestId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'APPROVED');
  });

  // 12. Internal API: Lấy ca làm việc cho attendance-service (HTTP 200)
  test('Internal API /internal/shifts/schedule bảo mật x-internal-key (HTTP 403 & HTTP 200)', async () => {
    // Không có key -> 403
    const resNoKey = await fetch(`http://localhost:${SHIFT_PORT}/internal/shifts/schedule?empId=e0000001-0000-0000-0000-000000000004&date=2026-11-20`);
    assert.strictEqual(resNoKey.status, 403);

    // Có key -> 200
    const res = await fetch(`http://localhost:${SHIFT_PORT}/internal/shifts/schedule?empId=e0000001-0000-0000-0000-000000000004&date=2026-11-20`, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data);
    assert.strictEqual(data.data.shift_id, createdShiftId);
  });

  // 13. Internal API: Tổng hợp giờ OT tháng cho payroll-service (HTTP 200)
  test('Internal API /internal/ot/summary bảo mật x-internal-key (HTTP 403 & HTTP 200)', async () => {
    // Không có key -> 403
    const resNoKey = await fetch(`http://localhost:${SHIFT_PORT}/internal/ot/summary?month=11&year=2026`);
    assert.strictEqual(resNoKey.status, 403);

    // Có key -> 200
    const res = await fetch(`http://localhost:${SHIFT_PORT}/internal/ot/summary?month=11&year=2026`, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    const empOt = data.data.find((o) => o.emp_id === 'e0000001-0000-0000-0000-000000000004');
    assert.ok(empOt, 'Phải tìm thấy tổng giờ OT của nhân viên đã duyệt');
    assert.ok(Number(empOt.total_ot_hours) >= 3.0);
  });
});
