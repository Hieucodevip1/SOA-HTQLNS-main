/**
 * services/shift-service/controllers/shiftController.js
 * Tầng Controller điều phối Request/Response cho Quản lý Ca làm việc & Tăng ca
 * Chuẩn response SOA: { success: true, message: "...", data: ..., meta: ... }
 */

const shiftService = require('../services/shiftService');

class ShiftController {
  // 1. Lịch phân ca cá nhân của nhân viên
  async getMySchedule(req, res, next) {
    try {
      const result = await shiftService.getMySchedule(req);
      return res.status(200).json({
        success: true,
        message: 'Lấy lịch phân ca cá nhân thành công',
        data: result.schedule,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  // 2. Tra cứu lịch phân ca chung
  async getShiftAssignments(req, res, next) {
    try {
      const result = await shiftService.getShiftAssignments(req);
      return res.status(200).json({
        success: true,
        message: 'Lấy danh sách phân ca thành công',
        data: result.assignments,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  // 3. Phân ca cho nhân sự (ADMIN, HR, MANAGER)
  async createShiftAssignments(req, res, next) {
    try {
      const result = await shiftService.createShiftAssignments(req);
      return res.status(201).json({
        success: true,
        message: result.message,
        data: { affectedCount: result.count }
      });
    } catch (err) {
      next(err);
    }
  }

  // 4. Hủy phân ca
  async cancelShiftAssignment(req, res, next) {
    try {
      const result = await shiftService.cancelShiftAssignment(req.params.id, req);
      return res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (err) {
      next(err);
    }
  }

  // 5. Danh mục Ca làm việc (Shifts)
  async getAllShifts(req, res, next) {
    try {
      const { status } = req.query;
      const shifts = await shiftService.getAllShifts(status);
      return res.status(200).json({
        success: true,
        message: 'Lấy danh mục ca làm việc thành công',
        data: shifts
      });
    } catch (err) {
      next(err);
    }
  }

  async getShiftById(req, res, next) {
    try {
      const shift = await shiftService.getShiftById(req.params.id);
      return res.status(200).json({
        success: true,
        data: shift
      });
    } catch (err) {
      next(err);
    }
  }

  async createShift(req, res, next) {
    try {
      const created = await shiftService.createShift(req.body);
      return res.status(201).json({
        success: true,
        message: 'Tạo ca làm việc thành công',
        data: created
      });
    } catch (err) {
      next(err);
    }
  }

  async updateShift(req, res, next) {
    try {
      const updated = await shiftService.updateShift(req.params.id, req.body);
      return res.status(200).json({
        success: true,
        message: 'Cập nhật ca làm việc thành công',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteShift(req, res, next) {
    try {
      const result = await shiftService.deleteShift(req.params.id);
      return res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (err) {
      next(err);
    }
  }

  // 6. Quản lý Đơn tăng ca (OT Requests)
  async getOtRequests(req, res, next) {
    try {
      const result = await shiftService.getOtRequests(req);
      return res.status(200).json({
        success: true,
        message: 'Lấy danh sách đơn đăng ký tăng ca thành công',
        data: result.requests,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  async getOtRequestById(req, res, next) {
    try {
      const request = await shiftService.getOtRequestById(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: request
      });
    } catch (err) {
      next(err);
    }
  }

  async createOtRequest(req, res, next) {
    try {
      const created = await shiftService.createOtRequest(req);
      return res.status(201).json({
        success: true,
        message: 'Gửi đơn đăng ký tăng ca thành công',
        data: created
      });
    } catch (err) {
      next(err);
    }
  }

  async decideOtRequest(req, res, next) {
    try {
      let { decision, status, rejectReason = null, note = null } = req.body || {};
      decision = (decision || status || '').toUpperCase();
      if (!decision) {
        if (req.path.includes('/approve')) decision = 'APPROVED';
        else if (req.path.includes('/reject')) decision = 'REJECTED';
      }

      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        return res.status(400).json({
          success: false,
          error: 'decision phải là APPROVED hoặc REJECTED'
        });
      }

      const updated = await shiftService.decideOtRequest(req.params.id, decision, req.user, rejectReason || note);
      return res.status(200).json({
        success: true,
        message: decision === 'APPROVED' ? 'Đã phê duyệt đơn tăng ca' : 'Đã từ chối đơn tăng ca',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  // 7. Internal Service Endpoints
  async getInternalSchedule(req, res, next) {
    try {
      const { empId, date } = req.query;
      if (!empId || !date) {
        return res.status(400).json({ success: false, error: 'Thiếu empId hoặc date' });
      }
      const data = await shiftService.getScheduleForAttendance(empId, date);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getInternalOtSummary(req, res, next) {
    try {
      const { month, year } = req.query;
      const data = await shiftService.getOtSummaryForPayroll(month, year);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ShiftController();
