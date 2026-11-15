/**
 * tests/leave.test.js
 * Bộ kiểm thử tự động cho Leave Service (feature/04-leave)
 * Phân hệ Quản lý Nghỉ phép & Quỹ phép năm
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');
const env = require('../shared/env');
const db = require('../shared/db');

describe('Kiểm thử Phân hệ Leave Service (:3104)', () => {
  let leaveProcess = null;
  const LEAVE_PORT = 3104;

  const adminToken = jwt.signToken({
    userId: 'u_admin_test',
    empId: 'e0000001-0000-0000-0000-000000000001',
    username: 'admin',
    role: 'ADMIN'
  });

  const employeeToken = jwt.signToken({
    userId: 'u_emp_leave_test',
    empId: 'e0000001-0000-0000-0000-000000000004',
    username: 'employee',
    role: 'EMPLOYEE'
  });

  before(async () => {
    // Khởi chạy leave-service trên cổng kiểm thử độc lập :3104
    leaveProcess = fork(path.resolve(__dirname, '..', 'services', 'leave-service', 'index.js'), [], {
      env: {
        ...process.env,
        LEAVE_SERVICE_PORT: String(LEAVE_PORT),
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    // Chờ service sẵn sàng
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${LEAVE_PORT}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Đảm bảo tính idempotent: Khôi phục số dư phép mẫu cho tài khoản test
    try {
      const pool = db.getPool(process.env.LEAVE_DB_NAME || 'htqlns_leave');
      await pool.query('UPDATE leave_balances SET used_days = 2.0, pending_days = 0.0 WHERE emp_id = ?', ['e0000001-0000-0000-0000-000000000004']);
      await pool.query("UPDATE leave_requests SET status = 'PENDING' WHERE id = 'NP-2026-024'");
    } catch {}
  });

  after(async () => {
    if (leaveProcess) leaveProcess.kill();
    try {
      await db.closeAllPools();
    } catch {}
  });

  // 1. Health check
  test('Health check /health trả về UP và database UP', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'UP');
    assert.strictEqual(data.service, 'leave-service');
  });

  // 2. Tra cứu danh mục loại nghỉ phép
  test('Tra cứu danh mục loại nghỉ phép /api/leave/types (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave/types`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);
  });

  // 3. Nhân viên không có quyền tạo loại nghỉ phép mới (HTTP 403)
  test('Từ chối khi Nhân viên tạo loại nghỉ phép mới (HTTP 403)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave/types`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'TEST_FAIL',
        name: 'Loại phép thử nghiệm lỗi'
      })
    });
    assert.strictEqual(res.status, 403);
  });

  // 4. Admin tạo loại nghỉ phép mới (HTTP 201)
  const testTypeCode = `TEST_LV_${Date.now()}`;
  test('Admin tạo loại nghỉ phép mới thành công (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave/types`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: testTypeCode,
        name: 'Nghỉ phép đào tạo nội bộ (Training Leave)',
        isPaid: true,
        maxDaysPerYear: 5.0
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.code, testTypeCode);
  });

  // 5. Tra cứu quỹ phép năm của nhân viên
  test('Tra cứu quỹ phép năm của nhân viên /api/leave/balances (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave/balances`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);
  });

  // 6. Lấy chi tiết đơn nghỉ phép mẫu NP-2026-024 (Figma Image 3)
  test('Lấy chi tiết đơn nghỉ phép NP-2026-024 (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave/NP-2026-024`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.id, 'NP-2026-024');
    assert.strictEqual(data.data.status, 'PENDING');
    assert.strictEqual(data.data.attachment_url, 'Bien-ban-ban-giao.pdf');
  });

  // 7. Nhân viên tạo đơn xin nghỉ phép mới (HTTP 201)
  let createdLeaveId = null;
  test('Nhân viên gửi đơn xin nghỉ phép thành công (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leaveTypeId: 'lt000001-0000-0000-0000-000000000001',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        totalDays: 1.0,
        session: 'FULL_DAY',
        reason: 'Nghỉ giải quyết thủ tục hành chính tại cơ quan địa phương',
        attachmentUrl: 'giay-hen.pdf'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id);
    createdLeaveId = data.data.id;
  });

  // 8. Từ chối tạo đơn khi số ngày nghỉ vượt quá quỹ phép còn lại (HTTP 400)
  test('Từ chối khi số ngày xin nghỉ vượt quá quỹ phép còn lại (HTTP 400)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leaveTypeId: 'lt000001-0000-0000-0000-000000000001',
        startDate: '2026-12-01',
        endDate: '2026-12-25',
        totalDays: 20.0, // Vượt quá quỹ phép 12 ngày
        session: 'FULL_DAY',
        reason: 'Xin nghỉ dài ngày du lịch cuối năm'
      })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('không đủ'));
  });

  // 9. Lấy danh sách đơn xin nghỉ phép (HTTP 200)
  test('Lấy danh sách đơn xin nghỉ phép /api/leave (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/leave`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);
  });

  // 10. Quản lý / Quản trị viên duyệt đơn nghỉ phép (HTTP 200)
  test('Quản lý phê duyệt đơn nghỉ phép thành công (HTTP 200)', async () => {
    assert.ok(createdLeaveId);
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${createdLeaveId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
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

  // 11. Từ chối duyệt lại đơn đã xử lý (HTTP 400)
  test('Từ chối duyệt đơn đã được xử lý (HTTP 400)', async () => {
    assert.ok(createdLeaveId);
    const res = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${createdLeaveId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'REJECTED',
        rejectReason: 'Không thể từ chối đơn đã duyệt'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // 12. Internal monthly summary API (bảo mật bằng x-internal-key)
  test('Internal API /internal/leaves/monthly-summary yêu cầu x-internal-key', async () => {
    // Không có key -> 403 Forbidden
    const resNoKey = await fetch(`http://localhost:${LEAVE_PORT}/internal/leaves/monthly-summary?month=11&year=2026`);
    assert.strictEqual(resNoKey.status, 403);

    // Có key hợp lệ -> 200 OK
    const resWithKey = await fetch(`http://localhost:${LEAVE_PORT}/internal/leaves/monthly-summary?month=11&year=2026`, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    assert.strictEqual(resWithKey.status, 200);
    const data = await resWithKey.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
  });
});
