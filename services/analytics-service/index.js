/**
 * services/analytics-service/index.js
 * Microservice Dashboard Chuyên cần, Năng suất & Cảnh báo Ngưỡng (Cổng :3008)
 */

const crypto = require('crypto');
const { createServiceApp, requireAuth } = require('../../shared/service-base');
const db = require('../../shared/db');
const registrar = require('../../shared/registrar');
const env = require('../../shared/env');

const SERVICE_NAME = 'analytics-service';
const PORT = Number(process.env.ANALYTICS_SERVICE_PORT || 3008);
const DB_NAME = process.env.ANALYTICS_DB_NAME || 'htqlns_analytics';

const ORGANIZATION_URL = process.env.ORGANIZATION_SERVICE_URL || 'http://localhost:3002';
const ATTENDANCE_URL = process.env.ATTENDANCE_SERVICE_URL || 'http://localhost:3003';
const LEAVE_URL = process.env.LEAVE_SERVICE_URL || 'http://localhost:3004';
const SHIFT_URL = process.env.SHIFT_SERVICE_URL || 'http://localhost:3005';
const PAYROLL_URL = process.env.PAYROLL_SERVICE_URL || 'http://localhost:3006';

const pool = db.getPool(DB_NAME);

// Dữ liệu dự phòng in-memory khi cơ sở dữ liệu MySQL không khả dụng
const memoryFallbackEmployees = [
  { id: 'e0000001-0000-0000-0000-000000000001', code: 'EMP001', full_name: 'Nguyễn Quản Trị (Admin)', department_id: 'd0000001-0000-0000-0000-000000000001', department_name: 'Ban Giám Đốc', manager_id: null, status: 'ACTIVE' },
  { id: 'e0000001-0000-0000-0000-000000000002', code: 'EMP002', full_name: 'Trần Thị Thu Hà (HR)', department_id: 'd0000001-0000-0000-0000-000000000002', department_name: 'Phòng Hành chính Nhân sự', manager_id: null, status: 'ACTIVE' },
  { id: 'e0000001-0000-0000-0000-000000000003', code: 'NV-QL01', full_name: 'Nguyễn Thanh Lâm', department_id: 'd0000001-0000-0000-0000-000000000003', department_name: 'Phòng Công nghệ & Phần mềm', manager_id: null, status: 'ACTIVE' },
  { id: 'e0000001-0000-0000-0000-000000000004', code: 'NV-001', full_name: 'Vũ Đức Hiếu', department_id: 'd0000001-0000-0000-0000-000000000003', department_name: 'Phòng Công nghệ & Phần mềm', manager_id: 'e0000001-0000-0000-0000-000000000003', status: 'ACTIVE' },
  { id: 'e0000001-0000-0000-0000-000000000005', code: 'NV-002', full_name: 'Huỳnh Gia Kiệt', department_id: 'd0000001-0000-0000-0000-000000000003', department_name: 'Phòng Công nghệ & Phần mềm', manager_id: 'e0000001-0000-0000-0000-000000000003', status: 'ACTIVE' },
  { id: 'e0000001-0000-0000-0000-000000000006', code: 'NV-003', full_name: 'Nguyễn Gia Hảo', department_id: 'd0000001-0000-0000-0000-000000000003', department_name: 'Phòng Công nghệ & Phần mềm', manager_id: 'e0000001-0000-0000-0000-000000000003', status: 'ACTIVE' }
];

const memoryFallbackDepartments = [
  { id: 'd0000001-0000-0000-0000-000000000001', code: 'PB-BGD', name: 'Ban Giám Đốc', manager_id: 'e0000001-0000-0000-0000-000000000001' },
  { id: 'd0000001-0000-0000-0000-000000000002', code: 'PB-HR', name: 'Phòng Hành chính Nhân sự', manager_id: 'e0000001-0000-0000-0000-000000000002' },
  { id: 'd0000001-0000-0000-0000-000000000003', code: 'PB-TECH', name: 'Phòng Công nghệ & Phần mềm', manager_id: 'e0000001-0000-0000-0000-000000000003' }
];

function formatTime(val) {
  if (!val) return '--:--';
  try {
    if (typeof val === 'string' && val.includes(':')) {
      const parts = val.split(' ');
      const timePart = parts.length > 1 ? parts[1] : parts[0];
      return timePart.slice(0, 5);
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).slice(0, 5);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '--:--';
  }
}

async function isDbAvailable() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return Boolean(rows && rows[0]?.ok === 1);
  } catch {
    return false;
  }
}

const app = createServiceApp(SERVICE_NAME, {
  port: PORT,
  checkHealth: async () => {
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      return rows && rows[0]?.ok === 1;
    } catch {
      return false; // In-memory fallback mode
    }
  }
});

async function fetchInternal(url, fallback) {
  try {
    const res = await fetch(url, { headers: { 'x-internal-key': env.INTERNAL_API_KEY } });
    const json = await res.json();
    return json.success ? json.data : fallback;
  } catch {
    return fallback;
  }
}

// 1. Dashboard tổng hợp chỉ số chuyên cần, OT, nghỉ phép và quỹ lương (SCR_DASH_01)
app.get(['/api/v1/analytics/dashboard', '/api/analytics/dashboard', '/api/analytics'], requireAuth(['ADMIN', 'HR', 'MANAGER']), async (req, res, next) => {
  try {
    const month = Number(req.query.month || new Date().getMonth() + 1);
    const year = Number(req.query.year || new Date().getFullYear());

    const attList = await fetchInternal(`${ATTENDANCE_URL}/internal/attendances/monthly-summary?month=${month}&year=${year}`, []);
    const leaveList = await fetchInternal(`${LEAVE_URL}/internal/leaves/monthly-summary?month=${month}&year=${year}`, []);
    const otList = await fetchInternal(`${SHIFT_URL}/internal/ot/summary?month=${month}&year=${year}`, []);
    const payrollSum = await fetchInternal(`${PAYROLL_URL}/internal/payrolls/summary?month=${month}&year=${year}`, { employee_count: 0, total_net_salary: 0 });

    const totalWorkDays = attList.reduce((acc, r) => acc + Number(r.actual_work_days || 0), 0);
    const totalLateMinutes = attList.reduce((acc, r) => acc + Number(r.total_late_minutes || 0), 0);
    const totalLeaveDays = leaveList.reduce((acc, r) => acc + Number(r.paid_leave_days || 0) + Number(r.unpaid_leave_days || 0), 0);
    const totalOtHours = otList.reduce((acc, r) => acc + Number(r.total_ot_hours || 0), 0);

    // Kiểm tra cảnh báo vượt ngưỡng OT (> 40h/tháng)
    const alerts = [];
    for (const ot of otList) {
      if (Number(ot.total_ot_hours) > 40) {
        alerts.push({
          type: 'OT_THRESHOLD_EXCEEDED',
          empId: ot.emp_id,
          value: Number(ot.total_ot_hours),
          message: `Nhân sự ${ot.emp_id} có tổng giờ OT ${ot.total_ot_hours}h vượt ngưỡng 40h/tháng`
        });
      }
    }

    res.json({
      success: true,
      data: {
        period: { month, year },
        kpis: {
          totalWorkDays,
          totalLateMinutes,
          totalLeaveDays,
          totalOtHours,
          totalNetPayroll: Number(payrollSum.total_net_salary || 0),
          activeHeadcount: Number(payrollSum.employee_count || attList.length)
        },
        alerts
      }
    });
  } catch (err) {
    next(err);
  }
});

// 2. Danh sách cấu hình ngưỡng cảnh báo (SCR_REP_01)
app.get(['/api/v1/analytics/thresholds', '/api/analytics/thresholds'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM alert_thresholds');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 3. API Tổng quan trong ngày (SCR_DASH_01, SCR_ADM_03) cho Admin & Manager (RBAC Scope chuẩn hóa)
const getOverviewHandler = async (req, res, next) => {
  try {
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const callerUserId = req.headers['x-user-id'] || req.user?.empId || req.user?.userId || req.user?.id;
    const filterDeptId = req.query.departmentId || null;
    const dateParam = req.query.date || req.query.workDate || new Date().toLocaleDateString('en-CA');
    const targetDate = String(dateParam).slice(0, 10);

    const isManager = callerRole === 'MANAGER';
    const isAdminOrHr = callerRole === 'ADMIN' || callerRole === 'HR' || callerRole === 'HR_ADMIN' || callerRole === 'SYSTEM_ADMIN';

    let allEmployees = [];
    let allDepartments = [];
    let todayAttendances = [];
    let activeLeaves = [];
    let pendingLeaves = [];

    let hasDb = await isDbAvailable();

    if (hasDb) {
      try {
        const [depts] = await pool.query('SELECT * FROM htqlns_organization.departments WHERE status = "ACTIVE"');
        allDepartments = depts;

        const [emps] = await pool.query(`
          SELECT e.id, e.code, e.full_name, e.email, e.phone, e.department_id, e.manager_id, e.status,
                 d.name AS department_name, d.code AS department_code
          FROM htqlns_organization.employees e
          LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
        `);
        allEmployees = emps;

        const [atts] = await pool.query(`
          SELECT a.*, e.full_name AS emp_name, e.code AS emp_code, d.name AS department_name
          FROM htqlns_attendance.attendance_logs a
          LEFT JOIN htqlns_organization.employees e ON a.emp_id = e.id
          LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
          WHERE a.work_date = ?
        `, [targetDate]);
        todayAttendances = atts;

        const [leaves] = await pool.query(`
          SELECT lr.*, lt.name AS leave_name, e.full_name AS emp_name, e.code AS emp_code, d.name AS department_name
          FROM htqlns_leave.leave_requests lr
          LEFT JOIN htqlns_leave.leave_types lt ON lr.leave_type_id = lt.id
          LEFT JOIN htqlns_organization.employees e ON lr.emp_id = e.id
          LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
          WHERE lr.status = 'APPROVED'
            AND ? BETWEEN lr.start_date AND lr.end_date
        `, [targetDate]);
        activeLeaves = leaves;

        const [pending] = await pool.query(`
          SELECT lr.*, lt.name AS leave_name, e.full_name AS emp_name, e.code AS emp_code, d.name AS department_name
          FROM htqlns_leave.leave_requests lr
          LEFT JOIN htqlns_leave.leave_types lt ON lr.leave_type_id = lt.id
          LEFT JOIN htqlns_organization.employees e ON lr.emp_id = e.id
          LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
          WHERE lr.status = 'PENDING'
          ORDER BY lr.created_at DESC
        `);
        pendingLeaves = pending;
      } catch (dbErr) {
        console.warn('[Analytics-Service] Lỗi truy vấn DB, chuyển sang in-memory fallback:', dbErr.message);
        hasDb = false;
      }
    }

    if (!hasDb) {
      allDepartments = memoryFallbackDepartments;
      allEmployees = memoryFallbackEmployees;
      todayAttendances = [];
      activeLeaves = [];
      pendingLeaves = [];
    }

    // 1. Phân quyền phạm vi dữ liệu (RBAC Scope)
    let scopedEmployees = [];
    let deptNameDisplay = 'Toàn công ty';

    if (isManager) {
      // Tìm các phòng ban do Quản lý này phụ trách
      const managedDeptIds = allDepartments.filter((d) => d.manager_id === callerUserId).map((d) => d.id);
      const managerDept = allDepartments.find((d) => d.manager_id === callerUserId);
      if (managerDept) {
        deptNameDisplay = managerDept.name;
      } else {
        deptNameDisplay = 'Đội ngũ quản lý';
      }

      // Lọc danh sách nhân viên cấp dưới trực thuộc
      scopedEmployees = allEmployees.filter(
        (e) => (e.manager_id && e.manager_id === callerUserId) || (e.department_id && managedDeptIds.includes(e.department_id))
      );
    } else {
      // ADMIN / HR
      if (filterDeptId && filterDeptId !== 'ALL') {
        scopedEmployees = allEmployees.filter((e) => e.department_id === filterDeptId);
        const d = allDepartments.find((dept) => dept.id === filterDeptId);
        if (d) deptNameDisplay = d.name;
      } else {
        scopedEmployees = allEmployees;
      }
    }

    // 2. Chỉ tính trên các nhân viên đang hoạt động (ACTIVE)
    const activeEmployees = scopedEmployees.filter((e) => e.status === 'ACTIVE');
    const pendingEmployees = scopedEmployees.filter(
      (e) => e.status === 'PENDING' || e.status === 'PENDING_ASSIGNMENT' || !e.status
    );
    const totalEmployees = activeEmployees.length;
    const activeEmpIds = new Set(activeEmployees.map((e) => e.id));

    // 3. Nếu Quản lý chưa có nhân viên nào hoặc tổng nhân sự = 0
    if (totalEmployees === 0) {
      return res.json({
        success: true,
        message: 'Lấy dữ liệu tổng quan thành công (trống)',
        data: {
          date: targetDate,
          departmentName: deptNameDisplay,
          departmentId: filterDeptId || null,
          role: callerRole,
          isManager,
          metrics: {
            totalEmployees: 0,
            presentCount: 0,
            onTimeCount: 0,
            lateCount: 0,
            leaveCount: 0,
            absentCount: 0,
            pendingRequestsCount: 0,
            attendanceRate: 0,
            pendingOnboardCount: pendingEmployees.length
          },
          donut: {
            total: 0,
            onTime: { count: 0, percent: 0 },
            late: { count: 0, percent: 0 },
            leave: { count: 0, percent: 0 },
            absent: { count: 0, percent: 0 }
          },
          lateEmployees: [],
          pendingRequests: []
        }
      });
    }

    // 4. Tính toán số liệu Chấm công hôm nay
    const relevantAttendances = todayAttendances.filter((a) => activeEmpIds.has(a.emp_id));
    const presentEmpIds = new Set();
    const lateEmployeesList = [];

    for (const att of relevantAttendances) {
      if (att.check_in_time) {
        presentEmpIds.add(att.emp_id);
      }
      const isLate = att.status === 'LATE' || Number(att.late_minutes) > 0;
      if (isLate) {
        lateEmployeesList.push({
          id: att.id,
          empId: att.emp_id,
          empCode: att.emp_code || ('NV-' + String(att.emp_id).slice(-4)),
          empName: att.emp_name || 'Nhân viên',
          departmentName: att.department_name || deptNameDisplay,
          checkInTime: formatTime(att.check_in_time),
          lateMinutes: Number(att.late_minutes || 0)
        });
      }
    }

    const presentCount = presentEmpIds.size;
    const lateCount = lateEmployeesList.length;
    const onTimeCount = Math.max(0, presentCount - lateCount);

    // 5. Tính toán Nghỉ phép hôm nay
    const relevantLeaves = activeLeaves.filter((l) => activeEmpIds.has(l.emp_id));
    const leaveEmpIds = new Set(relevantLeaves.map((l) => l.emp_id));
    const leaveCount = leaveEmpIds.size;

    // 6. Tính toán Chưa chấm công (Absent)
    const absentCount = Math.max(0, totalEmployees - presentCount - leaveCount);
    const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 1000) / 10 : 0;

    // 7. Tỷ lệ biểu đồ Donut Chart (%)
    const onTimePercent = Math.round((onTimeCount / totalEmployees) * 1000) / 10;
    const latePercent = Math.round((lateCount / totalEmployees) * 1000) / 10;
    const leavePercent = Math.round((leaveCount / totalEmployees) * 1000) / 10;
    const absentPercent = Math.max(0, Math.round((100 - onTimePercent - latePercent - leavePercent) * 10) / 10);

    // 8. Danh sách đơn chờ duyệt
    const relevantPending = pendingLeaves.filter((r) => activeEmpIds.has(r.emp_id));
    const formattedPending = relevantPending.map((r) => ({
      id: r.id,
      empId: r.emp_id,
      empCode: r.emp_code || ('NV-' + String(r.emp_id).slice(-4)),
      empName: r.emp_name || 'Nhân viên',
      departmentName: r.department_name || deptNameDisplay,
      leaveName: r.leave_name || 'Nghỉ phép',
      startDate: r.start_date,
      endDate: r.end_date,
      totalDays: Number(r.total_days || 1),
      reason: r.reason || '',
      createdAt: r.created_at
    }));

    return res.json({
      success: true,
      message: 'Lấy dữ liệu tổng quan thành công',
      data: {
        date: targetDate,
        departmentName: deptNameDisplay,
        departmentId: filterDeptId || null,
        role: callerRole,
        isManager,
        metrics: {
          totalEmployees,
          presentCount,
          onTimeCount,
          lateCount,
          leaveCount,
          absentCount,
          pendingRequestsCount: formattedPending.length,
          attendanceRate,
          pendingOnboardCount: pendingEmployees.length
        },
        donut: {
          total: totalEmployees,
          onTime: { count: onTimeCount, percent: onTimePercent },
          late: { count: lateCount, percent: latePercent },
          leave: { count: leaveCount, percent: leavePercent },
          absent: { count: absentCount, percent: absentPercent }
        },
        lateEmployees: lateEmployeesList,
        pendingRequests: formattedPending
      }
    });
  } catch (err) {
    next(err);
  }
};

app.get([
  '/api/v1/analytics/overview',
  '/api/analytics/overview',
  '/api/v1/analytics/today',
  '/api/analytics/today',
  '/api/v1/analytics/dashboard/overview',
  '/api/analytics/dashboard/overview'
], requireAuth(['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN', 'MANAGER']), getOverviewHandler);

// 4. API Thống kê Chuyên cần theo Chu kỳ (SCR_REP_01, SCR_REP_02)
const getStatsHandler = async (req, res, next) => {
  try {
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const callerUserId = req.headers['x-user-id'] || req.user?.empId || req.user?.userId || req.user?.id;
    const isManager = callerRole === 'MANAGER';

    const periodParam = req.query.period || '';
    let month = Number(req.query.month || 0);
    let year = Number(req.query.year || 0);
    let isQuarter = false;
    let quarterNum = 0;
    let periodLabel = '';

    if (periodParam.includes('-Q')) {
      isQuarter = true;
      const parts = periodParam.split('-Q');
      year = Number(parts[0]) || 2026;
      quarterNum = Number(parts[1]) || 3;
      periodLabel = `Quý ${quarterNum}/${year}`;
    } else if (periodParam.match(/^\d{4}-\d{2}$/)) {
      const parts = periodParam.split('-');
      year = Number(parts[0]);
      month = Number(parts[1]);
      periodLabel = `Tháng ${String(month).padStart(2, '0')}/${year}`;
    } else {
      if (!month) month = new Date().getMonth() + 1;
      if (!year) year = new Date().getFullYear();
      periodLabel = `Tháng ${String(month).padStart(2, '0')}/${year}`;
    }

    let allEmployees = [];
    let allDepartments = [];
    let logs = [];
    let leaves = [];
    let ots = [];
    let hasDb = await isDbAvailable();

    if (hasDb) {
      try {
        const [depts] = await pool.query('SELECT * FROM htqlns_organization.departments WHERE status = "ACTIVE"');
        allDepartments = depts;

        const [emps] = await pool.query(`
          SELECT e.id, e.code, e.full_name, e.department_id, e.manager_id, e.status,
                 d.name AS department_name, d.code AS department_code
          FROM htqlns_organization.employees e
          LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
          WHERE e.status = 'ACTIVE'
        `);
        allEmployees = emps;

        let attDateCond = isQuarter
          ? 'QUARTER(a.work_date) = ? AND YEAR(a.work_date) = ?'
          : 'MONTH(a.work_date) = ? AND YEAR(a.work_date) = ?';
        let attDateParams = isQuarter ? [quarterNum, year] : [month, year];

        const [attRows] = await pool.query(`
          SELECT a.*, e.department_id
          FROM htqlns_attendance.attendance_logs a
          JOIN htqlns_organization.employees e ON a.emp_id = e.id
          WHERE ${attDateCond}
        `, attDateParams);
        logs = attRows;

        let leaveDateCond = isQuarter
          ? 'QUARTER(lr.start_date) = ? AND YEAR(lr.start_date) = ?'
          : 'MONTH(lr.start_date) = ? AND YEAR(lr.start_date) = ?';
        let leaveDateParams = isQuarter ? [quarterNum, year] : [month, year];

        const [leaveRows] = await pool.query(`
          SELECT lr.*, e.department_id
          FROM htqlns_leave.leave_requests lr
          JOIN htqlns_organization.employees e ON lr.emp_id = e.id
          WHERE lr.status = 'APPROVED' AND ${leaveDateCond}
        `, leaveDateParams);
        leaves = leaveRows;

        let otDateCond = isQuarter
          ? 'QUARTER(ot.work_date) = ? AND YEAR(ot.work_date) = ?'
          : 'MONTH(ot.work_date) = ? AND YEAR(ot.work_date) = ?';
        let otDateParams = isQuarter ? [quarterNum, year] : [month, year];

        const [otRows] = await pool.query(`
          SELECT ot.*, e.department_id
          FROM htqlns_shift.ot_requests ot
          JOIN htqlns_organization.employees e ON ot.emp_id = e.id
          WHERE ot.status = 'APPROVED' AND ${otDateCond}
        `, otDateParams);
        ots = otRows;
      } catch (err) {
        console.warn('[Analytics-Service] Lỗi truy vấn DB thống kê, fallback memory:', err.message);
        hasDb = false;
      }
    }

    if (!hasDb) {
      allDepartments = memoryFallbackDepartments;
      allEmployees = memoryFallbackEmployees.filter((e) => e.status === 'ACTIVE');
      logs = [];
      leaves = [];
      ots = [];
    }

    let scopedEmployees = [];
    if (isManager) {
      const managedDeptIds = allDepartments.filter((d) => d.manager_id === callerUserId).map((d) => d.id);
      scopedEmployees = allEmployees.filter(
        (e) => (e.manager_id && e.manager_id === callerUserId) || (e.department_id && managedDeptIds.includes(e.department_id))
      );
    } else {
      scopedEmployees = allEmployees;
    }

    const scopedEmpIds = new Set(scopedEmployees.map((e) => e.id));
    const totalEmployees = scopedEmployees.length;
    const periodKey = (typeof periodParam === 'string' && periodParam.trim())
      ? periodParam.trim()
      : (isQuarter ? `${year}-Q${quarterNum}` : `${year}-${String(month).padStart(2, '0')}`);

    if (totalEmployees === 0) {
      return res.json({
        success: true,
        data: {
          period: periodKey,
          periodInfo: { month, year, label: periodLabel },
          scope: {
            role: callerRole,
            managerId: isManager ? callerUserId : null,
            isScoped: isManager
          },
          summary: {
            onTimeRate: '0%',
            lateRate: '0%',
            leaveRate: '0%',
            totalWorkingHours: '0 h',
            totalEmployees: 0,
            totalWorkDays: 0,
            totalLateCount: 0,
            totalEarlyLeaveCount: 0,
            totalLeaveDays: 0,
            totalOtHours: 0
          },
          departments: []
        }
      });
    }

    const scopedLogs = logs.filter((l) => scopedEmpIds.has(l.emp_id));
    const scopedLeaves = leaves.filter((l) => scopedEmpIds.has(l.emp_id));
    const scopedOts = ots.filter((o) => scopedEmpIds.has(o.emp_id));

    const deptMap = new Map();
    allDepartments.forEach((d) => {
      const deptEmps = scopedEmployees.filter((e) => e.department_id === d.id);
      if (deptEmps.length > 0) {
        deptMap.set(d.id, {
          id: d.id,
          name: d.name,
          code: d.code,
          empCount: deptEmps.length,
          empIds: new Set(deptEmps.map((e) => e.id))
        });
      }
    });

    const standardDaysMultiplier = isQuarter ? 66 : 22;
    const departmentsStats = [];

    deptMap.forEach((d) => {
      const dLogs = scopedLogs.filter((l) => d.empIds.has(l.emp_id));
      const dLeaves = scopedLeaves.filter((l) => d.empIds.has(l.emp_id));
      const standardDays = d.empCount * standardDaysMultiplier;
      const actualDays = dLogs.filter((l) => l.check_in_time || ['ON_TIME', 'LATE', 'EARLY_LEAVE'].includes(l.status)).length;
      const lateCount = dLogs.filter((l) => l.status === 'LATE' || Number(l.late_minutes) > 0).length;
      const leaveDays = dLeaves.reduce((acc, cur) => acc + (Number(cur.total_days) || 1), 0);
      const rateNum = standardDays > 0 ? Math.min(100, Math.round((actualDays / standardDays) * 1000) / 10) : 0;

      departmentsStats.push({
        id: d.id,
        name: d.name,
        code: d.code,
        empCount: d.empCount,
        standardDays,
        actualDays,
        lateCount,
        leaveDays,
        attendanceRate: `${rateNum}%`
      });
    });

    const totalWorkDays = scopedLogs.filter((l) => l.check_in_time || ['ON_TIME', 'LATE', 'EARLY_LEAVE'].includes(l.status)).length;
    const totalLateCount = scopedLogs.filter((l) => l.status === 'LATE' || Number(l.late_minutes) > 0).length;
    const totalEarlyLeaveCount = scopedLogs.filter((l) => l.status === 'EARLY_LEAVE' || Number(l.early_leave_minutes) > 0).length;
    const totalLeaveDays = scopedLeaves.reduce((acc, cur) => acc + (Number(cur.total_days) || 1), 0);
    const totalOtHours = Math.round(scopedOts.reduce((acc, cur) => acc + (Number(cur.total_hours || cur.ot_hours) || 0), 0) * 10) / 10;
    const totalWorkingHours = Math.round(scopedLogs.reduce((acc, cur) => acc + (Number(cur.actual_working_hours) || (cur.check_in_time && cur.check_out_time ? 8 : 0)), 0) * 10) / 10;

    const onTimeRate = totalWorkDays > 0 ? Math.round(((totalWorkDays - totalLateCount) / totalWorkDays) * 1000) / 10 : 0;
    const lateRate = totalWorkDays > 0 ? Math.round((totalLateCount / totalWorkDays) * 1000) / 10 : 0;
    const totalStandardDays = totalEmployees * standardDaysMultiplier;
    const leaveRate = totalStandardDays > 0 ? Math.round((totalLeaveDays / totalStandardDays) * 1000) / 10 : 0;

    return res.json({
      success: true,
      data: {
        period: periodKey,
        periodInfo: { month, year, label: periodLabel },
        scope: {
          role: callerRole,
          managerId: isManager ? callerUserId : null,
          isScoped: isManager
        },
        summary: {
          onTimeRate: `${onTimeRate}%`,
          lateRate: `${lateRate}%`,
          leaveRate: `${leaveRate}%`,
          totalWorkingHours: `${totalWorkingHours.toLocaleString('vi-VN')} h`,
          totalEmployees,
          totalWorkDays,
          totalLateCount,
          totalEarlyLeaveCount,
          totalLeaveDays,
          totalOtHours
        },
        departments: departmentsStats
      }
    });
  } catch (err) {
    next(err);
  }
};

app.get([
  '/api/v1/analytics/stats',
  '/api/analytics/stats',
  '/api/v1/analytics/dashboard/stats',
  '/api/analytics/dashboard/stats'
], requireAuth(['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN', 'MANAGER']), getStatsHandler);

app.useErrorHandler();
app.start(PORT, () => {
  registrar.register({ name: SERVICE_NAME, port: PORT, host: 'localhost', prefix: '/api/v1/analytics' });
});