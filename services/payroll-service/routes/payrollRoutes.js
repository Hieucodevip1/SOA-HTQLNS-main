/**
 * services/payroll-service/routes/payrollRoutes.js
 * Định nghĩa API Routes cho Payroll Service
 */

const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { requireAuth, requireInternalKey } = require('../../../shared/service-base');

// ==================== CẤU HÌNH LƯƠNG NHÂN VIÊN (SCR_ADM_04) ====================

router.get(
  ['/api/v1/payroll-configs', '/api/payroll/configs', '/api/payroll'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.getPayrollConfigs.bind(payrollController)
);

router.get(
  ['/api/v1/payroll-configs/:empId', '/api/payroll/configs/:empId'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.getPayrollConfigByEmpId.bind(payrollController)
);

router.post(
  ['/api/v1/payroll-configs', '/api/payroll/configs'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.createPayrollConfig.bind(payrollController)
);

router.put(
  ['/api/v1/payroll-configs/:empId', '/api/payroll/configs/:empId'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.updatePayrollConfig.bind(payrollController)
);

// ==================== KỲ LƯƠNG & TÍNH TOÁN (SCR_ADM_07) ====================

router.get(
  ['/api/v1/payrolls/periods', '/api/payroll/periods'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.getPayrollPeriods.bind(payrollController)
);

router.post(
  ['/api/v1/payrolls/calculate', '/api/payroll/calculate'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.calculatePayroll.bind(payrollController)
);

router.post(
  ['/api/v1/payrolls/publish', '/api/payroll/publish'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.publishPayrollPeriod.bind(payrollController)
);

router.patch(
  ['/api/v1/payrolls/:id/publish', '/api/payroll/:id/publish', '/api/v1/payrolls/:id/status'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.publishPayrollPeriod.bind(payrollController)
);

// ==================== PHIẾU LƯƠNG CÁ NHÂN (SCR_PAY_01) ====================

router.get(
  ['/api/v1/payrolls/my', '/api/payrolls/my', '/api/v1/payslips/my', '/api/payslips/my'],
  requireAuth(),
  payrollController.getMyPayslips.bind(payrollController)
);

// ==================== DANH SÁCH BẢNG LƯƠNG TOÀN CÔNG TY & PHIẾU LƯƠNG ====================

router.get(
  ['/api/v1/payrolls', '/api/payrolls'],
  requireAuth(['ADMIN', 'HR', 'HR_ADMIN']),
  payrollController.getCompanyPayrolls.bind(payrollController)
);

router.get(
  ['/api/v1/payslips', '/api/payslips'],
  requireAuth(),
  payrollController.getPayslips.bind(payrollController)
);

router.get(
  ['/api/v1/payslips/:id', '/api/payslips/:id', '/api/v1/payrolls/:id'],
  requireAuth(),
  payrollController.getPayslipById.bind(payrollController)
);

// ==================== INTERNAL API (CHO ANALYTICS SERVICE) ====================

router.get(
  '/internal/payrolls/summary',
  requireInternalKey,
  payrollController.getPayrollsSummary.bind(payrollController)
);

module.exports = router;
