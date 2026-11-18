/**
 * services/shift-service/services/shiftService.js
 * Tầng Nghiệp vụ Quản lý Ca làm việc, Phân ca & Tăng ca (Shift & Overtime Business Logic)
 * Tuân thủ Coding Conventions:
 *  - camelCase cho biến, hàm và đối tượng trả về
 *  - Phân quyền & cô lập dữ liệu chuẩn SOA HTQLNS
 *  - Định dạng hiển thị ngày dd/MM/yyyy, giờ HH:mm:ss 24h
 */

const shiftRepository = require('../repositories/shiftRepository');
const events = require('../../../shared/events');
const db = require('../../../shared/db');
const { resolveEmployeeScope } = require('../../../shared/employee-scope');

const DB_NAME = process.env.SHIFT_DB_NAME || 'htqlns_shift';
const pool = db.getPool(DB_NAME);

/**
 * Helper định dạng ngày sang dd/MM/yyyy
 */
function formatDateVN(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    // Nếu là chuỗi yyyy-MM-dd
    const parts = String(dateInput).split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return dateInput;
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Helper định dạng giờ sang HH:mm:ss 24h
 */
function formatTime24(timeInput) {
  if (!timeInput) return null;
  const parts = String(timeInput).split(':');
  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const ss = parts[2] ? parts[2].slice(0, 2).padStart(2, '0') : '00';
    return `${hh}:${mm}:${ss}`;
  }
  return timeInput;
}

const dayNamesVi = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

class ShiftService {
  /**
   * 1. Lấy lịch phân ca cá nhân 7 ngày tới (hoặc theo tuần/tháng) cho Nhân viên
   * Có cô lập dữ liệu cá nhân theo x-user-id
   */
  async getMySchedule(req) {
    const scope = await resolveEmployeeScope(req, { pool });
    if (scope.isEmployee && scope.isUnassigned) {
      return {
        schedule: [],
        meta: { total: 0, unassigned: true, message: 'Nhân viên chưa thuộc phòng ban' }
      };
    }

    const empId = scope.empId;
    const now = new Date();
    const queryFromDate = req.query.fromDate;
    const queryToDate = req.query.toDate;

    let fromDate = queryFromDate;
    let toDate = queryToDate;

    // Nếu không truyền khoảng ngày: Mặc định lấy 7 ngày (từ hôm nay đến 6 ngày tới)
    if (!fromDate) {
      fromDate = now.toISOString().split('T')[0];
    }
    if (!toDate) {
      const endD = new Date(now);
      endD.setDate(now.getDate() + 7);
      toDate = endD.toISOString().split('T')[0];
    }

    const assignments = await shiftRepository.getShiftAssignments({
      empId,
      fromDate,
      toDate
    });

    // Chuẩn hóa định dạng hiển thị cho từng ngày
    const formatted = assignments.map(a => {
      const d = new Date(a.work_date);
      const dayName = !isNaN(d.getTime()) ? dayNamesVi[d.getDay()] : 'Ngày làm việc';
      return {
        id: a.id,
        empId: a.emp_id,
        empName: a.emp_name,
        empCode: a.emp_code,
        departmentName: a.department_name,
        shiftId: a.shift_id,
        shiftCode: a.shift_code,
        shiftName: a.shift_name,
        workDate: a.work_date,
        workDateFormatted: formatDateVN(a.work_date),
        dayOfWeek: dayName,
        startTime: formatTime24(a.start_time),
        endTime: formatTime24(a.end_time),
        workingHours: Number(a.working_hours),
        status: a.status,
        isWorkingDay: a.status === 'SCHEDULED',
        note: a.note || ''
      };
    });

    return {
      schedule: formatted,
      meta: {
        total: formatted.length,
        fromDate,
        toDate,
        empId
      }
    };
  }

  /**
   * 2. Lấy danh sách phân ca làm việc (theo quyền hạn & phạm vi phòng ban)
   */
  async getShiftAssignments(req) {
    const scope = await resolveEmployeeScope(req, { pool });
    if (scope.isEmployee && scope.isUnassigned) {
      return { assignments: [], meta: { total: 0, unassigned: true } };
    }

    const { empId, fromDate, toDate } = req.query;
    let allowedEmpIds = null;
    let managerId = null;

    if (scope.isEmployee) {
      allowedEmpIds = [scope.empId];
    } else if (scope.isManager) {
      managerId = scope.empId;
      if (Array.isArray(scope.allowedEmpIds)) {
        allowedEmpIds = scope.allowedEmpIds;
      }
    } else if (empId) {
      allowedEmpIds = [empId];
    }

    const rows = await shiftRepository.getShiftAssignments({
      empId: allowedEmpIds ? null : empId,
      allowedEmpIds,
      managerId,
      fromDate,
      toDate
    });

    const data = rows.map(r => ({
      id: r.id,
      empId: r.emp_id,
      emp_id: r.emp_id,
      empCode: r.emp_code,
      emp_code: r.emp_code,
      empName: r.emp_name,
      emp_name: r.emp_name,
      departmentName: r.department_name,
      department_name: r.department_name,
      shiftId: r.shift_id,
      shift_id: r.shift_id,
      shiftCode: r.shift_code,
      shift_code: r.shift_code,
      shiftName: r.shift_name,
      shift_name: r.shift_name,
      workDate: r.work_date,
      work_date: r.work_date,
      workDateFormatted: formatDateVN(r.work_date),
      startTime: formatTime24(r.start_time),
      start_time: r.start_time,
      endTime: formatTime24(r.end_time),
      end_time: r.end_time,
      workingHours: Number(r.working_hours),
      working_hours: r.working_hours,
      status: r.status,
      note: r.note || ''
    }));

    return { assignments: data, meta: { total: data.length } };
  }

  /**
   * 3. Phân ca cho nhân sự (ADMIN, HR, MANAGER)
   */
  async createShiftAssignments(req) {
    const scope = await resolveEmployeeScope(req, { pool });
    if (scope.isEmployee) {
      const err = new Error('Nhân viên không có quyền phân ca làm việc');
      err.statusCode = 403;
      throw err;
    }

    const { empIds, shiftId, workDates, clearUnselectedDates, startTime, endTime, note } = req.body;
    if (!Array.isArray(empIds) || !empIds.length || !shiftId || !Array.isArray(workDates) || !workDates.length) {
      const err = new Error('Yêu cầu danh sách empIds, shiftId và danh sách workDates');
      err.statusCode = 400;
      throw err;
    }

    if (scope.isManager && Array.isArray(scope.allowedEmpIds)) {
      const unauthorized = empIds.some(id => !scope.allowedEmpIds.includes(id));
      if (unauthorized) {
        const err = new Error('Quản lý chỉ được phân ca cho nhân sự thuộc phạm vi quản lý');
        err.statusCode = 403;
        throw err;
      }
    }

    const assignedBy = req.user?.empId || req.user?.emp_id || req.user?.id || null;
    const count = await shiftRepository.createShiftAssignments({
      empIds,
      shiftId,
      workDates,
      clearUnselectedDates,
      startTime,
      endTime,
      note,
      assignedBy
    });

    return {
      count,
      message: `Đã phân ca thành công cho ${count} lượt ngày công`
    };
  }

  /**
   * 4. Hủy phân ca
   */
  async cancelShiftAssignment(id, req = null) {
    if (req) {
      const scope = await resolveEmployeeScope(req, { pool });
      if (scope.isEmployee) {
        const err = new Error('Nhân viên không có quyền hủy phân ca');
        err.statusCode = 403;
        throw err;
      }
    }
    const success = await shiftRepository.cancelShiftAssignment(id);
    if (!success) {
      const err = new Error('Không tìm thấy lịch phân ca cần hủy');
      err.statusCode = 404;
      throw err;
    }
    return { success: true, message: 'Đã hủy phân ca thành công' };
  }

  /**
   * 5. Danh mục Ca làm việc (Shifts)
   */
  _formatShift(s) {
    if (!s) return null;
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      startTime: formatTime24(s.start_time || s.startTime),
      start_time: s.start_time || s.startTime,
      endTime: formatTime24(s.end_time || s.endTime),
      end_time: s.end_time || s.endTime,
      breakMinutes: s.break_minutes ?? s.breakMinutes,
      break_minutes: s.break_minutes ?? s.breakMinutes,
      graceLateMinutes: s.grace_late_minutes ?? s.graceLateMinutes,
      grace_late_minutes: s.grace_late_minutes ?? s.graceLateMinutes,
      graceEarlyMinutes: s.grace_early_minutes ?? s.graceEarlyMinutes,
      grace_early_minutes: s.grace_early_minutes ?? s.graceEarlyMinutes,
      workingHours: Number(s.working_hours ?? s.workingHours),
      working_hours: s.working_hours ?? s.workingHours,
      otMultiplierWeekday: Number(s.ot_multiplier_weekday || 1.5),
      otMultiplierWeekend: Number(s.ot_multiplier_weekend || 2.0),
      otMultiplierHoliday: Number(s.ot_multiplier_holiday || 3.0),
      minStaff: Number(s.min_staff ?? s.minStaff ?? 1),
      min_staff: Number(s.min_staff ?? s.minStaff ?? 1),
      maxStaff: (s.max_staff !== null && s.max_staff !== undefined) ? Number(s.max_staff) : ((s.maxStaff !== null && s.maxStaff !== undefined) ? Number(s.maxStaff) : null),
      max_staff: (s.max_staff !== null && s.max_staff !== undefined) ? Number(s.max_staff) : ((s.maxStaff !== null && s.maxStaff !== undefined) ? Number(s.maxStaff) : null),
      status: s.status
    };
  }

  async getAllShifts(status = null) {
    const rows = await shiftRepository.getAllShifts(status);
    return rows.map(s => this._formatShift(s));
  }

  async getShiftById(id) {
    const s = await shiftRepository.getShiftById(id);
    if (!s) {
      const err = new Error('Không tìm thấy ca làm việc');
      err.statusCode = 404;
      throw err;
    }
    return this._formatShift(s);
  }

  async createShift(data) {
    if (!data.code || !data.name || (!data.startTime && !data.start_time) || (!data.endTime && !data.end_time)) {
      const err = new Error('Thiếu thông tin bắt buộc: code, name, startTime, endTime');
      err.statusCode = 400;
      throw err;
    }
    const created = await shiftRepository.createShift(data);
    return this._formatShift(created);
  }

  async updateShift(id, data) {
    const updated = await shiftRepository.updateShift(id, data);
    if (!updated) {
      const err = new Error('Không tìm thấy ca làm việc');
      err.statusCode = 404;
      throw err;
    }
    return this._formatShift(updated);
  }

  async deleteShift(id) {
    const deleted = await shiftRepository.deleteShift(id);
    if (!deleted) {
      const err = new Error('Không tìm thấy ca làm việc');
      err.statusCode = 404;
      throw err;
    }
    return { success: true, message: 'Đã ngưng sử dụng ca làm việc thành công' };
  }

  /**
   * 6. Quản lý Đơn Tăng Ca OT (Overtime Requests)
   */
  async getOtRequests(req) {
    const scope = await resolveEmployeeScope(req);
    if (scope.isEmployee && scope.isUnassigned) {
      return { requests: [], meta: { total: 0, unassigned: true } };
    }

    const { status, empId, fromDate, toDate } = req.query;
    let allowedEmpIds = null;
    let managerId = null;

    if (scope.isEmployee) {
      allowedEmpIds = [scope.empId];
    } else if (scope.isManager) {
      managerId = scope.empId;
      if (Array.isArray(scope.allowedEmpIds)) {
        allowedEmpIds = scope.allowedEmpIds;
      }
    } else if (empId) {
      allowedEmpIds = [empId];
    }

    const rows = await shiftRepository.getOtRequests({
      empId: allowedEmpIds ? null : empId,
      allowedEmpIds,
      managerId,
      status,
      fromDate,
      toDate
    });

    const requests = rows.map(r => ({
      id: r.id,
      empId: r.emp_id,
      emp_id: r.emp_id,
      empCode: r.emp_code,
      emp_code: r.emp_code,
      empName: r.emp_name,
      emp_name: r.emp_name,
      departmentName: r.department_name,
      department_name: r.department_name,
      workDate: r.work_date,
      work_date: r.work_date,
      workDateFormatted: formatDateVN(r.work_date),
      startTime: formatTime24(r.start_time),
      start_time: r.start_time,
      endTime: formatTime24(r.end_time),
      end_time: r.end_time,
      totalHours: Number(r.total_hours),
      total_hours: r.total_hours,
      otType: r.ot_type,
      ot_type: r.ot_type,
      reason: r.reason,
      status: r.status,
      approverId: r.approver_id,
      approver_id: r.approver_id,
      approverName: r.approver_name,
      approver_name: r.approver_name,
      approvedAt: r.approved_at,
      approved_at: r.approved_at,
      rejectReason: r.reject_reason,
      reject_reason: r.reject_reason,
      createdAt: r.created_at,
      created_at: r.created_at
    }));

    return { requests, meta: { total: requests.length } };
  }

  async getOtRequestById(id, user) {
    const r = await shiftRepository.getOtRequestById(id);
    if (!r) {
      const err = new Error('Không tìm thấy đơn đăng ký tăng ca');
      err.statusCode = 404;
      throw err;
    }

    const currentEmpId = user?.empId || user?.emp_id || user?.id;
    if (user && user.role === 'EMPLOYEE' && r.emp_id !== currentEmpId) {
      const err = new Error('Bạn không có quyền truy cập đơn của nhân viên khác');
      err.statusCode = 403;
      throw err;
    }

    return {
      id: r.id,
      empId: r.emp_id,
      emp_id: r.emp_id,
      empCode: r.emp_code,
      emp_code: r.emp_code,
      empName: r.emp_name,
      emp_name: r.emp_name,
      departmentName: r.department_name,
      department_name: r.department_name,
      workDate: r.work_date,
      work_date: r.work_date,
      workDateFormatted: formatDateVN(r.work_date),
      startTime: formatTime24(r.start_time),
      start_time: r.start_time,
      endTime: formatTime24(r.end_time),
      end_time: r.end_time,
      totalHours: Number(r.total_hours),
      total_hours: r.total_hours,
      otType: r.ot_type,
      ot_type: r.ot_type,
      reason: r.reason,
      status: r.status,
      approverId: r.approver_id,
      approver_id: r.approver_id,
      approverName: r.approver_name,
      approver_name: r.approver_name,
      approvedAt: r.approved_at,
      approved_at: r.approved_at,
      rejectReason: r.reject_reason,
      reject_reason: r.reject_reason,
      createdAt: r.created_at,
      created_at: r.created_at
    };
  }

  async createOtRequest(req) {
    const scope = await resolveEmployeeScope(req);
    if (scope.isEmployee && scope.isUnassigned) {
      const err = new Error('Tài khoản chưa thuộc phòng ban. Vui lòng tham gia phòng ban trước khi đăng ký tăng ca.');
      err.statusCode = 403;
      throw err;
    }

    const currentEmpId = scope.empId;
    const empId = req.body.empId && ['ADMIN', 'HR'].includes(req.user?.role)
      ? req.body.empId
      : currentEmpId;

    const { workDate, startTime, endTime, totalHours, otType = 'WEEKDAY', reason } = req.body;

    if (!empId || !workDate || !startTime || !endTime || !totalHours || !reason) {
      const err = new Error('Thiếu thông tin bắt buộc: workDate, startTime, endTime, totalHours, reason');
      err.statusCode = 400;
      throw err;
    }

    const hours = Number(totalHours);
    if (isNaN(hours) || hours <= 0 || hours > 16) {
      const err = new Error('Số giờ tăng ca không hợp lệ (phải từ 0.5 đến 16 giờ)');
      err.statusCode = 400;
      throw err;
    }

    const created = await shiftRepository.createOtRequest({
      empId,
      workDate,
      startTime,
      endTime,
      totalHours: hours,
      otType,
      reason: reason.trim()
    });

    // Phát sự kiện Pub/Sub
    events.publish('OT_REQUEST_CREATED', {
      requestId: created.id,
      empId,
      workDate,
      totalHours: hours
    }).catch(() => {});

    return created;
  }

  async decideOtRequest(id, decision, user, rejectReason = null) {
    const approverId = user?.empId || user?.emp_id || user?.id || null;
    const result = await shiftRepository.updateOtDecision(id, decision, approverId, rejectReason);

    if (result.error === 'NOT_FOUND') {
      const err = new Error('Không tìm thấy đơn đăng ký tăng ca');
      err.statusCode = 404;
      throw err;
    }
    if (result.error === 'ALREADY_PROCESSED') {
      const err = new Error('Đơn đã được xử lý trước đó');
      err.statusCode = 400;
      throw err;
    }

    // Bắn sự kiện sang Event Bus
    events.publish(`OT_REQUEST_${decision}`, {
      requestId: id,
      empId: result.data.emp_id,
      approverId,
      workDate: result.data.work_date,
      totalHours: result.data.total_hours
    }).catch(() => {});

    return result.data;
  }

  /**
   * 7. Internal Service APIs
   */
  async getScheduleForAttendance(empId, date) {
    return await shiftRepository.getScheduleForAttendance(empId, date);
  }

  async getOtSummaryForPayroll(month, year) {
    return await shiftRepository.getOtSummaryForPayroll(month, year);
  }
}

module.exports = new ShiftService();
