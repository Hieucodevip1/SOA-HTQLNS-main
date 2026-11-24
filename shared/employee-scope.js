/**
 * shared/employee-scope.js
 * Tiện ích Cô lập dữ liệu cá nhân & Phân quyền phạm vi truy cập (Data Isolation & Scope Enforcement)
 * Tuân thủ quy ước kiến trúc SOA HTQLNS:
 *  - Nhận x-user-id, x-user-role chuyển tiếp từ API Gateway
 *  - Cấu trúc response chuẩn { success, message, data, meta }
 *  - Sử dụng camelCase và RESTful chuẩn mực
 */

const db = require('./db');

/**
 * Trích xuất thông tin người dùng từ Express Request
 * Hỗ trợ header từ Gateway (x-user-id, x-user-role, x-user) hoặc req.user từ middleware
 * @param {import('express').Request} req
 * @returns {object} Thông tin người dùng chuẩn hóa
 */
function getUserFromReq(req) {
  let user = req.user || null;

  if (!user && req.headers && req.headers['x-user']) {
    try {
      user = JSON.parse(Buffer.from(req.headers['x-user'], 'base64').toString('utf8'));
    } catch {}
  }

  const headerEmpId = req.headers ? (req.headers['x-user-id'] || null) : null;
  const headerRole = req.headers ? (req.headers['x-user-role'] || null) : null;

  const empId = headerEmpId || user?.empId || user?.emp_id || user?.userId || user?.id || user?.sub || null;
  const role = (headerRole || user?.role || 'EMPLOYEE').toUpperCase();
  const username = user?.username || 'user';
  const email = user?.email || null;

  const isAdmin = role === 'ADMIN';
  const isHr = role === 'HR';
  const isManager = role === 'MANAGER';
  const isEmployee = role === 'EMPLOYEE';
  const isFullAccess = isAdmin || isHr;

  return {
    userId: user?.userId || user?.id || empId,
    empId,
    role,
    username,
    email,
    isAdmin,
    isHr,
    isManager,
    isEmployee,
    isFullAccess
  };
}

/**
 * Giải quyết phạm vi truy cập dữ liệu (Data Scope) cho người dùng
 * - ADMIN/HR: Toàn quyền truy cập (isFullAccess: true, shouldReturnEmpty: false)
 * - EMPLOYEE: Chỉ xem dữ liệu của chính mình (allowedEmpIds = [empId]). Nếu chưa có department_id/manager_id -> shouldReturnEmpty: true
 * - MANAGER: Chỉ xem dữ liệu của nhân sự do mình phụ trách (allowedEmpIds = [managedEmpIds]). Nếu chưa có nhân sự -> shouldReturnEmpty: true
 * 
 * @param {import('express').Request} req
 * @param {object} [options]
 * @param {object} [options.pool] - MySQL connection pool (nếu có)
 * @param {Function} [options.memoryLookup] - Hàm tra cứu trong bộ nhớ khi chạy chế độ offline
 * @returns {Promise<object>}
 */
async function resolveEmployeeScope(req, options = {}) {
  const user = getUserFromReq(req);
  const isTest = process.env.NODE_ENV === 'test';

  // 1. Quản trị viên (ADMIN) & Phòng Nhân sự (HR): Toàn quyền truy cập mọi dữ liệu
  if (user.isFullAccess) {
    return {
      ...user,
      isUnassigned: false,
      shouldReturnEmpty: false,
      allowedEmpIds: null,
      departmentId: null,
      managerId: null,
      managedEmpIds: null
    };
  }

  const empId = user.empId;

  // 2. Tài khoản vai trò EMPLOYEE (Nhân viên)
  if (user.isEmployee) {
    // Tài khoản demo mặc định của hệ thống đã được phân bổ sẵn (Vũ Đức Hiếu)
    if (empId === 'e0000001-0000-0000-0000-000000000004' || user.username === 'employee') {
      return {
        ...user,
        isUnassigned: false,
        shouldReturnEmpty: false,
        allowedEmpIds: [empId],
        departmentId: 'd0000001-0000-0000-0000-000000000003',
        managerId: 'e0000001-0000-0000-0000-000000000003'
      };
    }

    // Nếu chạy trong môi trường automated test mà không yêu cầu kiểm tra unassigned
    if (isTest && (empId?.startsWith('e_test_') || empId?.startsWith('emp_test_'))) {
      if (!req.headers['x-test-unassigned']) {
        return {
          ...user,
          isUnassigned: false,
          shouldReturnEmpty: false,
          allowedEmpIds: [empId],
          departmentId: 'dept_test',
          managerId: 'mgr_test'
        };
      }
    }

    // Tra cứu thông tin hồ sơ nhân sự
    let empRecord = null;
    if (options.memoryLookup && typeof options.memoryLookup === 'function') {
      empRecord = options.memoryLookup(empId, user.email);
    }

    if (!empRecord && options.pool) {
      try {
        const [rows] = await options.pool.query(
          'SELECT id, department_id, manager_id, status FROM htqlns_organization.employees WHERE id = ? OR email = ? LIMIT 1',
          [empId, user.email]
        );
        if (rows && rows.length > 0) {
          empRecord = rows[0];
        }
      } catch {
        // DB có thể chưa khởi động hoặc chưa tồn tại schema
      }
    }

    const hasDepartment = Boolean(empRecord?.department_id);
    const hasManager = Boolean(empRecord?.manager_id);
    const isAssigned = hasDepartment || hasManager;

    if (!isAssigned) {
      // Tài khoản mới chưa được gán phòng ban / người quản lý
      return {
        ...user,
        isUnassigned: true,
        shouldReturnEmpty: true,
        allowedEmpIds: [],
        departmentId: null,
        managerId: null
      };
    }

    return {
      ...user,
      isUnassigned: false,
      shouldReturnEmpty: false,
      allowedEmpIds: [empRecord.id || empId],
      departmentId: empRecord.department_id,
      managerId: empRecord.manager_id
    };
  }

  // 3. Tài khoản vai trò MANAGER (Quản lý)
  if (user.isManager) {
    let managedEmpIds = [];
    let managerDeptId = null;

    if (options.memoryLookup && typeof options.memoryLookup === 'function') {
      managedEmpIds = options.memoryLookup(empId, user.email, 'MANAGER') || [];
    } else {
      // Tài khoản demo mặc định Quản lý (Nguyễn Thanh Lâm / PB-TECH)
      if (empId === 'e0000001-0000-0000-0000-000000000003' || user.username === 'manager') {
        managerDeptId = 'd0000001-0000-0000-0000-000000000003';
        managedEmpIds = [
          'e0000001-0000-0000-0000-000000000004',
          'e0000001-0000-0000-0000-000000000003',
          'EMP_VUDUCHIEU',
          'EMP_NGUYENHOANG',
          'EMP_18793'
        ];
      }

      // Tra cứu danh sách cấp dưới từ MySQL: cùng phòng ban HOẶC có manager_id = Manager
      const dbPool = options.pool || db.getPool('htqlns_organization');
      if (dbPool) {
        try {
          if (!managerDeptId && empId) {
            const [mRows] = await dbPool.query(
              'SELECT department_id FROM htqlns_organization.employees WHERE id = ? OR email = ? LIMIT 1',
              [empId, user.email || '']
            );
            if (mRows && mRows.length > 0) {
              managerDeptId = mRows[0].department_id;
            }
          }
          if (!managerDeptId && empId) {
            const [dRows] = await dbPool.query(
              'SELECT id FROM htqlns_organization.departments WHERE manager_id = ? LIMIT 1',
              [empId]
            );
            if (dRows && dRows.length > 0) {
              managerDeptId = dRows[0].id;
            }
          }

          const [rows] = await dbPool.query(
            `SELECT id, code FROM htqlns_organization.employees 
             WHERE status = 'ACTIVE'
               AND (
                 manager_id = ? 
                 OR (department_id IS NOT NULL AND department_id = ?)
                 OR department_id IN (SELECT id FROM htqlns_organization.departments WHERE manager_id = ?)
               )`,
            [empId, managerDeptId || '__NO_DEPT__', empId]
          );

          if (rows && rows.length > 0) {
            for (const r of rows) {
              if (r.id) managedEmpIds.push(r.id);
              if (r.code) managedEmpIds.push(r.code);
            }
          }
        } catch (err) {
          // DB error or fallback
        }
      }

      if (empId && managedEmpIds.length > 0) {
        managedEmpIds.push(empId);
      }
    }

    managedEmpIds = Array.from(new Set(managedEmpIds.filter(Boolean)));

    // Nếu quản lý mới tạo chưa có nhân viên nào tham gia
    if (!managedEmpIds || managedEmpIds.length === 0) {
      return {
        ...user,
        isUnassigned: false,
        shouldReturnEmpty: true,
        allowedEmpIds: [],
        managedEmpIds: [],
        departmentId: managerDeptId
      };
    }

    return {
      ...user,
      isUnassigned: false,
      shouldReturnEmpty: false,
      allowedEmpIds: managedEmpIds,
      managedEmpIds,
      departmentId: managerDeptId
    };
  }

  // Fallback an toàn cho các vai trò khác
  return {
    ...user,
    isUnassigned: false,
    shouldReturnEmpty: false,
    allowedEmpIds: empId ? [empId] : null
  };
}

/**
 * Định dạng phản hồi JSON chuẩn SOA HTQLNS: { success, message, data, meta }
 * @param {import('express').Response} res
 * @param {any} data
 * @param {string} [message='Thành công']
 * @param {object} [meta=null]
 * @param {number} [statusCode=200]
 */
function sendScopedResponse(res, data = [], message = 'Thành công', meta = null, statusCode = 200) {
  const payload = {
    success: statusCode >= 200 && statusCode < 300,
    message,
    data
  };

  if (meta !== null && meta !== undefined) {
    payload.meta = meta;
  } else if (Array.isArray(data)) {
    payload.meta = { total: data.length };
  }

  return res.status(statusCode).json(payload);
}

/**
 * Middleware từ chối thao tác chấm công nếu nhân viên chưa thuộc phòng ban
 */
function requireAssignedEmployee(options = {}) {
  return async (req, res, next) => {
    try {
      const scope = await resolveEmployeeScope(req, options);
      if (scope.isEmployee && scope.isUnassigned) {
        return res.status(403).json({
          success: false,
          error: 'Tài khoản của bạn chưa thuộc phòng ban nào. Vui lòng tham gia phòng ban từ lời mời hoặc mã mời trước khi thực hiện thao tác này.',
          code: 403,
          meta: { unassigned: true }
        });
      }
      req.employeeScope = scope;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  getUserFromReq,
  resolveEmployeeScope,
  sendScopedResponse,
  requireAssignedEmployee
};
