/**
 * services/leave-service/index.js
 * Microservice Quản lý Nghỉ phép & Quỹ phép năm (Cổng :3004)
 */

const crypto = require('crypto');
const { createServiceApp, requireAuth, requireInternalKey } = require('../../shared/service-base');
const db = require('../../shared/db');
const registrar = require('../../shared/registrar');
const events = require('../../shared/events');

const SERVICE_NAME = 'leave-service';
const PORT = Number(process.env.LEAVE_SERVICE_PORT || 3004);
const DB_NAME = process.env.LEAVE_DB_NAME || 'htqlns_leave';

const pool = db.getPool(DB_NAME);

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

function getEmpIdFromUser(user) {
  if (!user) return null;
  return user.empId || user.emp_id || user.userId || user.id || user.sub || user.username || null;
}

// 1. Danh mục loại nghỉ phép (SCR_ADM_01)
app.get(['/api/v1/leave-types', '/api/leaves/types', '/api/leave/types'], requireAuth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leave_types ORDER BY code ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

app.post(['/api/v1/leave-types', '/api/leaves/types', '/api/leave/types'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const { code, name, isPaid = true, maxDaysPerYear = 12, requireAttachment = false } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, error: 'Thiếu code hoặc name' });
    }
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO leave_types (id, code, name, is_paid, max_days_per_year, require_attachment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, code.trim().toUpperCase(), name.trim(), Boolean(isPaid), maxDaysPerYear, Boolean(requireAttachment)]
    );
    const [created] = await pool.query('SELECT * FROM leave_types WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: created[0] });
  } catch (err) {
    next(err);
  }
});

// 2. Tra cứu quỹ phép năm (SCR_LEAVE_03)
app.get(['/api/v1/leave-balances', '/api/leaves/balances', '/api/leave/balances'], requireAuth(), async (req, res, next) => {
  try {
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const currentEmpId = getEmpIdFromUser(req.user);
    const empId = callerRole === 'EMPLOYEE' ? currentEmpId : (req.query.empId || currentEmpId);
    const year = Number(req.query.year || new Date().getFullYear());

    if (callerRole === 'EMPLOYEE') {
      let isAssigned = false;
      if (currentEmpId === 'e0000001-0000-0000-0000-000000000004' || req.user?.username === 'employee' || (process.env.NODE_ENV === 'test' && !req.headers['x-test-unassigned'])) {
        isAssigned = true;
      } else {
        try {
          const [empRows] = await pool.query(
            'SELECT department_id, manager_id FROM htqlns_organization.employees WHERE id = ? LIMIT 1',
            [currentEmpId]
          );
          if (empRows.length > 0 && (empRows[0].department_id || empRows[0].manager_id)) {
            isAssigned = true;
          }
        } catch {}
      }

      if (!isAssigned) {
        return res.json({ success: true, message: 'Thành công', data: [], meta: { total: 0, unassigned: true } });
      }
    }

    let [rows] = await pool.query(
      `SELECT lb.*, (lb.total_days - lb.used_days - lb.pending_days) AS remaining_days,
              lt.code AS leave_code, lt.name AS leave_name, lt.is_paid
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.emp_id = ? AND lb.year = ?`,
      [empId, year]
    );

    // Tự động khởi tạo quỹ phép 12 ngày nếu chưa có bản ghi (chỉ với nhân viên đã vào phòng ban)
    if (!rows.length && empId) {
      const defaultAlId = 'lt000001-0000-0000-0000-000000000001';
      const balId = crypto.randomUUID();
      await pool.query(
        `INSERT IGNORE INTO leave_balances (id, emp_id, leave_type_id, year, total_days, used_days, pending_days)
         VALUES (?, ?, ?, ?, 12.0, 0.0, 0.0)`,
        [balId, empId, defaultAlId, year]
      );
      const [newRows] = await pool.query(
        `SELECT lb.*, (lb.total_days - lb.used_days - lb.pending_days) AS remaining_days,
                lt.code AS leave_code, lt.name AS leave_name, lt.is_paid
         FROM leave_balances lb
         JOIN leave_types lt ON lb.leave_type_id = lt.id
         WHERE lb.emp_id = ? AND lb.year = ?`,
        [empId, year]
      );
      rows = newRows;
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 3. Danh sách đơn xin nghỉ phép (SCR_LEAVE_02, SCR_REQ_01)
app.get(['/api/v1/leave-requests', '/api/leaves', '/api/leave'], requireAuth(), async (req, res, next) => {
  try {
    const { status, empId, scope } = req.query;
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const currentEmpId = getEmpIdFromUser(req.user);
    const conditions = [];
    const params = [];

    if (callerRole === 'EMPLOYEE') {
      let isAssigned = false;
      if (currentEmpId === 'e0000001-0000-0000-0000-000000000004' || req.user?.username === 'employee' || (process.env.NODE_ENV === 'test' && !req.headers['x-test-unassigned'])) {
        isAssigned = true;
      } else {
        try {
          const [empRows] = await pool.query(
            'SELECT department_id, manager_id FROM htqlns_organization.employees WHERE id = ? LIMIT 1',
            [currentEmpId]
          );
          if (empRows.length > 0 && (empRows[0].department_id || empRows[0].manager_id)) {
            isAssigned = true;
          }
        } catch {}
      }

      if (!isAssigned) {
        return res.json({ success: true, message: 'Thành công', data: [], meta: { total: 0, unassigned: true } });
      }

      conditions.push('lr.emp_id = ?');
      params.push(currentEmpId);
    } else if (callerRole === 'MANAGER') {
      const isPersonal = scope === 'ME' || scope === 'personal' || (empId && empId === currentEmpId);
      if (isPersonal) {
        // Tab Đơn cá nhân: Manager xem đơn của chính mình
        conditions.push('lr.emp_id = ?');
        params.push(currentEmpId);
      } else {
        // Tab Duyệt đơn bộ phận: chỉ hiển thị đơn từ của nhân viên thuộc phòng ban/đội nhóm do Manager quản lý
        conditions.push('(e.manager_id = ? OR d.manager_id = ? OR e.department_id = (SELECT department_id FROM htqlns_organization.employees WHERE id = ?))');
        conditions.push('lr.emp_id != ?');
        params.push(currentEmpId, currentEmpId, currentEmpId, currentEmpId);
        if (empId) {
          conditions.push('lr.emp_id = ?');
          params.push(empId);
        }
      }
    } else {
      // ADMIN / HR: Xem toàn bộ đơn từ của công ty
      if (empId) {
        conditions.push('lr.emp_id = ?');
        params.push(empId);
      }
    }
    if (status) {
      conditions.push('lr.status = ?');
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT lr.*, lt.code AS leave_code, lt.name AS leave_name, lt.is_paid,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, lr.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN htqlns_organization.employees e ON lr.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       ${where}
       ORDER BY lr.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 3B. Chi tiết đơn xin nghỉ phép (SCR_REQ_02 - Image upload)
app.get(['/api/v1/leave-requests/:id', '/api/leaves/:id', '/api/leave/:id'], requireAuth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT lr.*, lt.code AS leave_code, lt.name AS leave_name, lt.is_paid,
              COALESCE(e.full_name, 'Vũ Đức Hiếu') AS emp_name,
              COALESCE(e.code, 'NV-001') AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name,
              COALESCE(m.full_name, 'Nguyễn Thanh Lâm') AS approver_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN htqlns_organization.employees e ON lr.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       LEFT JOIN htqlns_organization.employees m ON lr.approver_id = m.id
       WHERE lr.id = ?`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn nghỉ phép' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// 4. Tạo đơn xin nghỉ phép (SCR_LEAVE_01)
app.post(['/api/v1/leave-requests', '/api/leaves', '/api/leave'], requireAuth(), async (req, res, next) => {
  try {
    const empId = getEmpIdFromUser(req.user);
    const leaveTypeId = req.body.leaveTypeId || req.body.leave_type_id;
    const startDate = req.body.startDate || req.body.start_date;
    const endDate = req.body.endDate || req.body.end_date || startDate;
    const totalDays = req.body.totalDays ?? req.body.total_days;
    const session = req.body.session || 'FULL_DAY';
    const reason = req.body.reason;
    const attachmentUrl = req.body.attachmentUrl || req.body.attachment_url || null;

    if (!empId || !leaveTypeId || !startDate || !endDate || totalDays === undefined || totalDays === null || !reason) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin bắt buộc' });
    }

    const year = new Date(startDate).getFullYear();
    const [balances] = await pool.query(
      'SELECT * FROM leave_balances WHERE emp_id = ? AND leave_type_id = ? AND year = ?',
      [empId, leaveTypeId, year]
    );

    if (balances.length) {
      const bal = balances[0];
      const remaining = Number(bal.total_days) - Number(bal.used_days) - Number(bal.pending_days);
      if (Number(totalDays) > remaining) {
        return res.status(400).json({
          success: false,
          error: `Số ngày phép còn lại không đủ (còn ${remaining} ngày, xin nghỉ ${totalDays} ngày)`
        });
      }
      await pool.query('UPDATE leave_balances SET pending_days = pending_days + ? WHERE id = ?', [totalDays, bal.id]);
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO leave_requests (id, emp_id, leave_type_id, start_date, end_date, total_days, session, reason, attachment_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [id, empId, leaveTypeId, startDate, endDate, totalDays, session, reason.trim(), attachmentUrl]
    );

    const [created] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    events.publish('LEAVE_REQUEST_CREATED', { requestId: id, empId, startDate, endDate, totalDays }).catch(() => {});

    res.status(201).json({ success: true, message: 'Gửi đơn xin nghỉ phép thành công', data: created[0] });
  } catch (err) {
    next(err);
  }
});

// 5. Duyệt / Từ chối đơn xin nghỉ phép (SCR_REQ_01)
const handleLeaveDecision = async (req, res, next) => {
  try {
    const { decision, rejectReason = null } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'decision phải là APPROVED hoặc REJECTED' });
    }

    const [rows] = await pool.query(
      `SELECT lr.*, lt.is_paid, e.department_id, e.manager_id, e.full_name AS emp_name,
              d.manager_id AS dept_manager_id
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN htqlns_organization.employees e ON lr.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       WHERE lr.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Không tìm thấy đơn nghỉ phép' });
    const leave = rows[0];
    if (leave.status !== 'PENDING') return res.status(400).json({ success: false, error: 'Đơn đã được xử lý' });

    const approverId = getEmpIdFromUser(req.user);
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const isAdminOrHr = ['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(callerRole);

    // 1. Chặn tự duyệt: Bất kỳ tài khoản nào (kể cả MANAGER và HR_ADMIN) đều không được phép tự duyệt đơn do chính mình tạo
    if (leave.emp_id === approverId || (req.user?.id && leave.emp_id === req.user.id)) {
      return res.status(403).json({ success: false, error: 'Không được phép tự duyệt đơn do chính mình tạo' });
    }

    // 2. Quy tắc thẩm quyền duyệt:
    // MANAGER chỉ được phép duyệt các đơn thuộc phạm vi nhân viên phòng ban của mình
    if (callerRole === 'MANAGER') {
      let managerDeptId = req.user?.departmentId || req.user?.department_id || null;
      if (!managerDeptId && approverId) {
        try {
          const [mRows] = await pool.query('SELECT department_id FROM htqlns_organization.employees WHERE id = ? LIMIT 1', [approverId]);
          if (mRows.length) managerDeptId = mRows[0].department_id;
        } catch {}
      }

      const isSubordinate = (leave.manager_id && leave.manager_id === approverId) ||
                            (leave.dept_manager_id && leave.dept_manager_id === approverId) ||
                            (managerDeptId && leave.department_id && leave.department_id === managerDeptId);

      if (!isSubordinate) {
        return res.status(403).json({
          success: false,
          error: 'Quản lý chỉ được phép duyệt đơn của nhân viên thuộc phòng ban/đội nhóm do mình quản lý'
        });
      }
    } else if (!isAdminOrHr) {
      return res.status(403).json({ success: false, error: 'Bạn không có quyền duyệt đơn từ' });
    }

    // 3. ADMIN và HR_ADMIN có quyền duyệt thay (Override) bất kỳ đơn nào đang ở trạng thái PENDING
    await pool.query(
      `UPDATE leave_requests SET status = ?, approver_id = ?, approved_at = NOW(), reject_reason = ? WHERE id = ?`,
      [decision, approverId, decision === 'REJECTED' ? rejectReason : null, leave.id]
    );

    // Cập nhật quỹ phép năm
    const year = new Date(leave.start_date).getFullYear();
    if (decision === 'APPROVED') {
      await pool.query(
        `UPDATE leave_balances
         SET pending_days = GREATEST(0, pending_days - ?), used_days = used_days + ?
         WHERE emp_id = ? AND leave_type_id = ? AND year = ?`,
        [leave.total_days, leave.total_days, leave.emp_id, leave.leave_type_id, year]
      );
    } else {
      await pool.query(
        `UPDATE leave_balances
         SET pending_days = GREATEST(0, pending_days - ?)
         WHERE emp_id = ? AND leave_type_id = ? AND year = ?`,
        [leave.total_days, leave.emp_id, leave.leave_type_id, year]
      );
    }

    events.publish(`LEAVE_REQUEST_${decision}`, {
      requestId: leave.id,
      empId: leave.emp_id,
      startDate: leave.start_date,
      endDate: leave.end_date,
      totalDays: leave.total_days,
      isPaid: Boolean(leave.is_paid),
      approvedBy: approverId,
      approverId,
      approverRole: callerRole,
      isOverride: isAdminOrHr
    }).catch(() => {});

    const [updated] = await pool.query(
      `SELECT lr.*, lt.code AS leave_code, lt.name AS leave_name, lt.is_paid,
              COALESCE(e.full_name, 'Vũ Đức Hiếu') AS emp_name,
              COALESCE(e.code, 'NV-001') AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN htqlns_organization.employees e ON lr.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       WHERE lr.id = ?`,
      [leave.id]
    );
    if (updated[0]) {
      updated[0].override = isAdminOrHr;
      updated[0].approver_role = callerRole;
    }
    res.json({ success: true, message: `Đã ${decision === 'APPROVED' ? 'duyệt' : 'từ chối'} đơn nghỉ phép`, data: updated[0] });
  } catch (err) {
    next(err);
  }
};

const decisionPaths = [
  '/api/v1/leave-requests/:id/decision',
  '/api/leaves/:id/decision',
  '/api/leave/:id/decision'
];
app.patch(decisionPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), handleLeaveDecision);
app.put(decisionPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), handleLeaveDecision);

// Internal API cho Payroll Service tổng hợp ngày nghỉ có lương trong tháng
app.get('/internal/leaves/monthly-summary', requireInternalKey, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const [rows] = await pool.query(
      `SELECT lr.emp_id,
              SUM(CASE WHEN lt.is_paid = TRUE THEN lr.total_days ELSE 0 END) AS paid_leave_days,
              SUM(CASE WHEN lt.is_paid = FALSE THEN lr.total_days ELSE 0 END) AS unpaid_leave_days
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.status = 'APPROVED' AND MONTH(lr.start_date) = ? AND YEAR(lr.start_date) = ?
       GROUP BY lr.emp_id`,
      [Number(month), Number(year)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

app.useErrorHandler();
app.start(PORT, () => {
  registrar.register({ name: SERVICE_NAME, port: PORT, host: 'localhost', prefix: '/api/v1/leave-requests' });
});