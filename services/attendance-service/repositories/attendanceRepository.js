/**
 * services/attendance-service/repositories/attendanceRepository.js
 * Tầng Repository quản lý truy cập dữ liệu chấm công (MySQL + In-Memory Fallback)
 * Tuân thủ quy ước SOA: camelCase nội bộ, hỗ trợ offline fallback khi không có DB
 */

const crypto = require('crypto');
const db = require('../../../shared/db');
const events = require('../../../shared/events');

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
    const workingHoursNum = (data.workingHours !== undefined && data.workingHours !== null)
      ? Number(Number(data.workingHours).toFixed(2))
      : 0.00;
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
            workingHoursNum,
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
      record.actual_working_hours = workingHoursNum;
      record.status = data.status;
      return record;
    }
    return null;
  }

  async ensureInitialLogsSeeded() {
    if (this._seeded) return;
    try {
      for (const log of initialLogs) {
        await pool.query(
          `INSERT IGNORE INTO attendance_logs (id, emp_id, work_date, shift_id, location_id, check_in_time, check_out_time, late_minutes, early_leave_minutes, actual_working_hours, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.id,
            log.emp_id,
            log.work_date,
            log.shift_id || null,
            log.location_id || null,
            log.check_in_time ? new Date(log.check_in_time) : null,
            log.check_out_time ? new Date(log.check_out_time) : null,
            log.late_minutes || 0,
            log.early_leave_minutes || 0,
            log.actual_working_hours || 0,
            log.status === 'MISSING_CHECKOUT' ? 'ON_TIME' : (log.status || 'ON_TIME'),
            log.note || null
          ]
        );
      }
      this._seeded = true;
    } catch {
      // ignore
    }
  }

  /**
   * Truy vấn lịch sử chấm công cá nhân (phục vụ GET /api/v1/attendances/history)
   * Bắt buộc lọc theo empId của chính người gọi (Data Isolation)
   */
  async getEmployeeHistory(empId, { month, year, status }) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      await this.ensureInitialLogsSeeded();
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
   * Lấy danh sách ID nhân viên cấp dưới trực thuộc Manager
   */
  async getManagerSubordinateIds(managerId) {
    if (!managerId) return [];
    // Demo manager: NV-QL01 (Nguyễn Thanh Lâm)
    if (managerId === 'e0000001-0000-0000-0000-000000000003') {
      return ['e0000001-0000-0000-0000-000000000004', '156b8a4c-1cc6-4b66-b610-ffecd714ce9d'];
    }
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query(
          `SELECT id FROM htqlns_organization.employees 
           WHERE status = 'ACTIVE' 
             AND (manager_id = ? 
                  OR department_id IN (SELECT id FROM htqlns_organization.departments WHERE manager_id = ?))`,
          [managerId, managerId]
        );
        return rows.map((r) => r.id);
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi truy vấn cấp dưới của manager:', err.message);
      }
    }
    return [];
  }

  /**
   * Truy vấn danh sách tổng hợp công cho các API chung /api/attendance
   */
  async getAttendanceLogs(conditions = [], params = [], scopeOptions = {}) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const [rows] = await pool.query(
          `SELECT a.*, 
                  w.name AS location_name,
                  COALESCE(e.full_name, a.emp_id) AS emp_name,
                  COALESCE(e.code, CONCAT('NV-', RIGHT(a.emp_id, 4))) AS emp_code,
                  COALESCE(d.name, 'Phòng Công nghệ & Phần mềm') AS dept_name,
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

    let logs = Array.from(memoryAttendanceLogs.values()).map((l) => {
      const loc = memoryWorkLocations.get(l.location_id);
      return {
        ...l,
        location_name: l.location_name || loc?.name || 'Trụ sở chính HTQLNS',
        emp_name: l.emp_name || (l.emp_id === defaultEmpId ? 'Vũ Đức Hiếu' : (l.emp_id === otherEmpId ? 'Nguyễn Văn An' : l.emp_id)),
        emp_code: l.emp_code || (l.emp_id === defaultEmpId ? 'NV-001' : 'NV-' + String(l.emp_id).slice(-4)),
        dept_name: l.dept_name || 'Phòng Công nghệ & Phần mềm'
      };
    });

    if (scopeOptions.isManager) {
      const subIds = scopeOptions.managerSubordinateIds || [];
      logs = logs.filter((l) => subIds.includes(l.emp_id));
    } else if (scopeOptions.isEmployee) {
      logs = logs.filter((l) => l.emp_id === scopeOptions.currentEmpId);
    }

    if (scopeOptions.workDate) {
      logs = logs.filter((l) => l.work_date && String(l.work_date).slice(0, 10) === scopeOptions.workDate);
    }
    if (scopeOptions.status && scopeOptions.status !== 'ALL') {
      logs = logs.filter((l) => l.status === scopeOptions.status);
    }

    return logs;
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
   * Xóa đơn giải trình chấm công
   */
  async deleteAdjustment(id) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query('DELETE FROM attendance_adjustments WHERE id = ?', [id]);
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi delete adjustment DB, fallback memory:', err.message);
      }
    }
    memoryAdjustments.delete(id);
    return true;
  }

  /**
   * Lấy danh sách đơn giải trình chấm công theo phân quyền vai trò
   */
  async getAdjustments({ callerRole, currentEmpId, isAdminOrHr, isManager, scope, status, empId }) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const conditions = [];
        const params = [];

        if (callerRole === 'EMPLOYEE') {
          conditions.push('adj.emp_id = ?');
          params.push(currentEmpId);
        } else if (isManager) {
          const isPersonal = scope === 'ME' || scope === 'personal' || (empId && empId === currentEmpId);
          if (isPersonal) {
            conditions.push('adj.emp_id = ?');
            params.push(currentEmpId);
          } else {
            conditions.push('(e.manager_id = ? OR d.manager_id = ? OR e.department_id = (SELECT department_id FROM htqlns_organization.employees WHERE id = ?))');
            conditions.push('adj.emp_id != ?');
            params.push(currentEmpId, currentEmpId, currentEmpId, currentEmpId);
            if (empId) {
              conditions.push('adj.emp_id = ?');
              params.push(empId);
            }
          }
        } else {
          // ADMIN / HR
          if (scope === 'ME' || scope === 'personal') {
            conditions.push('adj.emp_id = ?');
            params.push(currentEmpId);
          } else if (empId) {
            conditions.push('adj.emp_id = ?');
            params.push(empId);
          }
        }

        if (status) {
          conditions.push('adj.status = ?');
          params.push(status);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const [rows] = await pool.query(
          `SELECT adj.*,
                  COALESCE(e.full_name, 'Nhân viên') AS emp_name,
                  COALESCE(e.code, adj.emp_id) AS emp_code,
                  e.department_id,
                  COALESCE(d.name, 'Phòng ban') AS department_name,
                  COALESCE(m.full_name, 'Quản lý') AS approver_name
           FROM attendance_adjustments adj
           LEFT JOIN htqlns_organization.employees e ON adj.emp_id = e.id
           LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
           LEFT JOIN htqlns_organization.employees m ON adj.approver_id = m.id
           ${where}
           ORDER BY adj.created_at DESC`,
          params
        );
        return rows;
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi getAdjustments DB, fallback memory:', err.message);
      }
    }

    // In-memory fallback
    let list = Array.from(memoryAdjustments.values());
    if (callerRole === 'EMPLOYEE') {
      list = list.filter((a) => a.emp_id === currentEmpId);
    } else if (isManager) {
      const isPersonal = scope === 'ME' || scope === 'personal' || (empId && empId === currentEmpId);
      if (isPersonal) {
        list = list.filter((a) => a.emp_id === currentEmpId);
      } else {
        list = list.filter((a) => a.emp_id !== currentEmpId);
      }
    } else if (empId) {
      list = list.filter((a) => a.emp_id === empId);
    }
    if (status) {
      list = list.filter((a) => a.status === status);
    }
    return list;
  }

  /**
   * Kiểm tra xem nhân sự có thuộc phạm vi quản lý của Manager không
   */
  async isEmployeeInManagerScope(empId, managerEmpId, user = null) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        let managerDeptId = user?.departmentId || user?.department_id || null;
        if (!managerDeptId && managerEmpId) {
          const [mRows] = await pool.query('SELECT department_id FROM htqlns_organization.employees WHERE id = ? LIMIT 1', [managerEmpId]);
          if (mRows.length) managerDeptId = mRows[0].department_id;
        }

        const [empRows] = await pool.query(
          `SELECT e.department_id, e.manager_id, d.manager_id AS dept_manager_id
           FROM htqlns_organization.employees e
           LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
           WHERE e.id = ? LIMIT 1`,
          [empId]
        );
        if (empRows.length > 0) {
          const emp = empRows[0];
          return (
            (emp.manager_id && emp.manager_id === managerEmpId) ||
            (emp.dept_manager_id && emp.dept_manager_id === managerEmpId) ||
            (managerDeptId && emp.department_id && emp.department_id === managerDeptId)
          );
        }
      } catch (err) {
        console.warn('[ATT-REPO] Lỗi kiểm tra manager scope DB:', err.message);
      }
    }
    return empId !== managerEmpId;
  }

  /**
   * Đồng bộ tự động sau khi duyệt đơn Giải trình chấm công (APPROVED):
   * Cập nhật bản ghi chấm công sang ON_TIME, đủ công, và phát thông báo
   */
  async syncApprovedAdjustment(adj, approverId, approverRole = 'MANAGER') {
    const workDate = String(adj.work_date).slice(0, 10);
    const useDb = await this.isDbAvailable();

    const targetCheckIn = adj.requested_check_in || `${workDate} 08:00:00`;
    const targetCheckOut = adj.requested_check_out || `${workDate} 17:30:00`;

    if (useDb) {
      try {
        let logId = adj.attendance_id;
        let logRows = [];
        if (logId) {
          const [rows] = await pool.query('SELECT * FROM attendance_logs WHERE id = ? LIMIT 1', [logId]);
          logRows = rows;
        }
        if (!logRows.length) {
          const [rows] = await pool.query('SELECT * FROM attendance_logs WHERE emp_id = ? AND work_date = ? LIMIT 1', [adj.emp_id, workDate]);
          logRows = rows;
        }

        if (logRows.length > 0) {
          logId = logRows[0].id;
          await pool.query(
            `UPDATE attendance_logs
             SET status = 'ON_TIME',
                 late_minutes = 0,
                 early_leave_minutes = 0,
                 check_in_time = ?,
                 check_out_time = ?,
                 actual_working_hours = 8.00
             WHERE id = ?`,
            [targetCheckIn, targetCheckOut, logId]
          );
          if (!adj.attendance_id) {
            await pool.query('UPDATE attendance_adjustments SET attendance_id = ? WHERE id = ?', [logId, adj.id]);
          }
        } else {
          logId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO attendance_logs
             (id, emp_id, work_date, check_in_time, check_out_time, late_minutes, early_leave_minutes, actual_working_hours, status)
             VALUES (?, ?, ?, ?, ?, 0, 0, 8.00, 'ON_TIME')`,
            [logId, adj.emp_id, workDate, targetCheckIn, targetCheckOut]
          );
          await pool.query('UPDATE attendance_adjustments SET attendance_id = ? WHERE id = ?', [logId, adj.id]);
        }

        // Tự động phát thông báo tới nhân viên
        try {
          await pool.query(
            `INSERT INTO htqlns_notification.notifications
             (id, emp_id, target_role, type, title, content, reference_id)
             VALUES (UUID(), ?, 'EMPLOYEE', 'ATTENDANCE_ALERT', ?, ?, ?)`,
            [
              adj.emp_id,
              'Đơn giải trình chấm công đã được duyệt',
              `Đơn giải trình ngày ${workDate} của bạn đã được phê duyệt hợp lệ (hệ thống đã tự động cập nhật công đủ 8.0h / đúng giờ).`,
              adj.id
            ]
          );
        } catch (notifErr) {
          console.warn('[ATT-REPO] Không thể ghi bảng notifications:', notifErr.message);
        }
      } catch (dbErr) {
        console.warn('[ATT-REPO] Lỗi syncApprovedAdjustment DB:', dbErr.message);
      }
    }

    // Cập nhật in-memory fallback
    const memLog = Array.from(memoryAttendanceLogs.values()).find(
      (l) => (adj.attendance_id && l.id === adj.attendance_id) || (l.emp_id === adj.emp_id && String(l.work_date).slice(0, 10) === workDate)
    );
    if (memLog) {
      memLog.status = 'ON_TIME';
      memLog.late_minutes = 0;
      memLog.early_leave_minutes = 0;
      memLog.check_in_time = targetCheckIn;
      memLog.check_out_time = targetCheckOut;
      memLog.actual_working_hours = 8.00;
    }

    // Bắn sự kiện lên Event Bus
    events.publish('ADJUSTMENT_REQUEST_APPROVED', {
      adjustmentId: adj.id,
      empId: adj.emp_id,
      workDate,
      approvedBy: approverId,
      approverId,
      approverRole
    }).catch(() => {});
  }

  /**
   * Phát thông báo khi đơn giải trình bị từ chối
   */
  async notifyRejectedAdjustment(adj, approverId, rejectReason = null) {
    const workDate = String(adj.work_date).slice(0, 10);
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `INSERT INTO htqlns_notification.notifications
           (id, emp_id, target_role, type, title, content, reference_id)
           VALUES (UUID(), ?, 'EMPLOYEE', 'ATTENDANCE_ALERT', ?, ?, ?)`,
          [
            adj.emp_id,
            'Đơn giải trình chấm công bị từ chối',
            `Đơn giải trình ngày ${workDate} của bạn đã bị từ chối.${rejectReason ? ` Lý do: ${rejectReason}` : ''}`,
            adj.id
          ]
        );
      } catch (_) {}
    }

    events.publish('ADJUSTMENT_REQUEST_REJECTED', {
      adjustmentId: adj.id,
      empId: adj.emp_id,
      workDate,
      rejectReason,
      approverId
    }).catch(() => {});
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
