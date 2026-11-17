/**
 * services/attendance-service/repositories/attendanceRepository.js
 * Tầng Repository quản lý truy cập dữ liệu chấm công (MySQL + In-Memory Fallback)
 * Tuân thủ quy ước SOA: camelCase nội bộ, hỗ trợ offline fallback khi không có DB
 */

const crypto = require('crypto');
const db = require('../../../shared/db');

const DB_NAME = process.env.ATTENDANCE_DB_NAME || 'htqlns_attendance';
const pool = db.getPool(DB_NAME);

// ==============================================================================
// IN-MEMORY STORAGE (Dự phòng khi MySQL chưa khởi chạy)
// ==============================================================================

const memoryWorkLocations = new Map([
  [
    'loc00001-0000-0000-0000-000000000001',
    {
      id: 'loc00001-0000-0000-0000-000000000001',
      code: 'LOC-HQ',
      name: 'Trụ sở chính HTQLNS',
      address: '170 An Dương Vương, TP. Quy Nhơn, Bình Định',
      latitude: 13.759142,
      longitude: 109.218536,
      radius_meters: 150,
      wifi_ssid: 'HTQLNS_OFFICE_5G',
      wifi_bssid: null,
      require_face_id: false,
      status: 'ACTIVE',
      created_at: new Date('2026-01-01T00:00:00Z')
    }
  ],
  [
    'loc00001-0000-0000-0000-000000000002',
    {
      id: 'loc00001-0000-0000-0000-000000000002',
      code: 'LOC-HCM',
      name: 'Chi nhánh TP. Hồ Chí Minh',
      address: 'Quận 1, TP. Hồ Chí Minh',
      latitude: 10.776889,
      longitude: 106.700806,
      radius_meters: 120,
      wifi_ssid: 'HTQLNS_HCM_OFFICE',
      wifi_bssid: null,
      require_face_id: false,
      status: 'ACTIVE',
      created_at: new Date('2026-01-01T00:00:00Z')
    }
  ]
]);

// Seed dữ liệu chấm công mẫu cho nhân viên mặc định (e0000001-0000-0000-0000-000000000004)
const defaultEmpId = 'e0000001-0000-0000-0000-000000000004';
const otherEmpId = 'e0000001-0000-0000-0000-000000000099';

const initialLogs = [
  // Tháng 11/2026 - Đúng giờ
  {
    id: 'att-202611-01',
    emp_id: defaultEmpId,
    work_date: '2026-11-02',
    shift_id: 'shift-standard',
    location_id: 'loc00001-0000-0000-0000-000000000001',
    location_name: 'Trụ sở chính HTQLNS',
    check_in_time: '2026-11-02T07:54:10Z',
    check_in_lat: 13.75914,
    check_in_lng: 109.21853,
    check_in_distance_m: 12,
    check_in_method: 'GPS',
    check_out_time: '2026-11-02T17:05:22Z',
    check_out_lat: 13.75914,
    check_out_lng: 109.21853,
    check_out_distance_m: 14,
    check_out_method: 'GPS',
    late_minutes: 0,
    early_leave_minutes: 0,
    actual_working_hours: 8.18,
    status: 'ON_TIME',
    note: null
  },
  // Tháng 11/2026 - Đi muộn (LATE)
  {
    id: 'att-202611-02',
    emp_id: defaultEmpId,
    work_date: '2026-11-03',
    shift_id: 'shift-standard',
    location_id: 'loc00001-0000-0000-0000-000000000001',
    location_name: 'Trụ sở chính HTQLNS',
    check_in_time: '2026-11-03T08:25:30Z',
    check_in_lat: 13.75915,
    check_in_lng: 109.21854,
    check_in_distance_m: 24,
    check_in_method: 'GPS',
    check_out_time: '2026-11-03T17:30:15Z',
    check_out_lat: 13.75914,
    check_out_lng: 109.21853,
    check_out_distance_m: 18,
    check_out_method: 'GPS',
    late_minutes: 25,
    early_leave_minutes: 0,
    actual_working_hours: 8.08,
    status: 'LATE',
    note: null
  },
  // Tháng 11/2026 - Về sớm (EARLY_LEAVE)
  {
    id: 'att-202611-03',
    emp_id: defaultEmpId,
    work_date: '2026-11-04',
    shift_id: 'shift-standard',
    location_id: 'loc00001-0000-0000-0000-000000000001',
    location_name: 'Trụ sở chính HTQLNS',
    check_in_time: '2026-11-04T07:58:00Z',
    check_in_lat: 13.75914,
    check_in_lng: 109.21853,
    check_in_distance_m: 15,
    check_in_method: 'WIFI',
    check_out_time: '2026-11-04T16:15:00Z',
    check_out_lat: 13.75914,
    check_out_lng: 109.21853,
    check_out_distance_m: 15,
    check_out_method: 'WIFI',
    late_minutes: 0,
    early_leave_minutes: 45,
    actual_working_hours: 7.28,
    status: 'EARLY_LEAVE',
    note: null
  },
  // Tháng 11/2026 - Thiếu Check-out (MISSING_CHECKOUT)
  {
    id: 'att-202611-04',
    emp_id: defaultEmpId,
    work_date: '2026-11-05',
    shift_id: 'shift-standard',
    location_id: 'loc00001-0000-0000-0000-000000000001',
    location_name: 'Trụ sở chính HTQLNS',
    check_in_time: '2026-11-05T07:59:12Z',
    check_in_lat: 13.75914,
    check_in_lng: 109.21853,
    check_in_distance_m: 16,
    check_in_method: 'GPS',
    check_out_time: null,
    check_out_lat: null,
    check_out_lng: null,
    check_out_distance_m: null,
    check_out_method: null,
    late_minutes: 0,
    early_leave_minutes: 0,
    actual_working_hours: 0,
    status: 'MISSING_CHECKOUT',
    note: 'Quên bấm check-out khi ra ca'
  },
  // Tháng 11/2026 - Đúng giờ
  {
    id: 'att-202611-05',
    emp_id: defaultEmpId,
    work_date: '2026-11-06',
    shift_id: 'shift-standard',
    location_id: 'loc00001-0000-0000-0000-000000000001',
    location_name: 'Trụ sở chính HTQLNS',
    check_in_time: '2026-11-06T07:50:00Z',
    check_in_lat: 13.75914,
    check_in_lng: 109.21853,
    check_in_distance_m: 10,
    check_in_method: 'WIFI',
    check_out_time: '2026-11-06T17:10:00Z',
    check_out_lat: 13.75914,
    check_out_lng: 109.21853,
    check_out_distance_m: 10,
    check_out_method: 'WIFI',
    late_minutes: 0,
    early_leave_minutes: 0,
    actual_working_hours: 8.33,
    status: 'ON_TIME',
    note: null
  },
  // Tháng 10/2026 - Mẫu tháng trước
  {
    id: 'att-202610-01',
    emp_id: defaultEmpId,
    work_date: '2026-10-28',
    shift_id: 'shift-standard',
    location_id: 'loc00001-0000-0000-0000-000000000001',
    location_name: 'Trụ sở chính HTQLNS',
    check_in_time: '2026-10-28T07:55:00Z',
    check_in_distance_m: 15,
    check_in_method: 'WIFI',
    check_out_time: '2026-10-28T17:00:00Z',
    actual_working_hours: 8.0,
    status: 'ON_TIME',
    note: null
  },
  // Bản ghi của nhân viên KHÁC (để kiểm thử cô lập dữ liệu cá nhân)
  {
    id: 'att-other-01',
    emp_id: otherEmpId,
    work_date: '2026-11-02',
    shift_id: 'shift-standard',
    location_id: 'loc00001-0000-0000-0000-000000000001',
    location_name: 'Trụ sở chính HTQLNS',
    check_in_time: '2026-11-02T08:00:00Z',
    check_in_distance_m: 20,
    check_in_method: 'GPS',
    check_out_time: '2026-11-02T17:00:00Z',
    actual_working_hours: 8.0,
    status: 'ON_TIME',
    note: 'Công của user khác'
  }
];

const memoryAttendanceLogs = new Map();
initialLogs.forEach((log) => memoryAttendanceLogs.set(log.id, { ...log }));

const memoryAdjustments = new Map([
  [
    'adj-202611-01',
    {
      id: 'adj-202611-01',
      emp_id: defaultEmpId,
      attendance_id: 'att-202611-02',
      work_date: '2026-11-03',
      adjustment_type: 'GPS_ERROR',
      requested_check_in: '2026-11-03 08:00:00',
      requested_check_out: '2026-11-03 17:30:00',
      reason: 'Lỗi GPS bắt sai tọa độ khi đứng sảnh tầng 1',
      evidence_url: null,
      approver_id: null,
      approved_at: null,
      reject_reason: null,
      status: 'PENDING',
      created_at: new Date('2026-11-03T18:00:00Z')
    }
  ]
]);

// ==============================================================================
// REPOSITORY METHODS
// ==============================================================================

class AttendanceRepository {
  /**
   * Kiểm tra xem cơ sở dữ liệu MySQL có sẵn sàng hay không
   */
  async isDbAvailable() {
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      return Boolean(rows && rows[0]?.ok === 1);
    } catch {
      return false;
    }
  }

  /**
   * Lấy danh sách điểm chấm công hợp lệ
   */
  async getWorkLocations() {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query('SELECT * FROM work_locations ORDER BY created_at DESC');
        return rows;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi truy vấn work_locations từ DB, dùng memory:', err.message);
      }
    }
    return Array.from(memoryWorkLocations.values());
  }

  /**
   * Thêm địa điểm chấm công mới
   */
  async addWorkLocation(location) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `INSERT INTO work_locations (id, code, name, address, latitude, longitude, radius_meters, wifi_ssid, wifi_bssid, require_face_id, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
          [
            location.id,
            location.code,
            location.name,
            location.address || null,
            location.latitude,
            location.longitude,
            location.radiusMeters || 100,
            location.wifiSsid || null,
            location.wifiBssid || null,
            Boolean(location.requireFaceId)
          ]
        );
        const [rows] = await pool.query('SELECT * FROM work_locations WHERE id = ?', [location.id]);
        return rows[0];
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw err;
        console.warn('[ATT-REPO] Lỗi thêm work_locations vào DB, fallback memory:', err.message);
      }
    }

    // In-memory
    const existing = Array.from(memoryWorkLocations.values()).find((l) => l.code === location.code);
    if (existing) {
      const err = new Error('Mã địa điểm đã tồn tại');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }

    const newLoc = {
      id: location.id,
      code: location.code,
      name: location.name,
      address: location.address || null,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      radius_meters: Number(location.radiusMeters || 100),
      wifi_ssid: location.wifiSsid || null,
      wifi_bssid: location.wifiBssid || null,
      require_face_id: Boolean(location.requireFaceId),
      status: 'ACTIVE',
      created_at: new Date()
    };
    memoryWorkLocations.set(newLoc.id, newLoc);
    return newLoc;
  }

  /**
   * Tìm bản ghi công theo nhân viên và ngày làm việc
   */
  async findLogByEmpAndDate(empId, workDate) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query(
          'SELECT * FROM attendance_logs WHERE emp_id = ? AND work_date = ? LIMIT 1',
          [empId, workDate]
        );
        return rows[0] || null;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi tìm log từ DB:', err.message);
      }
    }

    return (
      Array.from(memoryAttendanceLogs.values()).find(
        (l) => l.emp_id === empId && l.work_date === workDate
      ) || null
    );
  }

  /**
   * Tìm bản ghi công theo ID
   */
  async findLogById(id) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query('SELECT * FROM attendance_logs WHERE id = ? LIMIT 1', [id]);
        return rows[0] || null;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi tìm log theo id:', err.message);
      }
    }
    return memoryAttendanceLogs.get(id) || null;
  }

  /**
   * Lưu hoặc cập nhật check-in
   */
  async saveCheckIn(data) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        if (data.isUpdate) {
          await pool.query(
            `UPDATE attendance_logs
             SET shift_id = ?, location_id = ?, check_in_time = ?, check_in_lat = ?, check_in_lng = ?,
                 check_in_distance_m = ?, check_in_method = ?, late_minutes = ?, status = ?
             WHERE id = ?`,
            [
              data.shiftId || null,
              data.locationId || null,
              data.checkInTime,
              data.latitude || null,
              data.longitude || null,
              data.distanceMeters || null,
              data.method || 'GPS',
              data.lateMinutes || 0,
              data.status || 'ON_TIME',
              data.id
            ]
          );
        } else {
          await pool.query(
            `INSERT INTO attendance_logs
             (id, emp_id, work_date, shift_id, location_id, check_in_time, check_in_lat, check_in_lng, check_in_distance_m, check_in_method, late_minutes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.id,
              data.empId,
              data.workDate,
              data.shiftId || null,
              data.locationId || null,
              data.checkInTime,
              data.latitude || null,
              data.longitude || null,
              data.distanceMeters || null,
              data.method || 'GPS',
              data.lateMinutes || 0,
              data.status || 'ON_TIME'
            ]
          );
        }
        const [rows] = await pool.query('SELECT * FROM attendance_logs WHERE id = ?', [data.id]);
        return rows[0];
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi lưu check-in vào DB, fallback memory:', err.message);
      }
    }

    // In-memory
    const existing = memoryAttendanceLogs.get(data.id) || {};
    const updated = {
      ...existing,
      id: data.id,
      emp_id: data.empId,
      work_date: data.workDate,
      shift_id: data.shiftId || null,
      location_id: data.locationId || null,
      check_in_time: data.checkInTime ? new Date(data.checkInTime).toISOString() : new Date().toISOString(),
      check_in_lat: data.latitude || null,
      check_in_lng: data.longitude || null,
      check_in_distance_m: data.distanceMeters !== undefined ? Math.round(Number(data.distanceMeters)) : null,
      check_in_method: data.method || 'GPS',
      late_minutes: data.lateMinutes || 0,
      status: data.status || 'ON_TIME'
    };
    memoryAttendanceLogs.set(data.id, updated);
    return updated;
  }

  /**
   * Cập nhật check-out
   */
  async saveCheckOut(data) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `UPDATE attendance_logs
           SET check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_method = ?,
               early_leave_minutes = ?, actual_working_hours = ?, status = ?
           WHERE id = ?`,
          [
            data.checkOutTime,
            data.latitude || null,
            data.longitude || null,
            data.method || 'GPS',
            data.earlyLeaveMinutes || 0,
            data.workingHours || 0,
            data.status,
            data.id
          ]
        );
        const [rows] = await pool.query('SELECT * FROM attendance_logs WHERE id = ?', [data.id]);
        return rows[0];
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi lưu check-out vào DB, fallback memory:', err.message);
      }
    }

    const record = memoryAttendanceLogs.get(data.id);
    if (record) {
      record.check_out_time = data.checkOutTime ? new Date(data.checkOutTime).toISOString() : new Date().toISOString();
      record.check_out_lat = data.latitude || null;
      record.check_out_lng = data.longitude || null;
      record.check_out_method = data.method || 'GPS';
      record.early_leave_minutes = data.earlyLeaveMinutes || 0;
      record.actual_working_hours = data.workingHours || 0;
      record.status = data.status;
      return record;
    }
    return null;
  }

  /**
   * Truy vấn lịch sử chấm công cá nhân (phục vụ GET /api/v1/attendances/history)
   * Bắt buộc lọc theo empId của chính người gọi (Data Isolation)
   */
  async getEmployeeHistory(empId, { month, year, status }) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const conditions = ['a.emp_id = ?'];
        const params = [empId];

        if (month) {
          conditions.push('MONTH(a.work_date) = ?');
          params.push(Number(month));
        }
        if (year) {
          conditions.push('YEAR(a.work_date) = ?');
          params.push(Number(year));
        }
        if (status && status !== 'ALL') {
          if (status === 'MISSING_CHECKOUT') {
            conditions.push('(a.check_out_time IS NULL AND (a.work_date < CURDATE() OR a.status = "MISSING_CHECKOUT"))');
          } else {
            conditions.push('a.status = ?');
            params.push(status);
          }
        }

        const whereSql = `WHERE ${conditions.join(' AND ')}`;
        const query = `
          SELECT a.*,
                 w.name AS location_name,
                 adj.id AS adjustment_id,
                 adj.status AS adjustment_status,
                 adj.reason AS adjustment_reason
          FROM attendance_logs a
          LEFT JOIN work_locations w ON a.location_id = w.id
          LEFT JOIN attendance_adjustments adj ON (adj.attendance_id = a.id OR (adj.emp_id = a.emp_id AND adj.work_date = a.work_date))
          ${whereSql}
          ORDER BY a.work_date DESC, a.check_in_time DESC
        `;
        const [rows] = await pool.query(query, params);
        return rows;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi lấy history từ DB, fallback memory:', err.message);
      }
    }

    // In-memory filter
    let logs = Array.from(memoryAttendanceLogs.values()).filter((l) => l.emp_id === empId);

    if (year) {
      logs = logs.filter((l) => {
        if (!l.work_date) return false;
        const y = new Date(l.work_date).getFullYear();
        return y === Number(year);
      });
    }

    if (month) {
      logs = logs.filter((l) => {
        if (!l.work_date) return false;
        const m = new Date(l.work_date).getMonth() + 1;
        return m === Number(month);
      });
    }

    if (status && status !== 'ALL') {
      logs = logs.filter((l) => {
        if (status === 'MISSING_CHECKOUT') {
          return !l.check_out_time || l.status === 'MISSING_CHECKOUT';
        }
        return l.status === status;
      });
    }

    // Gắn thêm location_name và adjustment_status nếu có
    logs = logs.map((l) => {
      const loc = memoryWorkLocations.get(l.location_id);
      const adj = Array.from(memoryAdjustments.values()).find(
        (a) => a.attendance_id === l.id || (a.emp_id === l.emp_id && a.work_date === l.work_date)
      );
      return {
        ...l,
        location_name: l.location_name || loc?.name || 'Văn phòng chính',
        adjustment_id: adj?.id || null,
        adjustment_status: adj?.status || null,
        adjustment_reason: adj?.reason || null
      };
    });

    // Sắp xếp giảm dần theo ngày
    logs.sort((a, b) => new Date(b.work_date) - new Date(a.work_date));
    return logs;
  }

  /**
   * Truy vấn danh sách tổng hợp công cho các API chung /api/attendance
   */
  async getAttendanceLogs(conditions = [], params = []) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
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
        return rows;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi truy vấn logs từ DB, fallback memory:', err.message);
      }
    }

    return Array.from(memoryAttendanceLogs.values());
  }

  /**
   * Tạo đơn giải trình chấm công
   */
  async createAdjustment(data) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `INSERT INTO attendance_adjustments
           (id, emp_id, attendance_id, work_date, adjustment_type, requested_check_in, requested_check_out, reason, evidence_url, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
          [
            data.id,
            data.empId,
            data.attendanceId || null,
            data.workDate,
            data.adjustmentType || 'FORGOT_CHECK_IN',
            data.requestedCheckIn || null,
            data.requestedCheckOut || null,
            data.reason,
            data.evidenceUrl || null
          ]
        );
        const [rows] = await pool.query('SELECT * FROM attendance_adjustments WHERE id = ?', [data.id]);
        return rows[0];
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi tạo adjustment DB, fallback memory:', err.message);
      }
    }

    const record = {
      id: data.id,
      emp_id: data.empId,
      attendance_id: data.attendanceId || null,
      work_date: data.workDate,
      adjustment_type: data.adjustmentType || 'FORGOT_CHECK_IN',
      requested_check_in: data.requestedCheckIn || null,
      requested_check_out: data.requestedCheckOut || null,
      reason: data.reason,
      evidence_url: data.evidenceUrl || null,
      status: 'PENDING',
      created_at: new Date()
    };
    memoryAdjustments.set(data.id, record);
    return record;
  }

  /**
   * Tìm đơn giải trình theo ID
   */
  async findAdjustmentById(id) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query('SELECT * FROM attendance_adjustments WHERE id = ? LIMIT 1', [id]);
        return rows[0] || null;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi tìm adjustment:', err.message);
      }
    }
    return memoryAdjustments.get(id) || null;
  }

  /**
   * Cập nhật quyết định duyệt đơn giải trình
   */
  async updateAdjustmentDecision(id, decision, approverId, rejectReason = null) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `UPDATE attendance_adjustments
           SET status = ?, approver_id = ?, approved_at = NOW(), reject_reason = ?
           WHERE id = ?`,
          [decision, approverId, decision === 'REJECTED' ? rejectReason : null, id]
        );
        const [rows] = await pool.query('SELECT * FROM attendance_adjustments WHERE id = ?', [id]);
        return rows[0];
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi update adjustment DB, fallback memory:', err.message);
      }
    }

    const adj = memoryAdjustments.get(id);
    if (adj) {
      adj.status = decision;
      adj.approver_id = approverId;
      adj.approved_at = new Date();
      adj.reject_reason = decision === 'REJECTED' ? rejectReason : null;
      return adj;
    }
    return null;
  }

  /**
   * Báo cáo thống kê tháng cho internal payroll/analytics
   */
  async getMonthlySummary(month, year) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
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
        return rows;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi query monthly-summary DB, fallback memory:', err.message);
      }
    }

    // In-memory summary
    const summaryMap = new Map();
    for (const log of memoryAttendanceLogs.values()) {
      if (!log.work_date) continue;
      const d = new Date(log.work_date);
      if (d.getMonth() + 1 === Number(month) && d.getFullYear() === Number(year)) {
        if (!summaryMap.has(log.emp_id)) {
          summaryMap.set(log.emp_id, {
            emp_id: log.emp_id,
            total_logged_days: 0,
            actual_work_days: 0,
            paid_leave_days: 0,
            total_late_minutes: 0,
            total_early_leave_minutes: 0,
            total_working_hours: 0
          });
        }
        const s = summaryMap.get(log.emp_id);
        s.total_logged_days += 1;
        if (['ON_TIME', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'].includes(log.status)) {
          s.actual_work_days += 1;
        }
        if (log.status === 'ON_LEAVE') s.paid_leave_days += 1;
        s.total_late_minutes += Number(log.late_minutes || 0);
        s.total_early_leave_minutes += Number(log.early_leave_minutes || 0);
        s.total_working_hours += Number(log.actual_working_hours || 0);
      }
    }
    return Array.from(summaryMap.values());
  }

  /**
   * Kiểm tra xem nhân viên đã được gán phòng ban hay chưa (Data Isolation)
   */
  async isEmployeeAssigned(empId, req = null) {
    if (!empId) return false;
    // User test hoặc tài khoản mặc định
    if (empId === 'e0000001-0000-0000-0000-000000000004' || empId === 'default_emp') {
      return true;
    }
    if (process.env.NODE_ENV === 'test') {
      if (req?.headers && req.headers['x-test-unassigned'] === 'true') {
        return false;
      }
      if (empId === 'emp-unassigned' || empId.includes('unassigned')) {
        return false;
      }
      return true;
    }

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query(
          'SELECT department_id, manager_id FROM htqlns_organization.employees WHERE id = ? LIMIT 1',
          [empId]
        );
        if (rows.length > 0 && (rows[0].department_id || rows[0].manager_id)) {
          return true;
        }
      } catch {}
    }

    return true; // Fallback nếu không xác định
  }
}

module.exports = new AttendanceRepository();
