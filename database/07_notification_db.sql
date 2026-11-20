-- ==============================================================================
-- DATABASE: htqlns_notification
-- Phân hệ 5: Quản lý Thông báo & Cảnh báo (Notification Service)
-- Wireframe Figma: SCR_NOTIF_01
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS htqlns_notification
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE htqlns_notification;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  emp_id VARCHAR(36) NULL COMMENT 'ID người nhận (NULL nếu gửi broadcast theo role)',
  target_role VARCHAR(30) NULL COMMENT 'Vai trò nhận thông báo (ADMIN, HR, MANAGER, EMPLOYEE)',
  type VARCHAR(50) NOT NULL DEFAULT 'SYSTEM' COMMENT 'Loại thông báo (ATTENDANCE_ALERT, LEAVE_STATUS, OT_STATUS, SHIFT_ASSIGNED, PAYROLL, SYSTEM)',
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  reference_id VARCHAR(36) NULL COMMENT 'ID đối tượng liên quan (đơn nghỉ, phiếu lương...)',
  metadata TEXT NULL COMMENT 'Dữ liệu điều hướng mở rộng (targetPage, targetTab, filterStatus...)',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_emp (emp_id),
  INDEX idx_notif_role (target_role),
  INDEX idx_notif_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;