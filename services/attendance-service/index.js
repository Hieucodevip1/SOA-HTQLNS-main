/**
 * services/attendance-service/index.js
 * Microservice Quản lý Chấm công (GPS/WiFi/FaceID) & Giải trình công (Cổng :3003)
 * Màn hình Figma: SCR_ATT_01, SCR_ATT_02, SCR_ATT_03, SCR_ATT_04, SCR_ADM_02
 */

const crypto = require('crypto');
const { createServiceApp, requireAuth, requireInternalKey } = require('../../shared/service-base');
const db = require('../../shared/db');
const registrar = require('../../shared/registrar');
const events = require('../../shared/events');
const env = require('../../shared/env');

const SERVICE_NAME = 'attendance-service';
const PORT = Number(process.env.ATTENDANCE_SERVICE_PORT || 3003);
const DB_NAME = process.env.ATTENDANCE_DB_NAME || 'htqlns_attendance';
const SHIFT_SERVICE_URL = process.env.SHIFT_SERVICE_URL || 'http://localhost:3005';

const pool = db.getPool(DB_NAME);

const app = createServiceApp(SERVICE_NAME, {
  port: PORT,
  checkHealth: async () => {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return rows && rows[0]?.ok === 1;
  }
});

// ==============================================================================
// HÀM TIỆN ÍCH: TÍNH KHOẢNG CÁCH GPS (HAVERSINE) & GỌI SHIFT-SERVICE
// ==============================================================================

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Bán kính Trái Đất (mét)
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function validCoordinates(lat, lng) {
  return lat !== undefined && lat !== null && lat !== '' && lng !== undefined && lng !== null && lng !== '' &&
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

function getEmpIdFromUser(user) {
  if (!user) return null;
  return user.empId || user.emp_id || user.userId || user.id || user.sub || user.username || null;
}

async function fetchEmployeeShift(empId, workDate) {
  try {
    const url = `${SHIFT_SERVICE_URL}/internal/shifts/schedule?empId=${encodeURIComponent(empId)}&date=${encodeURIComponent(workDate)}`;
    const resp = await fetch(url, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    const json = await resp.json();
    return json.success ? json.data : null;
  } catch (err) {
    console.warn(`[${SERVICE_NAME}] Không gọi được shift-service:`, err.message);
    return null;
  }
}

function parseTimeOnDate(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}`);
}

// ==============================================================================
// 1. CẤU HÌNH ĐỊA ĐIỂM CHẤM CÔNG GPS / WIFI (SCR_ADM_02)
// ==============================================================================


const LOCATION_PATHS = ['/api/v1/work-locations', '/api/work-locations', '/api/attendance/work-locations'];
const LOCATION_ID_PATHS = LOCATION_PATHS.map(path => path + '/:id');

function locationPayload(body, { partial = false } = {}) {
  const fields = {};
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const fail = message => { const e = new Error(message); e.status = 400; throw e; };
  if (!partial || has('code')) {
    if (typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{2,50}$/.test(body.code.trim()))
      fail('Mã địa điểm phải gồm 2–50 ký tự chữ, số, _ hoặc -');
    fields.code = body.code.trim().toUpperCase();
  }
  if (!partial || has('name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 150)
      fail('Tên địa điểm phải có độ dài 1–150 ký tự');
    fields.name = body.name.trim();
  }
  for (const [input, output, min, max] of [
    ['latitude','latitude',-90,90], ['longitude','longitude',-180,180],
    ['radiusMeters','radius_meters',10,5000]
  ]) {
    if (!partial || has(input)) {
      const value = input === 'radiusMeters' && !has(input) ? 100 : body[input];
      if (value === null || value === '' || !Number.isFinite(Number(value)) ||
          Number(value) < min || Number(value) > max ||
          (input === 'radiusMeters' && !Number.isInteger(Number(value)))) {
        fail(input + ' nằm ngoài phạm vi hợp lệ');
      }
      fields[output] = Number(value);
    }
  }
  for (const [input, output, max] of [
    ['address','address',500],['wifiSsid','wifi_ssid',100],['wifiBssid','wifi_bssid',100]
  ]) {
    if (has(input)) {
      const value = body[input];
      if (value !== null && (typeof value !== 'string' || value.length > max))
        fail(input + ' không hợp lệ');
      fields[output] = value?.trim() || null;
    }
  }
  if (has('status')) {
    if (!['ACTIVE','INACTIVE'].includes(body.status)) fail('Trạng thái phải là ACTIVE hoặc INACTIVE');
    fields.status = body.status;
  }
  if (has('requireFaceId') && body.requireFaceId !== false) {
    const e = new Error('FaceID chưa có quy trình xác minh WebAuthn an toàn');
    e.status = 422; throw e;
  }
  if (partial && !Object.keys(fields).length) fail('Không có thuộc tính địa điểm cần cập nhật');
  return fields;
}

app.get(['/api/v1/work-locations', '/api/work-locations', '/api/attendance/work-locations'], requireAuth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM work_locations ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

app.post(LOCATION_PATHS, requireAuth(['ADMIN','HR']), async (req, res, next) => {
  try {
    const data = locationPayload(req.body || {});
    const id = crypto.randomUUID();
    const columns = ['id', ...Object.keys(data)];
    await pool.query(
      `INSERT INTO work_locations (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [id, ...Object.values(data)]
    );
    const [rows] = await pool.query('SELECT * FROM work_locations WHERE id = ?', [id]);
    return res.status(201).json({ success: true, message: 'Tạo địa điểm chấm công thành công', data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Mã địa điểm đã tồn tại' });
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

app.get(LOCATION_ID_PATHS, requireAuth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM work_locations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Địa điểm không tồn tại' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

app.put(LOCATION_ID_PATHS, requireAuth(['ADMIN','HR']), async (req, res, next) => {
  try {
    const data = locationPayload(req.body || {}, { partial: true });
    const columns = Object.keys(data);
    const [update] = await pool.query(
      `UPDATE work_locations SET ${columns.map(c => c + ' = ?').join(', ')} WHERE id = ?`,
      [...Object.values(data), req.params.id]
    );
    if (!update.affectedRows) return res.status(404).json({ success: false, error: 'Địa điểm không tồn tại' });
    const [rows] = await pool.query('SELECT * FROM work_locations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Cập nhật địa điểm thành công', data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Mã địa điểm đã tồn tại' });
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

// Keep attendance history linked: DELETE means deactivate, not hard deletion.
app.delete(LOCATION_ID_PATHS, requireAuth(['ADMIN','HR']), async (req, res, next) => {
  try {
    const [updated] = await pool.query("UPDATE work_locations SET status = 'INACTIVE' WHERE id = ?", [req.params.id]);
    if (!updated.affectedRows) return res.status(404).json({ success: false, error: 'Địa điểm không tồn tại' });
    res.json({ success: true, message: 'Ngừng sử dụng địa điểm; lịch sử chấm công được giữ nguyên' });
  } catch (err) { next(err); }
});

// ==============================================================================
// 2. CHẤM CÔNG CHECK-IN / CHECK-OUT (SCR_ATT_01)
// ==============================================================================

app.post(['/api/v1/attendances/check-in', '/api/attendance/check-in'], requireAuth(), async (req, res, next) => {
  try {
    const empId = getEmpIdFromUser(req.user);
    if (!empId) {
      return res.status(400).json({ success: false, error: 'Tài khoản chưa liên kết hồ sơ nhân sự (empId)' });
    }

    const { latitude, longitude, wifiSsid, method = 'GPS' } = req.body;
    const now = new Date();
    const workDate = now.toISOString().slice(0, 10);

    // Kiểm tra đã check-in hôm nay chưa
    const [existing] = await pool.query(
      'SELECT * FROM attendance_logs WHERE emp_id = ? AND work_date = ?',
      [empId, workDate]
    );
    if (existing.length && existing[0].check_in_time) {
      return res.status(400).json({
        success: false,
        error: 'Bạn đã chấm công vào (Check-in) ngày hôm nay rồi',
        data: existing[0]
      });
    }

    // Never trust a client-supplied Wi-Fi SSID alone as proof of physical presence.
    // GPS location is required even when a client also reports a Wi-Fi SSID.
    if (!validCoordinates(latitude, longitude) || !['GPS', 'WIFI'].includes(method)) {
      return res.status(400).json({
        success: false, code: 'LOCATION_REQUIRED',
        error: 'Cần tọa độ GPS hợp lệ; tên Wi-Fi do trình duyệt gửi không đủ để xác thực'
      });
    }
    const [locations] = await pool.query('SELECT * FROM work_locations WHERE status = "ACTIVE"');
    let matchedLocation = null;
    let minDistance = null;

    for (const loc of locations) {
      if (latitude !== undefined && longitude !== undefined) {
        const dist = calculateDistanceMeters(Number(latitude), Number(longitude), Number(loc.latitude), Number(loc.longitude));
        if (minDistance === null || dist < minDistance) {
          minDistance = dist;
        }
        if (dist <= Number(loc.radius_meters)) {
          matchedLocation = loc;
          minDistance = dist;
          break;
        }
      }
    }

    if (!matchedLocation) {
      return res.status(403).json({
        success: false,
        error: `Ngoài phạm vi chấm công cho phép (cách văn phòng gần nhất ${minDistance ?? '?'}m)`,
        code: 'OUT_OF_RANGE',
        distanceMeters: minDistance
      });
    }

    // Lấy thông tin ca làm việc từ shift-service để tính đi muộn
    const shift = await fetchEmployeeShift(empId, workDate);
    let lateMinutes = 0;
    let status = 'ON_TIME';

    if (shift && shift.start_time) {
      const shiftStart = parseTimeOnDate(workDate, shift.start_time);
      const graceMs = Number(shift.grace_late_minutes || 0) * 60 * 1000;
      if (now.getTime() > shiftStart.getTime() + graceMs) {
        lateMinutes = Math.floor((now.getTime() - shiftStart.getTime()) / 60000);
        status = 'LATE';
      }
    }

    const id = existing.length ? existing[0].id : crypto.randomUUID();
    if (existing.length) {
      await pool.query(
        `UPDATE attendance_logs
         SET shift_id = ?, location_id = ?, check_in_time = ?, check_in_lat = ?, check_in_lng = ?,
             check_in_distance_m = ?, check_in_method = ?, late_minutes = ?, status = ?
         WHERE id = ?`,
        [shift?.shift_id || null, matchedLocation?.id || null, now, Number(latitude), Number(longitude), minDistance, 'GPS', lateMinutes, status, id]
      );
    } else {
      await pool.query(
        `INSERT INTO attendance_logs
         (id, emp_id, work_date, shift_id, location_id, check_in_time, check_in_lat, check_in_lng, check_in_distance_m, check_in_method, late_minutes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, empId, workDate, shift?.shift_id || null, matchedLocation?.id || null, now, Number(latitude), Number(longitude), minDistance, 'GPS', lateMinutes, status]
      );
    }

    const [saved] = await pool.query('SELECT * FROM attendance_logs WHERE id = ?', [id]);

    if (status === 'LATE') {
      events.publish('ATTENDANCE_LATE', {
        attendanceId: id,
        empId,
        workDate,
        lateMinutes
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: status === 'LATE'
        ? `Check-in thành công (Đi muộn ${lateMinutes} phút)`
        : 'Check-in đúng giờ thành công',
      data: saved[0]
    });
  } catch (err) {
    next(err);
  }
});

app.post(['/api/v1/attendances/check-out', '/api/attendance/check-out'], requireAuth(), async (req, res, next) => {
  try {
    const empId = getEmpIdFromUser(req.user);
    const { latitude, longitude, method = 'GPS' } = req.body;
    if (!validCoordinates(latitude, longitude) || !['GPS', 'WIFI'].includes(method)) {
      return res.status(400).json({ success: false, code: 'LOCATION_REQUIRED', error: 'Check-out yêu cầu tọa độ GPS hợp lệ' });
    }
    const [activeLocations] = await pool.query("SELECT * FROM work_locations WHERE status = 'ACTIVE'");
    const distances = activeLocations.map(l => ({
      id: l.id,
      meters: calculateDistanceMeters(Number(latitude), Number(longitude), Number(l.latitude), Number(l.longitude)),
      radius: Number(l.radius_meters)
    }));
    const matched = distances.find(d => d.meters <= d.radius);
    if (!matched) {
      return res.status(403).json({
        success: false, code: 'OUT_OF_RANGE',
        error: 'Check-out ngoài phạm vi GPS được cấu hình'
      });
    }
    const now = new Date();
    const workDate = now.toISOString().slice(0, 10);

    const [rows] = await pool.query(
      'SELECT * FROM attendance_logs WHERE emp_id = ? AND work_date = ?',
      [empId, workDate]
    );
    if (!rows.length || !rows[0].check_in_time) {
      return res.status(400).json({ success: false, error: 'Bạn chưa Check-in hôm nay nên không thể Check-out' });
    }

    const record = rows[0];
    if (record.check_out_time) {
      return res.status(409).json({ success: false, error: 'Đã Check-out trong ngày' });
    }
    const checkInTime = new Date(record.check_in_time);
    const workedHours = Math.max(0, Number(((now.getTime() - checkInTime.getTime()) / 3600000).toFixed(2)));

    // Kiểm tra về sớm theo ca làm việc
    const shift = await fetchEmployeeShift(empId, workDate);
    let earlyLeaveMinutes = 0;
    let status = record.status;

    if (shift && shift.end_time) {
      const shiftEnd = parseTimeOnDate(workDate, shift.end_time);
      const graceMs = Number(shift.grace_early_minutes || 0) * 60 * 1000;
      if (now.getTime() < shiftEnd.getTime() - graceMs) {
        earlyLeaveMinutes = Math.floor((shiftEnd.getTime() - now.getTime()) / 60000);
        status = record.late_minutes > 0 ? 'LATE_AND_EARLY' : 'EARLY_LEAVE';
      }
    }

    await pool.query(
      `UPDATE attendance_logs
       SET check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_distance_m = ?, check_out_method = ?,
           early_leave_minutes = ?, actual_working_hours = ?, status = ?
       WHERE id = ?`,
      [now, Number(latitude), Number(longitude), matched.meters, 'GPS', earlyLeaveMinutes, workedHours, status, record.id]
    );

    const [updated] = await pool.query('SELECT * FROM attendance_logs WHERE id = ?', [record.id]);
    res.json({
      success: true,
      message: 'Check-out thành công',
      data: updated[0]
    });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 3. LỊCH SỬ CHẤM CÔNG & ĐƠN GIẢI TRÌNH CÔNG (SCR_ATT_02, SCR_ATT_03, SCR_ATT_04)
// ==============================================================================

app.get(['/api/v1/attendances', '/api/attendance'], requireAuth(), async (req, res, next) => {
  try {
    const { empId, fromDate, toDate, status, department, dept, workDate } = req.query;
    const targetEmpId = req.user.role === 'EMPLOYEE' ? getEmpIdFromUser(req.user) : (empId || null);

    const conditions = [];
    const params = [];

    if (targetEmpId) {
      conditions.push('a.emp_id = ?');
      params.push(targetEmpId);
    }
    if (workDate) {
      conditions.push('a.work_date = ?');
      params.push(workDate);
    }
    if (fromDate) {
      conditions.push('a.work_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('a.work_date <= ?');
      params.push(toDate);
    }
    if (status && status !== 'ALL') {
      conditions.push('a.status = ?');
      params.push(status);
    }
    const filterDept = department || dept;
    if (filterDept && filterDept !== 'ALL') {
      conditions.push('(d.code = ? OR d.name LIKE ?)');
      params.push(filterDept, `%${filterDept}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT a.*, 
              w.name AS location_name,
              COALESCE(e.full_name, a.emp_id) AS emp_name,
              COALESCE(e.code, CONCAT('NV-', RIGHT(a.emp_id, 4))) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS dept_name,
              d.code AS dept_code,
              adj.id AS adjustment_id,
              adj.reason AS adjustment_reason,
              adj.status AS adjustment_status
       FROM attendance_logs a
       LEFT JOIN work_locations w ON a.location_id = w.id
       LEFT JOIN htqlns_organization.employees e ON a.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       LEFT JOIN attendance_adjustments adj ON (adj.attendance_id = a.id OR (adj.emp_id = a.emp_id AND adj.work_date = a.work_date))
       ${whereClause}
       ORDER BY a.work_date DESC, a.created_at DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Tra cứu danh sách đơn giải trình chấm công
app.get(['/api/v1/attendance-adjustments', '/api/attendance/adjustments'], requireAuth(), async (req, res, next) => {
  try {
    const isEmp = req.user.role === 'EMPLOYEE';
    const empId = getEmpIdFromUser(req.user);
    const conditions = [];
    const params = [];

    if (isEmp && empId) {
      conditions.push('adj.emp_id = ?');
      params.push(empId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT adj.*,
              COALESCE(e.full_name, adj.emp_id) AS emp_name,
              COALESCE(e.code, CONCAT('NV-', RIGHT(adj.emp_id, 4))) AS emp_code,
              COALESCE(d.name, 'Phòng Kỹ Thuật') AS dept_name
       FROM attendance_adjustments adj
       LEFT JOIN htqlns_organization.employees e ON adj.emp_id = e.id
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       ${whereClause}
       ORDER BY adj.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Gửi đơn giải trình công (SCR_ATT_03)
app.post(['/api/v1/attendance-adjustments', '/api/attendance/explanations', '/api/attendance/adjustments'], requireAuth(), async (req, res, next) => {
  try {
    const empId = getEmpIdFromUser(req.user);
    const { workDate, adjustmentType = 'FORGOT_CHECK_IN', requestedCheckIn, requestedCheckOut, reason, evidenceUrl = null } = req.body;

    if (!empId || !workDate || !reason) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin bắt buộc: workDate, reason' });
    }

    const [attRows] = await pool.query('SELECT id FROM attendance_logs WHERE emp_id = ? AND work_date = ?', [empId, workDate]);
    const attendanceId = attRows.length ? attRows[0].id : null;

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO attendance_adjustments
       (id, emp_id, attendance_id, work_date, adjustment_type, requested_check_in, requested_check_out, reason, evidence_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [id, empId, attendanceId, workDate, adjustmentType, requestedCheckIn || null, requestedCheckOut || null, reason.trim(), evidenceUrl]
    );

    const [created] = await pool.query('SELECT * FROM attendance_adjustments WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Gửi đơn giải trình công thành công', data: created[0] });
  } catch (err) {
    next(err);
  }
});

// Duyệt đơn giải trình công (SCR_ATT_04)
app.patch(['/api/v1/attendance-adjustments/:id/decision', '/api/attendance/adjustments/:id/decision', '/api/attendance/adjustments/:id/status'], requireAuth(['ADMIN', 'HR', 'MANAGER']), async (req, res, next) => {
  try {
    const { decision, rejectReason = null } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'decision phải là APPROVED hoặc REJECTED' });
    }

    const [rows] = await pool.query('SELECT * FROM attendance_adjustments WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn giải trình' });
    }
    const adj = rows[0];
    if (adj.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Đơn giải trình đã được xử lý' });
    }

    const approverId = getEmpIdFromUser(req.user);
    await pool.query(
      `UPDATE attendance_adjustments
       SET status = ?, approver_id = ?, approved_at = NOW(), reject_reason = ?
       WHERE id = ?`,
      [decision, approverId, decision === 'REJECTED' ? rejectReason : null, adj.id]
    );

    // Nếu duyệt thành công -> cập nhật lại bảng attendance_logs thành ON_TIME
    if (decision === 'APPROVED') {
      const logId = adj.attendance_id || crypto.randomUUID();
      if (adj.attendance_id) {
        await pool.query(
          `UPDATE attendance_logs
           SET check_in_time = COALESCE(?, check_in_time),
               check_out_time = COALESCE(?, check_out_time),
               late_minutes = 0, early_leave_minutes = 0, status = 'ON_TIME',
               note = CONCAT(COALESCE(note, ''), ' [Đã duyệt giải trình]')
           WHERE id = ?`,
          [adj.requested_check_in, adj.requested_check_out, adj.attendance_id]
        );
      } else {
        await pool.query(
          `INSERT INTO attendance_logs (id, emp_id, work_date, check_in_time, check_out_time, check_in_method, actual_working_hours, status, note)
           VALUES (?, ?, ?, ?, ?, 'MANUAL', 8.00, 'ON_TIME', 'Tạo từ đơn giải trình được duyệt')`,
          [logId, adj.emp_id, adj.work_date, adj.requested_check_in, adj.requested_check_out]
        );
      }
    }

    const [updated] = await pool.query('SELECT * FROM attendance_adjustments WHERE id = ?', [adj.id]);
    res.json({ success: true, message: 'Đã xử lý đơn giải trình công', data: updated[0] });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 4. INTERNAL API CHO PAYROLL & ANALYTICS SERVICE
// ==============================================================================

app.get('/internal/attendances/monthly-summary', requireInternalKey, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const [rows] = await pool.query(
      `SELECT emp_id,
              COUNT(*) AS total_logged_days,
              SUM(CASE WHEN status IN ('ON_TIME', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY') THEN 1 ELSE 0 END) AS actual_work_days,
              SUM(CASE WHEN status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS paid_leave_days,
              SUM(late_minutes) AS total_late_minutes,
              SUM(early_leave_minutes) AS total_early_leave_minutes,
              SUM(actual_working_hours) AS total_working_hours
       FROM attendance_logs
       WHERE MONTH(work_date) = ? AND YEAR(work_date) = ?
       GROUP BY emp_id`,
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
    prefix: '/api/v1/attendances'
  });
});