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
    if (req.user.role === 'EMPLOYEE' && rows[0].emp_id !== getEmpIdFromUser(req.user)) {
      return res.status(403).json({ success: false, error: 'Không được xem đơn nghỉ phép của người khác' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Binary evidence remains private in MySQL; clients upload base64 payloads
// through the same JWT-authenticated JSON gateway as other service requests.
const MAX_LEAVE_ATTACHMENT_BYTES = 2 * 1024 * 1024;
function parseLeaveAttachment(body) {
  const fail = message => { const e = new Error(message); e.status = 400; throw e; };
  const { fileName, contentBase64, mediaType } = body || {};
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 120 ||
      /[\\/\x00-\x1f\x7f]/.test(fileName) || fileName.startsWith('.')) {
    fail('Tên tệp không hợp lệ (tối đa 120 ký tự, không có đường dẫn)');
  }
  if (typeof contentBase64 !== 'string' || contentBase64.length < 12 ||
      contentBase64.length > Math.ceil(MAX_LEAVE_ATTACHMENT_BYTES / 3) * 4 + 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0) {
    fail('Nội dung tệp base64 không hợp lệ hoặc vượt quá 2 MB');
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  if (!bytes.length || bytes.length > MAX_LEAVE_ATTACHMENT_BYTES ||
      bytes.toString('base64') !== contentBase64) fail('Dung lượng tệp không hợp lệ');
  let mime;
  if (bytes.subarray(0, 5).toString() === '%PDF-' && /\.pdf$/i.test(fileName)) mime = 'application/pdf';
  else if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
    /\.png$/i.test(fileName)) mime = 'image/png';
  else if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 &&
    /\.(jpe?g)$/i.test(fileName)) mime = 'image/jpeg';
  else fail('Chỉ hỗ trợ PDF, PNG hoặc JPEG khớp với định dạng tệp');
  if (mediaType && mediaType !== mime) fail('Loại MIME không khớp nội dung tệp');
  return { bytes, mime, fileName };
}

app.post('/api/v1/leave-attachments', requireAuth(), async (req, res, next) => {
  try {
    const empId = getEmpIdFromUser(req.user);
    if (!empId) return res.status(400).json({ success: false, error: 'Thiếu hồ sơ nhân sự liên kết' });
    const { bytes, mime, fileName } = parseLeaveAttachment(req.body);
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO leave_attachments (id, emp_id, file_name, mime_type, size_bytes, content) VALUES (?, ?, ?, ?, ?, ?)',
      [id, empId, fileName, mime, bytes.length, bytes]
    );
    res.status(201).json({
      success: true, message: 'Tải minh chứng lên thành công',
      data: { id, fileName, mimeType: mime, sizeBytes: bytes.length,
        attachmentUrl: '/api/v1/leave-attachments/' + id }
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

app.get('/api/v1/leave-attachments/:id', requireAuth(), async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy tệp' });
    }
    const [rows] = await pool.query(
      'SELECT emp_id, file_name, mime_type, size_bytes, content FROM leave_attachments WHERE id = ?',
      [req.params.id]
    );
    const attachment = rows[0];
    if (!attachment) return res.status(404).json({ success: false, error: 'Không tìm thấy tệp' });
    const viewerEmpId = getEmpIdFromUser(req.user);
    let allowed = attachment.emp_id === viewerEmpId || ['ADMIN','HR'].includes(req.user.role);
    if (!allowed && req.user.role === 'MANAGER' && viewerEmpId) {
      const [managed] = await pool.query(
        'SELECT id FROM htqlns_organization.employees WHERE id = ? AND manager_id = ? LIMIT 1',
        [attachment.emp_id, viewerEmpId]
      );
      allowed = managed.length > 0;
    }
    if (!allowed) return res.status(404).json({ success: false, error: 'Không tìm thấy tệp' });
    const safeName = attachment.file_name.replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(attachment.content));
  } catch (err) { next(err); }
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
    if (attachmentUrl !== null &&
        (typeof attachmentUrl !== 'string' || !/^\/api\/v1\/leave-attachments\/[0-9a-f-]{36}$/i.test(attachmentUrl))) {
      return res.status(400).json({ success: false, error: 'Minh chứng phải được tải lên qua API trước khi gửi đơn' });
    }
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
    if (attachmentUrl) {
      const attachmentId = attachmentUrl.split('/').pop();
      const [evidence] = await connection.query(
        'SELECT id FROM leave_attachments WHERE id = ? AND emp_id = ?',
        [attachmentId, empId]
      );
      if (!evidence.length) {
        const err = new Error('Không tìm thấy minh chứng đã tải lên của tài khoản này');
        err.status = 400; throw err;
      }
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

// Cancel a pending request. Only the owner (or ADMIN/HR) can cancel.
app.post(
  ['/api/v1/leave-requests/:id/cancel', '/api/leaves/:id/cancel', '/api/leave/:id/cancel'],
  requireAuth(),
  async (req, res, next) => {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [req.params.id]
      );
      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({ success: false, error: 'Không tìm thấy đơn nghỉ phép' });
      }
      const leave = rows[0];
      const requester = getEmpIdFromUser(req.user);
      if (leave.emp_id !== requester && !['ADMIN', 'HR'].includes(req.user.role)) {
        await connection.rollback();
        return res.status(403).json({ success: false, error: 'Không được hủy đơn của nhân viên khác' });
      }
      if (leave.status !== 'PENDING') {
        await connection.rollback();
        return res.status(409).json({ success: false, error: 'Chỉ có thể hủy đơn đang chờ duyệt' });
      }

      await connection.query(
        "UPDATE leave_requests SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING'",
        [leave.id]
      );
      const year = Number(String(leave.start_date).slice(0, 4));
      await connection.query(
        `UPDATE leave_balances
         SET pending_days = GREATEST(0, pending_days - ?)
         WHERE emp_id = ? AND leave_type_id = ? AND year = ?`,
        [leave.total_days, leave.emp_id, leave.leave_type_id, year]
      );
      await connection.commit();
      connection.release();
      connection = null;
      events.publish('LEAVE_REQUEST_CANCELLED', {
        requestId: leave.id, empId: leave.emp_id, totalDays: leave.total_days
      }).catch(() => {});
      res.json({ success: true, message: 'Đã hủy đơn nghỉ phép và hoàn lại phép chờ duyệt' });
    } catch (err) {
      if (connection) await connection.rollback().catch(() => {});
      next(err);
    } finally {
      if (connection) connection.release();
    }
  }
);

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