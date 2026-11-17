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
  requireAuth(['ADMIN', 'HR']),
  payrollController.getPayrollConfigs.bind(payrollController)
);

router.get(
  ['/api/v1/payroll-configs/:empId', '/api/payroll/configs/:empId'],
  requireAuth(['ADMIN', 'HR']),
  payrollController.getPayrollConfigByEmpId.bind(payrollController)
);

router.post(
  ['/api/v1/payroll-configs', '/api/payroll/configs'],
  requireAuth(['ADMIN', 'HR']),
  payrollController.createPayrollConfig.bind(payrollController)
);

router.put(
  ['/api/v1/payroll-configs/:empId', '/api/payroll/configs/:empId'],
  requireAuth(['ADMIN', 'HR']),
  payrollController.updatePayrollConfig.bind(payrollController)
);

// ==================== KỲ LƯƠNG & TÍNH TOÁN (SCR_ADM_07) ====================

router.get(
  ['/api/v1/payrolls/periods', '/api/payrolls', '/api/payroll/periods'],
  requireAuth(['ADMIN', 'HR', 'MANAGER']),
  payrollController.getPayrollPeriods.bind(payrollController)
);

router.post(
  ['/api/v1/payrolls/calculate', '/api/payroll/calculate'],
  requireAuth(['ADMIN', 'HR']),
  payrollController.calculatePayroll.bind(payrollController)
);

router.post(
  ['/api/v1/payrolls/publish', '/api/payroll/publish'],
  requireAuth(['ADMIN', 'HR']),
  payrollController.publishPayrollPeriod.bind(payrollController)
);

router.patch(
  ['/api/v1/payrolls/:id/publish', '/api/payroll/:id/publish', '/api/v1/payrolls/:id/status'],
  requireAuth(['ADMIN', 'HR']),
  payrollController.publishPayrollPeriod.bind(payrollController)
);

// ==================== PHIẾU LƯƠNG PAYSLIP (SCR_PAY_01) ====================

router.get(
  ['/api/v1/payslips/my'],
  requireAuth(),
  payrollController.getPayslips.bind(payrollController)
);

router.get(
  ['/api/v1/payslips', '/api/payslips', '/api/v1/payrolls'],
  requireAuth(),
  payrollController.getPayslips.bind(payrollController)
);

router.get(
  ['/api/v1/payslips/:id', '/api/payslips/:id'],
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
