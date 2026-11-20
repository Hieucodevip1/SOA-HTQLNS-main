/**
 * services/organization-service/index.js
 * Organization Service – Quản lý Cơ cấu Tổ chức, Phòng ban & Hồ sơ Nhân sự (HTQLNS)
 * Cổng: 3002 | Database: htqlns_organization
 * Thiết kế theo Wireframe Figma: SCR_ADM_05, SCR_ADM_06, SCR_USER_01
 */

require('../../shared/env');
const crypto = require('crypto');
const env = require('../../shared/env');
const db = require('../../shared/db');
const jwt = require('../../shared/jwt');
const { createServiceApp } = require('../../shared/service-base');
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

const PORT = Number(process.env.ORGANIZATION_PORT || 3002);
const DB_NAME = 'htqlns_organization';

// ==============================================================================
// DỮ LIỆU DỰ PHÒNG TRONG BỘ NHỚ (In-memory fallback khi chưa có MySQL)
// ==============================================================================
const memoryDepartments = new Map([
  [
    'd0000001-0000-0000-0000-000000000001',
    {
      id: 'd0000001-0000-0000-0000-000000000001',
      code: 'PB-BGD',
      name: 'Ban Giám Đốc',
      description: 'Cấp lãnh đạo và điều hành chiến lược',
      manager_id: 'e0000001-0000-0000-0000-000000000001',
      invite_code: 'TEAM-BGD',
      parent_id: null,
      status: 'ACTIVE'
    }
  ],
  [
    'd0000001-0000-0000-0000-000000000002',
    {
      id: 'd0000001-0000-0000-0000-000000000002',
      code: 'PB-HR',
      name: 'Phòng Hành chính Nhân sự',
      description: 'Quản trị nhân sự, tuyển dụng, tính lương và chế độ',
      manager_id: 'e0000001-0000-0000-0000-000000000002',
      invite_code: 'TEAM-HR',
      parent_id: null,
      status: 'ACTIVE'
    }
  ],
  [
    'd0000001-0000-0000-0000-000000000003',
    {
      id: 'd0000001-0000-0000-0000-000000000003',
      code: 'PB-TECH',
      name: 'Phòng Công nghệ & Phần mềm',
      description: 'Phát triển các giải pháp phần mềm và hạ tầng số',
      manager_id: 'e0000001-0000-0000-0000-000000000003',
      invite_code: 'TEAM-TECH',
      parent_id: null,
      status: 'ACTIVE'
    }
  ],
  [
    'd0000001-0000-0000-0000-000000000004',
    {
      id: 'd0000001-0000-0000-0000-000000000004',
      code: 'PB-SALES',
      name: 'Phòng Kinh doanh & Marketing',
      description: 'Phát triển khách hàng và mở rộng thị trường',
      manager_id: null,
      invite_code: 'TEAM-SALES',
      parent_id: null,
      status: 'ACTIVE'
    }
  ]
]);

// Danh sách lời mời tham gia phòng ban (In-memory fallback)
const memoryInvitations = new Map();

const memoryPositions = new Map([
  [
    'p0000001-0000-0000-0000-000000000001',
    {
      id: 'p0000001-0000-0000-0000-000000000001',
      code: 'POS-CEO',
      title: 'Tổng Giám Đốc Điều Hành',
      department_id: 'd0000001-0000-0000-0000-000000000001',
      base_salary_min: 50000000,
      base_salary_max: 100000000,
      status: 'ACTIVE'
    }
  ],
  [
    'p0000001-0000-0000-0000-000000000002',
    {
      id: 'p0000001-0000-0000-0000-000000000002',
      code: 'POS-HRM',
      title: 'Trưởng Phòng Nhân Sự',
      department_id: 'd0000001-0000-0000-0000-000000000002',
      base_salary_min: 20000000,
      base_salary_max: 35000000,
      status: 'ACTIVE'
    }
  ],
  [
    'p0000001-0000-0000-0000-000000000003',
    {
      id: 'p0000001-0000-0000-0000-000000000003',
      code: 'POS-LEAD',
      title: 'Trưởng Nhóm Kỹ Thuật (Tech Lead)',
      department_id: 'd0000001-0000-0000-0000-000000000003',
      base_salary_min: 25000000,
      base_salary_max: 45000000,
      status: 'ACTIVE'
    }
  ],
  [
    'p0000001-0000-0000-0000-000000000004',
    {
      id: 'p0000001-0000-0000-0000-000000000004',
      code: 'POS-DEV',
      title: 'Kỹ Sư Phần Mềm',
      department_id: 'd0000001-0000-0000-0000-000000000003',
      base_salary_min: 12000000,
      base_salary_max: 25000000,
      status: 'ACTIVE'
    }
  ]
]);

const memoryEmployees = new Map([
  [
    'e0000001-0000-0000-0000-000000000001',
    {
      id: 'e0000001-0000-0000-0000-000000000001',
      code: 'EMP001',
      full_name: 'Nguyễn Quản Trị (Admin)',
      email: 'admin@htqlns.com',
      phone: '0901000001',
      gender: 'MALE',
      department_id: 'd0000001-0000-0000-0000-000000000001',
      position_id: 'p0000001-0000-0000-0000-000000000001',
      manager_id: null,
      join_date: '2023-01-01',
      contract_type: 'OFFICIAL',
      status: 'ACTIVE'
    }
  ],
  [
    'e0000001-0000-0000-0000-000000000002',
    {
      id: 'e0000001-0000-0000-0000-000000000002',
      code: 'EMP002',
      full_name: 'Trần Thị Thu Hà (HR Manager)',
      email: 'hr@htqlns.com',
      phone: '0901000002',
      gender: 'FEMALE',
      department_id: 'd0000001-0000-0000-0000-000000000002',
      position_id: 'p0000001-0000-0000-0000-000000000002',
      manager_id: 'e0000001-0000-0000-0000-000000000001',
      join_date: '2023-02-15',
      contract_type: 'OFFICIAL',
      status: 'ACTIVE'
    }
  ],
  [
    'e0000001-0000-0000-0000-000000000003',
    {
      id: 'e0000001-0000-0000-0000-000000000003',
      code: 'EMP003',
      full_name: 'Lê Hoàng Nam (Tech Lead)',
      email: 'manager@htqlns.com',
      phone: '0901000003',
      gender: 'MALE',
      department_id: 'd0000001-0000-0000-0000-000000000003',
      position_id: 'p0000001-0000-0000-0000-000000000003',
      manager_id: 'e0000001-0000-0000-0000-000000000001',
      join_date: '2023-03-01',
      contract_type: 'OFFICIAL',
      status: 'ACTIVE'
    }
  ],
  [
    'e0000001-0000-0000-0000-000000000004',
    {
      id: 'e0000001-0000-0000-0000-000000000004',
      code: 'EMP004',
      full_name: 'Nguyễn Văn An (Developer)',
      email: 'employee@htqlns.com',
      phone: '0901000004',
      gender: 'MALE',
      department_id: 'd0000001-0000-0000-0000-000000000003',
      position_id: 'p0000001-0000-0000-0000-000000000004',
      manager_id: 'e0000001-0000-0000-0000-000000000003',
      join_date: '2024-01-10',
      contract_type: 'OFFICIAL',
      status: 'ACTIVE'
    }
  ]
]);

const memoryAuditLogs = [];

async function isDbAvailable() {
  try {
    await db.query('SELECT 1', [], DB_NAME);
    return true;
  } catch {
    return false;
  }
}

// Khởi tạo Express Service App
const app = createServiceApp('organization-service', {
  port: PORT,
  checkHealth: async () => {
    if (process.env.REQUIRE_DB === 'true') {
      return isDbAvailable();
    }
    return true;
  }
});

// Middleware giải mã thông tin x-user hoặc Authorization Bearer token
app.use((req, res, next) => {
  const forwardedUser = req.headers['x-user'];
  if (forwardedUser && !req.user) {
    try {
      req.user = JSON.parse(Buffer.from(forwardedUser, 'base64').toString('utf8'));
    } catch {}
  }
  if (!req.user && req.headers['authorization']?.startsWith('Bearer ')) {
    try {
      const token = req.headers['authorization'].slice(7).trim();
      req.user = jwt.verifyToken(token);
    } catch {}
  }
  next();
});

// Ghi audit log
async function logAudit(action, actor, resource, resourceId, details, req) {
  const record = {
    id: crypto.randomUUID(),
    action,
    actor_id: actor?.userId || actor?.id || null,
    actor_name: actor?.username || 'system',
    resource,
    resource_id: resourceId,
    details: details ? JSON.stringify(details) : null,
    ip_address: req?.socket?.remoteAddress || '127.0.0.1',
    created_at: new Date().toISOString()
  };

  const useDb = await isDbAvailable();
  if (useDb) {
    try {
      await db.query(
        `INSERT INTO audit_logs (id, action, actor_id, actor_name, resource, resource_id, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.id, record.action, record.actor_id, record.actor_name, record.resource, record.resource_id, record.details, record.ip_address],
        DB_NAME
      );
    } catch {}
  } else {
    memoryAuditLogs.unshift(record);
    if (memoryAuditLogs.length > 500) memoryAuditLogs.pop();
  }
}

// ==============================================================================
// 1. QUẢN LÝ PHÒNG BAN (DEPARTMENTS)
// ==============================================================================

// Danh sách phòng ban
const getDepartmentsHandler = async (req, res) => {
  try {
    const useDb = await isDbAvailable();
    let departments = [];

    if (useDb) {
      departments = await db.query(
        `SELECT d.*, e.full_name AS manager_name,
                (SELECT COUNT(*) FROM employees emp WHERE emp.department_id = d.id AND emp.status = 'ACTIVE') AS employee_count
         FROM departments d
         LEFT JOIN employees e ON d.manager_id = e.id
         ORDER BY d.created_at ASC`,
        [],
        DB_NAME
      );
    } else {
      departments = Array.from(memoryDepartments.values()).map((d) => {
        const mgr = d.manager_id ? memoryEmployees.get(d.manager_id) : null;
        const count = Array.from(memoryEmployees.values()).filter((e) => e.department_id === d.id && e.status === 'ACTIVE').length;
        return {
          ...d,
          manager_name: mgr ? mgr.full_name : null,
          employee_count: count
        };
      });
    }

    return success(res, departments);
  } catch (err) {
    return error(res, 'Lỗi lấy danh sách phòng ban: ' + err.message);
  }
};

app.get('/api/organization/departments', getDepartmentsHandler);
app.get('/api/departments', getDepartmentsHandler);

// Chi tiết một phòng ban
const getDepartmentDetailHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const useDb = await isDbAvailable();
    let dept = null;

    if (useDb) {
      const rows = await db.query(
        `SELECT d.*, e.full_name AS manager_name
         FROM departments d
         LEFT JOIN employees e ON d.manager_id = e.id
         WHERE d.id = ? OR d.code = ? LIMIT 1`,
        [id, id],
        DB_NAME
      );
      dept = rows[0] || null;
    } else {
      dept = memoryDepartments.get(id) || Array.from(memoryDepartments.values()).find((d) => d.code === id) || null;
    }

    if (!dept) return notFound(res, 'Không tìm thấy phòng ban');
    return success(res, dept);
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.get('/api/organization/departments/:id', getDepartmentDetailHandler);
app.get('/api/departments/:id', getDepartmentDetailHandler);

// Tạo mới phòng ban (ADMIN, HR, MANAGER)
const createDepartmentHandler = async (req, res) => {
  try {
    const { code, name, description, parent_id, office_id, default_shift_id } = req.body;
    let manager_id = req.body.manager_id;
    if (!code || !name) {
      return badRequest(res, 'Yêu cầu cung cấp mã và tên phòng ban');
    }

    // Nếu người tạo là Quản lý (MANAGER), tự động gắn manager_id là chính mình nếu chưa truyền
    const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    if (!manager_id && callerRole === 'MANAGER') {
      manager_id = callerEmpId;
    }

    // Tự động sinh mã mời phòng ban (inviteCode) ví dụ: TEAM-TECH, TEAM-XXXX
    const rawClean = code.replace(/^PB-/, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const invite_code = req.body.invite_code || req.body.inviteCode || (`TEAM-${rawClean || Math.random().toString(36).substring(2, 6).toUpperCase()}`);

    const id = crypto.randomUUID();
    const useDb = await isDbAvailable();

    if (useDb) {
      const existing = await db.query('SELECT id FROM departments WHERE code = ?', [code], DB_NAME);
      if (existing.length > 0) return conflict(res, 'Mã phòng ban đã tồn tại');

      try {
        await db.query(
          `INSERT INTO departments (id, code, name, description, manager_id, parent_id, status)
           VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
          [id, code, name, description || null, manager_id || null, parent_id || null],
          DB_NAME
        );
      } catch (insertErr) {
        // Fallback nếu có cột invite_code
        await db.query(
          `INSERT INTO departments (id, code, name, description, manager_id, parent_id, status)
           VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
          [id, code, name, description || null, manager_id || null, parent_id || null],
          DB_NAME
        );
      }
    } else {
      for (const d of memoryDepartments.values()) {
        if (d.code === code) return conflict(res, 'Mã phòng ban đã tồn tại');
      }
      memoryDepartments.set(id, {
        id,
        code,
        name,
        description,
        manager_id,
        invite_code,
        parent_id,
        office_id: office_id || null,
        default_shift_id: default_shift_id || null,
        status: 'ACTIVE'
      });
    }

    await logAudit('CREATE_DEPARTMENT', req.user, 'DEPARTMENT', id, { code, name, invite_code }, req);
    events.publish('department.created', { id, code, name, inviteCode: invite_code, managerId: manager_id }, { source: 'organization-service' });

    return created(res, {
      id,
      code,
      name,
      inviteCode: invite_code,
      managerId: manager_id,
      officeId: office_id || null,
      defaultShiftId: default_shift_id || null
    }, 'Tạo phòng ban thành công');
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.post('/api/organization/departments', createDepartmentHandler);
app.post('/api/departments', createDepartmentHandler);

// Cập nhật phòng ban (ADMIN, HR)
const updateDepartmentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description, manager_id, parent_id, status } = req.body;
    const useDb = await isDbAvailable();

    if (useDb) {
      await db.query(
        `UPDATE departments SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          manager_id = COALESCE(?, manager_id),
          parent_id = COALESCE(?, parent_id),
          status = COALESCE(?, status)
         WHERE id = ?`,
        [name, description, manager_id, parent_id, status, id],
        DB_NAME
      );
    } else {
      const dept = memoryDepartments.get(id);
      if (!dept) return notFound(res, 'Không tìm thấy phòng ban');
      if (name) dept.name = name;
      if (description !== undefined) dept.description = description;
      if (manager_id !== undefined) dept.manager_id = manager_id;
      if (parent_id !== undefined) dept.parent_id = parent_id;
      if (status) dept.status = status;
    }

    await logAudit('UPDATE_DEPARTMENT', req.user, 'DEPARTMENT', id, req.body, req);
    return success(res, { id }, 200, 'Cập nhật phòng ban thành công');
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.put('/api/organization/departments/:id', updateDepartmentHandler);
app.put('/api/departments/:id', updateDepartmentHandler);

// Xóa phòng ban (ADMIN, HR)
const deleteDepartmentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const useDb = await isDbAvailable();

    if (useDb) {
      await db.query('DELETE FROM departments WHERE id = ?', [id], DB_NAME);
    } else {
      memoryDepartments.delete(id);
    }

    await logAudit('DELETE_DEPARTMENT', req.user, 'DEPARTMENT', id, null, req);
    return success(res, { id }, 200, 'Xóa phòng ban thành công');
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.delete('/api/organization/departments/:id', deleteDepartmentHandler);
app.delete('/api/departments/:id', deleteDepartmentHandler);

// ==============================================================================
// 2. QUẢN LÝ CHỨC DANH (POSITIONS)
// ==============================================================================

const getPositionsHandler = async (req, res) => {
  try {
    const useDb = await isDbAvailable();
    let positions = [];

    if (useDb) {
      // Chuẩn hoá và gộp nếu tồn tại chức danh có đuôi SOA hoặc Kỹ Sư Lập Trình Phần Mềm về 'Kỹ Sư Phần Mềm'
      await db.query(
        `UPDATE positions 
         SET title = 'Kỹ Sư Phần Mềm' 
         WHERE title IN ('Kỹ sư phần mềm SOA', 'Kỹ Sư Phần Mềm SOA', 'Kỹ Sư Lập Trình Phần Mềm') 
            OR (code = 'POS-DEV' AND title != 'Kỹ Sư Phần Mềm')`,
        [],
        DB_NAME
      ).catch(() => {});

      positions = await db.query(
        `SELECT p.*, d.name AS department_name
         FROM positions p
         LEFT JOIN departments d ON p.department_id = d.id
         ORDER BY p.created_at ASC`,
        [],
        DB_NAME
      );
    } else {
      positions = Array.from(memoryPositions.values()).map((p) => {
        const d = p.department_id ? memoryDepartments.get(p.department_id) : null;
        let title = p.title;
        if (title && (title.includes('Kỹ sư phần mềm SOA') || title.includes('Kỹ Sư Phần Mềm SOA') || title === 'Kỹ Sư Lập Trình Phần Mềm')) {
          title = 'Kỹ Sư Phần Mềm';
        }
        return {
          ...p,
          title,
          department_name: d ? d.name : null
        };
      });
    }

    // Loại bỏ các bản ghi trùng lặp (deduplicate theo code/title) để dropdown không bao giờ bị nhân đôi
    const seenTitles = new Set();
    const uniquePositions = [];
    for (const pos of positions) {
      let normalizedTitle = (pos.title || '').trim();
      if (normalizedTitle.toLowerCase() === 'kỹ sư phần mềm soa') {
        normalizedTitle = 'Kỹ Sư Phần Mềm';
        pos.title = 'Kỹ Sư Phần Mềm';
      }
      const key = `${pos.code || ''}_${normalizedTitle.toLowerCase()}`;
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        uniquePositions.push(pos);
      }
    }

    return success(res, uniquePositions);
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.get('/api/organization/positions', getPositionsHandler);
app.get('/api/positions', getPositionsHandler);

const createPositionHandler = async (req, res) => {
  try {
    const { code, title, department_id, base_salary_min, base_salary_max } = req.body;
    if (!code || !title) {
      return badRequest(res, 'Yêu cầu cung cấp mã và tên chức vụ');
    }

    const id = crypto.randomUUID();
    const useDb = await isDbAvailable();

    if (useDb) {
      const existing = await db.query('SELECT id FROM positions WHERE code = ?', [code], DB_NAME);
      if (existing.length > 0) return conflict(res, 'Mã chức danh đã tồn tại');

      await db.query(
        `INSERT INTO positions (id, code, title, department_id, base_salary_min, base_salary_max, status)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [id, code, title, department_id || null, base_salary_min || 0, base_salary_max || 0],
        DB_NAME
      );
    } else {
      for (const p of memoryPositions.values()) {
        if (p.code === code) return conflict(res, 'Mã chức danh đã tồn tại');
      }
      memoryPositions.set(id, {
        id,
        code,
        title,
        department_id,
        base_salary_min: base_salary_min || 0,
        base_salary_max: base_salary_max || 0,
        status: 'ACTIVE'
      });
    }

    await logAudit('CREATE_POSITION', req.user, 'POSITION', id, { code, title }, req);
    return created(res, { id, code, title }, 'Tạo chức danh thành công');
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.post('/api/organization/positions', createPositionHandler);
app.post('/api/positions', createPositionHandler);

// ==============================================================================
// 3. QUẢN LÝ HỒ SƠ NHÂN SỰ (EMPLOYEES)
// ==============================================================================

const getEmployeesHandler = async (req, res) => {
  try {
    const { department_id, status, keyword } = req.query;
    const useDb = await isDbAvailable();
    let employees = [];

    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.userId || req.user?.id;
    const callerEmail = req.user?.email || null;

    if (useDb) {
      let sql = `
        SELECT e.*, d.name AS department_name, p.title AS position_title, m.full_name AS manager_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN positions p ON e.position_id = p.id
        LEFT JOIN employees m ON e.manager_id = m.id
        WHERE 1=1
      `;
      const params = [];

      if (department_id) {
        sql += ' AND e.department_id = ?';
        params.push(department_id);
      }
      if (status && status !== 'ALL') {
        sql += ' AND e.status = ?';
        params.push(status);
      } else if (!status) {
        // Mặc định lọc loại bỏ các nhân viên đã bị xóa mềm hoặc đã nghỉ việc (TERMINATED, DELETED, RESIGNED)
        sql += " AND (e.status IS NULL OR e.status NOT IN ('TERMINATED', 'DELETED', 'RESIGNED'))";
      }
      if (keyword) {
        sql += ' AND (e.full_name LIKE ? OR e.code LIKE ? OR e.email LIKE ?)';
        const kw = `%${keyword}%`;
        params.push(kw, kw, kw);
      }

      sql += ' ORDER BY e.created_at DESC';
      employees = await db.query(sql, params, DB_NAME);
    } else {
      employees = Array.from(memoryEmployees.values()).map((e) => {
        const d = e.department_id ? memoryDepartments.get(e.department_id) : null;
        const p = e.position_id ? memoryPositions.get(e.position_id) : null;
        const m = e.manager_id ? memoryEmployees.get(e.manager_id) : null;
        return {
          ...e,
          department_name: d ? d.name : null,
          position_title: p ? p.title : null,
          manager_name: m ? m.full_name : null
        };
      });

      if (department_id) {
        employees = employees.filter((e) => e.department_id === department_id);
      }
      if (status && status !== 'ALL') {
        employees = employees.filter((e) => e.status === status);
      } else if (!status) {
        // Mặc định lọc loại bỏ các nhân viên đã bị xóa mềm hoặc đã nghỉ việc (TERMINATED, DELETED, RESIGNED)
        employees = employees.filter((e) => !['TERMINATED', 'DELETED', 'RESIGNED'].includes(e.status));
      }
      if (keyword) {
        const kw = keyword.toLowerCase();
        employees = employees.filter(
          (e) =>
            (e.full_name && e.full_name.toLowerCase().includes(kw)) ||
            (e.code && e.code.toLowerCase().includes(kw)) ||
            (e.email && e.email.toLowerCase().includes(kw))
        );
      }
    }

    // Chuẩn hoá dữ liệu phòng ban, chức danh và đảm bảo nhân sự ACTIVE không thiếu thông tin
    employees = employees.map((e) => {
      let deptName = e.department_name;
      let posTitle = e.position_title;
      let deptId = e.department_id;
      let posId = e.position_id;

      if (deptName === 'Phòng Nhân sự' || (deptName && deptName.includes('Nhân sự') && !deptName.includes('Hành chính'))) {
        deptName = 'Phòng Hành chính Nhân sự';
      }
      if (posTitle && (posTitle.includes('Kỹ sư phần mềm SOA') || posTitle.includes('Kỹ Sư Phần Mềm SOA'))) {
        posTitle = 'Kỹ Sư Phần Mềm';
      }

      // Đảm bảo nhân sự ACTIVE luôn có phòng ban và vị trí việc làm (tránh hiển thị dấu '-')
      if (e.status === 'ACTIVE') {
        if (!deptName || deptName === '-' || !deptId) {
          deptId = deptId || 'd0000001-0000-0000-0000-000000000003';
          deptName = 'Phòng Công nghệ & Phần mềm';
        }
        if (!posTitle || posTitle === '-' || !posId) {
          posId = posId || 'p0000001-0000-0000-0000-000000000004';
          posTitle = 'Kỹ Sư Phần Mềm';
        }
      }

      return {
        ...e,
        departmentId: deptId,
        department_id: deptId,
        departmentName: deptName,
        department_name: deptName,
        department: deptName,
        deptName: deptName,
        positionId: posId,
        position_id: posId,
        positionTitle: posTitle,
        position_title: posTitle,
        position: posTitle,
        managerId: e.manager_id || null,
        manager_id: e.manager_id || null,
        managerName: e.manager_name || null,
        manager_name: e.manager_name || null
      };
    });

    // ==========================================================================
    // CÔ LẬP DỮ LIỆU Ở TẦNG TỔ CHỨC (DATA ISOLATION)
    // ==========================================================================

    // 1. Đối với EMPLOYEE: Chỉ xem hồ sơ chính mình. Nếu chưa được gán phòng ban/quản lý -> Trả về mảng rỗng []
    if (callerRole === 'EMPLOYEE' && callerEmpId) {
      const myRecord = employees.find((e) => e.id === callerEmpId || (callerEmail && e.email === callerEmail));
      if (!myRecord || (!myRecord.department_id && !myRecord.manager_id)) {
        return success(res, [], 200, 'Tài khoản chưa thuộc phòng ban nào', { total: 0, unassigned: true });
      }
      return success(res, [myRecord], 200, 'Thành công', { total: 1 });
    }

    // 2. Đối với MANAGER: Chỉ xem nhân viên có manager_id trỏ tới chính mình hoặc thuộc phòng ban do mình phụ trách
    if (callerRole === 'MANAGER' && callerEmpId) {
      let managedDeptIds = [];
      if (useDb) {
        try {
          const deptRows = await db.query('SELECT id FROM departments WHERE manager_id = ?', [callerEmpId], DB_NAME);
          managedDeptIds = deptRows.map((d) => d.id);
        } catch {}
      } else {
        managedDeptIds = Array.from(memoryDepartments.values())
          .filter((d) => d.manager_id === callerEmpId)
          .map((d) => d.id);
      }

      // Lọc danh sách nhân sự cấp dưới
      const subordinates = employees.filter(
        (e) => (e.manager_id && e.manager_id === callerEmpId) || (e.department_id && managedDeptIds.includes(e.department_id))
      );

      return success(res, subordinates, 200, 'Thành công', { total: subordinates.length });
    }

    return success(res, employees, 200, 'Thành công', { total: employees.length });
  } catch (err) {
    return error(res, 'Lỗi lấy danh sách nhân sự: ' + err.message);
  }
};

app.get('/api/v1/employees', getEmployeesHandler);
app.get('/api/organization/employees', getEmployeesHandler);
app.get('/api/employees', getEmployeesHandler);

// Hồ sơ nhân sự của tài khoản đang đăng nhập (GET /api/v1/employees/me)
const getEmployeeMeHandler = async (req, res) => {
  try {
    const currentUser = req.user;
    const callerEmpId = req.headers['x-user-id'] || currentUser?.empId || currentUser?.emp_id || currentUser?.userId || currentUser?.id;
    const callerEmail = currentUser?.email || null;
    const callerUsername = currentUser?.username || null;

    if (!callerEmpId && !callerEmail && !callerUsername) {
      return unauthorized(res, 'Yêu cầu đăng nhập');
    }

    const useDb = await isDbAvailable();
    let employee = null;

    if (useDb) {
      const sql = `
        SELECT e.*, d.name AS department_name, p.title AS position_title, m.full_name AS manager_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN positions p ON e.position_id = p.id
        LEFT JOIN employees m ON e.manager_id = m.id
        WHERE (e.id = ? AND ? IS NOT NULL)
           OR (e.email = ? AND ? IS NOT NULL)
           OR (e.code = ? AND ? IS NOT NULL)
        LIMIT 1
      `;
      const rows = await db.query(sql, [callerEmpId, callerEmpId, callerEmail, callerEmail, callerUsername, callerUsername], DB_NAME);
      employee = rows[0] || null;
    } else {
      if (callerEmpId) employee = memoryEmployees.get(callerEmpId);
      if (!employee) {
        for (const e of memoryEmployees.values()) {
          if ((callerEmpId && e.id === callerEmpId) || (callerEmail && e.email === callerEmail) || (callerUsername && (e.code === callerUsername || e.username === callerUsername))) {
            employee = e;
            break;
          }
        }
      }
      if (employee) {
        const d = employee.department_id ? memoryDepartments.get(employee.department_id) : null;
        const p = employee.position_id ? memoryPositions.get(employee.position_id) : null;
        const m = employee.manager_id ? memoryEmployees.get(employee.manager_id) : null;
        employee = {
          ...employee,
          department_name: d ? d.name : (employee.department_name || null),
          position_title: p ? p.title : (employee.position_title || null),
          manager_name: m ? m.full_name : (employee.manager_name || null)
        };
      }
    }

    if (!employee) {
      return notFound(res, 'Chưa tìm thấy hồ sơ nhân sự liên kết với tài khoản này');
    }

    let deptId = employee.department_id || null;
    let deptName = employee.department_name || null;
    let posId = employee.position_id || null;
    let posTitle = employee.position_title || null;

    if (deptName === 'Phòng Nhân sự' || (deptName && deptName.includes('Nhân sự') && !deptName.includes('Hành chính'))) {
      deptName = 'Phòng Hành chính Nhân sự';
    }
    if (posTitle && (posTitle.includes('Kỹ sư phần mềm SOA') || posTitle.includes('Kỹ Sư Phần Mềm SOA'))) {
      posTitle = 'Kỹ Sư Phần Mềm';
    }

    // Chỉ tự gán phòng ban cho tài khoản nhân sự mẫu có sẵn (demo)
    const isDemoEmployee = (employee.code === 'NV-001' || employee.id === 'e0000001-0000-0000-0000-000000000004');
    if (employee.status === 'ACTIVE' && isDemoEmployee) {
      if (!deptName || deptName === '-' || !deptId) {
        deptId = deptId || 'd0000001-0000-0000-0000-000000000003';
        deptName = 'Phòng Công nghệ & Phần mềm';
      }
      if (!posTitle || posTitle === '-' || !posId) {
        posId = posId || 'p0000001-0000-0000-0000-000000000004';
        posTitle = 'Kỹ Sư Phần Mềm';
      }
    }

    const formatted = {
      ...employee,
      departmentId: deptId,
      department_id: deptId,
      departmentName: deptName,
      department_name: deptName,
      department: deptName,
      deptName: deptName,
      positionId: posId,
      position_id: posId,
      positionTitle: posTitle,
      position_title: posTitle,
      position: posTitle,
      managerId: employee.manager_id || null,
      manager_id: employee.manager_id || null,
      managerName: employee.manager_name || null,
      manager_name: employee.manager_name || null,
      contractType: employee.contract_type || 'OFFICIAL',
      contract_type: employee.contract_type || 'OFFICIAL',
      status: employee.status || 'ACTIVE',
      isAssigned: Boolean(deptId)
    };

    return success(res, formatted);
  } catch (err) {
    console.error('[ORG-ME-ERROR]:', err);
    return error(res, err.message);
  }
};

app.get('/api/v1/employees/me', getEmployeeMeHandler);
app.get('/api/v1/employees/me/profile', getEmployeeMeHandler);
app.get('/api/organization/employees/me/profile', getEmployeeMeHandler);
app.get('/api/organization/employees/me', getEmployeeMeHandler);
app.get('/api/employees/me', getEmployeeMeHandler);
app.get('/api/employees/me/profile', getEmployeeMeHandler);

// Chi tiết hồ sơ một nhân sự
const getEmployeeDetailHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const useDb = await isDbAvailable();
    let emp = null;

    if (useDb) {
      const rows = await db.query(
        `SELECT e.*, d.name AS department_name, p.title AS position_title, m.full_name AS manager_name
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN positions p ON e.position_id = p.id
         LEFT JOIN employees m ON e.manager_id = m.id
         WHERE e.id = ? OR e.code = ? OR e.email = ? LIMIT 1`,
        [id, id, id],
        DB_NAME
      );
      emp = rows[0] || null;
    } else {
      emp = memoryEmployees.get(id) || Array.from(memoryEmployees.values()).find((e) => e.code === id || e.email === id) || null;
      if (emp) {
        const d = emp.department_id ? memoryDepartments.get(emp.department_id) : null;
        const p = emp.position_id ? memoryPositions.get(emp.position_id) : null;
        const m = emp.manager_id ? memoryEmployees.get(emp.manager_id) : null;
        emp = {
          ...emp,
          department_name: d ? d.name : (emp.department_name || null),
          position_title: p ? p.title : (emp.position_title || null),
          manager_name: m ? m.full_name : (emp.manager_name || null)
        };
      }
    }

    if (!emp) return notFound(res, 'Không tìm thấy hồ sơ nhân sự');

    let deptId = emp.department_id || null;
    let deptName = emp.department_name || null;
    let posId = emp.position_id || null;
    let posTitle = emp.position_title || null;

    if (deptName === 'Phòng Nhân sự' || (deptName && deptName.includes('Nhân sự') && !deptName.includes('Hành chính'))) {
      deptName = 'Phòng Hành chính Nhân sự';
    }
    if (posTitle && (posTitle.includes('Kỹ sư phần mềm SOA') || posTitle.includes('Kỹ Sư Phần Mềm SOA'))) {
      posTitle = 'Kỹ Sư Phần Mềm';
    }

    if (emp.status === 'ACTIVE') {
      if (!deptName || deptName === '-' || !deptId) {
        deptId = deptId || 'd0000001-0000-0000-0000-000000000003';
        deptName = 'Phòng Công nghệ & Phần mềm';
      }
      if (!posTitle || posTitle === '-' || !posId) {
        posId = posId || 'p0000001-0000-0000-0000-000000000004';
        posTitle = 'Kỹ Sư Phần Mềm';
      }
    }

    const formatted = {
      ...emp,
      departmentId: deptId,
      department_id: deptId,
      departmentName: deptName,
      department_name: deptName,
      department: deptName,
      deptName: deptName,
      positionId: posId,
      position_id: posId,
      positionTitle: posTitle,
      position_title: posTitle,
      position: posTitle,
      managerId: emp.manager_id || null,
      manager_id: emp.manager_id || null,
      managerName: emp.manager_name || null,
      manager_name: emp.manager_name || null,
      contractType: emp.contract_type || 'OFFICIAL',
      contract_type: emp.contract_type || 'OFFICIAL',
      status: emp.status || 'ACTIVE',
      isAssigned: Boolean(deptId)
    };

    return success(res, formatted);
  } catch (err) {
    console.error('[ORG-DETAIL-ERROR]:', err);
    return error(res, err.message);
  }
};

app.get('/api/v1/employees/:id', getEmployeeDetailHandler);
app.get('/api/organization/employees/:id', getEmployeeDetailHandler);
app.get('/api/employees/:id', getEmployeeDetailHandler);

// Tạo mới hồ sơ nhân sự (ADMIN, HR)
const createEmployeeHandler = async (req, res) => {
  try {
    const {
      code,
      full_name,
      email,
      phone,
      identity_card,
      gender,
      department_id,
      position_id,
      manager_id,
      join_date,
      contract_type
    } = req.body;

    if (!code || !full_name || !email) {
      return badRequest(res, 'Yêu cầu cung cấp mã nhân viên, họ tên và email');
    }

    const id = crypto.randomUUID();
    const joinDateVal = join_date || new Date().toISOString().split('T')[0];
    const contractTypeVal = contract_type || 'OFFICIAL';
    const useDb = await isDbAvailable();

    if (useDb) {
      const existing = await db.query('SELECT id FROM employees WHERE code = ? OR email = ?', [code, email], DB_NAME);
      if (existing.length > 0) return conflict(res, 'Mã nhân viên hoặc email đã tồn tại');

      await db.query(
        `INSERT INTO employees (id, code, full_name, email, phone, identity_card, gender, department_id, position_id, manager_id, join_date, contract_type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [
          id,
          code,
          full_name,
          email,
          phone || null,
          identity_card || null,
          gender || 'MALE',
          department_id || null,
          position_id || null,
          manager_id || null,
          joinDateVal,
          contractTypeVal
        ],
        DB_NAME
      );
    } else {
      for (const e of memoryEmployees.values()) {
        if (e.code === code || e.email === email) return conflict(res, 'Mã nhân sự hoặc email đã tồn tại');
      }
      memoryEmployees.set(id, {
        id,
        code,
        full_name,
        email,
        phone,
        identity_card,
        gender: gender || 'MALE',
        department_id,
        position_id,
        manager_id,
        join_date: joinDateVal,
        contract_type: contractTypeVal,
        status: 'ACTIVE'
      });
    }

    await logAudit('CREATE_EMPLOYEE', req.user, 'EMPLOYEE', id, { code, full_name, email }, req);

    // Bắn sự kiện lên Event Bus
    events.publish('employee.created', {
      id,
      code,
      fullName: full_name,
      email,
      departmentId: department_id,
      positionId: position_id
    }, { source: 'organization-service' });

    return created(res, { id, code, full_name, email }, 'Tạo hồ sơ nhân sự thành công');
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.post('/api/organization/employees', createEmployeeHandler);
app.post('/api/employees', createEmployeeHandler);

// Cập nhật hồ sơ nhân sự (ADMIN, HR)
const updateEmployeeHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      full_name, fullName,
      code, employeeCode, employee_code,
      email,
      phone,
      identity_card, identityCard,
      department_id, departmentId, departmentName, department,
      position_id, positionId, positionTitle, position,
      manager_id, managerId,
      status,
      contract_type, contractType,
      base_salary, baseSalary,
      shift_id, shiftId,
      office_id, officeId
    } = req.body;

    const newCode = (employeeCode || code || employee_code || '').trim().toUpperCase() || null;
    const finalFullName = fullName || full_name || null;
    const finalEmail = email || null;
    const finalPhone = phone !== undefined ? phone : null;
    const finalIdCard = identityCard || identity_card || null;
    let finalDept = departmentId || department_id || null;
    let finalPos = positionId || position_id || null;
    let finalMgr = managerId || manager_id || null;
    const finalStatus = status || null;
    const finalContract = contractType || contract_type || null;
    const finalSalary = baseSalary !== undefined ? Number(baseSalary) : (base_salary !== undefined ? Number(base_salary) : null);

    const useDb = await isDbAvailable();

    // Tìm hồ sơ nhân sự hiện tại trong DB hoặc In-memory fallback
    let targetEmp = null;
    let actualEmpId = id;

    if (useDb) {
      const existing = await db.query(
        'SELECT * FROM employees WHERE id = ? OR code = ? OR email = ? LIMIT 1',
        [id, id, id],
        DB_NAME
      );
      if (existing && existing.length > 0) {
        targetEmp = existing[0];
        actualEmpId = targetEmp.id;
      }
    } else {
      targetEmp = memoryEmployees.get(id);
      if (!targetEmp) {
        for (const [k, v] of memoryEmployees.entries()) {
          if (v.id === id || v.email === id || v.username === id || v.code === id) {
            targetEmp = v;
            actualEmpId = v.id;
            break;
          }
        }
      }
    }

    // Tìm ID phòng ban nếu truyền tên phòng ban hoặc mã phòng ban
    const deptInput = department || departmentName;
    if (!finalDept && deptInput) {
      if (deptInput.includes('Nhân sự')) {
        finalDept = 'd0000001-0000-0000-0000-000000000002';
      } else if (deptInput.includes('Kỹ Thuật') || deptInput.includes('Công nghệ')) {
        finalDept = 'd0000001-0000-0000-0000-000000000003';
      } else if (deptInput.includes('Kinh Doanh')) {
        finalDept = 'd0000001-0000-0000-0000-000000000004';
      } else if (deptInput.includes('Giám Đốc')) {
        finalDept = 'd0000001-0000-0000-0000-000000000001';
      } else {
        for (const [dId, d] of memoryDepartments.entries()) {
          if (d.name && d.name.toLowerCase().includes(deptInput.toLowerCase().replace('phòng', '').trim())) {
            finalDept = dId;
            break;
          }
        }
      }
    }

    // Tra cứu tên phòng ban để đồng bộ đầy đủ
    let deptName = null;
    if (finalDept) {
      if (useDb) {
        try {
          const dRows = await db.query('SELECT name FROM departments WHERE id = ? LIMIT 1', [finalDept], DB_NAME);
          if (dRows.length > 0) deptName = dRows[0].name;
        } catch {}
      }
      if (!deptName) {
        const d = memoryDepartments.get(finalDept);
        if (d) deptName = d.name;
      }
    }
    if (!deptName && deptInput) deptName = deptInput;

    // Tìm ID vị trí việc làm nếu truyền tên chức danh
    const posInput = position || positionTitle;
    if (!finalPos && posInput) {
      if (posInput.toLowerCase().includes('phần mềm') || posInput.includes('Developer') || posInput.includes('DEV') || posInput.includes('SOA')) {
        finalPos = 'p0000001-0000-0000-0000-000000000004';
      } else {
        for (const [pId, p] of memoryPositions.entries()) {
          if (p.title && p.title.toLowerCase().includes(posInput.toLowerCase().trim())) {
            finalPos = pId;
            break;
          }
        }
      }
    }

    let posTitle = null;
    if (finalPos) {
      if (useDb) {
        try {
          const pRows = await db.query('SELECT title FROM positions WHERE id = ? LIMIT 1', [finalPos], DB_NAME);
          if (pRows.length > 0) posTitle = pRows[0].title;
        } catch {}
      }
      if (!posTitle) {
        const p = memoryPositions.get(finalPos);
        if (p) posTitle = p.title;
      }
    }
    if (!posTitle && posInput) posTitle = posInput;

    // Tự động chuyển trạng thái PENDING -> ACTIVE và OFFICIAL nếu đã được gán phòng ban hợp lệ
    let resolvedStatus = finalStatus;
    let resolvedContract = finalContract;
    const currentStatus = targetEmp?.status || 'PENDING';

    if (finalDept) {
      if (!resolvedStatus || ['PENDING', 'PENDING_ASSIGNMENT'].includes(resolvedStatus) || ['PENDING', 'PENDING_ASSIGNMENT'].includes(currentStatus)) {
        resolvedStatus = 'ACTIVE';
        if (!resolvedContract || resolvedContract === 'PENDING') {
          resolvedContract = 'OFFICIAL';
        }
      }
    }

    // Ràng buộc: Khi kích hoạt ACTIVE, bắt buộc phải có phòng ban và chức danh mặc định
    if (resolvedStatus === 'ACTIVE') {
      if (!finalDept) finalDept = targetEmp?.department_id || 'd0000001-0000-0000-0000-000000000003';
      if (!finalPos) finalPos = targetEmp?.position_id || 'p0000001-0000-0000-0000-000000000004';
    }

    if (useDb) {
      await db.query(
        `UPDATE employees SET
          code = COALESCE(?, code),
          full_name = COALESCE(?, full_name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          identity_card = COALESCE(?, identity_card),
          department_id = COALESCE(?, department_id),
          position_id = COALESCE(?, position_id),
          manager_id = COALESCE(?, manager_id),
          status = COALESCE(?, status),
          contract_type = COALESCE(?, contract_type)
         WHERE id = ?`,
        [newCode, finalFullName, finalEmail, finalPhone, finalIdCard, finalDept, finalPos, finalMgr, resolvedStatus, resolvedContract, actualEmpId],
        DB_NAME
      );

      // Cập nhật mức lương cơ bản sang bảng payroll_configs nếu có thay đổi
      if (finalSalary !== null) {
        try {
          await db.query(
            `UPDATE htqlns_payroll.payroll_configs SET base_salary = ? WHERE emp_id = ?`,
            [finalSalary, actualEmpId]
          );
        } catch {}
      }
    } else {
      let emp = memoryEmployees.get(actualEmpId);
      if (!emp) {
        for (const [k, v] of memoryEmployees.entries()) {
          if (v.id === actualEmpId || v.email === id || v.username === id || v.code === id) {
            emp = v;
            break;
          }
        }
      }
      if (!emp && !targetEmp) return notFound(res, 'Không tìm thấy hồ sơ nhân sự');
      if (emp) {
        if (newCode) emp.code = newCode;
        if (finalFullName) emp.full_name = finalFullName;
        if (finalEmail) emp.email = finalEmail;
        if (finalPhone !== null) emp.phone = finalPhone;
        if (finalIdCard) emp.identity_card = finalIdCard;
        if (finalDept) emp.department_id = finalDept;
        if (finalPos) emp.position_id = finalPos;
        if (finalMgr) emp.manager_id = finalMgr;
        if (resolvedStatus) emp.status = resolvedStatus;
        if (resolvedContract) emp.contract_type = resolvedContract;
        if (finalSalary !== null) emp.base_salary = finalSalary;
        if (shiftId || shift_id) emp.shift_id = shiftId || shift_id;
        if (officeId || office_id) emp.office_id = officeId || office_id;
      }
    }

    await logAudit('UPDATE_EMPLOYEE', req.user, 'EMPLOYEE', actualEmpId, req.body, req);

    // Phát sự kiện lên Event Bus để đồng bộ sang auth-service và các service khác
    events.publish('employee.updated', {
      id: actualEmpId,
      empId: actualEmpId,
      code: newCode || targetEmp?.code,
      fullName: finalFullName || targetEmp?.full_name,
      email: finalEmail || targetEmp?.email,
      departmentId: finalDept,
      department_id: finalDept,
      departmentName: deptName,
      department_name: deptName,
      department: deptName,
      positionId: finalPos,
      position_id: finalPos,
      positionTitle: posTitle,
      position_title: posTitle,
      position: posTitle,
      managerId: finalMgr,
      manager_id: finalMgr,
      baseSalary: finalSalary,
      status: resolvedStatus,
      contractType: resolvedContract,
      contract_type: resolvedContract
    }, { source: 'organization-service' });

    // Gọi API nội bộ đồng bộ trực tiếp sang auth-service
    try {
      const authPort = process.env.AUTH_PORT || 3001;
      await fetch(`http://localhost:${authPort}/internal/auth/sync-employee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.INTERNAL_SERVICE_KEY || 'htqlns-internal-secret-key-2026'
        },
        body: JSON.stringify({
          id: actualEmpId,
          empId: actualEmpId,
          code: newCode || targetEmp?.code,
          email: finalEmail || targetEmp?.email,
          fullName: finalFullName || targetEmp?.full_name,
          departmentId: finalDept,
          departmentName: deptName,
          position: posTitle,
          status: resolvedStatus
        })
      });
    } catch (_) {}

    let updatedData = {
      id: actualEmpId,
      code: newCode || targetEmp?.code,
      full_name: finalFullName || targetEmp?.full_name,
      fullName: finalFullName || targetEmp?.full_name,
      email: finalEmail || targetEmp?.email,
      phone: finalPhone || targetEmp?.phone,
      departmentId: finalDept,
      department_id: finalDept,
      departmentName: deptName,
      department_name: deptName,
      department: deptName,
      positionId: finalPos,
      position_id: finalPos,
      positionTitle: posTitle,
      position_title: posTitle,
      position: posTitle,
      managerId: finalMgr,
      manager_id: finalMgr,
      status: resolvedStatus,
      contractType: resolvedContract,
      contract_type: resolvedContract
    };

    if (useDb) {
      try {
        const rows = await db.query(
          `SELECT e.*, d.name AS department_name, p.title AS position_title, m.full_name AS manager_name
           FROM employees e
           LEFT JOIN departments d ON e.department_id = d.id
           LEFT JOIN positions p ON e.position_id = p.id
           LEFT JOIN employees m ON e.manager_id = m.id
           WHERE e.id = ? LIMIT 1`,
          [actualEmpId],
          DB_NAME
        );
        if (rows && rows.length > 0) {
          const r = rows[0];
          updatedData = {
            ...r,
            departmentId: r.department_id,
            department_id: r.department_id,
            departmentName: r.department_name,
            department_name: r.department_name,
            department: r.department_name,
            positionId: r.position_id,
            position_id: r.position_id,
            positionTitle: r.position_title,
            position_title: r.position_title,
            position: r.position_title,
            managerId: r.manager_id,
            manager_id: r.manager_id,
            contractType: r.contract_type,
            contract_type: r.contract_type
          };
        }
      } catch {}
    } else {
      const emp = memoryEmployees.get(actualEmpId);
      if (emp) {
        const d = emp.department_id ? memoryDepartments.get(emp.department_id) : null;
        const p = emp.position_id ? memoryPositions.get(emp.position_id) : null;
        updatedData = {
          ...emp,
          departmentId: emp.department_id,
          department_id: emp.department_id,
          departmentName: d ? d.name : deptName,
          department_name: d ? d.name : deptName,
          department: d ? d.name : deptName,
          positionId: emp.position_id,
          position_id: emp.position_id,
          positionTitle: p ? p.title : posTitle,
          position_title: p ? p.title : posTitle,
          position: p ? p.title : posTitle
        };
      }
    }

    return success(res, updatedData, 200, 'Cập nhật hồ sơ nhân sự thành công');
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

// Tiếp nhận nhân sự mới (Onboarding: gán mã nhân viên, phòng ban, ca, mức lương)
const onboardEmployeeHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      code,
      employeeCode,
      employee_code,
      full_name,
      fullName,
      email,
      phone,
      department_id,
      departmentId,
      departmentName,
      department,
      position_id,
      positionId,
      positionTitle,
      position,
      manager_id,
      managerId,
      status,
      contract_type,
      contractType
    } = req.body;

    const finalCode = (employeeCode || code || employee_code || '').trim().toUpperCase() || null;
    const finalContract = contractType || contract_type || 'OFFICIAL';
    const finalStatus = status || 'ACTIVE';
    const finalName = fullName || full_name || null;
    const finalEmail = email || null;
    const finalPhone = phone || null;

    let finalDeptId = departmentId || department_id || null;
    let finalPosId = positionId || position_id || null;
    let finalMgrId = managerId || manager_id || null;

    // Tìm ID phòng ban nếu truyền tên phòng ban
    const deptInput = department || departmentName;
    if (!finalDeptId && deptInput) {
      if (deptInput.includes('Nhân sự')) {
        finalDeptId = 'd0000001-0000-0000-0000-000000000002';
      } else if (deptInput.includes('Kỹ Thuật') || deptInput.includes('Công nghệ')) {
        finalDeptId = 'd0000001-0000-0000-0000-000000000003';
      } else if (deptInput.includes('Kinh Doanh')) {
        finalDeptId = 'd0000001-0000-0000-0000-000000000004';
      } else if (deptInput.includes('Giám Đốc')) {
        finalDeptId = 'd0000001-0000-0000-0000-000000000001';
      } else {
        for (const [dId, d] of memoryDepartments.entries()) {
          if (d.name && d.name.toLowerCase().includes(deptInput.toLowerCase().replace('phòng', '').trim())) {
            finalDeptId = dId;
            break;
          }
        }
      }
    }

    // Tìm ID vị trí việc làm nếu truyền tên chức danh
    const posInput = position || positionTitle;
    if (!finalPosId && posInput) {
      if (posInput.toLowerCase().includes('phần mềm') || posInput.includes('Developer') || posInput.includes('DEV') || posInput.includes('SOA')) {
        finalPosId = 'p0000001-0000-0000-0000-000000000004';
      } else {
        for (const [pId, p] of memoryPositions.entries()) {
          if (p.title && p.title.toLowerCase().includes(posInput.toLowerCase().trim())) {
            finalPosId = pId;
            break;
          }
        }
      }
    }

    if (finalStatus === 'ACTIVE') {
      if (!finalDeptId) finalDeptId = 'd0000001-0000-0000-0000-000000000003';
      if (!finalPosId) finalPosId = 'p0000001-0000-0000-0000-000000000004';
    }

    const useDb = await isDbAvailable();

    if (useDb) {
      // 1. Kiểm tra nhân viên đã có trong DB chưa
      const existing = await db.query('SELECT * FROM employees WHERE id = ? OR email = ? LIMIT 1', [id, finalEmail], DB_NAME);
      if (existing && existing.length > 0) {
        const empId = existing[0].id;
        await db.query(
          `UPDATE employees SET
            code = COALESCE(?, code),
            full_name = COALESCE(?, full_name),
            phone = COALESCE(?, phone),
            department_id = COALESCE(?, department_id),
            position_id = COALESCE(?, position_id),
            manager_id = COALESCE(?, manager_id),
            contract_type = ?,
            status = ?
           WHERE id = ?`,
          [finalCode, finalName, finalPhone, finalDeptId, finalPosId, finalMgrId, finalContract, finalStatus, empId],
          DB_NAME
        );
      } else {
        // Tạo mới nhân sự nếu chưa có
        await db.query(
          `INSERT INTO employees (id, code, full_name, email, phone, department_id, position_id, manager_id, contract_type, status, join_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
          [id, finalCode || ('EMP_' + id), finalName || 'Nhân viên mới', finalEmail || `${id}@htqlns.com`, finalPhone || '-', finalDeptId, finalPosId, finalMgrId, finalContract, finalStatus],
          DB_NAME
        );
      }
    }

    // 2. Cập nhật In-memory fallback
    let emp = memoryEmployees.get(id);
    if (!emp) {
      for (const [k, v] of memoryEmployees.entries()) {
        if (v.id === id || (finalEmail && v.email === finalEmail) || v.username === id || v.code === id) {
          emp = v;
          break;
        }
      }
    }

    if (emp) {
      if (finalCode) emp.code = finalCode;
      if (finalName) emp.full_name = finalName;
      if (finalPhone) emp.phone = finalPhone;
      if (finalDeptId) emp.department_id = finalDeptId;
      if (finalPosId) emp.position_id = finalPosId;
      if (finalMgrId) emp.manager_id = finalMgrId;
      emp.contract_type = finalContract;
      emp.status = finalStatus;
    } else {
      emp = {
        id,
        code: finalCode || ('EMP_' + id),
        full_name: finalName || 'Nhân viên mới',
        email: finalEmail || `${id}@htqlns.com`,
        phone: finalPhone || '-',
        department_id: finalDeptId,
        position_id: finalPosId,
        manager_id: finalMgrId,
        join_date: new Date().toISOString().split('T')[0],
        contract_type: finalContract,
        status: finalStatus
      };
      memoryEmployees.set(id, emp);
    }

    await logAudit('ONBOARD_EMPLOYEE', req.user, 'EMPLOYEE', id, req.body, req);

    let onboardDeptName = null;
    if (finalDeptId) {
      if (useDb) {
        try {
          const dRows = await db.query('SELECT name FROM departments WHERE id = ? LIMIT 1', [finalDeptId], DB_NAME);
          if (dRows.length > 0) onboardDeptName = dRows[0].name;
        } catch {}
      }
      if (!onboardDeptName) {
        const d = memoryDepartments.get(finalDeptId);
        if (d) onboardDeptName = d.name;
      }
    }
    if (!onboardDeptName && deptInput) onboardDeptName = deptInput;

    events.publish('employee.onboarded', {
      id,
      code: emp.code,
      departmentId: emp.department_id,
      departmentName: onboardDeptName,
      status: emp.status,
      contractType: emp.contract_type
    }, { source: 'organization-service' });

    // Đồng bộ trực tiếp sang auth-service
    try {
      const authPort = process.env.AUTH_PORT || 3001;
      await fetch(`http://localhost:${authPort}/internal/auth/sync-employee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.INTERNAL_SERVICE_KEY || 'htqlns-internal-secret-key-2026'
        },
        body: JSON.stringify({
          id,
          empId: id,
          code: emp.code,
          email: emp.email,
          fullName: emp.full_name,
          departmentId: emp.department_id,
          departmentName: onboardDeptName,
          status: emp.status
        })
      });
    } catch (_) {}

    const formattedEmp = {
      ...emp,
      departmentId: emp.department_id,
      department_id: emp.department_id,
      departmentName: onboardDeptName,
      department_name: onboardDeptName,
      department: onboardDeptName
    };

    return success(res, formattedEmp, 200, 'Tiếp nhận nhân sự thành công');
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.patch('/api/v1/employees/:id/onboard', onboardEmployeeHandler);
app.patch('/api/organization/employees/:id/onboard', onboardEmployeeHandler);
app.post('/api/v1/employees/:id/onboard', onboardEmployeeHandler);
app.post('/api/organization/employees/:id/onboard', onboardEmployeeHandler);
app.put('/api/v1/employees/:id/onboard', onboardEmployeeHandler);

app.put('/api/v1/employees/:id', updateEmployeeHandler);
app.patch('/api/v1/employees/:id', updateEmployeeHandler);
app.put('/api/organization/employees/:id', updateEmployeeHandler);
app.patch('/api/organization/employees/:id', updateEmployeeHandler);
app.put('/api/employees/:id', updateEmployeeHandler);
app.patch('/api/employees/:id', updateEmployeeHandler);

// Đánh dấu nhân viên nghỉ việc hoặc xóa (ADMIN, HR, MANAGER)
const deleteEmployeeHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const isResignOnly = req.query.action === 'resign' || req.query.status === 'RESIGNED';
    const useDb = await isDbAvailable();
    let targetEmail = null;

    if (useDb) {
      try {
        const rows = await db.query('SELECT id, email, code FROM employees WHERE id = ? LIMIT 1', [id], DB_NAME);
        if (rows.length > 0) {
          targetEmail = rows[0].email;
        }
      } catch {}

      if (isResignOnly) {
        await db.query("UPDATE employees SET status = 'RESIGNED' WHERE id = ?", [id], DB_NAME);
        try {
          await db.query("UPDATE htqlns_auth.users SET status = 'INACTIVE' WHERE emp_id = ? OR email = ?", [id, targetEmail]);
        } catch {}
        await logAudit('RESIGN_EMPLOYEE', req.user, 'EMPLOYEE', id, { status: 'RESIGNED', email: targetEmail }, req);
        events.publish('employee.resigned', { id, email: targetEmail }, { source: 'organization-service' });
        return success(res, { id, status: 'RESIGNED' }, 200, 'Đã cập nhật trạng thái nhân sự thành Nghỉ việc (RESIGNED)');
      } else {
        // Mặc định thực hiện xóa thật bản ghi nhân sự và đồng bộ xóa tài khoản bên auth-service
        try {
          if (targetEmail) {
            await db.query("DELETE FROM htqlns_auth.users WHERE emp_id = ? OR (email IS NOT NULL AND email = ?)", [id, targetEmail]);
          } else {
            await db.query("DELETE FROM htqlns_auth.users WHERE emp_id = ?", [id]);
          }
        } catch (authErr) {
          console.warn('[ORG-SERVICE] Không thể đồng bộ xóa tài khoản auth:', authErr.message);
        }

        await db.query("DELETE FROM employees WHERE id = ?", [id], DB_NAME);
        await logAudit('DELETE_EMPLOYEE', req.user, 'EMPLOYEE', id, { action: 'PERMANENT_DELETE', email: targetEmail }, req);
        events.publish('employee.deleted', { id, email: targetEmail }, { source: 'organization-service' });
        return success(res, { id, status: 'RESIGNED', deleted: true }, 200, 'Đã xóa nhân sự thành công khỏi hệ thống');
      }
    } else {
      const emp = memoryEmployees.get(id);
      if (emp) targetEmail = emp.email;

      if (isResignOnly) {
        if (emp) emp.status = 'RESIGNED';
        events.publish('employee.resigned', { id, email: targetEmail }, { source: 'organization-service' });
        return success(res, { id, status: 'RESIGNED' }, 200, 'Đã cập nhật trạng thái nhân sự thành Nghỉ việc (RESIGNED)');
      } else {
        memoryEmployees.delete(id);
        for (const [k, v] of memoryEmployees.entries()) {
          if (v.id === id || (targetEmail && v.email === targetEmail)) {
            memoryEmployees.delete(k);
          }
        }
        events.publish('employee.deleted', { id, email: targetEmail }, { source: 'organization-service' });
        return success(res, { id, status: 'RESIGNED', deleted: true }, 200, 'Đã xóa nhân sự thành công khỏi hệ thống');
      }
    }
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
};

app.delete('/api/v1/employees/:id', deleteEmployeeHandler);
app.delete('/api/organization/employees/:id', deleteEmployeeHandler);
app.delete('/api/employees/:id', deleteEmployeeHandler);

// ==============================================================================
// 3B. CƠ CHẾ MỜI / THAM GIA PHÒNG BAN (INVITATIONS & JOIN DEPARTMENT)
// ==============================================================================

// 0. Quản lý / Admin tiếp nhận / mời nhân viên vào phòng ban (POST /api/v1/organizations/departments/invite)
app.post(
  [
    '/api/v1/organizations/departments/invite',
    '/api/v1/organization/departments/invite',
    '/api/organization/departments/invite',
    '/api/departments/invite'
  ],
  async (req, res) => {
    try {
      const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
      const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;

      if (!['ADMIN', 'HR_ADMIN', 'HR', 'MANAGER'].includes(callerRole)) {
        return forbidden(res, 'Chỉ Quản lý hoặc HR/Admin mới có quyền tiếp nhận nhân sự vào phòng ban');
      }

      const { email, departmentId, department_id, position, positionTitle, positionId } = req.body || {};
      if (!email || !email.trim()) {
        return badRequest(res, 'Vui lòng cung cấp email của nhân viên cần mời');
      }

      const targetEmail = email.trim().toLowerCase();
      let targetDeptId = departmentId || department_id || null;
      let targetDept = null;
      const useDb = await isDbAvailable();

      // Nếu không truyền departmentId và caller là Quản lý: tìm phòng ban phụ trách
      if (!targetDeptId && callerRole === 'MANAGER') {
        if (useDb) {
          try {
            const rows = await db.query('SELECT * FROM departments WHERE manager_id = ? LIMIT 1', [callerEmpId], DB_NAME);
            if (rows.length > 0) targetDept = rows[0];
          } catch {}
        } else {
          targetDept = Array.from(memoryDepartments.values()).find((d) => d.manager_id === callerEmpId) || null;
        }
        if (targetDept) targetDeptId = targetDept.id;
      }

      if (!targetDeptId) {
        return badRequest(res, 'Tài khoản Quản lý của bạn chưa được phân công phòng ban phụ trách nên chưa thể mời nhân viên');
      }

      if (!targetDept) {
        if (useDb) {
          try {
            const rows = await db.query('SELECT * FROM departments WHERE id = ? LIMIT 1', [targetDeptId], DB_NAME);
            if (rows.length > 0) targetDept = rows[0];
          } catch {}
        } else {
          targetDept = memoryDepartments.get(targetDeptId) || null;
        }
      }

      if (!targetDept) {
        return notFound(res, 'Không tìm thấy phòng ban với mã này');
      }

      // Kiểm tra quyền của Quản lý: chỉ được mời vào phòng ban do mình phụ trách
      if (callerRole === 'MANAGER') {
        const isManagerOfDept = (targetDept.manager_id && (targetDept.manager_id === callerEmpId || targetDept.manager_id === req.user?.id)) ||
                                (req.user?.departmentId && req.user.departmentId === targetDept.id);
        if (!isManagerOfDept) {
          return forbidden(res, 'Quản lý chỉ có quyền tiếp nhận nhân viên vào phòng ban do mình phụ trách');
        }
      }

      // Tìm nhân viên theo email trong hệ thống (kiểm tra cả employees và users)
      let employee = null;

      if (useDb) {
        try {
          const empRows = await db.query('SELECT * FROM employees WHERE LOWER(email) = ? LIMIT 1', [targetEmail], DB_NAME);
          if (empRows.length > 0) {
            employee = empRows[0];
          } else {
            // Kiểm tra xem đã có user đăng ký trong bảng users chưa
            const userRows = await db.query('SELECT * FROM htqlns_auth.users WHERE LOWER(email) = ? LIMIT 1', [targetEmail]);
            if (userRows.length > 0) {
              const u = userRows[0];
              const newEmpId = u.emp_id || crypto.randomUUID();
              const fName = u.full_name || u.username || targetEmail.split('@')[0];
              const code = 'EMP_' + Math.floor(10000 + Math.random() * 90000);
              await db.query(
                `INSERT INTO employees (id, code, full_name, email, department_id, manager_id, status, contract_type)
                 VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'OFFICIAL')`,
                [newEmpId, code, fName, targetEmail, targetDeptId, targetDept.manager_id || callerEmpId],
                DB_NAME
              );
              try {
                await db.query('UPDATE htqlns_auth.users SET emp_id = ? WHERE id = ?', [newEmpId, u.id]);
              } catch {}
              const createdRows = await db.query('SELECT * FROM employees WHERE id = ? LIMIT 1', [newEmpId], DB_NAME);
              employee = createdRows[0];
            }
          }
        } catch (dbErr) {
          console.warn('[ORG-INVITE] Lỗi tra cứu DB:', dbErr.message);
        }
      } else {
        employee = Array.from(memoryEmployees.values()).find((e) => e.email && e.email.toLowerCase() === targetEmail);
      }

      // Nếu không tìm thấy tài khoản nhân viên với email này: Trả về lỗi 404 rõ ràng
      if (!employee) {
        return notFound(res, 'Không tìm thấy tài khoản nhân viên với email này');
      }

      // Cập nhật departmentId, managerId, status: 'ACTIVE' và chức danh (nếu có)
      const finalManagerId = targetDept.manager_id || callerEmpId;
      const posInput = positionTitle || position || null;
      let finalPosId = positionId || null;
      let finalPosTitle = posInput;

      if (posInput && !finalPosId) {
        if (useDb) {
          try {
            const pRows = await db.query('SELECT id, title FROM positions WHERE LOWER(title) LIKE ? LIMIT 1', [`%${posInput.toLowerCase()}%`], DB_NAME);
            if (pRows.length > 0) {
              finalPosId = pRows[0].id;
              finalPosTitle = pRows[0].title;
            }
          } catch {}
        } else {
          for (const [pId, p] of memoryPositions.entries()) {
            if (p.title && p.title.toLowerCase().includes(posInput.toLowerCase())) {
              finalPosId = pId;
              finalPosTitle = p.title;
              break;
            }
          }
        }
      }

      if (useDb) {
        let updateSql = `UPDATE employees SET department_id = ?, manager_id = ?, status = 'ACTIVE'`;
        const params = [targetDeptId, finalManagerId];
        if (finalPosId) {
          updateSql += `, position_id = ?`;
          params.push(finalPosId);
        }
        updateSql += ` WHERE id = ?`;
        params.push(employee.id);
        await db.query(updateSql, params, DB_NAME);
      } else {
        const memEmp = memoryEmployees.get(employee.id);
        if (memEmp) {
          memEmp.department_id = targetDeptId;
          memEmp.department_name = targetDept.name;
          memEmp.manager_id = finalManagerId;
          memEmp.manager_name = req.user?.fullName || req.user?.username || 'Quản lý bộ phận';
          memEmp.status = 'ACTIVE';
          if (finalPosId) memEmp.position_id = finalPosId;
          if (finalPosTitle) memEmp.position_title = finalPosTitle;
        }
      }

      // Đồng bộ thông tin nhân sự sang auth-service
      try {
        await serviceClient.call('auth-service', '/internal/auth/sync-employee', {
          method: 'POST',
          body: {
            id: employee.id,
            email: targetEmail,
            departmentId: targetDeptId,
            departmentName: targetDept.name,
            position: finalPosTitle || employee.position_title,
            status: 'ACTIVE'
          }
        });
      } catch (authErr) {}

      // Gửi thông báo qua notification-service
      const callerName = req.user?.fullName || req.user?.username || 'Quản lý bộ phận';
      try {
        await serviceClient.call('notification-service', '/internal/notifications', {
          method: 'POST',
          headers: {
            'x-user-role': 'ADMIN',
            'x-user-id': callerEmpId
          },
          body: {
            empId: employee.id,
            targetRole: 'EMPLOYEE',
            type: 'SYSTEM',
            title: 'Bạn đã được thêm vào phòng ban',
            content: `Bạn đã được ${callerName} tiếp nhận vào ${targetDept.name}${finalPosTitle ? ` với vị trí ${finalPosTitle}` : ''}.`,
            referenceId: targetDeptId,
            metadata: { targetPage: 'profile' }
          }
        });
      } catch (notifErr) {}

      // Phát sự kiện lên Event Bus
      events.publish('employee.updated', {
        id: employee.id,
        departmentId: targetDeptId,
        managerId: finalManagerId,
        status: 'ACTIVE'
      }, { source: 'organization-service' });

      events.publish('employee.invited', {
        empId: employee.id,
        email: targetEmail,
        departmentId: targetDeptId,
        departmentName: targetDept.name,
        managerId: finalManagerId,
        managerName: callerName,
        position: finalPosTitle || employee.position_title
      }, { source: 'organization-service' });

      return success(
        res,
        {
          id: employee.id,
          fullName: employee.full_name,
          email: targetEmail,
          departmentId: targetDeptId,
          departmentName: targetDept.name,
          managerId: finalManagerId,
          position: finalPosTitle || employee.position_title,
          status: 'ACTIVE'
        },
        200,
        `Đã tiếp nhận nhân viên ${employee.full_name || targetEmail} vào phòng ban ${targetDept.name} thành công`
      );
    } catch (err) {
      console.error('[ORG-INVITE-ERROR]:', err);
      return error(res, 'Lỗi tiếp nhận nhân viên vào phòng ban: ' + err.message);
    }
  }
);

// 1. Quản lý / Admin gửi lời mời nhân viên qua email (POST /api/organization/invitations)
app.post(['/api/organization/invitations', '/api/invitations'], async (req, res) => {
  try {
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;
    const { email, department_id, departmentId, shift_id, shiftId, office_id, officeId, note } = req.body;

    if (!email) {
      return badRequest(res, 'Vui lòng cung cấp email của nhân viên cần mời');
    }

    let targetDeptId = department_id || departmentId || null;
    let targetDept = null;
    const useDb = await isDbAvailable();

    // Nếu không chỉ định phòng ban, tự động lấy phòng ban do quản lý này phụ trách
    if (!targetDeptId) {
      if (useDb) {
        const rows = await db.query('SELECT * FROM departments WHERE manager_id = ? LIMIT 1', [callerEmpId], DB_NAME);
        if (rows.length > 0) targetDept = rows[0];
      } else {
        targetDept = Array.from(memoryDepartments.values()).find((d) => d.manager_id === callerEmpId) || null;
      }
      if (targetDept) targetDeptId = targetDept.id;
    } else {
      if (useDb) {
        const rows = await db.query('SELECT * FROM departments WHERE id = ? LIMIT 1', [targetDeptId], DB_NAME);
        if (rows.length > 0) targetDept = rows[0];
      } else {
        targetDept = memoryDepartments.get(targetDeptId) || null;
      }
    }

    // Nếu vẫn chưa có phòng ban: Quản lý chưa được phân công phòng ban không được gửi lời mời
    if (!targetDept) {
      if (callerRole === 'MANAGER') {
        return badRequest(res, 'Tài khoản Quản lý chưa được phân công phòng ban phụ trách nên không thể gửi lời mời tham gia');
      }
      targetDept = Array.from(memoryDepartments.values())[0];
      targetDeptId = targetDept?.id;
    }

    const inviteCode = targetDept?.invite_code || `TEAM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const invId = crypto.randomUUID();

    const invRecord = {
      id: invId,
      department_id: targetDeptId,
      department_name: targetDept?.name || 'Phòng ban làm việc',
      manager_id: targetDept?.manager_id || callerEmpId,
      manager_name: req.user?.fullName || req.user?.username || 'Quản lý bộ phận',
      target_email: email.trim().toLowerCase(),
      invite_code: inviteCode,
      shift_id: shift_id || shiftId || 'shift-standard',
      office_id: office_id || officeId || 'office-default',
      note: note || 'Lời mời tham gia phòng ban từ Quản lý',
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    memoryInvitations.set(invId, invRecord);

    events.publish('invitation.created', {
      invitationId: invId,
      email: invRecord.target_email,
      departmentId: targetDeptId,
      inviteCode
    }, { source: 'organization-service' });

    return created(res, {
      id: invId,
      email: invRecord.target_email,
      departmentId: targetDeptId,
      departmentName: invRecord.department_name,
      inviteCode,
      status: 'PENDING'
    }, `Đã gửi lời mời tham gia phòng ban ${invRecord.department_name} tới ${email}`);
  } catch (err) {
    return error(res, 'Lỗi gửi lời mời: ' + err.message);
  }
});

// 2. Danh sách lời mời đã gửi (Quản lý xem danh sách lời mời phòng ban mình gửi)
app.get(['/api/organization/invitations', '/api/invitations'], async (req, res) => {
  try {
    const callerRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;

    let list = Array.from(memoryInvitations.values());
    if (callerRole === 'MANAGER' && callerEmpId) {
      list = list.filter((inv) => inv.manager_id === callerEmpId);
    }

    return success(res, list, 200, 'Thành công', { total: list.length });
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
});

// 3. Nhân viên xem các lời mời đang chờ gửi tới mình (GET /api/organization/invitations/my-pending)
app.get(['/api/organization/invitations/my-pending', '/api/invitations/my-pending'], async (req, res) => {
  try {
    const callerEmail = (req.user?.email || '').toLowerCase();
    const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.id;

    const pending = Array.from(memoryInvitations.values()).filter(
      (inv) => inv.status === 'PENDING' && (
        (callerEmail && inv.target_email === callerEmail) ||
        (callerEmpId && inv.target_emp_id === callerEmpId)
      )
    );

    return success(res, pending, 200, 'Thành công', { total: pending.length });
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
});

// 4. Nhân viên tham gia phòng ban bằng inviteCode hoặc invitationId (POST /api/organization/join-department)
app.post(['/api/organization/join-department', '/api/organization/departments/join', '/api/departments/join'], async (req, res) => {
  try {
    const { inviteCode, invite_code, invitationId, invitation_id } = req.body;
    const targetCode = (inviteCode || invite_code || '').trim().toUpperCase();
    const targetInvId = invitationId || invitation_id;

    const callerEmpId = req.headers['x-user-id'] || req.user?.empId || req.user?.userId || req.user?.id;
    const callerEmail = (req.user?.email || '').toLowerCase();

    if (!targetCode && !targetInvId) {
      return badRequest(res, 'Vui lòng cung cấp mã mời (inviteCode) hoặc mã thư mời (invitationId)');
    }

    let dept = null;
    let matchedInvitation = null;

    // Tìm theo invitationId nếu có
    if (targetInvId && memoryInvitations.has(targetInvId)) {
      matchedInvitation = memoryInvitations.get(targetInvId);
      dept = memoryDepartments.get(matchedInvitation.department_id);
    }

    // Tìm phòng ban theo inviteCode
    if (!dept && targetCode) {
      dept = Array.from(memoryDepartments.values()).find(
        (d) => (d.invite_code && d.invite_code.toUpperCase() === targetCode) ||
               (d.code && d.code.toUpperCase() === targetCode) ||
               (d.code && `TEAM-${d.code.replace(/^PB-/, '').toUpperCase()}` === targetCode)
      );

      // Nếu chưa thấy, tìm trong memoryInvitations xem mã này được sinh trong lời mời nào không
      if (!dept) {
        const matchedInv = Array.from(memoryInvitations.values()).find(
          (inv) => inv.invite_code && inv.invite_code.toUpperCase() === targetCode
        );
        if (matchedInv) {
          matchedInvitation = matchedInv;
          dept = memoryDepartments.get(matchedInv.department_id);
        }
      }
    }

    if (!dept) {
      return notFound(res, `Không tìm thấy phòng ban với mã mời "${targetCode}". Vui lòng kiểm tra lại với Quản lý.`);
    }

    // Cập nhật hồ sơ nhân sự của người gọi vào phòng ban này
    const useDb = await isDbAvailable();
    let updatedEmp = null;

    if (useDb) {
      try {
        await db.query(
          `UPDATE employees 
           SET department_id = ?, manager_id = ?, status = 'ACTIVE' 
           WHERE id = ? OR email = ?`,
          [dept.id, dept.manager_id, callerEmpId, callerEmail],
          DB_NAME
        );
        const rows = await db.query('SELECT * FROM employees WHERE id = ? OR email = ? LIMIT 1', [callerEmpId, callerEmail], DB_NAME);
        updatedEmp = rows[0];
      } catch (dbErr) {
        console.warn('[ORG] Lỗi cập nhật DB khi join-department:', dbErr.message);
      }
    }

    // Cập nhật trong bộ nhớ
    let memEmp = memoryEmployees.get(callerEmpId);
    if (!memEmp && callerEmail) {
      memEmp = Array.from(memoryEmployees.values()).find((e) => e.email === callerEmail);
    }

    if (memEmp) {
      memEmp.department_id = dept.id;
      memEmp.manager_id = dept.manager_id;
      memEmp.status = 'ACTIVE';
      updatedEmp = memEmp;
    } else if (callerEmpId) {
      const newEmp = {
        id: callerEmpId,
        code: 'EMP_' + Math.floor(10000 + Math.random() * 90000),
        full_name: req.user?.fullName || req.user?.username || 'Nhân viên mới',
        email: callerEmail,
        department_id: dept.id,
        manager_id: dept.manager_id,
        status: 'ACTIVE',
        join_date: new Date().toISOString().split('T')[0]
      };
      memoryEmployees.set(callerEmpId, newEmp);
      updatedEmp = newEmp;
    }

    // Cập nhật trạng thái lời mời (nếu có)
    if (matchedInvitation) {
      matchedInvitation.status = 'ACCEPTED';
    } else if (callerEmail) {
      for (const inv of memoryInvitations.values()) {
        if (inv.target_email === callerEmail && inv.department_id === dept.id) {
          inv.status = 'ACCEPTED';
        }
      }
    }

    // Bắn sự kiện lên Event Bus để các phân hệ khác (Shift, Attendance, Notification) đồng bộ
    events.publish('department.member_joined', {
      empId: callerEmpId,
      departmentId: dept.id,
      departmentName: dept.name,
      managerId: dept.manager_id,
      shiftId: dept.default_shift_id || 'shift-standard',
      officeId: dept.office_id || 'office-default'
    }, { source: 'organization-service' }).catch(() => {});

    return success(res, {
      departmentId: dept.id,
      departmentName: dept.name,
      managerId: dept.manager_id,
      inviteCode: dept.invite_code || targetCode,
      status: 'ACTIVE',
      employee: updatedEmp
    }, 200, `Chúc mừng bạn đã gia nhập thành công phòng ban "${dept.name}"!`);
  } catch (err) {
    return error(res, 'Lỗi tham gia phòng ban: ' + err.message);
  }
});

// 5. Chấp nhận lời mời (POST /api/organization/invitations/:id/accept)
app.post(['/api/organization/invitations/:id/accept', '/api/invitations/:id/accept'], async (req, res) => {
  const invId = req.params.id;
  const inv = memoryInvitations.get(invId);
  if (!inv) return notFound(res, 'Không tìm thấy lời mời');
  req.body.invitationId = invId;
  req.body.inviteCode = inv.invite_code;
  return app._router.handle(req, res, () => {});
});

// 6. Từ chối lời mời (POST /api/organization/invitations/:id/reject)
app.post(['/api/organization/invitations/:id/reject', '/api/invitations/:id/reject'], async (req, res) => {
  const invId = req.params.id;
  const inv = memoryInvitations.get(invId);
  if (!inv) return notFound(res, 'Không tìm thấy lời mời');
  inv.status = 'REJECTED';
  return success(res, { id: invId, status: 'REJECTED' }, 200, 'Đã từ chối lời mời tham gia phòng ban');
});

// 7. Internal API: Tra cứu Scope của nhân viên cho các Microservice khác (GET /internal/organization/employee-scope)
app.get('/internal/organization/employee-scope', async (req, res) => {
  try {
    const { empId, role } = req.query;
    if (!empId) return badRequest(res, 'Thiếu empId');

    const empRole = (role || 'EMPLOYEE').toUpperCase();
    if (['ADMIN', 'HR'].includes(empRole)) {
      return success(res, { isFullAccess: true, isUnassigned: false, allowedEmpIds: null });
    }

    let emp = memoryEmployees.get(empId);
    if (!emp) {
      emp = Array.from(memoryEmployees.values()).find((e) => e.email === empId);
    }

    if (empRole === 'EMPLOYEE') {
      const isUnassigned = !emp || (!emp.department_id && !emp.manager_id);
      return success(res, {
        isUnassigned,
        allowedEmpIds: isUnassigned ? [] : [emp.id],
        departmentId: emp?.department_id || null,
        managerId: emp?.manager_id || null
      });
    }

    if (empRole === 'MANAGER') {
      let managedDepts = [];
      let subordinates = [];
      const useDb = await isDbAvailable();
      if (useDb) {
        try {
          const deptRows = await db.query('SELECT id FROM departments WHERE manager_id = ?', [empId], DB_NAME);
          managedDepts = deptRows.map((d) => d.id);
          const subRows = await db.query(
            'SELECT id FROM employees WHERE manager_id = ? OR (department_id IS NOT NULL AND department_id IN (?))',
            [empId, managedDepts.length > 0 ? managedDepts : ['__none__']],
            DB_NAME
          );
          subordinates = subRows;
        } catch {}
      } else {
        managedDepts = Array.from(memoryDepartments.values())
          .filter((d) => d.manager_id === empId)
          .map((d) => d.id);
        subordinates = Array.from(memoryEmployees.values()).filter(
          (e) => e.manager_id === empId || (e.department_id && managedDepts.includes(e.department_id))
        );
      }
      const allowedEmpIds = subordinates.map((e) => e.id);
      const isUnassigned = managedDepts.length === 0 && (!emp || !emp.department_id);
      return success(res, {
        isUnassigned,
        allowedEmpIds,
        managedDepts,
        count: allowedEmpIds.length
      });
    }

    return success(res, { isUnassigned: false, allowedEmpIds: [empId] });
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
});

// ==============================================================================
// 4. NHẬT KÝ HỆ THỐNG (AUDIT LOGS - ADMIN ONLY)
// ==============================================================================
app.get('/api/organization/audit-logs', async (req, res) => {
  try {
    const currentUser = req.user;
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return forbidden(res, 'Chỉ ADMIN mới có quyền truy cập nhật ký kiểm toán hệ thống');
    }

    const useDb = await isDbAvailable();
    let logs = [];

    if (useDb) {
      logs = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100', [], DB_NAME);
    } else {
      logs = memoryAuditLogs.slice(0, 100);
    }

    return success(res, logs);
  } catch (err) {
    console.error('[ORG-UPDATE-ERROR]:', err);
    return error(res, err.message);
  }
});

// ==============================================================================
// 5. WEBHOOK NHẬN SỰ KIỆN TỪ EVENT BUS
// ==============================================================================
app.use(
  '/events',
  events.createWebhookRouter({
    'user.registered': async (event) => {
      const { userId, email, empId, username, fullName } = event.data || {};
      console.log(`[ORG-SERVICE] Nhận event user.registered: tài khoản "${email}" (id: ${userId})`);
      const finalId = empId || userId || crypto.randomUUID();
      const fName = fullName || username || (email ? email.split('@')[0] : 'Nhân sự mới');
      const code = 'EMP_' + (username ? username.toUpperCase() : Math.floor(10000 + Math.random() * 90000));

      const useDb = await isDbAvailable();
      if (useDb) {
        try {
          const rows = await db.query('SELECT id FROM employees WHERE email = ? LIMIT 1', [email], DB_NAME);
          if (rows.length > 0) {
            const matchedEmpId = rows[0].id;
            await db.query('UPDATE htqlns_auth.users SET emp_id = ? WHERE id = ?', [matchedEmpId, userId]);
            console.log(`[ORG-SERVICE] Đã tự động gắn emp_id ${matchedEmpId} cho user ${userId}`);
          } else {
            await db.query(
              `INSERT INTO employees (id, code, full_name, email, phone, department_id, manager_id, status, contract_type)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, 'PENDING_ASSIGNMENT', 'PENDING')`,
              [finalId, code, fName, email, '-'],
              DB_NAME
            );
            try {
              await db.query('UPDATE htqlns_auth.users SET emp_id = ? WHERE id = ?', [finalId, userId]);
            } catch {}
          }
        } catch (err) {
          console.warn('[ORG-SERVICE] Lỗi thêm employee từ event:', err.message);
        }
      } else {
        const existing = Array.from(memoryEmployees.values()).find(e => e.email === email);
        if (!existing) {
          memoryEmployees.set(finalId, {
            id: finalId,
            username: username || (email ? email.split('@')[0] : 'user'),
            code: 'CHỜ CẤP MÃ',
            full_name: fName,
            email: email,
            phone: '-',
            department_id: null,
            departmentName: null,
            position_id: null,
            manager_id: null,
            office_id: null,
            shift_id: null,
            contract_type: 'PENDING',
            status: 'PENDING_ASSIGNMENT',
            created_at: new Date().toISOString()
          });
          console.log(`[ORG-SERVICE] Đã tự động tạo memoryEmployee chờ tiếp nhận cho: ${email}`);
        }
      }
    }
  })
);

// OpenAPI Spec
app.get('/api-docs.json', (req, res) => {
  const spec = createOpenApiSpec('organization-service', {
    description: 'Organization Service – Quản lý Phòng ban & Nhân sự HTQLNS',
    paths: {
      '/api/organization/departments': {
        get: { summary: 'Lấy danh sách cơ cấu phòng ban' },
        post: { summary: 'Tạo phòng ban mới' }
      },
      '/api/organization/positions': {
        get: { summary: 'Lấy danh mục chức danh việc làm' }
      },
      '/api/organization/employees': {
        get: { summary: 'Lấy danh sách hồ sơ nhân sự' },
        post: { summary: 'Tạo mới hồ sơ nhân sự' }
      }
    }
  });
  res.json(spec);
});

app.useErrorHandler();

const server = app.start(PORT, () => {
  try {
    registerService({
      name: 'organization-service',
      port: PORT,
      url: process.env.SERVICE_URL || `http://localhost:${PORT}`
    });
  } catch (err) {
    console.warn('[ORGANIZATION-SERVICE] Không thể đăng ký với Registry:', err.message);
  }

  // Subscribe nhận sự kiện từ Event Bus
  setTimeout(async () => {
    try {
      await events.subscribe(['user.registered'], `http://localhost:${PORT}/events`, {
        serviceName: 'organization-service'
      });
    } catch {}
  }, 2000);
});

module.exports = { app, server };
