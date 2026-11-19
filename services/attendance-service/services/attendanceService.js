/**
 * services/attendance-service/services/attendanceService.js
 * Tầng Service xử lý nghiệp vụ chấm công, tính giờ làm, Geofence GPS và lịch sử chấm công
 * Tuân thủ quy ước SOA: biến/hàm/payload camelCase, xử lý cô lập dữ liệu cá nhân
 */

const crypto = require('crypto');
const repository = require('../repositories/attendanceRepository');
const events = require('../../../shared/events');
const env = require('../../../shared/env');

const SHIFT_SERVICE_URL = process.env.SHIFT_SERVICE_URL || 'http://localhost:3005';

// ==============================================================================
// ĐỊNH DẠNG NGÀY GIỜ CHUẨN DỰ ÁN
// ==============================================================================

/**
 * Định dạng ngày hiển thị dd/MM/yyyy
 * @param {string|Date} dateVal
 * @returns {string} dd/MM/yyyy
 */
function formatDateDisplay(dateVal) {
  if (!dateVal) return '';
  try {
    const dStr = typeof dateVal === 'string' ? dateVal : dateVal.toISOString();
    // Tách theo chuỗi YYYY-MM-DD
    const isoMatch = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}/${m}/${y}`;
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateVal);
  }
}

/**
 * Định dạng giờ hiển thị HH:mm:ss (24h)
 * @param {string|Date} timeVal
 * @returns {string|null} HH:mm:ss
 */
function formatTimeDisplay(timeVal) {
  if (!timeVal) return null;
  try {
    if (typeof timeVal === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(timeVal.trim())) {
      const parts = timeVal.trim().split(':');
      const h = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const s = (parts[2] || '00').padStart(2, '0');
      return `${h}:${m}:${s}`;
    }
    const d = new Date(timeVal);
    if (isNaN(d.getTime())) return null;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return null;
  }
}

/**
 * Tính khoảng cách GPS Haversine giữa 2 tọa độ (làm tròn mét nguyên)
 */
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

/**
 * Lấy empId từ user object
 */
function getEmpIdFromUser(user) {
  if (!user) return null;
  return user.empId || user.emp_id || user.userId || user.id || user.sub || user.username || null;
}

/**
 * Gọi shift-service lấy lịch ca
 */
async function fetchEmployeeShift(empId, workDate) {
  try {
    const url = `${SHIFT_SERVICE_URL}/internal/shifts/schedule?empId=${encodeURIComponent(empId)}&date=${encodeURIComponent(workDate)}`;
    const resp = await fetch(url, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    const json = await resp.json();
    return json.success ? json.data : null;
  } catch (err) {
    return null;
  }
}

// ==============================================================================
// SERVICE CLASS
// ==============================================================================

class AttendanceService {
  /**
   * Lấy danh sách điểm chấm công
   */
  async getWorkLocations() {
    return await repository.getWorkLocations();
  }

  /**
   * Thêm địa điểm chấm công
   */
  async createWorkLocation(locationData) {
    const id = crypto.randomUUID();
    return await repository.addWorkLocation({
      id,
      ...locationData
    });
  }

  /**
   * Xử lý Check-in
   */
  async processCheckIn({ user, callerRole, body, req }) {
    const empId = getEmpIdFromUser(user);
    if (!empId) {
      const err = new Error('Tài khoản chưa liên kết hồ sơ nhân sự (empId)');
      err.statusCode = 400;
      throw err;
    }

    // Kiểm tra gán phòng ban cho nhân viên (Data Isolation)
    if (callerRole === 'EMPLOYEE') {
      const isAssigned = await repository.isEmployeeAssigned(empId, req);
      if (!isAssigned) {
        const err = new Error('Tài khoản của bạn chưa thuộc phòng ban nào. Vui lòng tham gia phòng ban từ lời mời hoặc mã mời trước khi chấm công.');
        err.statusCode = 403;
        err.unassigned = true;
        throw err;
      }
    }

    const { latitude, longitude, wifiSsid, method = 'GPS', bypassGeofence = false } = body;
    const now = new Date();
    const workDate = now.toISOString().slice(0, 10);

    // Kiểm tra đã check-in chưa
    const existing = await repository.findLogByEmpAndDate(empId, workDate);
    if (existing && existing.check_in_time) {
      const err = new Error('Bạn đã chấm công vào (Check-in) ngày hôm nay rồi');
      err.statusCode = 400;
      err.data = existing;
      throw err;
    }

    // Kiểm tra Geofence hoặc WiFi
    const locations = await repository.getWorkLocations();
    let matchedLocation = null;
    let minDistance = null;

    for (const loc of locations) {
      if (method === 'WIFI' && wifiSsid && loc.wifi_ssid === wifiSsid) {
        matchedLocation = loc;
        minDistance = 0;
        break;
      }
      if (latitude !== undefined && longitude !== undefined) {
        const dist = calculateDistanceMeters(
          Number(latitude),
          Number(longitude),
          Number(loc.latitude),
          Number(loc.longitude)
        );
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

    if (!matchedLocation && !bypassGeofence) {
      const err = new Error(`Ngoài phạm vi chấm công cho phép (cách văn phòng gần nhất ${minDistance ?? '?'}m)`);
      err.statusCode = 403;
      err.code = 'OUT_OF_RANGE';
      err.distanceMeters = minDistance;
      throw err;
    }

    // Lấy ca làm việc
    const shift = await fetchEmployeeShift(empId, workDate);
    let lateMinutes = 0;
    let status = 'ON_TIME';

    if (shift && shift.start_time) {
      const shiftStart = new Date(`${workDate}T${shift.start_time}`);
      const graceMs = Number(shift.grace_late_minutes || 0) * 60 * 1000;
      if (now.getTime() > shiftStart.getTime() + graceMs) {
        lateMinutes = Math.floor((now.getTime() - shiftStart.getTime()) / 60000);
        status = 'LATE';
      }
    }

    const id = existing ? existing.id : crypto.randomUUID();
    const saved = await repository.saveCheckIn({
      id,
      empId,
      workDate,
      shiftId: shift?.shift_id || null,
      locationId: matchedLocation?.id || null,
      checkInTime: now,
      latitude,
      longitude,
      distanceMeters: minDistance !== null ? Math.round(minDistance) : null,
      method,
      lateMinutes,
      status,
      isUpdate: Boolean(existing)
    });

    if (status === 'LATE') {
      events.publish('ATTENDANCE_LATE', {
        attendanceId: id,
        empId,
        workDate,
        lateMinutes
      }).catch(() => {});
    }

    return {
      record: saved,
      lateMinutes,
      status
    };
  }

  /**
   * Xử lý Check-out
   */
  async processCheckOut({ user, body }) {
    const empId = getEmpIdFromUser(user);
    const { latitude, longitude, method = 'GPS' } = body;
    const now = new Date();
    const workDate = now.toISOString().slice(0, 10);

    const record = await repository.findLogByEmpAndDate(empId, workDate);
    if (!record || !record.check_in_time) {
      const err = new Error('Bạn chưa Check-in hôm nay nên không thể Check-out');
      err.statusCode = 400;
      throw err;
    }

    const checkInTime = new Date(record.check_in_time);
    const workedHours = Math.max(0, Number(((now.getTime() - checkInTime.getTime()) / 3600000).toFixed(2)));

    // Ca làm việc & về sớm
    const shift = await fetchEmployeeShift(empId, workDate);
    let earlyLeaveMinutes = 0;
    let status = record.status;

    if (shift && shift.end_time) {
      const shiftEnd = new Date(`${workDate}T${shift.end_time}`);
      const graceMs = Number(shift.grace_early_minutes || 0) * 60 * 1000;
      if (now.getTime() < shiftEnd.getTime() - graceMs) {
        earlyLeaveMinutes = Math.floor((shiftEnd.getTime() - now.getTime()) / 60000);
        status = record.late_minutes > 0 ? 'LATE_AND_EARLY' : 'EARLY_LEAVE';
      }
    }

    return await repository.saveCheckOut({
      id: record.id,
      checkOutTime: now,
      latitude,
      longitude,
      method,
      earlyLeaveMinutes,
      workingHours: workedHours,
      status
    });
  }

  /**
   * TRỌNG TÂM: Lịch sử chấm công của cá nhân (GET /api/v1/attendances/history)
   * Tuân thủ 100% Data Isolation:
   *  - employeeId bắt buộc lấy từ req.headers['x-user-id'] / authenticated user
   *  - Không cho phép truyền employeeId người khác
   *  - Nếu chưa có departmentId -> trả về mảng rỗng []
   *  - Tính toán workDate (dd/MM/yyyy), checkInTime (HH:mm:ss), checkOutTime, workingHours, distanceMeters, status
   */
  async getAttendanceHistory({ callerEmpId, callerRole, query, req }) {
    if (!callerEmpId) {
      const err = new Error('Yêu cầu xác thực tài khoản hợp lệ');
      err.statusCode = 401;
      throw err;
    }

    // 1. Kiểm tra tài khoản chưa có phòng ban -> trả về mảng rỗng []
    const isAssigned = await repository.isEmployeeAssigned(callerEmpId, req);
    if (!isAssigned) {
      return {
        list: [],
        meta: {
          page: 1,
          limit: Number(query.limit) || 20,
          total: 0,
          totalPages: 0,
          month: query.month ? Number(query.month) : new Date().getMonth() + 1,
          year: query.year ? Number(query.year) : new Date().getFullYear(),
          unassigned: true,
          summary: {
            totalWorkDays: 0,
            totalWorkingHours: 0,
            lateCount: 0,
            earlyLeaveCount: 0,
            missingCheckoutCount: 0,
            totalExceptions: 0
          }
        }
      };
    }

    // 2. Trích xuất bộ lọc
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const month = query.month !== undefined && query.month !== '' ? Number(query.month) : currentMonth;
    const year = query.year !== undefined && query.year !== '' ? Number(query.year) : currentYear;
    const status = query.status ? String(query.status).toUpperCase() : 'ALL';
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));

    // 3. Cô lập dữ liệu: chỉ truy vấn dữ liệu của chính callerEmpId
    const rawLogs = await repository.getEmployeeHistory(callerEmpId, { month, year, status });

    // 4. Chuẩn hóa dữ liệu theo chuẩn camelCase và định dạng dự án
    const todayStr = now.toISOString().slice(0, 10);
    const currentHour = now.getHours();

    let totalWorkingHours = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let missingCheckoutCount = 0;
    let validWorkDays = 0;

    const formattedList = rawLogs.map((log) => {
      const rawWorkDate = log.work_date
        ? (typeof log.work_date === 'string' ? log.work_date.slice(0, 10) : new Date(log.work_date).toISOString().slice(0, 10))
        : '';
      const workDateDisplay = formatDateDisplay(log.work_date);

      const checkInDisplay = formatTimeDisplay(log.check_in_time);
      const checkOutDisplay = log.check_out_time ? formatTimeDisplay(log.check_out_time) : null;

      // Tính workingHours
      let workingHours = null;
      if (log.actual_working_hours !== null && log.actual_working_hours !== undefined && Number(log.actual_working_hours) > 0) {
        workingHours = Number(Number(log.actual_working_hours).toFixed(2));
      } else if (log.check_in_time && log.check_out_time) {
        const inMs = new Date(log.check_in_time).getTime();
        const outMs = new Date(log.check_out_time).getTime();
        workingHours = Number((Math.max(0, outMs - inMs) / 3600000).toFixed(2));
      }

      // Khoảng cách GPS làm tròn mét nguyên
      const distanceMeters = log.check_in_distance_m !== null && log.check_in_distance_m !== undefined
        ? Math.round(Number(log.check_in_distance_m))
        : (log.check_in_method === 'WIFI' ? 0 : 15);

      // Xác định trạng thái nghiệp vụ (ON_TIME, LATE, EARLY_LEAVE, MISSING_CHECKOUT)
      let effectiveStatus = log.status || 'ON_TIME';

      if (!log.check_out_time && log.check_in_time) {
        // Nếu ngày đã qua hoặc hôm nay đã quá 18:00 mà chưa check-out -> MISSING_CHECKOUT
        if (rawWorkDate < todayStr || (rawWorkDate === todayStr && currentHour >= 18)) {
          effectiveStatus = 'MISSING_CHECKOUT';
        }
      }

      let statusLabel = 'Đúng giờ';
      switch (effectiveStatus) {
        case 'ON_TIME':
          statusLabel = 'Đúng giờ';
          break;
        case 'LATE':
          statusLabel = 'Đi muộn';
          lateCount += 1;
          break;
        case 'EARLY_LEAVE':
          statusLabel = 'Về sớm';
          earlyLeaveCount += 1;
          break;
        case 'LATE_AND_EARLY':
          statusLabel = 'Đi muộn & Về sớm';
          lateCount += 1;
          earlyLeaveCount += 1;
          break;
        case 'MISSING_CHECKOUT':
          statusLabel = 'Thiếu check-out';
          missingCheckoutCount += 1;
          break;
        case 'ON_LEAVE':
          statusLabel = 'Nghỉ phép';
          break;
        case 'ABSENT':
          statusLabel = 'Vắng mặt';
          break;
        default:
          statusLabel = 'Đang trong ca';
      }

      if (['ON_TIME', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY', 'MISSING_CHECKOUT'].includes(effectiveStatus)) {
        validWorkDays += 1;
      }
      if (workingHours) {
        totalWorkingHours += workingHours;
      }

      return {
        id: log.id,
        employeeId: log.emp_id,
        workDate: workDateDisplay,
        rawWorkDate,
        checkInTime: checkInDisplay,
        checkOutTime: checkOutDisplay,
        workingHours,
        distanceMeters,
        status: effectiveStatus,
        statusLabel,
        lateMinutes: Number(log.late_minutes || 0),
        earlyLeaveMinutes: Number(log.early_leave_minutes || 0),
        checkInMethod: log.check_in_method || 'GPS',
        locationName: log.location_name || 'Trụ sở chính HTQLNS',
        adjustmentId: log.adjustment_id || null,
        adjustmentStatus: log.adjustment_status || null,
        adjustmentReason: log.adjustment_reason || null
      };
    });

    // Lọc lại theo status nếu status là MISSING_CHECKOUT mà DB chưa gán nhãn
    let filteredList = formattedList;
    if (status && status !== 'ALL') {
      filteredList = formattedList.filter((item) => item.status === status);
    }

    const total = filteredList.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const pagedList = filteredList.slice(startIndex, startIndex + limit);

    return {
      list: pagedList,
      meta: {
        page,
        limit,
        total,
        totalPages,
        month,
        year,
        unassigned: false,
        summary: {
          totalWorkDays: validWorkDays,
          totalWorkingHours: Number(totalWorkingHours.toFixed(1)),
          lateCount,
          earlyLeaveCount,
          missingCheckoutCount,
          totalExceptions: lateCount + earlyLeaveCount + missingCheckoutCount
        }
      }
    };
  }

  /**
   * Lấy danh sách đơn giải trình
   */
  async getAdjustments(req) {
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const currentEmpId = getEmpIdFromUser(req.user);
    const isAdminOrHr = ['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(callerRole);
    const isManager = callerRole === 'MANAGER';
    const scope = req.query.scope;
    const status = req.query.status;
    const empId = req.query.empId;

    return await repository.getAdjustments({
      callerRole,
      currentEmpId,
      isAdminOrHr,
      isManager,
      scope,
      status,
      empId
    });
  }

  /**
   * Tạo đơn giải trình
   */
  async createAdjustment({ user, body = {} }) {
    const empId = (body.empId || body.employeeId) && ['ADMIN', 'HR'].includes(user?.role)
      ? (body.empId || body.employeeId)
      : getEmpIdFromUser(user);
    const workDate = body.workDate || body.work_date;
    const adjustmentType = body.adjustmentType || body.adjustment_type || 'FORGOT_CHECK_IN';
    const requestedCheckIn = body.requestedCheckIn || body.requested_check_in;
    const requestedCheckOut = body.requestedCheckOut || body.requested_check_out;
    const reason = body.reason;
    const evidenceUrl = body.evidenceUrl || body.evidence_url;

    if (!empId || !workDate || !reason) {
      const err = new Error('Thiếu thông tin bắt buộc: workDate, reason');
      err.statusCode = 400;
      throw err;
    }

    const existingLog = await repository.findLogByEmpAndDate(empId, workDate);
    const attendanceId = existingLog ? existingLog.id : (body.attendanceId || body.attendance_id || null);

    const id = crypto.randomUUID();
    return await repository.createAdjustment({
      id,
      empId,
      attendanceId,
      workDate,
      adjustmentType,
      requestedCheckIn,
      requestedCheckOut,
      reason: reason.trim(),
      evidenceUrl: evidenceUrl || null
    });
  }

  /**
   * Duyệt đơn giải trình
   */
  async decideAdjustment({ user, id, decision, rejectReason }) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      const err = new Error('decision phải là APPROVED hoặc REJECTED');
      err.statusCode = 400;
      throw err;
    }

    const adj = await repository.findAdjustmentById(id);
    if (!adj) {
      const err = new Error('Không tìm thấy đơn giải trình');
      err.statusCode = 404;
      throw err;
    }

    if (adj.status !== 'PENDING') {
      const err = new Error('Đơn giải trình đã được xử lý');
      err.statusCode = 400;
      throw err;
    }

    const approverId = getEmpIdFromUser(user);
    const callerRole = (user?.role || '').toUpperCase();
    const isAdminOrHr = ['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(callerRole);
    const isManager = callerRole === 'MANAGER';

    // 1. Chặn tự duyệt: Bất kỳ tài khoản nào (kể cả MANAGER và HR_ADMIN) đều không được phép tự duyệt đơn do chính mình tạo
    if (adj.emp_id === approverId || (user?.id && adj.emp_id === user.id)) {
      const err = new Error('Không được phép tự duyệt đơn do chính mình tạo');
      err.statusCode = 403;
      throw err;
    }

    // 2. MANAGER chỉ được phép duyệt đơn của nhân viên thuộc phòng ban mình quản lý
    if (isManager) {
      const isSubordinate = await repository.isEmployeeInManagerScope(adj.emp_id, approverId, user);
      if (!isSubordinate) {
        const err = new Error('Quản lý chỉ được phép duyệt đơn của nhân viên thuộc phòng ban/đội nhóm do mình quản lý');
        err.statusCode = 403;
        throw err;
      }
    } else if (!isAdminOrHr) {
      const err = new Error('Bạn không có quyền duyệt đơn giải trình công');
      err.statusCode = 403;
      throw err;
    }

    // 3. Cập nhật quyết định duyệt đơn
    const updated = await repository.updateAdjustmentDecision(id, decision, approverId, rejectReason);

    // 4. Đồng bộ tự động sau khi duyệt đơn Giải trình chấm công (Requirement 3)
    if (decision === 'APPROVED') {
      await repository.syncApprovedAdjustment(adj, approverId, callerRole);
    } else {
      await repository.notifyRejectedAdjustment(adj, approverId, rejectReason);
    }

    return updated;
  }

  /**
   * Hủy / Xóa đơn giải trình chấm công
   */
  async deleteAdjustment({ user, id }) {
    const adj = await repository.findAdjustmentById(id);
    if (!adj) {
      const err = new Error('Không tìm thấy đơn giải trình chấm công');
      err.statusCode = 404;
      throw err;
    }

    const currentEmpId = getEmpIdFromUser(user);
    const callerRole = (user?.role || '').toUpperCase();
    const isAdminOrHr = ['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(callerRole);

    if (!isAdminOrHr) {
      if (adj.emp_id !== currentEmpId) {
        const err = new Error('Bạn không có quyền hủy đơn giải trình của người khác');
        err.statusCode = 403;
        throw err;
      }
      if (adj.status !== 'PENDING') {
        const err = new Error('Chỉ được hủy đơn đang ở trạng thái chờ duyệt');
        err.statusCode = 400;
        throw err;
      }
    }

    await repository.deleteAdjustment(id);
    events.publish('ADJUSTMENT_REQUEST_DELETED', { requestId: id, empId: adj.emp_id }).catch(() => {});
    return { success: true, message: 'Đã hủy đơn giải trình thành công', data: { id } };
  }

  /**
   * Báo cáo thống kê tháng
   */
  async getMonthlySummary(month, year) {
    return await repository.getMonthlySummary(month, year);
  }
}

module.exports = new AttendanceService();
module.exports.formatDateDisplay = formatDateDisplay;
module.exports.formatTimeDisplay = formatTimeDisplay;
module.exports.calculateDistanceMeters = calculateDistanceMeters;
