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
    const [rows] = await pool.query('SELECT 1 AS ok');
    return rows && rows[0]?.ok === 1;
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
    const empId = req.user.role === 'EMPLOYEE' ? getEmpIdFromUser(req.user) : (req.query.empId || getEmpIdFromUser(req.user));
    const year = Number(req.query.year || new Date().getFullYear());

    let [rows] = await pool.query(
      `SELECT lb.*, (lb.total_days - lb.used_days - lb.pending_days) AS remaining_days,
              lt.code AS leave_code, lt.name AS leave_name, lt.is_paid
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.emp_id = ? AND lb.year = ?`,
      [empId, year]
    );

    // Tự động khởi tạo quỹ phép 12 ngày nếu chưa có bản ghi
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
    const { status, empId } = req.query;
    const conditions = [];
    const params = [];

    if (req.user.role === 'EMPLOYEE') {
      conditions.push('lr.emp_id = ?');
      params.push(getEmpIdFromUser(req.user));
    } else if (empId) {
      conditions.push('lr.emp_id = ?');
      params.push(empId);
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

// Server-side leave-day calculation: weekdays, with optional half-day session.
function calculateLeaveDays(startDate, endDate, session) {
  const validDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
  };
  const start = validDate(startDate);
  const end = validDate(endDate);
  if (!start || !end || start > end || start.getUTCFullYear() !== end.getUTCFullYear()) return null;
  if (!['FULL_DAY', 'MORNING', 'AFTERNOON'].includes(session)) return null;
  if (session !== 'FULL_DAY' && startDate !== endDate) return null;

  let days = 0;
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (![0, 6].includes(date.getUTCDay())) days += 1;
  }
  if (session !== 'FULL_DAY') days = days === 1 ? 0.5 : 0;
  return days > 0 && days <= 366 ? days : null;
}

// 4. Tạo đơn xin nghỉ phép (SCR_LEAVE_01)
app.post(['/api/v1/leave-requests', '/api/leaves', '/api/leave'], requireAuth(), async (req, res, next) => {
  let connection;
  try {
    const empId = getEmpIdFromUser(req.user);
    const { leaveTypeId, startDate, endDate, session = 'FULL_DAY', reason, attachmentUrl = null } = req.body;
    const totalDays = calculateLeaveDays(startDate, endDate, session);
    if (!empId || !leaveTypeId || !totalDays || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Thông tin nghỉ phép không hợp lệ' });
    }
    if (req.body.totalDays != null && Math.abs(Number(req.body.totalDays) - totalDays) > 0.001) {
      return res.status(400).json({ success: false, error: 'Số ngày phép gửi lên không khớp ngày làm việc được tính trên server' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [types] = await connection.query('SELECT * FROM leave_types WHERE id = ? AND status = "ACTIVE"', [leaveTypeId]);
    if (!types.length) {
      const err = new Error('Loại nghỉ phép không tồn tại hoặc đã ngừng sử dụng');
      err.status = 400;
      throw err;
    }
    if (types[0].require_attachment && !attachmentUrl) {
      const err = new Error('Loại nghỉ phép này yêu cầu giấy tờ minh chứng');
      err.status = 400;
      throw err;
    }

    const [overlaps] = await connection.query(
      `SELECT id FROM leave_requests WHERE emp_id = ? AND status IN ('PENDING','APPROVED')
       AND start_date <= ? AND end_date >= ? LIMIT 1 FOR UPDATE`,
      [empId, endDate, startDate]
    );
    if (overlaps.length) {
      const err = new Error('Khoảng thời gian đã có đơn nghỉ đang chờ duyệt hoặc đã duyệt');
      err.status = 409;
      throw err;
    }

    const year = Number(startDate.slice(0, 4));
    const quota = Number(types[0].max_days_per_year);
    if (quota > 0) {
      await connection.query(
        `INSERT IGNORE INTO leave_balances
         (id, emp_id, leave_type_id, year, total_days, used_days, pending_days)
         VALUES (?, ?, ?, ?, ?, 0, 0)`,
        [crypto.randomUUID(), empId, leaveTypeId, year, quota]
      );
      const [balances] = await connection.query(
        'SELECT * FROM leave_balances WHERE emp_id = ? AND leave_type_id = ? AND year = ? FOR UPDATE',
        [empId, leaveTypeId, year]
      );
      const bal = balances[0];
      const remaining = Number(bal.total_days) - Number(bal.used_days) - Number(bal.pending_days);
      if (totalDays > remaining) {
        const err = new Error(`Số ngày phép còn lại không đủ (còn ${remaining} ngày)`);
        err.status = 400;
        throw err;
      }
      await connection.query('UPDATE leave_balances SET pending_days = pending_days + ? WHERE id = ?', [totalDays, bal.id]);
    }

    const id = crypto.randomUUID();
    await connection.query(
      `INSERT INTO leave_requests (id, emp_id, leave_type_id, start_date, end_date, total_days, session, reason, attachment_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [id, empId, leaveTypeId, startDate, endDate, totalDays, session, reason.trim(), attachmentUrl]
    );
    await connection.commit();
    connection.release();
    connection = null;

    const [created] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    events.publish('LEAVE_REQUEST_CREATED', { requestId: id, empId, startDate, endDate, totalDays }).catch(() => {});
    res.status(201).json({ success: true, message: 'Gửi đơn xin nghỉ phép thành công', data: created[0] });
  } catch (err) {
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
    }
    if (err.status === 400 || err.status === 409) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// 5. Duyệt / Từ chối đơn xin nghỉ phép (SCR_REQ_01)
const handleLeaveDecision = async (req, res, next) => {
  let connection;
  try {
    const { decision, rejectReason = null } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'decision phải là APPROVED hoặc REJECTED' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT lr.*, lt.is_paid FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.id = ? FOR UPDATE`, [req.params.id]
    );
    if (!rows.length || rows[0].status !== 'PENDING') {
      const error = new Error(!rows.length ? 'Không tìm thấy đơn nghỉ phép' : 'Đơn đã được xử lý');
      error.status = rows.length ? 409 : 404;
      throw error;
    }

    const leave = rows[0];
    const approverId = getEmpIdFromUser(req.user);
    const year = Number(String(leave.start_date).slice(0, 4));
    await connection.query(
      `UPDATE leave_requests SET status = ?, approver_id = ?, approved_at = NOW(), reject_reason = ? WHERE id = ?`,
      [decision, approverId, decision === 'REJECTED' ? rejectReason : null, leave.id]
    );

    if (decision === 'APPROVED') {
      await connection.query(
        `UPDATE leave_balances SET pending_days = GREATEST(0, pending_days - ?),
         used_days = used_days + ? WHERE emp_id = ? AND leave_type_id = ? AND year = ?`,
        [leave.total_days, leave.total_days, leave.emp_id, leave.leave_type_id, year]
      );
    } else {
      await connection.query(
        `UPDATE leave_balances SET pending_days = GREATEST(0, pending_days - ?)
         WHERE emp_id = ? AND leave_type_id = ? AND year = ?`,
        [leave.total_days, leave.emp_id, leave.leave_type_id, year]
      );
    }

    await connection.commit();
    connection.release();
    connection = null;

    events.publish(`LEAVE_REQUEST_${decision}`, {
      requestId: leave.id, empId: leave.emp_id,
      startDate: leave.start_date, endDate: leave.end_date,
      totalDays: leave.total_days, isPaid: Boolean(leave.is_paid)
    }).catch(() => {});

    const [updated] = await pool.query(
      `SELECT lr.*, lt.code AS leave_code, lt.name AS leave_name, lt.is_paid,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, lr.emp_id) AS emp_code,
              COALESCE(d.name, 'Chưa phân phòng ban') AS department_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN htqlns_organization.employees e ON lr.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       WHERE lr.id = ?`, [leave.id]
    );
    res.json({ success: true, message: `Đã ${decision === 'APPROVED' ? 'duyệt' : 'từ chối'} đơn nghỉ phép`, data: updated[0] });
  } catch (err) {
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
    }
    if (err.status === 404 || err.status === 409) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
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