/**
 * services/notification-service/index.js
 * Microservice Quản lý Thông báo & Cảnh báo Xuyên suốt (Cổng :3007)
 * Lắng nghe sự kiện từ Event Bus để tự động tạo thông báo cho nhân viên & quản lý
 */

const crypto = require('crypto');
const { createServiceApp, requireAuth } = require('../../shared/service-base');
const db = require('../../shared/db');
const registrar = require('../../shared/registrar');
const events = require('../../shared/events');

const SERVICE_NAME = 'notification-service';
const PORT = Number(process.env.NOTIFICATION_SERVICE_PORT || 3007);
const DB_NAME = process.env.NOTIFICATION_DB_NAME || 'htqlns_notification';

const pool = db.getPool(DB_NAME);

// Bộ nhớ đệm dự phòng khi MySQL không khả dụng
const memoryNotifications = new Map();

// Helper định dạng ngày tháng
function formatDateDisplay(d) {
  if (!d) return '';
  const str = String(d).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

function formatDateRange(startDate, endDate) {
  const s = formatDateDisplay(startDate);
  const e = formatDateDisplay(endDate);
  if (!s && !e) return '';
  if (!e || s === e) return s;
  return `${s} - ${e}`;
}

function formatDateSummary(workDates) {
  if (!workDates || !workDates.length) return '';
  if (workDates.length === 1) return formatDateDisplay(workDates[0]);
  const sorted = [...workDates].sort();
  const first = formatDateDisplay(sorted[0]);
  const last = formatDateDisplay(sorted[sorted.length - 1]);
  return `${first} - ${last}`;
}

function getEmpIdFromReq(req) {
  return req.user?.empId || req.user?.emp_id || req.user?.id || req.headers['x-user-emp-id'] || req.headers['x-user-id'] || '';
}

function getRoleFromReq(req) {
  return (req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
}

/**
 * Tra cứu thông tin họ tên nhân viên và ID quản lý trực thuộc
 */
async function resolveEmployeeAndManager(empId, providedName = null, providedManagerId = null) {
  let employeeName = providedName || 'Nhân viên';
  let managerId = providedManagerId || null;

  if (providedName && providedManagerId) {
    return { employeeName, managerId };
  }

  if (!empId) {
    return { employeeName, managerId };
  }

  try {
    const [rows] = await pool.query(
      `SELECT e.full_name, e.manager_id, d.manager_id AS dept_manager_id
       FROM htqlns_organization.employees e
       LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id
       WHERE e.id = ? LIMIT 1`,
      [empId]
    );
    if (rows && rows.length > 0) {
      if (!providedName && rows[0].full_name) {
        employeeName = rows[0].full_name;
      }
      if (!providedManagerId) {
        managerId = rows[0].manager_id || rows[0].dept_manager_id || null;
      }
    }
  } catch (err) {
    // Bỏ qua lỗi tra cứu DB để hệ thống tiếp tục hoạt động với fallback
  }

  return { employeeName, managerId };
}

/**
 * Tạo mới thông báo
 */
async function createNotification({
  id = null,
  empId = null,
  targetRole = null,
  type = 'SYSTEM',
  title,
  content,
  referenceId = null,
  metadata = null
}) {
  const notifId = id || crypto.randomUUID();
  let metadataObj = null;
  let metadataStr = null;

  if (metadata) {
    if (typeof metadata === 'object') {
      metadataObj = metadata;
      try {
        metadataStr = JSON.stringify(metadata);
      } catch (_) {
        metadataStr = null;
      }
    } else if (typeof metadata === 'string') {
      metadataStr = metadata;
      try {
        metadataObj = JSON.parse(metadata);
      } catch (_) {
        metadataObj = null;
      }
    }
  }

  const record = {
    id: notifId,
    emp_id: empId || null,
    target_role: targetRole || null,
    type: type || 'SYSTEM',
    title,
    content,
    reference_id: referenceId ? String(referenceId) : null,
    metadata: metadataObj,
    targetPage: metadataObj?.targetPage || null,
    targetTab: metadataObj?.targetTab || null,
    filterStatus: metadataObj?.filterStatus || null,
    is_read: false,
    read_at: null,
    created_at: new Date().toISOString()
  };

  // Lưu vào bộ nhớ in-memory fallback
  memoryNotifications.set(notifId, record);

  // Thử lưu vào MySQL
  try {
    await pool.query(
      `INSERT INTO notifications (id, emp_id, target_role, type, title, content, reference_id, metadata, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
      [
        record.id,
        record.emp_id,
        record.target_role,
        record.type,
        record.title,
        record.content,
        record.reference_id,
        metadataStr
      ]
    );
  } catch (dbErr) {
    // Nếu bảng chưa có metadata column, fallback lưu không có metadata
    try {
      await pool.query(
        `INSERT INTO notifications (id, emp_id, target_role, type, title, content, reference_id, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
        [
          record.id,
          record.emp_id,
          record.target_role,
          record.type,
          record.title,
          record.content,
          record.reference_id
        ]
      );
    } catch (_) {}
  }

  return record;
}

/**
 * Lấy danh sách thông báo theo quyền hạn của người dùng
 */
async function getNotificationsForUser({ empId, userId = null, role }) {
  const idCandidates = new Set();
  if (empId) idCandidates.add(String(empId));
  if (userId) idCandidates.add(String(userId));

  const userRole = String(role || '').toUpperCase();
  const isAdminOrHr = ['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(userRole);
  const isManager = userRole === 'MANAGER';

  try {
    // Nếu có DB, tra cứu chéo giữa users.id và users.emp_id để gom đủ các định danh
    if (idCandidates.size > 0) {
      try {
        const idList = Array.from(idCandidates);
        const [uRows] = await pool.query(
          'SELECT id, emp_id FROM htqlns_auth.users WHERE id IN (?) OR emp_id IN (?)',
          [idList, idList]
        );
        if (uRows && uRows.length > 0) {
          for (const u of uRows) {
            if (u.id) idCandidates.add(String(u.id));
            if (u.emp_id) idCandidates.add(String(u.emp_id));
          }
        }
      } catch (_) {}
    }

    const targetIds = Array.from(idCandidates);
    let rows;
    if (targetIds.length > 0) {
      [rows] = await pool.query(
        `SELECT * FROM notifications
         WHERE emp_id IN (?)
            OR (emp_id IS NULL AND (
                 target_role = ?
                 OR target_role = 'ALL'
                 OR (target_role = 'HR_ADMIN' AND ? = TRUE)
                 OR (target_role = 'ADMIN' AND ? = TRUE)
                 OR (target_role = 'MANAGER' AND ? = TRUE)
               ))
         ORDER BY created_at DESC LIMIT 50`,
        [targetIds, userRole, isAdminOrHr, ['ADMIN', 'SYSTEM_ADMIN'].includes(userRole), isManager]
      );
    } else {
      [rows] = await pool.query(
        `SELECT * FROM notifications
         WHERE emp_id IS NULL AND (
                 target_role = ?
                 OR target_role = 'ALL'
                 OR (target_role = 'HR_ADMIN' AND ? = TRUE)
                 OR (target_role = 'ADMIN' AND ? = TRUE)
                 OR (target_role = 'MANAGER' AND ? = TRUE)
               )
         ORDER BY created_at DESC LIMIT 50`,
        [userRole, isAdminOrHr, ['ADMIN', 'SYSTEM_ADMIN'].includes(userRole), isManager]
      );
    }

    if (rows && Array.isArray(rows)) {
      return rows.map((r) => {
        let meta = null;
        if (r.metadata) {
          try {
            meta = typeof r.metadata === 'object' ? r.metadata : JSON.parse(r.metadata);
          } catch (_) {
            meta = null;
          }
        }
        return {
          ...r,
          metadata: meta,
          targetPage: meta?.targetPage || r.targetPage || null,
          targetTab: meta?.targetTab || r.targetTab || null,
          filterStatus: meta?.filterStatus || r.filterStatus || null,
          is_read: Boolean(r.is_read)
        };
      });
    }
  } catch (err) {
    // Dự phòng sang in-memory
  }

  const items = Array.from(memoryNotifications.values()).filter((n) => {
    if (n.emp_id && idCandidates.has(String(n.emp_id))) return true;
    if (!n.emp_id) {
      if (userRole && n.target_role === userRole) return true;
      if (n.target_role === 'ALL') return true;
      if (n.target_role === 'HR_ADMIN' && isAdminOrHr) return true;
      if (n.target_role === 'ADMIN' && ['ADMIN', 'SYSTEM_ADMIN'].includes(userRole)) return true;
      if (n.target_role === 'MANAGER' && isManager) return true;
    }
    return false;
  });

  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return items.slice(0, 50).map((r) => ({
    ...r,
    targetPage: r.targetPage || r.metadata?.targetPage || null,
    targetTab: r.targetTab || r.metadata?.targetTab || null,
    filterStatus: r.filterStatus || r.metadata?.filterStatus || null,
    is_read: Boolean(r.is_read)
  }));
}

/**
 * Đánh dấu đã đọc 1 thông báo
 */
async function markNotificationAsRead(id) {
  if (!id) return;
  const mem = memoryNotifications.get(id);
  if (mem) {
    mem.is_read = true;
    mem.read_at = new Date().toISOString();
  }
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ?', [id]);
  } catch (err) {}
}

/**
 * Đánh dấu đã đọc toàn bộ thông báo của người dùng
 */
async function markAllNotificationsAsRead({ empId, userId = null, role }) {
  const idCandidates = new Set();
  if (empId) idCandidates.add(String(empId));
  if (userId) idCandidates.add(String(userId));

  const userRole = String(role || '').toUpperCase();
  const isAdminOrHr = ['ADMIN', 'HR', 'HR_ADMIN', 'SYSTEM_ADMIN'].includes(userRole);
  const isManager = userRole === 'MANAGER';

  for (const n of memoryNotifications.values()) {
    const isTarget =
      (n.emp_id && idCandidates.has(String(n.emp_id))) ||
      (!n.emp_id && (
        (userRole && n.target_role === userRole) ||
        n.target_role === 'ALL' ||
        (n.target_role === 'HR_ADMIN' && isAdminOrHr) ||
        (n.target_role === 'ADMIN' && ['ADMIN', 'SYSTEM_ADMIN'].includes(userRole)) ||
        (n.target_role === 'MANAGER' && isManager)
      ));
    if (isTarget && !n.is_read) {
      n.is_read = true;
      n.read_at = new Date().toISOString();
    }
  }

  try {
    const targetIds = Array.from(idCandidates);
    if (targetIds.length > 0) {
      await pool.query(
        `UPDATE notifications
         SET is_read = TRUE, read_at = NOW()
         WHERE is_read = FALSE
           AND (
             emp_id IN (?)
             OR (emp_id IS NULL AND (
                  target_role = ?
                  OR target_role = 'ALL'
                  OR (target_role = 'HR_ADMIN' AND ? = TRUE)
                  OR (target_role = 'ADMIN' AND ? = TRUE)
                  OR (target_role = 'MANAGER' AND ? = TRUE)
                ))
           )`,
        [targetIds, userRole, isAdminOrHr, ['ADMIN', 'SYSTEM_ADMIN'].includes(userRole), isManager]
      );
    } else {
      await pool.query(
        `UPDATE notifications
         SET is_read = TRUE, read_at = NOW()
         WHERE is_read = FALSE
           AND emp_id IS NULL AND (
                  target_role = ?
                  OR target_role = 'ALL'
                  OR (target_role = 'HR_ADMIN' AND ? = TRUE)
                  OR (target_role = 'ADMIN' AND ? = TRUE)
                  OR (target_role = 'MANAGER' AND ? = TRUE)
                )`,
        [userRole, isAdminOrHr, ['ADMIN', 'SYSTEM_ADMIN'].includes(userRole), isManager]
      );
    }
  } catch (err) {}
}

// Bảng ánh xạ xử lý sự kiện Event Bus
const eventHandlers = {
  // 0. Nhân viên mới đăng ký tài khoản -> Báo cho HR/Admin tiếp nhận vào phòng ban
  'user.registered': async (event) => {
    const data = event.data || event;
    const fullName = data.fullName || data.full_name || data.username || 'Nhân viên mới';
    const email = data.email || '';
    const title = 'Nhân viên mới chờ tiếp nhận';
    const content = `Nhân viên mới ${fullName} (${email}) đang chờ tiếp nhận và phân phòng ban`;

    await createNotification({
      targetRole: 'HR_ADMIN',
      type: 'SYSTEM',
      title,
      content,
      referenceId: data.empId || data.userId || null,
      metadata: { targetPage: 'employees', filterStatus: 'PENDING' }
    });
  },

  'employee.created': async (event) => {
    const data = event.data || event;
    if (!data.departmentId && !data.department_id) {
      const fullName = data.fullName || data.full_name || 'Nhân viên mới';
      const email = data.email || '';
      const title = 'Nhân viên mới chờ tiếp nhận';
      const content = `Nhân viên mới ${fullName} (${email}) đang chờ tiếp nhận và phân phòng ban`;

      await createNotification({
        targetRole: 'HR_ADMIN',
        type: 'SYSTEM',
        title,
        content,
        referenceId: data.id || null,
        metadata: { targetPage: 'employees', filterStatus: 'PENDING' }
      });
    }
  },

  // Tiếp nhận / mời nhân viên vào phòng ban
  'employee.invited': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id || data.id;
    const deptName = data.deptName || data.departmentName || 'phòng ban';
    const managerName = data.managerName || 'Quản lý';
    if (empId) {
      await createNotification({
        empId,
        type: 'SYSTEM',
        title: 'Bạn đã được tiếp nhận vào phòng ban',
        content: `Bạn đã được ${managerName} tiếp nhận vào ${deptName}${data.position ? ` với vị trí ${data.position}` : ''}.`,
        referenceId: data.departmentId || null,
        metadata: { targetPage: 'profile' }
      });
    }
  },

  // 1. Nhân viên nộp đơn xin nghỉ phép -> Báo cho Quản lý & HR/Admin
  'LEAVE_REQUEST_CREATED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const { employeeName, managerId } = await resolveEmployeeAndManager(empId, data.employeeName, data.managerId);
    const dateRange = formatDateRange(data.startDate, data.endDate);
    const title = 'Đơn xin nghỉ phép mới cần phê duyệt';
    const content = `${employeeName} vừa gửi đơn xin nghỉ phép (${dateRange}) cần phê duyệt`;
    const metadata = { targetPage: 'leaves', targetTab: 'approval', filterStatus: 'PENDING' };

    if (managerId && managerId !== empId) {
      await createNotification({
        empId: managerId,
        type: 'LEAVE_STATUS',
        title,
        content,
        referenceId: data.requestId,
        metadata
      });
    }
    await createNotification({
      targetRole: 'HR_ADMIN',
      type: 'LEAVE_STATUS',
      title,
      content,
      referenceId: data.requestId,
      metadata
    });
  },

  // 2. Nhân viên đăng ký tăng ca OT -> Báo cho Quản lý & HR/Admin
  'OT_REQUEST_CREATED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const { employeeName, managerId } = await resolveEmployeeAndManager(empId, data.employeeName, data.managerId);
    const dateStr = formatDateDisplay(data.workDate);
    const title = 'Đơn đăng ký tăng ca (OT) mới cần phê duyệt';
    const content = `${employeeName} vừa gửi đơn đăng ký tăng ca (OT) (${dateStr}) cần phê duyệt`;
    const metadata = { targetPage: 'shifts', targetTab: 'ot-requests', filterStatus: 'PENDING' };

    if (managerId && managerId !== empId) {
      await createNotification({
        empId: managerId,
        type: 'OT_STATUS',
        title,
        content,
        referenceId: data.requestId,
        metadata
      });
    }
    await createNotification({
      targetRole: 'HR_ADMIN',
      type: 'OT_STATUS',
      title,
      content,
      referenceId: data.requestId,
      metadata
    });
  },

  // 3. Nhân viên giải trình chấm công -> Báo cho Quản lý & HR/Admin
  'ADJUSTMENT_REQUEST_CREATED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const { employeeName, managerId } = await resolveEmployeeAndManager(empId, data.employeeName, data.managerId);
    const dateStr = formatDateDisplay(data.workDate);
    const title = 'Đơn giải trình chấm công mới cần phê duyệt';
    const content = `${employeeName} vừa gửi đơn giải trình chấm công (${dateStr}) cần phê duyệt`;
    const metadata = { targetPage: 'leaves', targetTab: 'approval', filterStatus: 'PENDING' };

    if (managerId && managerId !== empId) {
      await createNotification({
        empId: managerId,
        type: 'ATTENDANCE_ALERT',
        title,
        content,
        referenceId: data.adjustmentId || data.requestId,
        metadata
      });
    }
    await createNotification({
      targetRole: 'HR_ADMIN',
      type: 'ATTENDANCE_ALERT',
      title,
      content,
      referenceId: data.adjustmentId || data.requestId,
      metadata
    });
  },

  // 4. Phê duyệt đơn xin nghỉ phép -> Báo cho nhân viên nộp đơn
  'LEAVE_REQUEST_APPROVED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const dateRange = formatDateRange(data.startDate, data.endDate);
    await createNotification({
      empId,
      type: 'LEAVE_STATUS',
      title: 'Đơn xin nghỉ phép đã được phê duyệt',
      content: `Đơn xin nghỉ phép ngày ${dateRange} của bạn đã được phê duyệt.`,
      referenceId: data.requestId,
      metadata: { targetPage: 'leaves', targetTab: 'my-requests' }
    });
  },

  // 5. Từ chối đơn xin nghỉ phép -> Báo cho nhân viên nộp đơn
  'LEAVE_REQUEST_REJECTED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const dateRange = formatDateRange(data.startDate, data.endDate);
    const reason = data.rejectReason || data.reject_reason || '';
    await createNotification({
      empId,
      type: 'LEAVE_STATUS',
      title: 'Đơn xin nghỉ phép bị từ chối',
      content: `Đơn xin nghỉ phép ngày ${dateRange} của bạn đã bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`,
      referenceId: data.requestId,
      metadata: { targetPage: 'leaves', targetTab: 'my-requests' }
    });
  },

  // 6. Phê duyệt đơn tăng ca OT -> Báo cho nhân viên nộp đơn
  'OT_REQUEST_APPROVED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const dateStr = formatDateDisplay(data.workDate);
    await createNotification({
      empId,
      type: 'OT_STATUS',
      title: 'Đơn đăng ký tăng ca (OT) đã được phê duyệt',
      content: `Đơn đăng ký tăng ca (OT) ngày ${dateStr} của bạn đã được phê duyệt.`,
      referenceId: data.requestId,
      metadata: { targetPage: 'shifts', targetTab: 'ot-requests' }
    });
  },

  // 7. Từ chối đơn tăng ca OT -> Báo cho nhân viên nộp đơn
  'OT_REQUEST_REJECTED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const dateStr = formatDateDisplay(data.workDate);
    const reason = data.rejectReason || data.reject_reason || '';
    await createNotification({
      empId,
      type: 'OT_STATUS',
      title: 'Đơn đăng ký tăng ca (OT) bị từ chối',
      content: `Đơn đăng ký tăng ca (OT) ngày ${dateStr} của bạn đã bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`,
      referenceId: data.requestId,
      metadata: { targetPage: 'shifts', targetTab: 'ot-requests' }
    });
  },

  // 8. Phê duyệt đơn giải trình -> Báo cho nhân viên nộp đơn
  'ADJUSTMENT_REQUEST_APPROVED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const dateStr = formatDateDisplay(data.workDate);
    await createNotification({
      empId,
      type: 'ATTENDANCE_ALERT',
      title: 'Đơn giải trình chấm công đã được phê duyệt',
      content: `Đơn giải trình chấm công ngày ${dateStr} của bạn đã được phê duyệt.`,
      referenceId: data.adjustmentId || data.requestId,
      metadata: { targetPage: 'leaves', targetTab: 'my-requests' }
    });
  },

  // 9. Từ chối đơn giải trình -> Báo cho nhân viên nộp đơn
  'ADJUSTMENT_REQUEST_REJECTED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id;
    const dateStr = formatDateDisplay(data.workDate);
    const reason = data.rejectReason || data.reject_reason || '';
    await createNotification({
      empId,
      type: 'ATTENDANCE_ALERT',
      title: 'Đơn giải trình chấm công bị từ chối',
      content: `Đơn giải trình chấm công ngày ${dateStr} của bạn đã bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`,
      referenceId: data.adjustmentId || data.requestId,
      metadata: { targetPage: 'leaves', targetTab: 'my-requests' }
    });
  },

  // 10. Phân ca làm việc mới -> Báo cho các nhân viên được xếp ca
  'SHIFT_ASSIGNED': async (event) => {
    const data = event.data || event;
    const empIds = Array.isArray(data.empIds) ? data.empIds : (data.empId ? [data.empId] : []);
    const workDates = Array.isArray(data.workDates) ? data.workDates : (data.workDate ? [data.workDate] : []);
    const datesSummary = formatDateSummary(workDates);
    const shiftName = data.shiftName || 'tiêu chuẩn';

    for (const empId of empIds) {
      await createNotification({
        empId,
        type: 'SHIFT_ASSIGNED',
        title: 'Bạn có lịch phân ca làm việc mới',
        content: `Bạn đã được xếp ca làm việc mới ${shiftName} cho ${datesSummary}.`,
        referenceId: data.shiftId || null,
        metadata: { targetPage: 'shifts', targetTab: 'schedule' }
      });
    }
  },

  // 11. Cảnh báo đi muộn
  'ATTENDANCE_LATE': async (event) => {
    const data = event.data || event;
    await createNotification({
      empId: data.empId,
      type: 'ATTENDANCE_ALERT',
      title: 'Cảnh báo đi muộn',
      content: `Bạn đã check-in muộn ${data.lateMinutes} phút vào ngày ${formatDateDisplay(data.workDate)}.`,
      referenceId: data.attendanceId,
      metadata: { targetPage: 'my-attendance' }
    });
  },

  // 12. Phát hành bảng lương
  'PAYSLIP_PUBLISHED': async (event) => {
    const data = event.data || event;
    await createNotification({
      targetRole: 'EMPLOYEE',
      type: 'PAYROLL',
      title: `Phiếu lương tháng ${data.month}/${data.year} đã phát hành`,
      content: `Bảng lương kỳ ${data.month}/${data.year} đã được chốt. Vui lòng kiểm tra mục Phiếu lương.`,
      referenceId: data.periodId,
      metadata: { targetPage: 'payroll' }
    });
  },

  // 13. Phê duyệt tiếp nhận / phân bổ phòng ban cho nhân sự
  'EMPLOYEE_DEPARTMENT_ASSIGNED': async (event) => {
    const data = event.data || event;
    const empId = data.empId || data.emp_id || data.id || data.userId || null;
    const deptName = data.departmentName || data.department || data.deptName || 'phòng ban mới';
    const title = data.title || 'Tiếp nhận vào phòng ban thành công';
    const content = data.content || data.message || `Bạn đã được tiếp nhận và phân bổ vào ${deptName}. Chúc bạn làm việc hiệu quả!`;

    if (empId) {
      await createNotification({
        empId,
        type: 'SYSTEM',
        title,
        content,
        referenceId: data.departmentId || null,
        metadata: {
          targetPage: 'profile',
          departmentId: data.departmentId || null,
          departmentName: deptName
        }
      });
    }
  },

  // Aliases đảm bảo tương thích các chuẩn tên sự kiện
  'LEAVE_APPROVED': async (event) => eventHandlers['LEAVE_REQUEST_APPROVED'](event),
  'OT_APPROVED': async (event) => eventHandlers['OT_REQUEST_APPROVED'](event),
  'ADJUSTMENT_APPROVED': async (event) => eventHandlers['ADJUSTMENT_REQUEST_APPROVED'](event)
};

const app = createServiceApp(SERVICE_NAME, {
  port: PORT,
  checkHealth: async () => {
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      return rows && rows[0]?.ok === 1;
    } catch {
      return false; // In-memory fallback mode
    }
  }
});

// Endpoint nhận Webhook Event Bus
app.use(['/events', '/events/webhook'], events.createWebhookRouter(eventHandlers));

// API lấy danh sách thông báo của người dùng đang đăng nhập (SCR_NOTIF_01)
app.get(
  ['/api/v1/notifications/my', '/api/v1/notifications', '/api/notifications', '/api/notification'],
  requireAuth(),
  async (req, res, next) => {
    try {
      const empId = getEmpIdFromReq(req);
      const userId = req.user?.userId || req.user?.id || req.headers['x-user-id'] || null;
      const role = getRoleFromReq(req);
      const data = await getNotificationsForUser({ empId, userId, role });
      const unreadCount = data.filter((n) => !n.is_read).length;
      res.json({
        success: true,
        data,
        unreadCount,
        total: data.length
      });
    } catch (err) {
      next(err);
    }
  }
);

// Đánh dấu đã đọc tất cả thông báo
const markAllPaths = [
  '/api/v1/notifications/read-all',
  '/api/v1/notifications/my/read-all',
  '/api/notifications/read-all',
  '/api/notifications/my/read-all'
];

app.patch(markAllPaths, requireAuth(), async (req, res, next) => {
  try {
    const empId = getEmpIdFromReq(req);
    const userId = req.user?.userId || req.user?.id || req.headers['x-user-id'] || null;
    const role = getRoleFromReq(req);
    await markAllNotificationsAsRead({ empId, userId, role });
    res.json({ success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
  } catch (err) {
    next(err);
  }
});

app.put(markAllPaths, requireAuth(), async (req, res, next) => {
  try {
    const empId = getEmpIdFromReq(req);
    const userId = req.user?.userId || req.user?.id || req.headers['x-user-id'] || null;
    const role = getRoleFromReq(req);
    await markAllNotificationsAsRead({ empId, userId, role });
    res.json({ success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
  } catch (err) {
    next(err);
  }
});

// Đánh dấu đã đọc 1 thông báo
app.patch(
  ['/api/v1/notifications/:id/read', '/api/notifications/:id/read', '/api/v1/notifications/:id'],
  requireAuth(),
  async (req, res, next) => {
    try {
      await markNotificationAsRead(req.params.id);
      res.json({ success: true, message: 'Đã đánh dấu đã đọc' });
    } catch (err) {
      next(err);
    }
  }
);

// Endpoint tạo thông báo nội bộ / trực tiếp
app.post(
  ['/api/v1/notifications', '/api/notifications', '/internal/notifications'],
  requireAuth(),
  async (req, res, next) => {
    try {
      const { empId, targetRole, type, title, content, referenceId, metadata } = req.body || {};
      if (!title || !content) {
        return res.status(400).json({ success: false, error: 'Thiếu title hoặc content' });
      }
      const record = await createNotification({ empId, targetRole, type, title, content, referenceId, metadata });
      res.status(201).json({ success: true, data: record });
    } catch (err) {
      next(err);
    }
  }
);

app.useErrorHandler();

const server = app.start(PORT, () => {
  try {
    registrar.register({
      name: SERVICE_NAME,
      port: PORT,
      host: 'localhost',
      prefix: '/api/v1/notifications'
    });
  } catch (err) {
    console.warn(`[${SERVICE_NAME}] Không thể đăng ký với Service Registry:`, err.message);
  }

  // Đăng ký nhận sự kiện từ Event Bus
  setTimeout(async () => {
    try {
      await events.subscribe(
        Object.keys(eventHandlers),
        `http://localhost:${PORT}/events`,
        { serviceName: SERVICE_NAME }
      );
    } catch (err) {
      console.warn(`[${SERVICE_NAME}] Không thể subscribe Event Bus:`, err.message);
    }
  }, 1500);
});

module.exports = {
  app,
  server,
  createNotification,
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  eventHandlers,
  memoryNotifications
};
