/**
 * services/shift-service/index.js
 * Microservice Quản lý Ca làm việc, Phân ca & Tăng ca OT (Cổng :3005)
 * Màn hình Figma: SCR_SHIFT_01, SCR_OT_01, SCR_OT_02, SCR_ADM_03, SCR_REQ_01
 */

const crypto = require('crypto');
const { createServiceApp, requireAuth, requireInternalKey } = require('../../shared/service-base');
const db = require('../../shared/db');
const registrar = require('../../shared/registrar');
const events = require('../../shared/events');

const SERVICE_NAME = 'shift-service';
const PORT = Number(process.env.SHIFT_SERVICE_PORT || 3005);
const DB_NAME = process.env.SHIFT_DB_NAME || 'htqlns_shift';

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

// ==============================================================================
// 1. QUẢN LÝ DANH MỤC CA LÀM VIỆC (SCR_ADM_03)
// ==============================================================================

// Lấy danh sách ca làm việc
app.get(['/api/v1/shifts', '/api/shifts', '/api/shift'], requireAuth(), async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM shifts';
    const params = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY start_time ASC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Lấy chi tiết một ca làm việc
app.get(['/api/v1/shifts/:id', '/api/shifts/:id', '/api/shift/:id'], requireAuth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM shifts WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy ca làm việc' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Tạo ca làm việc mới (ADMIN, HR)
app.post(['/api/v1/shifts', '/api/shifts', '/api/shift'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const {
      code,
      name,
      startTime,
      endTime,
      breakMinutes = 60,
      graceLateMinutes = 15,
      graceEarlyMinutes = 0,
      workingHours = 8.0
    } = req.body;

    if (!code || !name || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc: code, name, startTime, endTime'
      });
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO shifts (id, code, name, start_time, end_time, break_minutes, grace_late_minutes, grace_early_minutes, working_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code.trim().toUpperCase(), name.trim(), startTime, endTime, breakMinutes, graceLateMinutes, graceEarlyMinutes, workingHours]
    );

    const [created] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Tạo ca làm việc thành công', data: created[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Mã ca làm việc đã tồn tại' });
    }
    next(err);
  }
});

// Cập nhật ca làm việc (ADMIN, HR)
app.put(['/api/v1/shifts/:id', '/api/shifts/:id', '/api/shift/:id'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const { name, startTime, endTime, breakMinutes, graceLateMinutes, graceEarlyMinutes, workingHours, status } = req.body;
    const [existing] = await pool.query('SELECT * FROM shifts WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy ca làm việc' });
    }

    const current = existing[0];
    await pool.query(
      `UPDATE shifts
       SET name = ?, start_time = ?, end_time = ?, break_minutes = ?,
           grace_late_minutes = ?, grace_early_minutes = ?, working_hours = ?, status = ?
       WHERE id = ?`,
      [
        name ?? current.name,
        startTime ?? current.start_time,
        endTime ?? current.end_time,
        breakMinutes ?? current.break_minutes,
        graceLateMinutes ?? current.grace_late_minutes,
        graceEarlyMinutes ?? current.grace_early_minutes,
        workingHours ?? current.working_hours,
        status ?? current.status,
        req.params.id
      ]
    );

    const [updated] = await pool.query('SELECT * FROM shifts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Cập nhật ca làm việc thành công', data: updated[0] });
  } catch (err) {
    next(err);
  }
});

// Xóa hoặc vô hiệu hóa ca làm việc (ADMIN, HR)
app.delete(['/api/v1/shifts/:id', '/api/shifts/:id', '/api/shift/:id'], requireAuth(['ADMIN', 'HR']), async (req, res, next) => {
  try {
    const [existing] = await pool.query('SELECT * FROM shifts WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy ca làm việc' });
    }

    // Đánh dấu INACTIVE thay vì xóa vật lý để bảo toàn lịch sử chấm công
    await pool.query('UPDATE shifts SET status = "INACTIVE" WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã ngưng sử dụng ca làm việc thành công' });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 2. PHÂN CA & LỊCH TRỰC NHÂN VIÊN (SCR_SHIFT_01)
// ==============================================================================

// Xem lịch phân ca (theo khoảng ngày & empId)
app.get(['/api/v1/shift-assignments', '/api/shifts/assignments', '/api/shift/assignments'], requireAuth(), async (req, res, next) => {
  try {
    const { empId, fromDate, toDate } = req.query;
    const currentEmpId = getEmpIdFromUser(req.user);
    const targetEmpId = req.user.role === 'EMPLOYEE' ? currentEmpId : empId;

    const conditions = [];
    const params = [];

    if (targetEmpId) {
      conditions.push('sa.emp_id = ?');
      params.push(targetEmpId);
    }
    if (fromDate) {
      conditions.push('sa.work_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('sa.work_date <= ?');
      params.push(toDate);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT sa.*, s.code AS shift_code, s.name AS shift_name,
              s.start_time, s.end_time, s.grace_late_minutes, s.working_hours,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, sa.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name
       FROM shift_assignments sa
       JOIN shifts s ON sa.shift_id = s.id
       LEFT JOIN htqlns_organization.employees e ON sa.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       ${whereClause}
       ORDER BY sa.work_date DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Phân ca cho một hoặc nhiều nhân viên (ADMIN, HR, MANAGER)
app.post(['/api/v1/shift-assignments', '/api/shifts/assignments', '/api/shift/assignments'], requireAuth(['ADMIN', 'HR', 'MANAGER']), async (req, res, next) => {
  try {
    const { empIds, shiftId, workDates, note = null } = req.body;
    if (!Array.isArray(empIds) || !empIds.length || !shiftId || !Array.isArray(workDates) || !workDates.length) {
      return res.status(400).json({
        success: false,
        error: 'Yêu cầu danh sách empIds, shiftId và danh sách workDates'
      });
    }

    const [shifts] = await pool.query('SELECT id FROM shifts WHERE id = ? AND status = "ACTIVE"', [shiftId]);
    if (!shifts.length) {
      return res.status(404).json({ success: false, error: 'Ca làm việc không tồn tại hoặc đã ngưng hoạt động' });
    }

    const assignerId = getEmpIdFromUser(req.user);
    let affected = 0;
    for (const empId of empIds) {
      for (const workDate of workDates) {
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO shift_assignments (id, emp_id, shift_id, work_date, note, assigned_by, status)
           VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED')
           ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), note = VALUES(note), assigned_by = VALUES(assigned_by), status = 'SCHEDULED'`,
          [id, empId, shiftId, workDate, note, assignerId]
        );
        affected++;
      }
    }

    res.status(201).json({
      success: true,
      message: `Đã phân ca thành công cho ${affected} lượt ngày công`
    });
  } catch (err) {
    next(err);
  }
});

// Hủy phân ca (ADMIN, HR, MANAGER)
app.delete(['/api/v1/shift-assignments/:id', '/api/shifts/assignments/:id', '/api/shift/assignments/:id'], requireAuth(['ADMIN', 'HR', 'MANAGER']), async (req, res, next) => {
  try {
    const [existing] = await pool.query('SELECT * FROM shift_assignments WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy lịch phân ca' });
    }

    await pool.query('UPDATE shift_assignments SET status = "CANCELLED" WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã hủy phân ca thành công' });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 3. ĐĂNG KÝ & DUYỆT TĂNG CA OT (SCR_OT_01, SCR_OT_02, SCR_REQ_01)
// ==============================================================================

// Danh sách đơn tăng ca
app.get(['/api/v1/ot-requests', '/api/ot'], requireAuth(), async (req, res, next) => {
  try {
    const { status, empId, fromDate, toDate } = req.query;
    const currentEmpId = getEmpIdFromUser(req.user);
    const conditions = [];
    const params = [];

    if (req.user.role === 'EMPLOYEE') {
      conditions.push('ot.emp_id = ?');
      params.push(currentEmpId);
    } else if (empId) {
      conditions.push('ot.emp_id = ?');
      params.push(empId);
    }

    if (status) {
      conditions.push('ot.status = ?');
      params.push(status);
    }

    if (fromDate) {
      conditions.push('ot.work_date >= ?');
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push('ot.work_date <= ?');
      params.push(toDate);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT ot.*,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, ot.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name,
              COALESCE(m.full_name, '') AS approver_name
       FROM ot_requests ot
       LEFT JOIN htqlns_organization.employees e ON ot.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       LEFT JOIN htqlns_organization.employees m ON ot.approver_id = m.id
       ${whereClause}
       ORDER BY ot.created_at DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Chi tiết đơn tăng ca
app.get(['/api/v1/ot-requests/:id', '/api/ot/:id'], requireAuth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ot.*,
              COALESCE(e.full_name, 'Nhân viên') AS emp_name,
              COALESCE(e.code, ot.emp_id) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS department_name,
              COALESCE(m.full_name, '') AS approver_name
       FROM ot_requests ot
       LEFT JOIN htqlns_organization.employees e ON ot.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       LEFT JOIN htqlns_organization.employees m ON ot.approver_id = m.id
       WHERE ot.id = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn đăng ký tăng ca' });
    }

    const currentEmpId = getEmpIdFromUser(req.user);
    if (req.user.role === 'EMPLOYEE' && rows[0].emp_id !== currentEmpId) {
      return res.status(403).json({ success: false, error: 'Bạn không có quyền truy cập đơn của nhân viên khác' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Tạo đơn đăng ký OT
app.post(['/api/v1/ot-requests', '/api/ot'], requireAuth(), async (req, res, next) => {
  try {
    const currentEmpId = getEmpIdFromUser(req.user);
    const empId = req.body.empId && ['ADMIN', 'HR'].includes(req.user.role)
      ? req.body.empId
      : currentEmpId;

    const { workDate, startTime, endTime, otType = 'WEEKDAY', reason } = req.body;

    if (!empId || !workDate || !startTime || !endTime || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc: workDate, startTime, endTime, reason'
      });
    }

    // Calculate overtime duration on the server; never trust submitted totalHours.
    const parseTime = (value) => {
      const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value));
      if (!match) return null;
      const h = Number(match[1]), m = Number(match[2]), s = Number(match[3] || 0);
      return h < 24 && m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
    };
    const startSeconds = parseTime(startTime);
    const endSeconds = parseTime(endTime);
    const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(String(workDate)) &&
      !Number.isNaN(Date.parse(`${workDate}T00:00:00Z`));
    const allowedTypes = ['WEEKDAY', 'WEEKEND', 'HOLIDAY'];
    if (!dateIsValid || startSeconds === null || endSeconds === null || !allowedTypes.includes(otType)) {
      return res.status(400).json({ success: false, error: 'Ngày, giờ hoặc loại tăng ca không hợp lệ' });
    }
    const durationSeconds = (endSeconds - startSeconds + 86400) % 86400;
    const totalHours = Math.round(durationSeconds / 36) / 100;
    if (durationSeconds < 900 || durationSeconds > 12 * 3600) {
      return res.status(400).json({ success: false, error: 'Thời gian tăng ca phải từ 15 phút đến 12 giờ' });
    }
    if (req.body.totalHours != null && Math.abs(Number(req.body.totalHours) - totalHours) > 0.02) {
      return res.status(400).json({ success: false, error: 'Số giờ tăng ca không khớp với giờ bắt đầu và kết thúc' });
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ot_requests (id, emp_id, work_date, start_time, end_time, total_hours, ot_type, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [id, empId, workDate, startTime, endTime, totalHours, otType, reason.trim()]
    );

    const [created] = await pool.query('SELECT * FROM ot_requests WHERE id = ?', [id]);

    // Bắn event sang Event Bus cho notification-service
    events.publish('OT_REQUEST_CREATED', {
      requestId: id,
      empId,
      workDate,
      totalHours
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'Gửi đơn đăng ký tăng ca thành công', data: created[0] });
  } catch (err) {
    next(err);
  }
});

// Xử lý phê duyệt / từ chối đơn tăng ca (ADMIN, HR, MANAGER)
const handleOtDecision = async (req, res, next) => {
  try {
    let { decision, rejectReason = null } = req.body || {};
    // Fallback cho URL dạng /approve hoặc /reject
    if (!decision) {
      if (req.path.includes('/approve')) decision = 'APPROVED';
      else if (req.path.includes('/reject')) decision = 'REJECTED';
    }

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'decision phải là APPROVED hoặc REJECTED' });
    }

    const [rows] = await pool.query('SELECT * FROM ot_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn đăng ký tăng ca' });
    }
    if (rows[0].status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Đơn đã được xử lý trước đó' });
    }

    const approverId = getEmpIdFromUser(req.user);
    await pool.query(
      `UPDATE ot_requests
       SET status = ?, approver_id = ?, approved_at = NOW(), reject_reason = ?
       WHERE id = ?`,
      [decision, approverId, decision === 'REJECTED' ? rejectReason : null, req.params.id]
    );

    const [updated] = await pool.query('SELECT * FROM ot_requests WHERE id = ?', [req.params.id]);

    events.publish(`OT_REQUEST_${decision}`, {
      requestId: req.params.id,
      empId: rows[0].emp_id,
      approverId,
      workDate: rows[0].work_date,
      totalHours: rows[0].total_hours
    }).catch(() => {});

    res.json({
      success: true,
      message: decision === 'APPROVED' ? 'Đã phê duyệt đơn tăng ca' : 'Đã từ chối đơn tăng ca',
      data: updated[0]
    });
  } catch (err) {
    next(err);
  }
};

const otDecisionPaths = [
  '/api/v1/ot-requests/:id/decision',
  '/api/v1/ot-requests/:id/approve',
  '/api/v1/ot-requests/:id/reject',
  '/api/ot/:id/decision',
  '/api/ot/:id/approve',
  '/api/ot/:id/reject'
];
app.patch(otDecisionPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), handleOtDecision);
app.put(otDecisionPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), handleOtDecision);

// ==============================================================================
// 4. INTERNAL API CHO CÁC MICROSERVICE KHÁC (attendance-service, payroll-service)
// ==============================================================================

// Lấy ca làm việc của 1 nhân viên trong ngày (attendance-service gọi khi check-in/out)
app.get('/internal/shifts/schedule', requireInternalKey, async (req, res, next) => {
  try {
    const { empId, date } = req.query;
    if (!empId || !date) {
      return res.status(400).json({ success: false, error: 'Thiếu empId hoặc date' });
    }

    const [rows] = await pool.query(
      `SELECT sa.id AS assignment_id, sa.work_date, sa.status AS assignment_status,
              s.id AS shift_id, s.code, s.name, s.start_time, s.end_time,
              s.grace_late_minutes, s.grace_early_minutes, s.working_hours
       FROM shift_assignments sa
       JOIN shifts s ON sa.shift_id = s.id
       WHERE sa.emp_id = ? AND sa.work_date = ? AND sa.status = 'SCHEDULED'
       LIMIT 1`,
      [empId, date]
    );

    // Fallback về Ca Hành Chính (CA-HC) nếu nhân viên chưa được phân ca riêng ngày hôm đó
    if (!rows.length) {
      const [defaultShift] = await pool.query(
        `SELECT NULL AS assignment_id, ? AS work_date, 'DEFAULT' AS assignment_status,
                id AS shift_id, code, name, start_time, end_time,
                grace_late_minutes, grace_early_minutes, working_hours
         FROM shifts WHERE code = 'CA-HC' AND status = 'ACTIVE' LIMIT 1`,
        [date]
      );
      return res.json({ success: true, data: defaultShift[0] || null });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Tổng hợp giờ OT đã duyệt trong tháng (payroll-service gọi khi tính lương)
app.get('/internal/ot/summary', requireInternalKey, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const [rows] = await pool.query(
      `SELECT emp_id, ot_type, SUM(total_hours) AS total_ot_hours
       FROM ot_requests
       WHERE status = 'APPROVED' AND MONTH(work_date) = ? AND YEAR(work_date) = ?
       GROUP BY emp_id, ot_type`,
      [Number(month), Number(year)]
    );
    res.json({ success: true, data: rows });
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
    prefix: '/api/v1/shifts'
  });
});
