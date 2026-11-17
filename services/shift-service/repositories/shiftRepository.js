/**
 * services/shift-service/repositories/shiftRepository.js
 * Tầng Repository quản lý Ca làm việc, Phân ca & Tăng ca (MySQL + In-Memory Fallback)
 * Tuân thủ quy ước kiến trúc SOA HTQLNS:
 *  - Hỗ trợ Hybrid Fallback mượt mà (MySQL <-> In-Memory)
 *  - Cột snake_case, Enum IN HOA (SCHEDULED, CANCELLED, PENDING, APPROVED, REJECTED)
 */

const crypto = require('crypto');
const db = require('../../../shared/db');

const DB_NAME = process.env.SHIFT_DB_NAME || 'htqlns_shift';
const pool = db.getPool(DB_NAME);

// Dữ liệu mẫu ban đầu cho chế độ In-Memory Fallback
const defaultEmpId = 'e0000001-0000-0000-0000-000000000004'; // Vũ Đức Hiếu
const managerEmpId = 'e0000001-0000-0000-0000-000000000003'; // Thầy Lâm

const memoryShifts = new Map([
  [
    'shift00001-0000-0000-0000-000000000001',
    {
      id: 'shift00001-0000-0000-0000-000000000001',
      code: 'CA-HC',
      name: 'Ca Hành Chính',
      start_time: '08:00:00',
      end_time: '17:30:00',
      break_minutes: 60,
      grace_late_minutes: 15,
      grace_early_minutes: 0,
      working_hours: 8.0,
      ot_multiplier_weekday: 1.5,
      ot_multiplier_weekend: 2.0,
      ot_multiplier_holiday: 3.0,
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ],
  [
    'shift00001-0000-0000-0000-000000000002',
    {
      id: 'shift00001-0000-0000-0000-000000000002',
      code: 'CA-SANG',
      name: 'Ca Sáng (Kỹ thuật)',
      start_time: '06:00:00',
      end_time: '14:00:00',
      break_minutes: 30,
      grace_late_minutes: 15,
      grace_early_minutes: 0,
      working_hours: 7.5,
      ot_multiplier_weekday: 1.5,
      ot_multiplier_weekend: 2.0,
      ot_multiplier_holiday: 3.0,
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ],
  [
    'shift00001-0000-0000-0000-000000000003',
    {
      id: 'shift00001-0000-0000-0000-000000000003',
      code: 'CA-CHIEU',
      name: 'Ca Chiều (Vận hành)',
      start_time: '14:00:00',
      end_time: '22:00:00',
      break_minutes: 30,
      grace_late_minutes: 15,
      grace_early_minutes: 0,
      working_hours: 7.5,
      ot_multiplier_weekday: 1.5,
      ot_multiplier_weekend: 2.0,
      ot_multiplier_holiday: 3.0,
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ]
]);

// Seed lịch phân ca 14 ngày quanh thời điểm hiện tại cho nhân viên demo
const memoryAssignments = new Map();

function generateInitialAssignments() {
  const baseDate = new Date();
  for (let i = -7; i <= 7; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const assignId = `assign-demo-${dateStr}`;

    memoryAssignments.set(assignId, {
      id: assignId,
      emp_id: defaultEmpId,
      shift_id: 'shift00001-0000-0000-0000-000000000001',
      work_date: dateStr,
      note: isWeekend ? 'Trực ban cuối tuần (nếu có)' : 'Lịch làm việc chuẩn',
      assigned_by: managerEmpId,
      status: isWeekend ? 'CANCELLED' : 'SCHEDULED',
      created_at: new Date().toISOString()
    });
  }
}
generateInitialAssignments();

// Seed danh sách đơn tăng ca mẫu
const memoryOtRequests = new Map([
  [
    'ot000001-0000-0000-0000-000000000001',
    {
      id: 'ot000001-0000-0000-0000-000000000001',
      emp_id: defaultEmpId,
      work_date: '2026-11-10',
      start_time: '18:00:00',
      end_time: '20:30:00',
      total_hours: 2.5,
      ot_type: 'WEEKDAY',
      reason: 'Triển khai bảo trì Gateway định kỳ buổi tối',
      status: 'APPROVED',
      approver_id: managerEmpId,
      approved_at: '2026-11-10T21:00:00.000Z',
      reject_reason: null,
      created_at: '2026-11-09T10:00:00.000Z'
    }
  ],
  [
    'ot000001-0000-0000-0000-000000000002',
    {
      id: 'ot000001-0000-0000-0000-000000000002',
      emp_id: defaultEmpId,
      work_date: '2026-11-15',
      start_time: '08:30:00',
      end_time: '12:30:00',
      total_hours: 4.0,
      ot_type: 'WEEKEND',
      reason: 'Di dời hệ thống hạ tầng máy chủ sang cụm mới',
      status: 'PENDING',
      approver_id: null,
      approved_at: null,
      reject_reason: null,
      created_at: '2026-11-14T08:30:00.000Z'
    }
  ]
]);

// Danh sách nhân sự giả lập cho metadata In-memory
const mockEmployees = {
  [defaultEmpId]: {
    full_name: 'Vũ Đức Hiếu',
    code: 'NV-001',
    department_name: 'Phòng Kỹ Thuật',
    manager_id: managerEmpId
  },
  [managerEmpId]: {
    full_name: 'Nguyễn Thanh Lâm',
    code: 'NV-004',
    department_name: 'Phòng Kỹ Thuật',
    manager_id: null
  }
};

class ShiftRepository {
  /**
   * Kiểm tra khả dụng kết nối MySQL
   */
  async isDbAvailable() {
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      return Boolean(rows && rows[0]?.ok === 1);
    } catch {
      return false;
    }
  }

  // ============================================================================
  // 1. DANH MỤC CA LÀM VIỆC (SHIFTS)
  // ============================================================================

  async getAllShifts(status = null) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        let sql = 'SELECT * FROM shifts';
        const params = [];
        if (status) {
          sql += ' WHERE status = ?';
          params.push(status);
        }
        sql += ' ORDER BY start_time ASC';
        const [rows] = await pool.query(sql, params);
        return rows;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB query error, fallback to memory:', err.message);
      }
    }

    let list = Array.from(memoryShifts.values());
    if (status) {
      list = list.filter(s => s.status === status);
    }
    return list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  async getShiftById(id) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
        return rows[0] || null;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB query error, fallback to memory:', err.message);
      }
    }
    return memoryShifts.get(id) || null;
  }

  async getShiftByCode(code) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query('SELECT * FROM shifts WHERE code = ?', [code]);
        return rows[0] || null;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB query error, fallback to memory:', err.message);
      }
    }
    return Array.from(memoryShifts.values()).find(s => s.code === code) || null;
  }

  async createShift(data) {
    const id = data.id || crypto.randomUUID();
    const newShift = {
      id,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      start_time: data.startTime || data.start_time,
      end_time: data.endTime || data.end_time,
      break_minutes: Number(data.breakMinutes ?? data.break_minutes ?? 60),
      grace_late_minutes: Number(data.graceLateMinutes ?? data.grace_late_minutes ?? 15),
      grace_early_minutes: Number(data.graceEarlyMinutes ?? data.grace_early_minutes ?? 0),
      working_hours: Number(data.workingHours ?? data.working_hours ?? 8.0),
      ot_multiplier_weekday: Number(data.otMultiplierWeekday ?? data.ot_multiplier_weekday ?? 1.5),
      ot_multiplier_weekend: Number(data.otMultiplierWeekend ?? data.ot_multiplier_weekend ?? 2.0),
      ot_multiplier_holiday: Number(data.otMultiplierHoliday ?? data.ot_multiplier_holiday ?? 3.0),
      status: data.status || 'ACTIVE',
      created_at: new Date().toISOString()
    };

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `INSERT INTO shifts (id, code, name, start_time, end_time, break_minutes, grace_late_minutes, grace_early_minutes, working_hours)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newShift.id,
            newShift.code,
            newShift.name,
            newShift.start_time,
            newShift.end_time,
            newShift.break_minutes,
            newShift.grace_late_minutes,
            newShift.grace_early_minutes,
            newShift.working_hours
          ]
        );
        const [created] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
        return created[0];
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          const dupErr = new Error('Mã ca làm việc đã tồn tại');
          dupErr.statusCode = 409;
          throw dupErr;
        }
        console.warn('[SHIFT-REPO] DB insert error, fallback to memory:', err.message);
      }
    }

    if (Array.from(memoryShifts.values()).some(s => s.code === newShift.code)) {
      const dupErr = new Error('Mã ca làm việc đã tồn tại');
      dupErr.statusCode = 409;
      throw dupErr;
    }

    memoryShifts.set(id, newShift);
    return newShift;
  }

  async updateShift(id, data) {
    const existing = await this.getShiftById(id);
    if (!existing) return null;

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `UPDATE shifts
           SET name = ?, start_time = ?, end_time = ?, break_minutes = ?,
               grace_late_minutes = ?, grace_early_minutes = ?, working_hours = ?, status = ?
           WHERE id = ?`,
          [
            data.name ?? existing.name,
            data.startTime ?? data.start_time ?? existing.start_time,
            data.endTime ?? data.end_time ?? existing.end_time,
            data.breakMinutes ?? data.break_minutes ?? existing.break_minutes,
            data.graceLateMinutes ?? data.grace_late_minutes ?? existing.grace_late_minutes,
            data.graceEarlyMinutes ?? data.grace_early_minutes ?? existing.grace_early_minutes,
            data.workingHours ?? data.working_hours ?? existing.working_hours,
            data.status ?? existing.status,
            id
          ]
        );
        const [updated] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
        return updated[0];
      } catch (err) {
        console.warn('[SHIFT-REPO] DB update error, fallback to memory:', err.message);
      }
    }

    const updated = {
      ...existing,
      name: data.name ?? existing.name,
      start_time: data.startTime ?? data.start_time ?? existing.start_time,
      end_time: data.endTime ?? data.end_time ?? existing.end_time,
      break_minutes: Number(data.breakMinutes ?? data.break_minutes ?? existing.break_minutes),
      grace_late_minutes: Number(data.graceLateMinutes ?? data.grace_late_minutes ?? existing.grace_late_minutes),
      grace_early_minutes: Number(data.graceEarlyMinutes ?? data.grace_early_minutes ?? existing.grace_early_minutes),
      working_hours: Number(data.workingHours ?? data.working_hours ?? existing.working_hours),
      status: data.status ?? existing.status
    };
    memoryShifts.set(id, updated);
    return updated;
  }

  async deleteShift(id) {
    const existing = await this.getShiftById(id);
    if (!existing) return false;

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query('UPDATE shifts SET status = "INACTIVE" WHERE id = ?', [id]);
        return true;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB delete error, fallback to memory:', err.message);
      }
    }

    existing.status = 'INACTIVE';
    memoryShifts.set(id, existing);
    return true;
  }

  // ============================================================================
  // 2. PHÂN CA & LỊCH TRỰC (SHIFT ASSIGNMENTS)
  // ============================================================================

  async getShiftAssignments({ empId = null, fromDate = null, toDate = null, allowedEmpIds = null, managerId = null }) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const conditions = [];
        const params = [];

        if (Array.isArray(allowedEmpIds)) {
          if (allowedEmpIds.length === 0) return [];
          conditions.push(`sa.emp_id IN (${allowedEmpIds.map(() => '?').join(',')})`);
          params.push(...allowedEmpIds);
        } else if (empId) {
          conditions.push('sa.emp_id = ?');
          params.push(empId);
        } else if (managerId) {
          conditions.push('(e.manager_id = ? OR d.manager_id = ?)');
          params.push(managerId, managerId);
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
        return rows;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB assignments query error, fallback to memory:', err.message);
      }
    }

    // In-memory Fallback
    let list = Array.from(memoryAssignments.values());

    if (Array.isArray(allowedEmpIds)) {
      if (allowedEmpIds.length === 0) return [];
      list = list.filter(a => allowedEmpIds.includes(a.emp_id));
    } else if (empId) {
      list = list.filter(a => a.emp_id === empId);
    } else if (managerId) {
      list = list.filter(a => {
        const emp = mockEmployees[a.emp_id];
        return emp && emp.manager_id === managerId;
      });
    }

    if (fromDate) {
      list = list.filter(a => a.work_date >= fromDate);
    }
    if (toDate) {
      list = list.filter(a => a.work_date <= toDate);
    }

    return list.map(a => {
      const shift = memoryShifts.get(a.shift_id) || {};
      const emp = mockEmployees[a.emp_id] || {};
      return {
        ...a,
        shift_code: shift.code || 'CA-HC',
        shift_name: shift.name || 'Ca Hành Chính',
        start_time: shift.start_time || '08:00:00',
        end_time: shift.end_time || '17:30:00',
        grace_late_minutes: shift.grace_late_minutes || 15,
        working_hours: shift.working_hours || 8.0,
        emp_name: emp.full_name || 'Nhân viên',
        emp_code: emp.code || a.emp_id,
        department_name: emp.department_name || 'Chưa phân phòng ban'
      };
    }).sort((a, b) => b.work_date.localeCompare(a.work_date));
  }

  async createShiftAssignments({ empIds, shiftId, workDates, note = null, assignedBy = null }) {
    const shift = await this.getShiftById(shiftId);
    if (!shift || shift.status !== 'ACTIVE') {
      const err = new Error('Ca làm việc không tồn tại hoặc đã ngưng hoạt động');
      err.statusCode = 404;
      throw err;
    }

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        let count = 0;
        for (const empId of empIds) {
          for (const workDate of workDates) {
            const id = crypto.randomUUID();
            await pool.query(
              `INSERT INTO shift_assignments (id, emp_id, shift_id, work_date, note, assigned_by, status)
               VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED')
               ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), note = VALUES(note), assigned_by = VALUES(assigned_by), status = 'SCHEDULED'`,
              [id, empId, shiftId, workDate, note, assignedBy]
            );
            count++;
          }
        }
        return count;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB create assignments error, fallback to memory:', err.message);
      }
    }

    // Memory fallback
    let count = 0;
    for (const empId of empIds) {
      for (const workDate of workDates) {
        const id = crypto.randomUUID();
        // Check for existing assignment for this emp on this work_date
        const existingKey = Array.from(memoryAssignments.keys()).find(k => {
          const item = memoryAssignments.get(k);
          return item.emp_id === empId && item.work_date === workDate;
        });
        const key = existingKey || id;
        memoryAssignments.set(key, {
          id: key,
          emp_id: empId,
          shift_id: shiftId,
          work_date: workDate,
          note,
          assigned_by: assignedBy,
          status: 'SCHEDULED',
          created_at: new Date().toISOString()
        });
        count++;
      }
    }
    return count;
  }

  async cancelShiftAssignment(id) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [existing] = await pool.query('SELECT * FROM shift_assignments WHERE id = ?', [id]);
        if (!existing.length) return false;
        await pool.query('UPDATE shift_assignments SET status = "CANCELLED" WHERE id = ?', [id]);
        return true;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB cancel assignment error, fallback to memory:', err.message);
      }
    }

    const item = memoryAssignments.get(id);
    if (!item) return false;
    item.status = 'CANCELLED';
    memoryAssignments.set(id, item);
    return true;
  }

  // ============================================================================
  // 3. ĐĂNG KÝ & DUYỆT TĂNG CA (OVERTIME REQUESTS)
  // ============================================================================

  async getOtRequests({ empId = null, status = null, fromDate = null, toDate = null, allowedEmpIds = null, managerId = null }) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const conditions = [];
        const params = [];

        if (Array.isArray(allowedEmpIds)) {
          if (allowedEmpIds.length === 0) return [];
          conditions.push(`ot.emp_id IN (${allowedEmpIds.map(() => '?').join(',')})`);
          params.push(...allowedEmpIds);
        } else if (empId) {
          conditions.push('ot.emp_id = ?');
          params.push(empId);
        } else if (managerId) {
          conditions.push('(e.manager_id = ? OR d.manager_id = ?)');
          params.push(managerId, managerId);
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
        return rows;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB OT query error, fallback to memory:', err.message);
      }
    }

    // In-memory Fallback
    let list = Array.from(memoryOtRequests.values());

    if (Array.isArray(allowedEmpIds)) {
      if (allowedEmpIds.length === 0) return [];
      list = list.filter(o => allowedEmpIds.includes(o.emp_id));
    } else if (empId) {
      list = list.filter(o => o.emp_id === empId);
    } else if (managerId) {
      list = list.filter(o => {
        const emp = mockEmployees[o.emp_id];
        return emp && emp.manager_id === managerId;
      });
    }

    if (status) {
      list = list.filter(o => o.status === status);
    }
    if (fromDate) {
      list = list.filter(o => o.work_date >= fromDate);
    }
    if (toDate) {
      list = list.filter(o => o.work_date <= toDate);
    }

    return list.map(o => {
      const emp = mockEmployees[o.emp_id] || {};
      const app = mockEmployees[o.approver_id] || {};
      return {
        ...o,
        emp_name: emp.full_name || 'Nhân viên',
        emp_code: emp.code || o.emp_id,
        department_name: emp.department_name || 'Chưa phân phòng ban',
        approver_name: app.full_name || ''
      };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getOtRequestById(id) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
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
          [id]
        );
        return rows[0] || null;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB get OT by id error, fallback to memory:', err.message);
      }
    }

    const item = memoryOtRequests.get(id);
    if (!item) return null;
    const emp = mockEmployees[item.emp_id] || {};
    const app = mockEmployees[item.approver_id] || {};
    return {
      ...item,
      emp_name: emp.full_name || 'Nhân viên',
      emp_code: emp.code || item.emp_id,
      department_name: emp.department_name || 'Chưa phân phòng ban',
      approver_name: app.full_name || ''
    };
  }

  async createOtRequest(data) {
    const id = data.id || crypto.randomUUID();
    const newOt = {
      id,
      emp_id: data.empId || data.emp_id,
      work_date: data.workDate || data.work_date,
      start_time: data.startTime || data.start_time,
      end_time: data.endTime || data.end_time,
      total_hours: Number(data.totalHours ?? data.total_hours),
      ot_type: data.otType || data.ot_type || 'WEEKDAY',
      reason: (data.reason || '').trim(),
      status: 'PENDING',
      approver_id: null,
      approved_at: null,
      reject_reason: null,
      created_at: new Date().toISOString()
    };

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `INSERT INTO ot_requests (id, emp_id, work_date, start_time, end_time, total_hours, ot_type, reason, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
          [
            newOt.id,
            newOt.emp_id,
            newOt.work_date,
            newOt.start_time,
            newOt.end_time,
            newOt.total_hours,
            newOt.ot_type,
            newOt.reason
          ]
        );
        const [created] = await pool.query('SELECT * FROM ot_requests WHERE id = ?', [id]);
        return created[0];
      } catch (err) {
        console.warn('[SHIFT-REPO] DB create OT error, fallback to memory:', err.message);
      }
    }

    memoryOtRequests.set(id, newOt);
    return newOt;
  }

  async updateOtDecision(id, decision, approverId, rejectReason = null) {
    const existing = await this.getOtRequestById(id);
    if (!existing) return { error: 'NOT_FOUND' };
    if (existing.status !== 'PENDING') return { error: 'ALREADY_PROCESSED' };

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        await pool.query(
          `UPDATE ot_requests
           SET status = ?, approver_id = ?, approved_at = NOW(), reject_reason = ?
           WHERE id = ?`,
          [decision, approverId, decision === 'REJECTED' ? rejectReason : null, id]
        );
        const [updated] = await pool.query('SELECT * FROM ot_requests WHERE id = ?', [id]);
        return { success: true, data: updated[0] };
      } catch (err) {
        console.warn('[SHIFT-REPO] DB update OT decision error, fallback to memory:', err.message);
      }
    }

    const item = memoryOtRequests.get(id);
    item.status = decision;
    item.approver_id = approverId;
    item.approved_at = new Date().toISOString();
    item.reject_reason = decision === 'REJECTED' ? rejectReason : null;
    memoryOtRequests.set(id, item);
    return { success: true, data: item };
  }

  // ============================================================================
  // 4. INTERNAL QUERIES CHO ATTENDANCE & PAYROLL SERVICES
  // ============================================================================

  async getScheduleForAttendance(empId, date) {
    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
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
        if (rows.length) return rows[0];

        const [defaultShift] = await pool.query(
          `SELECT NULL AS assignment_id, ? AS work_date, 'DEFAULT' AS assignment_status,
                  id AS shift_id, code, name, start_time, end_time,
                  grace_late_minutes, grace_early_minutes, working_hours
           FROM shifts WHERE code = 'CA-HC' AND status = 'ACTIVE' LIMIT 1`,
          [date]
        );
        return defaultShift[0] || null;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB internal schedule error, fallback to memory:', err.message);
      }
    }

    // Memory fallback
    const match = Array.from(memoryAssignments.values()).find(
      a => a.emp_id === empId && a.work_date === date && a.status === 'SCHEDULED'
    );
    if (match) {
      const shift = memoryShifts.get(match.shift_id) || Array.from(memoryShifts.values())[0];
      return {
        assignment_id: match.id,
        work_date: date,
        assignment_status: 'SCHEDULED',
        shift_id: shift.id,
        code: shift.code,
        name: shift.name,
        start_time: shift.start_time,
        end_time: shift.end_time,
        grace_late_minutes: shift.grace_late_minutes,
        grace_early_minutes: shift.grace_early_minutes,
        working_hours: shift.working_hours
      };
    }

    const defaultShift = Array.from(memoryShifts.values()).find(s => s.code === 'CA-HC') || Array.from(memoryShifts.values())[0];
    return {
      assignment_id: null,
      work_date: date,
      assignment_status: 'DEFAULT',
      shift_id: defaultShift?.id || 'default-shift',
      code: defaultShift?.code || 'CA-HC',
      name: defaultShift?.name || 'Ca Hành Chính',
      start_time: defaultShift?.start_time || '08:00:00',
      end_time: defaultShift?.end_time || '17:30:00',
      grace_late_minutes: defaultShift?.grace_late_minutes || 15,
      grace_early_minutes: defaultShift?.grace_early_minutes || 0,
      working_hours: defaultShift?.working_hours || 8.0
    };
  }

  async getOtSummaryForPayroll(month, year) {
    const m = Number(month);
    const y = Number(year);

    const useDb = await this.isDbAvailable();
    if (useDb) {
      try {
        const [rows] = await pool.query(
          `SELECT emp_id, ot_type, SUM(total_hours) AS total_ot_hours
           FROM ot_requests
           WHERE status = 'APPROVED' AND MONTH(work_date) = ? AND YEAR(work_date) = ?
           GROUP BY emp_id, ot_type`,
          [m, y]
        );
        return rows;
      } catch (err) {
        console.warn('[SHIFT-REPO] DB internal ot summary error, fallback to memory:', err.message);
      }
    }

    // Memory fallback
    const summaryMap = new Map();
    for (const ot of memoryOtRequests.values()) {
      if (ot.status !== 'APPROVED') continue;
      const d = new Date(ot.work_date);
      if (d.getMonth() + 1 === m && d.getFullYear() === y) {
        const key = `${ot.emp_id}_${ot.ot_type}`;
        const current = summaryMap.get(key) || { emp_id: ot.emp_id, ot_type: ot.ot_type, total_ot_hours: 0 };
        current.total_ot_hours += Number(ot.total_hours);
        summaryMap.set(key, current);
      }
    }
    return Array.from(summaryMap.values());
  }
}

module.exports = new ShiftRepository();
