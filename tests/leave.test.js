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

  const managerToken = jwt.signToken({
    userId: 'u_mgr_test',
    empId: 'e0000001-0000-0000-0000-000000000003',
    username: 'manager',
    role: 'MANAGER'
  });

  before(async () => {
    // Khởi chạy leave-service trên cổng kiểm thử độc lập :3104
    leaveProcess = fork(path.resolve(__dirname, '..', 'services', 'leave-service', 'index.js'), [], {
      env: {
        ...process.env,
        LEAVE_SERVICE_PORT: String(LEAVE_PORT),
        NODE_ENV: 'test'
      }
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
      await pool.query(`
        INSERT INTO leave_requests (id, emp_id, leave_type_id, start_date, end_date, total_days, reason, attachment_url, status, approver_id)
        VALUES ('NP-2026-024', 'e0000001-0000-0000-0000-000000000004', 'lt000001-0000-0000-0000-000000000001', '2026-11-02', '2026-11-02', 1.0, 'Tôi xin nghỉ phép để giải quyết công việc gia đình.', 'Bien-ban-ban-giao.pdf', 'PENDING', 'e0000001-0000-0000-0000-000000000003')
        ON DUPLICATE KEY UPDATE status = 'PENDING', reason = VALUES(reason), attachment_url = VALUES(attachment_url)
      `);
    } catch (err) {
      console.warn('Error seeding NP-2026-024:', err.message);
    }
  });

  after(async () => {
    try {
      const pool = db.getPool(process.env.LEAVE_DB_NAME || 'htqlns_leave');
      await pool.query("DELETE FROM leave_requests WHERE (emp_id LIKE 'e_test_%' OR emp_id LIKE 'e0000001-%' OR reason LIKE '%thủ tục hành chính%' OR reason LIKE '%việc riêng%' OR reason LIKE '%test%') AND id != 'NP-2026-024'");
      await pool.query("UPDATE leave_requests SET status = 'PENDING' WHERE id = 'NP-2026-024'");
      await pool.query("UPDATE leave_balances SET used_days = 0.0, pending_days = 0.0 WHERE emp_id LIKE 'e0000001-%'");
    } catch {}
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
    assert.ok(data.status === 'UP' || data.status === 'ok');
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

  // 13. Chặn tự duyệt đơn nghỉ phép của chính mình (HTTP 403)
  test('Chặn người dùng (Manager) tự phê duyệt đơn nghỉ phép của chính mình (HTTP 403)', async () => {
    // Manager gửi đơn xin nghỉ cá nhân
    const createRes = await fetch(`http://localhost:${LEAVE_PORT}/api/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leave_type_id: 'lt000001-0000-0000-0000-000000000001',
        start_date: '2026-12-01',
        end_date: '2026-12-01',
        total_days: 1.0,
        reason: 'Nghỉ cá nhân giải quyết việc riêng'
      })
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const managerLeaveId = createData.data?.id || createData.id;
    assert.ok(managerLeaveId);

    // Manager cố tình tự duyệt đơn của chính mình -> phải bị chặn HTTP 403
    const approveRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${managerLeaveId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        comment: 'Tự duyệt đơn của mình'
      })
    });
    assert.strictEqual(approveRes.status, 403);
    const approveErr = await approveRes.json();
    assert.strictEqual(approveErr.success, false);
    assert.match(approveErr.error || approveErr.message, /Không được phép tự duyệt đơn/);

    // 14. Admin có quyền duyệt thay (Override) đơn nghỉ phép của Manager (HTTP 200)
    const overrideRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${managerLeaveId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        comment: 'Admin duyệt thay cấp quản lý'
      })
    });
    assert.strictEqual(overrideRes.status, 200);
    const overrideData = await overrideRes.json();
    assert.strictEqual(overrideData.success, true);
    assert.strictEqual(overrideData.data.status, 'APPROVED');
    assert.strictEqual(overrideData.data.override, true);
  });

  // 15. Nhân viên tự xóa đơn nghỉ phép PENDING của chính mình thành công (HTTP 200)
  test('Nhân viên tự xóa đơn nghỉ phép PENDING của chính mình thành công (HTTP 200)', async () => {
    const createRes = await fetch(`http://localhost:${LEAVE_PORT}/api/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leaveTypeId: 'lt000001-0000-0000-0000-000000000001',
        startDate: '2026-12-10',
        endDate: '2026-12-10',
        totalDays: 1.0,
        reason: 'Đơn test tự động xóa của nhân viên'
      })
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const tempLeaveId = createData.data?.id || createData.id;
    assert.ok(tempLeaveId);

    const delRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${tempLeaveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);
  });

  // 16. Nhân viên cố tình xóa đơn của người khác bị chặn (HTTP 403)
  test('Nhân viên cố tình xóa đơn của người khác bị chặn (HTTP 403)', async () => {
    const createRes = await fetch(`http://localhost:${LEAVE_PORT}/api/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leaveTypeId: 'lt000001-0000-0000-0000-000000000001',
        startDate: '2026-12-11',
        endDate: '2026-12-11',
        totalDays: 1.0,
        reason: 'Đơn của Manager test quyền xóa'
      })
    });
    assert.strictEqual(createRes.status, 201);
    const mgrLeaveData = await createRes.json();
    const mgrLeaveId = mgrLeaveData.data?.id || mgrLeaveData.id;

    const delRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${mgrLeaveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(delRes.status, 403);
    const errData = await delRes.json();
    assert.strictEqual(errData.success, false);

    const cleanupRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${mgrLeaveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(cleanupRes.status, 200);
  });

  // 17. Nhân viên không được xóa đơn đã phê duyệt (HTTP 400)
  test('Nhân viên không được xóa đơn đã phê duyệt (HTTP 400)', async () => {
    assert.ok(createdLeaveId);
    const delRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${createdLeaveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(delRes.status, 400);
    const errData = await delRes.json();
    assert.strictEqual(errData.success, false);
  });

  // 18. Admin có quyền xóa đơn đã phê duyệt hoặc bất kỳ đơn nào (HTTP 200)
  test('Admin có quyền xóa đơn đã phê duyệt hoặc bất kỳ đơn nào (HTTP 200)', async () => {
    assert.ok(createdLeaveId);
    const delRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leave-requests/${createdLeaveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);
  });

  // ============================================================================
  // BUG-21: CHUẨN HÓA ĐƯỜNG DẪN & TRA CỨU ID / REQUEST_CODE (POST /api/v1/leaves/:id/decision)
  // ============================================================================
  test('[BUG-21] Quản lý duyệt đơn nghỉ phép qua chuẩn POST /api/v1/leaves/:id/decision bằng UUID (HTTP 200)', async () => {
    // 1. Tạo mới đơn nghỉ phép để nhận UUID
    const createRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leaves`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leaveTypeId: 'lt000001-0000-0000-0000-000000000001',
        startDate: '2026-12-18',
        endDate: '2026-12-18',
        totalDays: 1.0,
        reason: 'Nghỉ phép test BUG-21 chuẩn hóa POST endpoint'
      })
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const leaveUuid = createData.data?.id;
    assert.ok(leaveUuid);

    // 2. Tra cứu chi tiết đơn qua GET /api/v1/leaves/:id
    const getRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leaves/${leaveUuid}`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.data.id, leaveUuid);

    // 3. Quản lý gọi POST /api/v1/leaves/:id/decision truyền UUID -> HTTP 200
    const decisionRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leaves/${leaveUuid}/decision`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVE',
        comment: 'Đã phê duyệt đơn xin nghỉ phép qua hệ thống'
      })
    });
    assert.strictEqual(decisionRes.status, 200);
    const decisionData = await decisionRes.json();
    assert.strictEqual(decisionData.success, true);
    assert.strictEqual(decisionData.data.status, 'APPROVED');

    // Dọn dẹp
    await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leaves/${leaveUuid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  test('[BUG-21] Backend hỗ trợ tra cứu và phê duyệt theo cả mã hiển thị request_code (NP-2026-024) (HTTP 200)', async () => {
    // Đảm bảo đơn NP-2026-024 ở trạng thái PENDING
    const pool = db.getPool(process.env.LEAVE_DB_NAME || 'htqlns_leave');
    await pool.query("UPDATE leave_requests SET status = 'PENDING' WHERE id = 'NP-2026-024' OR request_code = 'NP-2026-024'");

    // 1. Tra cứu theo mã hiển thị request_code qua GET /api/v1/leaves/NP-2026-024
    const getRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leaves/NP-2026-024`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.ok(getData.data);

    // 2. Quản lý duyệt đơn bằng POST /api/v1/leaves/NP-2026-024/decision
    const decisionRes = await fetch(`http://localhost:${LEAVE_PORT}/api/v1/leaves/NP-2026-024/decision`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        comment: 'Quản lý duyệt đơn theo mã hiển thị'
      })
    });
    assert.strictEqual(decisionRes.status, 200);
    const decisionData = await decisionRes.json();
    assert.strictEqual(decisionData.success, true);
    assert.strictEqual(decisionData.data.status, 'APPROVED');

    // Reset lại status để không ảnh hưởng test khác
    await pool.query("UPDATE leave_requests SET status = 'PENDING' WHERE id = 'NP-2026-024' OR request_code = 'NP-2026-024'");
  });
});
