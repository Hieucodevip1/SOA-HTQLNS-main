/**
 * services/payroll-service/repositories/payrollRepository.js
 * Data Access Layer cho Payroll Service
 * Hỗ trợ chế độ Hybrid: MySQL Database + In-Memory Fallback
 */

const crypto = require('crypto');
const db = require('../../../shared/db');

const DB_NAME = process.env.PAYROLL_DB_NAME || 'htqlns_payroll';
const pool = db.getPool(DB_NAME);

// Seed in-memory payroll configs
const initialConfigs = [
  {
    id: 'pc-001',
    emp_id: 'e0000001-0000-0000-0000-000000000001',
    emp_code: 'NV-001',
    emp_name: 'Vũ Đức Hiếu',
    department_name: 'Ban Giám Đốc',
    position_name: 'Giám đốc Điều hành',
    base_salary: 35000000,
    lunch_allowance: 1000000,
    transport_allowance: 1000000,
    insurance_rate: 0.105,
    late_penalty_per_minute: 5000,
    ot_multiplier_weekday: 1.5,
    ot_multiplier_weekend: 2.0
  },
  {
    id: 'pc-002',
    emp_id: 'e0000001-0000-0000-0000-000000000002',
    emp_code: 'NV-002',
    emp_name: 'Trần Thị Lan',
    department_name: 'Phòng Nhân Sự',
    position_name: 'Trưởng phòng Nhân sự',
    base_salary: 22000000,
    lunch_allowance: 730000,
    transport_allowance: 500000,
    insurance_rate: 0.105,
    late_penalty_per_minute: 2000,
    ot_multiplier_weekday: 1.5,
    ot_multiplier_weekend: 2.0
  },
  {
    id: 'pc-003',
    emp_id: 'e0000001-0000-0000-0000-000000000003',
    emp_code: 'NV-003',
    emp_name: 'Lê Hoàng Long',
    department_name: 'Phòng Kỹ Thuật',
    position_name: 'Trưởng nhóm Kỹ thuật',
    base_salary: 25000000,
    lunch_allowance: 730000,
    transport_allowance: 500000,
    insurance_rate: 0.105,
    late_penalty_per_minute: 2000,
    ot_multiplier_weekday: 1.5,
    ot_multiplier_weekend: 2.0
  },
  {
    id: 'pc-004',
    emp_id: 'e0000001-0000-0000-0000-000000000004',
    emp_code: 'NV-004',
    emp_name: 'Phạm Văn Tuấn',
    department_name: 'Phòng Kỹ Thuật',
    position_name: 'Kỹ sư phần mềm',
    base_salary: 16000000,
    lunch_allowance: 730000,
    transport_allowance: 500000,
    insurance_rate: 0.105,
    late_penalty_per_minute: 2000,
    ot_multiplier_weekday: 1.5,
    ot_multiplier_weekend: 2.0
  },
  {
    id: 'pc-005',
    emp_id: 'e0000001-0000-0000-0000-000000000005',
    emp_code: 'NV-005',
    emp_name: 'Đặng Hữu Quân',
    department_name: 'Phòng Kinh Doanh',
    position_name: 'Chuyên viên Kinh doanh',
    base_salary: 14000000,
    lunch_allowance: 730000,
    transport_allowance: 500000,
    insurance_rate: 0.105,
    late_penalty_per_minute: 2000,
    ot_multiplier_weekday: 1.5,
    ot_multiplier_weekend: 2.0
  }
];

const memoryPayrollConfigs = new Map(initialConfigs.map(c => [c.emp_id, { ...c }]));

// Seed in-memory periods
const initialPeriods = [
  {
    id: 'period-2026-11',
    month: 11,
    year: 2026,
    standard_working_days: 22,
    status: 'CALCULATED',
    closed_by: null,
    closed_at: null,
    created_at: new Date().toISOString()
  }
];
const memoryPeriods = new Map(initialPeriods.map(p => [p.id, { ...p }]));

// Seed in-memory payslips
const initialPayslips = [
  {
    id: 'ps-2026-11-001',
    period_id: 'period-2026-11',
    emp_id: 'e0000001-0000-0000-0000-000000000001',
    emp_code: 'NV-001',
    emp_name: 'Vũ Đức Hiếu',
    department_name: 'Ban Giám Đốc',
    position_name: 'Giám đốc Điều hành',
    month: 11,
    year: 2026,
    base_salary: 35000000,
    standard_days: 22,
    actual_work_days: 22,
    paid_leave_days: 0,
    ot_hours: 0,
    ot_pay: 0,
    total_allowance: 2000000,
    gross_salary: 37000000,
    insurance_deduction: 3675000,
    late_deduction: 0,
    tax_deduction: 2598750,
    net_salary: 30726250,
    status: 'DRAFT',
    created_at: new Date().toISOString()
  },
  {
    id: 'ps-2026-11-002',
    period_id: 'period-2026-11',
    emp_id: 'e0000001-0000-0000-0000-000000000002',
    emp_code: 'NV-002',
    emp_name: 'Trần Thị Lan',
    department_name: 'Phòng Nhân Sự',
    position_name: 'Trưởng phòng Nhân sự',
    month: 11,
    year: 2026,
    base_salary: 22000000,
    standard_days: 22,
    actual_work_days: 21,
    paid_leave_days: 1,
    ot_hours: 0,
    ot_pay: 0,
    total_allowance: 1230000,
    gross_salary: 23230000,
    insurance_deduction: 2310000,
    late_deduction: 0,
    tax_deduction: 738000,
    net_salary: 20182000,
    status: 'DRAFT',
    created_at: new Date().toISOString()
  },
  {
    id: 'ps-2026-11-003',
    period_id: 'period-2026-11',
    emp_id: 'e0000001-0000-0000-0000-000000000003',
    emp_code: 'NV-003',
    emp_name: 'Lê Hoàng Long',
    department_name: 'Phòng Kỹ Thuật',
    position_name: 'Trưởng nhóm Kỹ thuật',
    month: 11,
    year: 2026,
    base_salary: 25000000,
    standard_days: 22,
    actual_work_days: 22,
    paid_leave_days: 0,
    ot_hours: 4,
    ot_pay: 852273,
    total_allowance: 1230000,
    gross_salary: 27082273,
    insurance_deduction: 2625000,
    late_deduction: 0,
    tax_deduction: 1268591,
    net_salary: 23188682,
    status: 'DRAFT',
    created_at: new Date().toISOString()
  },
  {
    id: 'ps-2026-11-004',
    period_id: 'period-2026-11',
    emp_id: 'e0000001-0000-0000-0000-000000000004',
    emp_code: 'NV-004',
    emp_name: 'Phạm Văn Tuấn',
    department_name: 'Phòng Kỹ Thuật',
    position_name: 'Kỹ sư phần mềm',
    month: 11,
    year: 2026,
    base_salary: 16000000,
    standard_days: 22,
    actual_work_days: 21,
    paid_leave_days: 1,
    ot_hours: 8,
    ot_pay: 1090909,
    total_allowance: 1230000,
    gross_salary: 18320909,
    insurance_deduction: 1680000,
    late_deduction: 40000,
    tax_deduction: 314091,
    net_salary: 16286818,
    status: 'DRAFT',
    created_at: new Date().toISOString()
  }
];
const memoryPayslips = new Map(initialPayslips.map(p => [p.id, { ...p }]));

// Seed relationships (manager -> subordinates)
const memorySubordinates = {
  'e0000001-0000-0000-0000-000000000003': ['e0000001-0000-0000-0000-000000000004']
};

class PayrollRepository {
  async isDbAvailable() {
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      return rows && rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  // ==================== CẤU HÌNH LƯƠNG (PAYROLL CONFIGS) ====================

  async getPayrollConfigs(empId = null) {
    if (await this.isDbAvailable()) {
      try {
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
        if (rows && rows.length > 0) return rows;
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayrollConfigs fallback:', err.message);
      }
    }

    // In-memory fallback
    const list = Array.from(memoryPayrollConfigs.values());
    if (empId) {
      return list.filter(c => c.emp_id === empId);
    }
    return list;
  }

  async getPayrollConfigByEmpId(empId) {
    if (await this.isDbAvailable()) {
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
          [empId]
        );
        if (rows && rows.length > 0) return rows[0];
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayrollConfigByEmpId fallback:', err.message);
      }
    }

    return memoryPayrollConfigs.get(empId) || null;
  }

  async savePayrollConfig(data) {
    const id = data.id || crypto.randomUUID();
    const configData = {
      id,
      emp_id: data.empId || data.emp_id,
      emp_code: data.emp_code || data.empCode || 'NV-XXX',
      emp_name: data.emp_name || data.empName || 'Nhân viên',
      department_name: data.department_name || data.departmentName || 'Phòng Kỹ Thuật',
      position_name: data.position_name || data.positionName || 'Nhân viên',
      base_salary: Number(data.baseSalary ?? data.base_salary ?? 10000000),
      lunch_allowance: Number(data.lunchAllowance ?? data.lunch_allowance ?? 730000),
      transport_allowance: Number(data.transportAllowance ?? data.transport_allowance ?? 500000),
      insurance_rate: Number(data.insuranceRate ?? data.insurance_rate ?? 0.105),
      late_penalty_per_minute: Number(data.latePenaltyPerMinute ?? data.late_penalty_per_minute ?? 2000),
      ot_multiplier_weekday: Number(data.otMultiplierWeekday ?? data.ot_multiplier_weekday ?? 1.5),
      ot_multiplier_weekend: Number(data.otMultiplierWeekend ?? data.ot_multiplier_weekend ?? 2.0)
    };

    if (await this.isDbAvailable()) {
      try {
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
            configData.id, configData.emp_id, configData.base_salary, configData.lunch_allowance,
            configData.transport_allowance, configData.insurance_rate, configData.late_penalty_per_minute,
            configData.ot_multiplier_weekday, configData.ot_multiplier_weekend
          ]
        );
        const [saved] = await pool.query('SELECT * FROM payroll_configs WHERE emp_id = ?', [configData.emp_id]);
        if (saved && saved.length > 0) return saved[0];
      } catch (err) {
        console.warn('[PayrollRepository] MySQL savePayrollConfig fallback:', err.message);
      }
    }

    memoryPayrollConfigs.set(configData.emp_id, configData);
    return configData;
  }

  async updatePayrollConfig(empId, data) {
    const existing = await this.getPayrollConfigByEmpId(empId);
    if (!existing) return null;

    const updated = {
      ...existing,
      base_salary: data.baseSalary !== undefined ? Number(data.baseSalary) : existing.base_salary,
      lunch_allowance: data.lunchAllowance !== undefined ? Number(data.lunchAllowance) : existing.lunch_allowance,
      transport_allowance: data.transportAllowance !== undefined ? Number(data.transportAllowance) : existing.transport_allowance,
      insurance_rate: data.insuranceRate !== undefined ? Number(data.insuranceRate) : existing.insurance_rate,
      late_penalty_per_minute: data.latePenaltyPerMinute !== undefined ? Number(data.latePenaltyPerMinute) : existing.late_penalty_per_minute,
      ot_multiplier_weekday: data.otMultiplierWeekday !== undefined ? Number(data.otMultiplierWeekday) : existing.ot_multiplier_weekday,
      ot_multiplier_weekend: data.otMultiplierWeekend !== undefined ? Number(data.otMultiplierWeekend) : existing.ot_multiplier_weekend
    };

    if (await this.isDbAvailable()) {
      try {
        await pool.query(
          `UPDATE payroll_configs
           SET base_salary = ?, lunch_allowance = ?, transport_allowance = ?, insurance_rate = ?,
               late_penalty_per_minute = ?, ot_multiplier_weekday = ?, ot_multiplier_weekend = ?
           WHERE emp_id = ?`,
          [
            updated.base_salary, updated.lunch_allowance, updated.transport_allowance,
            updated.insurance_rate, updated.late_penalty_per_minute, updated.ot_multiplier_weekday,
            updated.ot_multiplier_weekend, empId
          ]
        );
        const [rows] = await pool.query('SELECT * FROM payroll_configs WHERE emp_id = ?', [empId]);
        if (rows && rows.length > 0) return rows[0];
      } catch (err) {
        console.warn('[PayrollRepository] MySQL updatePayrollConfig fallback:', err.message);
      }
    }

    memoryPayrollConfigs.set(empId, updated);
    return updated;
  }

  // ==================== KỲ LƯƠNG (PAYROLL PERIODS) ====================

  async getPayrollPeriods() {
    if (await this.isDbAvailable()) {
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
        if (periods && periods.length > 0) return periods;
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayrollPeriods fallback:', err.message);
      }
    }

    // In-memory fallback
    const periods = Array.from(memoryPeriods.values()).map(period => {
      const slips = Array.from(memoryPayslips.values()).filter(p => p.period_id === period.id);
      const totalGross = slips.reduce((sum, p) => sum + Number(p.gross_salary || 0), 0);
      const totalNet = slips.reduce((sum, p) => sum + Number(p.net_salary || 0), 0);
      return {
        ...period,
        total_employees: slips.length,
        total_gross_salary: totalGross,
        total_net_salary: totalNet
      };
    });

    periods.sort((a, b) => (b.year - a.year) || (b.month - a.month));
    return periods;
  }

  async getPayrollPeriodById(id) {
    if (await this.isDbAvailable()) {
      try {
        const [rows] = await pool.query('SELECT * FROM payroll_periods WHERE id = ?', [id]);
        if (rows && rows.length > 0) return rows[0];
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayrollPeriodById fallback:', err.message);
      }
    }
    return memoryPeriods.get(id) || null;
  }

  async getPayrollPeriodByMonthYear(month, year) {
    const numMonth = Number(month);
    const numYear = Number(year);
    if (await this.isDbAvailable()) {
      try {
        const [rows] = await pool.query('SELECT * FROM payroll_periods WHERE month = ? AND year = ?', [numMonth, numYear]);
        if (rows && rows.length > 0) return rows[0];
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayrollPeriodByMonthYear fallback:', err.message);
      }
    }

    for (const p of memoryPeriods.values()) {
      if (Number(p.month) === numMonth && Number(p.year) === numYear) {
        return p;
      }
    }
    return null;
  }

  async savePayrollPeriod(periodData) {
    const period = {
      id: periodData.id || crypto.randomUUID(),
      month: Number(periodData.month),
      year: Number(periodData.year),
      standard_working_days: Number(periodData.standardWorkingDays || periodData.standard_working_days || 22),
      status: periodData.status || 'CALCULATED',
      closed_by: periodData.closed_by || null,
      closed_at: periodData.closed_at || null,
      created_at: periodData.created_at || new Date().toISOString()
    };

    if (await this.isDbAvailable()) {
      try {
        await pool.query(
          `INSERT INTO payroll_periods (id, month, year, standard_working_days, status)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             standard_working_days = VALUES(standard_working_days),
             status = VALUES(status)`,
          [period.id, period.month, period.year, period.standard_working_days, period.status]
        );
      } catch (err) {
        console.warn('[PayrollRepository] MySQL savePayrollPeriod fallback:', err.message);
      }
    }

    memoryPeriods.set(period.id, period);
    return period;
  }

  async updatePayrollPeriodStatus(periodId, status, closedBy = null) {
    if (await this.isDbAvailable()) {
      try {
        await pool.query(
          'UPDATE payroll_periods SET status = ?, closed_by = ?, closed_at = NOW() WHERE id = ?',
          [status, closedBy, periodId]
        );
      } catch (err) {
        console.warn('[PayrollRepository] MySQL updatePayrollPeriodStatus fallback:', err.message);
      }
    }

    const p = memoryPeriods.get(periodId);
    if (p) {
      p.status = status;
      p.closed_by = closedBy;
      p.closed_at = new Date().toISOString();
      memoryPeriods.set(periodId, p);
    }
  }

  // ==================== PHIẾU LƯƠNG (PAYSLIPS) ====================

  async getPayslips({ month, year, empId, periodId, managerId, allowedEmpIds } = {}) {
    const numMonth = month !== undefined && month !== null && !isNaN(Number(month)) ? Number(month) : null;
    const numYear = year !== undefined && year !== null && !isNaN(Number(year)) ? Number(year) : null;

    if (await this.isDbAvailable()) {
      try {
        const conditions = [];
        const params = [];

        if (empId) {
          conditions.push('p.emp_id = ?');
          params.push(empId);
        } else if (allowedEmpIds && Array.isArray(allowedEmpIds)) {
          if (allowedEmpIds.length === 0) {
            return []; // Quản lý chưa có nhân viên thuộc quyền
          }
          conditions.push(`p.emp_id IN (${allowedEmpIds.map(() => '?').join(',')})`);
          params.push(...allowedEmpIds);
        } else if (managerId) {
          conditions.push('(e.manager_id = ? OR d.manager_id = ?)');
          params.push(managerId, managerId);
        }

        if (periodId) {
          conditions.push('p.period_id = ?');
          params.push(periodId);
        }
        if (numMonth) {
          conditions.push('p.month = ?');
          params.push(numMonth);
        }
        if (numYear) {
          conditions.push('p.year = ?');
          params.push(numYear);
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
        if (rows) return rows;
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayslips fallback:', err.message);
      }
    }

    // In-memory fallback
    let list = Array.from(memoryPayslips.values());

    if (empId) {
      list = list.filter(p => p.emp_id === empId);
    } else if (allowedEmpIds && Array.isArray(allowedEmpIds)) {
      if (allowedEmpIds.length === 0) return [];
      const set = new Set(allowedEmpIds);
      list = list.filter(p => set.has(p.emp_id));
    } else if (managerId) {
      const subordinates = memorySubordinates[managerId] || [];
      if (subordinates.length === 0) return [];
      const set = new Set(subordinates);
      list = list.filter(p => set.has(p.emp_id));
    }

    if (periodId) {
      list = list.filter(p => p.period_id === periodId);
    }
    if (numMonth !== null) {
      list = list.filter(p => Number(p.month) === numMonth);
    }
    if (numYear !== null) {
      list = list.filter(p => Number(p.year) === numYear);
    }

    list.sort((a, b) => (b.year - a.year) || (b.month - a.month) || (a.emp_code || '').localeCompare(b.emp_code || ''));
    return list;
  }

  async getPayslipById(id) {
    if (await this.isDbAvailable()) {
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
          [id]
        );
        if (rows && rows.length > 0) return rows[0];
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayslipById fallback:', err.message);
      }
    }

    return memoryPayslips.get(id) || null;
  }

  async savePayslips(payslipList) {
    if (await this.isDbAvailable()) {
      try {
        for (const p of payslipList) {
          await pool.query(
            `INSERT INTO payslips
             (id, period_id, emp_id, month, year, base_salary, standard_days, actual_work_days, paid_leave_days,
              ot_hours, ot_pay, total_allowance, gross_salary, insurance_deduction, late_deduction, tax_deduction, net_salary, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              p.id, p.period_id, p.emp_id, p.month, p.year, p.base_salary, p.standard_days,
              p.actual_work_days, p.paid_leave_days, p.ot_hours, p.ot_pay, p.total_allowance,
              p.gross_salary, p.insurance_deduction, p.late_deduction, p.tax_deduction, p.net_salary, p.status || 'DRAFT'
            ]
          );
        }
      } catch (err) {
        console.warn('[PayrollRepository] MySQL savePayslips fallback:', err.message);
      }
    }

    // Luôn đồng bộ in-memory
    for (const p of payslipList) {
      memoryPayslips.set(p.id, { ...p });
    }
    return payslipList;
  }

  async updatePayslipStatusByPeriod(periodId, status) {
    if (await this.isDbAvailable()) {
      try {
        await pool.query('UPDATE payslips SET status = ? WHERE period_id = ?', [status, periodId]);
      } catch (err) {
        console.warn('[PayrollRepository] MySQL updatePayslipStatusByPeriod fallback:', err.message);
      }
    }

    for (const p of memoryPayslips.values()) {
      if (p.period_id === periodId) {
        p.status = status;
        memoryPayslips.set(p.id, p);
      }
    }
  }

  async getPayrollsSummary(month, year) {
    const numMonth = Number(month);
    const numYear = Number(year);

    if (await this.isDbAvailable()) {
      try {
        const [rows] = await pool.query(
          `SELECT
             COUNT(DISTINCT p.emp_id) AS employee_count,
             COALESCE(SUM(p.gross_salary), 0) AS total_gross_salary,
             COALESCE(SUM(p.net_salary), 0) AS total_net_salary,
             COALESCE(SUM(p.tax_deduction), 0) AS total_tax_deduction,
             COALESCE(SUM(p.insurance_deduction), 0) AS total_insurance_deduction
           FROM payslips p
           WHERE p.month = ? AND p.year = ?`,
          [numMonth, numYear]
        );
        if (rows && rows.length > 0 && Number(rows[0].employee_count) > 0) {
          return rows[0];
        }
      } catch (err) {
        console.warn('[PayrollRepository] MySQL getPayrollsSummary fallback:', err.message);
      }
    }

    // In-memory fallback
    const slips = Array.from(memoryPayslips.values()).filter(p => Number(p.month) === numMonth && Number(p.year) === numYear);
    return {
      employee_count: slips.length,
      total_gross_salary: slips.reduce((sum, p) => sum + Number(p.gross_salary || 0), 0),
      total_net_salary: slips.reduce((sum, p) => sum + Number(p.net_salary || 0), 0),
      total_tax_deduction: slips.reduce((sum, p) => sum + Number(p.tax_deduction || 0), 0),
      total_insurance_deduction: slips.reduce((sum, p) => sum + Number(p.insurance_deduction || 0), 0)
    };
  }
}

module.exports = new PayrollRepository();
