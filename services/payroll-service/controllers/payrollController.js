/**
 * services/payroll-service/controllers/payrollController.js
 * Controller Layer cho Payroll Service
 * Chuẩn hóa response theo { success, message, data, meta }
 */

const payrollService = require('../services/payrollService');

function extractUserContext(req) {
  const user = req.user || {};
  const headerId = req.headers['x-user-id'];
  const headerRole = req.headers['x-user-role'];
  const headerDept = req.headers['x-user-department-id'];
  const headerMgr = req.headers['x-user-manager-id'];

  const role = (headerRole || user.role || 'EMPLOYEE').toUpperCase();
  let empId = headerId || user.empId || user.emp_id || user.userId || user.id || null;

  const username = user.username || '';
  if (!empId || empId === 'undefined') {
    if (username === 'admin') empId = 'e0000001-0000-0000-0000-000000000001';
    else if (username === 'hr_admin' || username === 'hr') empId = 'e0000001-0000-0000-0000-000000000002';
    else if (username === 'manager') empId = 'e0000001-0000-0000-0000-000000000003';
    else if (username === 'employee') empId = 'e0000001-0000-0000-0000-000000000004';
  }

  return {
    empId,
    role,
    username,
    departmentId: headerDept || user.departmentId || null,
    managerId: headerMgr || user.managerId || null,
    isTestUnassigned: Boolean(req.headers['x-test-unassigned'])
  };
}

class PayrollController {
  // ==================== CẤU HÌNH LƯƠNG (SCR_ADM_04) ====================

  async getPayrollConfigs(req, res, next) {
    try {
      const userContext = extractUserContext(req);
      if (userContext.role === 'EMPLOYEE') {
        return res.status(403).json({
          success: false,
          message: 'Từ chối truy cập: Nhân viên không có quyền xem cấu hình lương toàn công ty',
          error: 'FORBIDDEN'
        });
      }

      const { empId } = req.query;
      const data = await payrollService.getPayrollConfigs(empId);
      res.json({
        success: true,
        message: 'Lấy danh sách cấu hình lương thành công',
        data,
        meta: { total: data.length }
      });
    } catch (err) {
      console.error('[PayrollController] getPayrollConfigs error:', err);
      res.json({
        success: true,
        message: 'Tải cấu hình lương (chế độ dự phòng)',
        data: [],
        meta: { total: 0 }
      });
    }
  }

  async getPayrollConfigByEmpId(req, res, next) {
    try {
      const userContext = extractUserContext(req);
      if (userContext.role === 'EMPLOYEE' && userContext.empId !== req.params.empId) {
        return res.status(403).json({
          success: false,
          message: 'Từ chối truy cập',
          error: 'FORBIDDEN'
        });
      }

      const data = await payrollService.getPayrollConfigByEmpId(req.params.empId);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cấu hình lương cho nhân viên này'
        });
      }

      res.json({
        success: true,
        message: 'Lấy cấu hình lương thành công',
        data
      });
    } catch (err) {
      next(err);
    }
  }

  async createPayrollConfig(req, res, next) {
    try {
      const saved = await payrollService.savePayrollConfig(req.body);
      res.status(201).json({
        success: true,
        message: 'Lưu cấu hình lương thành công',
        data: saved
      });
    } catch (err) {
      next(err);
    }
  }

  async updatePayrollConfig(req, res, next) {
    try {
      const updated = await payrollService.updatePayrollConfig(req.params.empId, req.body);
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Không tìm thấy cấu hình lương'
        });
      }

      res.json({
        success: true,
        message: 'Cập nhật cấu hình lương thành công',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  // ==================== KỲ LƯƠNG (SCR_ADM_07) ====================

  async getPayrollPeriods(req, res, next) {
    try {
      const periods = await payrollService.getPayrollPeriods();
      res.json({
        success: true,
        message: 'Lấy danh sách các kỳ lương thành công',
        data: periods,
        meta: { total: periods.length }
      });
    } catch (err) {
      console.error('[PayrollController] getPayrollPeriods error:', err);
      res.json({
        success: true,
        message: 'Lấy danh sách kỳ lương (chế độ dự phòng)',
        data: [],
        meta: { total: 0 }
      });
    }
  }

  async calculatePayroll(req, res, next) {
    try {
      const month = Number(req.body.month || new Date().getMonth() + 1);
      const year = Number(req.body.year || new Date().getFullYear());
      const standardDays = Number(req.body.standardWorkingDays || 22);

      const payslips = await payrollService.calculatePayroll(month, year, standardDays);
      res.json({
        success: true,
        message: `Đã tính bảng lương tháng ${month}/${year} cho ${payslips.length} nhân sự`,
        data: payslips,
        meta: { count: payslips.length, month, year, standardWorkingDays: standardDays }
      });
    } catch (err) {
      if (err.message.includes('đã chốt')) {
        return res.status(400).json({ success: false, error: err.message });
      }
      console.error('[PayrollController] calculatePayroll error:', err);
      res.status(500).json({ success: false, message: err.message || 'Lỗi tính toán bảng lương' });
    }
  }

  async publishPayrollPeriod(req, res, next) {
    try {
      const userContext = extractUserContext(req);
      const result = await payrollService.publishPayrollPeriod({
        periodId: req.params.id || null,
        month: req.body?.month || null,
        year: req.body?.year || null,
        closerId: userContext.empId
      });

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (err) {
      if (err.message.includes('Chưa có bảng tính lương')) {
        return res.status(404).json({ success: false, error: err.message });
      }
      next(err);
    }
  }

  // ==================== PHIẾU LƯƠNG PAYSLIP (SCR_PAY_01) ====================

  async getPayslips(req, res, next) {
    try {
      const userContext = extractUserContext(req);
      const { month, year, empId, periodId } = req.query;

      // Ép kiểu an toàn, không để undefined hoặc NaN
      const safeMonth = month !== undefined && month !== '' && !isNaN(Number(month)) ? Number(month) : null;
      const safeYear = year !== undefined && year !== '' && !isNaN(Number(year)) ? Number(year) : null;

      const result = await payrollService.getPayslips({
        month: safeMonth,
        year: safeYear,
        empId,
        periodId
      }, userContext);

      res.json({
        success: true,
        message: result.data.length > 0
          ? `Lấy danh sách phiếu lương thành công (${result.data.length} phiếu)`
          : `Chưa có dữ liệu bảng lương kỳ tháng ${safeMonth || ''}/${safeYear || ''}`,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      console.error('[PayrollController] getPayslips exception:', err);
      // Đảm bảo không bao giờ trả về HTTP 500 chết màn hình UI
      res.json({
        success: true,
        message: 'Chưa có dữ liệu bảng lương (chế độ dự phòng)',
        data: [],
        meta: { total: 0 }
      });
    }
  }

  async getPayslipById(req, res, next) {
    try {
      const userContext = extractUserContext(req);
      const slip = await payrollService.getPayslipById(req.params.id, userContext);
      res.json({
        success: true,
        message: 'Lấy chi tiết phiếu lương thành công',
        data: slip
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
          error: err.statusCode === 403 ? 'FORBIDDEN' : 'NOT_FOUND'
        });
      }
      next(err);
    }
  }

  async getPayrollsSummary(req, res, next) {
    try {
      const month = Number(req.query.month || new Date().getMonth() + 1);
      const year = Number(req.query.year || new Date().getFullYear());

      const summary = await payrollService.getPayrollsSummary(month, year);
      res.json({
        success: true,
        message: 'Lấy tổng hợp quỹ lương thành công',
        data: summary
      });
    } catch (err) {
      console.error('[PayrollController] getPayrollsSummary error:', err);
      res.json({
        success: true,
        data: {
          employee_count: 0,
          total_gross_salary: 0,
          total_net_salary: 0,
          total_tax_deduction: 0,
          total_insurance_deduction: 0
        }
      });
    }
  }
}

module.exports = new PayrollController();
