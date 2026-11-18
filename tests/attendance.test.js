/**
 * tests/attendance.test.js
 * Bộ kiểm thử tự động cho Attendance Service (feature/03-attendance)
 * Phân hệ Quản lý Chấm công (GPS/WiFi/FaceID) & Giải trình công
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');
const env = require('../shared/env');

describe('Kiểm thử Phân hệ Attendance Service (:3103)', () => {
  let attProcess = null;
  const ATT_PORT = 3103;

  const adminToken = jwt.signToken({
    userId: 'u_admin_test',
    empId: 'e0000001-0000-0000-0000-000000000001',
    username: 'admin',
    role: 'ADMIN'
  });

  const employeeToken = jwt.signToken({
    userId: 'u_emp_test_' + Date.now(),
    empId: 'e_test_' + Date.now(),
    username: 'test_emp',
    role: 'EMPLOYEE'
  });

  const defaultEmpToken = jwt.signToken({
    userId: 'u_emp_default',
    empId: 'e0000001-0000-0000-0000-000000000004',
    username: 'employee',
    role: 'EMPLOYEE'
  });

  const managerToken = jwt.signToken({
    userId: 'e0000001-0000-0000-0000-000000000003',
    empId: 'e0000001-0000-0000-0000-000000000003',
    username: 'manager_tech',
    role: 'MANAGER'
  });

  const emptyManagerToken = jwt.signToken({
    userId: 'emp_empty_manager_uuid',
    empId: 'emp_empty_manager_uuid',
    username: 'new_manager',
    role: 'MANAGER'
  });

  before(async () => {
    // Khởi chạy attendance-service trên cổng kiểm thử độc lập :3103
    attProcess = fork(path.resolve(__dirname, '..', 'services', 'attendance-service', 'index.js'), [], {
      env: {
        ...process.env,
        ATTENDANCE_SERVICE_PORT: String(ATT_PORT),
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    // Chờ service sẵn sàng
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${ATT_PORT}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  after(() => {
    if (attProcess) attProcess.kill();
  });

  // 1. Health check
  test('Health check /health trả về UP và database UP', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'UP');
    assert.strictEqual(data.service, 'attendance-service');
  });

  // 2. Tra cứu danh sách địa điểm chấm công
  test('Tra cứu danh sách địa điểm chấm công /api/attendance/work-locations', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/work-locations`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
  });

  // 3. Nhân viên không có quyền thêm địa điểm chấm công (HTTP 403)
  test('Từ chối khi Nhân viên thêm địa điểm chấm công (HTTP 403)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/work-locations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'LOC-TEST-FAIL',
        name: 'Chi nhánh Test',
        latitude: 10.776889,
        longitude: 106.700806
      })
    });
    assert.strictEqual(res.status, 403);
  });

  // 4. Admin thêm mới địa điểm chấm công văn phòng chi nhánh (HTTP 201)
  let testLocationCode = `LOC_${Date.now()}`;
  test('Admin thêm mới địa điểm chấm công thành công (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/work-locations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: testLocationCode,
        name: 'Văn phòng Chi nhánh TP.HCM',
        address: 'Quận 1, TP. Hồ Chí Minh',
        latitude: 10.776889,
        longitude: 106.700806,
        radiusMeters: 120,
        wifiSsid: 'HTQLNS_HCM_OFFICE'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.code, testLocationCode);
  });

  // 5. Check-in ngoài bán kính GPS (HTTP 403 OUT_OF_RANGE)
  test('Từ chối Check-in khi tọa độ GPS ngoài bán kính Geofence (HTTP 403 OUT_OF_RANGE)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'GPS',
        latitude: 21.028511, // Hà Nội (cách Quy Nhơn > 800km)
        longitude: 105.854444,
        bypassGeofence: false
      })
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, 'OUT_OF_RANGE');
  });

  // 6. Check-in thành công qua Wi-Fi văn phòng hợp lệ (HTTP 201)
  test('Check-in thành công qua Wi-Fi công ty (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'WIFI',
        wifiSsid: 'HTQLNS_OFFICE_5G'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id);
  });

  // 7. Từ chối Check-in lần 2 trong cùng một ngày (HTTP 400)
  test('Từ chối Check-in lần 2 trong ngày (HTTP 400)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'WIFI',
        wifiSsid: 'HTQLNS_OFFICE_5G'
      })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('đã chấm công vào'));
  });

  // 8. Check-out ra ca thành công (HTTP 200)
  test('Check-out ra ca thành công và tính giờ làm việc (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-out`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'WIFI',
        latitude: 13.759142,
        longitude: 109.218536
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.check_out_time);
  });

  // 9. Lấy lịch sử chấm công cá nhân
  test('Lấy danh sách lịch sử chấm công /api/attendance (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);
  });

  // 10. Gửi đơn giải trình chấm công (SCR_ATT_03)
  let adjustmentId = null;
  test('Gửi đơn giải trình chấm công /api/attendance/adjustments (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/adjustments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workDate: new Date().toISOString().slice(0, 10),
        adjustmentType: 'FORGOT_CHECK_IN',
        requestedCheckIn: '2026-11-15 08:00:00',
        requestedCheckOut: '2026-11-15 17:00:00',
        reason: 'Quên chấm công do tham gia hội thảo khách hàng buổi sáng'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id);
    adjustmentId = data.data.id;
  });

  // 11. Quản lý duyệt đơn giải trình công (SCR_ATT_04)
  test('Quản trị viên / Quản lý phê duyệt đơn giải trình công (HTTP 200) và đồng bộ trạng thái chấm công', async () => {
    assert.ok(adjustmentId);
    const res = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendance-adjustments/${adjustmentId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        comment: 'Quản trị viên phê duyệt giải trình'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'APPROVED');

    // Kiểm tra bản ghi chấm công đã được tự động đồng bộ sang ON_TIME với 8.0h chuẩn
    const historyRes = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendances/history`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    if (historyRes.ok) {
      const histData = await historyRes.json();
      const logs = histData.data?.logs || histData.data || [];
      const updatedLog = logs.find(l => l.work_date === new Date().toISOString().slice(0, 10));
      if (updatedLog) {
        assert.strictEqual(updatedLog.status, 'ON_TIME');
        assert.strictEqual(Number(updatedLog.work_hours), 8);
      }
    }
  });

  // 11b. Chặn tự duyệt đơn giải trình và kiểm tra phạm vi phòng ban
  test('Chặn tự duyệt đơn giải trình chấm công (HTTP 403) và quyền duyệt thay của Admin', async () => {
    // 1. Manager gửi đơn giải trình của chính mình
    const createAdjRes = await fetch(`http://localhost:${ATT_PORT}/api/attendance/adjustments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workDate: '2026-11-18',
        adjustmentType: 'FORGOT_CHECK_OUT',
        requestedCheckIn: '2026-11-18 08:30:00',
        requestedCheckOut: '2026-11-18 17:30:00',
        reason: 'Quên checkout khi họp đối tác cuối giờ'
      })
    });
    assert.strictEqual(createAdjRes.status, 201);
    const createAdjData = await createAdjRes.json();
    const mgrAdjId = createAdjData.data?.id;
    assert.ok(mgrAdjId);

    // 2. Manager cố tình tự duyệt đơn giải trình của chính mình -> HTTP 403
    const selfApproveRes = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendance-adjustments/${mgrAdjId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        comment: 'Tự duyệt đơn giải trình'
      })
    });
    assert.strictEqual(selfApproveRes.status, 403);
    const selfErr = await selfApproveRes.json();
    assert.strictEqual(selfErr.success, false);
    assert.match(selfErr.error || selfErr.message, /Không được phép tự duyệt đơn/);

    // 3. Manager không có quyền trên phòng ban khác cố duyệt -> HTTP 403
    const otherMgrApproveRes = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendance-adjustments/${mgrAdjId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${emptyManagerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        comment: 'Duyệt trái thẩm quyền'
      })
    });
    assert.strictEqual(otherMgrApproveRes.status, 403);

    // 4. Admin duyệt thay (Override) đơn giải trình của Manager -> HTTP 200
    const adminOverrideRes = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendance-adjustments/${mgrAdjId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        comment: 'Admin duyệt thay hợp lệ'
      })
    });
    assert.strictEqual(adminOverrideRes.status, 200);
    const adminData = await adminOverrideRes.json();
    assert.strictEqual(adminData.success, true);
    assert.strictEqual(adminData.data.status, 'APPROVED');
  });

  // 12. Internal monthly summary API (bảo mật bằng x-internal-key)
  test('Internal API /internal/attendances/monthly-summary yêu cầu x-internal-key', async () => {
    // Khi thiếu key -> HTTP 403 Forbidden
    const resNoKey = await fetch(`http://localhost:${ATT_PORT}/internal/attendances/monthly-summary?month=11&year=2026`);
    assert.strictEqual(resNoKey.status, 403);

    // Khi có key hợp lệ -> HTTP 200
    const resWithKey = await fetch(`http://localhost:${ATT_PORT}/internal/attendances/monthly-summary?month=11&year=2026`, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    assert.strictEqual(resWithKey.status, 200);
    const data = await resWithKey.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
  });

  // ============================================================================
  // TÍNH NĂNG MỚI: LỊCH SỬ CHẤM CÔNG CÁ NHÂN (GET /api/v1/attendances/history)
  // ============================================================================

  // 13. Lấy lịch sử chấm công cá nhân với cấu trúc chuẩn SOA & camelCase
  test('Lấy lịch sử chấm công cá nhân GET /api/v1/attendances/history chuẩn SOA', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendances/history`, {
      headers: {
        Authorization: `Bearer ${defaultEmpToken}`,
        'x-user-id': 'e0000001-0000-0000-0000-000000000004',
        'x-user-role': 'EMPLOYEE'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data), 'data phải là mảng');
    assert.ok(body.data.length > 0, 'Phải có bản ghi công');

    const first = body.data[0];
    assert.ok(first.workDate, 'Phải có workDate định dạng dd/MM/yyyy');
    assert.match(first.workDate, /^\d{2}\/\d{2}\/\d{4}$/, 'workDate phải đúng định dạng dd/MM/yyyy');
    assert.ok(first.checkInTime, 'Phải có checkInTime');
    assert.match(first.checkInTime, /^\d{2}:\d{2}:\d{2}$/, 'checkInTime phải đúng định dạng HH:mm:ss');
    assert.ok(typeof first.distanceMeters === 'number', 'distanceMeters phải là số mét làm tròn');
    assert.ok(first.status, 'Phải có trường status');
    assert.ok(first.statusLabel, 'Phải có nhãn tiếng Việt statusLabel');

    // Kiểm tra các trường summary trong meta
    assert.ok(body.meta, 'Phải có meta');
    assert.ok(body.meta.summary, 'Phải có meta.summary');
    assert.ok(typeof body.meta.summary.totalWorkDays === 'number', 'totalWorkDays phải là số');
    assert.ok(typeof body.meta.summary.totalWorkingHours === 'number', 'totalWorkingHours phải là số');
  });

  // 14. Lọc lịch sử chấm công theo Tháng và Năm (?month=11&year=2026)
  test('Lọc lịch sử chấm công theo tháng & năm (?month=11&year=2026)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendances/history?month=11&year=2026`, {
      headers: {
        Authorization: `Bearer ${defaultEmpToken}`,
        'x-user-id': 'e0000001-0000-0000-0000-000000000004',
        'x-user-role': 'EMPLOYEE'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.meta.month, 11);
    assert.strictEqual(body.meta.year, 2026);
    assert.ok(body.data.every(r => r.workDate.endsWith('/11/2026')), 'Toàn bộ kết quả phải thuộc tháng 11/2026');
  });

  // 15. Cô lập dữ liệu cá nhân: Ngăn chặn xem trộm công của nhân viên khác (HTTP 403)
  test('Cô lập dữ liệu cá nhân: Chặn xem trộm công của nhân viên khác (HTTP 403)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendances/history?employeeId=e0000001-0000-0000-0000-000000000099`, {
      headers: {
        Authorization: `Bearer ${defaultEmpToken}`,
        'x-user-id': 'e0000001-0000-0000-0000-000000000004',
        'x-user-role': 'EMPLOYEE'
      }
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.error.includes('không có quyền truy cập'), 'Phải thông báo không có quyền');
  });

  // 16. Xử lý trường hợp thiếu check-out (MISSING_CHECKOUT)
  test('Xử lý bản ghi thiếu check-out tự động gán MISSING_CHECKOUT', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendances/history?month=11&year=2026`, {
      headers: {
        Authorization: `Bearer ${defaultEmpToken}`,
        'x-user-id': 'e0000001-0000-0000-0000-000000000004',
        'x-user-role': 'EMPLOYEE'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    const missingRecord = body.data.find(r => r.workDate === '05/11/2026');
    assert.ok(missingRecord, 'Phải tìm thấy bản ghi ngày 05/11/2026');
    assert.strictEqual(missingRecord.status, 'MISSING_CHECKOUT');
    assert.strictEqual(missingRecord.statusLabel, 'Thiếu check-out');
    assert.strictEqual(missingRecord.checkOutTime, null);
    assert.ok(body.meta.summary.missingCheckoutCount >= 1, 'missingCheckoutCount phải >= 1');
  });

  // 17. Tài khoản nhân viên mới chưa có phòng ban trả về mảng rỗng []
  test('Tài khoản mới chưa có phòng ban trả về mảng rỗng [] và unassigned: true', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendances/history`, {
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'x-user-id': 'emp-unassigned-new',
        'x-user-role': 'EMPLOYEE',
        'x-test-unassigned': 'true'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(body.data, []);
    assert.strictEqual(body.meta.unassigned, true);
    assert.strictEqual(body.meta.total, 0);
  });

  // 18. Manager có đội nhóm tra cứu danh sách chấm công /api/attendance chỉ nhận nhân sự cấp dưới
  test('Manager có đội nhóm tra cứu /api/attendance chỉ nhận nhân sự cấp dưới', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'x-user-id': 'e0000001-0000-0000-0000-000000000003',
        'x-user-role': 'MANAGER'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data), 'Dữ liệu trả về phải là mảng');
    const allowedSubordinateIds = [
      'e0000001-0000-0000-0000-000000000004',
      '156b8a4c-1cc6-4b66-b610-ffecd714ce9d'
    ];
    for (const record of body.data) {
      assert.ok(
        allowedSubordinateIds.includes(record.emp_id),
        `Bản ghi ${record.id} của emp ${record.emp_id} không thuộc quyền quản lý`
      );
    }
  });

  // 19. Manager chưa có nhân sự tra cứu /api/attendance nhận mảng rỗng [] và total 0
  test('Manager chưa có nhân sự tra cứu /api/attendance nhận mảng rỗng [] và total 0', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance`, {
      headers: {
        Authorization: `Bearer ${emptyManagerToken}`,
        'x-user-id': 'emp_empty_manager_uuid',
        'x-user-role': 'MANAGER'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(body.data, []);
    assert.strictEqual(body.meta.total, 0);
  });

  // 20. Admin tra cứu /api/attendance nhận đầy đủ bản ghi của nhân sự ACTIVE toàn công ty
  test('Admin tra cứu /api/attendance nhận đầy đủ bản ghi của nhân sự ACTIVE toàn công ty', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-user-id': 'e0000001-0000-0000-0000-000000000001',
        'x-user-role': 'ADMIN'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length > 0, 'Phải có ít nhất 1 bản ghi chấm công');
    const first = body.data[0];
    assert.ok(first.emp_id, 'Phải có emp_id');
    assert.ok(first.emp_name, 'Phải có emp_name');
    assert.ok(first.emp_code, 'Phải có emp_code');
  });
});
