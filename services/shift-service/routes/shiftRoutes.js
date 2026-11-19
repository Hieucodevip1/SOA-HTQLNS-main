/**
 * services/shift-service/routes/shiftRoutes.js
 * Định tuyến API Quản lý Ca làm việc, Phân ca & Tăng ca
 * Hỗ trợ đồng thời:
 *  - Chuẩn RESTful v1: /api/v1/shifts, /api/v1/shifts/my-schedule, /api/v1/overtime-requests
 *  - Đường dẫn kế thừa: /api/shifts, /api/ot, /api/v1/ot-requests
 */

const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { requireAuth, requireInternalKey } = require('../../../shared/service-base');

// 1. Lịch phân ca cá nhân của nhân viên
const mySchedulePaths = [
  '/api/v1/shifts/my-schedule',
  '/api/v1/shifts/my-schedules',
  '/api/v1/shifts/schedules',
  '/api/shifts/my-schedule',
  '/api/shifts/my-schedules',
  '/api/shifts/schedules'
];
router.get(mySchedulePaths, requireAuth(), (req, res, next) => shiftController.getMySchedule(req, res, next));

// 2. Danh mục Ca làm việc (Shifts)
const shiftsListPaths = ['/api/v1/shifts', '/api/shifts', '/api/shift'];
const shiftItemPaths = ['/api/v1/shifts/:id', '/api/shifts/:id', '/api/shift/:id'];

router.get(shiftsListPaths, requireAuth(), (req, res, next) => shiftController.getAllShifts(req, res, next));
router.get(shiftItemPaths, requireAuth(), (req, res, next) => shiftController.getShiftById(req, res, next));
router.post(shiftsListPaths, requireAuth(['ADMIN', 'HR']), (req, res, next) => shiftController.createShift(req, res, next));
router.put(shiftItemPaths, requireAuth(['ADMIN', 'HR']), (req, res, next) => shiftController.updateShift(req, res, next));
router.delete(shiftItemPaths, requireAuth(['ADMIN', 'HR']), (req, res, next) => shiftController.deleteShift(req, res, next));

// 3. Phân ca & Lịch trực nhân viên (Shift Assignments)
const assignListPaths = ['/api/v1/shift-assignments', '/api/shifts/assignments', '/api/shift/assignments'];
const assignItemPaths = ['/api/v1/shift-assignments/:id', '/api/shifts/assignments/:id', '/api/shift/assignments/:id'];

router.get(assignListPaths, requireAuth(), (req, res, next) => shiftController.getShiftAssignments(req, res, next));
router.post(assignListPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), (req, res, next) => shiftController.createShiftAssignments(req, res, next));
router.delete(assignItemPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), (req, res, next) => shiftController.cancelShiftAssignment(req, res, next));

// 4. Đơn đăng ký tăng ca (Overtime / OT Requests)
const otListPaths = [
  '/api/v1/shifts/overtime',
  '/api/shifts/overtime',
  '/api/shifts/ot',
  '/api/v1/overtime-requests',
  '/api/v1/ot-requests',
  '/api/ot'
];
const otItemPaths = [
  '/api/v1/shifts/overtime/:id',
  '/api/shifts/overtime/:id',
  '/api/shifts/ot/:id',
  '/api/v1/overtime-requests/:id',
  '/api/v1/ot-requests/:id',
  '/api/ot/:id'
];

router.get(otListPaths, requireAuth(), (req, res, next) => shiftController.getOtRequests(req, res, next));
router.get(otItemPaths, requireAuth(), (req, res, next) => shiftController.getOtRequestById(req, res, next));
router.post(otListPaths, requireAuth(), (req, res, next) => shiftController.createOtRequest(req, res, next));
router.delete(otItemPaths, requireAuth(), (req, res, next) => shiftController.deleteOtRequest(req, res, next));

const otDecisionPaths = [
  '/api/v1/shifts/overtime/:id/approve',
  '/api/v1/shifts/overtime/:id/reject',
  '/api/v1/shifts/overtime/:id/decision',
  '/api/shifts/overtime/:id/approve',
  '/api/shifts/overtime/:id/reject',
  '/api/shifts/overtime/:id/decision',
  '/api/v1/overtime-requests/:id/approve',
  '/api/v1/overtime-requests/:id/reject',
  '/api/v1/overtime-requests/:id/decision',
  '/api/v1/ot-requests/:id/approve',
  '/api/v1/ot-requests/:id/reject',
  '/api/v1/ot-requests/:id/decision',
  '/api/ot/:id/approve',
  '/api/ot/:id/reject',
  '/api/ot/:id/decision'
];

router.patch(otDecisionPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), (req, res, next) => shiftController.decideOtRequest(req, res, next));
router.put(otDecisionPaths, requireAuth(['ADMIN', 'HR', 'MANAGER']), (req, res, next) => shiftController.decideOtRequest(req, res, next));

// 5. Internal Service APIs
router.get('/internal/shifts/schedule', requireInternalKey, (req, res, next) => shiftController.getInternalSchedule(req, res, next));
router.get('/internal/ot/summary', requireInternalKey, (req, res, next) => shiftController.getInternalOtSummary(req, res, next));

module.exports = router;
