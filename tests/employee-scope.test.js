/**
 * tests/employee-scope.test.js
 * Bộ kiểm thử cho Cơ chế Cô lập dữ liệu (shared/employee-scope.js)
 * và API Mời / Tham gia phòng ban (organization-service)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');
const {
  getUserFromReq,
  resolveEmployeeScope,
  sendScopedResponse,
  requireAssignedEmployee
} = require('../shared/employee-scope');

describe('1. Kiểm thử Unit Test: shared/employee-scope.js', () => {
  test('getUserFromReq trích xuất chính xác từ header x-user-id và x-user-role', () => {
    const mockReq = {
      headers: {
        'x-user-id': 'emp-1234',
        'x-user-role': 'EMPLOYEE'
      }
    };
    const user = getUserFromReq(mockReq);
    assert.strictEqual(user.empId, 'emp-1234');
    assert.strictEqual(user.role, 'EMPLOYEE');
    assert.strictEqual(user.isEmployee, true);
    assert.strictEqual(user.isManager, false);
    assert.strictEqual(user.isFullAccess, false);
  });

  test('getUserFromReq giải mã token Base64 từ x-user chuyển tiếp bởi Gateway', () => {
    const payload = {
      userId: 'u-999',
      empId: 'emp-999',
      username: 'manager_hieu',
      role: 'MANAGER',
      email: 'manager.hieu@htqlns.com'
    };
    const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const mockReq = {
      headers: {
        'x-user': base64
      }
    };
    const user = getUserFromReq(mockReq);
    assert.strictEqual(user.empId, 'emp-999');
    assert.strictEqual(user.role, 'MANAGER');
    assert.strictEqual(user.isManager, true);
    assert.strictEqual(user.email, 'manager.hieu@htqlns.com');
  });

  test('resolveEmployeeScope: ADMIN và HR có toàn quyền (isFullAccess: true, shouldReturnEmpty: false)', async () => {
    const adminReq = {
      headers: { 'x-user-role': 'ADMIN', 'x-user-id': 'admin-01' }
    };
    const scope = await resolveEmployeeScope(adminReq);
    assert.strictEqual(scope.isFullAccess, true);
    assert.strictEqual(scope.shouldReturnEmpty, false);
    assert.strictEqual(scope.allowedEmpIds, null);
  });

  test('resolveEmployeeScope: EMPLOYEE chưa thuộc phòng ban trả về shouldReturnEmpty: true và mảng rỗng []', async () => {
    const unassignedReq = {
      headers: {
        'x-user-role': 'EMPLOYEE',
        'x-user-id': 'newbie-uuid-999',
        'x-test-unassigned': 'true'
      },
      user: {
        email: 'newbie@htqlns.com'
      }
    };
    const scope = await resolveEmployeeScope(unassignedReq, {
      memoryLookup: () => ({ id: 'newbie-uuid-999', department_id: null, manager_id: null })
    });
    assert.strictEqual(scope.isUnassigned, true);
    assert.strictEqual(scope.shouldReturnEmpty, true);
    assert.deepStrictEqual(scope.allowedEmpIds, []);
  });

  test('resolveEmployeeScope: EMPLOYEE đã thuộc phòng ban chỉ truy vấn chính user đó', async () => {
    const assignedReq = {
      headers: {
        'x-user-role': 'EMPLOYEE',
        'x-user-id': 'emp-dev-01'
      },
      user: {
        email: 'dev@htqlns.com'
      }
    };
    const scope = await resolveEmployeeScope(assignedReq, {
      memoryLookup: () => ({ id: 'emp-dev-01', department_id: 'd-tech', manager_id: 'mgr-01' })
    });
    assert.strictEqual(scope.isUnassigned, false);
    assert.strictEqual(scope.shouldReturnEmpty, false);
    assert.deepStrictEqual(scope.allowedEmpIds, ['emp-dev-01']);
  });

  test('resolveEmployeeScope: MANAGER mới chưa có nhân viên trả về shouldReturnEmpty: true và 0 nhân sự', async () => {
    const newMgrReq = {
      headers: {
        'x-user-role': 'MANAGER',
        'x-user-id': 'new-manager-001'
      }
    };
    const scope = await resolveEmployeeScope(newMgrReq, {
      memoryLookup: () => []
    });
    assert.strictEqual(scope.isManager, true);
    assert.strictEqual(scope.shouldReturnEmpty, true);
    assert.deepStrictEqual(scope.allowedEmpIds, []);
  });

  test('resolveEmployeeScope: MANAGER có nhân sự chỉ lấy danh sách cấp dưới', async () => {
    const activeMgrReq = {
      headers: {
        'x-user-role': 'MANAGER',
        'x-user-id': 'mgr-tech-01'
      }
    };
    const scope = await resolveEmployeeScope(activeMgrReq, {
      memoryLookup: () => ['emp-001', 'emp-002', 'mgr-tech-01']
    });
    assert.strictEqual(scope.shouldReturnEmpty, false);
    assert.deepStrictEqual(scope.allowedEmpIds, ['emp-001', 'emp-002', 'mgr-tech-01']);
  });

  test('sendScopedResponse tạo cấu trúc chuẩn SOA { success, message, data, meta }', () => {
    const mockRes = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };

    sendScopedResponse(mockRes, [{ id: 1 }, { id: 2 }], 'Lấy dữ liệu thành công', { custom: true });
    assert.strictEqual(mockRes.payload.success, true);
    assert.strictEqual(mockRes.payload.message, 'Lấy dữ liệu thành công');
    assert.strictEqual(mockRes.payload.data.length, 2);
    assert.strictEqual(mockRes.payload.meta.custom, true);
  });

  test('requireAssignedEmployee chặn nhân viên chưa có phòng ban với mã 403', async () => {
    const unassignedReq = {
      headers: {
        'x-user-role': 'EMPLOYEE',
        'x-user-id': 'emp-unassigned',
        'x-test-unassigned': 'true'
      }
    };
    const mockRes = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };
    let nextCalled = false;

    const middleware = requireAssignedEmployee({
      memoryLookup: () => null
    });

    await middleware(unassignedReq, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(mockRes.statusCode, 403);
    assert.strictEqual(mockRes.payload.meta?.unassigned, true);
  });
});

describe('2. Kiểm thử Tích hợp API: Cơ chế Mời & Tham gia phòng ban (:3107)', () => {
  let orgProcess = null;
  const TEST_ORG_PORT = 3107;

  const managerToken = jwt.signToken({
    userId: 'u_mgr_test',
    empId: 'e0000001-0000-0000-0000-000000000003',
    username: 'manager_test',
    email: 'manager_test@htqlns.com',
    role: 'MANAGER'
  });

  const employeeToken = jwt.signToken({
    userId: 'u_emp_test_invite',
    empId: 'e_emp_test_invite',
    username: 'emp_invitee',
    email: 'emp_invitee@htqlns.com',
    role: 'EMPLOYEE'
  });

  before(async () => {
    orgProcess = fork(path.resolve(__dirname, '..', 'services', 'organization-service', 'index.js'), [], {
      env: {
        ...process.env,
        ORGANIZATION_PORT: String(TEST_ORG_PORT),
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${TEST_ORG_PORT}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  after(() => {
    if (orgProcess) orgProcess.kill();
  });

  let createdInviteId = null;
  let departmentInviteCode = 'TEAM-TECH';

  test('Quản lý tạo lời mời tham gia phòng ban qua email (POST /api/organization/invitations)', async () => {
    const res = await fetch(`http://localhost:${TEST_ORG_PORT}/api/organization/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managerToken}`,
        'x-user-role': 'MANAGER',
        'x-user-id': 'e0000001-0000-0000-0000-000000000003'
      },
      body: JSON.stringify({
        email: 'emp_invitee@htqlns.com',
        shiftId: 'shift-standard',
        note: 'Chào mừng bạn tham gia phòng Công nghệ phần mềm!'
      })
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.email, 'emp_invitee@htqlns.com');
    assert.ok(body.data.inviteCode, 'Phải có mã inviteCode');
    createdInviteId = body.data.id;
    departmentInviteCode = body.data.inviteCode;
  });

  test('Nhân viên tra cứu lời mời gửi tới chính mình (GET /api/organization/invitations/my-pending)', async () => {
    const res = await fetch(`http://localhost:${TEST_ORG_PORT}/api/organization/invitations/my-pending`, {
      headers: {
        'Authorization': `Bearer ${employeeToken}`,
        'x-user-role': 'EMPLOYEE',
        'x-user-id': 'e_emp_test_invite'
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
    const myInv = body.data.find(inv => inv.id === createdInviteId);
    assert.ok(myInv, 'Phải tìm thấy lời mời vừa được Quản lý gửi');
    assert.strictEqual(myInv.target_email, 'emp_invitee@htqlns.com');
  });

  test('Nhân viên xác nhận tham gia phòng ban qua inviteCode (POST /api/organization/join-department)', async () => {
    const res = await fetch(`http://localhost:${TEST_ORG_PORT}/api/organization/join-department`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeToken}`,
        'x-user-role': 'EMPLOYEE',
        'x-user-id': 'e_emp_test_invite'
      },
      body: JSON.stringify({
        inviteCode: departmentInviteCode
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.departmentId, 'Phải cập nhật departmentId cho nhân viên');
    assert.strictEqual(body.data.status, 'ACTIVE');
  });

  test('Từ chối tham gia với mã mời không hợp lệ (HTTP 404)', async () => {
    const res = await fetch(`http://localhost:${TEST_ORG_PORT}/api/organization/join-department`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeToken}`,
        'x-user-role': 'EMPLOYEE',
        'x-user-id': 'e_emp_test_invite'
      },
      body: JSON.stringify({
        inviteCode: 'INVALID-CODE-9999'
      })
    });

    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });
});
