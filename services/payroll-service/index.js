/**
 * services/payroll-service/index.js
 * Microservice Tính lương, Chốt kỳ lương & Phiếu lương Payslip (Cổng :3006)
 * Màn hình Figma: SCR_PAY_01, SCR_ADM_04, SCR_ADM_07
 */

const crypto = require('crypto');
const { createServiceApp, requireAuth, requireInternalKey } = require('../../shared/service-base');
const db = require('../../shared/db');
const registrar = require('../../shared/registrar');
const events = require('../../shared/events');
const env = require('../../shared/env');

const SERVICE_NAME = 'payroll-service';
const PORT = Number(process.env.PAYROLL_SERVICE_PORT || 3006);
const DB_NAME = process.env.PAYROLL_DB_NAME || 'htqlns_payroll';

const ATTENDANCE_URL = process.env.ATTENDANCE_SERVICE_URL || 'http://localhost:3003';
const LEAVE_URL = process.env.LEAVE_SERVICE_URL || 'http://localhost:3004';
const SHIFT_URL = process.env.SHIFT_SERVICE_URL || 'http://localhost:3005';

const pool = db.getPool(DB_NAME);

// Ánh xạ linh hoạt emp_id từ JWT payload của người dùng
const getEmpIdFromUser = (user) => {
  if (!user) return null;
  if (user.emp_id) return user.emp_id;
  if (user.empId) return user.empId;
  const username = user.username || '';
  if (username === 'admin') return 'e0000001-0000-0000-0000-000000000001';
  if (username === 'hr_admin' || username === 'hr') return 'e0000001-0000-0000-0000-000000000002';
  if (username === 'manager') return 'e0000001-0000-0000-0000-000000000003';
  if (username === 'employee') return 'e0000001-0000-0000-0000-000000000004';
  return user.userId || user.id || null;
};

const app = createServiceApp(SERVICE_NAME, {
  port: PORT,
  checkHealth: async () => {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return rows && rows[0]?.ok === 1;
  }
});

async function fetchInternalJson(url) {
  try {
    const res = await fetch(url, { headers: { 'x-internal-key': env.INTERNAL_API_KEY } });
    const data = await res.json();
    return data.success ? data.data : [];
  } catch {
    return [];
  }
}

// ==============================================================================
// 1. CẤU HÌNH LƯƠNG NHÂN VIÊN (SCR_ADM_04)
// ==============================================================================

// Lấy danh sách cấu hình lương
app.get(['/api/v1/payroll-configs', '/api/payroll/configs', '/api/payroll'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const { empId } = req.query;
    let sql = `
      SELECT pc.*,
             COALESCE(e.full_name, 'Nhân viên') AS emp_name,
             COALESCE(e.code, pc.emp_id) AS emp_code,
             COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name,
             COALESCE(pos.title, 'Nhân viên') AS position_name
      FROM payroll_configs pc
      LEFT JOIN htqlns_organization.employees e ON pc.emp_id = e.id
      LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
      LEFT JOIN htqlns_organization.positions pos ON e.position_id = pos.id
    `;
    const params = [];
    if (empId) {
      sql += ' WHERE pc.emp_id = ?';
      params.push(empId);
    }
    sql += ' ORDER BY e.code ASC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Lấy chi tiết cấu hình lương của 1 nhân viên
app.get(['/api/v1/payroll-configs/:empId', '/api/payroll/configs/:empId'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT pc.*,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, pc.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name
       FROM payroll_configs pc
       LEFT JOIN htqlns_organization.employees e ON pc.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       WHERE pc.emp_id = ?`,
      [req.params.empId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy cấu hình lương của nhân viên này' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Tạo hoặc cập nhật cấu hình lương (ADMIN, HR)
app.post(['/api/v1/payroll-configs', '/api/payroll/configs'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const {
      empId,
      baseSalary = 15000000,
      lunchAllowance = 730000,
      transportAllowance = 500000,
      insuranceRate = 0.105,
      latePenaltyPerMinute = 2000,
      otMultiplierWeekday = 1.5,
      otMultiplierWeekend = 2.0
    } = req.body;

    if (!empId) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin bắt buộc: empId' });
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO payroll_configs
       (id, emp_id, base_salary, lunch_allowance, transport_allowance, insurance_rate,
        late_penalty_per_minute, ot_multiplier_weekday, ot_multiplier_weekend)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         base_salary = VALUES(base_salary),
         lunch_allowance = VALUES(lunch_allowance),
         transport_allowance = VALUES(transport_allowance),
         insurance_rate = VALUES(insurance_rate),
         late_penalty_per_minute = VALUES(late_penalty_per_minute),
         ot_multiplier_weekday = VALUES(ot_multiplier_weekday),
         ot_multiplier_weekend = VALUES(ot_multiplier_weekend)`,
      [
        id, empId, baseSalary, lunchAllowance, transportAllowance, insuranceRate,
        latePenaltyPerMinute, otMultiplierWeekday, otMultiplierWeekend
      ]
    );

    const [saved] = await pool.query('SELECT * FROM payroll_configs WHERE emp_id = ?', [empId]);
    res.status(201).json({ success: true, message: 'Lưu cấu hình lương thành công', data: saved[0] });
  } catch (err) {
    next(err);
  }
});

// Cập nhật cấu hình lương của nhân viên
app.put(['/api/v1/payroll-configs/:empId', '/api/payroll/configs/:empId'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const {
      baseSalary,
      lunchAllowance,
      transportAllowance,
      insuranceRate,
      latePenaltyPerMinute,
      otMultiplierWeekday,
      otMultiplierWeekend
    } = req.body;

    const [existing] = await pool.query('SELECT * FROM payroll_configs WHERE emp_id = ?', [req.params.empId]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy cấu hình lương' });
    }

    const current = existing[0];
    await pool.query(
      `UPDATE payroll_configs
       SET base_salary = ?, lunch_allowance = ?, transport_allowance = ?, insurance_rate = ?,
           late_penalty_per_minute = ?, ot_multiplier_weekday = ?, ot_multiplier_weekend = ?
       WHERE emp_id = ?`,
      [
        baseSalary ?? current.base_salary,
        lunchAllowance ?? current.lunch_allowance,
        transportAllowance ?? current.transport_allowance,
        insuranceRate ?? current.insurance_rate,
        latePenaltyPerMinute ?? current.late_penalty_per_minute,
        otMultiplierWeekday ?? current.ot_multiplier_weekday,
        otMultiplierWeekend ?? current.ot_multiplier_weekend,
        req.params.empId
      ]
    );

    const [updated] = await pool.query('SELECT * FROM payroll_configs WHERE emp_id = ?', [req.params.empId]);
    res.json({ success: true, message: 'Cập nhật cấu hình lương thành công', data: updated[0] });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 2. TÍNH TOÁN VÀ QUẢN LÝ KỲ LƯƠNG (SCR_ADM_07)
// ==============================================================================

// Lấy danh sách các kỳ lương
app.get(['/api/v1/payrolls/periods', '/api/payrolls', '/api/payroll/periods'], requireAuth(['ADMIN', 'HR', 'MANAGER']), async (req, res, next) => {
  try {
    const [periods] = await pool.query(`
      SELECT pp.*,
             COUNT(p.id) AS total_employees,
             COALESCE(SUM(p.gross_salary), 0) AS total_gross_salary,
             COALESCE(SUM(p.net_salary), 0) AS total_net_salary
      FROM payroll_periods pp
      LEFT JOIN payslips p ON pp.id = p.period_id
      GROUP BY pp.id
      ORDER BY pp.year DESC, pp.month DESC
    `);
    res.json({ success: true, data: periods });
  } catch (err) {
    next(err);
  }
});

// Chạy tính lương tự động cho toàn bộ nhân viên theo tháng/năm (SCR_ADM_07)
app.post(['/api/v1/payrolls/calculate', '/api/payroll/calculate'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const month = Number(req.body.month || new Date().getMonth() + 1);
    const year = Number(req.body.year || new Date().getFullYear());
    const standardDays = Number(req.body.standardWorkingDays || 22);

    // Tạo hoặc lấy kỳ lương
    let [periods] = await pool.query('SELECT * FROM payroll_periods WHERE month = ? AND year = ?', [month, year]);
    let periodId;
    if (!periods.length) {
      periodId = crypto.randomUUID();
      await pool.query(
        'INSERT INTO payroll_periods (id, month, year, standard_working_days, status) VALUES (?, ?, ?, ?, "CALCULATED")',
        [periodId, month, year, standardDays]
      );
    } else {
      if (periods[0].status === 'LOCKED' || periods[0].status === 'PAID') {
        return res.status(400).json({ success: false, error: 'Kỳ lương đã chốt, không thể tính lại' });
      }
      periodId = periods[0].id;
      await pool.query('UPDATE payroll_periods SET standard_working_days = ?, status = "CALCULATED" WHERE id = ?', [standardDays, periodId]);
    }

    // Tổng hợp dữ liệu từ 3 microservice: Attendance, Leave, Shift (OT)
    const [configs] = await pool.query('SELECT * FROM payroll_configs');
    const attSummary = await fetchInternalJson(`${ATTENDANCE_URL}/internal/attendances/monthly-summary?month=${month}&year=${year}`);
    const leaveSummary = await fetchInternalJson(`${LEAVE_URL}/internal/leaves/monthly-summary?month=${month}&year=${year}`);
    const otSummary = await fetchInternalJson(`${SHIFT_URL}/internal/ot/summary?month=${month}&year=${year}`);

    const attMap = Object.fromEntries(attSummary.map((r) => [r.emp_id, r]));
    const leaveMap = Object.fromEntries(leaveSummary.map((r) => [r.emp_id, r]));

    for (const cfg of configs) {
      const att = attMap[cfg.emp_id] || { actual_work_days: 0, total_late_minutes: 0 };
      const lv = leaveMap[cfg.emp_id] || { paid_leave_days: 0 };
      const empOts = otSummary.filter((o) => o.emp_id === cfg.emp_id);

      const baseSalary = Number(cfg.base_salary);
      const dailyRate = baseSalary / standardDays;
      const hourlyRate = dailyRate / 8;

      const actualWorkDays = Number(att.actual_work_days || 0);
      const paidLeaveDays = Number(lv.paid_leave_days || 0);
      const totalPaidDays = Math.min(standardDays, actualWorkDays + paidLeaveDays);

      let otHours = 0;
      let otPay = 0;
      for (const item of empOts) {
        const hrs = Number(item.total_ot_hours || 0);
        let mult = Number(cfg.ot_multiplier_weekday);
        if (item.ot_type === 'WEEKEND') mult = Number(cfg.ot_multiplier_weekend);
        else if (item.ot_type === 'HOLIDAY') mult = 3.0;

        otHours += hrs;
        otPay += hrs * hourlyRate * mult;
      }

      const salaryByDays = dailyRate * totalPaidDays;
      const totalAllowance = Number(cfg.lunch_allowance) + Number(cfg.transport_allowance);
      const grossSalary = Math.round(salaryByDays + otPay + totalAllowance);

      // Khấu trừ BHXH, BHYT, BHTN (10.5% theo lương cơ bản)
      const insuranceDeduction = Math.round(baseSalary * Number(cfg.insurance_rate));
      // Khấu trừ đi muộn
      const lateDeduction = Math.round(Number(att.total_late_minutes || 0) * Number(cfg.late_penalty_per_minute));

      // Thuế TNCN (Giảm trừ bản thân 11.000.000 VNĐ)
      const taxableIncome = Math.max(0, grossSalary - insuranceDeduction - 11000000);
      let taxDeduction = 0;
      if (taxableIncome > 0) {
        if (taxableIncome <= 5000000) taxDeduction = Math.round(taxableIncome * 0.05);
        else if (taxableIncome <= 10000000) taxDeduction = Math.round(250000 + (taxableIncome - 5000000) * 0.1);
        else taxDeduction = Math.round(750000 + (taxableIncome - 10000000) * 0.15);
      }

      const netSalary = Math.max(0, grossSalary - insuranceDeduction - lateDeduction - taxDeduction);

      const payslipId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO payslips
         (id, period_id, emp_id, month, year, base_salary, standard_days, actual_work_days, paid_leave_days,
          ot_hours, ot_pay, total_allowance, gross_salary, insurance_deduction, late_deduction, tax_deduction, net_salary, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')
         ON DUPLICATE KEY UPDATE
           base_salary = VALUES(base_salary),
           actual_work_days = VALUES(actual_work_days),
           paid_leave_days = VALUES(paid_leave_days),
           ot_hours = VALUES(ot_hours),
           ot_pay = VALUES(ot_pay),
           total_allowance = VALUES(total_allowance),
           gross_salary = VALUES(gross_salary),
           insurance_deduction = VALUES(insurance_deduction),
           late_deduction = VALUES(late_deduction),
           tax_deduction = VALUES(tax_deduction),
           net_salary = VALUES(net_salary)`,
        [
          payslipId, periodId, cfg.emp_id, month, year, baseSalary, standardDays, actualWorkDays, paidLeaveDays,
          otHours, Math.round(otPay), totalAllowance, grossSalary, insuranceDeduction, lateDeduction, taxDeduction, netSalary
        ]
      );
    }

    const [payslips] = await pool.query(
      `SELECT p.*,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, p.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name
       FROM payslips p
       LEFT JOIN htqlns_organization.employees e ON p.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       WHERE p.period_id = ?`,
      [periodId]
    );

    events.publish('PAYROLL_CALCULATED', {
      periodId,
      month,
      year,
      count: payslips.length
    }).catch(() => {});

    res.json({
      success: true,
      message: `Đã tính bảng lương tháng ${month}/${year} cho ${payslips.length} nhân sự`,
      data: payslips
    });
  } catch (err) {
    next(err);
  }
});

// Chốt kỳ lương & phát hành phiếu lương (SCR_ADM_07)
const handlePublishPayroll = async (req, res, next) => {
  try {
    const { month, year } = req.body || {};
    const conditions = [];
    const params = [];

    if (req.params.id) {
      conditions.push('id = ?');
      params.push(req.params.id);
    } else if (month && year) {
      conditions.push('month = ? AND year = ?');
      params.push(Number(month), Number(year));
    } else {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin kỳ lương cần chốt (id hoặc month/year)' });
    }

    const [periods] = await pool.query(`SELECT * FROM payroll_periods WHERE ${conditions.join(' AND ')}`, params);
    if (!periods.length) return res.status(404).json({ success: false, error: 'Chưa có bảng tính lương kỳ này' });

    const period = periods[0];
    const closerId = getEmpIdFromUser(req.user);

    await pool.query(
      'UPDATE payroll_periods SET status = "LOCKED", closed_by = ?, closed_at = NOW() WHERE id = ?',
      [closerId, period.id]
    );
    await pool.query('UPDATE payslips SET status = "CONFIRMED" WHERE period_id = ?', [period.id]);

    events.publish('PAYSLIP_PUBLISHED', {
      month: Number(period.month),
      year: Number(period.year),
      periodId: period.id
    }).catch(() => {});

    res.json({
      success: true,
      message: `Đã chốt và phát hành phiếu lương tháng ${period.month}/${period.year} thành công`
    });
  } catch (err) {
    next(err);
  }
};

app.post(['/api/v1/payrolls/publish', '/api/payroll/publish'], requireAuth(['ADMIN', 'HR']), handlePublishPayroll);
app.patch(['/api/v1/payrolls/:id/publish', '/api/payroll/:id/publish', '/api/v1/payrolls/:id/status'], requireAuth(['ADMIN', 'HR']), handlePublishPayroll);

// ==============================================================================
// 3. XEM DANH SÁCH & CHI TIẾT PHIẾU LƯƠNG PAYSLIP (SCR_PAY_01)
// ==============================================================================

// Xem danh sách phiếu lương / Phiếu lương cá nhân (SCR_PAY_01)
app.get(['/api/v1/payslips', '/api/payslips'], requireAuth(), async (req, res, next) => {
  try {
    const { month, year, empId, periodId } = req.query;
    const currentEmpId = getEmpIdFromUser(req.user);
    const conditions = [];
    const params = [];

    if (req.user.role === 'EMPLOYEE') {
      conditions.push('p.emp_id = ?');
      params.push(currentEmpId);
    } else if (empId) {
      conditions.push('p.emp_id = ?');
      params.push(empId);
    }

    if (periodId) {
      conditions.push('p.period_id = ?');
      params.push(periodId);
    }
    if (month) {
      conditions.push('p.month = ?');
      params.push(Number(month));
    }
    if (year) {
      conditions.push('p.year = ?');
      params.push(Number(year));
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT p.*,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, p.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name,
              COALESCE(pos.title, 'Nhân viên') AS position_name
       FROM payslips p
       LEFT JOIN htqlns_organization.employees e ON p.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       LEFT JOIN htqlns_organization.positions pos ON e.position_id = pos.id
       ${where}
       ORDER BY p.year DESC, p.month DESC, e.code ASC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Xem chi tiết một phiếu lương (SCR_PAY_01)
app.get(['/api/v1/payslips/:id', '/api/payslips/:id'], requireAuth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, p.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name,
              COALESCE(pos.title, 'Nhân viên') AS position_name
       FROM payslips p
       LEFT JOIN htqlns_organization.employees e ON p.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       LEFT JOIN htqlns_organization.positions pos ON e.position_id = pos.id
       WHERE p.id = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy phiếu lương' });
    }

    const currentEmpId = getEmpIdFromUser(req.user);
    if (req.user.role === 'EMPLOYEE' && rows[0].emp_id !== currentEmpId) {
      return res.status(403).json({ success: false, error: 'Bạn không có quyền truy cập phiếu lương của nhân viên khác' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 4. INTERNAL API CHO CÁC MICROSERVICE KHÁC (analytics-service)
// ==============================================================================

// Internal API cho Analytics Service
app.get('/internal/payrolls/summary', requireInternalKey, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS employee_count, COALESCE(SUM(net_salary), 0) AS total_net_salary, COALESCE(SUM(gross_salary), 0) AS total_gross_salary FROM payslips WHERE month = ? AND year = ?',
      [Number(month), Number(year)]
    );
    res.json({ success: true, data: rows[0] || { employee_count: 0, total_net_salary: 0, total_gross_salary: 0 } });
  } catch (err) {
    next(err);
  }
});

app.useErrorHandler();

app.start(PORT, () => {
  registrar.register({
    name: SERVICE_NAME,
    port: PORT,
    host: 'localhost',
    prefix: '/api/v1/payrolls'
  });
});
