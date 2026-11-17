/**
 * services/attendance-service/controllers/attendanceController.js
 * Tầng Controller tiếp nhận HTTP Request và phản hồi dữ liệu chuẩn SOA { success, message, data, meta }
 */

const attendanceService = require('../services/attendanceService');
const repository = require('../repositories/attendanceRepository');
const {
  success,
  created,
  error,
  badRequest,
  forbidden,
  notFound
} = require('../../../shared/httpx');

class AttendanceController {
  /**
   * GET /api/v1/work-locations
   */
  async getWorkLocations(req, res, next) {
    try {
      const locations = await attendanceService.getWorkLocations();
      return success(res, locations, 200, 'Lấy danh sách địa điểm chấm công thành công');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/work-locations
   */
  async createWorkLocation(req, res, next) {
    try {
      const { code, name, address, latitude, longitude, radiusMeters, wifiSsid, wifiBssid, requireFaceId } = req.body;
      if (!code || !name || latitude === undefined || longitude === undefined) {
        return badRequest(res, 'Thiếu thông tin bắt buộc: code, name, latitude, longitude');
      }

      const newLoc = await attendanceService.createWorkLocation({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: address || null,
        latitude,
        longitude,
        radiusMeters: radiusMeters ? Number(radiusMeters) : 100,
        wifiSsid: wifiSsid || null,
        wifiBssid: wifiBssid || null,
        requireFaceId: Boolean(requireFaceId)
      });

      return created(res, newLoc, 'Thêm địa điểm chấm công thành công');
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, error: 'Mã địa điểm đã tồn tại', code: 409 });
      }
      next(err);
    }
  }

  /**
   * POST /api/v1/attendances/check-in
   */
  async checkIn(req, res, next) {
    try {
      const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
      const result = await attendanceService.processCheckIn({
        user: req.user,
        callerRole,
        body: req.body,
        req
      });

      return res.status(201).json({
        success: true,
        message: result.status === 'LATE'
          ? `Check-in thành công (Đi muộn ${result.lateMinutes} phút)`
          : 'Check-in đúng giờ thành công',
        data: result.record
      });
    } catch (err) {
      if (err.unassigned) {
        return res.status(403).json({
          success: false,
          error: err.message,
          code: 403,
          meta: { unassigned: true }
        });
      }
      if (err.code === 'OUT_OF_RANGE') {
        return res.status(403).json({
          success: false,
          error: err.message,
          code: 'OUT_OF_RANGE',
          distanceMeters: err.distanceMeters
        });
      }
      if (err.statusCode === 400) {
        return res.status(400).json({
          success: false,
          error: err.message,
          ...(err.data ? { data: err.data } : {})
        });
      }
      next(err);
    }
  }

  /**
   * POST /api/v1/attendances/check-out
   */
  async checkOut(req, res, next) {
    try {
      const updated = await attendanceService.processCheckOut({
        user: req.user,
        body: req.body
      });
      return success(res, updated, 200, 'Check-out thành công');
    } catch (err) {
      if (err.statusCode === 400) {
        return badRequest(res, err.message);
      }
      next(err);
    }
  }

  /**
   * TRỌNG TÂM: Lịch sử chấm công cá nhân
   * GET /api/v1/attendances/history
   */
  async getAttendanceHistory(req, res, next) {
    try {
      const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;
      const callerRole = (req.headers['x-user-role'] || req.user?.role || 'EMPLOYEE').toUpperCase();

      // Kiểm tra cô lập dữ liệu cá nhân: cấm xem trộm lịch sử công của người khác
      if (callerRole === 'EMPLOYEE' && req.query.employeeId && req.query.employeeId !== callerEmpId) {
        return forbidden(res, 'Bạn không có quyền truy cập lịch sử chấm công của nhân viên khác');
      }

      const result = await attendanceService.getAttendanceHistory({
        callerEmpId,
        callerRole,
        query: req.query,
        req
      });

      return success(
        res,
        result.list,
        200,
        result.meta.unassigned
          ? 'Tài khoản chưa thuộc phòng ban nào'
          : 'Lấy lịch sử chấm công cá nhân thành công',
        result.meta
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/attendances
   * Lấy danh sách chấm công chung cho Manager/Admin hoặc filter
   */
  async getAttendances(req, res, next) {
    try {
      const { empId, fromDate, toDate, status, department, dept, workDate } = req.query;
      const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
      const currentEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;

      if (callerRole === 'EMPLOYEE') {
        const isAssigned = await repository.isEmployeeAssigned(currentEmpId, req);
        if (!isAssigned) {
          return success(res, [], 200, 'Thành công', { total: 0, unassigned: true });
        }
      }

      const conditions = [];
      const params = [];

      if (callerRole === 'EMPLOYEE') {
        conditions.push('a.emp_id = ?');
        params.push(currentEmpId);
      } else if (callerRole === 'MANAGER') {
        conditions.push('(e.manager_id = ? OR d.manager_id = ?)');
        params.push(currentEmpId, currentEmpId);
      } else if (empId) {
        conditions.push('a.emp_id = ?');
        params.push(empId);
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

      const rows = await repository.getAttendanceLogs(conditions, params);
      return success(res, rows, 200, 'Thành công');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/attendance-adjustments
   */
  async getAdjustments(req, res, next) {
    try {
      const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
      const empId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;

      if (callerRole === 'EMPLOYEE') {
        const isAssigned = await repository.isEmployeeAssigned(empId, req);
        if (!isAssigned) {
          return success(res, [], 200, 'Thành công', { total: 0, unassigned: true });
        }
      }

      const rows = await repository.getAttendanceLogs();
      const list = Array.from(rows);
      return success(res, list, 200, 'Thành công');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/attendance-adjustments
   */
  async createAdjustment(req, res, next) {
    try {
      const createdRecord = await attendanceService.createAdjustment({
        user: req.user,
        body: req.body
      });
      return created(res, createdRecord, 'Gửi đơn giải trình công thành công');
    } catch (err) {
      if (err.statusCode === 400) {
        return badRequest(res, err.message);
      }
      next(err);
    }
  }

  /**
   * PATCH /api/v1/attendance-adjustments/:id/decision
   */
  async decideAdjustment(req, res, next) {
    try {
      const { decision, rejectReason } = req.body;
      const updated = await attendanceService.decideAdjustment({
        user: req.user,
        id: req.params.id,
        decision,
        rejectReason
      });
      return success(res, updated, 200, 'Đã xử lý đơn giải trình công');
    } catch (err) {
      if (err.statusCode === 400) return badRequest(res, err.message);
      if (err.statusCode === 404) return notFound(res, err.message);
      next(err);
    }
  }

  /**
   * GET /internal/attendances/monthly-summary
   */
  async getMonthlySummary(req, res, next) {
    try {
      const { month, year } = req.query;
      const data = await attendanceService.getMonthlySummary(month, year);
      return success(res, data, 200, 'Thành công');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AttendanceController();
