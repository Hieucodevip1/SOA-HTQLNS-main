/**
 * tests/payroll.test.js
 * Bộ kiểm thử tự động cho Payroll Service (feature/payroll & feature/06-payroll)
 * Phân hệ Tính lương, Chốt kỳ lương & Phiếu lương Payslip (SCR_PAY_01, SCR_ADM_04, SCR_ADM_07)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');
const env = require('../shared/env');
const db = require('../shared/db');

describe('Kiểm thử Phân hệ Payroll Service (:3106)', () => {
  let payrollProcess = null;
  const PAYROLL_PORT = 3106;

  const adminToken = jwt.signToken({
    userId: 'u_admin_test',
    empId: 'e0000001-0000-0000-0000-000000000001',
    username: 'admin',
    role: 'ADMIN'
  });

  const employeeToken = jwt.signToken({
    userId: 'u_emp_payroll_test',
    empId: 'e0000001-0000-0000-0000-000000000004',
    username: 'employee',
    role: 'EMPLOYEE'
  });

  let createdPeriodId = null;
  let employeePayslipId = null;
  let adminPayslipId = null;

  before(async () => {
    // Khởi chạy payroll-service trên cổng kiểm thử độc lập :3106
    payrollProcess = fork(path.resolve(__dirname, '..', 'services', 'payroll-service', 'index.js'), [], {
      env: {
        ...process.env,
        PAYROLL_SERVICE_PORT: String(PAYROLL_PORT),
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    // Chờ service sẵn sàng
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${PAYROLL_PORT}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Đảm bảo tính idempotent: Mở khóa kỳ lương test tháng 11/2026 nếu đã có
    try {
      const pool = db.getPool(process.env.PAYROLL_DB_NAME || 'htqlns_payroll');
      await pool.query("UPDATE payroll_periods SET status = 'CALCULATED' WHERE month = 11 AND year = 2026");
    } catch {}
  });

  after(async () => {
    if (payrollProcess) payrollProcess.kill();
    try {
      await db.closeAllPools();
    } catch {}
  });

  // 1. Health check
  test('Health check /health trả về UP và database UP', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.status === 'UP' || data.status === 'ok');
    assert.strictEqual(data.service, 'payroll-service');
  });

  // 2. Tra cứu danh sách cấu hình lương nhân viên (SCR_ADM_04)
  test('Admin tra cứu cấu hình lương /api/v1/payroll-configs (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payroll-configs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 4);
    assert.ok(data.data[0].base_salary);
    assert.ok(data.data[0].emp_name);
  });

  // 3. Nhân viên không có quyền xem cấu hình lương toàn công ty (HTTP 403)
  test('Từ chối khi Nhân viên xem cấu hình lương toàn bộ nhân sự (HTTP 403)', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payroll-configs`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  // 4. Admin cập nhật cấu hình lương cho nhân viên (HTTP 200)
  test('Admin cập nhật cấu hình lương nhân viên /api/v1/payroll-configs/:empId (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payroll-configs/e0000001-0000-0000-0000-000000000004`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        baseSalary: 18500000,
        lunchAllowance: 750000
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(Number(data.data.base_salary), 18500000);
  });

  // 5. Admin chạy tính lương tự động cho tháng 11/2026 (HTTP 200)
  test('Admin chạy tính lương tự động /api/v1/payrolls/calculate (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payrolls/calculate`, {
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

    const empSlip = data.data.find((p) => p.emp_id === 'e0000001-0000-0000-0000-000000000004');
    assert.ok(empSlip, 'Phải có phiếu lương của nhân viên');
    assert.ok(Number(empSlip.gross_salary) > 0);
    assert.ok(Number(empSlip.net_salary) > 0);
    assert.ok(empSlip.period_id);

    employeePayslipId = empSlip.id;
    createdPeriodId = empSlip.period_id;

    const admSlip = data.data.find((p) => p.emp_id === 'e0000001-0000-0000-0000-000000000001');
    if (admSlip) adminPayslipId = admSlip.id;
  });

  // 6. Admin xem danh sách các kỳ lương (HTTP 200)
  test('Admin tra cứu danh sách kỳ lương /api/v1/payrolls/periods (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payrolls/periods`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    const period = data.data.find((p) => p.id === createdPeriodId);
    assert.ok(period);
    assert.ok(Number(period.total_employees) >= 1);
  });

  // 7. Nhân viên xem phiếu lương cá nhân (HTTP 200)
  test('Nhân viên xem phiếu lương của chính mình /api/v1/payslips (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payslips?month=11&year=2026`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    // Nhân viên chỉ được nhận phiếu lương của chính mình
    data.data.forEach((slip) => {
      assert.strictEqual(slip.emp_id, 'e0000001-0000-0000-0000-000000000004');
    });
  });

  // 8. Nhân viên xem chi tiết phiếu lương cá nhân theo ID (HTTP 200)
  test('Nhân viên xem chi tiết phiếu lương của mình theo ID (HTTP 200)', async () => {
    assert.ok(employeePayslipId, 'employeePayslipId phải tồn tại');
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payslips/${employeePayslipId}`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.id, employeePayslipId);
    assert.ok(Number(data.data.net_salary) > 0);
  });

  // 9. Nhân viên không có quyền xem phiếu lương của nhân viên khác (HTTP 403)
  test('Từ chối khi Nhân viên truy cập phiếu lương của người khác (HTTP 403)', async () => {
    assert.ok(adminPayslipId, 'adminPayslipId phải tồn tại');
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payslips/${adminPayslipId}`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  // 10. Admin chốt kỳ lương & phát hành phiếu lương (HTTP 200)
  test('Admin chốt kỳ lương & phát hành phiếu lương /api/v1/payrolls/publish (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payrolls/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        month: 11,
        year: 2026
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Xác nhận trạng thái phiếu lương chuyển sang CONFIRMED
    const checkRes = await fetch(`http://localhost:${PAYROLL_PORT}/api/v1/payslips?month=11&year=2026`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const checkData = await checkRes.json();
    const confirmedSlip = checkData.data.find((p) => p.id === employeePayslipId);
    assert.strictEqual(confirmedSlip?.status, 'CONFIRMED');
  });

  // 11. Internal API: Tổng hợp quỹ lương cho Analytics Service (HTTP 403 & HTTP 200)
  test('Internal API /internal/payrolls/summary bảo mật x-internal-key (HTTP 403 & HTTP 200)', async () => {
    // Không có key -> 403
    const resNoKey = await fetch(`http://localhost:${PAYROLL_PORT}/internal/payrolls/summary?month=11&year=2026`);
    assert.strictEqual(resNoKey.status, 403);

    // Có key -> 200
    const res = await fetch(`http://localhost:${PAYROLL_PORT}/internal/payrolls/summary?month=11&year=2026`, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data);
    assert.ok(Number(data.data.employee_count) >= 1);
    assert.ok(Number(data.data.total_net_salary) > 0);
  });
});
