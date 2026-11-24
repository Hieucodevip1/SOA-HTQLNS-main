/**
 * tests/notification.test.js
 * Bộ kiểm thử tự động cho Notification Service (:3107)
 * Phân hệ Quản lý Thông báo & Cảnh báo Xuyên suốt (SCR_NOTIF_01)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');
const env = require('../shared/env');
const db = require('../shared/db');

describe('Kiểm thử Phân hệ Notification Service (:3107)', () => {
  let notifProcess = null;
  const NOTIF_PORT = 3107;
  const pool = db.getPool('htqlns_notification');

  const adminToken = jwt.signToken({
    userId: 'u_admin_notif_test',
    empId: 'e_admin_notif_test',
    username: 'admin',
    role: 'ADMIN'
  });

  const hrAdminToken = jwt.signToken({
    userId: 'u_hr_notif_test',
    empId: 'e_hr_notif_test',
    username: 'hr_admin',
    role: 'HR_ADMIN'
  });

  const managerToken = jwt.signToken({
    userId: 'u_mgr_notif_test',
    empId: 'e_mgr_test_notif',
    username: 'manager',
    role: 'MANAGER'
  });

  const employeeToken = jwt.signToken({
    userId: 'u_emp_notif_test',
    empId: 'e_emp_test_notif',
    username: 'employee',
    role: 'EMPLOYEE'
  });

  let testNotifId = null;

  before(async () => {
    // Khởi chạy notification-service trên cổng kiểm thử độc lập :3107
    notifProcess = fork(path.resolve(__dirname, '..', 'services', 'notification-service', 'index.js'), [], {
      env: {
        ...process.env,
        NOTIFICATION_SERVICE_PORT: String(NOTIF_PORT),
        NODE_ENV: 'test'
      }
    });

    // Chờ service khởi động hoàn tất
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${NOTIF_PORT}/health`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(ready, 'Notification service không thể khởi chạy trên cổng :3107');
  });

  after(async () => {
    // Dọn dẹp dữ liệu kiểm thử
    try {
      await pool.query(
        "DELETE FROM notifications WHERE emp_id LIKE 'e_%test_notif%' OR reference_id LIKE 'req_%test%' OR reference_id LIKE 'shift_%' OR title LIKE '%kiểm thử%' OR title LIKE '%chờ tiếp nhận%'"
      );
      await db.closeAllPools().catch(() => {});
    } catch (_) {}

    if (notifProcess) {
      notifProcess.kill();
    }
  });

  test('Health check /health trả về trạng thái UP', async () => {
    const res = await fetch(`http://localhost:${NOTIF_PORT}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'UP');
    assert.equal(body.service, 'notification-service');
  });

  test('Internal API tạo thông báo trực tiếp thành công', async () => {
    const res = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        empId: 'e_emp_test_notif',
        type: 'SYSTEM',
        title: 'Thông báo kiểm thử hệ thống',
        content: 'Nội dung thông báo kiểm thử trực tiếp',
        referenceId: 'req_direct_test_1'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data?.id);
    testNotifId = body.data.id;
  });

  test('Nhận sự kiện LEAVE_REQUEST_CREATED: Tự động tạo thông báo cho Quản lý & HR_ADMIN', async () => {
    const eventRes = await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'LEAVE_REQUEST_CREATED',
        data: {
          requestId: 'req_leave_test_1',
          empId: 'e_emp_test_notif',
          employeeName: 'Nguyễn Văn Test',
          managerId: 'e_mgr_test_notif',
          startDate: '2026-11-20',
          endDate: '2026-11-22',
          totalDays: 3
        }
      })
    });

    assert.equal(eventRes.status, 200);

    // Quản lý kiểm tra thông báo
    const mgrRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.equal(mgrRes.status, 200);
    const mgrBody = await mgrRes.json();
    assert.equal(mgrBody.success, true);

    const mgrLeaveNotif = mgrBody.data.find(n => n.reference_id === 'req_leave_test_1');
    assert.ok(mgrLeaveNotif, 'Quản lý phải nhận được thông báo đơn nghỉ phép');
    assert.ok(mgrLeaveNotif.content.includes('Nguyễn Văn Test'));
    assert.ok(mgrLeaveNotif.content.includes('20/11/2026 - 22/11/2026'));

    // HR_ADMIN cũng nhận được thông báo
    const hrRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${hrAdminToken}` }
    });
    assert.equal(hrRes.status, 200);
    const hrBody = await hrRes.json();
    const hrLeaveNotif = hrBody.data.find(n => n.reference_id === 'req_leave_test_1');
    assert.ok(hrLeaveNotif, 'HR_ADMIN phải nhận được thông báo đơn nghỉ phép toàn công ty');
  });

  test('Nhận sự kiện LEAVE_REQUEST_APPROVED: Tự động gửi thông báo cho nhân viên nộp đơn', async () => {
    const eventRes = await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'LEAVE_REQUEST_APPROVED',
        data: {
          requestId: 'req_leave_test_1',
          empId: 'e_emp_test_notif',
          startDate: '2026-11-20',
          endDate: '2026-11-22'
        }
      })
    });
    assert.equal(eventRes.status, 200);

    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.equal(empRes.status, 200);
    const empBody = await empRes.json();
    const approvedNotif = empBody.data.find(n => n.title.includes('đã được phê duyệt') && n.reference_id === 'req_leave_test_1');
    assert.ok(approvedNotif, 'Nhân viên phải nhận được thông báo đơn nghỉ đã duyệt');
    assert.ok(approvedNotif.content.includes('đã được phê duyệt'));
  });

  test('Nhận sự kiện OT_REQUEST_CREATED & OT_REQUEST_APPROVED', async () => {
    // 1. Tạo đơn OT
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'OT_REQUEST_CREATED',
        data: {
          requestId: 'req_ot_test_1',
          empId: 'e_emp_test_notif',
          employeeName: 'Nguyễn Văn Test',
          managerId: 'e_mgr_test_notif',
          workDate: '2026-11-25',
          totalHours: 2.5
        }
      })
    });

    const mgrRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    const mgrBody = await mgrRes.json();
    const otCreatedNotif = mgrBody.data.find(n => n.reference_id === 'req_ot_test_1');
    assert.ok(otCreatedNotif, 'Quản lý nhận được thông báo đơn OT mới');
    assert.ok(otCreatedNotif.content.includes('25/11/2026'));

    // 2. Duyệt đơn OT
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'OT_REQUEST_APPROVED',
        data: {
          requestId: 'req_ot_test_1',
          empId: 'e_emp_test_notif',
          workDate: '2026-11-25'
        }
      })
    });

    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empBody = await empRes.json();
    const otApprovedNotif = empBody.data.find(n => n.type === 'OT_STATUS' && n.title.includes('đã được phê duyệt'));
    assert.ok(otApprovedNotif, 'Nhân viên nhận được thông báo đơn OT đã duyệt');
  });

  test('Nhận sự kiện ADJUSTMENT_REQUEST_CREATED & ADJUSTMENT_REQUEST_APPROVED', async () => {
    // 1. Tạo đơn giải trình
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'ADJUSTMENT_REQUEST_CREATED',
        data: {
          adjustmentId: 'req_adj_test_1',
          requestId: 'req_adj_test_1',
          empId: 'e_emp_test_notif',
          employeeName: 'Nguyễn Văn Test',
          managerId: 'e_mgr_test_notif',
          workDate: '2026-11-19'
        }
      })
    });

    const mgrRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    const mgrBody = await mgrRes.json();
    const adjCreatedNotif = mgrBody.data.find(n => n.reference_id === 'req_adj_test_1');
    assert.ok(adjCreatedNotif, 'Quản lý nhận được thông báo đơn giải trình mới');
    assert.ok(adjCreatedNotif.content.includes('19/11/2026'));

    // 2. Duyệt đơn giải trình
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'ADJUSTMENT_REQUEST_APPROVED',
        data: {
          adjustmentId: 'req_adj_test_1',
          empId: 'e_emp_test_notif',
          workDate: '2026-11-19'
        }
      })
    });

    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empBody = await empRes.json();
    const adjApprovedNotif = empBody.data.find(n => n.type === 'ATTENDANCE_ALERT' && n.title.includes('đã được phê duyệt'));
    assert.ok(adjApprovedNotif, 'Nhân viên nhận được thông báo giải trình đã duyệt');
  });

  test('Nhận sự kiện SHIFT_ASSIGNED: Thông báo phân ca mới cho nhân viên', async () => {
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'SHIFT_ASSIGNED',
        data: {
          empIds: ['e_emp_test_notif'],
          shiftId: 'shift_morning_01',
          shiftName: 'Ca Sáng (06:00 - 14:00)',
          workDates: ['2026-11-20', '2026-11-21', '2026-11-22']
        }
      })
    });

    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empBody = await empRes.json();
    const shiftNotif = empBody.data.find(n => n.type === 'SHIFT_ASSIGNED' && n.reference_id === 'shift_morning_01');
    assert.ok(shiftNotif, 'Nhân viên nhận được thông báo xếp ca mới');
    assert.ok(shiftNotif.content.includes('Ca Sáng'));
    assert.ok(shiftNotif.content.includes('20/11/2026 - 22/11/2026'));
    assert.equal(shiftNotif.targetPage, 'shifts');
    assert.equal(shiftNotif.targetTab, 'schedule');
  });

  test('Nhận sự kiện user.registered: Tự động tạo thông báo cho HR_ADMIN kèm metadata điều hướng tiếp nhận', async () => {
    const regRes = await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'user.registered',
        data: {
          username: 'test_nv_moi',
          fullName: 'Trần Văn Mới',
          email: 'tranvanmoi@example.com',
          role: 'EMPLOYEE'
        }
      })
    });
    assert.equal(regRes.status, 200);

    const hrRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${hrAdminToken}` }
    });
    assert.equal(hrRes.status, 200);
    const hrBody = await hrRes.json();
    const newEmpNotif = hrBody.data.find(n => n.content && n.content.includes('Trần Văn Mới'));
    assert.ok(newEmpNotif, 'HR_ADMIN phải nhận được thông báo nhân viên mới đăng ký');
    assert.equal(newEmpNotif.targetPage, 'employees');
    assert.equal(newEmpNotif.filterStatus, 'PENDING');
  });

  test('Nhận sự kiện EMPLOYEE_DEPARTMENT_ASSIGNED: Thông báo tiếp nhận vào phòng ban cho nhân viên', async () => {
    const assignRes = await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'EMPLOYEE_DEPARTMENT_ASSIGNED',
        data: {
          empId: 'e_emp_test_notif',
          userId: 'u_emp_notif_test',
          fullName: 'Nguyễn Văn Test',
          departmentId: 'd0000001-0000-0000-0000-000000000003',
          departmentName: 'Phòng Công nghệ & Phần mềm',
          message: 'Bạn đã được tiếp nhận và phân bổ vào Phòng Công nghệ & Phần mềm. Chúc bạn làm việc hiệu quả!'
        }
      })
    });
    assert.equal(assignRes.status, 200);

    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.equal(empRes.status, 200);
    const empBody = await empRes.json();
    const assignedNotif = empBody.data.find(
      n => n.type === 'SYSTEM' && n.content && n.content.includes('Phòng Công nghệ & Phần mềm')
    );
    assert.ok(assignedNotif, 'Nhân viên phải nhận được thông báo tiếp nhận vào phòng ban');
    assert.equal(assignedNotif.title, 'Tiếp nhận vào phòng ban thành công');
    assert.equal(assignedNotif.reference_id, 'd0000001-0000-0000-0000-000000000003');
    assert.equal(assignedNotif.targetPage, 'profile');
  });

  test('Tương thích ngược các luồng duyệt đơn (LEAVE_APPROVED, OT_APPROVED, ADJUSTMENT_APPROVED)', async () => {
    // 1. LEAVE_APPROVED
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'LEAVE_APPROVED',
        data: {
          empId: 'e_emp_test_notif',
          requestId: 'req_leave_alias_test',
          startDate: '2026-11-25',
          endDate: '2026-11-26'
        }
      })
    });

    // 2. OT_APPROVED
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'OT_APPROVED',
        data: {
          empId: 'e_emp_test_notif',
          requestId: 'req_ot_alias_test',
          workDate: '2026-11-25'
        }
      })
    });

    // 3. ADJUSTMENT_APPROVED
    await fetch(`http://localhost:${NOTIF_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'ADJUSTMENT_APPROVED',
        data: {
          empId: 'e_emp_test_notif',
          adjustmentId: 'req_adj_alias_test',
          workDate: '2026-11-25'
        }
      })
    });

    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empBody = await empRes.json();

    const leaveNotif = empBody.data.find(n => n.reference_id === 'req_leave_alias_test');
    assert.ok(leaveNotif, 'Nhận thông báo LEAVE_APPROVED thành công');

    const otNotif = empBody.data.find(n => n.reference_id === 'req_ot_alias_test');
    assert.ok(otNotif, 'Nhận thông báo OT_APPROVED thành công');

    const adjNotif = empBody.data.find(n => n.reference_id === 'req_adj_alias_test');
    assert.ok(adjNotif, 'Nhận thông báo ADJUSTMENT_APPROVED thành công');
  });

  test('Đánh dấu đã đọc 1 thông báo PATCH /api/v1/notifications/:id/read', async () => {
    assert.ok(testNotifId, 'Cần có testNotifId để kiểm thử');

    const readRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/${testNotifId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.equal(readRes.status, 200);
    const readBody = await readRes.json();
    assert.equal(readBody.success, true);

    // Kiểm tra lại trạng thái
    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empBody = await empRes.json();
    const updated = empBody.data.find(n => n.id === testNotifId);
    assert.equal(updated.is_read, true);
  });

  test('Đánh dấu đã đọc tất cả PATCH /api/v1/notifications/read-all', async () => {
    const readAllRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.equal(readAllRes.status, 200);

    const empRes = await fetch(`http://localhost:${NOTIF_PORT}/api/v1/notifications/my`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    const empBody = await empRes.json();
    assert.equal(empBody.unreadCount, 0, 'Toàn bộ thông báo của nhân viên phải ở trạng thái đã đọc');
  });
});
