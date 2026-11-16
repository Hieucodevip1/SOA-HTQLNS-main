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
  let fullName = user.username;
  let empCode = null;
  let deptName = null;

  if (useDb && user.emp_id) {
    try {
      const empRows = await db.query(
        `SELECT e.code, e.full_name, d.name AS dept_name 
         FROM htqlns_organization.employees e 
         LEFT JOIN htqlns_organization.departments d ON e.department_id = d.id 
         WHERE e.id = ? LIMIT 1`,
        [user.emp_id]
      );
      if (empRows.length > 0) {
        fullName = empRows[0].full_name;
        empCode = empRows[0].code;
        deptName = empRows[0].dept_name;
      }
    } catch (e) {}
  }

  if (!empCode) {
    if (user.username === 'admin') { fullName = 'Nguyễn Quản Trị (Admin)'; empCode = 'EMP001'; deptName = 'Ban Giám Đốc'; }
    else if (user.username === 'manager') { fullName = 'Nguyễn Thanh Lâm'; empCode = 'NV-QL01'; deptName = 'Phòng Kỹ Thuật'; }
    else if (user.username === 'employee') { fullName = 'Vũ Đức Hiếu'; empCode = 'NV-001'; deptName = 'Phòng Kỹ Thuật'; }
    else if (user.username === 'hr_admin') { fullName = 'Trần Thị Thu Hà (HR)'; empCode = 'EMP002'; deptName = 'Phòng Nhân sự'; }
  }

  return {
    id: user.id,
    empId: user.emp_id,
    empCode,
    username: user.username,
    fullName,
    deptName,
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
    const demoMemoryAllowed = process.env.ALLOW_MEMORY_FALLBACK === 'true' &&
      env.NODE_ENV !== 'production';
    return demoMemoryAllowed ? true : isDbAvailable();
  }
});

// Never trust a client-supplied x-user header. Authorize using a signed JWT.
app.use((req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      req.user = jwt.verifyToken(authHeader.slice(7).trim());
    } catch {
      // Public endpoints remain public; protected handlers reject missing req.user.
      req.user = null;
    }
  }
  next();
});

// ==============================================================================
// Never silently replace MySQL records with hard-coded demo data.
app.use('/api', async (req, res, next) => {
  const demoMemoryAllowed = process.env.ALLOW_MEMORY_FALLBACK === 'true' &&
    process.env.NODE_ENV !== 'production';
  if (demoMemoryAllowed || await isDbAvailable()) return next();
  return res.status(503).json({
    success: false, code: 'DATABASE_UNAVAILABLE',
    error: 'Không thể kết nối MySQL. Hệ thống không sử dụng dữ liệu mẫu thay thế.'
  });
});

// 1. ENDPOINT: Đăng ký tài khoản (POST /api/auth/register)
// ==============================================================================
app.post('/api/auth/register', async (req, res) => {
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

    // Public registration must never grant privileged roles.
    const allowedRoles = ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'];
    if (role && !allowedRoles.includes(role)) {
      return badRequest(res, 'Vai trò không hợp lệ');
    }
    if (role && role !== 'EMPLOYEE' && req.user?.role !== 'ADMIN') {
      return forbidden(res, 'Chỉ ADMIN được cấp vai trò đặc quyền khi đăng ký');
    }
    const assignedRole = req.user?.role === 'ADMIN' ? (role || 'EMPLOYEE') : 'EMPLOYEE';

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
    let finalEmpId = req.user?.role === 'ADMIN' ? (emp_id || null) : null;
    let finalFullName = `${first_name || ''} ${last_name || ''}`.trim() || username;
    // Biometric enrollment requires a verified assertion. A form boolean is not proof.
    const isBiometric = false;

    const useDb = await isDbAvailable();
    if (useDb) {
      // MySQL transactions span both schemas on the same server. Prevent an
      // orphan employee or a user with an invalid employee reference on failure.
      try {
        await db.withTransaction(async (connection) => {
          if (finalEmpId) {
            const [matching] = await connection.query(
              'SELECT id, full_name FROM htqlns_organization.employees WHERE id = ? LIMIT 1',
              [finalEmpId]
            );
            if (!matching.length) {
              const e = new Error('Không tìm thấy hồ sơ nhân viên để liên kết');
              e.status = 400;
              throw e;
            }
            finalFullName = matching[0].full_name;
          } else {
            const [existing] = await connection.query(
              'SELECT id, full_name FROM htqlns_organization.employees WHERE email = ? LIMIT 1 FOR UPDATE',
              [email]
            );
            if (existing.length) {
              if (req.user?.role !== 'ADMIN') {
                const e = new Error('Email này đã có hồ sơ nhân sự. Liên hệ ADMIN để liên kết tài khoản.');
                e.status = 403;
                throw e;
              }
              finalEmpId = existing[0].id;
              finalFullName = existing[0].full_name;
            } else {
              finalEmpId = crypto.randomUUID();
              finalFullName = `${first_name || username} ${last_name || ''}`.trim();
              const empCode = 'EMP_' + finalEmpId.slice(0, 12).toUpperCase();
              await connection.query(
                `INSERT INTO htqlns_organization.employees
                 (id, code, full_name, email, phone, department_id, join_date, contract_type, status)
                 VALUES (?, ?, ?, ?, ?, NULL, CURDATE(), 'OFFICIAL', 'ACTIVE')`,
                [finalEmpId, empCode, finalFullName, email, phone || null]
              );
            }
          }

          await connection.query(
            `INSERT INTO users
             (id, emp_id, username, email, password_hash, role, biometric_enabled, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
            [userId, finalEmpId, username, email, passwordHash, assignedRole, isBiometric]
          );
        }, DB_NAME);
      } catch (err) {
        if (err.status === 403) return forbidden(res, err.message);
        if (err.status === 400) return badRequest(res, err.message);
        if (err.code === 'ER_DUP_ENTRY') return conflict(res, 'Username, email hoặc mã nhân viên đã tồn tại');
        throw err;
      }
    } else {
      memoryUsers.set(userId, {
        id: userId, emp_id: finalEmpId, username, email,
        password_hash: passwordHash, role: assignedRole,
        biometric_enabled: isBiometric, status: 'ACTIVE'
      });
    }

    // Bắn sự kiện user.registered lên Event Bus
    events.publish('user.registered', {
      userId,
      empId: finalEmpId,
      username,
      email,
      role: assignedRole
    }, { source: 'auth-service' });

    return created(res, {
      id: userId,
      emp_id: finalEmpId,
      username,
      fullName: finalFullName,
      email,
      role: assignedRole
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

    // A client boolean is not biometric proof: a password is mandatory until
    // a server-verified WebAuthn assertion flow is implemented.
    if (!username || !password) {
      return badRequest(res, 'Vui lòng cung cấp tên đăng nhập và mật khẩu');
    }

    const user = await findUserByLogin(username);
    if (!user) {
      return unauthorized(res, 'Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    if (user.status !== 'ACTIVE') {
      return forbidden(res, `Tài khoản của bạn đang ở trạng thái: ${user.status}`);
    }

    // Do not allow biometric=true to skip credential verification.
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return unauthorized(res, 'Tên đăng nhập hoặc mật khẩu không chính xác');
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
app.get('/api/auth/me', async (req, res) => {
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
// 7–8. Khôi phục mật khẩu OTP với email thực (Resend HTTP API, không cần thêm dependency).
// RESEND_API_KEY và OTP_SENDER_EMAIL phải được cấu hình ngoài Git.
// Tuyệt đối không phát OTP lên Event Bus hay ghi vào log.
const otpAttemptBuckets = new Map();
function otpDigest(userId, code) {
  return crypto.createHmac('sha256', process.env.OTP_HASH_SECRET || env.JWT_SECRET)
    .update(String(userId) + ':' + String(code)).digest('hex').slice(0, 10);
}
function resetBucketKey(email) { return String(email || '').trim().toLowerCase(); }
function otpAttemptsAvailable(email) {
  const key = resetBucketKey(email);
  const now = Date.now();
  if (otpAttemptBuckets.size > 10000) otpAttemptBuckets.clear();
  const bucket = otpAttemptBuckets.get(key);
  if (!bucket || bucket.until <= now) {
    otpAttemptBuckets.set(key, { attempts: 0, until: now + 15 * 60 * 1000 });
    return true;
  }
  return bucket.attempts < 5;
}
function bumpOtpAttempt(email) {
  const key = resetBucketKey(email);
  const bucket = otpAttemptBuckets.get(key);
  if (bucket) bucket.attempts++;
}
function hasOtpMailer() {
  return Boolean(process.env.RESEND_API_KEY && process.env.OTP_SENDER_EMAIL);
}
async function sendOtpEmail(email, code) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.OTP_SENDER_EMAIL,
      to: [email],
      subject: 'HTQLNS - Ma xac thuc dat lai mat khau',
      text: 'Ma OTP cua ban: ' + code + '\nMa het han sau 15 phut. Khong chia se ma voi bat ky ai.'
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Email provider rejected OTP delivery (' + response.status + ')');
}

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return badRequest(res, 'Địa chỉ email không hợp lệ');
    }
    if (!hasOtpMailer()) {
      return res.status(503).json({ success: false, code: 'OTP_EMAIL_NOT_CONFIGURED',
        error: 'Chức năng khôi phục mật khẩu qua email chưa được cấu hình bởi quản trị viên' });
    }

    // Generic response prevents account discovery.
    const generic = 'Nếu email tồn tại trong hệ thống, hướng dẫn khôi phục sẽ được gửi';
    const user = await findUserByLogin(email);
    if (!user) return success(res, null, 200, generic);

    const code = String(crypto.randomInt(100000, 1000000));
    const hash = otpDigest(user.id, code);
    const expiresAt = new Date(Date.now() + 15 * 60000);
    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query('UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?',
        [hash, expiresAt, user.id], DB_NAME);
    } else {
      user.otp_code = hash;
      user.otp_expires_at = expiresAt;
    }
    try {
      await sendOtpEmail(user.email, code);
    } catch (emailErr) {
      // Revoke any undelivered code. Never return success for a known failed delivery.
      if (useDb) await db.query('UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = ?',
        [user.id], DB_NAME);
      else { user.otp_code = null; user.otp_expires_at = null; }
      console.error('[AUTH] OTP email delivery failed:', emailErr.message);
      return res.status(503).json({ success: false, code: 'OTP_EMAIL_DELIVERY_FAILED',
        error: 'Không thể gửi email lúc này; vui lòng thử lại sau' });
    }
    otpAttemptBuckets.delete(resetBucketKey(email));
    return success(res, null, 200, generic);
  } catch (err) {
    return error(res, 'Không thể xử lý yêu cầu khôi phục mật khẩu');
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const otpCode = String(req.body?.otpCode ?? '');
    const newPassword = req.body?.newPassword;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^\d{6}$/.test(otpCode) || typeof newPassword !== 'string' || newPassword.length < 8) {
      return badRequest(res, 'Yêu cầu email, OTP 6 chữ số và mật khẩu mới từ 8 ký tự');
    }
    if (!otpAttemptsAvailable(email)) {
      return res.status(429).json({ success: false, error: 'Thử OTP quá nhiều lần, vui lòng đợi 15 phút' });
    }
    const user = await findUserByLogin(email);
    if (!user || !user.otp_code || !user.otp_expires_at ||
        new Date(user.otp_expires_at).getTime() < Date.now()) {
      bumpOtpAttempt(email);
      return badRequest(res, 'Mã OTP không hợp lệ hoặc đã hết hạn');
    }
    const expected = Buffer.from(otpDigest(user.id, otpCode), 'utf8');
    const stored = Buffer.from(String(user.otp_code), 'utf8');
    if (stored.length !== expected.length || !crypto.timingSafeEqual(stored, expected)) {
      bumpOtpAttempt(email);
      return badRequest(res, 'Mã OTP không hợp lệ hoặc đã hết hạn');
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query('UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires_at = NULL WHERE id = ?',
        [newHash, user.id], DB_NAME);
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [user.id], DB_NAME);
    } else {
      user.password_hash = newHash;
      user.otp_code = null;
      user.otp_expires_at = null;
    }
    otpAttemptBuckets.delete(resetBucketKey(email));
    return success(res, null, 200, 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.');
  } catch (err) {
    return error(res, 'Không thể đặt lại mật khẩu');
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
// Admin mutations must protect the acting account and the final active administrator.
async function readManagedUser(id) {
  if (await isDbAvailable()) {
    const rows = await db.query('SELECT id, role, status FROM users WHERE id = ? LIMIT 1', [id], DB_NAME);
    return rows[0] || null;
  }
  return memoryUsers.get(id) || null;
}

async function isLastActiveAdmin(target) {
  if (!target || target.role !== 'ADMIN' || target.status !== 'ACTIVE') return false;
  if (await isDbAvailable()) {
    const rows = await db.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'", [], DB_NAME
    );
    return Number(rows[0]?.total || 0) <= 1;
  }
  return [...memoryUsers.values()].filter(u => u.role === 'ADMIN' && u.status === 'ACTIVE').length <= 1;
}

function isSameActor(req, targetId) {
  return String(req.user?.userId || req.user?.id || '') === String(targetId);
}

// 10. QUẢN TRỊ TÀI KHOẢN (ADMIN / HR)
// ==============================================================================
app.get('/api/auth/users', async (req, res) => {
  try {
    const currentUser = req.user;
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
    if (isSameActor(req, targetId)) {
      return badRequest(res, 'Không được tự thay đổi vai trò quản trị của chính mình');
    }
    const target = await readManagedUser(targetId);
    if (!target) return notFound(res, 'Tài khoản không tồn tại');
    if (role !== 'ADMIN' && await isLastActiveAdmin(target)) {
      return conflict(res, 'Không thể hạ quyền quản trị viên đang hoạt động cuối cùng');
    }

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
    if (isSameActor(req, targetId)) {
      return badRequest(res, 'Không thể tự khóa hoặc ngừng tài khoản quản trị của mình');
    }
    const target = await readManagedUser(targetId);
    if (!target) return notFound(res, 'Tài khoản không tồn tại');
    if (newStatus !== 'ACTIVE' && await isLastActiveAdmin(target)) {
      return conflict(res, 'Không được khóa quản trị viên đang hoạt động cuối cùng');
    }

    if (!['ACTIVE', 'INACTIVE', 'LOCKED'].includes(newStatus)) {
      return badRequest(res, 'Trạng thái không hợp lệ');
    }

    const useDb = await isDbAvailable();
    if (useDb) {
      await db.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, targetId], DB_NAME);
      if (newStatus !== 'ACTIVE') {
        await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [targetId], DB_NAME);
      }
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
    if (isSameActor(req, targetId)) {
      return badRequest(res, 'Bạn không thể tự xóa tài khoản của chính mình');
    }

    const target = await readManagedUser(targetId);
    if (!target) return notFound(res, 'Tài khoản không tồn tại');
    if (await isLastActiveAdmin(target)) {
      return conflict(res, 'Không thể xóa quản trị viên đang hoạt động cuối cùng');
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
});

module.exports = { app, server };
