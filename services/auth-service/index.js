/**
 * services/auth-service/index.js
 * Auth Service – Dịch vụ Quản trị Tài khoản, Xác thực & Cấp phát Quyền (HTQLNS)
 * Cổng: 3001 | Database: htqlns_auth
 * Thiết kế theo Wireframe Figma: SCR_AUTH_01, SCR_AUTH_02, SCR_USER_01
 */

require('../../shared/env');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../../shared/env');
const db = require('../../shared/db');
const jwt = require('../../shared/jwt');
const { createServiceApp, requireAuth } = require('../../shared/service-base');
const { registerService } = require('../../shared/registrar');
const events = require('../../shared/events');
const {
  success,
  created,
  error,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict
} = require('../../shared/httpx');
const { createOpenApiSpec } = require('../../shared/openapi');

const PORT = Number(process.env.AUTH_PORT || 3001);
const DB_NAME = 'htqlns_auth';

// Bộ nhớ đệm dự phòng (In-memory fallback) cho trường hợp MySQL chưa sẵn sàng
const memoryUsers = new Map([
  [
    'u0000001-0000-0000-0000-000000000001',
    {
      id: 'u0000001-0000-0000-0000-000000000001',
      emp_id: 'e0000001-0000-0000-0000-000000000001',
      username: 'admin',
      email: 'admin@htqlns.com',
      password_hash: '$2b$10$PQamOicewwkn1d/5hgvrAOjqBkFsP0TvODArgghPL5fVmXVvqlvy6', // 123456
      role: 'ADMIN',
      biometric_enabled: true,
      status: 'ACTIVE'
    }
  ],
  [
    'u0000001-0000-0000-0000-000000000002',
    {
      id: 'u0000001-0000-0000-0000-000000000002',
      emp_id: 'e0000001-0000-0000-0000-000000000002',
      username: 'hr_admin',
      email: 'hr@htqlns.com',
      password_hash: '$2b$10$PQamOicewwkn1d/5hgvrAOjqBkFsP0TvODArgghPL5fVmXVvqlvy6',
      role: 'HR',
      biometric_enabled: false,
      status: 'ACTIVE'
    }
  ],
  [
    'u0000001-0000-0000-0000-000000000003',
    {
      id: 'u0000001-0000-0000-0000-000000000003',
      emp_id: 'e0000001-0000-0000-0000-000000000003',
      username: 'manager',
      email: 'manager@htqlns.com',
      password_hash: '$2b$10$PQamOicewwkn1d/5hgvrAOjqBkFsP0TvODArgghPL5fVmXVvqlvy6',
      role: 'MANAGER',
      biometric_enabled: false,
      status: 'ACTIVE'
    }
  ],
  [
    'u0000001-0000-0000-0000-000000000004',
    {
      id: 'u0000001-0000-0000-0000-000000000004',
      emp_id: 'e0000001-0000-0000-0000-000000000004',
      username: 'employee',
      email: 'employee@htqlns.com',
      password_hash: '$2b$10$PQamOicewwkn1d/5hgvrAOjqBkFsP0TvODArgghPL5fVmXVvqlvy6',
      role: 'EMPLOYEE',
      biometric_enabled: true,
      status: 'ACTIVE'
    }
  ]
]);

const memoryRefreshTokens = new Map();

// Helper kiểm tra kết nối DB
async function isDbAvailable() {
  try {
    await db.query('SELECT 1', [], DB_NAME);
    return true;
  } catch {
    return false;
  }
}

// Helper lấy user theo username hoặc email
async function findUserByLogin(login) {
  const useDb = await isDbAvailable();
  if (useDb) {
    const rows = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
      [login, login],
      DB_NAME
    );
    return rows[0] || null;
  }

  for (const u of memoryUsers.values()) {
    if (u.username === login || u.email === login) return { ...u };
  }
  return null;
}

// Helper bổ sung thông tin hồ sơ nhân sự cho user
async function enrichUserProfile(user, useDb) {
  let fullName = user.full_name || user.fullName || user.username;
  let empCode = null;
  let deptName = null;
  let departmentId = null;
  let managerId = null;
  let position = user.position || null;

  if (useDb) {
    try {
      const empRows = await db.query(
        `SELECT e.id, e.code, e.full_name, e.department_id, e.manager_id, e.position_id, e.status, d.name AS dept_name, p.title AS position_title 
         FROM htqlns_organization.employees e 
         LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id 
         LEFT JOIN htqlns_organization.positions p ON e.position_id = p.id
         WHERE (e.id = ? AND ? IS NOT NULL) OR (e.email = ? AND ? IS NOT NULL) OR (e.code = ? AND ? IS NOT NULL) LIMIT 1`,
        [user.emp_id, user.emp_id, user.email, user.email, user.username, user.username]
      );
      if (empRows.length > 0) {
        fullName = empRows[0].full_name || fullName;
        empCode = empRows[0].code;
        deptName = empRows[0].dept_name;
        departmentId = empRows[0].department_id || null;
        managerId = empRows[0].manager_id || null;
        position = empRows[0].position_title || position;
        if (!user.emp_id) {
          user.emp_id = empRows[0].id;
          try {
            await db.query('UPDATE users SET emp_id = ? WHERE id = ?', [empRows[0].id, user.id], DB_NAME);
          } catch {}
        }
      }
    } catch (e) {}
  } else {
    if (user.departmentId || user.departmentName || user.department_id || user.deptName) {
      departmentId = user.departmentId || user.department_id;
      deptName = user.departmentName || user.deptName;
      managerId = user.managerId || user.manager_id;
      position = user.position || user.positionTitle;
    }
  }

  if (deptName === 'Phòng Nhân sự' || (deptName && deptName.includes('Nhân sự') && !deptName.includes('Hành chính'))) {
    deptName = 'Phòng Hành chính Nhân sự';
  }

  if (!deptName && !departmentId) {
    if (user.username === 'admin') { fullName = 'Nguyễn Quản Trị (Admin)'; empCode = 'EMP001'; deptName = 'Ban Giám Đốc'; departmentId = 'd0000001-0000-0000-0000-000000000001'; position = 'Tổng Giám Đốc Điều Hành'; }
    else if (user.username === 'manager') { fullName = 'Nguyễn Thanh Lâm'; empCode = 'NV-QL01'; deptName = 'Phòng Kỹ Thuật'; departmentId = 'd0000001-0000-0000-0000-000000000003'; position = 'Trưởng Nhóm Kỹ Thuật (Tech Lead)'; }
    else if (user.username === 'employee') { fullName = 'Vũ Đức Hiếu'; empCode = 'NV-001'; deptName = 'Phòng Kỹ Thuật'; departmentId = 'd0000001-0000-0000-0000-000000000003'; managerId = 'e0000001-0000-0000-0000-000000000003'; position = 'Kỹ Sư Phần Mềm'; }
    else if (user.username === 'hr_admin') { fullName = 'Trần Thị Thu Hà (HR)'; empCode = 'EMP002'; deptName = 'Phòng Hành chính Nhân sự'; departmentId = 'd0000001-0000-0000-0000-000000000002'; position = 'Trưởng Phòng Nhân Sự'; }
  }

  const isAssigned = Boolean(departmentId || managerId);

  return {
    id: user.id,
    empId: user.emp_id || user.id,
    emp_id: user.emp_id || user.id,
    empCode,
    employeeCode: empCode,
    username: user.username,
    fullName,
    full_name: fullName,
    deptName: deptName || null,
    departmentName: deptName || null,
    department_name: deptName || null,
    department: deptName || null,
    departmentId: departmentId || null,
    department_id: departmentId || null,
    position: position || null,
    positionTitle: position || null,
    position_title: position || null,
    managerId: managerId || null,
    manager_id: managerId || null,
    officeId: null,
    shiftId: null,
    isAssigned,
    email: user.email,
    role: user.role,
    biometricEnabled: Boolean(user.biometric_enabled),
    status: user.status,
    lastLoginAt: user.last_login_at
  };
}

// Khởi tạo Express Service App
const app = createServiceApp('auth-service', {
  port: PORT,
  checkHealth: async () => {
    if (process.env.REQUIRE_DB === 'true') {
      return isDbAvailable();
    }
    return true;
  }
});

// Middleware giải mã thông tin x-user do Gateway forward tới (nếu có)
app.use((req, res, next) => {
  const forwardedUser = req.headers['x-user'];
  if (forwardedUser && !req.user) {
    try {
      req.user = JSON.parse(Buffer.from(forwardedUser, 'base64').toString('utf8'));
    } catch {
      // Bỏ qua nếu lỗi parse
    }
  }
  next();
});

// ==============================================================================
// 1. ENDPOINT: Đăng ký tài khoản (POST /api/auth/register & /api/v1/auth/register)
// ==============================================================================
app.post(['/api/auth/register', '/api/v1/auth/register'], async (req, res) => {
  try {
    const { username, email, password, role, emp_id, biometric_enabled, first_name, last_name, phone } = req.body;

    if (!username || !email || !password) {
      return badRequest(res, 'Vui lòng cung cấp đầy đủ: username, email và password');
    }

    if (username.length < 3) {
      return badRequest(res, 'Tên đăng nhập phải có ít nhất 3 ký tự');
    }

    if (password.length < 6) {
      return badRequest(res, 'Mật khẩu phải có độ dài tối thiểu 6 ký tự');
    }

    // Bảo mật: Đăng ký công khai không thể tự cấp quyền ADMIN
    let assignedRole = 'EMPLOYEE';
    if (req.user && ['ADMIN', 'HR'].includes(req.user.role)) {
      assignedRole = role || 'EMPLOYEE';
    } else if (role && role !== 'ADMIN') {
      assignedRole = role;
    }

    const existingUser = await findUserByLogin(username);
    if (existingUser) {
      return conflict(res, 'Tên đăng nhập đã tồn tại trong hệ thống');
    }

    const existingEmail = await findUserByLogin(email);
    if (existingEmail) {
      return conflict(res, 'Địa chỉ email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    let finalEmpId = emp_id || null;
    let finalFullName = `${first_name || ''} ${last_name || ''}`.trim() || username;
    const isBiometric = Boolean(biometric_enabled);

    const useDb = await isDbAvailable();
    if (useDb) {
      if (!finalEmpId) {
        try {
          const empRows = await db.query('SELECT id, full_name FROM htqlns_organization.employees WHERE email = ? LIMIT 1', [email]);
          if (empRows.length > 0) {
            finalEmpId = empRows[0].id;
            finalFullName = empRows[0].full_name;
          } else {
            finalEmpId = crypto.randomUUID();
            const fName = first_name || username;
            const lName = last_name || (assignedRole === 'MANAGER' ? '(Quản lý)' : '(Nhân viên)');
            finalFullName = `${fName} ${lName}`.trim();
            const empCode = 'EMP_' + Math.floor(10000 + Math.random() * 90000);

            // Mặc định ban đầu khi đăng ký: KHÔNG thuộc phòng ban/quản lý nào (department_id = NULL, manager_id = NULL)
            await db.query(
              `INSERT INTO htqlns_organization.employees 
               (id, code, full_name, email, phone, department_id, manager_id, join_date, contract_type, status)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, CURDATE(), 'PROBATION', 'PENDING_ASSIGNMENT')`,
              [finalEmpId, empCode, finalFullName, email, phone || '0911223344']
            );
          }
        } catch (e) {
          console.warn('[AUTH] Tự động tạo hồ sơ nhân sự organization:', e.message);
        }
      }

      await db.query(
        `INSERT INTO users (id, emp_id, username, email, password_hash, role, biometric_enabled, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [userId, finalEmpId, username, email, passwordHash, assignedRole, isBiometric],
        DB_NAME
      );
    } else {
      finalEmpId = finalEmpId || crypto.randomUUID();
      memoryUsers.set(userId, {
        id: userId,
        emp_id: finalEmpId,
        username,
        email,
        full_name: finalFullName,
        password_hash: passwordHash,
        role: assignedRole,
        biometric_enabled: isBiometric,
        status: 'ACTIVE',
        departmentId: null,
        departmentName: null,
        managerId: null,
        officeId: null,
        shiftId: null,
        isAssigned: false
      });
    }

    // Bắn sự kiện user.registered lên Event Bus
    events.publish('user.registered', {
      userId,
      empId: finalEmpId,
      username,
      email,
      role: assignedRole,
      fullName: finalFullName
    }, { source: 'auth-service' });

    return created(res, {
      id: userId,
      emp_id: finalEmpId,
      empId: finalEmpId,
      username,
      fullName: finalFullName,
      email,
      role: assignedRole,
      departmentId: null,
      departmentName: null,
      managerId: null,
      officeId: null,
      shiftId: null,
      isAssigned: false
    }, 'Đăng ký tài khoản thành công');
  } catch (err) {
    return error(res, 'Lỗi đăng ký tài khoản: ' + err.message);
  }
});

// ==============================================================================
// 2. ENDPOINT: Đăng nhập hệ thống (POST /api/auth/login)
// ==============================================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, biometric } = req.body;

    if (!username || (!password && !biometric)) {
      return badRequest(res, 'Vui lòng cung cấp thông tin đăng nhập');
    }

    const user = await findUserByLogin(username);
    if (!user) {
      return unauthorized(res, 'Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    if (user.status !== 'ACTIVE') {
      return forbidden(res, `Tài khoản của bạn đang ở trạng thái: ${user.status}`);
    }

    // Kiểm tra mật khẩu (nếu không phải đăng nhập sinh trắc học đã xác thực)
    if (!biometric) {
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return unauthorized(res, 'Tên đăng nhập hoặc mật khẩu không chính xác');
      }
    } else {
      if (!user.biometric_enabled) {
        return forbidden(res, 'Tài khoản chưa kích hoạt xác thực sinh trắc học');
      }
    }

    // Ký JWT Token
    const tokenPayload = {
      userId: user.id,
      empId: user.emp_id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    const token = jwt.signToken(tokenPayload, { expiresIn: env.JWT_EXPIRES_IN });
    const refreshToken = jwt.signRefreshToken({ userId: user.id });

    // Lưu Refresh Token
    const rfId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 86400000);

    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query(
        'INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
        [rfId, user.id, refreshToken, expiresAt],
        DB_NAME
      );
      await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id], DB_NAME);
    } else {
      memoryRefreshTokens.set(refreshToken, {
        id: rfId,
        user_id: user.id,
        token: refreshToken,
        expires_at: expiresAt
      });
    }

    // Bắn sự kiện user.login lên Event Bus
    events.publish('user.login', {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginAt: new Date().toISOString()
    }, { source: 'auth-service' });

    const userProfile = await enrichUserProfile(user, useDb);

    return success(res, {
      token,
      refreshToken,
      user: userProfile
    }, 200, 'Đăng nhập thành công');
  } catch (err) {
    return error(res, 'Lỗi đăng nhập: ' + err.message);
  }
});

// ==============================================================================
// 3. ENDPOINT: Cấp mới Token (POST /api/auth/refresh)
// ==============================================================================
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return badRequest(res, 'Thiếu refreshToken trong payload');
    }

    let decoded;
    try {
      decoded = jwt.verifyToken(refreshToken);
    } catch (e) {
      return unauthorized(res, 'Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const userId = decoded.userId;
    const useDb = await isDbAvailable();

    if (useDb) {
      const rows = await db.query(
        'SELECT * FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL AND expires_at > NOW()',
        [refreshToken],
        DB_NAME
      );
      if (rows.length === 0) {
        return unauthorized(res, 'Refresh token đã bị thu hồi hoặc không tồn tại');
      }
    } else {
      const entry = memoryRefreshTokens.get(refreshToken);
      if (!entry || entry.revoked_at || new Date(entry.expires_at) < new Date()) {
        return unauthorized(res, 'Refresh token không hợp lệ hoặc đã bị hủy');
      }
    }

    let user = null;
    if (useDb) {
      const uRows = await db.query('SELECT * FROM users WHERE id = ?', [userId], DB_NAME);
      user = uRows[0];
    } else {
      user = memoryUsers.get(userId);
    }

    if (!user || user.status !== 'ACTIVE') {
      return forbidden(res, 'Tài khoản không tồn tại hoặc đã bị khóa');
    }

    const newToken = jwt.signToken({
      userId: user.id,
      empId: user.emp_id,
      username: user.username,
      email: user.email,
      role: user.role
    }, { expiresIn: env.JWT_EXPIRES_IN });

    return success(res, { token: newToken }, 200, 'Làm mới Token thành công');
  } catch (err) {
    return error(res, 'Lỗi refresh token: ' + err.message);
  }
});

// ==============================================================================
// 4. ENDPOINT: Lấy thông tin tài khoản hiện tại (GET /api/auth/me)
// ==============================================================================
const getMeHandler = async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser) {
      return unauthorized(res, 'Yêu cầu đăng nhập');
    }

    const user = await findUserByLogin(currentUser.username || currentUser.userId);
    if (!user) {
      return notFound(res, 'Không tìm thấy thông tin tài khoản');
    }

    const useDb = await isDbAvailable();
    const userProfile = await enrichUserProfile(user, useDb);

    return success(res, userProfile);
  } catch (err) {
    return error(res, err.message);
  }
};

app.get('/api/auth/me', getMeHandler);
app.get('/api/v1/auth/me', getMeHandler);

// Endpoint nội bộ đồng bộ dữ liệu nhân viên từ organization-service
app.post('/internal/auth/sync-employee', async (req, res) => {
  try {
    const { id, empId, code, email, fullName, departmentId, departmentName, position, status } = req.body || {};
    const useDb = await isDbAvailable();
    if (useDb) {
      try {
        if (id && (email || code)) {
          await db.query(
            'UPDATE users SET emp_id = ? WHERE (email = ? OR username = ?) AND (emp_id IS NULL OR emp_id = "")',
            [id, email || '', code || ''],
            DB_NAME
          );
        }
      } catch (err) {
        console.warn('[AUTH-SYNC] Lỗi cập nhật DB:', err.message);
      }
    }
    for (const [uid, u] of memoryUsers.entries()) {
      if ((id && (u.emp_id === id || u.id === id)) || (email && u.email === email) || (code && (u.username === code || u.code === code))) {
        if (id) u.emp_id = id;
        if (fullName) u.full_name = fullName;
        if (departmentId) u.departmentId = departmentId;
        if (departmentName) u.departmentName = departmentName;
        if (position) u.position = position;
        if (status) u.status = status;
        u.isAssigned = Boolean(u.departmentId || departmentId);
      }
    }
    return success(res, { synced: true }, 200, 'Đồng bộ thông tin nhân sự thành công');
  } catch (err) {
    return error(res, err.message);
  }
});

// ==============================================================================
// 5. ENDPOINT: Cập nhật cài đặt tài khoản (PUT /api/auth/me)
// ==============================================================================
app.put('/api/auth/me', async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser) return unauthorized(res);

    const { biometric_enabled, email } = req.body;
    const userId = currentUser.userId || currentUser.id;

    const useDb = await isDbAvailable();
    if (useDb) {
      if (biometric_enabled !== undefined) {
        await db.query('UPDATE users SET biometric_enabled = ? WHERE id = ?', [Boolean(biometric_enabled), userId], DB_NAME);
      }
      if (email) {
        await db.query('UPDATE users SET email = ? WHERE id = ?', [email, userId], DB_NAME);
      }
    } else {
      const u = memoryUsers.get(userId);
      if (u) {
        if (biometric_enabled !== undefined) u.biometric_enabled = Boolean(biometric_enabled);
        if (email) u.email = email;
      }
    }

    return success(res, null, 200, 'Cập nhật thông tin thành công');
  } catch (err) {
    return error(res, err.message);
  }
});

// ==============================================================================
// 6. ENDPOINT: Đổi mật khẩu (POST /api/auth/change-password)
// ==============================================================================
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser) return unauthorized(res);

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return badRequest(res, 'Vui lòng nhập mật khẩu cũ và mật khẩu mới');
    }
    if (newPassword.length < 6) {
      return badRequest(res, 'Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const userId = currentUser.userId || currentUser.id;
    let user = null;
    const useDb = await isDbAvailable();

    if (useDb) {
      const rows = await db.query('SELECT * FROM users WHERE id = ?', [userId], DB_NAME);
      user = rows[0];
    } else {
      user = memoryUsers.get(userId);
    }

    if (!user) return notFound(res, 'Tài khoản không tồn tại');

    const match = await bcrypt.compare(oldPassword, user.password_hash);
    if (!match) {
      return badRequest(res, 'Mật khẩu cũ không chính xác');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    if (useDb) {
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId], DB_NAME);
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [userId], DB_NAME);
    } else {
      user.password_hash = newHash;
    }

    return success(res, null, 200, 'Đổi mật khẩu thành công');
  } catch (err) {
    return error(res, err.message);
  }
});

// ==============================================================================
// 7. ENDPOINT: Quên mật khẩu - Cấp OTP (POST /api/auth/forgot-password)
// ==============================================================================
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return badRequest(res, 'Vui lòng cung cấp email');

    const user = await findUserByLogin(email);
    if (!user) {
      // Để bảo mật, không thông báo rõ email không tồn tại
      return success(res, null, 200, 'Nếu email tồn tại trong hệ thống, mã OTP đã được gửi');
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60000); // 15 phút

    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query(
        'UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?',
        [otpCode, expiresAt, user.id],
        DB_NAME
      );
    } else {
      user.otp_code = otpCode;
      user.otp_expires_at = expiresAt;
    }

    // Bắn event để Notification Service gửi email
    events.publish('auth.otp_generated', {
      userId: user.id,
      email: user.email,
      otpCode
    }, { source: 'auth-service' });

    return success(res, { email }, 200, 'Mã xác thực OTP đã được gửi tới email của bạn');
  } catch (err) {
    return error(res, err.message);
  }
});

// ==============================================================================
// 8. ENDPOINT: Đặt lại mật khẩu với OTP (POST /api/auth/reset-password)
// ==============================================================================
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otpCode, newPassword } = req.body;
    if (!email || !otpCode || !newPassword) {
      return badRequest(res, 'Vui lòng cung cấp email, mã OTP và mật khẩu mới');
    }
    if (newPassword.length < 6) {
      return badRequest(res, 'Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const user = await findUserByLogin(email);
    if (!user || user.otp_code !== otpCode || !user.otp_expires_at || new Date(user.otp_expires_at) < new Date()) {
      return badRequest(res, 'Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const useDb = await isDbAvailable();

    if (useDb) {
      await db.query(
        'UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires_at = NULL WHERE id = ?',
        [newHash, user.id],
        DB_NAME
      );
    } else {
      user.password_hash = newHash;
      user.otp_code = null;
      user.otp_expires_at = null;
    }

    return success(res, null, 200, 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập ngay.');
  } catch (err) {
    return error(res, err.message);
  }
});

// ==============================================================================
// 9. ENDPOINT: Đăng xuất (POST /api/auth/logout)
// ==============================================================================
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const currentUser = req.user;

    const useDb = await isDbAvailable();
    if (refreshToken && useDb) {
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = ?', [refreshToken], DB_NAME);
    } else if (currentUser && useDb) {
      const uid = currentUser.userId || currentUser.id;
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [uid], DB_NAME);
    }

    return success(res, null, 200, 'Đăng xuất thành công');
  } catch (err) {
    return error(res, err.message);
  }
});

// ==============================================================================
// 10. QUẢN TRỊ TÀI KHOẢN (ADMIN / HR)
// ==============================================================================
app.get('/api/auth/users', async (req, res) => {
  try {
    let currentUser = req.user;
    if (!currentUser && req.headers['authorization']?.startsWith('Bearer ')) {
      try {
        currentUser = jwt.verifyToken(req.headers['authorization'].slice(7).trim(), env.JWT_SECRET);
      } catch {}
    }

    if (!currentUser || !['ADMIN', 'HR'].includes(currentUser.role)) {
      return forbidden(res, 'Chỉ ADMIN hoặc HR mới có quyền xem danh sách người dùng');
    }

    const useDb = await isDbAvailable();
    let usersList = [];

    if (useDb) {
      usersList = await db.query(
        'SELECT id, emp_id, username, email, role, biometric_enabled, status, last_login_at, created_at FROM users ORDER BY created_at DESC',
        [],
        DB_NAME
      );
    } else {
      usersList = Array.from(memoryUsers.values()).map((u) => ({
        id: u.id,
        emp_id: u.emp_id,
        username: u.username,
        email: u.email,
        fullName: u.full_name || u.fullName || u.username,
        role: u.role,
        biometric_enabled: u.biometric_enabled,
        status: u.status
      }));
    }

    return success(res, usersList);
  } catch (err) {
    return error(res, err.message);
  }
});

// Cập nhật vai trò tài khoản (PUT /api/auth/users/:id/role) - ADMIN
app.put('/api/auth/users/:id/role', async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return forbidden(res, 'Chỉ ADMIN mới có quyền sửa vai trò người dùng');
    }

    const { role } = req.body;
    const targetId = req.params.id;

    if (!['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'].includes(role)) {
      return badRequest(res, 'Vai trò không hợp lệ');
    }

    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query('UPDATE users SET role = ? WHERE id = ?', [role, targetId], DB_NAME);
    } else {
      const u = memoryUsers.get(targetId);
      if (u) u.role = role;
    }

    return success(res, { id: targetId, role }, 200, 'Cập nhật vai trò thành công');
  } catch (err) {
    return error(res, err.message);
  }
});

// Cập nhật trạng thái khóa/mở tài khoản (PUT /api/auth/users/:id/status) - ADMIN
app.put('/api/auth/users/:id/status', async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return forbidden(res, 'Chỉ ADMIN mới có quyền đổi trạng thái người dùng');
    }

    const { status: newStatus } = req.body;
    const targetId = req.params.id;

    if (!['ACTIVE', 'INACTIVE', 'LOCKED'].includes(newStatus)) {
      return badRequest(res, 'Trạng thái không hợp lệ');
    }

    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, targetId], DB_NAME);
    } else {
      const u = memoryUsers.get(targetId);
      if (u) u.status = newStatus;
    }

    return success(res, { id: targetId, status: newStatus }, 200, 'Cập nhật trạng thái thành công');
  } catch (err) {
    return error(res, err.message);
  }
});

// Xóa tài khoản (DELETE /api/auth/users/:id) - ADMIN
app.delete('/api/auth/users/:id', async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return forbidden(res, 'Chỉ ADMIN mới có quyền xóa tài khoản');
    }

    const targetId = req.params.id;
    if (targetId === (currentUser.userId || currentUser.id)) {
      return badRequest(res, 'Bạn không thể tự xóa tài khoản của chính mình');
    }

    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query('DELETE FROM users WHERE id = ?', [targetId], DB_NAME);
    } else {
      memoryUsers.delete(targetId);
    }

    return success(res, { id: targetId }, 200, 'Xóa tài khoản thành công');
  } catch (err) {
    return error(res, err.message);
  }
});

// Tài liệu OpenAPI 3.0 của Auth Service
app.get('/api-docs.json', (req, res) => {
  const spec = createOpenApiSpec('auth-service', {
    description: 'Auth Service – Quản lý Tài khoản & Phân quyền HTQLNS',
    paths: {
      '/api/auth/register': {
        post: { summary: 'Đăng ký tài khoản người dùng mới' }
      },
      '/api/auth/login': {
        post: { summary: 'Đăng nhập hệ thống (Mật khẩu hoặc Sinh trắc học)' }
      },
      '/api/auth/refresh': {
        post: { summary: 'Làm mới Access Token từ Refresh Token' }
      },
      '/api/auth/me': {
        get: { summary: 'Xem thông tin hồ sơ tài khoản hiện tại' }
      }
    }
  });
  res.json(spec);
});

// Webhook lắng nghe sự kiện từ Event Bus
app.use(
  '/events',
  events.createWebhookRouter({
    'employee.deleted': async (event) => {
      const { id, email } = event.data || {};
      const useDb = await isDbAvailable();
      if (useDb) {
        try {
          if (id || email) {
            await db.query('DELETE FROM users WHERE emp_id = ? OR email = ?', [id || null, email || null], DB_NAME);
          }
        } catch (err) {
          console.warn('[AUTH-SERVICE] Lỗi xóa user khi nhận event employee.deleted:', err.message);
        }
      }
      for (const [uid, u] of memoryUsers.entries()) {
        if ((id && u.emp_id === id) || (email && u.email === email)) {
          memoryUsers.delete(uid);
        }
      }
    },
    'employee.updated': async (event) => {
      const { id, empId, code, email, fullName, departmentId, departmentName, position, status } = event.data || {};
      const actualId = id || empId;
      const useDb = await isDbAvailable();
      if (useDb) {
        try {
          if (actualId && (email || code)) {
            await db.query(
              'UPDATE users SET emp_id = ? WHERE (email = ? OR username = ?) AND (emp_id IS NULL OR emp_id = "")',
              [actualId, email || '', code || ''],
              DB_NAME
            );
          }
        } catch (err) {
          console.warn('[AUTH-SERVICE] Lỗi cập nhật user khi nhận event employee.updated:', err.message);
        }
      }
      for (const [uid, u] of memoryUsers.entries()) {
        if ((actualId && (u.emp_id === actualId || u.id === actualId)) || (email && u.email === email) || (code && (u.username === code || u.code === code))) {
          if (actualId) u.emp_id = actualId;
          if (fullName) u.full_name = fullName;
          if (departmentId) u.departmentId = departmentId;
          if (departmentName) u.departmentName = departmentName;
          if (position) u.position = position;
          if (status) u.status = status;
          u.isAssigned = Boolean(u.departmentId || departmentId);
        }
      }
    },
    'employee.onboarded': async (event) => {
      const { id, code, departmentId, departmentName, status } = event.data || {};
      for (const [uid, u] of memoryUsers.entries()) {
        if ((id && (u.emp_id === id || u.id === id)) || (code && (u.username === code || u.code === code))) {
          if (id) u.emp_id = id;
          if (departmentId) u.departmentId = departmentId;
          if (departmentName) u.departmentName = departmentName;
          if (status) u.status = status;
          u.isAssigned = Boolean(u.departmentId || departmentId);
        }
      }
    }
  })
);

// Gắn bộ xử lý lỗi tiêu chuẩn
app.useErrorHandler();

// Khởi chạy server và tự động đăng ký với Registry
const server = app.start(PORT, () => {
  try {
    registerService({
      name: 'auth-service',
      port: PORT,
      url: process.env.SERVICE_URL || `http://localhost:${PORT}`
    });
  } catch (err) {
    console.warn('[AUTH-SERVICE] Không thể đăng ký với Registry:', err.message);
  }

  // Đăng ký nhận sự kiện từ Event Bus
  setTimeout(async () => {
    try {
      await events.subscribe(['employee.deleted', 'employee.updated', 'employee.onboarded'], `http://localhost:${PORT}/events`, {
        serviceName: 'auth-service'
      });
    } catch {}
  }, 2000);
});

module.exports = { app, server };
