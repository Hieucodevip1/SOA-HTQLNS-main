/**
 * services/attendance-service/routes/attendanceRoutes.js
 * Định nghĩa tất cả các routes của attendance-service
 * Ánh xạ tới attendanceController theo mô hình phân tầng routes -> controllers -> services -> repositories
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/attendanceController');
const { requireAuth, requireInternalKey } = require('../../../shared/service-base');

// 1. TRỌNG TÂM: Lịch sử chấm công cá nhân của nhân viên
router.get(
  ['/api/v1/attendances/history', '/api/attendance/history', '/history'],
  requireAuth(),
  (req, res, next) => controller.getAttendanceHistory(req, res, next)
);

// 2. Cấu hình địa điểm chấm công GPS / WiFi (SCR_ADM_02)
router.get(
  ['/api/v1/work-locations', '/api/work-locations', '/api/attendance/work-locations', '/work-locations'],
  requireAuth(),
  (req, res, next) => controller.getWorkLocations(req, res, next)
);

router.post(
  ['/api/v1/work-locations', '/api/work-locations', '/api/attendance/work-locations', '/work-locations'],
  requireAuth(['ADMIN', 'HR']),
  (req, res, next) => controller.createWorkLocation(req, res, next)
);

// 3. Điểm danh Check-in & Check-out (SCR_ATT_01)
router.post(
  ['/api/v1/attendances/check-in', '/api/attendance/check-in', '/check-in'],
  requireAuth(),
  (req, res, next) => controller.checkIn(req, res, next)
);

router.post(
  ['/api/v1/attendances/check-out', '/api/attendance/check-out', '/check-out'],
  requireAuth(),
  (req, res, next) => controller.checkOut(req, res, next)
);

// 4. Lấy danh sách chấm công chung
router.get(
  ['/api/v1/attendances', '/api/attendance'],
  requireAuth(),
  (req, res, next) => controller.getAttendances(req, res, next)
);

// 5. Đơn giải trình chấm công (SCR_ATT_03, SCR_ATT_04)
const adjustmentListPaths = [
  '/api/v1/attendances/explanations',
  '/api/v1/attendance/explanations',
  '/api/v1/attendance-explanations',
  '/api/attendance/explanations',
  '/api/v1/attendance-adjustments',
  '/api/attendance/adjustments'
];

const adjustmentItemPaths = [
  '/api/v1/attendances/explanations/:id',
  '/api/v1/attendance/explanations/:id',
  '/api/v1/attendance-explanations/:id',
  '/api/attendance/explanations/:id',
  '/api/v1/attendance-adjustments/:id',
  '/api/attendance/adjustments/:id'
];

router.get(
  adjustmentListPaths,
  requireAuth(),
  (req, res, next) => controller.getAdjustments(req, res, next)
);

router.post(
  adjustmentListPaths,
  requireAuth(),
  (req, res, next) => controller.createAdjustment(req, res, next)
);

router.delete(
  adjustmentItemPaths,
  requireAuth(),
  (req, res, next) => controller.deleteAdjustment(req, res, next)
);

const adjustmentDecisionPaths = [
  '/api/v1/attendances/explanations/:id/decision',
  '/api/attendance/explanations/:id/decision',
  '/api/v1/attendance-adjustments/:id/decision',
  '/api/attendance/adjustments/:id/decision',
  '/api/attendance/adjustments/:id/status'
];

router.patch(
  adjustmentDecisionPaths,
  requireAuth(['ADMIN', 'HR', 'MANAGER']),
  (req, res, next) => controller.decideAdjustment(req, res, next)
);

router.put(
  adjustmentDecisionPaths,
  requireAuth(['ADMIN', 'HR', 'MANAGER']),
  (req, res, next) => controller.decideAdjustment(req, res, next)
);

// 6. Internal API cho Payroll & Analytics
router.get(
  '/internal/attendances/monthly-summary',
  requireInternalKey,
  (req, res, next) => controller.getMonthlySummary(req, res, next)
);

module.exports = router;
