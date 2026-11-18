/**
 * tests/analytics.test.js
 * Bộ kiểm thử tự động cho Analytics Service (Dashboard Tổng quan & Báo cáo)
 * Kiểm tra RBAC Scope chuẩn hóa (ADMIN vs MANAGER) và đồng bộ số liệu thời gian thực
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');

describe('Kiểm thử Phân hệ Analytics Service (:3108)', () => {
  let analyticsProcess = null;
  const ANALYTICS_PORT = 3108;

  // 1. Token Quản trị viên (ADMIN)
  const adminToken = jwt.signToken({
    userId: 'u_admin_analytics',
    empId: 'e0000001-0000-0000-0000-000000000001',
    username: 'admin',
    role: 'ADMIN'
  });

  // 2. Token Nhân sự cấp cao (HR_ADMIN)
  const hrAdminToken = jwt.signToken({
    userId: 'u_hr_analytics',
    empId: 'e0000001-0000-0000-0000-000000000002',
    username: 'hr_admin',
    role: 'HR_ADMIN'
  });

  // 3. Token Quản lý có nhân sự trực thuộc (MANAGER - Nguyễn Thanh Lâm)
  const managerWithTeamToken = jwt.signToken({
    userId: 'e0000001-0000-0000-0000-000000000003',
    empId: 'e0000001-0000-0000-0000-000000000003',
    username: 'manager_tech',
    role: 'MANAGER'
  });

  // 4. Token Quản lý mới chưa có nhân viên nào (EMPTY MANAGER)
  const emptyManagerToken = jwt.signToken({
    userId: 'emp_empty_manager_test',
    empId: 'emp_empty_manager_test',
    username: 'new_manager',
    role: 'MANAGER'
  });

  // 5. Token Nhân viên thường (EMPLOYEE)
  const employeeToken = jwt.signToken({
    userId: 'e0000001-0000-0000-0000-000000000004',
    empId: 'e0000001-0000-0000-0000-000000000004',
    username: 'employee_user',
    role: 'EMPLOYEE'
  });

  before(async () => {
    // Khởi chạy analytics-service trên cổng kiểm thử độc lập :3108
    analyticsProcess = fork(path.resolve(__dirname, '..', 'services', 'analytics-service', 'index.js'), [], {
      env: {
        ...process.env,
        ANALYTICS_SERVICE_PORT: String(ANALYTICS_PORT),
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    // Chờ service sẵn sàng
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch(`http://localhost:${ANALYTICS_PORT}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  after(() => {
    if (analyticsProcess) analyticsProcess.kill();
  });

  // 1. Health check
  test('Health check /health trả về trạng thái UP', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'UP');
  });

  // 2. ADMIN xem tổng quan toàn công ty
  test('Admin tra cứu tổng quan toàn công ty GET /api/v1/analytics/overview (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/overview`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data, 'Phải có payload data');

    const { metrics, donut, isManager, role } = body.data;
    assert.strictEqual(isManager, false);
    assert.strictEqual(role, 'ADMIN');

    // Chỉ tính trên nhân viên ACTIVE
    assert.ok(typeof metrics.totalEmployees === 'number');
    assert.ok(metrics.totalEmployees >= 1, 'Tổng nhân viên toàn công ty phải >= 1');
    assert.strictEqual(donut.total, metrics.totalEmployees);

    // Kiểm tra cấu trúc phân bổ Donut
    assert.ok(donut.onTime && typeof donut.onTime.percent === 'number');
    assert.ok(donut.late && typeof donut.late.percent === 'number');
    assert.ok(donut.leave && typeof donut.leave.percent === 'number');
    assert.ok(donut.absent && typeof donut.absent.percent === 'number');

    const sumPercent = donut.onTime.percent + donut.late.percent + donut.leave.percent + donut.absent.percent;
    assert.ok(Math.abs(sumPercent - 100) < 1.0, `Tổng phần trăm Donut phải xấp xỉ 100% (thực tế: ${sumPercent}%)`);

    // Danh sách mảng trả về
    assert.ok(Array.isArray(body.data.lateEmployees));
    assert.ok(Array.isArray(body.data.pendingRequests));
  });

  // 3. HR_ADMIN xem tổng quan toàn công ty
  test('HR_ADMIN tra cứu tổng quan qua alias /api/analytics/overview (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/analytics/overview`, {
      headers: {
        Authorization: `Bearer ${hrAdminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isManager, false);
    assert.strictEqual(body.data.role, 'HR_ADMIN');
    assert.ok(body.data.metrics.totalEmployees >= 1);
  });

  // 4. MANAGER có đội nhóm (Nguyễn Thanh Lâm): Chỉ thấy nhân sự trực thuộc
  test('Quản lý có đội nhóm tra cứu overview: Phạm vi dữ liệu chỉ gồm cấp dưới trực thuộc', async () => {
    // 1. Lấy tổng quan toàn công ty của Admin để so sánh
    const adminRes = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminBody = await adminRes.json();
    const adminTotal = adminBody.data.metrics.totalEmployees;

    // 2. Lấy tổng quan của Quản lý Nguyễn Thanh Lâm
    const mgrRes = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/overview`, {
      headers: {
        Authorization: `Bearer ${managerWithTeamToken}`,
        'x-user-id': 'e0000001-0000-0000-0000-000000000003',
        'x-user-role': 'MANAGER'
      }
    });

    assert.strictEqual(mgrRes.status, 200);
    const mgrBody = await mgrRes.json();
    assert.strictEqual(mgrBody.success, true);
    assert.strictEqual(mgrBody.data.isManager, true);

    const mgrTotal = mgrBody.data.metrics.totalEmployees;
    assert.ok(mgrTotal > 0, 'Quản lý Tech phải có ít nhất 1 nhân viên cấp dưới');
    assert.ok(mgrTotal <= adminTotal, 'Nhân sự của Quản lý không được vượt quá toàn công ty');

    // Tên phòng ban phụ trách hiển thị rõ ràng
    assert.ok(
      mgrBody.data.departmentName.includes('Công nghệ') || mgrBody.data.departmentName.includes('Phần mềm') || mgrBody.data.departmentName.includes('Kỹ Thuật'),
      `Phòng ban hiển thị phải đúng ban quản lý: ${mgrBody.data.departmentName}`
    );
  });

  // 5. MANAGER chưa có nhân sự trực thuộc (EMPTY MANAGER): Trả về 0 và dữ liệu rỗng
  test('Quản lý mới chưa có nhân viên trực thuộc: Tất cả KPI hiển thị 0/0 và mảng rỗng', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/overview`, {
      headers: {
        Authorization: `Bearer ${emptyManagerToken}`,
        'x-user-id': 'emp_empty_manager_test',
        'x-user-role': 'MANAGER'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.isManager, true);

    const m = body.data.metrics;
    assert.strictEqual(m.totalEmployees, 0, 'totalEmployees phải bằng 0');
    assert.strictEqual(m.presentCount, 0, 'presentCount phải bằng 0');
    assert.strictEqual(m.onTimeCount, 0, 'onTimeCount phải bằng 0');
    assert.strictEqual(m.lateCount, 0, 'lateCount phải bằng 0');
    assert.strictEqual(m.leaveCount, 0, 'leaveCount phải bằng 0');
    assert.strictEqual(m.absentCount, 0, 'absentCount phải bằng 0');
    assert.strictEqual(m.pendingRequestsCount, 0, 'pendingRequestsCount phải bằng 0');
    assert.strictEqual(m.attendanceRate, 0, 'attendanceRate phải bằng 0');

    // Biểu đồ Donut phải về 0
    assert.strictEqual(body.data.donut.total, 0);
    assert.strictEqual(body.data.donut.onTime.percent, 0);
    assert.strictEqual(body.data.donut.late.percent, 0);
    assert.strictEqual(body.data.donut.leave.percent, 0);
    assert.strictEqual(body.data.donut.absent.percent, 0);

    // Danh sách đi muộn và đơn duyệt phải rỗng
    assert.deepStrictEqual(body.data.lateEmployees, []);
    assert.deepStrictEqual(body.data.pendingRequests, []);
  });

  // 6. Chặn EMPLOYEE thường truy cập overview (HTTP 403 Forbidden)
  test('Từ chối khi Nhân viên thường truy cập /api/v1/analytics/overview (HTTP 403)', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/overview`, {
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'x-user-role': 'EMPLOYEE'
      }
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.error.includes('không có quyền'));
  });

  // 7. Lọc báo cáo theo ngày cụ thể ?date=YYYY-MM-DD
  test('Lọc báo cáo theo ngày cụ thể ?date=2026-11-15', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/overview?date=2026-11-15`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.date, '2026-11-15');
    assert.ok(body.data.metrics.totalEmployees >= 1);
  });

  // 8. Tương thích ngược: API tổng hợp kỳ tháng /api/v1/analytics/dashboard
  test('API tổng hợp kỳ tháng /api/v1/analytics/dashboard vẫn hoạt động chuẩn xác', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/dashboard?month=11&year=2026`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.kpis);
    assert.ok(typeof body.data.kpis.totalWorkDays === 'number');
    assert.ok(typeof body.data.kpis.totalLateMinutes === 'number');
  });

  // 9. Admin tra cứu báo cáo & thống kê /api/v1/analytics/stats động 100%
  test('Admin tra cứu thống kê /api/v1/analytics/stats nhận đầy đủ summary và departments', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/stats?period=2026-11`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.summary, 'Phải có summary');
    assert.ok(body.data.departments, 'Phải có departments');
    assert.strictEqual(body.data.period, '2026-11');
    assert.ok(typeof body.data.summary.onTimeRate === 'string');
    assert.ok(typeof body.data.summary.totalEmployees === 'number');
    assert.ok(body.data.summary.totalEmployees > 0);
  });

  // 10. Quản lý có đội nhóm tra cứu /api/v1/analytics/stats chỉ nhận số liệu cấp dưới
  test('Quản lý có đội nhóm tra cứu /api/v1/analytics/stats chỉ nhận số liệu cấp dưới', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/stats?period=2026-11`, {
      headers: {
        Authorization: `Bearer ${managerWithTeamToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.scope.isScoped, true);
    assert.ok(body.data.summary.totalEmployees >= 1, 'Manager phải có ít nhất 1 nhân viên cấp dưới');
    // Danh sách phòng ban chỉ chứa phòng ban thuộc quyền quản lý
    assert.ok(body.data.departments.every(d => d.code === 'PB-TECH'));
  });

  // 11. Quản lý chưa có nhân viên tra cứu /api/v1/analytics/stats trả về 0 và mảng departments rỗng
  test('Quản lý chưa có nhân viên tra cứu /api/v1/analytics/stats trả về 0 và departments rỗng', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/stats?period=2026-11`, {
      headers: {
        Authorization: `Bearer ${emptyManagerToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.summary.totalEmployees, 0);
    assert.strictEqual(body.data.summary.totalWorkDays, 0);
    assert.deepStrictEqual(body.data.departments, []);
  });

  // 12. Tra cứu thống kê theo quý /api/v1/analytics/stats?period=2026-Q3
  test('Tra cứu thống kê theo quý /api/v1/analytics/stats?period=2026-Q3', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/stats?period=2026-Q3`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.period, '2026-Q3');
    assert.ok(body.data.summary);
  });

  // 13. Bảng tổng hợp chuyên cần theo từng phòng ban tính động 100%, không trả về số liệu mẫu hardcode 40/880
  test('Bảng tổng hợp chuyên cần theo phòng ban tính động 100%, không chứa dữ liệu hardcode 40/880', async () => {
    const res = await fetch(`http://localhost:${ANALYTICS_PORT}/api/v1/analytics/stats?period=2026-11`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data.departments), 'departments phải là mảng');
    assert.ok(body.data.departments.length > 0, 'Phải có ít nhất 1 phòng ban');

    let totalDeptEmps = 0;
    let totalDeptStdDays = 0;
    for (const dept of body.data.departments) {
      assert.notStrictEqual(dept.employeeCount, 40, 'Số nhân sự phòng ban không được hardcode 40');
      assert.notStrictEqual(dept.standardDays, 880, 'Số công chuẩn không được hardcode 880');
      assert.strictEqual(dept.standardDays, dept.employeeCount * 22, 'Số công chuẩn phải = employeeCount * 22');
      assert.ok(typeof dept.actualDays === 'number', 'actualDays phải là số');
      assert.ok(typeof dept.lateCount === 'number', 'lateCount phải là số');
      assert.ok(typeof dept.leaveDays === 'number', 'leaveDays phải là số');
      assert.ok(typeof dept.attendanceRate === 'string', 'attendanceRate phải là chuỗi %');
      assert.ok(!dept.attendanceRate.includes('NaN'), 'attendanceRate không được chứa NaN');
      totalDeptEmps += dept.employeeCount;
      totalDeptStdDays += dept.standardDays;
    }

    assert.notStrictEqual(totalDeptStdDays, 2090, 'Tổng công chuẩn toàn công ty không được hardcode 2090');
    assert.strictEqual(totalDeptStdDays, totalDeptEmps * 22, 'Tổng công chuẩn toàn công ty phải = totalDeptEmps * 22');
  });
});
