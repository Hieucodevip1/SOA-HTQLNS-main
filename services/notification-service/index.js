/**
 * services/notification-service/index.js
 * Microservice Quản lý Thông báo & Cảnh báo Xuyên suốt (Cổng :3007)
 * Lắng nghe sự kiện từ Event Bus để tự động tạo thông báo cho nhân viên & quản lý
 */

const crypto = require('crypto');
const { createServiceApp, requireAuth, requireInternalKey } = require('../../shared/service-base');
const db = require('../../shared/db');
const registrar = require('../../shared/registrar');
const events = require('../../shared/events');

const SERVICE_NAME = 'notification-service';
const PORT = Number(process.env.NOTIFICATION_SERVICE_PORT || 3007);
const DB_NAME = process.env.NOTIFICATION_DB_NAME || 'htqlns_notification';

const pool = db.getPool(DB_NAME);

const app = createServiceApp(SERVICE_NAME, {
  port: PORT,
  checkHealth: async () => {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return rows && rows[0]?.ok === 1;
  }
});

async function createNotification({ eventId, empId = null, targetRole = null, type = 'SYSTEM', title, content, referenceId = null }) {
  // Stable identifier makes webhook redelivery idempotent.
  const id = eventId
    ? crypto.createHash('sha256').update(`notification:${eventId}`).digest('hex').slice(0, 36)
    : crypto.randomUUID();
  await pool.query(
    `INSERT IGNORE INTO notifications (id, emp_id, target_role, type, title, content, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, empId, targetRole, type, title, content, referenceId]
  );
}

// Webhook receives { id, eventType, data } from the Event Bus.
const notificationHandlers = {
  'ATTENDANCE_LATE': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      empId: payload.empId,
      type: 'ATTENDANCE_ALERT',
      title: 'Cảnh báo đi muộn',
      content: `Bạn đã check-in muộn ${payload.lateMinutes} phút vào ngày ${payload.workDate}.`,
      referenceId: payload.attendanceId
    });
  },

  'LEAVE_REQUEST_CREATED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      targetRole: 'MANAGER',
      type: 'LEAVE_STATUS',
      title: 'Có đơn xin nghỉ phép mới chờ duyệt',
      content: `Nhân sự ${payload.empId} vừa gửi đơn xin nghỉ ${payload.totalDays} ngày (${payload.startDate} → ${payload.endDate}).`,
      referenceId: payload.requestId
    });
  },

  'LEAVE_REQUEST_APPROVED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      empId: payload.empId,
      type: 'LEAVE_STATUS',
      title: 'Đơn xin nghỉ phép đã được duyệt',
      content: `Đơn nghỉ phép từ ${payload.startDate} đến ${payload.endDate} (${payload.totalDays} ngày) của bạn đã được phê duyệt.`,
      referenceId: payload.requestId
    });
  },

  'LEAVE_REQUEST_REJECTED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      empId: payload.empId,
      type: 'LEAVE_STATUS',
      title: 'Đơn xin nghỉ phép bị từ chối',
      content: `Đơn nghỉ phép từ ${payload.startDate} đến ${payload.endDate} của bạn đã bị từ chối.`,
      referenceId: payload.requestId
    });
  },

  'OT_REQUEST_APPROVED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      empId: payload.empId,
      type: 'OT_STATUS',
      title: 'Đơn đăng ký tăng ca (OT) đã được duyệt',
      content: `Đăng ký tăng ca ${payload.totalHours} giờ ngày ${payload.workDate} của bạn đã được phê duyệt.`,
      referenceId: payload.requestId
    });
  },

  'LEAVE_REQUEST_CANCELLED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      targetRole: 'MANAGER',
      type: 'LEAVE_STATUS',
      title: 'Đơn nghỉ phép đã được hủy',
      content: `Nhân viên ${payload.empId} đã hủy đơn nghỉ phép đang chờ duyệt.`,
      referenceId: payload.requestId
    });
  },

  'SHIFT_SWAP_REQUESTED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      targetRole: 'MANAGER',
      type: 'SYSTEM',
      title: 'Có yêu cầu đổi ca đang chờ duyệt',
      content: `Nhân viên ${payload.empId} đã đề nghị đổi ca với ${payload.targetEmpId}.`,
      referenceId: payload.requestId
    });
  },

  'SHIFT_SWAP_APPROVED': async (event) => {
    const payload = event.data || {};
    for (const empId of [payload.empId, payload.targetEmpId].filter(Boolean)) {
      await createNotification({
        eventId: `${event.id}:${empId}`,
        empId,
        type: 'SYSTEM',
        title: 'Yêu cầu đổi ca đã được phê duyệt',
        content: 'Lịch làm việc đã được cập nhật sau khi quản lý phê duyệt đổi ca.',
        referenceId: payload.requestId
      });
    }
  },

  'SHIFT_SWAP_REJECTED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      empId: payload.empId,
      type: 'SYSTEM',
      title: 'Yêu cầu đổi ca đã bị từ chối',
      content: 'Quản lý đã từ chối yêu cầu đổi ca. Lịch phân ca của bạn không thay đổi.',
      referenceId: payload.requestId
    });
  },

  'PAYSLIP_PUBLISHED': async (event) => {
    const payload = event.data || {};
    await createNotification({
      eventId: event.id,
      targetRole: 'EMPLOYEE',
      type: 'PAYROLL',
      title: `Phiếu lương tháng ${payload.month}/${payload.year} đã phát hành`,
      content: `Bảng lương kỳ ${payload.month}/${payload.year} đã được chốt. Vui lòng kiểm tra mục Phiếu lương.`,
      referenceId: payload.periodId
    });
  },
};

app.use('/events', requireInternalKey, events.createWebhookRouter(notificationHandlers));

function setupEventSubscriptions() {
  setTimeout(() => {
    events.subscribe(Object.keys(notificationHandlers), `http://localhost:${PORT}/events`, {
      serviceName: SERVICE_NAME
    }).catch((err) => console.error('[NOTIFICATION] Subscription failed:', err.message));
  }, 2000);
}

// Broadcast notifications have an independent read status per viewer.
app.get(['/api/v1/notifications', '/api/notifications', '/api/notification'], requireAuth(), async (req, res, next) => {
  try {
    const empId = req.user.empId || req.user.emp_id || '';
    const viewerId = String(req.user.userId || req.user.id || req.user.sub || empId);
    const [rows] = await pool.query(
      `SELECT n.id, n.emp_id, n.target_role, n.type, n.title, n.content,
              n.reference_id, n.created_at,
              CASE WHEN n.emp_id IS NOT NULL THEN n.is_read ELSE (nr.notification_id IS NOT NULL) END AS is_read,
              CASE WHEN n.emp_id IS NOT NULL THEN n.read_at ELSE nr.read_at END AS read_at
       FROM notifications n
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.viewer_id = ?
       WHERE n.emp_id = ? OR (n.emp_id IS NULL AND n.target_role = ?)
       ORDER BY n.created_at DESC LIMIT 50`,
      [viewerId, empId, req.user.role || '']
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Only the addressed employee / role recipient can acknowledge a notification.
app.patch(['/api/v1/notifications/:id/read', '/api/notifications/:id/read'], requireAuth(), async (req, res, next) => {
  try {
    const empId = req.user.empId || req.user.emp_id || '';
    const viewerId = String(req.user.userId || req.user.id || req.user.sub || empId);
    if (!viewerId) return res.status(401).json({ success: false, error: 'Thiếu định danh người dùng' });

    const [rows] = await pool.query('SELECT id, emp_id, target_role FROM notifications WHERE id = ?', [req.params.id]);
    const item = rows[0];
    if (!item || (item.emp_id !== empId && !(item.emp_id === null && item.target_role === req.user.role))) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy thông báo của bạn' });
    }

    if (item.emp_id !== null) {
      await pool.query('UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ? AND emp_id = ?', [item.id, empId]);
    } else {
      await pool.query(
        'INSERT INTO notification_reads (notification_id, viewer_id, read_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE read_at = VALUES(read_at)',
        [item.id, viewerId]
      );
    }
    res.json({ success: true, message: 'Đã đánh dấu đã đọc' });
  } catch (err) {
    next(err);
  }
});

app.useErrorHandler();
app.start(PORT, () => {
  setupEventSubscriptions();
  registrar.register({ name: SERVICE_NAME, port: PORT, host: 'localhost', prefix: '/api/v1/notifications' });
});