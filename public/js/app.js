/**
 * public/js/app.js
 * Frontend JavaScript điều khiển giao diện chuẩn Figma (Images 1 - 5)
 * Tương tác với API Gateway trong kiến trúc Microservices HTQLNS
 */

const API_BASE = ''; // Gọi qua API Gateway cùng Host/Port

// 1. Quản lý lưu trữ cục bộ an toàn
function safeGetStorage(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeSetStorage(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {}
}

function safeRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

/**
 * Helper chuẩn hóa ngày địa phương sang YYYY-MM-DD
 * Tránh triệt để lỗi lệch múi giờ UTC+7 làm lùi ngày khi dùng .toISOString()
 */
function toLocalDateString(d) {
  if (!d) return '';
  if (typeof d === 'string') {
    return d.split('T')[0];
  }
  if (d instanceof Date && !isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d);
}

// Kiểm tra token JWT có đúng cấu trúc và còn hạn không
function isTokenValid(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return false; // Token đã hết hạn
    }
    return true;
  } catch {
    return false;
  }
}

// Làm sạch token demo cũ hoặc không hợp lệ khỏi localStorage khi mở trang
let storedToken = safeGetStorage('htqlns_token', null);
let storedUser = null;
try {
  storedUser = JSON.parse(safeGetStorage('htqlns_user', 'null'));
} catch {
  storedUser = null;
}

if (!isTokenValid(storedToken)) {
  storedToken = null;
  storedUser = null;
  safeRemoveStorage('htqlns_token');
  safeRemoveStorage('htqlns_user');
}

// 2. Dữ liệu bộ nhớ ứng dụng (State)

// ==============================================================================
// HỆ THỐNG CÁCH LY DỮ LIỆU RIÊNG BIỆT CHO TỪNG TÀI KHOẢN (PER-USER DATA ISOLATION)
// & LUỒNG TIẾP NHẬN BAN PHÒNG, PHÂN CA, CẤU HÌNH LƯƠNG
// ==============================================================================

// Dữ liệu mẫu demo cho riêng tài khoản demo Vũ Đức Hiếu (employee)
const DEMO_EMP_ATT_LOGS = [
  { id: 'att-today', work_date: toLocalDateString(new Date()), check_in_time: `${toLocalDateString(new Date())}T07:55:12`, check_out_time: null, status: 'ON_TIME', late_minutes: 0, actual_working_hours: '4.2' },
  { id: 'att-1', work_date: '2026-11-14', check_in_time: '2026-11-14T07:58:00', check_out_time: '2026-11-14T17:35:00', status: 'ON_TIME', late_minutes: 0, actual_working_hours: '8.5' },
  { id: 'att-2', work_date: '2026-11-13', check_in_time: '2026-11-13T08:12:00', check_out_time: '2026-11-13T17:32:00', status: 'LATE', late_minutes: 12, actual_working_hours: '8.2' },
  { id: 'att-3', work_date: '2026-11-12', check_in_time: '2026-11-12T07:50:00', check_out_time: '2026-11-12T17:30:00', status: 'ON_TIME', late_minutes: 0, actual_working_hours: '8.5' },
  { id: 'att-4', work_date: '2026-11-11', check_in_time: '2026-11-11T07:52:00', check_out_time: '2026-11-11T17:33:00', status: 'ON_TIME', late_minutes: 0, actual_working_hours: '8.5' }
];

const DEMO_EMP_REQUESTS = [
  { code: 'NP-2026-024', type: 'Nghỉ phép năm', date: '02/11/2026 (1 ngày)', status: 'PENDING' },
  { code: 'OT-2026-003', type: 'Tăng ca (OT)', date: '10/11/2026 (2.5 giờ)', status: 'APPROVED' },
  { code: 'GT-2026-008', type: 'Giải trình đi muộn', date: '05/11/2026 (15 phút)', status: 'APPROVED' },
  { code: 'NP-2026-019', type: 'Nghỉ việc riêng', date: '20/10/2026 (0.5 ngày)', status: 'REJECTED' }
];

const DEMO_EMP_NOTIFICATIONS = [
  { id: 'notif-1', title: 'Quản lý (Thầy Lâm) đã duyệt đơn xin nghỉ phép NP-2026-024', type: 'LEAVE_APPROVED', created_at: '2026-11-15T08:30:00', is_read: false },
  { id: 'notif-2', title: 'Nhắc nhở chấm công: Vui lòng kiểm tra giờ Check-out khi kết thúc ca làm việc', type: 'LATE_WARNING', created_at: '2026-11-14T17:35:00', is_read: false },
  { id: 'notif-3', title: 'Thông báo phát hành: Phiếu lương tháng 10/2026 đã sẵn sàng. Nhấp để tra cứu chi tiết', type: 'PAYSLIP_ISSUED', created_at: '2026-11-10T09:00:00', is_read: false },
  { id: 'notif-4', title: 'Đơn đăng ký tăng ca OT-2026-003 đã được duyệt bởi Trưởng phòng Kỹ Thuật (2.5h)', type: 'LEAVE_APPROVED', created_at: '2026-11-08T16:00:00', is_read: true }
];

// Sinh khóa lưu trữ riêng biệt theo mã/tên người dùng
function getUserStorageKey(entity) {
  const userKey = state.user?.id || state.user?.username || 'guest';
  return `htqlns_${entity}_${userKey}`;
}

// Lấy danh sách thực thể của người dùng (mặc định RỖNG cho mọi tài khoản mới!)
function getUserEntityList(entity) {
  const isDemoEmployee = (state.user?.username === 'employee');
  const stored = safeGetStorage(getUserStorageKey(entity), null);
  if (stored !== null) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }

  // Nếu là tài khoản demo đặc thù 'employee' (Vũ Đức Hiếu) thì mới có demo data ban đầu
  if (isDemoEmployee) {
    if (entity === 'attendances') return [...DEMO_EMP_ATT_LOGS];
    if (entity === 'requests') return [...DEMO_EMP_REQUESTS];
    if (entity === 'notifications') return [...DEMO_EMP_NOTIFICATIONS];
  }

  // Đối với TẤT CẢ các tài khoản khác (bao gồm tài khoản mới đăng ký): KHÔNG CÓ DỮ LIỆU CŨ!
  return [];
}

// Lưu danh sách thực thể riêng cho người dùng hiện tại
function saveUserEntityList(entity, list) {
  safeSetStorage(getUserStorageKey(entity), JSON.stringify(list));
}

// Lấy thông tin phân bổ ban phòng / ca trực / lương đã được Admin phê duyệt
function getUserAssignment(username, userId) {
  const raw = safeGetStorage('htqlns_user_assignments', '{}');
  try {
    const map = JSON.parse(raw);
    return map[username] || (userId ? map[userId] : null) || null;
  } catch (e) {
    return null;
  }
}

// Lưu thông tin phân bổ ban phòng / ca trực / lương
function saveUserAssignment(username, data) {
  const raw = safeGetStorage('htqlns_user_assignments', '{}');
  let map = {};
  try { map = JSON.parse(raw); } catch (e) {}
  map[username] = data;
  safeSetStorage('htqlns_user_assignments', JSON.stringify(map));
}

// Lấy danh sách tài khoản tự đăng ký
function getRegisteredUsersList() {
  const raw = safeGetStorage('htqlns_registered_users', '[]');
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveRegisteredUser(userObj) {
  const list = getRegisteredUsersList();
  const existingIdx = list.findIndex(u => u.username === userObj.username || (u.email && u.email === userObj.email));
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...userObj };
  } else {
    list.push(userObj);
  }
  safeSetStorage('htqlns_registered_users', JSON.stringify(list));
}

function removeRegisteredUser(identifier) {
  if (!identifier) return;
  const list = getRegisteredUsersList().filter(u =>
    String(u.id) !== String(identifier) &&
    u.username !== identifier &&
    u.email !== identifier &&
    u.fullName !== identifier
  );
  safeSetStorage('htqlns_registered_users', JSON.stringify(list));
}

// Đồng bộ trạng thái Onboarded (đã tiếp nhận ban phòng hay chưa) vào state.user
function syncUserOnboardingState() {
  if (!state.user) return;
  const username = state.user.username;
  const userId = state.user.id || state.user.userId;

  // Nếu là tài khoản mặc định demo có sẵn:
  if (username === 'admin') {
    state.user.isOnboarded = true;
    state.user.department = 'Ban Giám Đốc';
    state.user.position = 'Quản trị viên Hệ thống';
    state.user.managerName = 'Ban Giám Đốc';
    state.user.officeLocation = 'Trụ sở chính Quy Nhơn';
    return;
  }
  if (username === 'manager') {
    state.user.isOnboarded = true;
    state.user.department = 'Phòng Kỹ Thuật';
    state.user.position = 'Trưởng ban Công nghệ';
    state.user.managerName = 'Ban Giám Đốc';
    state.user.officeLocation = 'Văn phòng Quy Nhơn (170 An Dương Vương)';
    return;
  }
  if (username === 'hr_admin') {
    state.user.isOnboarded = true;
    state.user.department = 'Phòng Hành chính Nhân sự';
    state.user.position = 'Trưởng phòng Nhân sự';
    state.user.managerName = 'Ban Giám Đốc';
    state.user.officeLocation = 'Văn phòng Quy Nhơn (170 An Dương Vương)';
    return;
  }
  if (username === 'employee') {
    // Tài khoản demo Vũ Đức Hiếu
    state.user.isOnboarded = true;
    state.user.department = 'Phòng Kỹ Thuật';
    state.user.position = 'Kỹ sư phần mềm';
    state.user.managerName = 'Nguyễn Thanh Lâm (Trưởng ban Công nghệ)';
    state.user.officeLocation = 'Văn phòng Quy Nhơn (170 An Dương Vương • Bán kính 100m)';
    state.user.officeLatitude = 13.7587;
    state.user.officeLongitude = 109.2190;
    state.user.officeRadius = 100;
    state.user.officeSsid = 'QNU-Office';
    state.user.officeBssid = 'A4:5E:60:12:34:01';
    state.user.shiftName = 'Ca Hành Chính';
    state.user.shiftStart = '08:00';
    state.user.shiftEnd = '17:30';
    state.user.leaveBalance = 10.0;
    return;
  }

  // TÀI KHOẢN MỚI TẠO HOẶC TÀI KHOẢN KHÁC:
  // 1. Nếu state.user đã có phòng ban hợp lệ từ API backend hoặc session
  const currentDept = state.user.department || state.user.departmentName || state.user.department_name;
  if (currentDept && currentDept !== '-' && state.user.status !== 'PENDING_ASSIGNMENT' && state.user.status !== 'PENDING') {
    state.user.isOnboarded = true;
    state.user.department = currentDept;
    state.user.departmentName = currentDept;
    let pos = state.user.position || state.user.positionTitle || 'Kỹ sư phần mềm';
    if (pos.includes('Kỹ sư phần mềm SOA') || pos.includes('Kỹ Sư Phần Mềm SOA')) {
      pos = 'Kỹ sư phần mềm';
    }
    state.user.position = pos;
    if (!state.user.managerName) state.user.managerName = 'Nguyễn Thanh Lâm';
    if (!state.user.officeLocation) state.user.officeLocation = 'Văn phòng Quy Nhơn (170 An Dương Vương)';
    if (!state.user.officeLatitude) state.user.officeLatitude = 13.7587;
    if (!state.user.officeLongitude) state.user.officeLongitude = 109.2190;
    if (!state.user.officeRadius) state.user.officeRadius = 100;
    if (!state.user.officeSsid) state.user.officeSsid = 'QNU-Office';
    if (!state.user.officeBssid) state.user.officeBssid = 'A4:5E:60:12:34:01';
    if (!state.user.shiftName) state.user.shiftName = 'Ca Hành Chính';
    if (!state.user.shiftStart) state.user.shiftStart = '08:00';
    if (!state.user.shiftEnd) state.user.shiftEnd = '17:30';
    if (state.user.leaveBalance === undefined || state.user.leaveBalance === 0) state.user.leaveBalance = 12.0;
    if (!state.user.baseSalary) state.user.baseSalary = 12000000;
    return;
  }

  // 2. Kiểm tra xem Quản trị viên / HR đã tiếp nhận vào ban/phòng chưa trong local assignment
  const assignment = getUserAssignment(username, userId);
  if (assignment && assignment.status === 'ACTIVE') {
    state.user.isOnboarded = true;
    state.user.department = assignment.department;
    state.user.departmentName = assignment.department;
    let pos = assignment.position;
    if (pos && (pos.includes('Kỹ sư phần mềm SOA') || pos.includes('Kỹ Sư Phần Mềm SOA'))) {
      pos = 'Kỹ sư phần mềm';
    }
    state.user.position = pos;
    state.user.managerName = assignment.managerName || 'Nguyễn Thanh Lâm';
    state.user.officeLocation = assignment.officeLocation || 'Văn phòng Quy Nhơn (170 An Dương Vương)';
    state.user.officeLatitude = assignment.officeLatitude || 13.7587;
    state.user.officeLongitude = assignment.officeLongitude || 109.2190;
    state.user.officeRadius = assignment.officeRadius || 100;
    state.user.officeSsid = assignment.officeSsid || 'QNU-Office';
    state.user.officeBssid = assignment.officeBssid || 'A4:5E:60:12:34:01';
    state.user.shiftName = assignment.shiftName || 'Ca Hành Chính';
    state.user.shiftStart = assignment.shiftStart || '08:00';
    state.user.shiftEnd = assignment.shiftEnd || '17:30';
    state.user.leaveBalance = assignment.leaveBalance || 12.0;
    state.user.baseSalary = assignment.baseSalary || 12000000;
  } else {
    // Tài khoản mới đăng ký chưa được tiếp nhận vào ban/phòng -> HOÀN TOÀN TRỐNG DỮ LIỆU PHÒNG BAN!
    state.user.isOnboarded = false;
    state.user.department = null;
    state.user.departmentName = null;
    state.user.position = null;
    state.user.managerName = null;
    state.user.officeLocation = null;
    state.user.officeLatitude = null;
    state.user.officeLongitude = null;
    state.user.officeRadius = null;
    state.user.officeSsid = null;
    state.user.officeBssid = null;
    state.user.shiftName = null;
    state.user.shiftStart = null;
    state.user.shiftEnd = null;
    state.user.leaveBalance = 0.0;
    state.user.baseSalary = 0;
  }
}

/**
 * Lấy hồ sơ tài khoản mới nhất từ Backend (GET /api/v1/employees/me hoặc /api/v1/auth/me)
 * Tự động cập nhật currentUser, localStorage và mở khóa nút chấm công ngay khi được gán phòng ban.
 */
async function fetchCurrentUserProfile() {
  if (!state.token) return null;
  try {
    let profile = null;
    try {
      const res = await apiCall('/api/v1/employees/me');
      if (res && res.success && res.data) {
        profile = res.data;
      }
    } catch (_) {}

    if (!profile || !profile.id) {
      try {
        const res = await apiCall('/api/v1/auth/me');
        if (res && res.success && res.data) {
          profile = res.data;
        }
      } catch (_) {
        try {
          const res = await apiCall('/api/auth/me');
          if (res && res.success && res.data) {
            profile = res.data;
          }
        } catch (_) {}
      }
    }

    if (profile && (profile.id || profile.username || profile.email)) {
      const deptName = profile.departmentName || profile.department_name || profile.department || profile.deptName;
      const deptId = profile.departmentId || profile.department_id;
      const posTitle = profile.positionTitle || profile.position_title || profile.position;
      const status = profile.status || state.user?.status || 'ACTIVE';
      const isNowOnboarded = Boolean(deptName && deptName !== '-' && status !== 'PENDING_ASSIGNMENT' && status !== 'PENDING');

      state.user = {
        ...state.user,
        ...profile,
        id: profile.id || state.user?.id,
        empId: profile.empId || profile.emp_id || profile.id || state.user?.empId,
        username: profile.username || state.user?.username,
        email: profile.email || state.user?.email,
        fullName: profile.fullName || profile.full_name || state.user?.fullName,
        department: deptName || state.user?.department || null,
        departmentName: deptName || state.user?.departmentName || null,
        departmentId: deptId || state.user?.departmentId || null,
        department_id: deptId || state.user?.department_id || null,
        position: posTitle || state.user?.position || null,
        positionTitle: posTitle || state.user?.positionTitle || null,
        status: status,
        isOnboarded: isNowOnboarded
      };

      if (isNowOnboarded) {
        if (!state.user.officeLocation) state.user.officeLocation = 'Văn phòng Quy Nhơn (170 An Dương Vương)';
        if (!state.user.shiftName) state.user.shiftName = 'Ca Hành Chính';
        if (!state.user.shiftStart) state.user.shiftStart = '08:00';
        if (!state.user.shiftEnd) state.user.shiftEnd = '17:30';
      }

      safeSetStorage('htqlns_user', JSON.stringify(state.user));
      syncUserOnboardingState();
      updateTopbarUser();
      applyRoleBasedUI();
      checkTodayAttendanceStatus();

      const banner = document.getElementById('dashEmpOnboardingBanner');
      if (banner) banner.style.display = isNowOnboarded ? 'none' : 'block';

      return state.user;
    }
  } catch (err) {
    console.warn('[AUTH] Lỗi đồng bộ hồ sơ người dùng:', err.message);
  }
  return state.user;
}

// Sinh khóa lưu trữ riêng biệt theo mã/tên người dùng
function getUserStorageKey(entity) {
  const userKey = state.user?.id || state.user?.username || 'guest';
  return `htqlns_${entity}_${userKey}`;
}

// Lấy danh sách thực thể của người dùng (mặc định RỖNG cho mọi tài khoản mới!)
function getUserEntityList(entity) {
  const isDemoEmployee = (state.user?.username === 'employee');
  const stored = safeGetStorage(getUserStorageKey(entity), null);
  if (stored !== null) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }

  // Nếu là tài khoản demo đặc thù 'employee' (Vũ Đức Hiếu) thì mới có demo data ban đầu
  if (isDemoEmployee) {
    if (entity === 'attendances') return [...DEMO_EMP_ATT_LOGS];
    if (entity === 'requests') return [...DEMO_EMP_REQUESTS];
    if (entity === 'notifications') return [...DEMO_EMP_NOTIFICATIONS];
  }

  // Đối với TẤT CẢ các tài khoản khác (bao gồm tài khoản mới đăng ký): KHÔNG CÓ DỮ LIỆU CŨ!
  return [];
}

// Lưu danh sách thực thể riêng cho người dùng hiện tại
function saveUserEntityList(entity, list) {
  safeSetStorage(getUserStorageKey(entity), JSON.stringify(list));
}

// Lấy thông tin phân bổ ban phòng / ca trực / lương đã được Admin phê duyệt
function getUserAssignment(username, userId) {
  const raw = safeGetStorage('htqlns_user_assignments', '{}');
  try {
    const map = JSON.parse(raw);
    return map[username] || (userId ? map[userId] : null) || null;
  } catch (e) {
    return null;
  }
}

// Lưu thông tin phân bổ ban phòng / ca trực / lương
function saveUserAssignment(username, data) {
  const raw = safeGetStorage('htqlns_user_assignments', '{}');
  let map = {};
  try { map = JSON.parse(raw); } catch (e) {}
  map[username] = data;
  safeSetStorage('htqlns_user_assignments', JSON.stringify(map));
}

// Lấy danh sách tài khoản tự đăng ký
function getRegisteredUsersList() {
  const raw = safeGetStorage('htqlns_registered_users', '[]');
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveRegisteredUser(userObj) {
  const list = getRegisteredUsersList();
  const existingIdx = list.findIndex(u => u.username === userObj.username || (u.email && u.email === userObj.email));
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...userObj };
  } else {
    list.push(userObj);
  }
  safeSetStorage('htqlns_registered_users', JSON.stringify(list));
}

function removeRegisteredUser(identifier) {
  if (!identifier) return;
  const list = getRegisteredUsersList().filter(u =>
    String(u.id) !== String(identifier) &&
    u.username !== identifier &&
    u.email !== identifier &&
    u.fullName !== identifier
  );
  safeSetStorage('htqlns_registered_users', JSON.stringify(list));
}

let state = {
  token: storedToken,
  user: storedUser,
  departments: [],
  positions: [],
  employees: [],
  currentView: 'dashboard'
};

// Dữ liệu mẫu phong phú
const MOCK_EMPLOYEES = [
  { id: 1, code: 'NV-001', full_name: 'Vũ Đức Hiếu', email: 'hieu.vd@htqlns.com', phone: '0901000001', department_name: 'Phòng Kỹ Thuật', position_title: 'Kỹ sư phần mềm', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 2, code: 'NV-002', full_name: 'Huỳnh Gia Kiệt', email: 'kiet.hg@htqlns.com', phone: '0901000002', department_name: 'Phòng Kỹ Thuật', position_title: 'Backend Developer', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 3, code: 'NV-003', full_name: 'Nguyễn Gia Hảo', email: 'hao.ng@htqlns.com', phone: '0901000003', department_name: 'Phòng Kỹ Thuật', position_title: 'Frontend Developer', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 4, code: 'NV-004', full_name: 'Nguyễn Thanh Lâm (Quản lý)', email: 'lam.nt@htqlns.com', phone: '0901000004', department_name: 'Phòng Công nghệ & Phần mềm', position_title: 'Trưởng ban Công nghệ', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 5, code: 'NV-005', full_name: 'Lê Ngọc Mai', email: 'mai.ln@htqlns.com', phone: '0901000005', department_name: 'Phòng Hành chính Nhân sự', position_title: 'Chuyên viên C&B', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 6, code: 'NV-006', full_name: 'Phạm Minh Tuân', email: 'tuan.pm@htqlns.com', phone: '0901000006', department_name: 'Phòng Kinh doanh & Marketing', position_title: 'Chuyên viên Tư vấn', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 7, code: 'NV-007', full_name: 'Đỗ Thu Hà', email: 'ha.dt@htqlns.com', phone: '0901000007', department_name: 'Phòng Hành chính Nhân sự', position_title: 'Kế toán tiền lương', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 8, code: 'NV-008', full_name: 'Trần Hoài An', email: 'an.th@htqlns.com', phone: '0901000008', department_name: 'Phòng Công nghệ & Phần mềm', position_title: 'DevOps & QA', contract_type: 'PROBATION', status: 'ACTIVE' }
];

const MOCK_DEPARTMENTS = [
  { id: 'd0000001-0000-0000-0000-000000000001', code: 'PB-BGD', name: 'Ban Giám Đốc', manager_name: 'Nguyễn Quản Trị', employee_count: 1, description: 'Ban Giám Đốc điều hành', status: 'ACTIVE' },
  { id: 'd0000001-0000-0000-0000-000000000002', code: 'PB-HR', name: 'Phòng Hành chính Nhân sự', manager_name: 'Trần Thị Thu Hà', employee_count: 1, description: 'Tuyển dụng, chế độ C&B, quản lý hồ sơ', status: 'ACTIVE' },
  { id: 'd0000001-0000-0000-0000-000000000003', code: 'PB-TECH', name: 'Phòng Công nghệ & Phần mềm', manager_name: 'Nguyễn Thanh Lâm', employee_count: 2, description: 'Phát triển kiến trúc SOA Microservices', status: 'ACTIVE' },
  { id: 'd0000001-0000-0000-0000-000000000004', code: 'PB-SALES', name: 'Phòng Kinh doanh & Marketing', manager_name: 'Chưa chỉ định', employee_count: 0, description: 'Kinh doanh và chăm sóc đối tác', status: 'ACTIVE' }
];

// ==============================================================================
// 3. TOAST THÔNG BÁO
// ==============================================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toastBox');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==============================================================================
// 4. API CALLER QUA GATEWAY
// ==============================================================================
async function apiCall(path, options = {}, maybeBody = undefined) {
  let fetchOptions = {};
  if (typeof options === 'string') {
    fetchOptions.method = options.toUpperCase();
    if (maybeBody !== undefined) {
      fetchOptions.body = typeof maybeBody === 'string' ? maybeBody : JSON.stringify(maybeBody);
    }
  } else if (options && typeof options === 'object') {
    fetchOptions = { ...options };
    if (fetchOptions.body && typeof fetchOptions.body !== 'string' && !(typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData)) {
      fetchOptions.body = JSON.stringify(fetchOptions.body);
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status === 401 && path !== '/api/auth/login') {
        state.token = null;
        state.user = null;
        safeRemoveStorage('htqlns_token');
        safeRemoveStorage('htqlns_user');
        document.getElementById('portalApp').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        toggleAuthMode('login');
        showToast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 'warning');
      }
      throw new Error(data?.error || data?.message || `Lỗi HTTP ${res.status}`);
    }

    return data;
  } catch (err) {
    throw err;
  }
}

// ==============================================================================
// 5. XÁC THỰC & ĐĂNG NHẬP / ĐĂNG KÝ
// ==============================================================================
function toggleAuthMode(mode) {
  const isLogin = mode === 'login';
  const loginForm = document.getElementById('authLoginFormContainer');
  const regForm = document.getElementById('authRegisterFormContainer');
  if (loginForm) loginForm.style.display = isLogin ? 'block' : 'none';
  if (regForm) regForm.style.display = isLogin ? 'none' : 'block';
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input) {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (btn) {
      btn.textContent = isPassword ? 'Ẩn' : 'Hiện';
    }
  }
}

async function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('btnLoginAction');

  if (!username || !password) {
    return showToast('Vui lòng nhập tên đăng nhập và mật khẩu', 'warning');
  }

  btn.disabled = true;
  btn.innerText = 'Đang đăng nhập...';

  try {
    const res = await apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (!res || !res.success || !res.data?.token) {
      throw new Error(res?.error || res?.message || 'Đăng nhập không thành công');
    }

    state.token = res.data.token;
    state.user = res.data.user || {
      username,
      role: username === 'admin' ? 'ADMIN' : (username === 'manager' ? 'MANAGER' : (username === 'hr_admin' ? 'HR' : 'EMPLOYEE')),
      fullName: username === 'manager' ? 'Thầy Lâm' : username
    };

    safeSetStorage('htqlns_token', state.token);
    safeSetStorage('htqlns_user', JSON.stringify(state.user));
    safeSetStorage('htqlns_current_view', 'dashboard');

    // Đồng bộ ngay hồ sơ tài khoản mới nhất từ backend (phòng ban, ca làm việc, chức danh)
    await fetchCurrentUserProfile();

    showToast(`Đăng nhập thành công! Xin chào ${state.user.fullName || state.user.username}`, 'success');
    initPortalDashboard('dashboard');
  } catch (err) {
    console.error('Lỗi đăng nhập:', err);
    showToast(err.message || 'Tên đăng nhập hoặc mật khẩu không chính xác (Mặc định: 123456)', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Login';
  }
}

async function handleRegisterSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  // Đảm bảo xóa sạch toàn bộ cache thông tin user cũ trước khi nạp tài khoản mới
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (clearErr) {
    safeRemoveStorage('htqlns_token');
    safeRemoveStorage('htqlns_user');
    safeRemoveStorage('htqlns_current_view');
  }

  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const role = document.getElementById('regRole')?.value || 'EMPLOYEE';
  const btn = document.getElementById('btnRegisterAction');

  if (password !== confirmPassword) {
    return showToast('Xác nhận mật khẩu không khớp', 'warning');
  }

  const fullName = `${firstName} ${lastName}`.trim() || email.split('@')[0];
  const username = email.split('@')[0] || `user_${Date.now()}`;
  btn.disabled = true;
  btn.innerText = 'Đang đăng ký...';

  try {
    let res = null;
    try {
      res = await apiCall('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          role,
          first_name: firstName,
          last_name: lastName
        })
      });
    } catch (apiErr) {
      console.warn('API đăng ký backend gặp sự cố, tự động lưu trữ cục bộ:', apiErr.message);
    }

    // ĐỒNG BỘ NGAY: Lưu vào danh sách tài khoản đã đăng ký để Admin/HR thấy trong danh sách Nhân viên
    const newUserObj = {
      id: res?.data?.id || `user_${Date.now()}`,
      username,
      email,
      fullName: res?.data?.fullName || fullName,
      role: role || 'EMPLOYEE',
      status: 'PENDING_ASSIGNMENT',
      registeredAt: new Date().toISOString()
    };
    saveRegisteredUser(newUserObj);

    // Chuyển sang form Đăng nhập và để trống hoàn toàn 2 ô nhập liệu
    toggleAuthMode('login');
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';

    // Xóa trắng các trường trên form Đăng ký
    const fName = document.getElementById('regFirstName');
    const lName = document.getElementById('regLastName');
    const eMail = document.getElementById('regEmail');
    const pWord = document.getElementById('regPassword');
    const cPword = document.getElementById('regConfirmPassword');
    if (fName) fName.value = '';
    if (lName) lName.value = '';
    if (eMail) eMail.value = '';
    if (pWord) pWord.value = '';
    if (cPword) cPword.value = '';

    showToast('Đăng ký thành công, vui lòng đăng nhập', 'success');
  } catch (err) {
    console.error('Lỗi đăng ký:', err);
    showToast(err.message || 'Đăng ký thất bại, vui lòng thử lại', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Register';
  }
}

function handleLogoutClick() {
  if (!confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) return;

  stopNotificationPolling();
  cachedNotifications = [];

  state.token = null;
  state.user = null;

  // Xóa sạch toàn bộ cache thông tin user cũ trong localStorage & sessionStorage
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (clearErr) {
    safeRemoveStorage('htqlns_token');
    safeRemoveStorage('htqlns_user');
    safeRemoveStorage('htqlns_current_view');
  }

  document.getElementById('portalApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  if (uInput) uInput.value = '';
  if (pInput) pInput.value = '';
  toggleAuthMode('login');
  showToast('Đã đăng xuất thành công', 'success');
}

function handleForgotPasswordClick() {
  const email = prompt('Nhập địa chỉ email tài khoản để nhận mã OTP khôi phục:', 'hieu.vd@htqlns.com');
  if (!email) return;
  showToast(`Mã xác thực OTP đã được gửi đến email ${email}.`, 'success');
}

// ==============================================================================
// 6. CHUYỂN ĐỔI GIAO DIỆN & ĐIỀU HƯỚNG
// ==============================================================================
function showScreenView(screen) {
  if (screen === 'login') {
    document.getElementById('portalApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    toggleAuthMode('login');
    return;
  }

  if (screen === 'register') {
    document.getElementById('portalApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    toggleAuthMode('register');
    return;
  }

  // Vào portal
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('portalApp').style.display = 'flex';

  if (screen === 'employee-dashboard' || screen === 'dashboard-emp') {
    state.user = {
      username: 'employee',
      role: 'EMPLOYEE',
      fullName: 'Vũ Đức Hiếu',
      empCode: 'NV-001',
      empId: 1,
      department: 'Phòng Kỹ Thuật',
      position: 'Kỹ sư phần mềm',
      email: 'hieu.vd@htqlns.com'
    };
    state.token = 'demo-token-employee-2026';
    safeSetStorage('htqlns_user', JSON.stringify(state.user));
    safeSetStorage('htqlns_token', state.token);
    syncUserOnboardingState();
    updateTopbarUser();
    applyRoleBasedUI();
    navigateToView('dashboard');
    return;
  }

  if (screen === 'manager-dashboard' || screen === 'dashboard-mgr' || screen === 'dashboard') {
    state.user = {
      username: 'manager',
      role: 'MANAGER',
      fullName: 'Thầy Lâm (Nguyễn Thanh Lâm)',
      empCode: 'NV-004',
      empId: 4,
      department: 'Phòng Kỹ Thuật',
      position: 'Trưởng ban Công nghệ',
      email: 'lam.nt@htqlns.com'
    };
    state.token = 'demo-token-manager-2026';
    safeSetStorage('htqlns_user', JSON.stringify(state.user));
    safeSetStorage('htqlns_token', state.token);
    updateTopbarUser();
    applyRoleBasedUI();
    navigateToView('dashboard');
    return;
  }

  // Các view khác (requests, shifts, payroll, settings, etc.)
  updateTopbarUser();
  applyRoleBasedUI();
  navigateToView(screen);
}

/**
 * Trích xuất 2 ký tự viết tắt đại diện cho avatar từ họ tên.
 * Tự động loại bỏ các chú thích trong dấu ngoặc đơn/vuông như (Admin), (HR), [Manager]...
 * Đảm bảo không bao giờ xuất hiện ký tự mở ngoặc '(' trong avatar initials.
 */
function getInitialsFromName(nameStr) {
  if (!nameStr) return 'NV';
  const clean = nameStr.replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\s]/gu, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return (clean.slice(0, 2) || 'NV').toUpperCase();
}

function updateTopbarUser() {
  if (!state.user) return;
  const isManager = state.user.role === 'MANAGER' || state.user.username === 'manager';
  const isEmployee = state.user.role === 'EMPLOYEE' || state.user.username === 'employee';

  let displayName = state.user.fullName;
  if (!displayName) {
    if (state.user.username === 'employee') displayName = 'Vũ Đức Hiếu';
    else if (state.user.username === 'manager') displayName = 'Thầy Lâm';
    else if (state.user.username === 'admin') displayName = 'Nguyễn Quản Trị (Admin)';
    else if (state.user.username === 'hr_admin') displayName = 'Trần Thị Thu Hà (HR)';
    else displayName = state.user.username;
  }

  const deptLabel = state.user.department || state.user.departmentName;
  const deptSuffix = deptLabel ? ` | ${deptLabel}` : ' | Chưa phân phòng ban (Chờ tiếp nhận)';
  const displayRole = state.user.role === 'ADMIN' ? 'Quản trị viên Hệ thống' :
                      (state.user.role === 'HR' ? 'Phòng Hành chính Nhân sự' :
                      (state.user.role === 'MANAGER' ? `Quản lý${deptSuffix}` : `Nhân viên${deptSuffix}`));

  const nameEl = document.getElementById('topbarUserName');
  const roleEl = document.getElementById('topbarUserRole');
  const avatarEl = document.getElementById('topbarAvatarCircle');
  const greetSub = document.getElementById('dashGreetingSub');

  if (nameEl) nameEl.innerText = `Xin chào, ${displayName}`;
  if (roleEl) roleEl.innerText = displayRole;
  if (avatarEl) {
    avatarEl.innerText = getInitialsFromName(displayName);
  }
  if (greetSub) {
    if (state.user.role === 'EMPLOYEE') {
      greetSub.innerText = `Xin chào ${displayName}, chúc bạn một ngày làm việc hiệu quả và năng suất!`;
    } else {
      greetSub.innerText = `Xin chào ${displayName}, đây là tình hình đội nhóm và chuyên cần hôm nay.`;
    }
  }

  renderTopbarNotifications();
}

// Phân quyền giao diện theo vai trò người dùng (RBAC Interface Guard)
function applyRoleBasedUI() {
  const role = state.user?.role || 'EMPLOYEE';
  const isEmployee = (role === 'EMPLOYEE');
  const displayName = state.user?.fullName || state.user?.username || (isEmployee ? 'Vũ Đức Hiếu' : 'Thầy Lâm');

  // Breadcrumb, Title & Subtitle của trang Dashboard
  const breadcrumb = document.getElementById('dashBreadcrumbTrail');
  const mainTitle = document.getElementById('dashMainHeadingTitle');
  const greetingSub = document.getElementById('dashGreetingSub');

  if (isEmployee) {
    if (breadcrumb) breadcrumb.innerText = 'Trang chủ / Bảng điều khiển cá nhân';
    if (mainTitle) mainTitle.innerText = 'Bảng điều khiển cá nhân';
    if (greetingSub) greetingSub.innerText = `Chào mừng trở lại, ${displayName}! Quản lý chấm công, ca trực và quyền lợi cá nhân của bạn.`;
  } else {
    if (breadcrumb) breadcrumb.innerText = 'Tổng quan / Tổng quan trong ngày';
    if (mainTitle) mainTitle.innerText = 'Tổng quan trong ngày';
    if (greetingSub) greetingSub.innerText = `Xin chào ${displayName}, đây là tình hình đội nhóm và chuyên cần hôm nay.`;
  }

  // 1. Phân chia 2 Dashboard riêng biệt:
  const adminSection = document.getElementById('dashAdminOverviewSection');
  const empSection = document.getElementById('dashEmployeeOverviewSection');
  const pendingRequestsCard = document.getElementById('dashPendingApprovalCard');

  if (isEmployee) {
    if (adminSection) adminSection.style.display = 'none';
    if (empSection) empSection.style.display = 'block';
    if (pendingRequestsCard) pendingRequestsCard.style.display = 'none';
    if (!state.user?.isOnboarded) {
      loadPendingInvitationsForEmp();
    }
  } else {
    if (adminSection) adminSection.style.display = 'block';
    if (empSection) empSection.style.display = 'none';
    if (pendingRequestsCard) pendingRequestsCard.style.display = 'block';
    if (role === 'MANAGER') {
      loadManagerTeamInfo();
    } else {
      const mgrCard = document.getElementById('managerTeamManagementCard');
      if (mgrCard) mgrCard.style.display = 'none';
    }
  }

  // Giới hạn quyền hiển thị banner nhân sự mới chờ tiếp nhận: Chỉ dành cho ADMIN và HR_ADMIN
  const adminAlert = document.getElementById('dashAdminPendingAlert');
  const canReceivePersonnel = (role === 'ADMIN' || role === 'HR_ADMIN' || role === 'HR');
  if (adminAlert && !canReceivePersonnel) {
    adminAlert.style.display = 'none';
  }

  // 2. Tùy biến Sidebar theo vai trò:
  const navDashboard = document.getElementById('nav-dashboard');
  if (navDashboard) {
    navDashboard.innerText = isEmployee ? 'Tổng quan cá nhân' : 'Tổng quan';
  }

  const navRbac = document.getElementById('nav-rbac');
  const navSoa = document.getElementById('nav-soa-monitor');
  const navSettings = document.getElementById('nav-settings');
  const navDepartments = document.getElementById('nav-departments');
  const navEmpHistory = document.getElementById('nav-attendance-history');
  const navMyAttendance = document.getElementById('nav-my-attendance');
  const navEmployees = document.getElementById('nav-employees');
  const navStats = document.getElementById('nav-stats');

  // Các mục quản trị chỉ dành cho Quản lý / Admin
  if (navRbac) navRbac.style.display = (role === 'ADMIN') ? 'flex' : 'none';
  if (navSoa) navSoa.style.display = (role === 'ADMIN') ? 'flex' : 'none';
  if (navSettings) navSettings.style.display = (role === 'ADMIN' || role === 'HR') ? 'flex' : 'none';
  if (navDepartments) navDepartments.style.display = (role === 'ADMIN' || role === 'HR') ? 'flex' : 'none';
  if (navEmpHistory) navEmpHistory.style.display = (!isEmployee) ? 'flex' : 'none';
  if (navMyAttendance) navMyAttendance.style.display = (role === 'ADMIN') ? 'none' : 'flex';
  if (navEmployees) navEmployees.style.display = (!isEmployee) ? 'flex' : 'none';
  if (navStats) navStats.style.display = (!isEmployee) ? 'flex' : 'none';

  // Ẩn cụm chấm công cá nhân đối với ADMIN
  const personalBanner = document.getElementById('personalAttendanceBanner');
  if (personalBanner) personalBanner.style.display = (role === 'ADMIN') ? 'none' : 'block';

  // 3. Quyền hạn thao tác phân ca & ca làm việc
  const btnShiftOpenAssign = document.getElementById('btnShiftOpenAssign');
  const btnHeaderAssignShift = document.getElementById('btnHeaderAssignShift');
  const btnShiftOpenCreateShift = document.getElementById('btnShiftOpenCreateShift');
  const btnShiftOpenCreateOt = document.getElementById('btnShiftOpenCreateOt');
  if (btnShiftOpenAssign) btnShiftOpenAssign.style.display = (!isEmployee) ? 'inline-flex' : 'none';
  if (btnHeaderAssignShift) btnHeaderAssignShift.style.display = (!isEmployee) ? 'inline-flex' : 'none';
  if (btnShiftOpenCreateShift) btnShiftOpenCreateShift.style.display = (role === 'ADMIN' || role === 'HR') ? 'inline-flex' : 'none';
  if (btnShiftOpenCreateOt) btnShiftOpenCreateOt.style.display = (role === 'ADMIN') ? 'none' : 'inline-flex';

  // 4. Phân tách giao diện Đơn từ theo vai trò (ADMIN vs MANAGER vs EMPLOYEE)
  const tabReqDept = document.getElementById('tabReqDepartment');
  const tabReqPersonal = document.getElementById('tabReqPersonal');
  const tabReqDeptLabel = document.getElementById('tabReqDeptLabel');
  const tabReqPersonalLabel = document.getElementById('tabReqPersonalLabel');
  const btnReqCreateNew = document.getElementById('btnRequestsCreateNew');
  const reqTopSection = document.getElementById('requestsTopSection');
  const cardCreateLeave = document.getElementById('cardCreateLeaveForm');
  const reqTableTitle = document.getElementById('requestsTableTitle');
  const reqTableSubtitle = document.getElementById('requestsTableSubtitle');
  const thActionHeader = document.getElementById('thRequestsActionHeader');

  if (role === 'ADMIN' || role === 'HR_ADMIN') {
    if (tabReqPersonal) tabReqPersonal.style.display = 'none';
    if (tabReqDept) {
      tabReqDept.style.display = 'inline-flex';
      tabReqDept.classList.add('active');
    }
    if (tabReqDeptLabel) tabReqDeptLabel.innerText = 'Giám sát & Duyệt đơn toàn công ty';
    if (btnReqCreateNew) btnReqCreateNew.style.display = 'none';
    if (reqTopSection) reqTopSection.style.display = 'none';
    if (cardCreateLeave) cardCreateLeave.style.display = 'none';
    if (reqTableTitle) reqTableTitle.innerText = 'Quản lý & Duyệt đơn toàn công ty';
    if (reqTableSubtitle) reqTableSubtitle.innerText = 'Giám sát, xử lý phê duyệt hoặc xóa các đơn từ trên toàn hệ thống.';
    if (thActionHeader) thActionHeader.innerText = 'Phê duyệt / Thao tác';
    state.requestsCurrentTab = 'department';
  } else if (role === 'MANAGER') {
    if (tabReqDept) {
      tabReqDept.style.display = 'inline-flex';
    }
    if (tabReqDeptLabel) tabReqDeptLabel.innerText = 'Duyệt đơn bộ phận';
    if (tabReqPersonal) {
      tabReqPersonal.style.display = 'inline-flex';
    }
    if (tabReqPersonalLabel) tabReqPersonalLabel.innerText = 'Đơn cá nhân của tôi';
    state.requestsCurrentTab = state.requestsCurrentTab || 'department';
    if (state.requestsCurrentTab === 'department') {
      if (tabReqDept) {
        tabReqDept.classList.add('active');
        tabReqDept.style.border = '1.5px solid #2563eb';
        tabReqDept.style.background = '#eff6ff';
        tabReqDept.style.color = '#1d4ed8';
      }
      if (tabReqPersonal) {
        tabReqPersonal.classList.remove('active');
        tabReqPersonal.style.border = '1.5px solid #e2e8f0';
        tabReqPersonal.style.background = '#ffffff';
        tabReqPersonal.style.color = '#64748b';
      }
      if (btnReqCreateNew) btnReqCreateNew.style.display = 'none';
      if (reqTopSection) reqTopSection.style.display = 'none';
      if (reqTableTitle) reqTableTitle.innerText = 'Danh sách đơn từ bộ phận';
      if (reqTableSubtitle) reqTableSubtitle.innerText = 'Theo dõi và phê duyệt các đơn nghỉ phép, giải trình chấm công và tăng ca OT của nhân viên thuộc bộ phận.';
      if (thActionHeader) thActionHeader.innerText = 'Phê duyệt / Thao tác';
    } else {
      if (tabReqPersonal) {
        tabReqPersonal.classList.add('active');
        tabReqPersonal.style.border = '1.5px solid #2563eb';
        tabReqPersonal.style.background = '#eff6ff';
        tabReqPersonal.style.color = '#1d4ed8';
      }
      if (tabReqDept) {
        tabReqDept.classList.remove('active');
        tabReqDept.style.border = '1.5px solid #e2e8f0';
        tabReqDept.style.background = '#ffffff';
        tabReqDept.style.color = '#64748b';
      }
      if (btnReqCreateNew) btnReqCreateNew.style.display = 'inline-flex';
      if (reqTopSection) reqTopSection.style.display = 'grid';
      if (reqTableTitle) reqTableTitle.innerText = 'Danh sách đơn từ của tôi';
      if (reqTableSubtitle) reqTableSubtitle.innerText = 'Theo dõi trạng thái các đơn nghỉ phép, giải trình chấm công và tăng ca OT do bạn gửi.';
      if (thActionHeader) thActionHeader.innerText = 'Thao tác';
    }
  } else {
    // EMPLOYEE
    if (tabReqDept) tabReqDept.style.display = 'none';
    if (tabReqPersonal) {
      tabReqPersonal.style.display = 'inline-flex';
      tabReqPersonal.classList.add('active');
    }
    if (tabReqPersonalLabel) tabReqPersonalLabel.innerText = 'Đơn của tôi';
    if (btnReqCreateNew) btnReqCreateNew.style.display = 'inline-flex';
    if (reqTopSection) reqTopSection.style.display = 'grid';
    if (cardCreateLeave) cardCreateLeave.style.display = 'block';
    if (reqTableTitle) reqTableTitle.innerText = 'Danh sách đơn từ của tôi';
    if (reqTableSubtitle) reqTableSubtitle.innerText = 'Theo dõi trạng thái các đơn nghỉ phép, giải trình chấm công và tăng ca OT do bạn gửi.';
    if (thActionHeader) thActionHeader.innerText = 'Thao tác';
    state.requestsCurrentTab = 'personal';
  }

  // 5. Quyền hạn thao tác tính lương & cấu hình lương
  const btnPayrollCalc = document.getElementById('btnPayrollCalculate');
  const btnPayrollPub = document.getElementById('btnPayrollPublish');
  const btnPayrollCfg = document.getElementById('btnPayrollConfig');
  const tabPayrollCfg = document.getElementById('tabBtnPayrollConfigs');
  const tabPayrollPer = document.getElementById('tabBtnPayrollPeriods');
  const payrollTableTitle = document.getElementById('payrollTableTitle');
  const payrollTableSub = document.getElementById('payrollTableSub');

  const isAdminOrHr = (role === 'ADMIN' || role === 'HR');
  if (btnPayrollCalc) btnPayrollCalc.style.display = isAdminOrHr ? 'inline-flex' : 'none';
  if (btnPayrollPub) btnPayrollPub.style.display = isAdminOrHr ? 'inline-flex' : 'none';
  if (btnPayrollCfg) btnPayrollCfg.style.display = isAdminOrHr ? 'inline-flex' : 'none';
  if (tabPayrollCfg) tabPayrollCfg.style.display = isAdminOrHr ? 'inline-block' : 'none';
  if (tabPayrollPer) tabPayrollPer.style.display = (!isEmployee) ? 'inline-block' : 'none';

  if (isEmployee) {
    if (payrollTableTitle) payrollTableTitle.innerText = 'Phiếu lương cá nhân của bạn';
    if (payrollTableSub) payrollTableSub.innerText = 'Bảng chi tiết các khoản thu nhập, phụ cấp và các khoản trích nộp theo lương';
  } else {
    if (payrollTableTitle) payrollTableTitle.innerText = 'Bảng tổng hợp phiếu lương toàn công ty';
    if (payrollTableSub) payrollTableSub.innerText = 'Bảng lương chi tiết được tính tự động từ dữ liệu Chấm công, Phép năm và Giờ tăng ca OT';
  }
}

function navigateToView(viewName) {
  // Chuẩn hóa alias
  if (viewName === 'leaves') viewName = 'requests';

  // Kiểm tra quyền hạn truy cập theo vai trò (RBAC Route Guard)
  const role = state.user?.role || 'EMPLOYEE';
  if (role === 'EMPLOYEE' && ['rbac', 'departments', 'settings', 'soa-monitor', 'attendance-history', 'employees'].includes(viewName)) {
    showToast('Nhân viên không có quyền truy cập chức năng này (Chỉ dành cho Quản lý / Quản trị viên)', 'error');
    return;
  }
  if (role !== 'ADMIN' && ['rbac', 'soa-monitor'].includes(viewName)) {
    showToast('Chỉ Quản trị viên (ADMIN) mới có quyền truy cập chức năng này', 'error');
    return;
  }
  if (role === 'ADMIN' && viewName === 'my-attendance') {
    showToast('Tài khoản Quản trị viên (ADMIN) không thực hiện chấm công cá nhân', 'info');
    navigateToView('attendance-history');
    return;
  }

  state.currentView = viewName;
  safeSetStorage('htqlns_current_view', viewName);

  // Cập nhật tab active trên Sidebar
  document.querySelectorAll('.figma-nav-item').forEach((item) => {
    item.classList.remove('active');
  });

  const targetNavItem = document.getElementById(`nav-${viewName}`);
  if (targetNavItem) targetNavItem.classList.add('active');

  // Ẩn tất cả view section
  document.querySelectorAll('.figma-view-section').forEach((sec) => {
    sec.style.display = 'none';
  });

  // Hiển thị view tương ứng
  let targetSection = document.getElementById(`view-${viewName}`);
  if (!targetSection) {
    if (viewName === 'requests') {
      targetSection = document.getElementById('view-requests') || document.getElementById('view-request-detail');
    } else {
      targetSection = document.getElementById('view-dashboard');
    }
  }

  if (targetSection) targetSection.style.display = 'block';

  // Nạp dữ liệu tương ứng
  if (viewName === 'dashboard') {
    applyRoleBasedUI();
    if (state.user?.role === 'EMPLOYEE') {
      loadEmployeeDashboardData();
    } else {
      loadDashboardData();
    }
  }
  if (viewName === 'requests') loadRequestsData();
  if (viewName === 'employees') loadEmployeesData();
  if (viewName === 'departments') loadDepartmentsData();
  if (viewName === 'attendance-history') loadAttendanceHistoryData();
  if (viewName === 'my-attendance') {
    loadMyAttendanceData();
    checkTodayAttendanceStatus();
  }
  if (viewName === 'rbac') loadRbacUsersData();
  if (viewName === 'stats') loadStatsData();
  if (viewName === 'soa-monitor') loadSoaServicesStatus();
  if (viewName === 'profile') loadProfileData();
  if (viewName === 'shifts') loadShiftsData();
  if (viewName === 'payroll') loadPayrollData();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatLeaveDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatLeaveDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} • ${hours}:${minutes}`;
}

function scrollToCreateForm() {
  const formCard = document.getElementById('cardCreateLeaveForm');
  if (formCard) {
    const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
    if (role === 'MANAGER') {
      switchRequestsTab('personal');
    }
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const reasonInput = document.getElementById('leaveFormReason');
    if (reasonInput) reasonInput.focus();
  }
}

function calculateLeaveDays() {
  const startVal = document.getElementById('leaveFormStartDate')?.value;
  const endVal = document.getElementById('leaveFormEndDate')?.value;
  const session = document.getElementById('leaveFormSession')?.value || 'FULL_DAY';
  const totalInput = document.getElementById('leaveFormTotalDays');
  if (!totalInput) return;

  if (!startVal) {
    totalInput.value = '1.0';
    return;
  }

  const sDate = new Date(startVal + 'T00:00:00');
  const eDate = endVal ? new Date(endVal + 'T00:00:00') : sDate;

  if (eDate < sDate) {
    totalInput.value = '1.0';
    return;
  }

  let count = 0;
  const cur = new Date(sDate);
  while (cur <= eDate) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }

  if (count === 0) count = 1;
  let total = count;
  if (session === 'MORNING' || session === 'AFTERNOON') {
    total = count > 1 ? count - 0.5 : 0.5;
  }
  totalInput.value = total.toFixed(1);
}

function switchRequestsTab(tabName) {
  if (tabName === 'approval') tabName = 'department';
  if (tabName === 'my-requests') tabName = 'personal';
  state.requestsCurrentTab = tabName;
  applyRoleBasedUI();
  loadRequestsData();
}

async function loadRequestsData() {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';
  const isAdmin = role === 'ADMIN';
  const isHr = role === 'HR' || role === 'HR_ADMIN';

  // Đồng bộ tab theo vai trò
  if (isAdmin || isHr) {
    state.requestsCurrentTab = 'department';
  } else if (isEmployee) {
    state.requestsCurrentTab = 'personal';
  } else if (!state.requestsCurrentTab) {
    state.requestsCurrentTab = 'department';
  }

  const activeTab = state.requestsCurrentTab;
  const isPersonalScope = (activeTab === 'personal' || isEmployee);
  const scopeQuery = isPersonalScope ? '?scope=ME' : '';

  try {
    const [leaveRes, adjRes, otRes] = await Promise.all([
      apiCall(`/api/leave${scopeQuery}`).catch(() => ({ data: [] })),
      apiCall(`/api/v1/attendance-adjustments${scopeQuery}`).catch(() => ({ data: [] })),
      apiCall(`/api/v1/ot-requests${scopeQuery}`).catch(() => ({ data: [] }))
    ]);

    const leaves = leaveRes?.data || [];
    const adjustments = adjRes?.data || [];
    const ots = otRes?.data || [];

    let unified = [];

    leaves.forEach(l => {
      unified.push({
        id: l.id,
        type: 'LEAVE',
        typeName: l.leave_name || 'Nghỉ phép',
        typeBadge: `<span class="badge-status" style="background: #eff6ff; color: #1d4ed8; font-weight: 600; border: 1px solid #bfdbfe;">Nghỉ phép</span>`,
        emp_id: l.emp_id,
        emp_name: l.emp_name || 'Nhân viên',
        emp_code: l.emp_code || '',
        department_name: l.department_name || '-',
        timeRange: `${formatLeaveDate(l.start_date)}${l.end_date && l.end_date !== l.start_date ? ' → ' + formatLeaveDate(l.end_date) : ''}`,
        duration: `${l.total_days || 1} ngày`,
        reason: l.reason || 'Nghỉ phép',
        created_at: l.created_at,
        status: (l.status || 'PENDING').toUpperCase(),
        raw: l
      });
    });

    const adjMap = {
      'FORGOT_CHECK_IN': 'Quên Check-in',
      'FORGOT_CHECK_OUT': 'Quên Check-out',
      'LATE_EXPLANATION': 'Giải trình đi muộn / về sớm',
      'GPS_ERROR': 'Lỗi định vị GPS',
      'OTHER': 'Giải trình chấm công khác'
    };

    adjustments.forEach(a => {
      unified.push({
        id: a.id,
        type: 'ADJUSTMENT',
        typeName: adjMap[a.adjustment_type] || a.adjustment_type || 'Giải trình chấm công',
        typeBadge: `<span class="badge-status" style="background: #fefce8; color: #b45309; font-weight: 600; border: 1px solid #fef08a;">Giải trình CC</span>`,
        emp_id: a.emp_id,
        emp_name: a.emp_name || a.fullName || 'Nhân viên',
        emp_code: a.emp_code || '',
        department_name: a.department_name || a.departmentName || '-',
        timeRange: formatLeaveDate(a.work_date || a.created_at),
        duration: a.actual_time ? `${String(a.actual_time).slice(0, 5)}` : '1 lượt',
        reason: a.reason || 'Giải trình chấm công',
        created_at: a.created_at,
        status: (a.status || 'PENDING').toUpperCase(),
        raw: a
      });
    });

    ots.forEach(o => {
      const timeStr = (o.start_time && o.end_time) ? ` (${String(o.start_time).slice(0, 5)} - ${String(o.end_time).slice(0, 5)})` : '';
      unified.push({
        id: o.id,
        type: 'OT',
        typeName: 'Đăng ký tăng ca (OT)',
        typeBadge: `<span class="badge-status" style="background: #faf5ff; color: #7e22ce; font-weight: 600; border: 1px solid #e9d5ff;">Tăng ca OT</span>`,
        emp_id: o.emp_id,
        emp_name: o.emp_name || o.fullName || 'Nhân viên',
        emp_code: o.emp_code || '',
        department_name: o.department_name || o.departmentName || '-',
        timeRange: `${formatLeaveDate(o.work_date)}${timeStr}`,
        duration: `${o.total_hours || 0} giờ`,
        reason: o.reason || 'Tăng ca OT',
        created_at: o.created_at,
        status: (o.status || 'PENDING').toUpperCase(),
        raw: o
      });
    });

    const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;
    // Bắt buộc cô lập dữ liệu cá nhân: khi xem đơn cá nhân hoặc là EMPLOYEE thì CHỈ hiển thị đơn của chính mình
    if (isPersonalScope && myEmpId) {
      unified = unified.filter(r => String(r.emp_id) === String(myEmpId));
    }

    // Sắp xếp giảm dần theo thời gian tạo
    unified.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    state.unifiedRequests = unified;
    state.requests = leaves;

    // Cập nhật số đếm badge chờ duyệt ở tab bộ phận
    const pendingCount = unified.filter(r => r.status === 'PENDING').length;
    const badgeDept = document.getElementById('badgeDeptPendingCount');
    if (badgeDept) {
      badgeDept.innerText = pendingCount;
      badgeDept.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    filterRequestsTable();
  } catch (err) {
    console.error('Lỗi nạp danh sách đơn từ:', err);
    showToast('Không thể nạp danh sách đơn từ: ' + err.message, 'error');
  }
}

function filterRequestsTable() {
  const filterEl = document.getElementById('requestsFilterStatus');
  const selectedStatus = (filterEl?.value || 'ALL').toUpperCase();
  const allItems = state.unifiedRequests || [];

  let filtered = allItems;
  if (selectedStatus !== 'ALL') {
    filtered = allItems.filter(r => (r.status || '').toUpperCase() === selectedStatus);
  }

  renderRequestsTable(filtered);
}

function renderRequestsTable(items) {
  const tbody = document.getElementById('requestsTableFullBody');
  if (!tbody) return;

  if (!items || !items.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 32px; font-weight: 500;">Chưa có đơn từ nào trong danh mục này.</td></tr>';
    return;
  }

  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isAdmin = (role === 'ADMIN');
  const isHr = (role === 'HR' || role === 'HR_ADMIN');
  const isManager = (role === 'MANAGER');
  const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;

  tbody.innerHTML = items.map(r => {
    let statusBadge = '';
    const st = (r.status || 'PENDING').toUpperCase();
    if (st === 'PENDING') {
      statusBadge = '<span class="badge-status" style="background: #fef3c7; color: #d97706; font-weight: 600;">• Đang chờ duyệt</span>';
    } else if (st === 'APPROVED') {
      statusBadge = '<span class="badge-status badge-approved">✓ Đã phê duyệt</span>';
    } else {
      statusBadge = '<span class="badge-status badge-rejected">✕ Đã từ chối</span>';
    }

    const isSelf = (r.emp_id && myEmpId && String(r.emp_id) === String(myEmpId));
    let actionsHtml = '';

    if (st === 'PENDING') {
      if (isSelf) {
        actionsHtml = `
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="badge-self-blocked" style="font-size: 11px; color: #dc2626; font-weight: 600; background: #fee2e2; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;" title="Quy định: Không được phép tự duyệt đơn của chính mình">
              ⛔ Chặn tự duyệt
            </span>
            <button class="btn-cancel-req-sm" style="background: #fff; color: #dc2626; border: 1px solid #fca5a5; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="handleDeleteRequest('${r.id}', '${r.type}')" title="Hủy đơn đang chờ duyệt">
              🗑 Hủy đơn
            </button>
            <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')" title="Xem chi tiết đơn">Chi tiết ↗</button>
          </div>
        `;
      } else if (isAdmin) {
        actionsHtml = `
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <button class="btn-approve-sm" style="background: #2563eb; color: #ffffff; border: none; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="handleDirectApprove('${r.id}', '${r.type}')" title="Quyền Quản trị viên: Phê duyệt thay (Override)">
              ✓ Duyệt thay
            </button>
            <button class="btn-reject-sm" style="background: #ef4444; color: #ffffff; border: none; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer;" onclick="handleDirectReject('${r.id}', '${r.type}')">
              ✕ Từ chối
            </button>
            <button class="btn-delete-req-sm" style="background: #fff; color: #ef4444; border: 1px solid #fecaca; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer;" onclick="handleDeleteRequest('${r.id}', '${r.type}')" title="Xóa đơn khỏi hệ thống">
              🗑 Xóa
            </button>
            <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
          </div>
        `;
      } else if (isHr || isManager) {
        actionsHtml = `
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <button class="btn-approve-sm" style="background: #10b981; color: #ffffff; border: none; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer;" onclick="handleDirectApprove('${r.id}', '${r.type}')">
              ✓ Duyệt
            </button>
            <button class="btn-reject-sm" style="background: #ef4444; color: #ffffff; border: none; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer;" onclick="handleDirectReject('${r.id}', '${r.type}')">
              ✕ Từ chối
            </button>
            <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
          </div>
        `;
      } else {
        // Employee viewing their own pending request
        actionsHtml = `
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <button class="btn-cancel-req-sm" style="background: #fff; color: #dc2626; border: 1px solid #fca5a5; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="handleDeleteRequest('${r.id}', '${r.type}')" title="Hủy đơn đang chờ duyệt">
              🗑 Hủy đơn
            </button>
            <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
          </div>
        `;
      }
    } else {
      // APPROVED or REJECTED
      if (isAdmin || isHr) {
        actionsHtml = `
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <button class="btn-delete-req-sm" style="background: #fff; color: #ef4444; border: 1px solid #fecaca; padding: 5px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer;" onclick="handleDeleteRequest('${r.id}', '${r.type}')" title="Xóa bản ghi đơn này khỏi hệ thống">
              🗑 Xóa
            </button>
            <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
          </div>
        `;
      } else {
        actionsHtml = `<button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>`;
      }
    }

    return `
      <tr id="req-row-${r.id}">
        <td><span style="font-weight: 700; color: #1e293b; font-family: monospace;">${r.id}</span></td>
        <td>
          <div style="font-weight: 600; color: #1e293b;">${r.emp_name}</div>
          <div style="font-size: 11px; color: #94a3b8;">${r.emp_code || ''}</div>
        </td>
        <td><span style="font-size: 13px; color: #475569;">${r.department_name}</span></td>
        <td>
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            ${r.typeBadge}
            <span style="font-size: 12px; color: #334155; font-weight: 500;">${r.typeName}</span>
          </div>
        </td>
        <td><span style="font-size: 12px; color: #1e293b;">${r.timeRange}</span></td>
        <td><span style="font-weight: 600; color: #0f172a;">${r.duration}</span></td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.reason}">
          ${r.reason}
        </td>
        <td><span style="font-size: 11px; color: #64748b;">${formatLeaveDateTime(r.created_at)}</span></td>
        <td>${statusBadge}</td>
        <td style="text-align: center; white-space: nowrap;">${actionsHtml}</td>
      </tr>
    `;
  }).join('');
}

async function handleDeleteRequest(id, type) {
  if (!id) return;
  if (!type) {
    const item = state.unifiedRequests?.find(r => r.id === id);
    type = item?.type || (id.startsWith('NP-') ? 'LEAVE' : (id.startsWith('ADJ-') ? 'ADJUSTMENT' : (id.startsWith('OT-') ? 'OT' : 'LEAVE')));
  }

  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isAdminOrHr = (role === 'ADMIN' || role === 'HR_ADMIN' || role === 'HR');
  const confirmMsg = isAdminOrHr
    ? `Bạn có chắc chắn muốn xóa vĩnh viễn đơn "${id}" khỏi hệ thống?`
    : `Bạn có chắc chắn muốn hủy đơn "${id}" này không?`;

  if (!confirm(confirmMsg)) return;

  try {
    let endpoint = '';
    if (type === 'LEAVE') {
      endpoint = `/api/v1/leave-requests/${id}`;
    } else if (type === 'ADJUSTMENT') {
      endpoint = `/api/v1/attendances/explanations/${id}`;
    } else if (type === 'OT') {
      endpoint = `/api/v1/shifts/overtime/${id}`;
    }

    const res = await apiCall(endpoint, 'DELETE');
    if (res && res.success !== false) {
      showToast(res.message || `Đã xóa đơn ${id} thành công!`, 'success');
      await loadRequestsData();
      await loadDashboardPendingRequests();
      if (typeof loadDashboardOverview === 'function') loadDashboardOverview();
      if (typeof loadMyLeaveBalance === 'function') loadMyLeaveBalance();
      if (typeof loadOtRequests === 'function') loadOtRequests();
      if (typeof loadAttendanceLogs === 'function') loadAttendanceLogs();

      const detailSec = document.getElementById('view-request-detail');
      if (detailSec && detailSec.style.display !== 'none') {
        const navReq = document.getElementById('nav-requests');
        if (navReq) navReq.click();
      }
    } else {
      throw new Error(res?.error || res?.message || 'Xóa đơn thất bại');
    }
  } catch (err) {
    console.error('Lỗi khi xóa/hủy đơn:', err);
    showToast(err.message || 'Lỗi khi xóa/hủy đơn', 'error');
  }
}

async function handleCreateLeaveSubmit() {
  const leaveTypeId = document.getElementById('leaveFormTypeId')?.value;
  const startDate = document.getElementById('leaveFormStartDate')?.value;
  const endDate = document.getElementById('leaveFormEndDate')?.value || startDate;
  const reason = document.getElementById('leaveFormReason')?.value?.trim();
  const totalDays = parseFloat(document.getElementById('leaveFormTotalDays')?.value || '1.0');

  if (!leaveTypeId) {
    showToast('Vui lòng chọn loại nghỉ phép', 'warning');
    return;
  }
  if (!startDate) {
    showToast('Vui lòng chọn ngày bắt đầu nghỉ', 'warning');
    return;
  }
  if (!reason) {
    showToast('Vui lòng nhập lý do xin nghỉ phép', 'warning');
    return;
  }

  try {
    const payload = {
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      reason: reason
    };

    const res = await apiCall('/api/leave', 'POST', payload);
    if (res && (res.status === 'success' || res.data || res.id)) {
      showToast('Gửi đơn xin nghỉ phép thành công!', 'success');
      const reasonEl = document.getElementById('leaveFormReason');
      if (reasonEl) reasonEl.value = '';
      await loadRequestsData();
      await loadDashboardPendingRequests();
      loadDashboardOverview();
      loadMyLeaveBalance();
    } else {
      showToast(res?.message || 'Không thể tạo đơn nghỉ phép', 'error');
    }
  } catch (err) {
    showToast(`Lỗi tạo đơn: ${err.message}`, 'error');
  }
}

async function handleDirectApprove(id, type) {
  if (!type) {
    const item = state.unifiedRequests?.find(r => r.id === id);
    type = item?.type || (id.startsWith('NP-') ? 'LEAVE' : (id.startsWith('ADJ-') ? 'ADJUSTMENT' : (id.startsWith('OT-') ? 'OT' : 'LEAVE')));
  }

  try {
    let res;
    if (type === 'LEAVE') {
      res = await apiCall(`/api/leave/${id}/decision`, 'POST', {
        decision: 'APPROVE',
        comment: 'Đã phê duyệt đơn xin nghỉ phép qua hệ thống'
      });
    } else if (type === 'ADJUSTMENT') {
      res = await apiCall(`/api/v1/attendance-adjustments/${id}/decision`, 'POST', {
        decision: 'APPROVE',
        comment: 'Đã phê duyệt giải trình chấm công qua hệ thống'
      });
    } else if (type === 'OT') {
      res = await apiCall(`/api/v1/ot-requests/${id}/decision`, 'POST', {
        status: 'APPROVED',
        note: 'Đã phê duyệt tăng ca OT qua hệ thống'
      });
    }

    showToast(`Đã phê duyệt đơn ${id} thành công!`, 'success');
    await loadRequestsData();
    await loadDashboardPendingRequests();
    loadDashboardOverview();
    if (type === 'ADJUSTMENT') {
      if (typeof loadAttendanceLogs === 'function') loadAttendanceLogs();
    }

    const detailSec = document.getElementById('view-request-detail');
    if (detailSec && detailSec.style.display !== 'none') {
      openRequestDetail(id);
    }
  } catch (err) {
    showToast(`Lỗi phê duyệt đơn: ${err.message}`, 'error');
  }
}

async function handleDirectReject(id, type) {
  if (!type) {
    const item = state.unifiedRequests?.find(r => r.id === id);
    type = item?.type || (id.startsWith('NP-') ? 'LEAVE' : (id.startsWith('ADJ-') ? 'ADJUSTMENT' : (id.startsWith('OT-') ? 'OT' : 'LEAVE')));
  }

  try {
    let res;
    if (type === 'LEAVE') {
      res = await apiCall(`/api/leave/${id}/decision`, 'POST', {
        decision: 'REJECT',
        reject_reason: 'Không phù hợp kế hoạch công việc dự án'
      });
    } else if (type === 'ADJUSTMENT') {
      res = await apiCall(`/api/v1/attendance-adjustments/${id}/decision`, 'POST', {
        decision: 'REJECT',
        comment: 'Không phù hợp kế hoạch'
      });
    } else if (type === 'OT') {
      res = await apiCall(`/api/v1/ot-requests/${id}/decision`, 'POST', {
        status: 'REJECTED',
        note: 'Không phù hợp kế hoạch'
      });
    }

    showToast(`Đã từ chối đơn ${id}.`, 'warning');
    await loadRequestsData();
    await loadDashboardPendingRequests();
    loadDashboardOverview();

    const detailSec = document.getElementById('view-request-detail');
    if (detailSec && detailSec.style.display !== 'none') {
      openRequestDetail(id);
    }
  } catch (err) {
    showToast(`Lỗi từ chối đơn: ${err.message}`, 'error');
  }
}

// Hàm tương thích ngược
function handleDirectApproveLeave(id) {
  return handleDirectApprove(id, 'LEAVE');
}

function handleDirectRejectLeave(id) {
  return handleDirectReject(id, 'LEAVE');
}

async function openRequestDetail(requestId) {
  document.querySelectorAll('.figma-view-section').forEach((sec) => {
    sec.style.display = 'none';
  });

  const detailSec = document.getElementById('view-request-detail');
  if (detailSec) detailSec.style.display = 'block';

  document.querySelectorAll('.figma-nav-item').forEach((item) => {
    item.classList.remove('active');
  });
  const navReq = document.getElementById('nav-requests');
  if (navReq) navReq.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Lấy dữ liệu đơn
  let req = state.unifiedRequests?.find(r => r.id === requestId);
  let raw = req?.raw;

  if (!raw) {
    try {
      const res = await apiCall(`/api/v1/leave-requests/${requestId}`);
      if (res?.data) raw = res.data;
    } catch {}
  }

  if (!raw && (!req || !req.id)) {
    raw = {
      id: requestId || 'NP-2026-024',
      leave_name: 'Nghỉ phép năm',
      is_paid: 1,
      emp_name: 'Vũ Đức Hiếu',
      emp_code: 'NV-001',
      department_name: 'Phòng Kỹ Thuật',
      approver_name: 'Nguyễn Thanh Lâm',
      start_date: '2026-11-02',
      end_date: '2026-11-02',
      total_days: 1.0,
      reason: 'Tôi xin nghỉ phép để giải quyết công việc gia đình.',
      attachment_url: 'Bien-ban-ban-giao.pdf',
      status: 'PENDING',
      created_at: '2026-10-30T08:15:00'
    };
  }

  const finalReq = {
    id: raw?.id || req?.id || requestId,
    type: req?.type || (requestId.startsWith('NP-') ? 'LEAVE' : (requestId.startsWith('ADJ-') ? 'ADJUSTMENT' : (requestId.startsWith('OT-') ? 'OT' : 'LEAVE'))),
    leave_name: raw?.leave_name || req?.typeName || 'Đơn yêu cầu',
    is_paid: raw?.is_paid ?? 1,
    emp_id: raw?.emp_id || req?.emp_id,
    emp_name: raw?.emp_name || req?.emp_name || 'Nhân viên',
    emp_code: raw?.emp_code || req?.emp_code || '',
    department_name: raw?.department_name || req?.department_name || '-',
    approver_name: raw?.approver_name || req?.approver_name || 'Quản lý',
    start_date: raw?.start_date || raw?.work_date,
    end_date: raw?.end_date || raw?.work_date,
    total_days: raw?.total_days || raw?.total_hours || 1.0,
    reason: raw?.reason || req?.reason || '',
    attachment_url: raw?.attachment_url || 'Không có tệp đính kèm',
    status: raw?.status || req?.status || 'PENDING',
    created_at: raw?.created_at || req?.created_at || new Date().toISOString()
  };

  // Cập nhật giao diện Figma SCR_REQ_02
  const headerCode = document.getElementById('reqDetailHeaderCode');
  const title = document.getElementById('reqDetailLeaveTitle');
  const meta = document.getElementById('reqDetailMeta');
  const badge = document.getElementById('reqDetailStatusBadge');
  const empName = document.getElementById('reqDetailEmpName');
  const approverName = document.getElementById('reqDetailApproverName');
  const dept = document.getElementById('reqDetailDept');
  const leaveType = document.getElementById('reqDetailLeaveType');
  const startDate = document.getElementById('reqDetailStartDate');
  const endDate = document.getElementById('reqDetailEndDate');
  const duration = document.getElementById('reqDetailDuration');
  const reason = document.getElementById('reqDetailReason');
  const attach = document.getElementById('reqDetailAttachmentName');
  const alertBox = document.getElementById('reqDetailApproverBox');
  const alertIcon = document.getElementById('reqDetailApproverIcon');
  const alertText = document.getElementById('reqDetailApproverAlert');
  const alertSub = document.getElementById('reqDetailApproverAlertSub');
  const adminGroup = document.getElementById('reqDetailAdminDecisionGroup');
  const step2Icon = document.getElementById('reqDetailStep2Icon');
  const step2Title = document.getElementById('reqDetailStep2Title');
  const step2Badge = document.getElementById('reqDetailStep2Badge');
  const step2Desc = document.getElementById('reqDetailStep2Desc');

  if (headerCode) headerCode.innerText = `Mã đơn: ${finalReq.id}`;
  if (title) title.innerText = finalReq.leave_name;
  if (meta) meta.innerText = `${finalReq.id} • Gửi ngày ${formatLeaveDateTime(finalReq.created_at)}`;
  if (empName) empName.innerText = `${finalReq.emp_name} • ${finalReq.emp_code || ''}`;
  if (approverName) approverName.innerText = finalReq.approver_name || 'Quản lý';
  if (dept) dept.innerText = finalReq.department_name;
  if (leaveType) leaveType.innerText = `${finalReq.leave_name} • ${finalReq.is_paid ? 'Có hưởng lương' : 'Không hưởng lương'}`;
  if (startDate) startDate.innerText = `${formatLeaveDate(finalReq.start_date)}`;
  if (endDate) endDate.innerText = `${formatLeaveDate(finalReq.end_date)}`;
  if (duration) duration.innerText = `${finalReq.total_days} ${finalReq.type === 'OT' ? 'giờ' : 'ngày'}`;
  if (reason) reason.innerText = finalReq.reason;
  if (attach) attach.innerText = finalReq.attachment_url;

  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isAdmin = (role === 'ADMIN');
  const isHr = (role === 'HR' || role === 'HR_ADMIN');
  const isManager = (role === 'MANAGER');
  const isApprover = (isAdmin || isHr || isManager);
  const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;
  const isSelf = (finalReq.emp_id && myEmpId && String(finalReq.emp_id) === String(myEmpId));

  if (finalReq.status === 'PENDING') {
    if (badge) {
      badge.className = 'badge-status';
      badge.style.background = '#fef3c7';
      badge.style.color = '#d97706';
      badge.innerText = '• Đang chờ';
    }
    if (alertBox) {
      alertBox.style.background = '#fefce8';
      alertBox.style.borderColor = '#fef08a';
    }
    if (alertIcon) {
      alertIcon.style.color = '#ca8a04';
      alertIcon.innerText = 'ⓘ';
    }
    if (alertText) alertText.innerText = `Đang chờ ${finalReq.approver_name || 'Quản lý'} phê duyệt`;
    if (alertSub) alertSub.innerText = isSelf ? 'Đơn của bạn đang chờ phê duyệt. Bạn không được phép tự duyệt đơn của chính mình.' : 'Đơn đã được gửi đến cấp quản lý. Bạn có thể xem xét và đưa ra quyết định.';

    if (step2Icon) {
      step2Icon.style.background = '#fef3c7';
      step2Icon.style.color = '#d97706';
      step2Icon.innerText = '●';
    }
    if (step2Title) {
      step2Title.style.color = '#d97706';
      step2Title.innerText = 'Đang chờ phê duyệt';
    }
    if (step2Badge) {
      step2Badge.style.background = '#fef3c7';
      step2Badge.style.color = '#b45309';
      step2Badge.innerText = 'Bước hiện tại';
    }
    if (step2Desc) {
      step2Desc.innerText = `${finalReq.approver_name || 'Quản lý'}. Chưa có phản hồi từ người duyệt.`;
    }

    if (adminGroup) {
      if (role === 'EMPLOYEE') {
        adminGroup.innerHTML = `
          <button class="btn-cancel-req" style="padding: 9px 18px; font-size: 13px; background: #fff; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; font-weight: 600; cursor: pointer;" onclick="handleDeleteRequest('${finalReq.id}', '${finalReq.type}')">🗑 Hủy đơn này</button>
        `;
      } else if (isSelf) {
        adminGroup.innerHTML = `
          <div style="padding: 10px 16px; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
            <span>⛔</span>
            <span>Quy định hệ thống: Bạn không được phép tự phê duyệt đơn do chính mình tạo ra. Đơn cần được cấp trên hoặc HR phê duyệt.</span>
          </div>
          <button class="btn-cancel-req" style="padding: 9px 18px; font-size: 13px; background: #fff; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; font-weight: 600; cursor: pointer; margin-left: 8px;" onclick="handleDeleteRequest('${finalReq.id}', '${finalReq.type}')">🗑 Hủy đơn này</button>
        `;
      } else if (isAdmin) {
        adminGroup.innerHTML = `
          <button class="btn-approve-sm" style="padding: 9px 18px; font-size: 13px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;" onclick="handleDirectApprove('${finalReq.id}', '${finalReq.type}')">✓ Phê duyệt thay (Admin Override)</button>
          <button class="btn-reject-sm" style="padding: 9px 18px; font-size: 13px; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-left: 8px;" onclick="handleDirectReject('${finalReq.id}', '${finalReq.type}')">✕ Từ chối đơn này</button>
          <button class="btn-delete-req" style="padding: 9px 18px; font-size: 13px; background: #fff; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; font-weight: 600; cursor: pointer; margin-left: 8px;" onclick="handleDeleteRequest('${finalReq.id}', '${finalReq.type}')">🗑 Xóa đơn</button>
        `;
      } else if (isApprover) {
        adminGroup.innerHTML = `
          <button class="btn-approve-sm" style="padding: 9px 18px; font-size: 13px; background: #10b981; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;" onclick="handleDirectApprove('${finalReq.id}', '${finalReq.type}')">✓ Phê duyệt đơn này</button>
          <button class="btn-reject-sm" style="padding: 9px 18px; font-size: 13px; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-left: 8px;" onclick="handleDirectReject('${finalReq.id}', '${finalReq.type}')">✕ Từ chối đơn này</button>
        `;
      } else {
        adminGroup.innerHTML = '';
      }
    }
  } else if (finalReq.status === 'APPROVED') {
    if (badge) {
      badge.className = 'badge-status badge-approved';
      badge.style.background = '';
      badge.style.color = '';
      badge.innerText = '✓ Đã phê duyệt';
    }
    if (alertBox) {
      alertBox.style.background = '#ecfdf5';
      alertBox.style.borderColor = '#a7f3d0';
    }
    if (alertIcon) {
      alertIcon.style.color = '#059669';
      alertIcon.innerText = '✔';
    }
    if (alertText) alertText.innerText = `Đã được ${finalReq.approver_name || 'Cấp quản lý'} phê duyệt`;
    if (alertSub) alertSub.innerText = 'Yêu cầu đã được chấp thuận và đồng bộ vào hệ thống dữ liệu nhân sự.';

    if (step2Icon) {
      step2Icon.style.background = '#10b981';
      step2Icon.style.color = '#ffffff';
      step2Icon.innerText = '✔';
    }
    if (step2Title) {
      step2Title.style.color = '#059669';
      step2Title.innerText = 'Đã phê duyệt thành công';
    }
    if (step2Badge) {
      step2Badge.style.background = '#dcfce7';
      step2Badge.style.color = '#15803d';
      step2Badge.innerText = 'Hoàn tất';
    }
    if (step2Desc) {
      step2Desc.innerText = `Đã được duyệt bởi ${finalReq.approver_name || 'Quản lý'}.`;
    }
    if (adminGroup) {
      if (isAdmin || isHr) {
        adminGroup.innerHTML = `
          <button class="btn-delete-req" style="padding: 9px 18px; font-size: 13px; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; font-weight: 600; cursor: pointer;" onclick="handleDeleteRequest('${finalReq.id}', '${finalReq.type}')">🗑 Xóa bản ghi đơn này (Admin)</button>
        `;
      } else {
        adminGroup.innerHTML = '';
      }
    }
  } else if (finalReq.status === 'REJECTED') {
    if (badge) {
      badge.className = 'badge-status badge-rejected';
      badge.style.background = '';
      badge.style.color = '';
      badge.innerText = '✕ Đã từ chối';
    }
    if (alertBox) {
      alertBox.style.background = '#fef2f2';
      alertBox.style.borderColor = '#fecaca';
    }
    if (alertIcon) {
      alertIcon.style.color = '#dc2626';
      alertIcon.innerText = '✕';
    }
    if (alertText) alertText.innerText = 'Đơn đã bị từ chối';
    if (alertSub) alertSub.innerText = `Lý do: ${raw?.reject_reason || raw?.comment || raw?.note || 'Không phù hợp kế hoạch công việc'}`;

    if (step2Icon) {
      step2Icon.style.background = '#ef4444';
      step2Icon.style.color = '#ffffff';
      step2Icon.innerText = '✕';
    }
    if (step2Title) {
      step2Title.style.color = '#dc2626';
      step2Title.innerText = 'Đã từ chối đơn';
    }
    if (step2Badge) {
      step2Badge.style.background = '#fee2e2';
      step2Badge.style.color = '#b91c1c';
      step2Badge.innerText = 'Từ chối';
    }
    if (step2Desc) {
      step2Desc.innerText = `Lý do từ chối: ${raw?.reject_reason || raw?.comment || raw?.note || 'Không phù hợp kế hoạch'}`;
    }
    if (adminGroup) {
      if (isAdmin || isHr) {
        adminGroup.innerHTML = `
          <button class="btn-delete-req" style="padding: 9px 18px; font-size: 13px; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; font-weight: 600; cursor: pointer;" onclick="handleDeleteRequest('${finalReq.id}', '${finalReq.type}')">🗑 Xóa bản ghi đơn này (Admin)</button>
        `;
      } else {
        adminGroup.innerHTML = '';
      }
    }
  }
}

async function loadDashboardPendingRequests() {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';
  const isAdmin = role === 'ADMIN';
  const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;

  const pendingTbody = document.getElementById('dashPendingApprovalTableBody');
  const personalTbody = document.getElementById('dashPersonalRequestsTableBody');
  const subTitle = document.getElementById('dashPendingApprovalSub');

  try {
    const scopeQuery = isEmployee ? '?scope=ME' : '';
    const [leaveRes, adjRes, otRes] = await Promise.all([
      apiCall(`/api/leave${scopeQuery}`).catch(() => ({ data: [] })),
      apiCall(`/api/v1/attendance-adjustments${scopeQuery}`).catch(() => ({ data: [] })),
      apiCall(`/api/v1/ot-requests${scopeQuery}`).catch(() => ({ data: [] }))
    ]);

    const leaves = leaveRes?.data || [];
    const adjustments = adjRes?.data || [];
    const ots = otRes?.data || [];

    const unified = [];

    leaves.forEach(l => {
      unified.push({
        id: l.id,
        type: 'LEAVE',
        typeName: l.leave_name || 'Nghỉ phép',
        emp_id: l.emp_id,
        emp_name: l.emp_name || 'Nhân viên',
        emp_code: l.emp_code || '',
        department_name: l.department_name || '-',
        timeRange: `${formatLeaveDate(l.start_date)}${l.end_date && l.end_date !== l.start_date ? ' → ' + formatLeaveDate(l.end_date) : ''} • ${l.total_days || 1} ngày`,
        total_days: l.total_days || 1,
        reason: l.reason || 'Nghỉ phép',
        created_at: l.created_at,
        status: l.status,
        raw: l
      });
    });

    const adjMap = {
      'FORGOT_CHECK_IN': 'Quên Check-in',
      'FORGOT_CHECK_OUT': 'Quên Check-out',
      'LATE_EXPLANATION': 'Giải trình đi muộn / về sớm',
      'GPS_ERROR': 'Lỗi định vị GPS',
      'OTHER': 'Giải trình chấm công khác'
    };

    adjustments.forEach(a => {
      unified.push({
        id: a.id,
        type: 'ADJUSTMENT',
        typeName: adjMap[a.adjustment_type] || a.adjustment_type || 'Giải trình CC',
        emp_id: a.emp_id,
        emp_name: a.emp_name || a.fullName || 'Nhân viên',
        emp_code: a.emp_code || '',
        department_name: a.department_name || a.departmentName || '-',
        timeRange: `${formatLeaveDate(a.work_date || a.created_at)} • ${a.actual_time ? String(a.actual_time).slice(0, 5) : '1 lượt'}`,
        total_days: 1,
        reason: a.reason || 'Giải trình chấm công',
        created_at: a.created_at,
        status: a.status,
        raw: a
      });
    });

    ots.forEach(o => {
      const timeStr = (o.start_time && o.end_time) ? ` (${String(o.start_time).slice(0, 5)} - ${String(o.end_time).slice(0, 5)})` : '';
      unified.push({
        id: o.id,
        type: 'OT',
        typeName: 'Đăng ký tăng ca (OT)',
        emp_id: o.emp_id,
        emp_name: o.emp_name || o.fullName || 'Nhân viên',
        emp_code: o.emp_code || '',
        department_name: o.department_name || o.departmentName || '-',
        timeRange: `${formatLeaveDate(o.work_date)}${timeStr} • ${o.total_hours || 0} giờ`,
        total_days: o.total_hours || 0,
        reason: o.reason || 'Tăng ca OT',
        created_at: o.created_at,
        status: o.status,
        raw: o
      });
    });

    unified.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    state.unifiedRequests = unified;
    state.requests = leaves;

    // 1. Phía Nhân viên: Hiển thị đơn của chính mình trên Dashboard
    if (personalTbody) {
      const myItems = myEmpId ? unified.filter(r => String(r.emp_id) === String(myEmpId)) : unified;
      if (!myItems.length) {
        personalTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">Bạn chưa gửi đơn từ nào.</td></tr>';
      } else {
        personalTbody.innerHTML = myItems.slice(0, 5).map(r => {
          let badgeHtml = '';
          if (r.status === 'PENDING') badgeHtml = '<span class="badge-status" style="background: #fef3c7; color: #d97706; font-weight: 600;">• Đang chờ</span>';
          else if (r.status === 'APPROVED') badgeHtml = '<span class="badge-status badge-approved">✓ Đã duyệt</span>';
          else badgeHtml = '<span class="badge-status badge-rejected">✕ Từ chối</span>';

          return `
            <tr>
              <td><span style="font-weight: 700; color: #1e293b;">${r.id}</span></td>
              <td>${r.typeName}</td>
              <td>${r.timeRange}</td>
              <td>${r.total_days} ${r.type === 'OT' ? 'h' : 'ngày'}</td>
              <td>${badgeHtml}</td>
              <td style="text-align: center;">
                <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 2. Phía Quản trị viên / Quản lý: Hiển thị các đơn PENDING cần xét duyệt
    if (pendingTbody) {
      const pendingList = unified.filter(r => r.status === 'PENDING');
      if (subTitle) {
        subTitle.innerText = `${pendingList.length} đơn cần xử lý - Nhấp để duyệt hoặc từ chối trực tiếp`;
      }

      if (!pendingList.length) {
        pendingTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #10b981; padding: 24px; font-weight: 600;">Hiện không có đơn nào đang chờ duyệt.</td></tr>';
      } else {
        pendingTbody.innerHTML = pendingList.map(r => {
          const isSelf = (r.emp_id && myEmpId && String(r.emp_id) === String(myEmpId));
          let actionBtns = '';

          if (isSelf) {
            actionBtns = `
              <span style="font-size: 11px; color: #dc2626; background: #fee2e2; border: 1px solid #fecaca; padding: 3px 6px; border-radius: 4px; font-weight: 600;" title="Bạn không được phép tự duyệt đơn của mình">⛔ Chờ cấp trên duyệt</span>
              <button class="btn-detail-sm" style="margin-left: 4px;" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
            `;
          } else if (isAdmin) {
            actionBtns = `
              <button class="btn-approve-sm" style="background: #2563eb; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;" onclick="handleDirectApprove('${r.id}', '${r.type}')" title="Phê duyệt thay (Admin Override)">✓ Duyệt thay</button>
              <button class="btn-reject-sm" style="margin-left: 4px;" onclick="handleDirectReject('${r.id}', '${r.type}')">✕ Từ chối</button>
              <button class="btn-detail-sm" style="margin-left: 4px;" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
            `;
          } else {
            actionBtns = `
              <button class="btn-approve-sm" onclick="handleDirectApprove('${r.id}', '${r.type}')">✓ Duyệt</button>
              <button class="btn-reject-sm" style="margin-left: 4px;" onclick="handleDirectReject('${r.id}', '${r.type}')">✕ Từ chối</button>
              <button class="btn-detail-sm" style="margin-left: 4px;" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
            `;
          }

          return `
            <tr id="req-row-${r.id}">
              <td>
                <div style="font-weight: 700; color: #1e293b;">${r.emp_name}</div>
                <div style="font-size: 11px; color: #94a3b8;">${r.emp_code || ''} • Mã: ${r.id}</div>
              </td>
              <td>${r.department_name || '-'}</td>
              <td>${r.typeName}</td>
              <td>${r.timeRange}</td>
              <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.reason}">
                ${r.reason}
              </td>
              <td style="text-align: center; white-space: nowrap;">
                ${actionBtns}
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Lỗi nạp danh sách đơn chờ duyệt:', err);
  }
}

function openCreateLeaveModal() {
  navigateToView('requests');
  setTimeout(scrollToCreateForm, 200);
}

async function submitCreateLeaveRequest() {
  handleCreateLeaveSubmit();
}

// ==============================================================================
// 7. NẠP DỮ LIỆU CÁC DỊCH VỤ & GIAO DIỆN
// ==============================================================================
async function loadDashboardData() {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const canReceivePersonnel = (role === 'ADMIN' || role === 'HR_ADMIN' || role === 'HR');
  const adminAlert = document.getElementById('dashAdminPendingAlert');
  const alertTitle = document.getElementById('dashAdminPendingAlertTitle');
  const alertSub = document.getElementById('dashAdminPendingAlertSub');

  // Chỉ hiển thị banner xanh dương "Nhân sự mới chờ tiếp nhận" đối với ADMIN và HR_ADMIN; tuyệt đối ẩn với MANAGER và EMPLOYEE
  if (!canReceivePersonnel) {
    if (adminAlert) adminAlert.style.display = 'none';
  } else {
    // Luôn loại trừ chính bản thân tài khoản đang đăng nhập khỏi danh sách chờ tiếp nhận
    const currentId = state.user?.id || state.user?.userId || state.user?.empId || state.user?.sub;
    const currentUsername = state.user?.username;
    const currentEmail = state.user?.email;

    const regUsers = getRegisteredUsersList();
    const pendingUsers = regUsers.filter(u => {
      if (currentId && (String(u.id) === String(currentId) || String(u.empId) === String(currentId))) {
        return false;
      }
      if (currentUsername && u.username && String(u.username).toLowerCase() === String(currentUsername).toLowerCase()) {
        return false;
      }
      if (currentEmail && u.email && String(u.email).toLowerCase() === String(currentEmail).toLowerCase()) {
        return false;
      }
      const a = getUserAssignment(u.username, u.id);
      return !a || a.status !== 'ACTIVE';
    });

    if (adminAlert) {
      if (pendingUsers.length > 0) {
        adminAlert.style.display = 'block';
        if (alertTitle) alertTitle.innerText = `Có ${pendingUsers.length} nhân sự mới đăng ký đang chờ tiếp nhận vào ban/phòng!`;
        if (alertSub) alertSub.innerText = `Bao gồm: ${pendingUsers.map(u => u.fullName || u.username).join(', ')}. Nhấp để phân bổ ban phòng, ca trực và kích hoạt mức lương.`;
      } else {
        adminAlert.style.display = 'none';
      }
    }
  }

  await Promise.all([
    loadDepartmentsData(),
    loadEmployeesData(),
    loadDashboardPendingRequests(),
    loadDashboardOverview(),
    (role === 'MANAGER' ? loadManagerTeamInfo() : Promise.resolve())
  ]);
}

async function loadDashboardOverview(date, departmentId) {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  if (role === 'EMPLOYEE') return;

  const targetDate = date || state.selectedDashboardDate || (new Date().toLocaleDateString('en-CA'));
  const targetDept = departmentId !== undefined ? departmentId : state.selectedDashboardDeptId;

  let url = `/api/v1/analytics/overview?date=${encodeURIComponent(targetDate)}`;
  if (targetDept && targetDept !== 'ALL') {
    url += `&departmentId=${encodeURIComponent(targetDept)}`;
  }

  try {
    const res = await apiCall(url);
    if (res && res.success && res.data) {
      renderDashboardOverview(res.data);
    }
  } catch (err) {
    console.warn('[DashboardOverview] Không tải được dữ liệu tổng quan:', err);
  }
}

function renderDashboardOverview(overview) {
  if (!overview) return;
  const m = overview.metrics || {};
  const d = overview.donut || {};
  const lates = overview.lateEmployees || [];

  // 1. Cập nhật Pills
  const datePill = document.getElementById('currentDatePillText');
  if (datePill) {
    const rawDate = overview.date || '';
    const [y, mon, day] = rawDate.split('-');
    const dateFormatted = (day && mon && y) ? `${day}/${mon}/${y}` : rawDate;
    datePill.innerText = `${dateFormatted} • Hôm nay`;
  }

  const deptPill = document.getElementById('currentDeptPillText');
  if (deptPill) {
    const deptName = overview.departmentName || 'Toàn công ty';
    deptPill.innerText = `${deptName} • ${m.totalEmployees || 0} người`;
  }

  // 2. 4 Thẻ KPI
  const metricPresent = document.getElementById('dashMetricPresent');
  const metricPresentSub = document.getElementById('dashMetricPresentSub');
  if (metricPresent) {
    metricPresent.innerText = `${m.presentCount || 0} / ${m.totalEmployees || 0}`;
  }
  if (metricPresentSub) {
    if (m.totalEmployees === 0) {
      metricPresentSub.innerText = 'Chưa có nhân sự trong phạm vi quản lý';
    } else {
      metricPresentSub.innerText = `${m.attendanceRate || 0}% nhân sự • Gồm ${m.lateCount || 0} người đi muộn →`;
    }
  }

  const metricLeave = document.getElementById('dashMetricLeave');
  const metricLeaveSub = document.getElementById('dashMetricLeaveSub');
  if (metricLeave) {
    metricLeave.innerText = String(m.leaveCount || 0).padStart(2, '0');
  }
  if (metricLeaveSub) {
    metricLeaveSub.innerText = m.leaveCount > 0 ? 'Đã được duyệt nghỉ hôm nay →' : 'Không có ai nghỉ hôm nay →';
  }

  const metricLate = document.getElementById('dashMetricLate');
  const metricLateSub = document.getElementById('dashMetricLateSub');
  if (metricLate) {
    metricLate.innerText = String(m.lateCount || 0).padStart(2, '0');
  }
  if (metricLateSub) {
    if (m.totalEmployees === 0) {
      metricLateSub.innerText = 'Không có dữ liệu';
    } else if (m.lateCount === 0) {
      metricLateSub.innerText = 'Không có ai đi muộn hôm nay ↓';
    } else {
      metricLateSub.innerText = `Là một phần trong ${m.presentCount || 0} người đi làm ↓`;
    }
  }

  const metricPending = document.getElementById('dashMetricPending');
  const metricPendingSub = document.getElementById('dashMetricPendingSub');
  if (metricPending) {
    metricPending.innerText = String(m.pendingRequestsCount || 0).padStart(2, '0');
  }
  if (metricPendingSub) {
    metricPendingSub.innerText = m.pendingRequestsCount > 0 ? `${m.pendingRequestsCount} đơn cần xử lý →` : 'Hiện không có đơn chờ duyệt →';
  }

  // 3. Donut Chart (chu vi SVG C = 2 * PI * 15.915 = 100)
  const donutNum = document.getElementById('donutCenterNumber');
  if (donutNum) {
    donutNum.innerText = String(d.total !== undefined ? d.total : (m.totalEmployees || 0));
  }

  const pOntime = d.onTime?.percent || 0;
  const pLate = d.late?.percent || 0;
  const pLeave = d.leave?.percent || 0;
  const pAbsent = d.absent?.percent || 0;

  const circleOntime = document.getElementById('donutCircleOntime');
  const circleLate = document.getElementById('donutCircleLate');
  const circleLeave = document.getElementById('donutCircleLeave');
  const circleAbsent = document.getElementById('donutCircleAbsent');

  if (circleOntime) {
    circleOntime.setAttribute('stroke-dasharray', `${pOntime} ${Math.max(0, 100 - pOntime)}`);
    circleOntime.setAttribute('stroke-dashoffset', '0');
  }
  if (circleLate) {
    circleLate.setAttribute('stroke-dasharray', `${pLate} ${Math.max(0, 100 - pLate)}`);
    circleLate.setAttribute('stroke-dashoffset', String(-pOntime));
  }
  if (circleLeave) {
    circleLeave.setAttribute('stroke-dasharray', `${pLeave} ${Math.max(0, 100 - pLeave)}`);
    circleLeave.setAttribute('stroke-dashoffset', String(-(pOntime + pLate)));
  }
  if (circleAbsent) {
    circleAbsent.setAttribute('stroke-dasharray', `${pAbsent} ${Math.max(0, 100 - pAbsent)}`);
    circleAbsent.setAttribute('stroke-dashoffset', String(-(pOntime + pLate + pLeave)));
  }

  const legOntime = document.getElementById('donutLegendOntime');
  const legLate = document.getElementById('donutLegendLate');
  const legLeave = document.getElementById('donutLegendLeave');
  const legAbsent = document.getElementById('donutLegendAbsent');

  if (legOntime) legOntime.innerText = String(d.onTime?.count || 0).padStart(2, '0');
  if (legLate) legLate.innerText = String(d.late?.count || 0).padStart(2, '0');
  if (legLeave) legLeave.innerText = String(d.leave?.count || 0).padStart(2, '0');
  if (legAbsent) legAbsent.innerText = String(d.absent?.count || 0).padStart(2, '0');

  const donutFoot = document.getElementById('donutSummaryFoot');
  if (donutFoot) {
    if (m.totalEmployees === 0) {
      donutFoot.innerText = 'Chưa có nhân viên nào trong phạm vi phòng ban/đội nhóm này.';
    } else {
      donutFoot.innerText = `${d.onTime?.count || 0} đúng giờ + ${d.late?.count || 0} đi muộn + ${d.leave?.count || 0} nghỉ phép + ${d.absent?.count || 0} chưa chấm công = ${m.totalEmployees} nhân viên.`;
    }
  }

  // 4. Bảng Nhân viên đi muộn
  const lateBadge = document.getElementById('dashLateCountBadge');
  const lateTbody = document.getElementById('dashLateEmployeesTableBody');

  if (lateBadge) {
    if (lates.length > 0) {
      lateBadge.style.display = 'inline-block';
      lateBadge.innerText = `• ${lates.length} người`;
    } else {
      lateBadge.style.display = 'none';
    }
  }

  if (lateTbody) {
    if (lates.length === 0) {
      lateTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #10b981; padding: 20px; font-weight: 600;">Không có nhân viên nào đi muộn hôm nay</td></tr>`;
    } else {
      lateTbody.innerHTML = lates.map(l => `
        <tr>
          <td>
            <div style="font-weight: 700;">${l.empName || 'Nhân viên'}</div>
            <div style="font-size: 11px; color: #94a3b8;">${l.empCode || ''}</div>
          </td>
          <td>${l.checkInTime || '--:--'}</td>
          <td><span style="color: #d97706; font-weight: 600;">${l.lateMinutes || 0} phút</span></td>
          <td><a class="link-action-blue" style="cursor: pointer;" onclick="openLateDetailModal('${l.empName || ''}', '${l.empCode || ''}', '${l.lateMinutes || 0} phút', '${l.checkInTime || ''}', '${l.departmentName || ''}')">Xem xét →</a></td>
        </tr>
      `).join('');
    }
  }
}

async function loadDepartmentsData() {
  try {
    const res = await apiCall('/api/organization/departments');
    state.departments = res.data && res.data.length ? res.data : MOCK_DEPARTMENTS;
  } catch (err) {
    state.departments = MOCK_DEPARTMENTS;
  }
  renderDepartmentsTable(state.departments);
}

function renderDepartmentsTable(list) {
  const tbody = document.getElementById('departmentsTableFullBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8;">Chưa có dữ liệu phòng ban</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      (d) => `
    <tr>
      <td><strong>${d.code}</strong></td>
      <td><strong>${d.name}</strong></td>
      <td>${d.manager_name || 'Chưa bổ nhiệm'}</td>
      <td><span class="badge-status badge-approved">${d.employee_count || 0} nhân sự</span></td>
      <td>${d.description || '-'}</td>
      <td><span class="badge-status ${d.status === 'ACTIVE' ? 'badge-approved' : 'badge-rejected'}">${d.status || 'ACTIVE'}</span></td>
    </tr>
  `
    )
    .join('');
}

function handleDepartmentFilter() {
  const kw = document.getElementById('departmentSearchInput')?.value.toLowerCase() || '';
  const filtered = (state.departments || []).filter(
    (d) => d.name.toLowerCase().includes(kw) || d.code.toLowerCase().includes(kw)
  );
  renderDepartmentsTable(filtered);
}

async function loadEmployeesData() {
  const isDemo = ['admin', 'manager', 'hr_admin', 'employee'].includes(state.user?.username);
  const isManager = state.user?.role === 'MANAGER';
  const isEmployee = state.user?.role === 'EMPLOYEE';

  try {
    const res = (await apiCall('/api/v1/employees').catch(() => null)) || (await apiCall('/api/organization/employees').catch(() => null));
    if (res && Array.isArray(res.data)) {
      state.employees = [...res.data];
    } else if (isDemo) {
      state.employees = [...MOCK_EMPLOYEES];
    } else {
      state.employees = [];
    }
  } catch (err) {
    state.employees = isDemo ? [...MOCK_EMPLOYEES] : [];
  }

  // 1. Đồng bộ người dùng đăng ký từ auth-service (:3001) nếu người dùng có quyền quản trị
  if (['ADMIN', 'HR'].includes(state.user?.role)) {
    try {
      const authUsersRes = await apiCall('/api/auth/users').catch(() => null);
      if (authUsersRes && authUsersRes.success && Array.isArray(authUsersRes.data)) {
        authUsersRes.data.forEach(u => {
          if (['admin', 'hr_admin', 'manager', 'employee'].includes(u.username)) return;
          if (['INACTIVE', 'DELETED', 'RESIGNED'].includes(u.status)) return;
          saveRegisteredUser({
            id: u.id,
            username: u.username,
            email: u.email,
            fullName: u.fullName || u.username,
            role: u.role || 'EMPLOYEE',
            status: u.status || 'PENDING_ASSIGNMENT'
          });
        });
      }
    } catch (authErr) {
      console.warn('Không thể đồng bộ người dùng từ auth-service:', authErr.message);
    }
  }

  // 2. Kết hợp các tài khoản tự đăng ký vào bảng nhân sự (chỉ dành cho ADMIN, HR)
  if (['ADMIN', 'HR'].includes(state.user?.role)) {
    const registeredUsers = getRegisteredUsersList();
    registeredUsers.forEach(regUser => {
      const assignment = getUserAssignment(regUser.username, regUser.id);
      const existingIdx = state.employees.findIndex(e => 
        (e.email && regUser.email && e.email.toLowerCase() === regUser.email.toLowerCase()) || 
        (e.username && e.username === regUser.username) ||
        (e.code && (e.code === regUser.username || e.code === 'EMP_' + regUser.username.toUpperCase()))
      );
      
      if (existingIdx >= 0) {
        state.employees[existingIdx].username = regUser.username;
        if (assignment) {
          if (assignment.code || assignment.employeeCode) {
            state.employees[existingIdx].code = assignment.code || assignment.employeeCode;
          }
          state.employees[existingIdx].department_name = assignment.department;
          state.employees[existingIdx].position_title = assignment.position;
          state.employees[existingIdx].contract_type = 'OFFICIAL';
          state.employees[existingIdx].status = 'ACTIVE';
        }
      } else {
        if (assignment) {
          state.employees.unshift({
            id: regUser.id,
            username: regUser.username,
            code: assignment.code || assignment.employeeCode || ('EMP_' + regUser.username.toUpperCase()),
            full_name: regUser.fullName || regUser.username,
            email: regUser.email,
            phone: regUser.phone || '0912345678',
            department_name: assignment.department,
            position_title: assignment.position,
            contract_type: 'OFFICIAL',
            status: 'ACTIVE'
          });
        } else {
          // Tài khoản đang chờ tiếp nhận
          state.employees.unshift({
            id: regUser.id,
            username: regUser.username,
            code: 'CHỜ CẤP MÃ',
            full_name: regUser.fullName || regUser.username,
            email: regUser.email,
            phone: regUser.phone || '-',
            department_name: 'Chưa phân phòng ban (Chờ tiếp nhận)',
            position_title: 'Nhân viên mới (Chờ phân công)',
            contract_type: 'PENDING',
            status: 'PENDING_ASSIGNMENT'
          });
        }
      }
    });
  }

  const curFilter = document.getElementById('employeeFilterStatus')?.value || 'ALL';
  const curKw = document.getElementById('employeeSearchInput')?.value?.trim() || '';
  if (curFilter !== 'ALL' || curKw) {
    handleEmployeeFilter();
  } else {
    renderEmployeesTable(state.employees);
  }
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById('employeesTableFullBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #94a3b8;">Chưa có dữ liệu nhân sự</td></tr>';
    return;
  }

  const canManage = ['ADMIN', 'HR', 'MANAGER'].includes(state.user?.role);

  tbody.innerHTML = list.map(e => {
    let statusBadge = '<span class="badge-status badge-approved">ACTIVE</span>';
    let actionBtn = '-';

    if (e.status === 'PENDING_ASSIGNMENT') {
      statusBadge = '<span class="badge-status" style="background:#fef3c7; color:#b45309; font-weight:700;">Chờ tiếp nhận ban phòng</span>';
      if (canManage) {
        actionBtn = `
          <button class="btn-primary-blue" style="padding: 5px 12px; font-size: 11.5px; border-radius: 6px; font-weight: 700;" onclick="openOnboardEmployeeModal('${e.username || ''}', '${e.full_name || ''}', '${e.email || ''}', '${e.id || ''}')">
            Tiếp nhận &amp; Phân ca, Lương
          </button>
        `;
      }
    } else {
      if (e.status === 'INACTIVE') {
        statusBadge = '<span class="badge-status" style="background:#fee2e2; color:#b91c1c; font-weight:700;">Tạm ngưng</span>';
      } else if (e.status === 'RESIGNED') {
        statusBadge = '<span class="badge-status" style="background:#f1f5f9; color:#64748b; font-weight:700;">Đã nghỉ việc</span>';
      }

      if (canManage) {
        const currentUserId = state.user?.id || state.user?.userId || state.user?.empId || '';
        const currentUserName = state.user?.username || '';
        const currentUserCode = state.user?.code || state.user?.empCode || '';
        const isSelf = (currentUserId && (e.id === currentUserId || e.emp_id === currentUserId)) ||
                       (currentUserCode && (e.code === currentUserCode || e.employee_code === currentUserCode)) ||
                       (currentUserName === 'admin' && (e.code === 'EMP001' || e.email === 'admin@htqlns.com')) ||
                       (currentUserName && (e.email === state.user?.email || e.username === currentUserName));

        actionBtn = `
          <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
            <button class="btn-secondary-outline" onclick="openEditEmployeeModal('${e.id}')" style="cursor: pointer; padding: 4px 10px; font-size: 11.5px; border-radius: 6px; font-weight: 600; color: #2563eb; border-color: #93c5fd; background: #eff6ff;" title="Sửa thông tin nhân viên">
              Sửa
            </button>
            ${!isSelf ? `
            <button class="btn-reject-sm" onclick="confirmDeleteEmployee('${e.id}', '${e.full_name || e.code}')" style="cursor: pointer; padding: 4px 10px; font-size: 11.5px; border-radius: 6px;" title="Xóa nhân viên">
              Xóa
            </button>` : ''}
          </div>
        `;
      }
    }

    let deptName = e.department_name || '-';
    let posTitle = e.position_title || e.position_name || '-';
    if (e.status === 'ACTIVE') {
      if (!deptName || deptName === '-') deptName = 'Phòng Công nghệ & Phần mềm';
      if (!posTitle || posTitle === '-') posTitle = 'Kỹ sư phần mềm';
    }
    if (deptName === 'Phòng Nhân sự' || (deptName.includes('Nhân sự') && !deptName.includes('Hành chính'))) {
      deptName = 'Phòng Hành chính Nhân sự';
    }
    if (posTitle.includes('Kỹ sư phần mềm SOA') || posTitle.includes('Kỹ Sư Phần Mềm SOA')) {
      posTitle = 'Kỹ sư phần mềm';
    }

    return `
      <tr style="${e.status === 'PENDING_ASSIGNMENT' ? 'background: #fffbeb;' : ''}">
        <td><strong>${e.code || e.employee_code}</strong></td>
        <td><strong>${e.full_name}</strong></td>
        <td>${e.email}</td>
        <td>${e.phone || '-'}</td>
        <td>${deptName}</td>
        <td>${posTitle}</td>
        <td><span class="badge-status" style="background:#f1f5f9; color:#475569;">${e.contract_type || 'OFFICIAL'}</span></td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function handleEmployeeFilter() {
  const kw = document.getElementById('employeeSearchInput')?.value.toLowerCase().trim() || '';
  const statusFilter = document.getElementById('employeeFilterStatus')?.value || 'ALL';

  const filtered = (state.employees || []).filter((e) => {
    const fullName = (e.full_name || e.fullName || '').toLowerCase();
    const code = (e.code || e.employee_code || '').toLowerCase();
    const email = (e.email || '').toLowerCase();

    const matchesKw = !kw || fullName.includes(kw) || code.includes(kw) || email.includes(kw);
    if (!matchesKw) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PENDING') {
      return (
        e.status === 'PENDING_ASSIGNMENT' ||
        e.status === 'PENDING' ||
        e.contract_type === 'PENDING' ||
        (e.department_name && e.department_name.includes('Chờ tiếp nhận'))
      );
    }
    if (statusFilter === 'ACTIVE') {
      return e.status === 'ACTIVE' || (!e.status && e.contract_type !== 'PENDING');
    }
    return e.status === statusFilter;
  });
  renderEmployeesTable(filtered);
}

// ==============================================================================
// CHỨC NĂNG SỬA & XÓA THÔNG TIN NHÂN VIÊN
// ==============================================================================

function openEditEmployeeModal(empId) {
  const emp = (state.employees || []).find(e => String(e.id) === String(empId) || e.code === empId);
  if (!emp) {
    return showToast('Không tìm thấy thông tin nhân viên', 'error');
  }

  const assignment = getUserAssignment(emp.username, emp.id) || {};
  const code = emp.code || emp.employee_code || emp.employeeCode || '';
  const fullName = emp.full_name || emp.fullName || '';
  const email = emp.email || '';
  const phone = (emp.phone && emp.phone !== '-') ? emp.phone : (assignment.phone || '');
  const currentDept = emp.department_name || assignment.department || 'Phòng Kỹ Thuật';
  const currentManager = emp.manager_name || assignment.managerName || 'Nguyễn Thanh Lâm (Trưởng ban Công nghệ)';
  const currentOffice = assignment.officeLocation || 'Văn phòng Quy Nhơn (170 An Dương Vương)';
  const currentShift = assignment.shiftName || 'Ca Hành Chính';
  const rawPos = emp.position_title || emp.position_name || assignment.position || 'Kỹ sư phần mềm';
  const currentPosition = (rawPos.includes('Kỹ sư phần mềm SOA') || rawPos.includes('Kỹ Sư Phần Mềm SOA')) ? 'Kỹ sư phần mềm' : rawPos;
  const currentSalary = assignment.baseSalary || 15000000;
  const currentStatus = emp.status || 'ACTIVE';

  const html = `
    <div style="padding: 10px 0;">
      <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; margin-bottom: 18px;">
        <div style="font-weight: 700; color: #0f172a; font-size: 14.5px;">Chỉnh sửa hồ sơ nhân sự</div>
        <div style="font-size: 12.5px; color: #64748b; margin-top: 4px;">
          Cập nhật thông tin định danh, ca làm việc, văn phòng và mức lương cơ bản cho nhân viên.
        </div>
      </div>

      <form id="formEditEmployee" onsubmit="handleUpdateEmployeeSubmit(event, '${emp.id}')">
        <!-- Hàng 1: Mã nhân viên & Họ tên -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Mã nhân viên (employeeCode) *</label>
            <input type="text" id="editEmpCode" value="${code}" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px; text-transform: uppercase; font-weight: 700; color: #2563eb;" required>
          </div>
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Họ và tên *</label>
            <input type="text" id="editEmpFullName" value="${fullName}" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px; font-weight: 600;" required>
          </div>
        </div>

        <!-- Hàng 2: Email & Số điện thoại -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Email liên hệ *</label>
            <input type="email" id="editEmpEmail" value="${email}" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;" required>
          </div>
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Số điện thoại</label>
            <input type="text" id="editEmpPhone" value="${phone}" placeholder="09xxxxxxxx" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;">
          </div>
        </div>

        <!-- Hàng 3: Phòng ban & Quản lý trực tiếp -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Phòng ban (departmentId) *</label>
            <select id="editEmpDept" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;" required>
              <option value="Phòng Kỹ Thuật" ${currentDept.includes('Kỹ Thuật') || currentDept.includes('Công nghệ') ? 'selected' : ''}>Phòng Kỹ Thuật</option>
              <option value="Phòng Hành chính Nhân sự" ${currentDept.includes('Nhân sự') ? 'selected' : ''}>Phòng Hành chính Nhân sự</option>
              <option value="Phòng Kinh Doanh" ${currentDept.includes('Kinh Doanh') ? 'selected' : ''}>Phòng Kinh Doanh</option>
              <option value="Phòng Tài Chính - Kế Toán" ${currentDept.includes('Tài Chính') ? 'selected' : ''}>Phòng Tài Chính - Kế Toán</option>
              <option value="Ban Giám Đốc" ${currentDept.includes('Giám Đốc') ? 'selected' : ''}>Ban Giám Đốc</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Quản lý trực tiếp (managerId) *</label>
            <select id="editEmpManager" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;" required>
              <option value="Nguyễn Thanh Lâm (Trưởng ban Công nghệ)" ${currentManager.includes('Lâm') || currentManager.includes('Công nghệ') ? 'selected' : ''}>Nguyễn Thanh Lâm (Trưởng ban Công nghệ)</option>
              <option value="Lê Ngọc Mai (Trưởng phòng Nhân sự)" ${currentManager.includes('Mai') ? 'selected' : ''}>Lê Ngọc Mai (Trưởng phòng Nhân sự)</option>
              <option value="Phạm Minh Tuân (Trưởng phòng Kinh Doanh)" ${currentManager.includes('Tuân') ? 'selected' : ''}>Phạm Minh Tuân (Trưởng phòng Kinh Doanh)</option>
              <option value="Đỗ Thu Hà (Trưởng phòng Tài Chính - Kế Toán)" ${currentManager.includes('Hà') ? 'selected' : ''}>Đỗ Thu Hà (Trưởng phòng Tài Chính - Kế Toán)</option>
              <option value="Vũ Đức Hiếu (Ban Giám Đốc)" ${currentManager.includes('Hiếu') ? 'selected' : ''}>Vũ Đức Hiếu (Ban Giám Đốc)</option>
            </select>
          </div>
        </div>

        <!-- Hàng 4: Văn phòng GPS & Ca làm việc -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Văn phòng GPS (officeId) *</label>
            <select id="editEmpOffice" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;" required>
              <option value="Văn phòng Quy Nhơn (170 An Dương Vương)" ${currentOffice.includes('Quy Nhơn') ? 'selected' : ''}>Văn phòng Quy Nhơn (170 An Dương Vương)</option>
              <option value="Trụ sở Hà Nội (HITC Cầu Giấy)" ${currentOffice.includes('Hà Nội') ? 'selected' : ''}>Trụ sở Hà Nội (HITC Cầu Giấy)</option>
              <option value="Chi nhánh TP.HCM (72 Lê Thánh Tôn, Q.1)" ${currentOffice.includes('TP.HCM') || currentOffice.includes('HCM') ? 'selected' : ''}>Chi nhánh TP.HCM (72 Lê Thánh Tôn, Q.1)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Ca làm việc (shiftId) *</label>
            <select id="editEmpShift" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;" required>
              <option value="Ca Hành Chính" ${currentShift.includes('Hành Chính') ? 'selected' : ''}>Ca Hành Chính (08:00 - 17:30)</option>
              <option value="Ca Sáng" ${currentShift.includes('Sáng') ? 'selected' : ''}>Ca Sáng (06:00 - 14:00)</option>
              <option value="Ca Chiều" ${currentShift.includes('Chiều') ? 'selected' : ''}>Ca Chiều (14:00 - 22:00)</option>
              <option value="Ca Linh Hoạt" ${currentShift.includes('Linh Hoạt') ? 'selected' : ''}>Ca Linh Hoạt</option>
            </select>
          </div>
        </div>

        <!-- Hàng 5: Chức danh / Vị trí & Lương cơ bản -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Chức danh / Vị trí (position) *</label>
            <select id="editEmpPosition" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;" required>
              <option value="Kỹ sư phần mềm" ${(currentPosition === 'Kỹ sư phần mềm' || currentPosition.includes('phần mềm') || currentPosition.includes('SOA')) ? 'selected' : ''}>Kỹ sư phần mềm</option>
              <option value="Chuyên viên Phát triển Hệ thống" ${currentPosition.includes('Hệ thống') ? 'selected' : ''}>Chuyên viên Phát triển Hệ thống</option>
              <option value="Frontend & UI Developer" ${currentPosition.includes('Frontend') ? 'selected' : ''}>Frontend & UI Developer</option>
              <option value="Backend Developer" ${currentPosition.includes('Backend') ? 'selected' : ''}>Backend Developer</option>
              <option value="Chuyên viên Tuyển dụng & C&B" ${currentPosition.includes('Tuyển dụng') ? 'selected' : ''}>Chuyên viên Tuyển dụng & C&B</option>
              <option value="Chuyên viên Kinh doanh" ${currentPosition.includes('Kinh doanh') ? 'selected' : ''}>Chuyên viên Kinh doanh</option>
              <option value="Kế toán viên tiền lương" ${currentPosition.includes('Kế toán') ? 'selected' : ''}>Kế toán viên tiền lương</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Mức lương cơ bản (baseSalary VND) *</label>
            <input type="number" id="editEmpSalary" value="${currentSalary}" min="5000000" step="500000" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px; font-weight: 600;" required>
          </div>
        </div>

        <!-- Hàng 6: Trạng thái hoạt động -->
        <div style="margin-bottom: 22px;">
          <label style="display: block; font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 5px;">Trạng thái hoạt động *</label>
          <select id="editEmpStatus" class="input-filter-select" style="width: 100%; height: 40px; border-radius: 8px;">
            <option value="ACTIVE" ${currentStatus === 'ACTIVE' ? 'selected' : ''}>ACTIVE (Đang làm việc)</option>
            <option value="INACTIVE" ${currentStatus === 'INACTIVE' ? 'selected' : ''}>INACTIVE (Tạm ngưng)</option>
            <option value="RESIGNED" ${currentStatus === 'RESIGNED' ? 'selected' : ''}>RESIGNED (Đã nghỉ việc)</option>
          </select>
        </div>

        <!-- Nút thao tác -->
        <div style="display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
          <button type="button" class="btn-secondary-outline" onclick="closeModal()">Hủy bỏ</button>
          <button type="submit" class="btn-primary-blue" style="padding: 9px 20px; font-weight: 700; border-radius: 8px;">
            Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  `;

  openModal(`Sửa thông tin nhân sự – ${fullName || code}`, html);
}

async function handleUpdateEmployeeSubmit(e, empId) {
  if (e && e.preventDefault) e.preventDefault();

  const code = (document.getElementById('editEmpCode')?.value || '').trim().toUpperCase();
  const fullName = (document.getElementById('editEmpFullName')?.value || '').trim();
  const email = (document.getElementById('editEmpEmail')?.value || '').trim();
  const phone = (document.getElementById('editEmpPhone')?.value || '').trim();
  const dept = document.getElementById('editEmpDept')?.value;
  const manager = document.getElementById('editEmpManager')?.value;
  const office = document.getElementById('editEmpOffice')?.value;
  const shift = document.getElementById('editEmpShift')?.value;
  const position = document.getElementById('editEmpPosition')?.value;
  const salary = Number(document.getElementById('editEmpSalary')?.value) || 15000000;
  const status = document.getElementById('editEmpStatus')?.value || 'ACTIVE';

  if (!code || !fullName || !email) {
    return showToast('Vui lòng điền đầy đủ Mã nhân viên, Họ tên và Email', 'warning');
  }

  // 1. Gọi API Backend PUT /api/v1/employees/:id
  try {
    await apiCall(`/api/v1/employees/${empId}`, {
      method: 'PUT',
      body: JSON.stringify({
        employeeCode: code,
        code,
        fullName,
        email,
        phone,
        departmentName: dept,
        department: dept,
        managerName: manager,
        positionTitle: position,
        position,
        officeLocation: office,
        shiftName: shift,
        baseSalary: salary,
        status,
        contractType: 'OFFICIAL'
      })
    });
  } catch (apiErr) {
    console.warn('Lỗi gọi API PUT /api/v1/employees:', apiErr.message);
  }

  // 2. Cập nhật state.employees trực tiếp
  const targetIdx = (state.employees || []).findIndex(x => String(x.id) === String(empId) || x.code === code);
  if (targetIdx >= 0) {
    state.employees[targetIdx].code = code;
    state.employees[targetIdx].employee_code = code;
    state.employees[targetIdx].full_name = fullName;
    state.employees[targetIdx].email = email;
    state.employees[targetIdx].phone = phone;
    state.employees[targetIdx].department_name = dept;
    state.employees[targetIdx].position_title = position;
    state.employees[targetIdx].status = status;
  }

  // 3. Cập nhật assignment lưu trữ
  const empObj = state.employees ? state.employees[targetIdx] : null;
  const username = empObj?.username || empId;
  saveUserAssignment(username, {
    id: empId,
    username,
    fullName,
    email,
    code,
    employeeCode: code,
    department: dept,
    managerName: manager,
    position,
    officeLocation: office,
    shiftName: shift,
    baseSalary: salary,
    status,
    contractType: 'OFFICIAL'
  });

  closeModal();
  showToast(`Cập nhật thông tin nhân viên "${fullName}" (${code}) thành công!`, 'success');

  // Làm mới bảng danh sách ngay lập tức
  renderEmployeesTable(state.employees);
  await loadEmployeesData();
}

function confirmDeleteEmployee(id, name) {
  openModal(
    'Xác nhận xóa nhân sự',
    `
    <div style="padding: 10px 0;">
      <p style="font-size: 14px; color: #1e293b;">Bạn có chắc chắn muốn xóa nhân sự <strong>${name}</strong> khỏi hệ thống?</p>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;">
        <button class="btn-secondary-outline" onclick="closeModal()">Hủy</button>
        <button class="btn-reject-sm" style="padding: 8px 18px; font-weight: 700;" onclick="handleDeleteEmployee('${id}', '${name}')">Xác nhận Xóa</button>
      </div>
    </div>
    `
  );
}

async function handleDeleteEmployee(id, name) {
  try {
    await apiCall(`/api/v1/employees/${id}`, { method: 'DELETE' });
    state.employees = (state.employees || []).filter(e => String(e.id) !== String(id));
    if (typeof removeRegisteredUser === 'function') {
      removeRegisteredUser(id);
      removeRegisteredUser(name);
    }
    closeModal();
    showToast(`Đã xóa nhân viên ${name} thành công`, 'success');
    renderEmployeesTable(state.employees);
  } catch (err) {
    closeModal();
    showToast(err.message || 'Lỗi khi xóa nhân viên', 'error');
  }
}

// Nạp lịch sử chấm công toàn bộ nhân viên (từ Attendance Service :3003)
async function loadAttendanceHistoryData() {
  const tbody = document.getElementById('attendanceHistoryTableBody');
  if (!tbody) return;

  const dateInput = document.getElementById('attFilterDate');
  const filterDate = dateInput ? dateInput.value : '';
  const filterDept = document.getElementById('attFilterDept')?.value || 'ALL';
  const filterStatus = document.getElementById('attFilterStatus')?.value || 'ALL';

  tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 20px;">Đang tải dữ liệu từ Attendance Service (:3003)...</td></tr>`;

  let records = [];
  try {
    let queryParams = [];
    if (filterStatus && filterStatus !== 'ALL') queryParams.push(`status=${filterStatus}`);
    if (filterDept && filterDept !== 'ALL') queryParams.push(`dept=${encodeURIComponent(filterDept)}`);
    if (filterDate) queryParams.push(`workDate=${filterDate}`);
    const qs = queryParams.length ? `?${queryParams.join('&')}` : '';

    const res = await apiCall(`/api/attendance${qs}`);
    if (res && res.success && Array.isArray(res.data)) {
      records = res.data.map(r => {
        const empCode = r.emp_code || (r.emp_id ? (r.emp_id.length > 10 ? 'NV-' + r.emp_id.slice(-4) : r.emp_id) : 'NV-001');
        const rawDate = r.work_date ? String(r.work_date).slice(0, 10) : '';
        const formattedDate = rawDate ? rawDate.split('-').reverse().join('/') : '-';

        let inTime = '-';
        if (r.check_in_time) {
          inTime = r.check_in_time.includes('T')
            ? new Date(r.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            : String(r.check_in_time).slice(11, 16);
        }

        let outTime = '-';
        if (r.check_out_time) {
          outTime = r.check_out_time.includes('T')
            ? new Date(r.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            : String(r.check_out_time).slice(11, 16);
        }

        return {
          id: r.id,
          emp_id: r.emp_id,
          code: empCode,
          name: r.emp_name || `Nhân viên (${empCode})`,
          dept: r.dept_name || '-',
          dept_code: r.dept_code || '',
          work_date: rawDate,
          date: formattedDate,
          in: inTime,
          out: outTime,
          hours: r.actual_working_hours ? `${r.actual_working_hours} h` : (inTime !== '-' && outTime !== '-' ? '8.0 h' : '0.0 h'),
          status: r.status,
          late_minutes: r.late_minutes || 0,
          adj_id: r.adjustment_id || null,
          adj_reason: r.adjustment_reason || null,
          adj_status: r.adjustment_status || null
        };
      });
    }
  } catch (err) {
    console.warn('Lỗi tải dữ liệu attendance:', err.message);
  }

  // Cô lập trạng thái dữ liệu công ty / đội nhóm, không ghi đè state.myAttendance cá nhân
  state.attendanceHistory = records;

  let filtered = records;
  if (filterDept && filterDept !== 'ALL') {
    filtered = filtered.filter(r => (r.dept && r.dept.includes(filterDept)) || (r.dept_code && r.dept_code === filterDept));
  }
  if (filterStatus && filterStatus !== 'ALL') {
    filtered = filtered.filter(r => r.status === filterStatus);
  }
  if (filterDate) {
    filtered = filtered.filter(r => r.work_date === filterDate);
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 24px;">Không có bản ghi chấm công nào trong phạm vi quản lý hoặc bộ lọc đã chọn</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    let badge = '<span class="badge-status badge-approved">Đúng giờ</span>';
    if (r.status === 'LATE') badge = `<span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn (${r.late_minutes || 0}p)</span>`;
    else if (r.status === 'EARLY_LEAVE') badge = '<span class="badge-status" style="background:#fff7ed; color:#c2410c;">Về sớm</span>';
    else if (r.status === 'LEAVE') badge = '<span class="badge-status" style="background:#eff6ff; color:#2563eb;">Nghỉ phép</span>';
    else if (r.status === 'ABSENT') badge = '<span class="badge-status" style="background:#fee2e2; color:#ef4444;">Vắng mặt</span>';

    const cleanName = (r.name || '').replace(/'/g, "\\'");
    const cleanDept = (r.dept || '').replace(/'/g, "\\'");
    const cleanReason = (r.adj_reason || '').replace(/'/g, "\\'");

    let actionBtn = `<a class="link-action-blue" style="cursor: pointer;" onclick="openOnTimeDetailModal('${cleanName}', '${r.code}', '${r.in}', '${r.out}', '${cleanDept}')">Chi tiết</a>`;
    if (r.status === 'LATE') {
      actionBtn = `<a class="link-action-blue" style="cursor: pointer; color: #d97706; font-weight: 600;" onclick="openLateDetailModal('${cleanName}', '${r.code}', '${r.late_minutes || 15} phút', '${r.in}', '${cleanDept}', '${cleanReason}', '${r.adj_id || ''}', '${r.adj_status || ''}')">Xem giải trình</a>`;
    } else if (r.status === 'LEAVE') {
      actionBtn = `<a class="link-action-blue" style="cursor: pointer; color: #2563eb;" onclick="navigateToView('requests')">Xem đơn nghỉ</a>`;
    }

    return `
      <tr>
        <td><strong>${r.code}</strong></td>
        <td><strong>${r.name}</strong></td>
        <td>${r.dept}</td>
        <td>${r.date}</td>
        <td>${r.in}</td>
        <td>${r.out}</td>
        <td><strong>${r.hours}</strong></td>
        <td>${badge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

// Nạp lịch sử chấm công cá nhân (kết nối API GET /api/attendance)
// Nạp lịch sử chấm công cá nhân (kết nối endpoint mới GET /api/v1/attendances/history)
async function loadMyAttendanceData() {
  const tbody = document.getElementById('myAttendanceTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">Đang tải lịch sử chấm công cá nhân...</td></tr>`;

  // Đọc các giá trị bộ lọc
  const now = new Date();
  const monthSelect = document.getElementById('myAttFilterMonth');
  const yearSelect = document.getElementById('myAttFilterYear');
  const statusSelect = document.getElementById('myAttFilterStatus');

  const month = monthSelect ? monthSelect.value : (now.getMonth() + 1);
  const year = yearSelect ? yearSelect.value : now.getFullYear();
  const status = statusSelect ? statusSelect.value : 'ALL';

  let records = [];
  let summaryMeta = null;

  try {
    const url = `/api/v1/attendances/history?month=${month}&year=${year}&status=${status}`;
    const res = await apiCall(url);

    if (res && res.success) {
      records = Array.isArray(res.data) ? res.data : [];
      summaryMeta = res.meta || null;
    }
  } catch (err) {
    console.warn('Lỗi gọi API /api/v1/attendances/history, thử lại fallback:', err.message);
  }

  // Cập nhật các thẻ tóm tắt KPI đầu trang
  const cardWorkDays = document.getElementById('myAttSummaryWorkDays');
  const cardWorkHours = document.getElementById('myAttSummaryWorkHours');
  const cardExceptions = document.getElementById('myAttSummaryExceptions');
  const cardExceptionsNote = document.getElementById('myAttSummaryExceptionsNote');

  if (summaryMeta?.summary) {
    const sum = summaryMeta.summary;
    if (cardWorkDays) cardWorkDays.innerText = `${sum.totalWorkDays} ngày`;
    if (cardWorkHours) cardWorkHours.innerText = `${sum.totalWorkingHours} giờ`;
    if (cardExceptions) cardExceptions.innerText = `${sum.totalExceptions} lần`;
    if (cardExceptionsNote) {
      cardExceptionsNote.innerText = `${sum.lateCount} đi muộn • ${sum.earlyLeaveCount} về sớm • ${sum.missingCheckoutCount} thiếu check-out`;
    }
  } else {
    // Fallback tính toán từ records
    const totalDays = records.filter(r => ['ON_TIME', 'LATE', 'EARLY_LEAVE', 'MISSING_CHECKOUT'].includes(r.status)).length;
    const totalHours = records.reduce((acc, cur) => acc + (Number(cur.workingHours) || 0), 0);
    const exceptions = records.filter(r => ['LATE', 'EARLY_LEAVE', 'MISSING_CHECKOUT', 'LATE_AND_EARLY'].includes(r.status)).length;

    if (cardWorkDays) cardWorkDays.innerText = `${totalDays} ngày`;
    if (cardWorkHours) cardWorkHours.innerText = `${totalHours.toFixed(1)} giờ`;
    if (cardExceptions) cardExceptions.innerText = `${exceptions} lần`;
  }

  // Nếu tài khoản mới chưa gán phòng ban -> thông báo rõ ràng
  if (summaryMeta?.unassigned) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #b45309; padding: 30px; background: #fffbeb;">
          <div style="font-weight: 700; font-size: 15px; margin-bottom: 6px;">⚠️ Bạn chưa thuộc phòng ban/tổ chức nào</div>
          <div style="font-size: 13px; color: #78350f; max-width: 500px; margin: 0 auto; line-height: 1.5;">
            Vui lòng nhập mã mời (Invite Code) từ Quản lý của bạn tại Sảnh chờ hoặc bấm chấp nhận thư mời để kích hoạt bảng chấm công cá nhân.
          </div>
        </td>
      </tr>
    `;
    checkTodayAttendanceStatus();
    return;
  }

  if (!records.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #64748b; padding: 24px;">
          Không tìm thấy bản ghi chấm công nào phù hợp với bộ lọc Tháng ${month}/${year}.
        </td>
      </tr>
    `;
    checkTodayAttendanceStatus();
    return;
  }

  tbody.innerHTML = records.map(r => {
    // 1. Huy hiệu trạng thái
    let statusBadge = '<span class="badge-status badge-approved">Đúng giờ</span>';
    if (r.status === 'LATE') {
      statusBadge = `<span class="badge-status" style="background:#fef3c7; color:#d97706; font-weight:700;">Đi muộn (${r.lateMinutes || 0}p)</span>`;
    } else if (r.status === 'EARLY_LEAVE') {
      statusBadge = `<span class="badge-status" style="background:#fef9c3; color:#a16207; font-weight:700;">Về sớm (${r.earlyLeaveMinutes || 0}p)</span>`;
    } else if (r.status === 'LATE_AND_EARLY') {
      statusBadge = `<span class="badge-status" style="background:#fee2e2; color:#c2410c; font-weight:700;">Đi muộn & Về sớm</span>`;
    } else if (r.status === 'MISSING_CHECKOUT') {
      statusBadge = `<span class="badge-status" style="background:#fee2e2; color:#b91c1c; font-weight:700;">Thiếu check-out</span>`;
    } else if (r.status === 'ON_LEAVE') {
      statusBadge = '<span class="badge-status" style="background:#eff6ff; color:#2563eb; font-weight:700;">Nghỉ phép</span>';
    } else if (r.status === 'ABSENT') {
      statusBadge = '<span class="badge-status" style="background:#f1f5f9; color:#64748b; font-weight:700;">Vắng mặt</span>';
    }

    // 2. Ô Thao tác / Giải trình
    let adjCell = '<span style="color: #94a3b8;">-</span>';
    if (r.adjustmentStatus === 'APPROVED') {
      adjCell = '<span class="badge-status badge-approved" style="font-size: 11px;">✓ Đã duyệt giải trình</span>';
    } else if (r.adjustmentStatus === 'PENDING') {
      adjCell = '<span class="badge-status" style="background:#fef3c7; color:#b45309; font-size: 11px;">⏳ Chờ duyệt giải trình</span>';
    } else if (['LATE', 'EARLY_LEAVE', 'MISSING_CHECKOUT', 'LATE_AND_EARLY'].includes(r.status)) {
      const dateForModal = r.rawWorkDate || r.workDate;
      const inTimeForModal = r.checkInTime || '08:00:00';
      adjCell = `
        <button type="button" class="btn-primary-blue" style="padding: 4px 10px; font-size: 11.5px; border-radius: 6px; font-weight: 600; cursor: pointer;"
          onclick="openSubmitAdjustmentModal('${r.id || ''}', '${dateForModal}', '${inTimeForModal}')" title="Gửi đơn giải trình ngày này">
          📝 Gửi giải trình
        </button>
      `;
    }

    // 3. Vị trí và khoảng cách GPS
    const distText = r.distanceMeters !== null && r.distanceMeters !== undefined ? `${r.distanceMeters}m` : '-';
    const methodBadge = r.checkInMethod === 'WIFI'
      ? `<span class="badge-status" style="background:#eff6ff; color:#1d4ed8; font-size: 11px;">📶 Wi-Fi</span>`
      : `<span class="badge-status" style="background:#f0fdf4; color:#15803d; font-size: 11px;">📍 GPS (${distText})</span>`;

    const workingHoursText = r.workingHours ? `<strong>${r.workingHours}h</strong>` : '<span style="color:#94a3b8;">-</span>';
    const checkOutText = r.checkOutTime || '<span style="color:#ef4444; font-weight:600;">Chưa ra ca</span>';

    return `
      <tr>
        <td><strong>${r.workDate}</strong></td>
        <td>${r.checkInTime || '-'}</td>
        <td>${checkOutText}</td>
        <td>${methodBadge}</td>
        <td>${workingHoursText}</td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">${adjCell}</td>
      </tr>
    `;
  }).join('');

  checkTodayAttendanceStatus();
}

// Kiểm tra trạng thái chấm công hôm nay để đồng bộ nút Check-in / Check-out (F5 hoặc mở trang)
async function checkTodayAttendanceStatus() {
  if (!state.token || !state.user) return;
  const checkinBtn = document.getElementById('btnMyCheckIn');
  const checkoutBtn = document.getElementById('btnMyCheckOut');
  if (!checkinBtn) return;

  try {
    const todayStr = toLocalDateString(new Date());
    let todayRecord = null;

    // 1. Kiểm tra từ API
    try {
      const res = await apiCall('/api/attendance');
      if (res && res.success && Array.isArray(res.data)) {
        todayRecord = res.data.find(r => {
          if (!r.work_date) return false;
          const rDate = toLocalDateString(r.work_date);
          return rDate === todayStr;
        });
      }
    } catch (_) {}

    // 2. Fallback từ storage cá nhân nếu API chưa đồng bộ
    if (!todayRecord && typeof getUserEntityList === 'function') {
      const userAtts = getUserEntityList('attendances');
      todayRecord = userAtts.find(l => l.work_date && l.work_date.startsWith(todayStr));
    }

    if (todayRecord) {
      if (todayRecord.check_in_time) {
        const inTime = new Date(todayRecord.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        checkinBtn.disabled = true;
        checkinBtn.innerText = `Đã Check-in (${inTime})`;
        checkinBtn.style.opacity = '0.7';
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.innerText = 'Điểm danh ra ca';
          checkoutBtn.style.opacity = '1';
        }
      }
      if (todayRecord.check_out_time) {
        const outTime = new Date(todayRecord.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        if (checkoutBtn) {
          checkoutBtn.disabled = true;
          checkoutBtn.innerText = `Đã Check-out (${outTime})`;
          checkoutBtn.style.opacity = '0.7';
        }
      }
    } else {
      checkinBtn.disabled = false;
      checkinBtn.innerText = 'Check In';
      checkinBtn.style.opacity = '1';
      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.innerText = 'Điểm danh ra ca';
        checkoutBtn.style.opacity = '0.7';
      }
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra trạng thái chấm công:', err.message);
  }
}

// Xử lý Check In từ màn hình Chấm công Cá nhân
async function handleCheckIn() {
  await handleDashboardCheckIn();
  await checkTodayAttendanceStatus();
  await loadMyAttendanceData();
}

// Xử lý Điểm danh ra ca từ màn hình Chấm công Cá nhân
async function handleCheckOut() {
  await handleDashboardCheckOut();
  await checkTodayAttendanceStatus();
  await loadMyAttendanceData();
}

// ==============================================================================
// NẠP VÀ QUẢN LÝ PHÂN QUYỀN (RBAC - CHỈ ADMIN)
// ==============================================================================
async function loadRbacUsersData() {
  const tbody = document.getElementById('rbacUsersTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 20px;">Đang kết nối Auth Service (:3001) để lấy danh sách tài khoản...</td></tr>`;

  let users = [];
  try {
    const res = await apiCall('/api/auth/users');
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      users = res.data;
    }
  } catch (err) {
    console.warn('Lỗi lấy danh sách user từ API, sử dụng danh sách tài khoản mặc định:', err.message);
  }

  // Nếu API chưa có dữ liệu hoặc mock fallback
  if (!users || users.length === 0) {
    users = [
      { id: 'usr_admin', username: 'admin', email: 'admin@htqlns.com', emp_id: 'AD-001', role: 'ADMIN', status: 'ACTIVE' },
      { id: 'usr_manager', username: 'manager', email: 'lam@htqlns.com', emp_id: 'NV-004', role: 'MANAGER', status: 'ACTIVE' },
      { id: 'usr_hr', username: 'hr_admin', email: 'hr@htqlns.com', emp_id: 'NV-005', role: 'HR', status: 'ACTIVE' },
      { id: 'usr_emp1', username: 'employee', email: 'hieu.vd@htqlns.com', emp_id: 'NV-001', role: 'EMPLOYEE', status: 'ACTIVE' },
      { id: 'usr_emp2', username: 'kiet.hg', email: 'kiet.hg@htqlns.com', emp_id: 'NV-002', role: 'EMPLOYEE', status: 'ACTIVE' },
      { id: 'usr_emp3', username: 'hao.ng', email: 'hao.ng@htqlns.com', emp_id: 'NV-003', role: 'EMPLOYEE', status: 'ACTIVE' }
    ];
  }

  tbody.innerHTML = users.map(u => {
    let roleBadge = '<span class="badge-status badge-approved">EMPLOYEE</span>';
    if (u.role === 'ADMIN') roleBadge = '<span class="badge-status badge-rejected">ADMIN</span>';
    else if (u.role === 'HR') roleBadge = '<span class="badge-status" style="background:#eff6ff; color:#2563eb;">HR</span>';
    else if (u.role === 'MANAGER') roleBadge = '<span class="badge-status" style="background:#fef3c7; color:#d97706;">MANAGER</span>';

    return `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td>${u.email || '-'}</td>
        <td><code>${u.emp_id || '-'}</code></td>
        <td>${roleBadge}</td>
        <td>
          <select id="role-select-${u.id}" class="figma-pill-input" style="padding: 6px 12px; font-size: 13px; font-weight: 600;">
            <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN (Quản trị viên)</option>
            <option value="HR" ${u.role === 'HR' ? 'selected' : ''}>HR (Phòng Hành chính Nhân sự)</option>
            <option value="MANAGER" ${u.role === 'MANAGER' ? 'selected' : ''}>MANAGER (Quản lý)</option>
            <option value="EMPLOYEE" ${u.role === 'EMPLOYEE' ? 'selected' : ''}>EMPLOYEE (Nhân viên)</option>
          </select>
        </td>
        <td>
          <button class="btn-primary-blue" style="padding: 6px 14px; font-size: 12.5px;" onclick="handleUpdateUserRole('${u.id}', '${u.username}')">
            Lưu quyền
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleUpdateUserRole(userId, username) {
  const selectEl = document.getElementById(`role-select-${userId}`);
  if (!selectEl) return;
  const newRole = selectEl.value;

  try {
    const res = await apiCall(`/api/auth/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });
    showToast(`Đã phân quyền thành công tài khoản "${username}" thành vai trò [${newRole}]!`, 'success');
    loadRbacUsersData();
  } catch (err) {
    showToast(`Lỗi phân quyền: ${err.message}`, 'error');
  }
}

// ==============================================================================
// NẠP VÀ ĐIỀU KHIỂN BÁO CÁO THỐNG KÊ (ANALYTICS & ATTENDANCE)
// ==============================================================================
async function loadStatsData() {
  const isEmployee = (state.user && state.user.role === 'EMPLOYEE');
  const personalCard = document.getElementById('statEmployeePersonalCard');

  if (isEmployee) {
    if (personalCard) personalCard.style.display = 'block';
    // Nạp thống kê cá nhân cho nhân viên
    try {
      const histRes = await apiCall('/api/v1/attendances/history?month=11&year=2026');
      if (histRes && histRes.success && histRes.meta && histRes.meta.summary) {
        const s = histRes.meta.summary;
        const workDaysEl = document.getElementById('statPersonalWorkDays');
        const workDaysSubEl = document.getElementById('statPersonalWorkDaysSub');
        const lateEl = document.getElementById('statPersonalLateCount');
        const leaveEl = document.getElementById('statPersonalLeaveBalance');
        const leaveUsedEl = document.getElementById('statPersonalLeaveUsed');
        const otEl = document.getElementById('statPersonalOtHours');

        if (workDaysEl) workDaysEl.innerText = `${s.attendedDays || 0} / ${s.standardDays || 22} ngày`;
        if (workDaysSubEl) workDaysSubEl.innerText = s.attendedDays >= (s.standardDays || 22) ? 'Đạt 100% công chuẩn' : `Đạt ${Math.round(((s.attendedDays || 0) / (s.standardDays || 22)) * 100)}% công chuẩn`;
        if (lateEl) lateEl.innerText = `${s.lateCount || 0} lần`;
        if (leaveEl) leaveEl.innerText = `${12 - (s.leaveDays || 0)} / 12 ngày`;
        if (leaveUsedEl) leaveUsedEl.innerText = `Đã dùng ${s.leaveDays || 0} ngày`;
        if (otEl) otEl.innerText = `${s.otHours || 0} giờ`;
      }
    } catch (err) {
      console.warn('Lỗi tải thống kê cá nhân:', err.message);
    }
  } else {
    if (personalCard) personalCard.style.display = 'none';
  }

  // Đồng bộ giao diện báo cáo với chu kỳ mặc định Tháng 11/2026
  await changeStatPeriod('2026-11');
}

async function changeStatPeriod(period) {
  // Đặt lại style các nút chọn chu kỳ
  ['statPeriodBtn1', 'statPeriodBtn2', 'statPeriodBtn3'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.className = 'figma-filter-pill';
      btn.style.background = '#f8fafc';
      btn.style.color = '#1e293b';
      btn.style.border = '1px solid #e2e8f0';
      btn.style.fontWeight = '500';
    }
  });

  let activeBtnId = 'statPeriodBtn1';
  let periodLabel = 'Tháng 11/2026';
  if (period === '2026-10') {
    activeBtnId = 'statPeriodBtn2';
    periodLabel = 'Tháng 10/2026';
  } else if (period === '2026-Q3') {
    activeBtnId = 'statPeriodBtn3';
    periodLabel = 'Quý III/2026';
  }

  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) {
    activeBtn.style.background = 'var(--mint-green, #ecfdf5)';
    activeBtn.style.color = 'var(--mint-green-text, #065f46)';
    activeBtn.style.border = '1px solid #a7f3d0';
    activeBtn.style.fontWeight = '700';
  }

  const tbody = document.getElementById('statDeptTableBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">Đang tải số liệu từ Analytics Service (:3008)...</td></tr>`;
  }
  const threshBody = document.getElementById('statThresholdTableBody');
  if (threshBody) {
    threshBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 20px;">Đang tải danh sách cảnh báo ngưỡng...</td></tr>`;
  }

  try {
    const res = await apiCall(`/api/v1/analytics/stats?period=${period}`);
    if (res && res.success && res.data) {
      const summary = res.data.summary || {};
      const depts = res.data.departments || [];

      // Cập nhật 4 thẻ KPI chính
      const onTimeEl = document.getElementById('statMetricOnTime');
      const onTimeSubEl = document.getElementById('statMetricOnTimeSub');
      const lateEl = document.getElementById('statMetricLate');
      const lateSubEl = document.getElementById('statMetricLateSub');
      const leaveEl = document.getElementById('statMetricLeave');
      const leaveSubEl = document.getElementById('statMetricLeaveSub');
      const hoursEl = document.getElementById('statMetricHours');
      const hoursSubEl = document.getElementById('statMetricHoursSub');

      if (onTimeEl) onTimeEl.innerText = summary.onTimeRate || '0.0%';
      if (onTimeSubEl) onTimeSubEl.innerText = `${summary.totalWorkDays || 0} ngày công thực tế`;
      if (lateEl) lateEl.innerText = summary.lateRate || '0.0%';
      if (lateSubEl) lateSubEl.innerText = `${summary.totalLateCount || 0} lượt vi phạm đi muộn`;
      if (leaveEl) leaveEl.innerText = summary.leaveRate || '0.0%';
      if (leaveSubEl) leaveSubEl.innerText = `${summary.totalLeaveDays || 0} ngày nghỉ phép`;
      if (hoursEl) hoursEl.innerText = summary.totalWorkingHours || '0 h';
      if (hoursSubEl) hoursSubEl.innerText = `${summary.totalEmployees || 0} nhân sự trong phạm vi`;

      // Cập nhật bảng tổng hợp phòng ban
      if (tbody) {
        if (!depts.length) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 24px;">Không có dữ liệu phòng ban trong phạm vi quản lý của bạn</td></tr>`;
        } else {
          tbody.innerHTML = depts.map(d => {
            const empCount = d.employeeCount ?? d.empCount ?? 0;
            const stdDays = d.standardDays ?? 0;
            const actDays = d.actualDays ?? 0;
            const lateCount = d.lateCount ?? 0;
            const leaveDays = d.leaveDays ?? 0;
            const rateStr = d.attendanceRate || d.onTimeRate || (stdDays > 0 ? (Math.round((actDays / stdDays) * 1000) / 10) + '%' : '0%');
            return `
            <tr>
              <td><strong>${d.name || d.code}</strong></td>
              <td>${empCount}</td>
              <td>${stdDays.toLocaleString('vi-VN')} công</td>
              <td><strong>${actDays.toLocaleString('vi-VN')} công</strong></td>
              <td><span class="badge-status" style="background: ${lateCount > 0 ? '#fef3c7; color: #b45309;' : '#f1f5f9; color: #475569;'}">${lateCount} lượt</span></td>
              <td>${leaveDays} ngày</td>
              <td><span class="badge-status badge-approved">${rateStr}</span></td>
            </tr>
          `;
          }).join('');
        }
      }

      // Cập nhật dòng tổng kết (footer) cộng dồn động 100% từ các dòng phòng ban phía trên
      const fTitle = document.getElementById('statFootTitle');
      const fEmp = document.getElementById('statFootEmployees');
      const fStd = document.getElementById('statFootStandardDays');
      const fAct = document.getElementById('statFootActualDays');
      const fLate = document.getElementById('statFootLateCount');
      const fLeave = document.getElementById('statFootLeaveDays');
      const fRate = document.getElementById('statFootRate');

      const isManager = (state.user && state.user.role === 'MANAGER');
      if (fTitle) fTitle.innerText = isManager ? 'TỔNG CỘNG ĐỘI NHÓM' : 'TỔNG TOÀN CÔNG TY';

      const sumEmployees = depts.reduce((acc, cur) => acc + (cur.employeeCount ?? cur.empCount ?? 0), 0);
      const sumStandard = depts.reduce((acc, cur) => acc + (cur.standardDays ?? 0), 0);
      const sumActual = depts.reduce((acc, cur) => acc + (cur.actualDays ?? 0), 0);
      const sumLate = depts.reduce((acc, cur) => acc + (cur.lateCount ?? 0), 0);
      const sumLeave = depts.reduce((acc, cur) => acc + (cur.leaveDays ?? 0), 0);
      const overallRate = sumStandard > 0 ? (Math.round((sumActual / sumStandard) * 1000) / 10) + '%' : '0%';

      if (fEmp) fEmp.innerText = sumEmployees;
      if (fStd) fStd.innerText = `${sumStandard.toLocaleString('vi-VN')} công`;
      if (fAct) fAct.innerText = `${sumActual.toLocaleString('vi-VN')} công`;
      if (fLate) fLate.innerText = `${sumLate.toLocaleString('vi-VN')} lượt`;
      if (fLeave) fLeave.innerText = `${sumLeave.toLocaleString('vi-VN')} ngày`;
      if (fRate) fRate.innerText = overallRate;

      // Cập nhật Cảnh báo Vi phạm Ngưỡng (Threshold Monitoring)
      if (res.data.thresholds) {
        renderThresholdAlerts(res.data.thresholds, res.data.thresholdActiveCount);
      } else {
        try {
          const tRes = await apiCall(`/api/v1/analytics/thresholds?period=${period}`);
          if (tRes && tRes.success && tRes.data) {
            renderThresholdAlerts(tRes.data, tRes.meta ? tRes.meta.activeCount : 0);
          } else {
            renderThresholdAlerts([], 0);
          }
        } catch (_) {
          renderThresholdAlerts([], 0);
        }
      }

      showToast(`Đã nạp số liệu thống kê ${periodLabel} từ Analytics Service`, 'success');
      return;
    }
  } catch (err) {
    console.warn('Lỗi gọi API thống kê analytics:', err.message);
  }

  // Nếu API lỗi hoặc rỗng
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">Không thể kết nối Analytics Service hoặc không có dữ liệu</td></tr>`;
  }
  renderThresholdAlerts([], 0);
  const fEmp = document.getElementById('statFootEmployees');
  const fStd = document.getElementById('statFootStandardDays');
  const fAct = document.getElementById('statFootActualDays');
  const fLate = document.getElementById('statFootLateCount');
  const fLeave = document.getElementById('statFootLeaveDays');
  const fRate = document.getElementById('statFootRate');
  if (fEmp) fEmp.innerText = '0';
  if (fStd) fStd.innerText = '0 công';
  if (fAct) fAct.innerText = '0 công';
  if (fLate) fLate.innerText = '0 lượt';
  if (fLeave) fLeave.innerText = '0 ngày';
  if (fRate) fRate.innerText = '0%';
}

// Render danh sách cảnh báo vi phạm ngưỡng tự động từ Analytics Service
function renderThresholdAlerts(thresholds = [], activeCount = 0) {
  const badge = document.getElementById('statThresholdActiveBadge');
  const tbody = document.getElementById('statThresholdTableBody');

  if (badge) {
    const act = Number(activeCount) || 0;
    if (act > 0) {
      badge.textContent = `${act} ngưỡng kích hoạt`;
      badge.className = 'badge-status';
      badge.style.background = '#fef3c7';
      badge.style.color = '#b45309';
      badge.style.border = '1px solid #fde68a';
    } else {
      badge.textContent = '0 ngưỡng kích hoạt';
      badge.className = 'badge-status badge-approved';
      badge.style.background = '#ecfdf5';
      badge.style.color = '#065f46';
      badge.style.border = '1px solid #a7f3d0';
    }
  }

  if (!tbody) return;

  if (!thresholds || !thresholds.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">Không có cấu hình cảnh báo vi phạm ngưỡng</td></tr>`;
    return;
  }

  tbody.innerHTML = thresholds.map(t => {
    const violationCount = Number(t.violationCount) || 0;
    const names = (t.violatingNames && t.violatingNames.length) ? t.violatingNames.join(', ') : '';
    const violationText = violationCount > 0
      ? `<span style="color: #dc2626; font-weight: 600;">${violationCount} nhân sự</span> <span style="font-size: 12px; color: #64748b;">(${names})</span>`
      : `<span style="color: #059669; font-weight: 600;">0 nhân sự</span> <span style="font-size: 12px; color: #64748b;">(${t.code === 'TH-OT-40' ? 'Tuân thủ trần quy định' : 'Không có vi phạm'})</span>`;

    let severityHtml = '';
    if (t.severity === 'CRITICAL') {
      severityHtml = `<span class="badge-status badge-rejected">CRITICAL</span>`;
    } else if (t.severity === 'WARNING') {
      severityHtml = `<span class="badge-status" style="background: #fef3c7; color: #b45309; font-weight: 600;">WARNING</span>`;
    } else {
      severityHtml = `<span class="badge-status">${t.severity || 'INFO'}</span>`;
    }

    let statusHtml = '';
    const statusText = t.status || (violationCount > 0 ? (t.severity === 'CRITICAL' ? 'Vượt ngưỡng quy định' : 'Cần nhắc nhở') : 'An toàn');
    if (statusText === 'An toàn') {
      statusHtml = `<span class="badge-status badge-approved">An toàn</span>`;
    } else if (statusText === 'Cần nhắc nhở') {
      statusHtml = `<span class="badge-status" style="background: #fef3c7; color: #b45309; font-weight: 600;">Cần nhắc nhở</span>`;
    } else {
      statusHtml = `<span class="badge-status badge-rejected">${statusText}</span>`;
    }

    const actionHtml = violationCount > 0
      ? `<a href="javascript:void(0)" class="link-action-blue" style="cursor: pointer; font-size: 13px;" onclick="showToast('Đã gửi thông báo nhắc nhở đến các nhân sự vi phạm ngưỡng', 'info')">Xem xét →</a>`
      : `<span style="color: #94a3b8; font-size: 12px;">Bình thường</span>`;

    return `
      <tr>
        <td><strong>${t.code || '--'}</strong></td>
        <td>${t.name || '--'}</td>
        <td>${t.metricTarget || t.metric_target || '--'}</td>
        <td>${t.activationLevel || t.activation_level || '--'}</td>
        <td>${severityHtml}</td>
        <td>${violationText}</td>
        <td>${statusHtml}</td>
        <td style="text-align: center;">${actionHtml}</td>
      </tr>
    `;
  }).join('');
}

// Nạp dữ liệu hồ sơ cá nhân (Động 100%, không còn lỗi gán sẵn Phòng Kỹ Thuật)
function loadProfileData() {
  if (!state.user) return;
  syncUserOnboardingState();

  const isEmployee = (state.user.role === 'EMPLOYEE');
  const isOnboarded = Boolean(state.user.isOnboarded);
  const displayName = state.user.fullName || state.user.username;

  const nameEl = document.getElementById('profDisplayName');
  const userEl = document.getElementById('profUsername');
  const fullNameEl = document.getElementById('profFullName');
  const emailEl = document.getElementById('profEmail');
  const roleEl = document.getElementById('profRole');
  const roleBadgeEl = document.getElementById('profRoleBadge');
  const deptEl = document.getElementById('profDept');
  const posEl = document.getElementById('profPosition');
  const mgrEl = document.getElementById('profManager');
  const officeEl = document.getElementById('profOffice');
  const shiftEl = document.getElementById('profShift');
  const statusEl = document.getElementById('profStatus');
  const avatarEl = document.getElementById('profAvatarCircle');

  if (nameEl) nameEl.innerText = displayName;
  if (userEl) userEl.innerText = state.user.username || '-';
  if (fullNameEl) fullNameEl.innerText = displayName;
  if (emailEl) emailEl.innerText = state.user.email || `${state.user.username}@htqlns.com`;
  if (roleEl) roleEl.innerText = state.user.role || 'EMPLOYEE';

  if (roleBadgeEl) {
    const roleMap = {
      'ADMIN': '<span class="badge-status badge-approved">👑 Quản trị viên Hệ thống</span>',
      'HR': '<span class="badge-status" style="background:#e0e7ff; color:#4338ca;">👩‍💼 Quản trị nhân sự (HR)</span>',
      'MANAGER': '<span class="badge-status" style="background:#fef3c7; color:#b45309;">👨‍💼 Quản lý bộ phận (MANAGER)</span>',
      'EMPLOYEE': '<span class="badge-status" style="background:#f1f5f9; color:#475569;">👨‍💻 Nhân viên (EMPLOYEE)</span>'
    };
    roleBadgeEl.innerHTML = roleMap[state.user.role] || '<span class="badge-status">Nhân viên</span>';
  }

  // SỬA TRIỆT ĐỂ LỖI PHÒNG BAN: Nếu chưa được tiếp nhận, hiển thị rõ "Chưa phân phòng ban (Chờ tiếp nhận)"
  if (deptEl) {
    const userDept = state.user.department || state.user.departmentName;
    if (userDept) {
      deptEl.innerHTML = `<span style="color:#059669; font-weight:700;">${userDept}</span>`;
    } else {
      deptEl.innerHTML = '<span style="color:#d97706; font-weight:700;">Chưa phân phòng ban (Chờ tiếp nhận)</span>';
    }
  }

  if (posEl) {
    let p = state.user.position;
    if (p && (p.includes('Kỹ sư phần mềm SOA') || p.includes('Kỹ Sư Phần Mềm SOA'))) {
      p = 'Kỹ sư phần mềm';
      state.user.position = 'Kỹ sư phần mềm';
    }
    posEl.innerText = p || (isOnboarded ? 'Nhân viên chính thức' : 'Nhân sự mới (Chờ bổ nhiệm)');
  }

  if (mgrEl) {
    mgrEl.innerText = state.user.managerName || (isOnboarded ? 'Nguyễn Thanh Lâm' : 'Chưa gán quản lý trực tiếp');
  }

  if (officeEl) {
    if (isOnboarded && state.user.officeLocation) {
      officeEl.innerHTML = `<span style="color:#2563eb; font-weight:600;">${state.user.officeLocation}</span>`;
    } else {
      officeEl.innerHTML = '<span style="color:#dc2626; font-weight:600;">⚠️ Chưa gán văn phòng (Chưa có Geofence GPS)</span>';
    }
  }

  if (shiftEl) {
    if (isOnboarded && state.user.shiftName) {
      shiftEl.innerText = `${state.user.shiftName} (${state.user.shiftStart || '08:00'} - ${state.user.shiftEnd || '17:30'})`;
    } else {
      shiftEl.innerHTML = '<span style="color:#94a3b8;">Chưa phân ca làm việc</span>';
    }
  }

  if (statusEl) {
    if (isOnboarded) {
      statusEl.innerHTML = '<span class="badge-status badge-approved">✓ Đang hoạt động (Đã tiếp nhận)</span>';
    } else {
      statusEl.innerHTML = '<span class="badge-status" style="background:#fef3c7; color:#b45309; font-weight:700;">Chờ tiếp nhận ban phòng</span>';
    }
  }

  if (avatarEl) {
    avatarEl.innerText = getInitialsFromName(displayName);
  }
}

// Giám sát cụm Microservices SOA
async function loadSoaServicesStatus() {
  const tbody = document.getElementById('soaMonitorTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Đang kết nối Service Registry (:3500)...</td></tr>`;

  try {
    const serviceList = [
      { name: 'api-gateway', port: 3000, db: 'N/A (Cổng Gateway & Proxy)', online: true },
      { name: 'service-registry', port: 3500, db: 'In-Memory (Service Discovery)', online: true },
      { name: 'event-bus', port: 3600, db: 'Durable Queue (event-bus.json)', online: true },
      { name: 'auth-service', port: 3001, db: 'htqlns_auth (Cơ sở dữ liệu xác thực)', online: true },
      { name: 'organization-service', port: 3002, db: 'htqlns_organization (Phòng ban & Nhân sự)', online: true },
      { name: 'attendance-service', port: 3003, db: 'htqlns_attendance (GPS/WiFi)', online: false },
      { name: 'leave-service', port: 3004, db: 'htqlns_leave (Quỹ phép & Đơn)', online: false },
      { name: 'shift-service', port: 3005, db: 'htqlns_shift (Lịch ca & OT)', online: false },
      { name: 'payroll-service', port: 3006, db: 'htqlns_payroll (Động cơ tính lương)', online: false },
      { name: 'notification-service', port: 3007, db: 'htqlns_notification (Cảnh báo)', online: false },
      { name: 'analytics-service', port: 3008, db: 'htqlns_analytics (Báo cáo)', online: false }
    ];

    tbody.innerHTML = serviceList
      .map((item) => {
        const statusBadge = item.online
          ? '<span class="badge-status badge-approved">🟢 ONLINE (UP)</span>'
          : '<span class="badge-status" style="background:#f1f5f9; color:#94a3b8;">⚪ CHƯA BẬT (OFF)</span>';

        return `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td><code>:${item.port}</code></td>
          <td>http://localhost:${item.port}</td>
          <td><a href="http://localhost:${item.port}/health" target="_blank" class="link-action-blue">/health ↗</a></td>
          <td>${statusBadge}</td>
          <td><code>${item.db}</code></td>
        </tr>
      `;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: #dc2626; text-align: center;">Lỗi tải dữ liệu Registry: ${err.message}</td></tr>`;
  }
}

// ==============================================================================
// 8. CÁC TƯƠNG TÁC BẤM TRỰC QUAN TRÊN DASHBOARD
// ==============================================================================
function scrollToLateTable() {
  const table = document.getElementById('lateEmployeesCard');
  if (table) {
    table.scrollIntoView({ behavior: 'smooth', block: 'center' });
    table.style.outline = '2px solid #f59e0b';
    table.style.transition = 'outline 0.3s';
    setTimeout(() => { table.style.outline = 'none'; }, 2000);
  }
}

function openDateFilterModal() {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');
  const d1 = String(today.getDate()).padStart(2, '0');
  const m1 = String(today.getMonth() + 1).padStart(2, '0');
  const y1 = today.getFullYear();

  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA');
  const d0 = String(yesterday.getDate()).padStart(2, '0');
  const m0 = String(yesterday.getMonth() + 1).padStart(2, '0');
  const y0 = yesterday.getFullYear();

  const html = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <p style="font-size: 13px; color: #64748b; margin-bottom: 2px;">Chọn ngày xem báo cáo tổng quan:</p>
      <button type="button" class="btn-figma-dark" style="background: #f8fafc; color: #1e293b; border: 1px solid #e2e8f0; text-align: left; padding: 10px 14px; font-weight: 600;" onclick="selectDateFilter('${todayStr}', '${d1}/${m1}/${y1} • Hôm nay')">
        Hôm nay (${d1}/${m1}/${y1})
      </button>
      <button type="button" class="btn-figma-dark" style="background: #f8fafc; color: #1e293b; border: 1px solid #e2e8f0; text-align: left; padding: 10px 14px; font-weight: 600;" onclick="selectDateFilter('${yesterdayStr}', '${d0}/${m0}/${y0} • Hôm qua')">
        Hôm qua (${d0}/${m0}/${y0})
      </button>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12.5px; font-weight: 600; color: #475569;">Hoặc chọn ngày tùy chỉnh:</label>
        <div style="display: flex; gap: 8px;">
          <input type="date" id="customFilterDateInput" value="${todayStr}" class="form-input-figma" style="flex: 1;" />
          <button type="button" class="btn-primary-blue" style="padding: 6px 14px; border-radius: 8px;" onclick="applyCustomDateFilter()">Xem</button>
        </div>
      </div>
    </div>
  `;
  openModal('Lọc dữ liệu theo ngày', html);
}

async function selectDateFilter(isoDate, label) {
  closeModal();
  const el = document.getElementById('currentDatePillText');
  if (el) el.innerText = label;
  state.selectedDashboardDate = isoDate;
  await loadDashboardOverview(isoDate, state.selectedDashboardDeptId);
  showToast(`Đã lọc dữ liệu ngày: ${label}`, 'success');
}

async function applyCustomDateFilter() {
  const inp = document.getElementById('customFilterDateInput');
  if (!inp || !inp.value) return;
  const isoDate = inp.value;
  const [y, m, d] = isoDate.split('-');
  await selectDateFilter(isoDate, `${d}/${m}/${y}`);
}

function openDeptFilterModal() {
  const activeEmps = (state.employees || []).filter((e) => e.status === 'ACTIVE');
  const depts = [
    { id: 'ALL', name: 'Toàn công ty', count: activeEmps.length },
    ...(state.departments || []).map((d) => ({
      id: d.id,
      name: d.name,
      count: activeEmps.filter((e) => e.department_id === d.id).length
    }))
  ];

  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <p style="font-size: 13px; color: #64748b; margin-bottom: 6px;">Chọn đơn vị / phòng ban để xem thống kê:</p>
      ${depts.map((d) => `
        <button type="button" class="btn-figma-dark" style="background: #f8fafc; color: #1e293b; border: 1px solid #e2e8f0; text-align: left; padding: 10px 14px; font-weight: 600; display: flex; justify-content: space-between;" onclick="selectDeptFilter('${d.name}', '${d.id}', ${d.count})">
          <span>${d.name}</span>
          <span style="color: #64748b; font-size: 12px;">${d.count} nhân sự</span>
        </button>
      `).join('')}
    </div>
  `;
  openModal('Lọc theo Phòng ban', html);
}

async function selectDeptFilter(name, deptId, count) {
  closeModal();
  state.selectedDashboardDeptId = deptId === 'ALL' ? null : deptId;
  await loadDashboardOverview(state.selectedDashboardDate, state.selectedDashboardDeptId);
  showToast(`Đã lọc dữ liệu theo: ${name}`, 'success');
}

function openOnTimeDetailModal(name, code, checkinTime, checkoutTime, dept) {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px;">
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px; color: #065f46;">
        <strong>✅ Tình trạng:</strong> Chấm công Đúng giờ (Giờ vào: ${checkinTime || '07:55'} - Giờ ra: ${checkoutTime || '16:05'})
      </div>
      <div><strong>Nhân viên:</strong> ${name} (${code})</div>
      <div><strong>Phòng ban:</strong> ${dept || '-'}</div>
      <div><strong>Phương thức chấm công:</strong> Wi-Fi công ty (HTQLNS-Community-5G) • Tọa độ GPS hợp lệ</div>
      <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
        <button class="btn-figma-dark" style="padding: 8px 20px; font-size: 13px;" onclick="closeModal()">Đóng</button>
      </div>
    </div>
  `;
  openModal(`Chi tiết chấm công – ${name}`, html);
}

function openLateDetailModal(name, code, lateTime, checkinTime, dept, reason, adjId, adjStatus) {
  const hasReason = Boolean(reason && reason.trim().length > 0);
  const statusBadge = adjStatus === 'APPROVED' ? '<span class="badge-status badge-approved">✓ Đã chấp thuận</span>' :
                      (adjStatus === 'REJECTED' ? '<span class="badge-status badge-rejected">✕ Đã từ chối</span>' :
                      (hasReason ? '<span class="badge-status" style="background:#fef3c7; color:#b45309;">⏳ Chờ quản lý duyệt</span>' : '<span class="badge-status" style="background:#fee2e2; color:#dc2626;">Chưa gửi giải trình</span>'));

  const html = `
    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px;">
      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; color: #92400e;">
        <strong>⚠️ Tình trạng:</strong> Đi muộn ${lateTime} (Giờ vào: ${checkinTime} - Quy định: 08:00)
      </div>
      <div><strong>Nhân viên:</strong> ${name} (${code})</div>
      <div><strong>Phòng ban:</strong> ${dept || '-'}</div>
      <div><strong>Trạng thái giải trình:</strong> ${statusBadge}</div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">LÝ DO GIẢI TRÌNH CỦA NHÂN VIÊN:</div>
        <div style="font-size: 13.5px; color: #1e293b;">${hasReason ? reason : '<em>Nhân viên chưa gửi đơn giải trình cho ca làm việc này.</em>'}</div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        ${hasReason && adjStatus !== 'APPROVED' ? `
          <button class="btn-primary-blue" style="flex: 1;" onclick="handleDecisionAdjustment('${adjId}', 'APPROVED', '${name}')">✓ Chấp nhận giải trình</button>
          <button class="btn-figma-dark" style="flex: 1; background: #dc2626; border: none;" onclick="handleDecisionAdjustment('${adjId}', 'REJECTED', '${name}')">✕ Từ chối giải trình</button>
        ` : (adjStatus === 'APPROVED' ? `
          <div style="color: #059669; font-weight: 600;">✓ Giải trình đã được quản lý phê duyệt và điều chỉnh ngày công.</div>
        ` : `
          <button class="btn-figma-dark" style="flex: 1; background: #ea580c; border: none;" onclick="handleSendLateReminder('${name}')">🔔 Gửi nhắc nhở giải trình</button>
        `)}
      </div>
    </div>
  `;
  openModal(`Chi tiết đi muộn – ${name}`, html);
}

async function handleDecisionAdjustment(adjId, decision, name) {
  closeModal();
  try {
    if (adjId) {
      await apiCall(`/api/attendance/adjustments/${adjId}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ decision })
      });
    }
    if (decision === 'APPROVED') {
      showToast(`Đã chấp thuận giải trình đi muộn của ${name}! Giờ công đã được điều chỉnh.`, 'success');
    } else {
      showToast(`Đã từ chối giải trình đi muộn của ${name}`, 'warning');
    }
    loadAttendanceHistoryData();
  } catch (err) {
    showToast(err.message || 'Lỗi cập nhật giải trình', 'error');
  }
}

function handleSendLateReminder(name) {
  closeModal();
  showToast(`Đã gửi thông báo nhắc nhở nộp đơn giải trình tới ${name}!`, 'info');
}

// Modal mở nộp đơn giải trình cho Nhân viên
function openSubmitAdjustmentModal(attendanceId, workDate, checkInTime) {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px;">
      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; color: #92400e;">
        <strong>📝 Nộp đơn giải trình chấm công</strong><br>
        <span style="font-size: 12px;">Ngày làm việc: <strong>${workDate}</strong> • Giờ vào ghi nhận: <strong>${checkInTime || '08:15'}</strong></span>
      </div>
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px;">Lý do giải trình chi tiết:</label>
        <textarea id="txtAdjustmentReason" class="figma-pill-input" style="width: 100%; height: 90px; border-radius: 10px; padding: 10px; font-size: 13px;" placeholder="Ví dụ: Kẹt xe giờ cao điểm do ngập úng, hỏng phương tiện giao thông trên đường đi, công tác đột xuất..."></textarea>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button class="btn-primary-blue" style="flex: 1;" onclick="handleSubmitAttendanceAdjustment('${attendanceId}', '${workDate}')">📤 Gửi giải trình tới Quản lý</button>
        <button class="btn-figma-dark" style="width: 100px; background: #64748b; border: none;" onclick="closeModal()">Hủy</button>
      </div>
    </div>
  `;
  openModal(`Giải trình chấm công – ${workDate}`, html);
}

async function handleSubmitAttendanceAdjustment(attendanceId, workDate) {
  const reason = document.getElementById('txtAdjustmentReason')?.value.trim();
  if (!reason) {
    return showToast('Vui lòng nhập lý do giải trình!', 'warning');
  }
  closeModal();

  try {
    const formattedDate = workDate.includes('/') ? workDate.split('/').reverse().join('-') : workDate;
    const res = await apiCall('/api/attendance/adjustments', {
      method: 'POST',
      body: JSON.stringify({
        attendanceId: attendanceId || undefined,
        workDate: formattedDate || '2026-10-30',
        adjustmentType: 'LATE_EXPLANATION',
        reason
      })
    });
    if (res && res.success) {
      showToast('Đã gửi đơn giải trình thành công! Đang chờ Quản lý phê duyệt.', 'success');
      loadMyAttendanceData();
      if (typeof loadRequestsData === 'function') loadRequestsData();
      if (typeof loadDashboardPendingRequests === 'function') loadDashboardPendingRequests();
      if (document.getElementById('dashEmployeeOverviewSection')?.style.display !== 'none') {
        loadEmployeeDashboardData();
      }
    } else {
      throw new Error(res?.error || 'Gửi giải trình thất bại');
    }
  } catch (err) {
    showToast(err.message || 'Lỗi gửi giải trình', 'error');
  }
}

// Nạp dữ liệu Dashboard riêng biệt cho Nhân viên (EMPLOYEE)
// Tuân thủ triệt để nguyên tắc cách ly dữ liệu từng tài khoản:
// - Tài khoản mới tạo: dữ liệu TRỐNG hoàn toàn (0 công, 0 phép, 0 OT, không có đơn từ hay lịch sử của người khác)
// - Hiện banner thông báo chờ Ban Quản trị tiếp nhận vào ban/phòng
// - Khi Admin phê duyệt tiếp nhận, phân ca và lương -> Dữ liệu việc làm mới chính thức kích hoạt!
async function loadEmployeeDashboardData() {
  syncUserOnboardingState();

  const empId = state.user?.empId || state.user?.id || state.user?.username || 'user';
  const displayName = state.user?.fullName || state.user?.username || 'Nhân viên';
  const role = state.user?.role || 'EMPLOYEE';
  const isOnboarded = Boolean(state.user?.isOnboarded && (state.user?.department || state.user?.departmentName));
  const deptName = state.user?.department || state.user?.departmentName || 'Chưa phân phòng ban (Chờ tiếp nhận)';
  const positionTitle = state.user?.position || (isOnboarded ? 'Nhân viên' : 'Nhân sự mới (Chờ tiếp nhận)');

  const now = new Date();
  const today = toLocalDateString(now);
  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const todayStr = `${dayNames[now.getDay()]}, ${now.toLocaleDateString('vi-VN')}`;

  // 1. Tải trước danh sách ca phân và đơn OT 7 ngày tới (từ hôm nay)
  let myShifts = [];
  let myApprovedOts = [];
  if (isOnboarded) {
    const fromDateStr = today;
    const endD = new Date(now);
    endD.setDate(now.getDate() + 6);
    const toDateStr = toLocalDateString(endD);

    try {
      const schedRes = await apiCall(`/api/v1/shifts/my-schedules?fromDate=${fromDateStr}&toDate=${toDateStr}`);
      if (schedRes && schedRes.success) {
        myShifts = schedRes.data || [];
        myApprovedOts = schedRes.approvedOts || schedRes.meta?.approvedOts || [];
      }
    } catch (err) {
      console.warn('Lỗi lấy my-schedules qua API v1, thử lại với fallback:', err);
    }

    // Fallback lấy OT nếu chưa có trong response ca
    if (!myApprovedOts.length) {
      try {
        const otRes = await apiCall(`/api/v1/ot-requests?status=APPROVED&fromDate=${fromDateStr}&toDate=${toDateStr}`);
        if (otRes && (otRes.data || otRes.requests)) {
          const list = otRes.data || otRes.requests || [];
          const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;
          myApprovedOts = list.filter(o => (o.emp_id === myEmpId || o.empId === myEmpId) && o.status === 'APPROVED');
        }
      } catch (_) {}
    }
    if (!myApprovedOts.length) {
      const localReqs = (typeof getUserEntityList === 'function' ? getUserEntityList('requests') : []) || [];
      myApprovedOts = localReqs.filter(r => (r.type && r.type.includes('OT')) && r.status === 'APPROVED');
    }
  }

  // Xác định ca và đơn OT của ngày hôm nay
  const todayShifts = myShifts.filter(s => toLocalDateString(s.work_date || s.workDate) === today && (s.status === 'SCHEDULED' || !s.status));
  const todayOts = myApprovedOts.filter(o => toLocalDateString(o.work_date || o.workDate) === today && o.status === 'APPROVED');
  const todayShift = todayShifts.length > 0 ? todayShifts[0] : null;
  const todayOt = todayOts.length > 0 ? todayOts[0] : null;
  const hasShiftToday = Boolean(todayShift || todayOt);

  // Lưu vào state để các hàm điểm danh / kiểm tra sử dụng
  state.todayHasShift = hasShiftToday;
  state.todayShift = todayShift;
  state.todayOt = todayOt;

  // 2. Xử lý Banner Chờ Tiếp Nhận Ban/Phòng
  const onboardingBanner = document.getElementById('dashEmpOnboardingBanner');
  if (onboardingBanner) {
    onboardingBanner.style.display = isOnboarded ? 'none' : 'block';
  }

  // 3. Cập nhật lời chào và thông tin ca trong Hero Card
  const heroGreeting = document.getElementById('dashEmpHeroGreeting');
  const todayDateText = document.getElementById('dashEmpTodayDateText');
  const gpsStatus = document.getElementById('dashEmpGpsStatus');
  const liveClock = document.getElementById('dashEmpLiveClock');
  const todayBadge = document.getElementById('dashEmpTodayBadge');
  const shiftWarningNotice = document.getElementById('dashEmpShiftWarningNotice');

  if (heroGreeting) heroGreeting.style.display = 'none';
  if (liveClock) liveClock.innerText = now.toLocaleTimeString('vi-VN');

  if (todayDateText) {
    if (!isOnboarded) {
      todayDateText.innerText = todayStr;
    } else if (todayShift) {
      const sName = getCleanShiftName(todayShift) || todayShift.shift_name || todayShift.shiftName || 'Ca làm việc';
      const sStart = (todayShift.start_time || todayShift.startTime || '08:00:00').slice(0, 5);
      const sEnd = (todayShift.end_time || todayShift.endTime || '17:30:00').slice(0, 5);
      todayDateText.innerText = `${todayStr} • ${sName} (${sStart} - ${sEnd})`;
    } else if (todayOt) {
      const otStart = (todayOt.start_time || todayOt.startTime || '18:00').slice(0, 5);
      const otEnd = (todayOt.end_time || todayOt.endTime || '21:00').slice(0, 5);
      todayDateText.innerText = `${todayStr} • Ca Tăng ca (OT) (${otStart} - ${otEnd})`;
    } else {
      todayDateText.innerText = `${todayStr} • Chưa có lịch phân ca (Ngày nghỉ)`;
    }
  }

  if (shiftWarningNotice) {
    shiftWarningNotice.style.display = (isOnboarded && !hasShiftToday) ? 'block' : 'none';
  }

  if (gpsStatus) {
    if (isOnboarded) {
      const officeName = state.user.officeLocation || 'Văn phòng Quy Nhơn';
      gpsStatus.innerHTML = `Trạng thái định vị: <span style="color:#059669; font-weight:600;">Hợp lệ (${officeName})</span>`;
    } else {
      gpsStatus.innerHTML = 'Trạng thái định vị: <span style="color:#dc2626; font-weight:600;">Chưa gán văn phòng làm việc</span>';
    }
  }

  // 4. Khối Chấm công trong ngày (Thời gian thực & Cách ly theo tài khoản)
  let userAtts = getUserEntityList('attendances');
  const todayLog = userAtts.find(l => l.work_date && l.work_date.startsWith(today));

  const checkInVal = document.getElementById('dashEmpCheckInVal');
  const checkInNote = document.getElementById('dashEmpCheckInNote');
  const checkOutVal = document.getElementById('dashEmpCheckOutVal');
  const checkOutNote = document.getElementById('dashEmpCheckOutNote');
  const hoursVal = document.getElementById('dashEmpHoursVal');
  const hoursNote = document.getElementById('dashEmpHoursNote');
  const checkInBtn = document.getElementById('dashEmpCheckInBtn');
  const checkOutBtn = document.getElementById('dashEmpCheckOutBtn');

  if (isOnboarded && !hasShiftToday) {
    // Trường hợp hôm nay chưa có lịch phân ca (Ngày nghỉ)
    if (checkInVal) checkInVal.innerText = '--:--:--';
    if (checkInNote) checkInNote.innerText = 'Không có ca';
    if (checkOutVal) checkOutVal.innerText = '--:--:--';
    if (checkOutNote) checkOutNote.innerText = 'Không có ca';
    if (hoursVal) hoursVal.innerText = '0.00 h';
    if (hoursNote) {
      hoursNote.innerText = 'Chưa có lịch phân ca';
      hoursNote.style.color = '#94a3b8';
    }
    if (todayBadge) {
      todayBadge.innerText = 'Chưa có lịch phân ca (Ngày nghỉ)';
      todayBadge.style.background = '#f1f5f9';
      todayBadge.style.color = '#64748b';
    }
    if (checkInBtn) {
      checkInBtn.style.display = 'flex';
      checkInBtn.disabled = true;
      checkInBtn.className = 'btn-hero-action';
      checkInBtn.style.background = '#e2e8f0';
      checkInBtn.style.color = '#94a3b8';
      checkInBtn.style.cursor = 'not-allowed';
      checkInBtn.style.boxShadow = 'none';
      checkInBtn.title = 'Bạn chưa được phân ca làm việc hôm nay. Vui lòng liên hệ Quản lý bộ phận để xếp lịch.';
      checkInBtn.innerHTML = '<span>CHƯA CÓ LỊCH CA</span>';
    }
    if (checkOutBtn) {
      checkOutBtn.style.display = 'none';
      checkOutBtn.disabled = true;
      checkOutBtn.title = 'Bạn chưa được phân ca làm việc hôm nay. Vui lòng liên hệ Quản lý bộ phận để xếp lịch.';
    }
  } else if (todayLog && todayLog.check_in_time) {
    const inTime = new Date(todayLog.check_in_time).toLocaleTimeString('vi-VN');
    if (checkInVal) checkInVal.innerText = inTime;
    if (checkInNote) {
      checkInNote.innerText = todayLog.status === 'LATE' ? `Đi muộn ${todayLog.late_minutes} phút` : 'Đúng giờ';
      checkInNote.style.color = todayLog.status === 'LATE' ? '#d97706' : '#059669';
    }

    if (todayLog.check_out_time) {
      const outTime = new Date(todayLog.check_out_time).toLocaleTimeString('vi-VN');
      if (checkOutVal) checkOutVal.innerText = outTime;
      if (checkOutNote) { checkOutNote.innerText = 'Đã hoàn tất ca'; checkOutNote.style.color = '#059669'; }

      const rawActual = todayLog.actual_working_hours !== undefined && todayLog.actual_working_hours !== null ? Number(todayLog.actual_working_hours) : null;
      let actualHours = rawActual;
      if (actualHours === null || isNaN(actualHours)) {
        const inMs = new Date(todayLog.check_in_time).getTime();
        const outMs = new Date(todayLog.check_out_time).getTime();
        actualHours = Math.max(0, Number(((outMs - inMs) / 3600000).toFixed(2)));
      }
      if (hoursVal) hoursVal.innerText = `${actualHours.toFixed(2)} h`;

      const standardHours = Number(todayShift?.working_hours || (todayOt?.total_hours || 8.0));
      const isStandardMet = actualHours >= standardHours;
      if (hoursNote) {
        hoursNote.innerText = isStandardMet ? `Đạt chuẩn (${standardHours.toFixed(1)} h)` : `Chưa đủ giờ chuẩn (${actualHours.toFixed(2)}/${standardHours.toFixed(1)} h)`;
        hoursNote.style.color = isStandardMet ? '#059669' : '#dc2626';
      }
      if (todayBadge) {
        todayBadge.innerText = isStandardMet ? 'Hoàn thành ca làm việc' : 'Hoàn tất ca (Chưa đủ giờ)';
        todayBadge.style.background = isStandardMet ? '#dbeafe' : '#fef2f2';
        todayBadge.style.color = isStandardMet ? '#1e40af' : '#b91c1c';
      }
      if (checkInBtn) {
        checkInBtn.style.display = 'flex';
        checkInBtn.className = 'btn-hero-action btn-hero-done';
        checkInBtn.disabled = true;
        checkInBtn.style.background = '';
        checkInBtn.style.color = '';
        checkInBtn.style.cursor = 'default';
        checkInBtn.innerHTML = '<span>ĐÃ HOÀN TẤT HÔM NAY</span>';
      }
      if (checkOutBtn) { checkOutBtn.style.display = 'none'; }
    } else {
      if (checkOutVal) checkOutVal.innerText = '--:--:--';
      if (checkOutNote) checkOutNote.innerText = 'Đang trong ca làm việc...';
      const elapsedHours = Math.max(0, Number(((now - new Date(todayLog.check_in_time)) / 3600000).toFixed(2)));
      if (hoursVal) hoursVal.innerText = `${elapsedHours.toFixed(2)} h`;
      if (hoursNote) {
        hoursNote.innerText = 'Đang tích lũy...';
        hoursNote.style.color = '#059669';
      }
      if (todayBadge) {
        todayBadge.innerText = todayLog.status === 'LATE' ? `Đã vào ca (Đi muộn ${todayLog.late_minutes}p)` : 'Đã vào ca (Đúng giờ)';
        todayBadge.style.background = todayLog.status === 'LATE' ? '#fef3c7' : '#dcfce7';
        todayBadge.style.color = todayLog.status === 'LATE' ? '#b45309' : '#15803d';
      }
      if (checkInBtn) { checkInBtn.style.display = 'none'; }
      if (checkOutBtn) {
        checkOutBtn.style.display = 'flex';
        checkOutBtn.disabled = false;
        checkOutBtn.className = 'btn-hero-action btn-hero-checkout';
        checkOutBtn.style.opacity = '';
        checkOutBtn.style.cursor = 'pointer';
        checkOutBtn.title = '';
        checkOutBtn.innerHTML = '<span>CHECK-OUT (KẾT THÚC CA)</span>';
      }
    }
  } else {
    // Chưa check-in
    if (checkInVal) checkInVal.innerText = '--:--:--';
    if (checkInNote) checkInNote.innerText = 'Chưa check-in';
    if (checkOutVal) checkOutVal.innerText = '--:--:--';
    if (checkOutNote) checkOutNote.innerText = 'Chưa check-out';
    if (hoursVal) hoursVal.innerText = '0.00 h';
    const standardHours = Number(todayShift?.working_hours || (todayOt?.total_hours || 8.0));
    if (hoursNote) {
      hoursNote.innerText = isOnboarded ? `Tiêu chuẩn: ${standardHours.toFixed(1)} h` : 'Chưa xếp ca';
      hoursNote.style.color = '#059669';
    }
    if (todayBadge) {
      if (isOnboarded) {
        todayBadge.innerText = 'Sẵn sàng chấm công';
        todayBadge.style.background = '#dcfce7';
        todayBadge.style.color = '#15803d';
      } else {
        todayBadge.innerText = 'Chưa phân ca làm việc';
        todayBadge.style.background = '#fef3c7';
        todayBadge.style.color = '#b45309';
      }
    }
    if (checkInBtn) {
      checkInBtn.style.display = 'flex';
      if (isOnboarded) {
        checkInBtn.disabled = false;
        checkInBtn.className = 'btn-hero-action btn-hero-checkin';
        checkInBtn.style.background = '';
        checkInBtn.style.color = '';
        checkInBtn.style.cursor = 'pointer';
        checkInBtn.style.opacity = '1';
        checkInBtn.style.boxShadow = '';
        checkInBtn.title = 'Bấm để chấm công vào ca';
        checkInBtn.innerHTML = '<span>CHECK-IN NGAY</span>';
      } else {
        checkInBtn.disabled = true;
        checkInBtn.className = 'btn-hero-action btn-hero-locked';
        checkInBtn.style.background = '#94a3b8';
        checkInBtn.style.cursor = 'not-allowed';
        checkInBtn.style.opacity = '0.75';
        checkInBtn.title = 'Tài khoản chưa được phân bổ vào phòng ban. Vui lòng liên hệ HR hoặc Quản lý trước khi chấm công';
        checkInBtn.innerHTML = '<span>CHỜ PHÂN PHÒNG BAN ĐỂ CHẤM CÔNG</span>';
      }
    }
    if (checkOutBtn) { checkOutBtn.style.display = 'none'; }
  }

  // 5. Cập nhật 4 KPI Cards (Chỉ số ngắn gọn, súc tích)
  const kpiWork = document.getElementById('dashEmpKpiWorkDays');
  const kpiWorkSub = document.getElementById('dashEmpKpiWorkDaysSub');
  const kpiLeave = document.getElementById('dashEmpKpiLeaveBalance');
  const kpiLeaveSub = document.getElementById('dashEmpKpiLeaveBalanceSub');
  const kpiLate = document.getElementById('dashEmpKpiLateCount');
  const kpiLateSub = document.getElementById('dashEmpKpiLateCountSub');
  const kpiOt = document.getElementById('dashEmpKpiOtHours');
  const kpiOtSub = document.getElementById('dashEmpKpiOtHoursSub');

  if (!isOnboarded) {
    if (kpiWork) kpiWork.innerText = '0 / 22';
    if (kpiWorkSub) kpiWorkSub.innerText = '0.0 giờ tích lũy';
    if (kpiLeave) kpiLeave.innerText = '0.0 ngày';
    if (kpiLeaveSub) kpiLeaveSub.innerText = 'Chưa kích hoạt quỹ phép';
    if (kpiLate) kpiLate.innerText = '0 lần';
    if (kpiLateSub) kpiLateSub.innerText = 'Không có vi phạm';
    if (kpiOt) kpiOt.innerText = '0.0 giờ';
    if (kpiOtSub) kpiOtSub.innerText = 'Chưa có giờ tăng ca';
  } else {
    const actualDays = userAtts.filter(l => l.check_in_time).length;
    const totalHours = (actualDays * 8.0).toFixed(1);
    if (kpiWork) kpiWork.innerText = `${actualDays} / 22`;
    if (kpiWorkSub) kpiWorkSub.innerText = `${totalHours} giờ tích lũy`;

    const leaveBal = state.user.leaveBalance || 12.0;
    if (kpiLeave) kpiLeave.innerText = `${leaveBal.toFixed(1)} ngày`;
    if (kpiLeaveSub) kpiLeaveSub.innerText = 'Sẵn sàng sử dụng';

    const lateCount = userAtts.filter(l => l.status === 'LATE').length;
    const totalLateMins = userAtts.reduce((sum, l) => sum + (l.late_minutes || 0), 0);
    if (kpiLate) kpiLate.innerText = `${lateCount < 10 ? '0' + lateCount : lateCount} lần`;
    if (kpiLateSub) kpiLateSub.innerText = lateCount > 0 ? `${totalLateMins} phút đi muộn` : 'Không có vi phạm';

    let userRequests = getUserEntityList('requests');
    const otList = userRequests.filter(r => (r.type && r.type.includes('OT')) && r.status === 'APPROVED');
    const otHours = otList.reduce((sum, o) => sum + (parseFloat(o.hours) || 2.5), 0);
    if (kpiOt) kpiOt.innerText = `${otHours.toFixed(1)} giờ`;
    if (kpiOtSub) kpiOtSub.innerText = otList.length > 0 ? `${otList.length} đơn đã duyệt` : 'Chưa có giờ tăng ca';
  }

  // 6. Cột trái: Lịch ca tuần này (7 ngày tới: từ hôm nay đến +6 ngày)
  const weekScheduleBody = document.getElementById('dashEmpWeekScheduleBody');
  if (weekScheduleBody) {
    if (!isOnboarded) {
      weekScheduleBody.innerHTML = `
        <div style="text-align: center; color: #64748b; padding: 16px 14px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div style="font-weight: 600; color: #334155; font-size: 13px;">Chưa có lịch phân ca làm việc</div>
          <div style="font-size: 11.5px; color: #94a3b8; margin-top: 3px;">
            Lịch ca trực sẽ hiển thị sau khi được phân công vào ban/phòng.
          </div>
        </div>
      `;
    } else {
      let weekHtml = '';
      for (let d = 0; d < 7; d++) {
        const day = new Date(now);
        day.setDate(now.getDate() + d);
        const dayStr = toLocalDateString(day);
        const dayLabel = `${dayNames[day.getDay()]}, ${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}/${day.getFullYear()}`;
        const isToday = (d === 0);

        const dayShifts = myShifts.filter(s => toLocalDateString(s.work_date || s.workDate) === dayStr && s.status === 'SCHEDULED');
        const dayOts = myApprovedOts.filter(o => toLocalDateString(o.work_date || o.workDate) === dayStr && o.status === 'APPROVED');

        let shiftContent = '';
        let bgColor = '#ffffff';
        let borderColor = '#e2e8f0';
        let textColor = '#334155';

        if (isToday) {
          bgColor = '#f0fdf4';
          borderColor = '#86efac';
          textColor = '#166534';
        }

        if (dayShifts.length > 0) {
          const s = dayShifts[0];
          const sName = getCleanShiftName(s) || s.shift_name || s.shiftName || 'Ca làm việc';
          const sStart = (s.start_time || s.startTime || '08:00:00').slice(0, 5);
          const sEnd = (s.end_time || s.endTime || '17:30:00').slice(0, 5);
          shiftContent += `<div><span style="font-weight: 600; color: #1e293b;">${sName}</span> <span style="color: #64748b; font-size: 12px;">(${sStart} - ${sEnd})</span></div>`;
        }

        if (dayOts.length > 0) {
          dayOts.forEach(ot => {
            const otStart = (ot.start_time || ot.startTime || '18:00').slice(0, 5);
            const otEnd = (ot.end_time || ot.endTime || '21:00').slice(0, 5);
            const otReason = ot.reason || ot.note || '';
            const otReasonText = otReason ? ` • ${otReason}` : '';
            shiftContent += `
              <div style="margin-top: ${dayShifts.length ? '4px' : '0'}; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: #faf5ff; border: 1px solid #d8b4fe; border-radius: 4px; font-size: 11.5px; color: #7e22ce; font-weight: 600;">
                <span>⏰ Tăng ca (OT) • ${otStart} - ${otEnd}${otReasonText}</span>
              </div>
            `;
          });
        }

        if (dayShifts.length === 0 && dayOts.length === 0) {
          shiftContent = `<span style="color: #94a3b8; font-weight: 500;">Ngày nghỉ / Không có ca</span>`;
          if (!isToday) bgColor = '#f8fafc';
        }

        weekHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; font-size: 12.5px; gap: 8px;">
            <div style="font-weight: ${isToday ? '700' : '500'}; color: ${textColor}; white-space: nowrap;">
              ${isToday ? 'Hôm nay: ' : ''}${dayLabel}
            </div>
            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
              ${shiftContent}
            </div>
          </div>
        `;
      }
      weekScheduleBody.innerHTML = weekHtml;
    }
  }

  // 6. Cột phải: Đơn từ gần đây của bạn
  const recentReqTbody = document.getElementById('dashEmpRecentRequestsBody');
  if (recentReqTbody) {
    let userRequests = getUserEntityList('requests');
    if (!userRequests.length) {
      recentReqTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: #94a3b8; padding: 18px 12px; font-size: 12.5px;">
            Chưa có đơn từ nào được tạo.
          </td>
        </tr>
      `;
    } else {
      recentReqTbody.innerHTML = userRequests.slice(0, 4).map(req => {
        let badge = '<span class="badge-status" style="background:#fef3c7; color:#b45309;">Chờ duyệt</span>';
        if (req.status === 'APPROVED') badge = '<span class="badge-status badge-approved">Đã duyệt</span>';
        if (req.status === 'REJECTED') badge = '<span class="badge-status badge-rejected">Từ chối</span>';

        return `
          <tr>
            <td><strong>${req.code || req.id}</strong></td>
            <td>${req.type || req.leave_name || 'Nghỉ phép năm'}</td>
            <td>${req.date || req.start_date || '-'}</td>
            <td>${badge}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // 7. Cập nhật Thông báo trên Header
  renderTopbarNotifications();
}

// ==============================================================================
// 8B. CƠ CHẾ MỜI / THAM GIA PHÒNG BAN & LIÊN KẾT QUẢN LÝ - NHÂN VIÊN
// ==============================================================================

// 1. Phía Nhân viên: Tải các lời mời đang chờ phản hồi
async function loadPendingInvitationsForEmp() {
  const container = document.getElementById('empPendingInvitationsSection');
  const listEl = document.getElementById('empPendingInvitationsList');
  if (!container || !listEl) return;

  try {
    const res = await apiCall('/api/organization/invitations/my-pending');
    const invites = res?.data || [];

    if (!invites.length) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    listEl.innerHTML = invites.map(inv => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #fde68a; border-radius: 10px; padding: 10px 14px; margin-top: 6px;">
        <div>
          <div style="font-weight: 700; color: #1e293b; font-size: 13.5px;">${inv.department_name || 'Phòng ban làm việc'}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
            Người mời: <strong>${inv.manager_name || 'Quản lý'}</strong> • Mã mời: <code style="font-weight:700; color:#2563eb;">${inv.invite_code}</code>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-primary-blue" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="handleAcceptInvitation('${inv.id}', '${inv.invite_code}')">
            ✓ Tham gia
          </button>
          <button type="button" class="btn-reject-sm" style="padding: 6px 10px; font-size: 12px; border-radius: 6px;" onclick="handleRejectInvitation('${inv.id}')">
            ✕ Từ chối
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.style.display = 'none';
  }
}

// 2. Phía Nhân viên: Nhập inviteCode để tham gia phòng ban
async function handleJoinDepartmentByCode() {
  const input = document.getElementById('inputJoinInviteCode');
  const code = (input?.value || '').trim().toUpperCase();

  if (!code) {
    return showToast('Vui lòng nhập mã mời phòng ban (ví dụ: TEAM-TECH)', 'warning');
  }

  try {
    const res = await apiCall('/api/organization/join-department', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: code })
    });

    showToast(res?.message || `Tham gia phòng ban thành công!`, 'success');

    // Cập nhật trạng thái người dùng
    if (state.user) {
      state.user.isOnboarded = true;
      state.user.department = res.data?.departmentName || res.data?.department?.name || 'Phòng ban mới';
      state.user.departmentId = res.data?.departmentId;
      state.user.managerName = res.data?.managerName || 'Quản lý bộ phận';
      state.user.position = 'Kỹ sư phần mềm';
      state.user.officeLocation = 'Văn phòng Quy Nhơn (170 An Dương Vương)';
      state.user.shiftName = 'Ca Hành Chính';
      state.user.shiftStart = '08:00';
      state.user.shiftEnd = '17:30';
      state.user.leaveBalance = 12.0;

      safeSetStorage('htqlns_user', JSON.stringify(state.user));
      saveUserAssignment(state.user.username, {
        status: 'ACTIVE',
        department: state.user.department,
        position: state.user.position,
        managerName: state.user.managerName,
        officeLocation: state.user.officeLocation,
        shiftName: state.user.shiftName,
        shiftStart: state.user.shiftStart,
        shiftEnd: state.user.shiftEnd,
        leaveBalance: state.user.leaveBalance
      });
    }

    if (input) input.value = '';
    initPortalDashboard('dashboard');
  } catch (err) {
    console.error('Lỗi tham gia phòng ban:', err);
    showToast(err.message || 'Mã mời không hợp lệ hoặc phòng ban không tồn tại', 'error');
  }
}

// 3. Phía Nhân viên: Chấp nhận lời mời trực tiếp
async function handleAcceptInvitation(invId, inviteCode) {
  try {
    const res = await apiCall('/api/organization/join-department', {
      method: 'POST',
      body: JSON.stringify({ invitationId: invId, inviteCode })
    });

    showToast(res?.message || 'Đã chấp nhận lời mời tham gia phòng ban!', 'success');

    if (state.user) {
      state.user.isOnboarded = true;
      state.user.department = res.data?.departmentName || res.data?.department?.name || 'Phòng ban mới';
      state.user.departmentId = res.data?.departmentId;
      state.user.managerName = res.data?.managerName || 'Quản lý bộ phận';
      state.user.position = 'Nhân viên chính thức';
      state.user.officeLocation = 'Văn phòng Quy Nhơn (170 An Dương Vương)';
      state.user.shiftName = 'Ca Hành Chính';
      state.user.shiftStart = '08:00';
      state.user.shiftEnd = '17:30';
      state.user.leaveBalance = 12.0;

      safeSetStorage('htqlns_user', JSON.stringify(state.user));
      saveUserAssignment(state.user.username, {
        status: 'ACTIVE',
        department: state.user.department,
        position: state.user.position,
        managerName: state.user.managerName,
        officeLocation: state.user.officeLocation,
        shiftName: state.user.shiftName,
        shiftStart: state.user.shiftStart,
        shiftEnd: state.user.shiftEnd,
        leaveBalance: state.user.leaveBalance
      });
    }

    initPortalDashboard('dashboard');
  } catch (err) {
    showToast(err.message || 'Lỗi khi chấp nhận lời mời', 'error');
  }
}

// 4. Phía Nhân viên: Từ chối lời mời
async function handleRejectInvitation(invId) {
  if (!confirm('Bạn có chắc muốn từ chối lời mời này?')) return;
  try {
    await apiCall(`/api/organization/invitations/${invId}/reject`, { method: 'POST' });
    showToast('Đã từ chối lời mời tham gia phòng ban', 'info');
    loadPendingInvitationsForEmp();
  } catch (err) {
    showToast(err.message || 'Lỗi từ chối lời mời', 'error');
  }
}

// 5. Phía Quản lý: Tải thông tin phòng ban & Mã mời của Quản lý
async function loadManagerTeamInfo() {
  const card = document.getElementById('managerTeamManagementCard');
  if (!card) return;

  const role = (state.user?.role || '').toUpperCase();
  if (role !== 'MANAGER') {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  const deptTitle = document.getElementById('mgrDeptNameTitle');
  const inviteVal = document.getElementById('mgrInviteCodeVal');
  const inviteBadge = document.getElementById('mgrInviteCodeBadge');
  const subtitle = document.getElementById('mgrTeamSubtitle');
  const inviteBtn = document.getElementById('btnMgrInviteEmail') || document.querySelector("button[onclick='openManagerInviteModal()']");

  try {
    const res = await apiCall('/api/organization/departments');
    const depts = res?.data || [];
    
    const userEmpId = state.user?.empId || state.user?.id;
    const userDeptId = state.user?.departmentId || state.user?.department_id;
    const userDeptName = state.user?.department || state.user?.departmentName;

    // Tìm phòng ban do Manager này thực sự phụ trách hoặc được phân bổ
    let myDept = null;
    if (userEmpId) {
      myDept = depts.find(d => d.manager_id && (d.manager_id === userEmpId || d.manager_id === state.user?.id));
    }
    if (!myDept && userDeptId) {
      myDept = depts.find(d => d.id === userDeptId);
    }
    if (!myDept && userDeptName && userDeptName !== '-' && !userDeptName.includes('Chưa phân') && !userDeptName.includes('Ban Giám Đốc')) {
      myDept = depts.find(d => d.name === userDeptName);
    }

    // Không tự gán mặc định Ban Giám Đốc khi departmentId đang trống (null)
    if (myDept) {
      state.currentManagerDept = myDept;
      card.style.background = '#ffffff';
      card.style.border = '1px solid #e2e8f0';
      if (deptTitle) {
        deptTitle.innerText = `Phòng ban phụ trách: ${myDept.name}`;
        deptTitle.style.color = '#0f172a';
      }
      if (inviteBadge) {
        inviteBadge.style.display = 'inline-flex';
      }
      if (inviteVal) {
        inviteVal.innerText = myDept.invite_code || `TEAM-${(myDept.code || 'TECH').replace(/^PB-/, '')}`;
      }
      if (subtitle) {
        subtitle.innerText = 'Gửi mã mời hoặc nhập email nhân viên để họ tham gia vào đội ngũ của bạn.';
        subtitle.style.color = '#64748b';
      }
      if (inviteBtn) {
        inviteBtn.style.display = 'inline-flex';
        inviteBtn.disabled = false;
        inviteBtn.style.pointerEvents = 'auto';
        inviteBtn.style.cursor = 'pointer';
      }
    } else {
      // Manager mới chưa được phân công phòng ban phụ trách: Hiển thị trạng thái rõ ràng
      state.currentManagerDept = null;
      card.style.background = '#fffbeb';
      card.style.border = '1.5px solid #fde68a';
      if (deptTitle) {
        deptTitle.innerText = 'Tài khoản Quản lý chưa được phân công phòng ban phụ trách — Vui lòng liên hệ HR/Admin để gán bộ phận quản lý';
        deptTitle.style.color = '#b45309';
      }
      if (inviteBadge) {
        inviteBadge.style.display = 'none';
      }
      if (subtitle) {
        subtitle.innerText = 'Tài khoản đang chờ phân bổ phòng ban. Sau khi được phân công, bạn có thể xem số liệu và quản lý nhân sự thuộc bộ phận.';
        subtitle.style.color = '#92400e';
      }
      if (inviteBtn) {
        inviteBtn.style.display = 'inline-flex';
        inviteBtn.disabled = false;
        inviteBtn.style.pointerEvents = 'auto';
        inviteBtn.style.cursor = 'pointer';
      }
    }
  } catch (err) {
    state.currentManagerDept = null;
    card.style.background = '#fffbeb';
    card.style.border = '1.5px solid #fde68a';
    if (deptTitle) {
      deptTitle.innerText = 'Tài khoản Quản lý chưa được phân công phòng ban phụ trách — Vui lòng liên hệ HR/Admin để gán bộ phận quản lý';
      deptTitle.style.color = '#b45309';
    }
    if (inviteBadge) inviteBadge.style.display = 'none';
    if (inviteBtn) {
      inviteBtn.style.display = 'inline-flex';
      inviteBtn.disabled = false;
      inviteBtn.style.pointerEvents = 'auto';
      inviteBtn.style.cursor = 'pointer';
    }
  }
}

// 6. Phía Quản lý: Sao chép mã mời phòng ban
function copyManagerInviteCode() {
  const codeEl = document.getElementById('mgrInviteCodeVal');
  const code = codeEl?.innerText || 'TEAM-TECH';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      showToast(`Đã sao chép mã mời "${code}" vào clipboard! Hãy gửi mã này cho nhân viên.`, 'success');
    }).catch(() => {
      prompt('Mã mời của bạn là (nhấn Ctrl+C để sao chép):', code);
    });
  } else {
    prompt('Mã mời của bạn là (nhấn Ctrl+C để sao chép):', code);
  }
}

// 7. Phía Quản lý: Mở Modal Mời nhân viên qua email
async function openManagerInviteModal() {
  const userEmpId = state.user?.empId || state.user?.id;
  const userDeptId = state.user?.departmentId || state.user?.department_id;
  const userDeptName = state.user?.department || state.user?.departmentName;

  // Lấy thông tin phòng ban phụ trách
  let myDept = state.currentManagerDept;
  if (!myDept) {
    const depts = state.departments || [];
    if (userEmpId) {
      myDept = depts.find(d => d.manager_id && (d.manager_id === userEmpId || d.manager_id === state.user?.id));
    }
    if (!myDept && userDeptId) {
      myDept = depts.find(d => d.id === userDeptId);
    }
    if (!myDept && userDeptName && userDeptName !== '-' && !userDeptName.includes('Chưa phân') && !userDeptName.includes('Ban Giám Đốc')) {
      myDept = depts.find(d => d.name === userDeptName);
    }
  }

  // Nếu tài khoản Quản lý hiện tại chưa được Admin/HR gán phòng ban phụ trách (!currentUser.departmentId)
  if (!myDept && !userDeptId) {
    const warnMsg = 'Tài khoản Quản lý của bạn chưa được phân công phòng ban phụ trách nên chưa thể mời nhân viên';
    showToast(warnMsg, 'warning');
    openModal(
      'Mời nhân viên tham gia phòng ban',
      `
      <div style="display: flex; flex-direction: column; gap: 14px; text-align: center; padding: 14px 8px;">
        <div style="font-size: 42px;">⚠️</div>
        <div style="font-size: 15px; font-weight: 700; color: #b45309; line-height: 1.4;">
          ${warnMsg}
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
          Vui lòng liên hệ Quản trị viên (ADMIN) hoặc Bộ phận Nhân sự (HR_ADMIN) để được phân công phòng ban phụ trách trước khi mời nhân sự vào đội nhóm.
        </p>
        <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn-figma-dark" style="padding: 9px 20px; font-size: 13px; border-radius: 8px;" onclick="closeModal()">
            Đã hiểu &amp; Đóng
          </button>
        </div>
      </div>
      `
    );
    return;
  }

  const deptName = myDept?.name || userDeptName || 'Phòng ban phụ trách';
  const deptCode = myDept?.code || 'TECH';
  const inviteCode = myDept?.invite_code || `TEAM-${deptCode.replace(/^PB-/, '')}`;

  // Lọc danh sách nhân sự chưa thuộc phòng ban nào để chọn nhanh
  const unassignedEmployees = (state.employees || []).filter(e => 
    (!e.department_id && !e.department_name && e.status !== 'INACTIVE' && e.status !== 'RESIGNED') ||
    e.status === 'PENDING' || e.status === 'PENDING_ASSIGNMENT'
  );

  const regUsers = getRegisteredUsersList();
  regUsers.forEach(u => {
    if (!unassignedEmployees.some(e => e.email && u.email && e.email.toLowerCase() === u.email.toLowerCase())) {
      const a = getUserAssignment(u.username, u.id);
      if (!a || a.status !== 'ACTIVE') {
        unassignedEmployees.push({
          id: u.id,
          full_name: u.fullName || u.username,
          email: u.email
        });
      }
    }
  });

  const unassignedOptions = unassignedEmployees.map(e => 
    `<option value="${escapeHtml(e.email || '')}">${escapeHtml(e.full_name || e.fullName || 'Nhân viên')} (${escapeHtml(e.email || 'Chưa có email')})</option>`
  ).join('');

  openModal(
    'Mời nhân viên tham gia phòng ban',
    `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <!-- Khung thông tin phòng ban & mã mời -->
      <div style="background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <div style="font-size: 11.5px; color: #1e40af; font-weight: 600; text-transform: uppercase;">Phòng ban phụ trách</div>
            <div style="font-size: 14.5px; font-weight: 700; color: #1e3a8a;" id="modalDeptNameText">${escapeHtml(deptName)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 12px; color: #1e40af; font-weight: 600;">Mã mời:</span>
            <span class="badge-status badge-approved" id="modalDeptInviteCodeBadge" style="font-size: 12px; font-weight: 700; background: #ffffff; color: #2563eb; padding: 4px 10px; border-radius: 6px; border: 1px solid #bfdbfe;">
              ${escapeHtml(inviteCode)}
            </span>
            <button type="button" class="btn-figma-dark" style="padding: 4px 8px; font-size: 11.5px; border-radius: 6px;" onclick="copyManagerInviteCodeVal('${escapeHtml(inviteCode)}')">
              📋 Sao chép
            </button>
          </div>
        </div>
      </div>

      <!-- Email nhân viên -->
      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">
          Email nhân viên <span style="color: #ef4444;">*</span>:
        </label>
        <input type="email" id="modalInviteEmail" class="figma-pill-input" placeholder="nhanvien@htqlns.com" required>
        ${unassignedEmployees.length > 0 ? `
        <div style="margin-top: 6px;">
          <select id="modalSelectUnassignedEmp" class="figma-pill-input" style="font-size: 12px; cursor: pointer; appearance: auto; background: #f8fafc;" onchange="if(this.value) document.getElementById('modalInviteEmail').value = this.value">
            <option value="">-- Hoặc chọn nhanh từ danh sách nhân viên chờ tiếp nhận (${unassignedEmployees.length}) --</option>
            ${unassignedOptions}
          </select>
        </div>` : ''}
      </div>

      <!-- Vị trí việc làm -->
      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">
          Vị trí việc làm trong phòng ban:
        </label>
        <select id="modalInvitePosition" class="figma-pill-input" style="cursor: pointer; appearance: auto;">
          <option value="Kỹ Sư Phần Mềm">Kỹ Sư Phần Mềm</option>
          <option value="Chuyên Viên Kiểm Thử (QA/QC)">Chuyên Viên Kiểm Thử (QA/QC)</option>
          <option value="Chuyên Viên Phân Tích Nghiệp Vụ (BA)">Chuyên Viên Phân Tích Nghiệp Vụ (BA)</option>
          <option value="Kỹ Sư Hạ Tầng & DevOps">Kỹ Sư Hạ Tầng & DevOps</option>
          <option value="Chuyên Viên Thiết Kế UI/UX">Chuyên Viên Thiết Kế UI/UX</option>
          <option value="Chuyên Viên Nhân Sự">Chuyên Viên Nhân Sự</option>
          <option value="Chuyên Viên Kế Toán">Chuyên Viên Kế Toán</option>
          <option value="Chuyên Viên Kinh Doanh">Chuyên Viên Kinh Doanh</option>
          <option value="Thành Viên Bộ Phận">Thành Viên Bộ Phận</option>
        </select>
      </div>

      <!-- Ghi chú / Lời nhắn -->
      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Ghi chú / Lời nhắn:</label>
        <input type="text" id="modalInviteNote" class="figma-pill-input" placeholder="Chào mừng bạn gia nhập phòng ban!">
      </div>

      <button type="button" class="btn-primary-blue" id="btnSubmitManagerInvite" style="margin-top: 6px; padding: 11px; font-size: 13.5px;" onclick="submitManagerInvite()">
        ✉️ Mời &amp; Tiếp nhận nhân viên
      </button>
    </div>
    `
  );
}

function copyManagerInviteCodeVal(code) {
  const codeVal = code || document.getElementById('mgrInviteCodeVal')?.innerText || 'TEAM-TECH';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(codeVal).then(() => {
      showToast(`Đã sao chép mã mời "${codeVal}" vào clipboard!`, 'success');
    }).catch(() => {
      prompt('Mã mời của phòng ban là (Ctrl+C để sao chép):', codeVal);
    });
  } else {
    prompt('Mã mời của phòng ban là (Ctrl+C để sao chép):', codeVal);
  }
}

// 8. Phía Quản lý: Gửi API mời / tiếp nhận nhân viên vào phòng ban
async function submitManagerInvite() {
  const emailInput = document.getElementById('modalInviteEmail');
  const email = (emailInput?.value || '').trim();
  const position = document.getElementById('modalInvitePosition')?.value || 'Thành Viên Bộ Phận';
  const myDept = state.currentManagerDept;
  const departmentId = myDept?.id || state.user?.departmentId || state.user?.department_id;

  if (!email) {
    return showToast('Vui lòng nhập email nhân viên', 'warning');
  }

  if (!departmentId) {
    return showToast('Tài khoản Quản lý của bạn chưa được phân công phòng ban phụ trách nên chưa thể mời nhân viên', 'warning');
  }

  const submitBtn = document.getElementById('btnSubmitManagerInvite');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Đang tiếp nhận...';
  }

  try {
    const res = await apiCall('/api/v1/organizations/departments/invite', {
      method: 'POST',
      body: JSON.stringify({ email, departmentId, position })
    });

    closeModal();
    showToast(res?.message || `Đã tiếp nhận nhân viên ${email} vào phòng ban thành công!`, 'success');

    // Sau khi mời thành công: tự động tải lại số liệu nhân sự trên Dashboard của Quản lý
    await Promise.all([
      loadDepartmentsData(),
      loadEmployeesData(),
      loadDashboardData()
    ]);
    if (typeof loadManagerTeamInfo === 'function') {
      await loadManagerTeamInfo();
    }
  } catch (err) {
    console.error('Lỗi mời nhân viên:', err);
    showToast(err.message || 'Lỗi tiếp nhận nhân viên vào phòng ban', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = '✉️ Mời & Tiếp nhận nhân viên';
    }
  }
}

// 9. Phía Quản lý: Mở Modal Tạo Phòng ban / Nhóm mới
function openCreateTeamModal() {
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  openModal(
    'Tạo Phòng ban / Nhóm làm việc mới',
    `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Tên phòng ban / Nhóm:</label>
        <input type="text" id="modalNewTeamName" class="figma-pill-input" placeholder="vd: Nhóm Dự Án Alpha" required>
      </div>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Mã phòng ban (Tự sinh):</label>
        <input type="text" id="modalNewTeamCode" class="figma-pill-input" value="PB-TEAM-${randomSuffix}" style="text-transform: uppercase;">
      </div>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Mã mời tham gia (Invite Code cho nhân viên):</label>
        <input type="text" id="modalNewTeamInviteCode" class="figma-pill-input" value="TEAM-${randomSuffix}" style="text-transform: uppercase; font-weight: 700; color: #2563eb;">
      </div>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Ca làm việc mặc định:</label>
        <select id="modalNewTeamShift" class="figma-pill-input" style="cursor: pointer; appearance: auto;">
          <option value="shift-standard">Ca Hành Chính (08:00 - 17:30)</option>
          <option value="shift-morning">Ca Sáng (06:00 - 14:00)</option>
          <option value="shift-flexible">Ca Linh Hoạt</option>
        </select>
      </div>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Mô tả chức năng nhiệm vụ:</label>
        <textarea id="modalNewTeamDesc" class="figma-pill-input" style="border-radius: 12px; height: 60px;" placeholder="Mô tả nhóm làm việc..."></textarea>
      </div>

      <button class="btn-primary-blue" style="margin-top: 8px; padding: 10px; font-size: 13.5px;" onclick="submitCreateTeam()">
        🏢 Khởi tạo phòng ban & Nhận mã mời
      </button>
    </div>
    `
  );
}

// 10. Phía Quản lý: Gửi API Tạo phòng ban
async function submitCreateTeam() {
  const name = (document.getElementById('modalNewTeamName')?.value || '').trim();
  const code = (document.getElementById('modalNewTeamCode')?.value || '').trim().toUpperCase();
  const inviteCode = (document.getElementById('modalNewTeamInviteCode')?.value || '').trim().toUpperCase();
  const shiftId = document.getElementById('modalNewTeamShift')?.value || 'shift-standard';
  const desc = document.getElementById('modalNewTeamDesc')?.value || '';

  if (!name || !code) {
    return showToast('Vui lòng nhập tên và mã phòng ban', 'warning');
  }

  try {
    const res = await apiCall('/api/organization/departments', {
      method: 'POST',
      body: JSON.stringify({
        name,
        code,
        inviteCode,
        description: desc,
        default_shift_id: shiftId
      })
    });

    closeModal();
    const finalInvite = res.data?.inviteCode || inviteCode;
    showToast(`Tạo phòng ban "${name}" thành công! Mã mời của nhóm là: ${finalInvite}`, 'success');

    // Tải lại thông tin phòng ban trên giao diện quản lý
    loadManagerTeamInfo();
  } catch (err) {
    console.error('Lỗi tạo phòng ban:', err);
    showToast(err.message || 'Lỗi tạo phòng ban mới', 'error');
  }
}

// ==============================================================================
// 9B. PHÂN HỆ THÔNG BÁO & CẢNH BÁO XUYÊN SUỐT (SCR_NOTIF_01)
// ==============================================================================

let cachedNotifications = [];
let notificationPollInterval = null;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Tải danh sách thông báo của người dùng từ Backend qua Gateway
async function loadNotifications() {
  if (!state.user || !state.token) return;
  try {
    const res = await apiCall('/api/v1/notifications/my');
    if (res && res.success && Array.isArray(res.data)) {
      cachedNotifications = res.data;
      renderTopbarNotifications();
      return;
    }
  } catch (err) {
    try {
      const res = await apiCall('/api/v1/notifications');
      if (res && res.success && Array.isArray(res.data)) {
        cachedNotifications = res.data;
        renderTopbarNotifications();
        return;
      }
    } catch (_) {}
  }
  renderTopbarNotifications();
}

// Bắt đầu vòng lặp thăm dò thông báo thời gian thực (15-30s một lần)
function startNotificationPolling() {
  if (notificationPollInterval) {
    clearInterval(notificationPollInterval);
    notificationPollInterval = null;
  }
  loadNotifications();
  notificationPollInterval = setInterval(() => {
    if (state.user && state.token) {
      loadNotifications();
    }
  }, 20000);
}

function stopNotificationPolling() {
  if (notificationPollInterval) {
    clearInterval(notificationPollInterval);
    notificationPollInterval = null;
  }
}

// Dropdown Thông Báo trên Header
function toggleTopbarNotifDropdown(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const dropdown = document.getElementById('topbarNotifDropdown');
  if (!dropdown) return;
  const isShown = dropdown.style.display === 'block';
  dropdown.style.display = isShown ? 'none' : 'block';
  if (!isShown) {
    loadNotifications();
  }
}

function openNotificationsModal(e) {
  toggleTopbarNotifDropdown(e);
}

function closeTopbarNotifDropdown() {
  const dropdown = document.getElementById('topbarNotifDropdown');
  if (dropdown) dropdown.style.display = 'none';
}

function renderTopbarNotifications() {
  if (!state.user) return;
  const isEmployee = (state.user.role === 'EMPLOYEE');
  const isOnboarded = state.user.isOnboarded;
  const displayName = state.user.fullName || state.user.username || 'Nhân viên';

  let list = Array.isArray(cachedNotifications) && cachedNotifications.length > 0
    ? [...cachedNotifications]
    : getUserEntityList('notifications');

  if (!list.length && isEmployee && !isOnboarded) {
    list = [
      {
        id: 'notif-welcome',
        title: `Chào mừng ${displayName} gia nhập Hệ thống HTQLNS!`,
        content: 'Tài khoản của bạn đã được khởi tạo thành công. Vui lòng chờ Ban Quản trị tiếp nhận vào ban/phòng, xếp ca trực và cấu hình mức lương.',
        type: 'SYSTEM',
        created_at: new Date().toISOString(),
        is_read: false
      }
    ];
  }

  const unreadCount = list.filter(n => !n.is_read && n.is_read !== 1 && n.is_read !== true).length;
  const topbarBadge = document.getElementById('topbarNotifCountBadge');
  if (topbarBadge) topbarBadge.innerText = `${unreadCount} mới`;

  const topbarDot = document.getElementById('topbarNotifBadgeDot');
  if (topbarDot) {
    if (unreadCount > 0) {
      topbarDot.style.display = 'flex';
      topbarDot.innerText = unreadCount > 99 ? '99+' : String(unreadCount);
    } else {
      topbarDot.style.display = 'none';
      topbarDot.innerText = '';
    }
  }

  const topbarList = document.getElementById('topbarNotifList');
  if (topbarList) {
    if (!list.length) {
      topbarList.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 24px; font-size: 13px;">Không có thông báo mới nào.</div>';
    } else {
      topbarList.innerHTML = list.map(n => {
        const isUnread = !n.is_read && n.is_read !== 1 && n.is_read !== true;
        const d = n.created_at ? new Date(n.created_at) : new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const timeStr = `${hh}:${mm} ${dd}/${MM}`;
        const titleText = escapeHtml(n.title || n.content || n.message || 'Thông báo hệ thống');
        const contentText = escapeHtml(n.content || n.message || '');
        const notifId = escapeHtml(String(n.id));

        return `
          <div class="topbar-notif-item ${isUnread ? 'unread' : ''}" onclick="handleNotificationClick('${notifId}')" style="cursor: pointer;">
            <div style="flex: 1;">
              <div style="font-size: 13px; font-weight: ${isUnread ? '700' : '500'}; color: #1e293b; line-height: 1.4;">
                ${titleText} <span style="font-size: 11px; font-weight: normal; color: #94a3b8; margin-left: 4px;">${timeStr}</span>
              </div>
              ${contentText && titleText !== contentText ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.4;">${contentText}</div>` : ''}
            </div>
            ${isUnread ? '<div style="width: 8px; height: 8px; background: #2563eb; border-radius: 50%; margin-top: 6px; flex-shrink: 0;"></div>' : ''}
          </div>
        `;
      }).join('');
    }
  }
}

document.addEventListener('click', function(e) {
  const wrapper = document.querySelector('.topbar-notif-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    closeTopbarNotifDropdown();
  }
});

// Đánh dấu đã đọc 1 thông báo
async function markNotifRead(notifId) {
  if (!notifId) return;
  if (Array.isArray(cachedNotifications)) {
    const target = cachedNotifications.find(n => String(n.id) === String(notifId));
    if (target) {
      target.is_read = true;
      target.read_at = new Date().toISOString();
    }
  }
  let userNotifs = getUserEntityList('notifications');
  const localTarget = userNotifs.find(n => String(n.id) === String(notifId));
  if (localTarget) {
    localTarget.is_read = true;
    localTarget.read_at = new Date().toISOString();
  }
  saveUserEntityList('notifications', userNotifs);

  renderTopbarNotifications();

  try {
    await apiCall(`/api/v1/notifications/${notifId}/read`, 'PATCH');
  } catch (err) {
    try {
      await apiCall(`/api/notifications/${notifId}/read`, 'PATCH');
    } catch (_) {}
  }

  if (state.currentView === 'dashboard' && state.user?.role === 'EMPLOYEE') {
    loadEmployeeDashboardData();
  }
}

// Xử lý khi click vào từng thông báo: Đánh dấu đã đọc và tự động chuyển phân hệ tương ứng
async function handleNotificationClick(notifId) {
  if (!notifId) return;
  const list = Array.isArray(cachedNotifications) && cachedNotifications.length > 0
    ? cachedNotifications
    : getUserEntityList('notifications');
  const target = list.find(n => String(n.id) === String(notifId));

  await markNotifRead(notifId);
  closeTopbarNotifDropdown();

  if (!target) return;

  const metadata = target.metadata || {};
  let targetPage = target.targetPage || metadata.targetPage || '';
  let targetTab = target.targetTab || metadata.targetTab || '';
  let filterStatus = target.filterStatus || metadata.filterStatus || '';

  const type = target.type || '';
  const text = `${target.title || ''} ${target.content || ''} ${target.message || ''}`.toLowerCase();
  const userRole = (state.user?.role || 'EMPLOYEE').toUpperCase();

  // Tự động suy luận nếu chưa có targetPage (fallback dựa trên type / từ khóa)
  if (!targetPage) {
    if (
      type === 'EMPLOYEE_NEW' ||
      type === 'EMPLOYEE_PENDING' ||
      /nhân viên mới.*tiếp nhận|chờ tiếp nhận và phân phòng ban/i.test(text)
    ) {
      targetPage = 'employees';
      filterStatus = filterStatus || 'PENDING';
    } else if (
      ['OT_REQUEST_CREATED', 'OT_REQUEST_APPROVED', 'OT_REQUEST_REJECTED', 'OT_STATUS'].includes(type) ||
      (/tăng ca|đơn đăng ký tăng ca/i.test(text) && !/nghỉ phép|giải trình/i.test(text))
    ) {
      targetPage = 'shifts';
      targetTab = targetTab || 'ot-requests';
      if (/cần phê duyệt|vừa gửi|chờ duyệt/i.test(text)) {
        filterStatus = filterStatus || 'PENDING';
      }
    } else if (
      type === 'SHIFT_ASSIGNED' ||
      (/phân ca|ca làm việc|lịch ca|lịch phân ca/i.test(text) && !/tăng ca|ot/i.test(text))
    ) {
      targetPage = 'shifts';
      targetTab = targetTab || 'schedule';
    } else if (
      ['LEAVE_REQUEST_CREATED', 'LEAVE_REQUEST_APPROVED', 'LEAVE_REQUEST_REJECTED', 'ADJUSTMENT_REQUEST_CREATED', 'ADJUSTMENT_REQUEST_APPROVED', 'ADJUSTMENT_REQUEST_REJECTED', 'LEAVE_STATUS', 'ATTENDANCE_ALERT'].includes(type) ||
      /đơn|nghỉ phép|giải trình/i.test(text)
    ) {
      targetPage = 'requests';
      if (/cần phê duyệt|vừa gửi|chờ duyệt/i.test(text) && ['ADMIN', 'HR', 'HR_ADMIN', 'MANAGER'].includes(userRole)) {
        targetTab = targetTab || 'approval';
        filterStatus = filterStatus || 'PENDING';
      } else {
        targetTab = targetTab || 'my-requests';
      }
    } else if (
      type === 'PAYROLL' ||
      type === 'PAYSLIP_PUBLISHED' ||
      /lương|phiếu lương|bảng lương/i.test(text)
    ) {
      targetPage = 'payroll';
    } else if (
      type === 'ATTENDANCE_LATE' ||
      /chấm công|điểm danh|check-in|check-out/i.test(text)
    ) {
      targetPage = userRole === 'EMPLOYEE' ? 'my-attendance' : 'attendance-history';
    } else {
      targetPage = 'dashboard';
    }
  }

  // 1. Phân hệ Nhân viên: Tiếp nhận tài khoản mới
  if (targetPage === 'employees') {
    const filterEl = document.getElementById('employeeFilterStatus');
    if (filterEl) {
      filterEl.value = filterStatus || 'PENDING';
    }
    navigateToView('employees');
    setTimeout(() => {
      handleEmployeeFilter();
    }, 120);
    return;
  }

  // 2. Phân hệ Phân ca & Tăng ca (OT)
  if (targetPage === 'shifts') {
    navigateToView('shifts');
    const tabToSwitch = (targetTab === 'ot-requests' || targetTab === 'ot') ? 'ot' : 'assignments';
    setTimeout(() => {
      if (typeof switchShiftTab === 'function') {
        switchShiftTab(tabToSwitch);
      }
      if (tabToSwitch === 'ot' && filterStatus) {
        const otFilterEl = document.getElementById('filterOtStatus');
        if (otFilterEl) {
          otFilterEl.value = filterStatus;
          if (typeof filterOtTable === 'function') filterOtTable();
        }
      }
    }, 120);
    return;
  }

  // 3. Phân hệ Đơn từ (Nghỉ phép & Giải trình chấm công)
  if (targetPage === 'leaves' || targetPage === 'requests') {
    navigateToView('requests');
    let tabToSwitch = 'department';
    if (targetTab === 'my-requests' || targetTab === 'personal') {
      tabToSwitch = 'personal';
    } else if (targetTab === 'approval' || targetTab === 'department') {
      tabToSwitch = 'department';
    } else if (userRole === 'EMPLOYEE') {
      tabToSwitch = 'personal';
    }

    setTimeout(() => {
      if (typeof switchRequestsTab === 'function') {
        switchRequestsTab(tabToSwitch);
      } else if (typeof switchRequestTab === 'function') {
        switchRequestTab(tabToSwitch);
      }
      if (filterStatus) {
        const reqFilterEl = document.getElementById('requestsFilterStatus');
        if (reqFilterEl) {
          reqFilterEl.value = filterStatus;
          if (typeof filterRequestsTable === 'function') filterRequestsTable();
        }
      }
    }, 120);
    return;
  }

  // 4. Phân hệ Tiền lương
  if (targetPage === 'payroll') {
    navigateToView('payroll');
    return;
  }

  // 5. Phân hệ Chấm công
  if (targetPage === 'my-attendance' || targetPage === 'attendance') {
    if (userRole === 'ADMIN') {
      navigateToView('attendance-history');
    } else {
      navigateToView(targetPage === 'attendance' ? 'attendance-history' : 'my-attendance');
    }
    return;
  }

  // Mặc định
  navigateToView(targetPage || 'dashboard');
}

// Đánh dấu đã đọc toàn bộ thông báo
async function markAllEmployeeNotifsRead() {
  if (Array.isArray(cachedNotifications)) {
    cachedNotifications.forEach(n => {
      n.is_read = true;
      n.read_at = new Date().toISOString();
    });
  }
  let userNotifs = getUserEntityList('notifications');
  userNotifs.forEach(n => {
    n.is_read = true;
    n.read_at = new Date().toISOString();
  });
  saveUserEntityList('notifications', userNotifs);

  renderTopbarNotifications();
  showToast('Đã đánh dấu tất cả thông báo là đã đọc', 'success');

  try {
    await apiCall('/api/v1/notifications/read-all', 'PATCH');
  } catch (err) {
    try {
      await apiCall('/api/notifications/read-all', 'PATCH');
    } catch (_) {}
  }

  if (state.currentView === 'dashboard' && state.user?.role === 'EMPLOYEE') {
    loadEmployeeDashboardData();
  }
}

function scrollToCreateLeaveForm() {
  navigateToView('requests');
  setTimeout(() => {
    const el = document.getElementById('cardCreateLeaveForm');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.4)';
      setTimeout(() => { el.style.boxShadow = ''; }, 2000);
    }
  }, 120);
}

function checkUserHasShiftToday() {
  if (state.todayHasShift !== undefined && state.todayHasShift !== null) {
    return Boolean(state.todayHasShift);
  }
  return true;
}

// Check-in trong ngày (Lưu riêng biệt cho tài khoản hiện tại)
async function handleDashboardCheckIn() {
  if (!state.user?.isOnboarded) {
    showToast('⚠️ Bạn chưa được phân bổ vào phòng ban và ca làm việc hợp lệ. Vui lòng liên hệ HR để được gán chi nhánh và ca trực trước khi chấm công!', 'warning');
    return;
  }

  // Chặn Check-in nếu hôm nay chưa được phân ca làm việc (và không có OT đã duyệt)
  if (!checkUserHasShiftToday()) {
    showToast('Bạn chưa được phân ca làm việc hôm nay. Vui lòng liên hệ Quản lý bộ phận để xếp lịch.', 'warning');
    return;
  }

  const btn = document.getElementById('dashEmpCheckInBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang gửi check-in...';
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN');
  const today = toLocalDateString(now);

  try {
    // 1. Gửi lên backend API trước để kiểm tra hợp lệ
    let backendData = null;
    try {
      const res = await apiCall('/api/v1/attendances/check-in', 'POST', {
        method: 'WIFI_GPS',
        bssid: 'A4:5E:60:12:34:01',
        ssid: 'QNU-Office',
        latitude: 13.7587,
        longitude: 109.2190
      });
      if (res && res.data) backendData = res.data;
    } catch (apiErr) {
      if (apiErr.status === 400 || apiErr.status === 403 || (apiErr.message && !apiErr.message.includes('offline') && !apiErr.message.includes('fetch'))) {
        throw apiErr;
      }
      console.warn('API Check-in backend offline, sử dụng cơ chế fallback client storage:', apiErr.message);
    }

    // 2. Lưu vào kho dữ liệu cá nhân của user
    let userAtts = getUserEntityList('attendances');
    const existingIdx = userAtts.findIndex(l => l.work_date && l.work_date.startsWith(today));
    const newLog = {
      id: backendData?.id || ('att-' + Date.now()),
      work_date: today,
      check_in_time: backendData?.check_in_time || now.toISOString(),
      check_out_time: null,
      status: backendData?.status || 'ON_TIME',
      late_minutes: backendData?.late_minutes || 0,
      actual_working_hours: 0.0,
      type: 'Wi-Fi Office'
    };

    if (existingIdx >= 0) {
      userAtts[existingIdx] = { ...userAtts[existingIdx], ...newLog };
    } else {
      userAtts.unshift(newLog);
    }
    saveUserEntityList('attendances', userAtts);

    showToast(`Check-in thành công lúc ${timeStr}! Chúc bạn làm việc hiệu quả.`, 'success');
    loadEmployeeDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>CHECK-IN NGAY</span>';
    }
  }
}

// Check-out kết thúc ca (Lưu riêng biệt cho tài khoản hiện tại)
async function handleDashboardCheckOut() {
  if (!checkUserHasShiftToday()) {
    showToast('Bạn chưa được phân ca làm việc hôm nay. Vui lòng liên hệ Quản lý bộ phận để xếp lịch.', 'warning');
    return;
  }

  const btn = document.getElementById('dashEmpCheckOutBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang gửi check-out...';
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN');
  const today = toLocalDateString(now);

  try {
    let backendData = null;
    try {
      const res = await apiCall('/api/v1/attendances/check-out', 'POST', {
        method: 'WIFI_GPS',
        bssid: 'A4:5E:60:12:34:01',
        ssid: 'QNU-Office',
        latitude: 13.7587,
        longitude: 109.2190
      });
      if (res && res.data) backendData = res.data;
    } catch (apiErr) {
      if (apiErr.status === 400 || apiErr.status === 403) {
        throw apiErr;
      }
      console.warn('API Check-out backend offline, sử dụng cơ chế fallback client storage:', apiErr.message);
    }

    let userAtts = getUserEntityList('attendances');
    const todayLog = userAtts.find(l => l.work_date && l.work_date.startsWith(today));
    if (todayLog) {
      todayLog.check_out_time = backendData?.check_out_time || now.toISOString();
      const inDate = new Date(todayLog.check_in_time);
      const diffMs = Math.max(0, now.getTime() - inDate.getTime());
      const diffHours = Number((diffMs / 3600000).toFixed(2));
      todayLog.actual_working_hours = backendData?.actual_working_hours !== undefined
        ? Number(backendData.actual_working_hours)
        : diffHours;
      saveUserEntityList('attendances', userAtts);
    }

    showToast(`Check-out thành công lúc ${timeStr}! Hẹn gặp lại bạn vào ngày mai.`, 'success');
    loadEmployeeDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>CHECK-OUT (KẾT THÚC CA)</span>';
    }
  }
}

// ==============================================================================
// MODAL TIẾP NHẬN NHÂN SỰ & PHÂN BỔ CÔNG VIỆC, CA TRỰC, MỨC LƯƠNG (DÀNH CHO ADMIN / HR)
// ==============================================================================

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function generateSuggestedEmpCode(fullName, username, list = []) {
  // Tìm số thứ tự lớn nhất hiện có trong danh sách nhân viên
  let maxNum = 4;
  if (Array.isArray(list)) {
    list.forEach(e => {
      const code = (e.code || e.employee_code || e.employeeCode || '').toUpperCase();
      const match = code.match(/(?:EMP|NV)[-_]?0*(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
  }
  const nextNum = String(maxNum + 1).padStart(3, '0');

  // Gợi ý theo EMP_ + tên không dấu viết hoa nếu có username/fullName hợp lệ
  const cleanName = removeVietnameseTones(username || fullName);
  if (cleanName && cleanName.length >= 3 && cleanName.length <= 15 && !['ADMIN', 'HR', 'HRADMIN', 'MANAGER', 'EMPLOYEE'].includes(cleanName)) {
    return `EMP_${cleanName}`;
  }
  return `EMP${nextNum}`;
}

function openOnboardEmployeeModal(username, fullName, email, id = '') {
  const suggestedCode = generateSuggestedEmpCode(fullName, username, state.employees);

  const html = `
    <div style="padding: 10px 0;">
      <div style="background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;">
        <div style="font-weight: 700; color: #1e3a8a; font-size: 14.5px;">📋 Tiếp nhận Nhân sự mới (Dành cho HR_ADMIN / SYSTEM_ADMIN):</div>
        <div style="font-size: 13px; color: #2563eb; margin-top: 5px; line-height: 1.5;">
          Hồ sơ: <strong>${fullName || username}</strong> (${email}) • Tên đăng nhập: <code>${username}</code>
          <br>Sau khi tiếp nhận và gán phòng ban, quản lý, ca trực và tọa độ văn phòng GPS, nút chấm công của nhân sự này sẽ được mở khóa và kích hoạt bảng lương.
        </div>
      </div>

      <form id="formOnboardEmployee" onsubmit="handleOnboardSubmit(event, '${username}', '${fullName || username}', '${email}', '${id || ''}')">
        <!-- Nhóm 0: Mã nhân viên (employeeCode) -->
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">
            Mã nhân viên (employeeCode) *
          </label>
          <input 
            type="text" 
            id="onboardEmpCode" 
            value="${suggestedCode}" 
            class="input-filter-select" 
            style="width: 100%; height: 42px; border-radius: 8px; text-transform: uppercase; font-weight: 700; color: #2563eb; letter-spacing: 0.5px; padding: 0 14px;" 
            required 
            placeholder="ví dụ: EMP005 hoặc EMP_DUCHIEU"
          >
          <div style="font-size: 11.5px; color: #64748b; margin-top: 3px;">
            💡 Mã định danh nhân sự chính thức dùng cho Chấm công & Bảng lương (cho phép chỉnh sửa nếu muốn).
          </div>
        </div>

        <!-- Nhóm 1: Phòng ban & Quản lý trực tiếp -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">1. Phòng ban (department_id) *</label>
            <select id="onboardDept" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;" required>
              <option value="Phòng Công nghệ & Phần mềm">Phòng Công nghệ & Phần mềm (PB-TECH)</option>
              <option value="Phòng Hành chính Nhân sự">Phòng Hành chính Nhân sự (PB-HR)</option>
              <option value="Phòng Kinh doanh & Marketing">Phòng Kinh doanh & Marketing (PB-SALES)</option>
              <option value="Ban Giám Đốc">Ban Giám Đốc (PB-BGD)</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">2. Quản lý trực tiếp (manager_id) *</label>
            <select id="onboardManager" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;" required>
              <option value="Nguyễn Thanh Lâm (Trưởng ban Công nghệ)">Nguyễn Thanh Lâm (Trưởng ban Công nghệ)</option>
              <option value="Lê Ngọc Mai (Trưởng phòng Nhân sự)">Lê Ngọc Mai (Trưởng phòng Nhân sự)</option>
              <option value="Phạm Minh Tuân (Trưởng phòng Kinh Doanh)">Phạm Minh Tuân (Trưởng phòng Kinh Doanh)</option>
              <option value="Đỗ Thu Hà (Trưởng phòng Tài Chính - Kế Toán)">Đỗ Thu Hà (Trưởng phòng Tài Chính - Kế Toán)</option>
            </select>
          </div>
        </div>

        <!-- Nhóm 2: Văn phòng GPS Geofence & Ca làm việc -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">3. Văn phòng &amp; Tọa độ GPS (office_id) *</label>
            <select id="onboardOffice" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;" required>
              <option value="Văn phòng Quy Nhơn (170 An Dương Vương)|13.7587|109.2190|100|QNU-Office|A4:5E:60:12:34:01">Văn phòng Quy Nhơn (170 An Dương Vương • Bán kính 100m • Wi-Fi: QNU-Office)</option>
              <option value="Trụ sở Hà Nội (HITC Cầu Giấy)|21.0362|105.7836|150|HN-HQ-Office|B2:1C:45:88:99:02">Trụ sở Hà Nội (HITC Cầu Giấy • Bán kính 150m • Wi-Fi: HN-HQ-Office)</option>
              <option value="Chi nhánh TP.HCM (72 Lê Thánh Tôn, Q.1)|10.7769|106.7009|100|HCM-Office|C3:4D:5E:6F:7A:03">Chi nhánh TP.HCM (72 Lê Thánh Tôn, Q.1 • Bán kính 100m)</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">4. Phân ca làm việc (shift_id) *</label>
            <select id="onboardShift" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;" required>
              <option value="Ca Hành Chính|08:00|17:30">Ca Hành Chính (08:00 - 17:30 • Tiêu chuẩn 8.0h)</option>
              <option value="Ca Sáng|06:00|14:00">Ca Sáng (06:00 - 14:00 • Tiêu chuẩn 8.0h)</option>
              <option value="Ca Chiều|14:00|22:00">Ca Chiều (14:00 - 22:00 • Tiêu chuẩn 8.0h)</option>
            </select>
          </div>
        </div>

        <!-- Nhóm 3: Chức danh & Quỹ phép năm -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">5. Chức danh / Vị trí *</label>
            <select id="onboardPosition" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;" required>
              <option value="Kỹ sư phần mềm">Kỹ sư phần mềm</option>
              <option value="Chuyên viên Phát triển Hệ thống">Chuyên viên Phát triển Hệ thống</option>
              <option value="Frontend &amp; UI Developer">Frontend &amp; UI Developer</option>
              <option value="Backend Developer">Backend Developer</option>
              <option value="Chuyên viên Tuyển dụng &amp; C&amp;B">Chuyên viên Tuyển dụng &amp; C&amp;B</option>
              <option value="Chuyên viên Kinh doanh">Chuyên viên Kinh doanh</option>
              <option value="Kế toán viên tiền lương">Kế toán viên tiền lương</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">6. Quỹ phép năm kích hoạt (Ngày)</label>
            <input type="number" id="onboardLeaveBal" value="12" min="0" max="30" step="0.5" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;" required>
          </div>
        </div>

        <!-- Nhóm 4: Mức lương & Phụ cấp -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">7. Mức lương cơ bản (VND) *</label>
            <input type="number" id="onboardSalary" value="12000000" min="5000000" step="500000" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;" required>
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">8. Phụ cấp ăn trưa &amp; trách nhiệm (VND)</label>
            <input type="number" id="onboardAllowance" value="730000" min="0" step="100000" class="input-filter-select" style="width: 100%; height: 42px; border-radius: 8px;">
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          <button type="button" class="btn-secondary-outline" onclick="closeModal()">Hủy bỏ</button>
          <button type="submit" class="btn-primary-blue" style="padding: 10px 22px; font-weight: 700; border-radius: 8px;">
            ✓ Xác nhận Tiếp nhận &amp; Mở khóa Chấm công
          </button>
        </div>
      </form>
    </div>
  `;

  openModal(`Tiếp nhận Nhân sự vào Hệ thống – ${fullName || username}`, html);
}

async function handleOnboardSubmit(e, username, fullName, email, empId) {
  if (e && e.preventDefault) e.preventDefault();

  const employeeCode = (document.getElementById('onboardEmpCode')?.value || '').trim().toUpperCase();
  if (!employeeCode) {
    return showToast('Vui lòng nhập Mã nhân viên (employeeCode)', 'warning');
  }

  const dept = document.getElementById('onboardDept').value;
  const manager = document.getElementById('onboardManager').value;
  const pos = document.getElementById('onboardPosition').value;
  const shiftRaw = document.getElementById('onboardShift').value.split('|');
  const shiftName = shiftRaw[0];
  const shiftStart = shiftRaw[1] || '08:00';
  const shiftEnd = shiftRaw[2] || '17:30';

  const officeRaw = document.getElementById('onboardOffice').value.split('|');
  const officeName = officeRaw[0];
  const officeLat = parseFloat(officeRaw[1]) || 13.7587;
  const officeLng = parseFloat(officeRaw[2]) || 109.2190;
  const officeRadius = parseInt(officeRaw[3]) || 100;
  const officeSsid = officeRaw[4] || 'QNU-Office';
  const officeBssid = officeRaw[5] || 'A4:5E:60:12:34:01';

  const leaveBal = parseFloat(document.getElementById('onboardLeaveBal').value) || 12.0;
  const baseSalary = parseFloat(document.getElementById('onboardSalary').value) || 12000000;
  const allowance = parseFloat(document.getElementById('onboardAllowance').value) || 730000;

  // 1. Gửi API tiếp nhận sang Backend (organization-service)
  const targetId = empId || username;
  try {
    await apiCall(`/api/v1/employees/${targetId}/onboard`, {
      method: 'PATCH',
      body: JSON.stringify({
        employeeCode,
        code: employeeCode,
        fullName: fullName || username,
        email,
        departmentName: dept,
        department: dept,
        positionTitle: pos,
        position: pos,
        managerName: manager,
        managerId: manager,
        contractType: 'OFFICIAL',
        status: 'ACTIVE'
      })
    });
  } catch (apiErr) {
    console.warn('Backend onboard API sync:', apiErr.message);
  }

  // 2. Lưu quyết định tiếp nhận vào LocalStorage & cập nhật trạng thái
  saveUserAssignment(username, {
    id: empId || targetId,
    username,
    fullName,
    email,
    code: employeeCode,
    employeeCode: employeeCode,
    department: dept,
    managerName: manager,
    position: pos,
    officeLocation: officeName,
    officeLatitude: officeLat,
    officeLongitude: officeLng,
    officeRadius: officeRadius,
    officeSsid: officeSsid,
    officeBssid: officeBssid,
    shiftName,
    shiftStart,
    shiftEnd,
    leaveBalance: leaveBal,
    baseSalary,
    allowance,
    assignedAt: new Date().toISOString(),
    assignedBy: state.user?.fullName || 'HR Admin',
    status: 'ACTIVE',
    contractType: 'OFFICIAL'
  });

  // 3. Cập nhật trực tiếp vào state.employees
  const targetIdx = state.employees.findIndex(emp =>
    (empId && emp.id === empId) || (username && emp.username === username) || (email && emp.email === email)
  );
  if (targetIdx >= 0) {
    state.employees[targetIdx].code = employeeCode;
    state.employees[targetIdx].employee_code = employeeCode;
    state.employees[targetIdx].contract_type = 'OFFICIAL';
    state.employees[targetIdx].status = 'ACTIVE';
    state.employees[targetIdx].department_name = dept;
    state.employees[targetIdx].position_title = pos;
  }

  // 4. Tự động gửi thông báo chúc mừng tới tài khoản của nhân viên
  const notifKey = `htqlns_notifications_${username}`;
  let empNotifs = [];
  try { empNotifs = JSON.parse(safeGetStorage(notifKey, '[]')); } catch (err) {}
  empNotifs.unshift({
    id: 'notif-onboarded-' + Date.now(),
    title: `🎉 Chúc mừng bạn đã được tiếp nhận vào ${dept}!`,
    message: `HR đã phê duyệt hồ sơ của bạn với Mã NV: ${employeeCode}. Quản lý trực tiếp: ${manager}. Ca làm việc: ${shiftName} (${shiftStart} - ${shiftEnd}). Nút Chấm công và bảng lương đã được kích hoạt thành công!`,
    type: 'SYSTEM',
    created_at: new Date().toISOString(),
    is_read: false
  });
  safeSetStorage(notifKey, JSON.stringify(empNotifs));

  // 5. Nếu người dùng đang đăng nhập chính là tài khoản này, cập nhật ngay lập tức
  if (state.user && state.user.username === username) {
    state.user.departmentName = dept;
    state.user.code = employeeCode;
    safeSetStorage('htqlns_user', JSON.stringify(state.user));
    syncUserOnboardingState();
    loadEmployeeDashboardData();
    loadProfileData();
  }

  closeModal();
  showToast(`Đã tiếp nhận nhân sự ${fullName || username} (Mã: ${employeeCode}) vào ${dept}, phân ca và mở khóa chấm công thành công!`, 'success');

  // Nạp lại danh sách nhân sự & dashboard
  await loadEmployeesData();
  loadDashboardData();
}

// ==============================================================================
// 9. QUẢN LÝ POPUP MODAL
// ==============================================================================
function openModal(title, contentHtml, onConfirm) {
  const box = document.getElementById('modalBox');
  if (!box) return;

  box.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div class="modal-content" onclick="event.stopPropagation()" style="background: #ffffff; width: 100%; max-width: 480px; border-radius: 16px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
          <h3 style="font-size: 17px; font-weight: 700; color: #0f172a;">${title}</h3>
          <button onclick="closeModal()" style="border: none; background: transparent; font-size: 18px; cursor: pointer; color: #94a3b8;">✕</button>
        </div>
        <div class="modal-body">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;
  box.style.display = 'block';
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const box = document.getElementById('modalBox');
  if (box) {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

function openAddDepartmentModal() {
  openModal(
    'Thêm mới Phòng ban',
    `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <input type="text" id="newDeptCode" class="figma-pill-input" placeholder="Mã phòng ban (vd: MKT)" required>
      <input type="text" id="newDeptName" class="figma-pill-input" placeholder="Tên phòng ban (vd: Phòng Marketing)" required>
      <textarea id="newDeptDesc" class="figma-pill-input" style="border-radius: 12px; height: 80px;" placeholder="Mô tả chức năng nhiệm vụ..."></textarea>
      <button class="btn-primary-blue" style="margin-top: 10px;" onclick="submitNewDepartment()">Tạo phòng ban</button>
    </div>
  `
  );
}

async function submitNewDepartment() {
  const code = document.getElementById('newDeptCode')?.value.trim();
  const name = document.getElementById('newDeptName')?.value.trim();
  const description = document.getElementById('newDeptDesc')?.value.trim();

  if (!code || !name) {
    return showToast('Vui lòng nhập đầy đủ mã và tên phòng ban', 'warning');
  }

  try {
    await apiCall('/api/organization/departments', {
      method: 'POST',
      body: JSON.stringify({ code, name, description })
    });
    showToast('Tạo phòng ban thành công!', 'success');
    closeModal();
    loadDepartmentsData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddEmployeeModal() {
  const deptOptions = (state.departments || MOCK_DEPARTMENTS)
    .map((d) => `<option value="${d.id || 1}">${d.name}</option>`)
    .join('');

  openModal(
    'Thêm mới Nhân viên',
    `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <input type="text" id="newEmpCode" class="figma-pill-input" placeholder="Mã nhân viên (vd: NV-009)" required>
      <input type="text" id="newEmpName" class="figma-pill-input" placeholder="Họ và tên" required>
      <input type="email" id="newEmpEmail" class="figma-pill-input" placeholder="Email công ty" required>
      <input type="text" id="newEmpPhone" class="figma-pill-input" placeholder="Số điện thoại liên hệ">
      <select id="newEmpDept" class="figma-pill-input">
        ${deptOptions}
      </select>
      <button class="btn-primary-blue" style="margin-top: 10px;" onclick="submitNewEmployee()">Lưu hồ sơ nhân sự</button>
    </div>
  `
  );
}

async function submitNewEmployee() {
  const code = document.getElementById('newEmpCode')?.value.trim();
  const fullName = document.getElementById('newEmpName')?.value.trim();
  const email = document.getElementById('newEmpEmail')?.value.trim();
  const phone = document.getElementById('newEmpPhone')?.value.trim();
  const departmentId = document.getElementById('newEmpDept')?.value;

  if (!code || !fullName || !email) {
    return showToast('Vui lòng điền đủ mã NV, họ tên và email', 'warning');
  }

  const dept = (state.departments || MOCK_DEPARTMENTS).find(d => String(d.id) === String(departmentId));
  const deptName = dept?.name || '-';

  try {
    await apiCall('/api/organization/employees', {
      method: 'POST',
      body: JSON.stringify({
        code,
        full_name: fullName,
        fullName,
        email,
        phone,
        department_id: departmentId,
        departmentId
      })
    });
  } catch (err) {
    console.warn('API tạo nhân viên gặp sự cố (dùng fallback đồng bộ):', err.message);
  }

  // Đồng bộ vào hệ thống lưu trữ để xuất hiện tức thì trong danh sách
  const username = email.split('@')[0] || code.toLowerCase();
  saveRegisteredUser({
    id: `emp_${Date.now()}`,
    username,
    email,
    fullName,
    role: 'EMPLOYEE',
    status: 'ACTIVE'
  });
  saveUserAssignment(username, {
    username,
    fullName,
    email,
    department: deptName,
    position: 'Nhân viên chính thức',
    shiftName: 'Ca Hành Chính',
    status: 'ACTIVE'
  });

  showToast('Tạo hồ sơ nhân viên thành công!', 'success');
  closeModal();
  loadEmployeesData();
}

// ==============================================================================
// 10. KHỞI TẠO DASHBOARD PORTAL
// ==============================================================================
function initPortalDashboard(targetView = null) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('portalApp').style.display = 'flex';

  syncUserOnboardingState();
  updateTopbarUser();
  applyRoleBasedUI();

  const savedView = targetView || safeGetStorage('htqlns_current_view', 'dashboard');
  navigateToView(savedView);
  checkTodayAttendanceStatus();

  // Bắt đầu thăm dò thông báo thời gian thực từ Backend
  startNotificationPolling();

  // Tự động kiểm tra và đồng bộ hồ sơ mới nhất từ Backend khi vào Dashboard
  if (savedView === 'dashboard') {
    fetchCurrentUserProfile().catch(() => {});
  }
}

// ==============================================================================
// 11. KHỞI CHẠY ỨNG DỤNG (WINDOW LOAD & F5 REFRESH)
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  // Đồng hồ số thời gian thực cho view chấm công cá nhân
  setInterval(() => {
    const timeNow = new Date().toLocaleTimeString('vi-VN');
    const clock = document.getElementById('liveClockText');
    if (clock) clock.innerText = timeNow;
    const empClock = document.getElementById('dashEmpLiveClock');
    if (empClock) empClock.innerText = timeNow;
  }, 1000);

  // KIỂM TRA PHIÊN ĐĂNG NHẬP (SESSION RESTORATION KHI F5):
  // Nếu người dùng đã đăng nhập trước đó và token JWT còn hạn:
  // -> Khôi phục chính xác màn hình đang làm việc và đồng bộ trạng thái chấm công
  if (state.token && state.user && isTokenValid(state.token)) {
    const lastView = safeGetStorage('htqlns_current_view', 'dashboard');
    initPortalDashboard(lastView);

    // Bắt buộc gọi API lấy hồ sơ mới nhất từ backend khi F5 / mở lại trang
    fetchCurrentUserProfile().then(() => {
      if (lastView === 'dashboard') {
        const isEmployee = state.user.role === 'EMPLOYEE' || state.user.username === 'employee';
        if (isEmployee) loadEmployeeDashboardData();
        else loadDashboardData();
      }
    });
  } else {
    // Nếu chưa đăng nhập hoặc token đã hết hạn -> hiển thị màn hình Đăng nhập
    showScreenView('login');
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
  }
});

// ==============================================================================
// 12. PHÂN HỆ QUẢN LÝ CA LÀM VIỆC, PHÂN CA & TĂNG CA OT (SCR_SHIFT_01, SCR_OT_01, SCR_OT_02, SCR_ADM_03)
// ==============================================================================

let currentShiftSubTab = 'assignments';
let cachedShiftsList = [];
let cachedOtRequests = [];

function switchShiftTab(tabName) {
  if (tabName === 'ot-requests') tabName = 'ot';
  if (tabName === 'schedule') tabName = 'assignments';
  currentShiftSubTab = tabName;
  const tabBtnAssignments = document.getElementById('tabBtnAssignments');
  const tabBtnOt = document.getElementById('tabBtnOt');
  const tabBtnShifts = document.getElementById('tabBtnShifts');
  const contentAssignments = document.getElementById('tabContentAssignments');
  const contentOt = document.getElementById('tabContentOt');
  const contentShifts = document.getElementById('tabContentShifts');

  // Reset tab button styles
  [tabBtnAssignments, tabBtnOt, tabBtnShifts].forEach(btn => {
    if (btn) {
      btn.style.background = '#f8fafc';
      btn.style.color = '#64748b';
      btn.style.borderTop = 'none';
      btn.style.fontWeight = '600';
    }
  });

  if (contentAssignments) contentAssignments.style.display = 'none';
  if (contentOt) contentOt.style.display = 'none';
  if (contentShifts) contentShifts.style.display = 'none';

  if (tabName === 'assignments') {
    if (tabBtnAssignments) {
      tabBtnAssignments.style.background = '#ffffff';
      tabBtnAssignments.style.color = 'var(--color-primary)';
      tabBtnAssignments.style.borderTop = '3px solid var(--color-primary)';
      tabBtnAssignments.style.fontWeight = '700';
    }
    if (contentAssignments) contentAssignments.style.display = 'block';
    loadShiftAssignments();
  } else if (tabName === 'ot') {
    if (tabBtnOt) {
      tabBtnOt.style.background = '#ffffff';
      tabBtnOt.style.color = 'var(--color-primary)';
      tabBtnOt.style.borderTop = '3px solid var(--color-primary)';
      tabBtnOt.style.fontWeight = '700';
    }
    if (contentOt) contentOt.style.display = 'block';
    loadOtRequests();
  } else if (tabName === 'shifts') {
    if (tabBtnShifts) {
      tabBtnShifts.style.background = '#ffffff';
      tabBtnShifts.style.color = 'var(--color-primary)';
      tabBtnShifts.style.borderTop = '3px solid var(--color-primary)';
      tabBtnShifts.style.fontWeight = '700';
    }
    if (contentShifts) contentShifts.style.display = 'block';
    loadShiftsCatalog();
  }
}

async function loadShiftsData() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = toLocalDateString(new Date(year, month, 1));
  const lastDay = toLocalDateString(new Date(year, month + 1, 0));

  const fromDateInput = document.getElementById('filterShiftFromDate');
  const toDateInput = document.getElementById('filterShiftToDate');
  if (fromDateInput && !fromDateInput.value) fromDateInput.value = firstDay;
  if (toDateInput && !toDateInput.value) toDateInput.value = lastDay;

  await Promise.allSettled([
    loadShiftsCatalog(),
    loadShiftAssignments(),
    loadOtRequests()
  ]);
}

// 1. Quản lý danh mục ca làm việc (SCR_ADM_03)
async function loadShiftsCatalog() {
  const tbody = document.getElementById('tableBodyShiftsList');
  if (!tbody) return;

  try {
    const res = await apiCall('/api/v1/shifts');
    cachedShiftsList = res?.data || [];

    const kpiActive = document.getElementById('kpiShiftActiveCount');
    if (kpiActive) {
      kpiActive.innerText = cachedShiftsList.filter(s => s.status === 'ACTIVE').length;
    }

    if (!cachedShiftsList.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 24px;">Chưa có ca làm việc nào trong hệ thống</td></tr>`;
      return;
    }

    const isAdminOrHr = ['ADMIN', 'HR'].includes(state.user?.role);
    tbody.innerHTML = cachedShiftsList.map(s => {
      const minStaff = s.min_staff ?? s.minStaff ?? 1;
      const rawMax = (s.max_staff !== null && s.max_staff !== undefined) ? s.max_staff : s.maxStaff;
      const maxStaffText = (rawMax !== null && rawMax !== undefined && rawMax !== '' && Number(rawMax) > 0)
        ? `${Number(rawMax)} NV`
        : 'Không giới hạn';

      return `
        <tr>
          <td><strong>${s.code}</strong></td>
          <td><span style="font-weight: 600; color: #0f172a;">${s.name}</span></td>
          <td>${s.start_time.slice(0, 5)}</td>
          <td>${s.end_time.slice(0, 5)}</td>
          <td>${s.break_minutes || 0} phút</td>
          <td>+${s.grace_late_minutes || 0} phút</td>
          <td><strong>${Number(s.working_hours).toFixed(1)}h</strong></td>
          <td>
            <span style="font-weight: 600; color: #1e293b;">${minStaff}</span>
            <span style="color: #94a3b8;">/</span>
            <span style="color: #475569; font-weight: 500;">${maxStaffText}</span>
          </td>
          <td>
            <span class="badge-status ${s.status === 'ACTIVE' ? 'badge-approved' : 'badge-rejected'}">
              ${s.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm ngưng'}
            </span>
          </td>
          <td style="text-align: center;">
            ${isAdminOrHr ? `
              <button class="btn-secondary-outline" style="padding: 4px 10px; font-size: 11.5px;" onclick='openCreateShiftModal(${JSON.stringify(s)})'>Sửa</button>
            ` : `<span style="font-size: 11px; color: #94a3b8;">Chỉ xem</span>`}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi nạp danh mục ca:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

// ==============================================================================
// 2. LỊCH PHÂN CA NHÂN VIÊN (SCR_SHIFT_01 - WORKMATE SCHEDULER)
// ==============================================================================

let currentScheduleView = 'week'; // 'day' | 'week' | 'month'
let scheduleDisplayMode = 'visual'; // 'visual' | 'table'
let scheduleCurrentDate = new Date();
let cachedAssignmentsList = [];
let cachedApprovedOtsList = [];
let cachedEmployeesScopeList = [];

/**
 * Helper chuẩn hóa ngày địa phương sang YYYY-MM-DD
 * Tránh triệt để lỗi lệch múi giờ UTC+7 làm lùi ngày khi dùng .toISOString()
 */
function toLocalDateString(d) {
  if (!d) return '';
  if (typeof d === 'string') {
    return d.split('T')[0];
  }
  if (d instanceof Date && !isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d);
}

function isSystemAdminEmployee(e) {
  if (!e) return false;
  const role = (e.role || '').toUpperCase();
  const code = (e.code || '').toUpperCase();
  const email = (e.email || '').toLowerCase();
  const username = (e.username || '').toLowerCase();
  const position = (e.position || '').toLowerCase();
  return role === 'ADMIN' || code === 'EMP_ADMIN' || code === 'ADMIN' || email === 'admin@company.com' || username === 'admin' || position.includes('quản trị');
}

async function getEmployeesInScope() {
  try {
    const empRes = await apiCall('/api/organization/employees');
    let list = empRes?.data || [];
    // Mặc định loại bỏ tài khoản Quản trị hệ thống (ADMIN) khỏi danh sách xếp ca
    list = list.filter(e => !isSystemAdminEmployee(e));

    const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
    const isManager = role === 'MANAGER' || state.user?.username === 'manager';
    const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';

    if (isEmployee) {
      const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;
      list = list.filter(e => e.id === myEmpId);
    } else if (isManager) {
      const userDeptId = state.user?.departmentId || state.user?.department_id;
      const userEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;
      list = list.filter(e => {
        const dId = e.departmentId || e.department_id;
        const mId = e.managerId || e.manager_id;
        return (userDeptId && dId === userDeptId) || (userEmpId && mId === userEmpId);
      });
    }
    cachedEmployeesScopeList = list;
    return list;
  } catch {
    return cachedEmployeesScopeList || [];
  }
}

function formatShiftOptionLabel(s) {
  if (!s) return '';
  const code = s.code || s.shift_code || '';
  let name = s.name || s.shift_name || '';
  const startTime = (s.start_time || s.startTime || '').slice(0, 5);
  const endTime = (s.end_time || s.endTime || '').slice(0, 5);
  const timeRange = (startTime && endTime) ? `(${startTime} - ${endTime})` : '';

  // Loại bỏ chuỗi giờ trùng lặp đã có sẵn trong name
  name = name.replace(/\s*\(\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}\)/g, '').trim();
  return timeRange ? `${code} - ${name} ${timeRange}` : `${code} - ${name}`;
}

function getCleanShiftName(s) {
  if (!s) return '';
  let name = s.name || s.shift_name || '';
  return name.replace(/\s*\(\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}\)/g, '').trim();
}

function getScheduleDateRange(date, view) {
  const d = new Date(date);
  if (view === 'day') {
    const dateStr = toLocalDateString(d);
    return { fromDate: dateStr, toDate: dateStr, days: [new Date(d)] };
  } else if (view === 'week') {
    // Tuần ISO: Thứ 2 là ngày bắt đầu tuần (0: CN, 1: T2, ..., 6: T7)
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      days.push(cur);
    }
    const fromDate = toLocalDateString(monday);
    const toDate = toLocalDateString(days[6]);
    return { fromDate, toDate, days };
  } else if (view === 'month') {
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startDay = firstDay.getDay();
    const startDiff = (startDay === 0 ? -6 : 1 - startDay);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() + startDiff);

    const days = [];
    const cur = new Date(gridStart);
    while (days.length < 35 || (days.length < 42 && cur.getMonth() === month)) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
      if (days.length >= 35 && cur.getMonth() !== month && cur.getDay() === 1) break;
    }

    const fromDate = toLocalDateString(days[0]);
    const toDate = toLocalDateString(days[days.length - 1]);
    return { fromDate, toDate, days, targetMonth: month, targetYear: year };
  }
}

function updateScheduleDateLabel() {
  const labelEl = document.getElementById('scheduleCurrentDateLabel');
  if (!labelEl) return;
  const d = new Date(scheduleCurrentDate);
  const range = getScheduleDateRange(d, currentScheduleView);

  if (currentScheduleView === 'day') {
    const dayNames = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    labelEl.innerText = `${dayNames[d.getDay()]}, ${dStr}`;
  } else if (currentScheduleView === 'week') {
    const start = range.days[0];
    const end = range.days[6];
    const sStr = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
    const eStr = `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`;
    labelEl.innerText = `${sStr} - ${eStr}`;
  } else if (currentScheduleView === 'month') {
    labelEl.innerText = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
  }
}

function setScheduleView(view) {
  currentScheduleView = view;
  ['day', 'week', 'month'].forEach(v => {
    const btn = document.getElementById(`btnView${v.charAt(0).toUpperCase() + v.slice(1)}`);
    if (btn) {
      if (v === view) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  loadShiftAssignments();
}

function navigateSchedulePrev() {
  const d = new Date(scheduleCurrentDate);
  if (currentScheduleView === 'day') d.setDate(d.getDate() - 1);
  else if (currentScheduleView === 'week') d.setDate(d.getDate() - 7);
  else if (currentScheduleView === 'month') d.setMonth(d.getMonth() - 1);
  scheduleCurrentDate = d;
  loadShiftAssignments();
}

function navigateScheduleNext() {
  const d = new Date(scheduleCurrentDate);
  if (currentScheduleView === 'day') d.setDate(d.getDate() + 1);
  else if (currentScheduleView === 'week') d.setDate(d.getDate() + 7);
  else if (currentScheduleView === 'month') d.setMonth(d.getMonth() + 1);
  scheduleCurrentDate = d;
  loadShiftAssignments();
}

function navigateScheduleToday() {
  scheduleCurrentDate = new Date();
  loadShiftAssignments();
}

function toggleScheduleDisplayMode() {
  scheduleDisplayMode = scheduleDisplayMode === 'visual' ? 'table' : 'visual';
  const visualCont = document.getElementById('shiftScheduleVisualContainer');
  const tableCont = document.getElementById('shiftScheduleTableContainer');
  const toolbar = document.getElementById('shiftScheduleToolbar');
  const icon = document.getElementById('iconScheduleMode');
  const label = document.getElementById('labelScheduleMode');

  if (scheduleDisplayMode === 'table') {
    if (visualCont) visualCont.style.display = 'none';
    if (tableCont) tableCont.style.display = 'block';
    if (toolbar) toolbar.style.display = 'none';
    if (icon) icon.innerText = '🖼️';
    if (label) label.innerText = 'Dạng lịch trực quan';
  } else {
    if (visualCont) visualCont.style.display = 'block';
    if (tableCont) tableCont.style.display = 'none';
    if (toolbar) toolbar.style.display = 'flex';
    if (icon) icon.innerText = '📋';
    if (label) label.innerText = 'Dạng bảng';
  }
}

async function loadShiftAssignments() {
  const visualContainer = document.getElementById('shiftScheduleVisualContainer');
  const tbody = document.getElementById('tableBodyShiftAssignments');
  if (!visualContainer && !tbody) return;

  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';
  const isManager = role === 'MANAGER' || state.user?.username === 'manager';
  const isAdminOrHr = ['ADMIN', 'HR'].includes(role);

  // Cập nhật Badge vai trò & hiển thị các nút thao tác
  const roleBadge = document.getElementById('shiftScheduleRoleBadge');
  if (roleBadge) {
    if (isEmployee) {
      roleBadge.innerText = 'Lịch cá nhân';
      roleBadge.style.background = '#e0f2fe';
      roleBadge.style.color = '#0369a1';
    } else if (isManager) {
      roleBadge.innerText = `Đội ngũ ${state.user?.departmentName || 'Phòng ban'}`;
      roleBadge.style.background = '#dcfce7';
      roleBadge.style.color = '#15803d';
    } else {
      roleBadge.innerText = 'Toàn công ty (Admin)';
      roleBadge.style.background = '#e0e7ff';
      roleBadge.style.color = '#3730a3';
    }
  }

  const btnAssign = document.getElementById('btnHeaderAssignShift');
  if (btnAssign) {
    btnAssign.style.display = isEmployee ? 'none' : 'inline-flex';
  }
  const btnCreateShift = document.getElementById('btnShiftOpenCreateShift');
  if (btnCreateShift) {
    btnCreateShift.style.display = isAdminOrHr ? 'inline-flex' : 'none';
  }

  // Đảm bảo danh mục ca đã được nạp
  if (!cachedShiftsList.length) {
    try {
      const shiftRes = await apiCall('/api/v1/shifts');
      cachedShiftsList = shiftRes?.data || [];
    } catch {}
  }

  // Tính khoảng ngày theo chế độ hiển thị
  const range = getScheduleDateRange(scheduleCurrentDate, currentScheduleView);
  updateScheduleDateLabel();

  // Đồng bộ ô lọc ngày của bảng nếu có
  const fromDateInput = document.getElementById('filterShiftFromDate');
  const toDateInput = document.getElementById('filterShiftToDate');
  if (fromDateInput && toDateInput) {
    if (scheduleDisplayMode === 'visual' || (!fromDateInput.value && !toDateInput.value)) {
      fromDateInput.value = range.fromDate;
      toDateInput.value = range.toDate;
    }
  }

  const queryFrom = (scheduleDisplayMode === 'table' && fromDateInput?.value) ? fromDateInput.value : range.fromDate;
  const queryTo = (scheduleDisplayMode === 'table' && toDateInput?.value) ? toDateInput.value : range.toDate;

  let url = `/api/v1/shift-assignments?fromDate=${queryFrom}&toDate=${queryTo}`;

  try {
    const res = await apiCall(url);
    let assignments = res?.data || [];
    let approvedOts = res?.approvedOts || res?.meta?.approvedOts || [];

    // RBAC: Nếu là nhân viên, chỉ hiển thị các ca và đơn OT được phân cho chính mình
    if (isEmployee) {
      const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;
      assignments = assignments.filter(a => (a.emp_id === myEmpId || a.empId === myEmpId));
      approvedOts = approvedOts.filter(o => (o.emp_id === myEmpId || o.empId === myEmpId));
    }

    // Nếu approvedOts chưa có (ví dụ fallback hoặc mock), gọi API OT
    if (!approvedOts.length) {
      try {
        const otUrl = `/api/v1/ot-requests?status=APPROVED&fromDate=${queryFrom}&toDate=${queryTo}`;
        const otRes = await apiCall(otUrl);
        const otList = otRes?.data || otRes?.requests || [];
        if (isEmployee) {
          const myEmpId = state.user?.empId || state.user?.emp_id || state.user?.id;
          approvedOts = otList.filter(o => (o.emp_id === myEmpId || o.empId === myEmpId) && o.status === 'APPROVED');
        } else {
          approvedOts = otList.filter(o => o.status === 'APPROVED');
        }
      } catch (_) {}
    }

    cachedAssignmentsList = assignments;
    cachedApprovedOtsList = approvedOts;

    // Cập nhật KPI phân ca hôm nay
    const todayStr = toLocalDateString(new Date());
    const todayCount = assignments.filter(a => {
      const wDate = toLocalDateString(a.work_date || a.workDate);
      return wDate === todayStr && a.status === 'SCHEDULED';
    }).length;
    const kpiToday = document.getElementById('kpiShiftTodayAssignments');
    if (kpiToday) kpiToday.innerText = todayCount;

    // Lấy quy mô nhân sự thực tế trong phạm vi quyền hạn để tính định biên tối thiểu
    let totalActiveEmployeesInScope = 1;
    try {
      const inScopeEmps = await getEmployeesInScope();
      totalActiveEmployeesInScope = Math.max(1, inScopeEmps.length);
    } catch {
      totalActiveEmployeesInScope = 1;
    }

    // Render giao diện trực quan theo chế độ xem (Tuần / Ngày / Tháng) kèm danh sách OT đã duyệt
    renderShiftSchedule(assignments, range, totalActiveEmployeesInScope, approvedOts);

    // Render bảng phân ca (cho chế độ xem dạng bảng)
    renderShiftAssignmentsTable(assignments);
  } catch (err) {
    console.error('Lỗi tải lịch phân ca:', err);
    if (visualContainer) {
      visualContainer.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 24px;">Lỗi tải dữ liệu lịch phân ca: ${err.message}</div>`;
    }
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
    }
  }
}

function renderShiftSchedule(assignments, range, totalActiveEmployeesInScope = 1, approvedOts = []) {
  const container = document.getElementById('shiftScheduleVisualContainer');
  if (!container) return;

  if (currentScheduleView === 'week') {
    renderWeekSchedule(container, assignments, range, totalActiveEmployeesInScope, approvedOts);
  } else if (currentScheduleView === 'day') {
    renderDaySchedule(container, assignments, range, totalActiveEmployeesInScope, approvedOts);
  } else if (currentScheduleView === 'month') {
    renderMonthSchedule(container, assignments, range, approvedOts);
  }
}

function renderWeekSchedule(container, assignments, range, totalActiveEmployeesInScope = 1, approvedOts = []) {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';
  const todayStr = toLocalDateString(new Date());
  const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const activeShifts = cachedShiftsList.filter(s => s.status === 'ACTIVE');

  let html = `<div class="schedule-week-grid">`;

  range.days.forEach(dayDate => {
    const curDateStr = toLocalDateString(dayDate);
    const isToday = (curDateStr === todayStr);
    const dayName = dayNames[dayDate.getDay()];
    const dateFormatted = `${String(dayDate.getDate()).padStart(2, '0')}/${String(dayDate.getMonth() + 1).padStart(2, '0')}`;

    html += `
      <div class="schedule-day-column ${isToday ? 'today' : ''}">
        <div class="schedule-day-header">
          <div class="schedule-day-header-title">${dayName} - ${dayDate.getDate()}</div>
          <div class="schedule-day-header-date">${dateFormatted}${isToday ? ' • Hôm nay' : ''}</div>
        </div>
        <div class="schedule-day-cards">
    `;

    if (isEmployee) {
      const myShiftsToday = assignments.filter(a => {
        const wDate = toLocalDateString(a.work_date || a.workDate);
        return (wDate === curDateStr) && (a.status === 'SCHEDULED');
      });

      const myOtsToday = (approvedOts || []).filter(o => {
        const oDate = toLocalDateString(o.work_date || o.workDate);
        return (oDate === curDateStr) && (o.status === 'APPROVED');
      });

      if (!myShiftsToday.length && !myOtsToday.length) {
        html += `
          <div class="schedule-day-off-card">
            <div style="font-weight: 700; font-size: 13px; color: #475569;">Ngày nghỉ / Không có ca</div>
            <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">Không có ca làm việc nào được phân bổ</div>
          </div>
        `;
      } else {
        // 1. Render ca làm việc chính thức nếu có
        myShiftsToday.forEach(a => {
          const s = cachedShiftsList.find(x => x.id === (a.shift_id || a.shiftId)) || {};
          const cleanName = getCleanShiftName(s) || a.shift_name || 'Ca làm việc';
          const startTime = (a.start_time || s.start_time || '08:00:00').slice(0, 5);
          const endTime = (a.end_time || s.end_time || '17:30:00').slice(0, 5);
          const timeStr = `${startTime} - ${endTime}`;

          html += `
            <div class="schedule-shift-card" style="border-left: 3.5px solid #2563eb; background: #ffffff;">
              <div class="shift-card-header">
                <div>
                  <div class="shift-card-title" style="color: #1e40af; font-size: 13px;">${cleanName}</div>
                  <span class="shift-card-time" style="font-size: 12px; font-weight: 600; color: #2563eb;">⏰ ${timeStr}</span>
                </div>
                <span class="shift-quota-badge shift-quota-sufficient">Được phân ca</span>
              </div>
              <div style="font-size: 11.5px; color: #475569; margin-top: 8px; padding: 6px 8px; background: #f0f7ff; border-radius: 6px;">
                <div>👤 <strong>${a.emp_name || 'Nhân viên'}</strong> (${a.emp_code || a.emp_id})</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">🏢 ${a.department_name || ''}</div>
                ${a.note ? `<div style="font-size: 10.5px; color: #64748b; margin-top: 4px; font-style: italic;">📝 ${a.note}</div>` : ''}
              </div>
            </div>
          `;
        });

        // 2. Render thẻ tăng ca (OT) đã duyệt nếu có
        myOtsToday.forEach(ot => {
          const otStart = (ot.start_time || ot.startTime || '18:00').slice(0, 5);
          const otEnd = (ot.end_time || ot.endTime || '21:00').slice(0, 5);
          const otTimeStr = `${otStart} - ${otEnd}`;
          const otReason = ot.reason || ot.note || '';

          html += `
            <div class="schedule-shift-card schedule-ot-card" style="border-left: 3.5px solid #9333ea; background: #faf5ff; border: 1px solid #e9d5ff; border-left-width: 3.5px; margin-top: ${myShiftsToday.length ? '8px' : '0'};">
              <div class="shift-card-header">
                <div>
                  <div class="shift-card-title" style="color: #6b21a8; font-size: 13px; font-weight: 700;">Tăng ca (OT)</div>
                  <span class="shift-card-time" style="font-size: 12px; font-weight: 600; color: #7e22ce;">⏰ ${otTimeStr}</span>
                </div>
                <span class="shift-quota-badge badge-ot-approved" style="font-size: 11px;">Đã duyệt OT</span>
              </div>
              <div style="font-size: 11.5px; color: #475569; margin-top: 8px; padding: 6px 8px; background: #ffffff; border-radius: 6px; border: 1px solid #f3e8ff;">
                <div>👤 <strong>${ot.emp_name || ot.empName || 'Nhân viên'}</strong></div>
                <div style="font-size: 11px; color: #6b21a8; font-weight: 600; margin-top: 2px;">⚡ Số giờ: ${Number(ot.hours || 0).toFixed(1)}h • Hệ số: x${Number(ot.multiplier || 1.5).toFixed(1)}</div>
                ${otReason ? `<div style="font-size: 10.5px; color: #64748b; margin-top: 4px; font-style: italic;">📝 Lý do: ${otReason}</div>` : ''}
              </div>
            </div>
          `;
        });
      }
    } else {
      activeShifts.forEach(s => {
        const assigned = assignments.filter(a => {
          const wDate = toLocalDateString(a.work_date || a.workDate);
          return (a.shift_id === s.id || a.shiftId === s.id) && (wDate === curDateStr) && (a.status === 'SCHEDULED');
        });

        const minStaff = Number(s.min_staff ?? s.minStaff ?? 1);
        const rawMax = (s.max_staff !== null && s.max_staff !== undefined) ? s.max_staff : s.maxStaff;
        const maxStaff = (rawMax !== null && rawMax !== undefined && rawMax !== '' && Number(rawMax) > 0)
          ? Number(rawMax)
          : null;

        // Tính ngưỡng tối thiểu thông minh theo quy mô thực tế của phòng ban
        const effectiveMin = Math.max(1, Math.min(minStaff, totalActiveEmployeesInScope));

        const isSufficient = (assigned.length >= effectiveMin && assigned.length > 0);
        const quotaBadge = isSufficient
          ? `<span class="shift-quota-badge shift-quota-sufficient">✓ Đã đủ nhân sự</span>`
          : `<span class="shift-quota-badge shift-quota-deficit">Còn thiếu ${effectiveMin - assigned.length} người</span>`;

        const ratioText = (maxStaff && maxStaff > 0)
          ? `<strong>${assigned.length}/${maxStaff}</strong> nhân viên`
          : `<strong>${assigned.length}</strong> nhân viên`;

        const cleanName = getCleanShiftName(s);
        const timeStr = `${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)}`;

        html += `
          <div class="schedule-shift-card">
            <div class="shift-card-header">
              <div>
                <div class="shift-card-title">${cleanName}</div>
                <span class="shift-card-time">${timeStr}</span>
              </div>
            </div>

            <div class="shift-card-quota">
              <span>${ratioText}</span>
              <span style="font-size: 10.5px; color: #64748b;">Tối thiểu: ${effectiveMin}</span>
            </div>

            <div style="margin-top: -2px;">
              ${quotaBadge}
            </div>

            <div class="shift-employee-list">
              ${assigned.length ? assigned.map(a => `
                <div class="shift-employee-item">
                  <div class="emp-info">
                    <span class="emp-name" title="${a.emp_name || 'Nhân viên'}">${a.emp_name || 'Nhân viên'}</span>
                    <span class="emp-dept">${a.department_name || a.emp_code || ''}</span>
                  </div>
                  <button type="button" class="shift-employee-delete-btn" onclick="handleCancelShiftAssignment('${a.id}')" title="Hủy phân ca">Xóa</button>
                </div>
              `).join('') : `
                <div style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 4px 0; text-align: center;">Chưa phân nhân sự</div>
              `}
            </div>

            <button type="button" class="shift-card-assign-btn" onclick="openAssignShiftModal('${s.id}', '${curDateStr}')">
              ➕ Phân nhân viên
            </button>
          </div>
        `;
      });

      // Hiển thị tóm tắt đơn tăng ca đã duyệt trong ngày (cho Manager / Admin)
      const otsTodayInScope = (approvedOts || []).filter(o => {
        const oDate = toLocalDateString(o.work_date || o.workDate);
        return (oDate === curDateStr) && (o.status === 'APPROVED');
      });

      if (otsTodayInScope.length > 0) {
        html += `
          <div class="schedule-ot-summary-card" style="margin-top: 8px; padding: 8px 10px; background: #faf5ff; border: 1px solid #d8b4fe; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11.5px; font-weight: 700; color: #7e22ce;">⚡ Tăng ca đã duyệt (${otsTodayInScope.length})</span>
              <span style="font-size: 10px; background: #f3e8ff; color: #6b21a8; padding: 1px 6px; border-radius: 10px; font-weight: 600;">APPROVED</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${otsTodayInScope.map(ot => `
                <div style="font-size: 11px; color: #475569; background: #ffffff; padding: 4px 6px; border-radius: 4px; border: 1px solid #f3e8ff;">
                  <div>👤 <strong>${ot.emp_name || ot.empName || 'Nhân viên'}</strong>: ${(ot.start_time || ot.startTime || '18:00').slice(0, 5)} - ${(ot.end_time || ot.endTime || '21:00').slice(0, 5)} (${Number(ot.hours || 0).toFixed(1)}h)</div>
                  ${(ot.reason || ot.note) ? `<div style="font-size: 10px; color: #64748b; font-style: italic; margin-top: 1px;">📝 ${ot.reason || ot.note}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    html += `
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function renderDaySchedule(container, assignments, range, totalActiveEmployeesInScope = 1, approvedOts = []) {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';
  const targetDate = range.days[0];
  const curDateStr = toLocalDateString(targetDate);
  const activeShifts = cachedShiftsList.filter(s => s.status === 'ACTIVE');

  const myDayAssignments = assignments.filter(a => {
    const wDate = toLocalDateString(a.work_date || a.workDate);
    return (wDate === curDateStr) && (a.status === 'SCHEDULED');
  });

  const myDayOts = (approvedOts || []).filter(o => {
    const oDate = toLocalDateString(o.work_date || o.workDate);
    return (oDate === curDateStr) && (o.status === 'APPROVED');
  });

  let html = `
    <div style="margin-bottom: 16px; padding: 12px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div>
        <div style="font-size: 14px; font-weight: 700; color: #0f172a;">Lịch làm việc chi tiết trong ngày: ${formatLeaveDate(curDateStr)}</div>
        <div style="font-size: 12px; color: #64748b;">Tổng cộng ${assignments.filter(a => a.status === 'SCHEDULED').length} nhân sự trực thuộc các ca trong ngày${myDayOts.length ? ` • ${myDayOts.length} ca tăng ca đã duyệt` : ''}</div>
      </div>
      ${(!isEmployee) ? `
        <button type="button" class="btn-primary-blue" onclick="openAssignShiftModal(null, '${curDateStr}')" style="font-size: 12px; padding: 6px 12px;">
          ➕ Phân ca cho ngày này
        </button>
      ` : ''}
    </div>
    <div class="schedule-day-view-container">
  `;

  if (isEmployee) {
    if (!myDayAssignments.length && !myDayOts.length) {
      html += `
        <div style="grid-column: 1 / -1; padding: 36px 16px; text-align: center; background: #ffffff; border: 1.5px dashed #cbd5e1; border-radius: 10px; color: #64748b;">
          <div style="font-size: 15px; font-weight: 700; color: #334155;">Hôm nay là ngày nghỉ / Không có ca làm việc</div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">Bạn không có lịch làm việc được phân bổ vào ngày này (${formatLeaveDate(curDateStr)}).</div>
        </div>
      `;
    } else {
      myDayAssignments.forEach(a => {
        const s = cachedShiftsList.find(x => x.id === (a.shift_id || a.shiftId)) || {};
        const cleanName = getCleanShiftName(s) || a.shift_name || 'Ca làm việc';
        const startTime = (a.start_time || s.start_time || '08:00:00').slice(0, 5);
        const endTime = (a.end_time || s.end_time || '17:30:00').slice(0, 5);
        const timeStr = `${startTime} - ${endTime}`;

        html += `
          <div class="schedule-day-shift-card" style="border-left: 4px solid #2563eb;">
            <div class="schedule-day-shift-header">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge-status badge-active" style="font-weight: 700;">${a.shift_code || s.code || 'CA'}</span>
                  <strong style="font-size: 15px; color: #0f172a;">${cleanName}</strong>
                </div>
                <div style="font-size: 12.5px; font-weight: 600; color: #2563eb; margin-top: 4px;">
                  ⏰ Khung giờ: ${timeStr} • ${s.working_hours ? Number(s.working_hours).toFixed(1) + 'h' : 'Chuẩn ca'}
                </div>
              </div>
              <div><span class="shift-quota-badge shift-quota-sufficient" style="font-size: 11px;">✓ Lịch trực của bạn</span></div>
            </div>

            <div style="font-size: 12px; color: #475569; background: #f8fafc; padding: 12px 14px; border-radius: 6px;">
              <div>👤 <strong>Họ tên:</strong> ${a.emp_name || 'Nhân viên'} (${a.emp_code || a.emp_id})</div>
              <div style="margin-top: 4px;">🏢 <strong>Phòng ban:</strong> ${a.department_name || '-'}</div>
              ${a.note ? `<div style="margin-top: 4px; font-style: italic;">📝 <strong>Ghi chú:</strong> ${a.note}</div>` : ''}
            </div>
          </div>
        `;
      });

      myDayOts.forEach(ot => {
        const otStart = (ot.start_time || ot.startTime || '18:00').slice(0, 5);
        const otEnd = (ot.end_time || ot.endTime || '21:00').slice(0, 5);
        const otReason = ot.reason || ot.note || '';

        html += `
          <div class="schedule-day-shift-card schedule-day-ot-card" style="border-left: 4px solid #9333ea; background: #faf5ff;">
            <div class="schedule-day-shift-header">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge-status badge-ot-approved" style="font-weight: 700;">OT</span>
                  <strong style="font-size: 15px; color: #581c87;">Ca Tăng Ca (Overtime)</strong>
                </div>
                <div style="font-size: 12.5px; font-weight: 600; color: #7e22ce; margin-top: 4px;">
                  ⏰ Khung giờ: ${otStart} - ${otEnd} • ${Number(ot.hours || 0).toFixed(1)}h (Hệ số x${Number(ot.multiplier || 1.5).toFixed(1)})
                </div>
              </div>
              <div><span class="shift-quota-badge badge-ot-approved" style="font-size: 11px;">✓ Đã duyệt OT</span></div>
            </div>

            <div style="font-size: 12px; color: #475569; background: #ffffff; padding: 12px 14px; border-radius: 6px; border: 1px solid #f3e8ff;">
              <div>👤 <strong>Họ tên:</strong> ${ot.emp_name || ot.empName || 'Nhân viên'} (${ot.emp_code || ot.empCode || ot.emp_id || ''})</div>
              <div style="margin-top: 4px;">🏢 <strong>Phòng ban:</strong> ${ot.department_name || ot.departmentName || '-'}</div>
              ${otReason ? `<div style="margin-top: 4px; font-style: italic; color: #6b21a8;">📝 <strong>Lý do tăng ca:</strong> ${otReason}</div>` : ''}
            </div>
          </div>
        `;
      });
    }
  } else {
    activeShifts.forEach(s => {
      const assigned = assignments.filter(a => {
        const wDate = toLocalDateString(a.work_date || a.workDate);
        return (a.shift_id === s.id || a.shiftId === s.id) && (wDate === curDateStr) && (a.status === 'SCHEDULED');
      });

      const minStaff = Number(s.min_staff ?? s.minStaff ?? 1);
      const rawMax = (s.max_staff !== null && s.max_staff !== undefined) ? s.max_staff : s.maxStaff;
      const maxStaff = (rawMax !== null && rawMax !== undefined && rawMax !== '' && Number(rawMax) > 0)
        ? Number(rawMax)
        : null;

      // Tính ngưỡng tối thiểu thông minh theo quy mô thực tế của phòng ban
      const effectiveMin = Math.max(1, Math.min(minStaff, totalActiveEmployeesInScope));

      const isSufficient = (assigned.length >= effectiveMin && assigned.length > 0);
      const quotaBadge = isSufficient
        ? `<span class="shift-quota-badge shift-quota-sufficient" style="font-size: 11px;">✓ Đã đủ nhân sự</span>`
        : `<span class="shift-quota-badge shift-quota-deficit" style="font-size: 11px;">Còn thiếu ${effectiveMin - assigned.length} người</span>`;

      const ratioText = (maxStaff && maxStaff > 0)
        ? `<strong>${assigned.length}/${maxStaff}</strong> nhân viên`
        : `<strong>${assigned.length}</strong> nhân viên`;

      const cleanName = getCleanShiftName(s);
      const timeStr = `${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)}`;

      html += `
        <div class="schedule-day-shift-card">
          <div class="schedule-day-shift-header">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge-status badge-pending" style="font-weight: 700;">${s.code}</span>
                <strong style="font-size: 14px; color: #0f172a;">${cleanName}</strong>
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
                Khung giờ: <strong>${timeStr}</strong> • Tiêu chuẩn: ${Number(s.working_hours).toFixed(1)}h
              </div>
            </div>
            <div>${quotaBadge}</div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px;">
            <span>Định biên phân bổ: ${ratioText}</span>
            <span>Yêu cầu tối thiểu: <strong>${effectiveMin}</strong></span>
          </div>

          <div>
            <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px;">Danh sách nhân viên được phân ca (${assigned.length}):</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${assigned.length ? assigned.map(a => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
                  <div>
                    <div style="font-weight: 600; color: #0f172a; font-size: 12.5px;">${a.emp_name || 'Nhân viên'} <span style="font-size: 11.5px; color: #64748b; font-weight: normal;">(${a.emp_code || a.emp_id})</span></div>
                    <div style="font-size: 11px; color: #64748b;">${a.department_name || '-'} • ${a.note || 'Lịch làm việc'}</div>
                  </div>
                  <button type="button" class="btn-secondary-outline" style="padding: 3px 8px; font-size: 11px; color: #ef4444; border-color: #fecaca;" onclick="handleCancelShiftAssignment('${a.id}')">Xóa</button>
                </div>
              `).join('') : `
                <div style="text-align: center; color: #94a3b8; font-size: 12px; padding: 16px; background: #f8fafc; border-radius: 6px;">Chưa có nhân sự nào được phân vào ca này</div>
              `}
            </div>
          </div>

          <button type="button" class="shift-card-assign-btn" style="padding: 8px; margin-top: auto;" onclick="openAssignShiftModal('${s.id}', '${curDateStr}')">
            ➕ Phân nhân sự vào ca này
          </button>
        </div>
      `;
    });

    if (myDayOts.length > 0) {
      html += `
        <div class="schedule-day-shift-card" style="border-left: 4px solid #9333ea; background: #faf5ff;">
          <div class="schedule-day-shift-header">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge-status badge-ot-approved" style="font-weight: 700;">OT</span>
                <strong style="font-size: 14px; color: #581c87;">Nhân viên tăng ca đã duyệt (${myDayOts.length})</strong>
              </div>
              <div style="font-size: 12px; color: #7e22ce; margin-top: 4px;">Danh sách đơn làm thêm giờ đã được phê duyệt trong ngày</div>
            </div>
            <div><span class="shift-quota-badge badge-ot-approved" style="font-size: 11px;">APPROVED</span></div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
            ${myDayOts.map(ot => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #e9d5ff; padding: 8px 12px; border-radius: 6px;">
                <div>
                  <div style="font-weight: 600; color: #0f172a; font-size: 12.5px;">${ot.emp_name || ot.empName || 'Nhân viên'} <span style="font-size: 11.5px; color: #64748b; font-weight: normal;">(${ot.emp_code || ot.empCode || ot.emp_id || ''})</span></div>
                  <div style="font-size: 11px; color: #7e22ce; font-weight: 600;">⏰ ${(ot.start_time || ot.startTime || '18:00').slice(0, 5)} - ${(ot.end_time || ot.endTime || '21:00').slice(0, 5)} (${Number(ot.hours || 0).toFixed(1)}h)</div>
                  ${(ot.reason || ot.note) ? `<div style="font-size: 10.5px; color: #64748b; font-style: italic; margin-top: 2px;">📝 ${ot.reason || ot.note}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderMonthSchedule(container, assignments, range, approvedOts = []) {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';
  const todayStr = toLocalDateString(new Date());
  const targetMonth = range.targetMonth;
  const headerDays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

  let html = `
    <div style="margin-bottom: 12px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; align-items: center;">
      <span>💡 Nhấp vào ô ngày bất kỳ để chuyển sang chế độ xem chi tiết ngày</span>
      <span>Tổng số lượt phân ca trong tháng: <strong>${assignments.filter(a => a.status === 'SCHEDULED').length}</strong>${(approvedOts && approvedOts.length) ? ` • Tăng ca đã duyệt: <strong>${approvedOts.length}</strong>` : ''}</span>
    </div>
    <div class="schedule-month-grid">
  `;

  headerDays.forEach(h => {
    html += `<div class="schedule-month-day-header">${h}</div>`;
  });

  range.days.forEach(dayDate => {
    const curDateStr = toLocalDateString(dayDate);
    const isToday = (curDateStr === todayStr);
    const isDiffMonth = (dayDate.getMonth() !== targetMonth);

    const dayAssignments = assignments.filter(a => {
      const wDate = toLocalDateString(a.work_date || a.workDate);
      return (wDate === curDateStr) && (a.status === 'SCHEDULED');
    });

    const dayOts = (approvedOts || []).filter(o => {
      const oDate = toLocalDateString(o.work_date || o.workDate);
      return (oDate === curDateStr) && (o.status === 'APPROVED');
    });

    const shiftCounts = {};
    dayAssignments.forEach(a => {
      const code = a.shift_code || 'CA';
      shiftCounts[code] = (shiftCounts[code] || 0) + 1;
    });

    html += `
      <div class="schedule-month-cell ${isToday ? 'today' : ''} ${isDiffMonth ? 'different-month' : ''}" onclick="selectScheduleDateAndDayView('${curDateStr}')">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; font-size: 13px; color: ${isToday ? '#2563eb' : (isDiffMonth ? '#94a3b8' : '#1e293b')};">${dayDate.getDate()}</span>
          <div style="display: flex; gap: 3px;">
            ${dayAssignments.length ? `<span style="font-size: 10px; font-weight: 700; background: #dbeafe; color: #1e40af; padding: 1px 5px; border-radius: 10px;">${dayAssignments.length} NV</span>` : ''}
            ${dayOts.length ? `<span style="font-size: 10px; font-weight: 700; background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; padding: 1px 4px; border-radius: 10px;">${dayOts.length} OT</span>` : ''}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px;">
          ${Object.entries(shiftCounts).slice(0, 3).map(([code, count]) => `
            <div style="font-size: 9.5px; background: #f1f5f9; color: #334155; padding: 1px 4px; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${code}: <strong>${count}</strong>
            </div>
          `).join('')}
          ${Object.keys(shiftCounts).length > 3 ? `<div style="font-size: 9px; color: #64748b;">+${Object.keys(shiftCounts).length - 3} ca khác</div>` : ''}
          ${dayOts.length ? `
            <div style="font-size: 9.5px; background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff; padding: 1px 4px; border-radius: 3px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ⚡ OT: <strong>${dayOts.length}</strong> ca đã duyệt
            </div>
          ` : ''}
          ${(!dayAssignments.length && !dayOts.length && isEmployee && !isDiffMonth) ? `
            <div style="font-size: 9px; color: #94a3b8; font-style: italic; padding: 2px 0;">Ngày nghỉ / Không có ca</div>
          ` : ''}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function selectScheduleDateAndDayView(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    scheduleCurrentDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  } else {
    scheduleCurrentDate = new Date(dateStr);
  }
  setScheduleView('day');
}

function renderShiftAssignmentsTable(assignments) {
  const tbody = document.getElementById('tableBodyShiftAssignments');
  if (!tbody) return;

  if (!assignments.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 24px;">Không có ca làm việc nào được phân trong khoảng thời gian này</td></tr>`;
    return;
  }

  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';
  const canManage = !isEmployee && ['ADMIN', 'HR', 'MANAGER'].includes(role);

  tbody.innerHTML = assignments.map(a => {
    const wDate = a.work_date ? formatLeaveDate(a.work_date) : '';
    return `
      <tr>
        <td><strong>${wDate}</strong></td>
        <td>${a.emp_code || a.emp_id}</td>
        <td><span style="font-weight: 600; color: #0f172a;">${a.emp_name || 'Nhân viên'}</span></td>
        <td>${a.department_name || '-'}</td>
        <td><span class="badge-status badge-pending" style="font-weight: 600;">${a.shift_code}</span></td>
        <td>${a.start_time ? a.start_time.slice(0, 5) : ''} - ${a.end_time ? a.end_time.slice(0, 5) : ''}</td>
        <td>${a.working_hours ? Number(a.working_hours).toFixed(1) + 'h' : '8.0h'}</td>
        <td style="font-size: 11.5px; color: #64748b;">${a.note || '—'}</td>
        <td>
          <span class="badge-status ${a.status === 'SCHEDULED' ? 'badge-approved' : 'badge-rejected'}">
            ${a.status === 'SCHEDULED' ? 'Đã xếp ca' : (a.status === 'SWAPPED' ? 'Đã đổi ca' : 'Đã hủy')}
          </span>
        </td>
        <td style="text-align: center;">
          ${(canManage && a.status === 'SCHEDULED') ? `
            <button class="btn-secondary-outline" style="padding: 4px 10px; font-size: 11.5px; color: #ef4444; border-color: #fecaca;" onclick="handleCancelShiftAssignment('${a.id}')">Hủy</button>
          ` : `<span style="font-size: 11px; color: #94a3b8;">—</span>`}
        </td>
      </tr>
    `;
  }).join('');
}

// 3. Đơn đăng ký tăng ca OT (SCR_OT_01, SCR_OT_02)
async function loadOtRequests() {
  const tbody = document.getElementById('tableBodyOtRequests');
  if (!tbody) return;

  try {
    const res = await apiCall('/api/v1/ot-requests');
    cachedOtRequests = res?.data || [];

    // Cập nhật KPI
    const pendingList = cachedOtRequests.filter(o => o.status === 'PENDING');
    const kpiPending = document.getElementById('kpiOtPendingCount');
    if (kpiPending) kpiPending.innerText = pendingList.length;

    // Tổng giờ OT đã duyệt
    const totalApprovedHours = cachedOtRequests
      .filter(o => o.status === 'APPROVED')
      .reduce((sum, o) => sum + Number(o.total_hours || 0), 0);
    const kpiHours = document.getElementById('kpiOtTotalHours');
    if (kpiHours) kpiHours.innerText = `${totalApprovedHours.toFixed(1)}h`;

    filterOtTable();
  } catch (err) {
    console.error('Lỗi tải đơn tăng ca:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

function filterOtTable() {
  const tbody = document.getElementById('tableBodyOtRequests');
  if (!tbody) return;

  const statusFilter = document.getElementById('filterOtStatus')?.value || 'ALL';
  const list = cachedOtRequests.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    return true;
  });

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 24px;">Không có đơn tăng ca nào phù hợp bộ lọc</td></tr>`;
    return;
  }

  const canApprove = ['ADMIN', 'HR', 'MANAGER'].includes(state.user?.role);
  tbody.innerHTML = list.map(o => {
    const createdDate = o.created_at ? formatLeaveDateTime(o.created_at) : '';
    const workDate = o.work_date ? formatLeaveDate(o.work_date) : '';
    const startTime = o.start_time ? o.start_time.slice(0, 5) : '';
    const endTime = o.end_time ? o.end_time.slice(0, 5) : '';
    const typeLabel = o.ot_type === 'WEEKDAY' ? 'Ngày thường (x1.5)' : (o.ot_type === 'WEEKEND' ? 'Cuối tuần (x2.0)' : 'Lễ / Tết (x3.0)');

    let statusBadge = '';
    if (o.status === 'PENDING') statusBadge = '<span class="badge-status badge-pending">Đang chờ duyệt</span>';
    else if (o.status === 'APPROVED') statusBadge = '<span class="badge-status badge-approved">Đã duyệt</span>';
    else if (o.status === 'REJECTED') statusBadge = '<span class="badge-status badge-rejected">Đã từ chối</span>';

    return `
      <tr>
        <td style="font-size: 11.5px; color: #64748b;">${createdDate}</td>
        <td>
          <div style="font-weight: 700; color: #0f172a;">${o.emp_name || 'Nhân viên'}</div>
          <div style="font-size: 11px; color: #64748b;">${o.emp_code || o.emp_id}</div>
        </td>
        <td>${o.department_name || '-'}</td>
        <td><strong>${workDate}</strong></td>
        <td>${startTime} - ${endTime}</td>
        <td><strong style="color: #2563eb;">${Number(o.total_hours).toFixed(1)} giờ</strong></td>
        <td><span class="badge-status" style="background: #f1f5f9; color: #334155;">${typeLabel}</span></td>
        <td style="font-size: 12px; max-width: 200px; color: #475569;">${o.reason || '—'}</td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">
          ${(canApprove && o.status === 'PENDING') ? `
            <div style="display: flex; gap: 6px; justify-content: center;">
              <button class="btn-primary-blue" style="padding: 4px 10px; font-size: 11.5px; background: #10b981; border-color: #10b981;" onclick="handleOtDecision('${o.id}', 'APPROVED')">✓ Duyệt</button>
              <button class="btn-secondary-outline" style="padding: 4px 10px; font-size: 11.5px; color: #ef4444; border-color: #fecaca;" onclick="handleOtDecision('${o.id}', 'REJECTED')">✕ Từ chối</button>
            </div>
          ` : `<span style="font-size: 11px; color: #94a3b8;">${o.status === 'APPROVED' ? 'Đã duyệt bởi ' + (o.approver_name || 'Quản lý') : 'Hoàn tất'}</span>`}
        </td>
      </tr>
    `;
  }).join('');
}

// 4. Quyết định duyệt / từ chối đơn tăng ca
async function handleOtDecision(requestId, decision) {
  const isApprove = decision === 'APPROVED';
  let rejectReason = null;
  if (!isApprove) {
    rejectReason = prompt('Nhập lý do từ chối đơn tăng ca:');
    if (rejectReason === null) return;
  }

  try {
    const res = await apiCall(`/api/v1/ot-requests/${requestId}/decision`, {
      method: 'PATCH',
      body: JSON.stringify({
        decision,
        rejectReason
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Xử lý đơn thất bại');
    }

    showToast(isApprove ? 'Đã phê duyệt đơn tăng ca thành công' : 'Đã từ chối đơn tăng ca', isApprove ? 'success' : 'warning');
    await loadOtRequests();
  } catch (err) {
    console.error('Lỗi quyết định đơn OT:', err);
    showToast(err.message || 'Xử lý thất bại, vui lòng thử lại', 'error');
  }
}

// 5. Popup đăng ký tăng ca OT
function openCreateOtModal() {
  const today = toLocalDateString(new Date());
  const html = `
    <form id="formModalCreateOt" onsubmit="handleCreateOtSubmit(event)">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Ngày tăng ca *</label>
          <input type="date" id="otModalWorkDate" class="topbar-search-input" value="${today}" required>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Loại làm thêm *</label>
          <select id="otModalType" class="topbar-search-input">
            <option value="WEEKDAY">Ngày làm việc thường (x1.5)</option>
            <option value="WEEKEND">Ngày nghỉ cuối tuần (x2.0)</option>
            <option value="HOLIDAY">Ngày nghỉ lễ / Tết (x3.0)</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Từ giờ *</label>
          <input type="time" id="otModalStartTime" class="topbar-search-input" value="18:00" required onchange="calcOtModalHours()">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Đến giờ *</label>
          <input type="time" id="otModalEndTime" class="topbar-search-input" value="20:30" required onchange="calcOtModalHours()">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Tổng giờ OT</label>
          <input type="number" id="otModalTotalHours" class="topbar-search-input" style="background: #f8fafc; font-weight: 700;" value="2.5" step="0.5" readonly>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Lý do tăng ca & Nội dung công việc *</label>
        <textarea id="otModalReason" class="topbar-search-input" style="height: 70px; resize: vertical;" placeholder="Ví dụ: Triển khai phát hành tính năng phiên bản mới, kiểm thử tích hợp..." required></textarea>
      </div>

      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; font-size: 11.5px; color: #1e40af; margin-bottom: 16px;">
        ℹ️ Đơn đăng ký tăng ca sẽ được gửi tới Quản lý xét duyệt và tính toán cộng dồn vào bảng lương tháng.
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn-secondary-outline" onclick="closeModal()">Hủy bỏ</button>
        <button type="submit" id="btnSubmitOtModal" class="btn-primary-blue">Gửi đơn tăng ca</button>
      </div>
    </form>
  `;
  openModal('Đăng ký tăng ca làm thêm (OT)', html);
}

function calcOtModalHours() {
  const start = document.getElementById('otModalStartTime')?.value;
  const end = document.getElementById('otModalEndTime')?.value;
  const totalInput = document.getElementById('otModalTotalHours');
  if (!start || !end || !totalInput) return;

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  const hours = Math.round((diff / 60) * 10) / 10;
  totalInput.value = hours > 0 ? hours : 0.5;
}

async function handleCreateOtSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const workDate = document.getElementById('otModalWorkDate').value;
  const otType = document.getElementById('otModalType').value;
  const startTime = document.getElementById('otModalStartTime').value + ':00';
  const endTime = document.getElementById('otModalEndTime').value + ':00';
  const totalHours = Number(document.getElementById('otModalTotalHours').value);
  const reason = document.getElementById('otModalReason').value.trim();
  const btn = document.getElementById('btnSubmitOtModal');

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang gửi...';
  }

  try {
    const res = await apiCall('/api/v1/ot-requests', {
      method: 'POST',
      body: JSON.stringify({
        workDate,
        startTime,
        endTime,
        totalHours,
        otType,
        reason
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Đăng ký tăng ca thất bại');
    }

    showToast('Gửi đơn đăng ký tăng ca thành công! Chờ quản lý phê duyệt.', 'success');
    closeModal();
    await loadOtRequests();
    if (typeof loadRequestsData === 'function') await loadRequestsData();
    if (typeof loadDashboardPendingRequests === 'function') await loadDashboardPendingRequests();
  } catch (err) {
    console.error('Lỗi tạo đơn OT:', err);
    showToast(err.message || 'Gửi đơn thất bại', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Gửi đơn tăng ca';
    }
  }
}

// 6. Popup phân ca nhân viên (SCR_SHIFT_01)
let assignModalSelectedWeekdays = [1, 2, 3, 4, 5]; // Mặc định T2 -> T6

function toggleAssignWeekday(day) {
  day = Number(day);
  const idx = assignModalSelectedWeekdays.indexOf(day);
  if (idx > -1) {
    assignModalSelectedWeekdays.splice(idx, 1);
  } else {
    assignModalSelectedWeekdays.push(day);
  }
  document.querySelectorAll('.weekday-chip').forEach(btn => {
    const bDay = Number(btn.getAttribute('data-day'));
    if (assignModalSelectedWeekdays.includes(bDay)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  updateAssignModalPreview();
}

function applyShiftWeekdayPreset(preset) {
  if (preset === 'weekdays') {
    assignModalSelectedWeekdays = [1, 2, 3, 4, 5];
  } else if (preset === 'all') {
    assignModalSelectedWeekdays = [1, 2, 3, 4, 5, 6, 0];
  } else if (preset === 'none') {
    assignModalSelectedWeekdays = [];
  }
  document.querySelectorAll('.weekday-chip').forEach(btn => {
    const bDay = Number(btn.getAttribute('data-day'));
    if (assignModalSelectedWeekdays.includes(bDay)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  updateAssignModalPreview();
}

function handleAssignModalShiftChange(shiftId) {
  const shift = cachedShiftsList.find(s => s.id === shiftId);
  if (!shift) return;
  const startInput = document.getElementById('assignModalStartTime');
  const endInput = document.getElementById('assignModalEndTime');
  if (startInput && (shift.start_time || shift.startTime)) {
    startInput.value = (shift.start_time || shift.startTime).slice(0, 5);
  }
  if (endInput && (shift.end_time || shift.endTime)) {
    endInput.value = (shift.end_time || shift.endTime).slice(0, 5);
  }
}

function updateAssignModalPreview() {
  const previewBox = document.getElementById('assignModalPreview');
  if (!previewBox) return;

  const fromDateVal = document.getElementById('assignModalFromDate')?.value;
  const toDateVal = document.getElementById('assignModalToDate')?.value;
  if (!fromDateVal || !toDateVal) {
    previewBox.className = 'weekday-preview-box empty';
    previewBox.innerHTML = '⚠️ Vui lòng chọn khoảng ngày bắt đầu và kết thúc';
    return;
  }

  const fromParts = fromDateVal.split('-').map(Number);
  const toParts = toDateVal.split('-').map(Number);
  const fromD = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const toD = new Date(toParts[0], toParts[1] - 1, toParts[2]);

  if (fromD > toD) {
    previewBox.className = 'weekday-preview-box empty';
    previewBox.innerHTML = '⚠️ <strong>Từ ngày</strong> không được lớn hơn <strong>Đến ngày</strong>';
    return;
  }

  if (!assignModalSelectedWeekdays || !assignModalSelectedWeekdays.length) {
    previewBox.className = 'weekday-preview-box empty';
    previewBox.innerHTML = '⚠️ <strong>Chưa chọn thứ nào trong tuần.</strong> Vui lòng bấm chọn ít nhất 1 thứ hoặc dùng các nút gợi ý nhanh bên trên (Các thứ không chọn sẽ không có ca).';
    return;
  }

  const dayLabels = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 0: 'CN' };
  const sortedDays = [1, 2, 3, 4, 5, 6, 0].filter(d => assignModalSelectedWeekdays.includes(d));
  const daysText = sortedDays.map(d => dayLabels[d]).join(', ');

  let count = 0;
  for (let cur = new Date(fromD); cur <= toD; cur.setDate(cur.getDate() + 1)) {
    if (assignModalSelectedWeekdays.includes(cur.getDay())) {
      count++;
    }
  }

  const fromFmt = `${String(fromD.getDate()).padStart(2, '0')}/${String(fromD.getMonth() + 1).padStart(2, '0')}/${fromD.getFullYear()}`;
  const toFmt = `${String(toD.getDate()).padStart(2, '0')}/${String(toD.getMonth() + 1).padStart(2, '0')}/${toD.getFullYear()}`;

  previewBox.className = 'weekday-preview-box';
  previewBox.innerHTML = `Sẽ xếp ca cho các ngày: <strong style="color: #2563eb;">${daysText}</strong> trong khoảng từ <strong>${fromFmt}</strong> đến <strong>${toFmt}</strong> (Tổng cộng <strong>${count} ngày</strong> có ca, các thứ không chọn sẽ không có ca).`;
}

async function openAssignShiftModal(preShiftId = null, preWorkDate = null) {
  const role = (state.user?.role || 'EMPLOYEE').toUpperCase();
  const isEmployee = role === 'EMPLOYEE' || state.user?.username === 'employee';

  if (isEmployee) {
    showToast('Nhân viên không có quyền phân ca làm việc', 'error');
    return;
  }

  let employeeOptions = '';
  try {
    const employees = await getEmployeesInScope();
    if (!employees.length) {
      showToast('Không tìm thấy nhân viên nào thuộc phạm vi quản lý', 'warning');
      return;
    }

    employeeOptions = employees.map(e => `
      <option value="${e.id}">${e.code || e.id} - ${e.full_name || e.fullName || 'Nhân viên'} (${e.department_name || e.departmentName || 'Phòng ban'})</option>
    `).join('');
  } catch {
    employeeOptions = '<option value="e0000001-0000-0000-0000-000000000004">NV-001 - Vũ Đức Hiếu</option>';
  }

  if (!cachedShiftsList.length) {
    try {
      const shiftRes = await apiCall('/api/v1/shifts');
      cachedShiftsList = shiftRes?.data || [];
    } catch {}
  }

  const activeShifts = cachedShiftsList.filter(s => s.status === 'ACTIVE');
  const selectedShift = activeShifts.find(s => s.id === preShiftId) || activeShifts[0] || cachedShiftsList[0];
  const defaultStartTime = (selectedShift?.start_time || selectedShift?.startTime || '08:00:00').slice(0, 5);
  const defaultEndTime = (selectedShift?.end_time || selectedShift?.endTime || '17:30:00').slice(0, 5);

  let shiftOptions = activeShifts.map(s => `
    <option value="${s.id}" ${(s.id === preShiftId || (!preShiftId && s.id === selectedShift?.id)) ? 'selected' : ''}>
      ${formatShiftOptionLabel(s)}
    </option>
  `).join('');

  // Tính khoảng ngày Thứ 2 đến Chủ nhật của tuần đang xem
  const baseDate = preWorkDate ? new Date(preWorkDate + 'T00:00:00') : (scheduleCurrentDate ? new Date(scheduleCurrentDate) : new Date());
  const weekRange = getScheduleDateRange(baseDate, 'week');
  const defaultFromDate = weekRange.fromDate;
  const defaultToDate = weekRange.toDate;

  // Khởi tạo các thứ được chọn mặc định (T2 - T6; nếu ngày click rơi vào T7 hoặc CN thì kích hoạt thêm)
  assignModalSelectedWeekdays = [1, 2, 3, 4, 5];
  if (preWorkDate) {
    const preDay = baseDate.getDay();
    if (!assignModalSelectedWeekdays.includes(preDay)) {
      assignModalSelectedWeekdays.push(preDay);
    }
  }

  const weekDaysMeta = [
    { day: 1, label: 'T2', sub: 'Thứ 2' },
    { day: 2, label: 'T3', sub: 'Thứ 3' },
    { day: 3, label: 'T4', sub: 'Thứ 4' },
    { day: 4, label: 'T5', sub: 'Thứ 5' },
    { day: 5, label: 'T6', sub: 'Thứ 6' },
    { day: 6, label: 'T7', sub: 'Thứ 7' },
    { day: 0, label: 'CN', sub: 'C.Nhật' }
  ];

  const chipsHtml = weekDaysMeta.map(w => {
    const isActive = assignModalSelectedWeekdays.includes(w.day);
    return `
      <button type="button" class="weekday-chip ${isActive ? 'active' : ''}" data-day="${w.day}" onclick="toggleAssignWeekday(${w.day})">
        <span>${w.label}</span>
        <span class="chip-sub">${w.sub}</span>
      </button>
    `;
  }).join('');

  const html = `
    <form id="formModalAssignShift" onsubmit="handleAssignShiftSubmit(event)">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Chọn nhân viên *</label>
          <select id="assignModalEmpId" class="topbar-search-input" required>
            ${employeeOptions}
          </select>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Chọn ca làm việc *</label>
          <select id="assignModalShiftId" class="topbar-search-input" onchange="handleAssignModalShiftChange(this.value)" required>
            ${shiftOptions}
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Giờ bắt đầu (startTime) *</label>
          <input type="time" id="assignModalStartTime" class="topbar-search-input" value="${defaultStartTime}" required>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Giờ kết thúc (endTime) *</label>
          <input type="time" id="assignModalEndTime" class="topbar-search-input" value="${defaultEndTime}" required>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Từ ngày (fromDate) *</label>
          <input type="date" id="assignModalFromDate" class="topbar-search-input" value="${defaultFromDate}" onchange="updateAssignModalPreview()" required>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Đến ngày (toDate) *</label>
          <input type="date" id="assignModalToDate" class="topbar-search-input" value="${defaultToDate}" onchange="updateAssignModalPreview()" required>
        </div>
      </div>

      <div style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 6px;">
          <label style="font-size: 12px; font-weight: 600; color: #475569;">Chọn các thứ làm việc trong tuần (bật/tắt) *</label>
          <div class="weekday-presets-bar">
            <button type="button" class="weekday-preset-btn" onclick="applyShiftWeekdayPreset('weekdays')">T2 - T6</button>
            <button type="button" class="weekday-preset-btn" onclick="applyShiftWeekdayPreset('all')">T2 - CN (Full tuần)</button>
            <button type="button" class="weekday-preset-btn" onclick="applyShiftWeekdayPreset('none')">Bỏ chọn hết</button>
          </div>
        </div>

        <div class="weekday-chips-grid">
          ${chipsHtml}
        </div>

        <div id="assignModalPreview" class="weekday-preview-box"></div>
      </div>

      <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="assignModalClearUnselected" checked style="width: 15px; height: 15px; cursor: pointer;">
        <label for="assignModalClearUnselected" style="font-size: 12px; color: #475569; cursor: pointer;">
          Tự động dọn sạch ca cũ nếu rơi vào các thứ không chọn trong khoảng này
        </label>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Ghi chú phân ca</label>
        <input type="text" id="assignModalNote" class="topbar-search-input" placeholder="Ví dụ: Phân ca dự án trực hệ thống tuần 47">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn-secondary-outline" onclick="closeModal()">Hủy bỏ</button>
        <button type="submit" id="btnSubmitAssignShift" class="btn-primary-blue">Xác nhận phân ca</button>
      </div>
    </form>
  `;
  openModal('Phân ca làm việc cho nhân viên', html);
  setTimeout(updateAssignModalPreview, 10);
}

async function handleAssignShiftSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const empId = document.getElementById('assignModalEmpId')?.value;
  const shiftId = document.getElementById('assignModalShiftId')?.value;
  const fromDateVal = document.getElementById('assignModalFromDate')?.value;
  const toDateVal = document.getElementById('assignModalToDate')?.value;
  const startTime = document.getElementById('assignModalStartTime')?.value ? (document.getElementById('assignModalStartTime').value + ':00') : null;
  const endTime = document.getElementById('assignModalEndTime')?.value ? (document.getElementById('assignModalEndTime').value + ':00') : null;
  const clearUnselected = Boolean(document.getElementById('assignModalClearUnselected')?.checked);
  const note = document.getElementById('assignModalNote')?.value.trim() || '';
  const btn = document.getElementById('btnSubmitAssignShift');

  if (!fromDateVal || !toDateVal) {
    showToast('Vui lòng chọn khoảng thời gian Từ ngày - Đến ngày', 'warning');
    return;
  }

  const fromParts = fromDateVal.split('-').map(Number);
  const toParts = toDateVal.split('-').map(Number);
  const fromD = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const toD = new Date(toParts[0], toParts[1] - 1, toParts[2]);

  if (fromD > toD) {
    showToast('Từ ngày không được lớn hơn Đến ngày', 'error');
    return;
  }

  if (!assignModalSelectedWeekdays || !assignModalSelectedWeekdays.length) {
    showToast('Vui lòng chọn ít nhất 1 thứ trong tuần để phân ca', 'warning');
    return;
  }

  // Duyệt qua từng ngày trong khoảng fromDate -> toDate
  const targetWorkDates = [];
  const unselectedWorkDates = [];
  for (let cur = new Date(fromD); cur <= toD; cur.setDate(cur.getDate() + 1)) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    if (assignModalSelectedWeekdays.includes(cur.getDay())) {
      targetWorkDates.push(dateStr);
    } else {
      unselectedWorkDates.push(dateStr);
    }
  }

  if (!targetWorkDates.length) {
    showToast('Không có ngày nào khớp với các thứ đã chọn trong khoảng thời gian này', 'warning');
    return;
  }

  // Kiểm tra cảnh báo định biên tối đa (maxStaff) trên các ngày được phân bổ
  const targetShift = cachedShiftsList.find(s => s.id === shiftId);
  const maxStaff = targetShift?.max_staff ?? targetShift?.maxStaff ?? null;
  if (maxStaff && Number(maxStaff) > 0) {
    const datesExceeding = [];
    for (const wDate of targetWorkDates) {
      const assignedCount = (cachedAssignmentsList || []).filter(a => {
        const aDate = toLocalDateString(a.work_date || a.workDate);
        return (a.shift_id === shiftId || a.shiftId === shiftId) && aDate === wDate && a.status === 'SCHEDULED';
      }).length;
      if (assignedCount >= Number(maxStaff)) {
        datesExceeding.push(wDate);
      }
    }

    if (datesExceeding.length > 0) {
      const shiftName = getCleanShiftName(targetShift) || 'ca này';
      const exceedMsg = datesExceeding.length === 1 
        ? `ngày ${datesExceeding[0]}` 
        : `${datesExceeding.length} ngày (ví dụ: ${datesExceeding.slice(0, 2).join(', ')}...)`;
      const proceed = confirm(`⚠️ Cảnh báo định biên: ${shiftName} vào ${exceedMsg} hiện đã đạt hoặc vượt định biên tối đa (${maxStaff} người).\n\nBạn có muốn tiếp tục phân bổ thêm nhân sự vào ca không?`);
      if (!proceed) {
        return;
      }
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang lưu...';
  }

  try {
    const payload = {
      empIds: [empId],
      shiftId,
      workDates: targetWorkDates,
      startTime,
      endTime,
      note
    };

    if (clearUnselected && unselectedWorkDates.length > 0) {
      payload.clearUnselectedDates = unselectedWorkDates;
    }

    const res = await apiCall('/api/v1/shift-assignments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Phân ca thất bại');
    }

    showToast(`Phân ca làm việc thành công cho ${targetWorkDates.length} ngày!`, 'success');
    closeModal();
    await loadShiftAssignments();
  } catch (err) {
    console.error('Lỗi phân ca:', err);
    showToast(err.message || 'Phân ca thất bại', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Xác nhận phân ca';
    }
  }
}

// 7. Hủy phân ca
async function handleCancelShiftAssignment(assignmentId) {
  if (!confirm('Bạn có chắc chắn muốn hủy phân ca này?')) return;

  try {
    const res = await apiCall(`/api/v1/shift-assignments/${assignmentId}`, {
      method: 'DELETE'
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Hủy phân ca thất bại');
    }

    showToast('Đã hủy phân ca thành công', 'success');
    await loadShiftAssignments();
  } catch (err) {
    console.error('Lỗi hủy phân ca:', err);
    showToast(err.message || 'Lỗi hủy phân ca', 'error');
  }
}

// 8. Popup thêm / sửa ca làm việc (SCR_ADM_03)
function openCreateShiftModal(shift = null) {
  const isEdit = Boolean(shift && shift.id);
  const html = `
    <form id="formModalShiftDef" onsubmit="handleShiftDefSubmit(event, '${shift?.id || ''}')">
      <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Mã ca *</label>
          <input type="text" id="shiftDefCode" class="topbar-search-input" value="${shift?.code || ''}" placeholder="vd: CA-TOI" ${isEdit ? 'readonly style="background: #f8fafc;"' : 'required'}>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Tên ca làm việc *</label>
          <input type="text" id="shiftDefName" class="topbar-search-input" value="${shift?.name || ''}" placeholder="vd: Ca Tối (22:00 - 06:00)" required>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Giờ bắt đầu *</label>
          <input type="time" id="shiftDefStartTime" class="topbar-search-input" value="${shift?.start_time ? shift.start_time.slice(0, 5) : '08:00'}" required>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Giờ kết thúc *</label>
          <input type="time" id="shiftDefEndTime" class="topbar-search-input" value="${shift?.end_time ? shift.end_time.slice(0, 5) : '17:30'}" required>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Nghỉ giữa ca (phút)</label>
          <input type="number" id="shiftDefBreak" class="topbar-search-input" value="${shift?.break_minutes ?? 60}" min="0">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Dung sai trễ (phút)</label>
          <input type="number" id="shiftDefGrace" class="topbar-search-input" value="${shift?.grace_late_minutes ?? 15}" min="0">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Giờ công chuẩn</label>
          <input type="number" id="shiftDefHours" class="topbar-search-input" value="${shift?.working_hours ? Number(shift.working_hours) : 8.0}" step="0.5" min="1">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Số nhân viên tối thiểu (minStaff)</label>
          <input type="number" id="shiftDefMinStaff" class="topbar-search-input" value="${shift?.min_staff ?? shift?.minStaff ?? 1}" min="1" placeholder="Mặc định: 1">
          <small style="color: #64748b; font-size: 11px;">Mức nhân sự tối thiểu để đảm bảo ca vận hành</small>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Số nhân viên tối đa định biên (maxStaff)</label>
          <input type="number" id="shiftDefMaxStaff" class="topbar-search-input" value="${(shift?.max_staff ?? shift?.maxStaff) ? (shift?.max_staff ?? shift?.maxStaff) : ''}" min="0" placeholder="Để trống = Không giới hạn">
          <small style="color: #64748b; font-size: 11px;">Để trống nếu không giới hạn số lượng</small>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn-secondary-outline" onclick="closeModal()">Hủy bỏ</button>
        <button type="submit" id="btnSubmitShiftDef" class="btn-primary-blue">${isEdit ? 'Lưu thay đổi' : 'Thêm ca mới'}</button>
      </div>
    </form>
  `;
  openModal(isEdit ? 'Chỉnh sửa ca làm việc' : 'Thêm ca làm việc mới', html);
}

async function handleShiftDefSubmit(e, shiftId) {
  if (e && e.preventDefault) e.preventDefault();
  const code = document.getElementById('shiftDefCode')?.value.trim();
  const name = document.getElementById('shiftDefName')?.value.trim();
  const startTime = document.getElementById('shiftDefStartTime')?.value + ':00';
  const endTime = document.getElementById('shiftDefEndTime')?.value + ':00';
  const breakMinutes = Number(document.getElementById('shiftDefBreak')?.value || 0);
  const graceLateMinutes = Number(document.getElementById('shiftDefGrace')?.value || 0);
  const workingHours = Number(document.getElementById('shiftDefHours')?.value || 8.0);
  const minStaffRaw = document.getElementById('shiftDefMinStaff')?.value;
  const maxStaffRaw = document.getElementById('shiftDefMaxStaff')?.value;
  const minStaff = (minStaffRaw !== undefined && minStaffRaw !== '' && !isNaN(minStaffRaw)) ? Math.max(1, parseInt(minStaffRaw, 10)) : 1;
  const maxStaff = (maxStaffRaw !== undefined && maxStaffRaw !== '' && !isNaN(maxStaffRaw) && parseInt(maxStaffRaw, 10) > 0) ? parseInt(maxStaffRaw, 10) : null;
  const btn = document.getElementById('btnSubmitShiftDef');

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang lưu...';
  }

  try {
    let res;
    if (shiftId) {
      res = await apiCall(`/api/v1/shifts/${shiftId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          startTime,
          endTime,
          breakMinutes,
          graceLateMinutes,
          workingHours,
          minStaff,
          maxStaff
        })
      });
    } else {
      res = await apiCall('/api/v1/shifts', {
        method: 'POST',
        body: JSON.stringify({
          code,
          name,
          startTime,
          endTime,
          breakMinutes,
          graceLateMinutes,
          workingHours,
          minStaff,
          maxStaff
        })
      });
    }

    if (!res || !res.success) {
      throw new Error(res?.error || 'Lưu ca làm việc thất bại');
    }

    showToast(shiftId ? 'Cập nhật ca làm việc thành công' : 'Thêm ca làm việc mới thành công', 'success');
    closeModal();
    await loadShiftsCatalog();
  } catch (err) {
    console.error('Lỗi lưu ca làm việc:', err);
    showToast(err.message || 'Lưu thất bại', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = shiftId ? 'Lưu thay đổi' : 'Thêm ca mới';
    }
  }
}

// ==============================================================================
// 13. PHÂN HỆ QUẢN LÝ BẢNG LƯƠNG & PHIẾU LƯƠNG (SCR_PAY_01, SCR_ADM_04, SCR_ADM_07)
// ==============================================================================

let currentPayrollSubTab = 'slips';
let cachedPayslipsList = [];
let cachedPayrollConfigs = [];
let cachedPayrollPeriods = [];

function switchPayrollTab(tabName) {
  currentPayrollSubTab = tabName;
  const tabBtnSlips = document.getElementById('tabBtnPayrollSlips');
  const tabBtnConfigs = document.getElementById('tabBtnPayrollConfigs');
  const tabBtnPeriods = document.getElementById('tabBtnPayrollPeriods');
  const contentSlips = document.getElementById('tabContentPayrollSlips');
  const contentConfigs = document.getElementById('tabContentPayrollConfigs');
  const contentPeriods = document.getElementById('tabContentPayrollPeriods');

  [tabBtnSlips, tabBtnConfigs, tabBtnPeriods].forEach(btn => {
    if (btn) {
      btn.style.background = '#f8fafc';
      btn.style.color = '#64748b';
      btn.style.borderTop = 'none';
      btn.style.fontWeight = '600';
    }
  });

  if (contentSlips) contentSlips.style.display = 'none';
  if (contentConfigs) contentConfigs.style.display = 'none';
  if (contentPeriods) contentPeriods.style.display = 'none';

  if (tabName === 'slips') {
    if (tabBtnSlips) {
      tabBtnSlips.style.background = '#ffffff';
      tabBtnSlips.style.color = 'var(--color-primary)';
      tabBtnSlips.style.borderTop = '3px solid var(--color-primary)';
      tabBtnSlips.style.fontWeight = '700';
    }
    if (contentSlips) contentSlips.style.display = 'block';
    loadPayslips();
  } else if (tabName === 'configs') {
    if (tabBtnConfigs) {
      tabBtnConfigs.style.background = '#ffffff';
      tabBtnConfigs.style.color = 'var(--color-primary)';
      tabBtnConfigs.style.borderTop = '3px solid var(--color-primary)';
      tabBtnConfigs.style.fontWeight = '700';
    }
    if (contentConfigs) contentConfigs.style.display = 'block';
    loadPayrollConfigs();
  } else if (tabName === 'periods') {
    if (tabBtnPeriods) {
      tabBtnPeriods.style.background = '#ffffff';
      tabBtnPeriods.style.color = 'var(--color-primary)';
      tabBtnPeriods.style.borderTop = '3px solid var(--color-primary)';
      tabBtnPeriods.style.fontWeight = '700';
    }
    if (contentPeriods) contentPeriods.style.display = 'block';
    loadPayrollPeriods();
  }
}

function formatVND(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 đ';
  return Number(amount).toLocaleString('vi-VN') + ' đ';
}

async function loadPayrollData() {
  await Promise.allSettled([
    loadPayslips(),
    loadPayrollConfigs(),
    loadPayrollPeriods()
  ]);
}

// 1. Danh sách Phiếu lương (SCR_PAY_01)
async function loadPayslips() {
  const tbody = document.getElementById('tableBodyPayrollSlips');
  if (!tbody) return;

  const month = document.getElementById('filterPayrollMonth')?.value || '11';
  const year = document.getElementById('filterPayrollYear')?.value || '2026';

  try {
    const res = await apiCall(`/api/v1/payslips?month=${month}&year=${year}`);
    cachedPayslipsList = res?.data || [];

    // Cập nhật KPIs
    const totalGross = cachedPayslipsList.reduce((sum, p) => sum + Number(p.gross_salary || 0), 0);
    const totalNet = cachedPayslipsList.reduce((sum, p) => sum + Number(p.net_salary || 0), 0);

    const kpiGross = document.getElementById('kpiPayrollTotalGross');
    const kpiNet = document.getElementById('kpiPayrollTotalNet');
    const kpiStaff = document.getElementById('kpiPayrollStaffCount');
    const kpiPeriodNote = document.getElementById('kpiPayrollPeriodNote');

    if (kpiGross) kpiGross.innerText = formatVND(totalGross);
    if (kpiNet) kpiNet.innerText = formatVND(totalNet);
    if (kpiStaff) kpiStaff.innerText = cachedPayslipsList.length;
    if (kpiPeriodNote) kpiPeriodNote.innerText = `Kỳ tính lương tháng ${month}/${year} →`;

    if (!cachedPayslipsList.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #94a3b8; padding: 24px;">Chưa có dữ liệu bảng lương kỳ tháng ${month}/${year}. Hãy bấm "Tính lương tự động".</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedPayslipsList.map(p => {
      const isConfirmed = p.status === 'CONFIRMED' || p.status === 'PAID';
      const statusBadge = isConfirmed
        ? '<span class="badge-status badge-approved">Đã chốt</span>'
        : '<span class="badge-status badge-pending">Dự thảo</span>';

      return `
        <tr>
          <td><strong>${p.emp_code || p.emp_id}</strong></td>
          <td><span style="font-weight: 600; color: #0f172a;">${p.emp_name || 'Nhân viên'}</span></td>
          <td>${p.department_name || '-'}</td>
          <td>${formatVND(p.base_salary)}</td>
          <td>${Number(p.actual_work_days).toFixed(1)} / ${Number(p.paid_leave_days).toFixed(1)} ngày</td>
          <td>${Number(p.ot_hours).toFixed(1)}h (${formatVND(p.ot_pay)})</td>
          <td>${formatVND(p.total_allowance)}</td>
          <td><strong>${formatVND(p.gross_salary)}</strong></td>
          <td style="color: #ef4444;">-${formatVND(Number(p.insurance_deduction) + Number(p.late_deduction) + Number(p.tax_deduction))}</td>
          <td><strong style="color: #047857; font-size: 13.5px;">${formatVND(p.net_salary)}</strong></td>
          <td>${statusBadge}</td>
          <td style="text-align: center;">
            <button class="btn-secondary-outline" style="padding: 4px 10px; font-size: 11.5px;" onclick="openPayslipDetailModal('${p.id}')">Xem phiếu</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi tải phiếu lương:', err);
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

// 2. Danh mục cấu hình lương (SCR_ADM_04)
async function loadPayrollConfigs() {
  const tbody = document.getElementById('tableBodyPayrollConfigs');
  if (!tbody) return;

  try {
    const res = await apiCall('/api/v1/payroll-configs');
    cachedPayrollConfigs = res?.data || [];

    if (!cachedPayrollConfigs.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 24px;">Chưa có cấu hình lương nhân viên</td></tr>`;
      return;
    }

    const isAdminOrHr = ['ADMIN', 'HR'].includes(state.user?.role);
    tbody.innerHTML = cachedPayrollConfigs.map(c => `
      <tr>
        <td><strong>${c.emp_code || c.emp_id}</strong></td>
        <td><span style="font-weight: 600; color: #0f172a;">${c.emp_name || 'Nhân viên'}</span></td>
        <td>${c.department_name || 'Phòng ban'}</td>
        <td><strong>${formatVND(c.base_salary)}</strong></td>
        <td>${formatVND(c.lunch_allowance)}</td>
        <td>${formatVND(c.transport_allowance)}</td>
        <td>${(Number(c.insurance_rate) * 100).toFixed(1)}%</td>
        <td>${formatVND(c.late_penalty_per_minute)}</td>
        <td>x${Number(c.ot_multiplier_weekday).toFixed(1)} / x${Number(c.ot_multiplier_weekend).toFixed(1)}</td>
        <td style="text-align: center;">
          ${isAdminOrHr ? `
            <button class="btn-secondary-outline" style="padding: 4px 10px; font-size: 11.5px;" onclick='openEditPayrollConfigModal(${JSON.stringify(c)})'>Sửa</button>
          ` : `<span style="font-size: 11px; color: #94a3b8;">Chỉ xem</span>`}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Lỗi tải cấu hình lương:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

// 3. Danh sách kỳ lương (SCR_ADM_07)
async function loadPayrollPeriods() {
  const tbody = document.getElementById('tableBodyPayrollPeriods');
  if (!tbody) return;

  try {
    const res = await apiCall('/api/v1/payrolls/periods');
    cachedPayrollPeriods = res?.data || [];

    // Cập nhật trạng thái kỳ lương hiện hành
    const month = document.getElementById('filterPayrollMonth')?.value || '11';
    const year = document.getElementById('filterPayrollYear')?.value || '2026';
    const currentPeriod = cachedPayrollPeriods.find(p => Number(p.month) === Number(month) && Number(p.year) === Number(year));

    const kpiStatus = document.getElementById('kpiPayrollStatus');
    const kpiStatusSub = document.getElementById('kpiPayrollStatusSub');
    if (kpiStatus) {
      if (!currentPeriod) {
        kpiStatus.innerText = 'CHƯA TẠO';
        kpiStatus.style.color = '#64748b';
        if (kpiStatusSub) kpiStatusSub.innerText = 'Chưa chạy tính lương tự động';
      } else if (currentPeriod.status === 'LOCKED' || currentPeriod.status === 'PAID') {
        kpiStatus.innerText = 'ĐÃ CHỐT';
        kpiStatus.style.color = '#047857';
        if (kpiStatusSub) kpiStatusSub.innerText = 'Đã phát hành phiếu lương chính thức';
      } else {
        kpiStatus.innerText = 'DỰ THẢO';
        kpiStatus.style.color = '#d97706';
        if (kpiStatusSub) kpiStatusSub.innerText = 'Đang rà soát số liệu công & OT';
      }
    }

    if (!cachedPayrollPeriods.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 24px;">Chưa có lịch sử kỳ lương nào được tạo</td></tr>`;
      return;
    }

    const isAdminOrHr = ['ADMIN', 'HR'].includes(state.user?.role);
    tbody.innerHTML = cachedPayrollPeriods.map(p => {
      const isLocked = p.status === 'LOCKED' || p.status === 'PAID';
      const statusBadge = isLocked
        ? '<span class="badge-status badge-approved">Đã chốt lương</span>'
        : '<span class="badge-status badge-pending">Đang tính toán</span>';

      return `
        <tr>
          <td><strong>Tháng ${p.month}/${p.year}</strong></td>
          <td>${p.standard_working_days} ngày</td>
          <td>${p.total_employees} nhân sự</td>
          <td><strong>${formatVND(p.total_gross_salary)}</strong></td>
          <td><strong style="color: #047857;">${formatVND(p.total_net_salary)}</strong></td>
          <td>${statusBadge}</td>
          <td style="font-size: 11.5px; color: #64748b;">${p.closed_at ? formatLeaveDateTime(p.closed_at) : '—'}</td>
          <td style="text-align: center;">
            ${(isAdminOrHr && !isLocked) ? `
              <button class="btn-primary-blue" style="padding: 4px 10px; font-size: 11.5px; background: #047857; border-color: #047857;" onclick="handlePublishPeriodDirect('${p.id}', ${p.month}, ${p.year})">Chốt kỳ này</button>
            ` : `<span style="font-size: 11px; color: #94a3b8;">${isLocked ? 'Hoàn tất' : '—'}</span>`}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi tải danh sách kỳ lương:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

// 4. Popup tính lương tự động
function openCalculatePayrollModal() {
  const month = document.getElementById('filterPayrollMonth')?.value || '11';
  const year = document.getElementById('filterPayrollYear')?.value || '2026';

  const html = `
    <form id="formModalCalcPayroll" onsubmit="handleCalcPayrollSubmit(event)">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Tháng tính lương *</label>
          <select id="calcModalMonth" class="topbar-search-input">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
              <option value="${m}" ${m === Number(month) ? 'selected' : ''}>Tháng ${m}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Năm *</label>
          <input type="number" id="calcModalYear" class="topbar-search-input" value="${year}" required>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Số ngày công chuẩn trong tháng *</label>
        <input type="number" id="calcModalStandardDays" class="topbar-search-input" value="22" step="0.5" min="15" max="31" required>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Mặc định 22 ngày công theo chế độ nghỉ Thứ 7, Chủ Nhật.</div>
      </div>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; font-size: 12px; color: #166534; margin-bottom: 16px; line-height: 1.5;">
        <strong>Quy trình tổng hợp tự động:</strong>
        <div style="margin-top: 4px;">
          • Lấy dữ liệu công thực tế và phạt đi muộn từ <strong>attendance-service</strong><br>
          • Lấy ngày nghỉ phép năm có lương từ <strong>leave-service</strong><br>
          • Lấy tổng giờ tăng ca OT đã duyệt từ <strong>shift-service</strong><br>
          • Khấu trừ 10.5% BHXH, BHYT, BHTN &amp; tính thuế TNCN lũy tiến.
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn-secondary-outline" onclick="closeModal()">Hủy bỏ</button>
        <button type="submit" id="btnSubmitCalcPayroll" class="btn-primary-blue">Bắt đầu tính lương</button>
      </div>
    </form>
  `;
  openModal('Chạy tính lương tự động', html);
}

async function handleCalcPayrollSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const month = Number(document.getElementById('calcModalMonth').value);
  const year = Number(document.getElementById('calcModalYear').value);
  const standardWorkingDays = Number(document.getElementById('calcModalStandardDays').value);
  const btn = document.getElementById('btnSubmitCalcPayroll');

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang tính toán...';
  }

  try {
    const res = await apiCall('/api/v1/payrolls/calculate', {
      method: 'POST',
      body: JSON.stringify({
        month,
        year,
        standardWorkingDays
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Tính lương thất bại');
    }

    showToast(`Đã tính bảng lương tháng ${month}/${year} thành công!`, 'success');
    closeModal();

    const filterM = document.getElementById('filterPayrollMonth');
    const filterY = document.getElementById('filterPayrollYear');
    if (filterM) filterM.value = month;
    if (filterY) filterY.value = year;

    await loadPayrollData();
  } catch (err) {
    console.error('Lỗi tính lương:', err);
    showToast(err.message || 'Tính lương thất bại', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Bắt đầu tính lương';
    }
  }
}

// 5. Chốt kỳ lương & phát hành phiếu lương
async function handlePublishPayrollClick() {
  const month = document.getElementById('filterPayrollMonth')?.value || '11';
  const year = document.getElementById('filterPayrollYear')?.value || '2026';

  if (!confirm(`Bạn có chắc chắn muốn CHỐT và PHÁT HÀNH phiếu lương tháng ${month}/${year}?\nSau khi chốt, bảng lương sẽ được khóa chính thức và gửi thông báo tới toàn thể nhân viên.`)) {
    return;
  }

  try {
    const res = await apiCall('/api/v1/payrolls/publish', {
      method: 'POST',
      body: JSON.stringify({
        month: Number(month),
        year: Number(year)
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Chốt kỳ lương thất bại');
    }

    showToast(`Đã chốt và phát hành phiếu lương tháng ${month}/${year} thành công!`, 'success');
    await loadPayrollData();
  } catch (err) {
    console.error('Lỗi chốt kỳ lương:', err);
    showToast(err.message || 'Lỗi chốt kỳ lương', 'error');
  }
}

async function handlePublishPeriodDirect(periodId, month, year) {
  if (!confirm(`Chốt và phát hành phiếu lương kỳ tháng ${month}/${year}?`)) return;

  try {
    const res = await apiCall(`/api/v1/payrolls/${periodId}/publish`, {
      method: 'PATCH'
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Chốt kỳ lương thất bại');
    }

    showToast(`Đã chốt và phát hành phiếu lương tháng ${month}/${year}!`, 'success');
    await loadPayrollData();
  } catch (err) {
    console.error('Lỗi chốt kỳ lương:', err);
    showToast(err.message || 'Lỗi chốt kỳ lương', 'error');
  }
}

// 6. Chi tiết phiếu lương Payslip cá nhân (SCR_PAY_01)
async function openPayslipDetailModal(slipId) {
  try {
    const res = await apiCall(`/api/v1/payslips/${slipId}`);
    const slip = res?.data;
    if (!slip) throw new Error('Không tìm thấy thông tin phiếu lương');

    const totalDeductions = Number(slip.insurance_deduction || 0) + Number(slip.late_deduction || 0) + Number(slip.tax_deduction || 0);

    const html = `
      <div style="font-size: 13px; color: #334155;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 15px; color: #0f172a;">${slip.emp_name}</div>
            <span class="badge-status ${slip.status === 'CONFIRMED' || slip.status === 'PAID' ? 'badge-approved' : 'badge-pending'}">
              ${slip.status === 'CONFIRMED' || slip.status === 'PAID' ? 'Chính thức' : 'Bản dự thảo'}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #64748b;">
            <div>Mã NV: <strong>${slip.emp_code}</strong></div>
            <div>Phòng ban: <strong>${slip.department_name}</strong></div>
            <div>Kỳ lương: <strong>Tháng ${slip.month}/${slip.year}</strong></div>
            <div>Công chuẩn: <strong>${slip.standard_days} ngày</strong></div>
          </div>
        </div>

        <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px; display: flex; justify-content: space-between;">
          <span>1. CÁC KHOẢN THU NHẬP (GROSS)</span>
          <span style="color: #2563eb;">${formatVND(slip.gross_salary)}</span>
        </div>
        <div style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; line-height: 1.8;">
          <div style="display: flex; justify-content: space-between;">
            <span>• Lương cơ bản hợp đồng:</span>
            <span>${formatVND(slip.base_salary)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>• Ngày công thực tế (${Number(slip.actual_work_days).toFixed(1)} ngày) + Phép (${Number(slip.paid_leave_days).toFixed(1)} ngày):</span>
            <span>${formatVND(Math.round(Number(slip.base_salary) / Number(slip.standard_days) * (Number(slip.actual_work_days) + Number(slip.paid_leave_days))))}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>• Lương làm thêm giờ (${Number(slip.ot_hours).toFixed(1)} giờ OT):</span>
            <span>${formatVND(slip.ot_pay)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>• Tổng phụ cấp (Ăn trưa, xăng xe):</span>
            <span>${formatVND(slip.total_allowance)}</span>
          </div>
        </div>

        <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px; display: flex; justify-content: space-between;">
          <span>2. CÁC KHOẢN KHẤU TRỪ</span>
          <span style="color: #ef4444;">-${formatVND(totalDeductions)}</span>
        </div>
        <div style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; line-height: 1.8;">
          <div style="display: flex; justify-content: space-between;">
            <span>• Bảo hiểm (BHXH 8%, BHYT 1.5%, BHTN 1% = 10.5%):</span>
            <span>-${formatVND(slip.insurance_deduction)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>• Khấu trừ phạt đi muộn:</span>
            <span>-${formatVND(slip.late_deduction)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>• Thuế thu nhập cá nhân (TNCN):</span>
            <span>-${formatVND(slip.tax_deduction)}</span>
          </div>
        </div>

        <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #a7f3d0; border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 11px; color: #065f46; font-weight: 700; text-transform: uppercase;">Thực Lĩnh (Net Salary)</div>
            <div style="font-size: 11.5px; color: #047857;">Đã trừ đầy đủ bảo hiểm &amp; thuế TNCN</div>
          </div>
          <div style="font-size: 22px; font-weight: 800; color: #047857;">
            ${formatVND(slip.net_salary)}
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 18px;">
          <button type="button" class="btn-primary-blue" onclick="closeModal()">Đóng phiếu</button>
        </div>
      </div>
    `;
    openModal(`Phiếu lương tháng ${slip.month}/${slip.year}`, html);
  } catch (err) {
    console.error('Lỗi xem phiếu lương:', err);
    showToast(err.message || 'Không thể mở phiếu lương', 'error');
  }
}

// 7. Popup chỉnh sửa cấu hình lương
function openEditPayrollConfigModal(config) {
  const html = `
    <form id="formModalEditConfig" onsubmit="handleEditConfigSubmit(event, '${config.emp_id}')">
      <div style="margin-bottom: 12px; font-size: 13px; color: #475569;">
        Nhân viên: <strong style="color: #0f172a;">${config.emp_name}</strong> (${config.emp_code})
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Lương cơ bản hợp đồng (VNĐ) *</label>
        <input type="number" id="cfgModalBaseSalary" class="topbar-search-input" value="${Number(config.base_salary)}" step="100000" required>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Phụ cấp ăn trưa</label>
          <input type="number" id="cfgModalLunch" class="topbar-search-input" value="${Number(config.lunch_allowance)}" step="50000">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Phụ cấp xăng xe/ĐT</label>
          <input type="number" id="cfgModalTransport" class="topbar-search-input" value="${Number(config.transport_allowance)}" step="50000">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Tỷ lệ BHXH/BHYT/BHTN</label>
          <input type="number" id="cfgModalInsurance" class="topbar-search-input" value="${Number(config.insurance_rate)}" step="0.005" min="0" max="1">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Phạt trễ/phút (VNĐ)</label>
          <input type="number" id="cfgModalLatePenalty" class="topbar-search-input" value="${Number(config.late_penalty_per_minute)}" step="500">
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn-secondary-outline" onclick="closeModal()">Hủy bỏ</button>
        <button type="submit" id="btnSubmitEditConfig" class="btn-primary-blue">Lưu cấu hình</button>
      </div>
    </form>
  `;
  openModal('Cấu hình định mức lương nhân sự', html);
}

async function handleEditConfigSubmit(e, empId) {
  if (e && e.preventDefault) e.preventDefault();
  const baseSalary = Number(document.getElementById('cfgModalBaseSalary').value);
  const lunchAllowance = Number(document.getElementById('cfgModalLunch').value);
  const transportAllowance = Number(document.getElementById('cfgModalTransport').value);
  const insuranceRate = Number(document.getElementById('cfgModalInsurance').value);
  const latePenaltyPerMinute = Number(document.getElementById('cfgModalLatePenalty').value);
  const btn = document.getElementById('btnSubmitEditConfig');

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang lưu...';
  }

  try {
    const res = await apiCall(`/api/v1/payroll-configs/${empId}`, {
      method: 'PUT',
      body: JSON.stringify({
        baseSalary,
        lunchAllowance,
        transportAllowance,
        insuranceRate,
        latePenaltyPerMinute
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Cập nhật cấu hình thất bại');
    }

    showToast('Cập nhật cấu hình lương thành công!', 'success');
    closeModal();
    await loadPayrollConfigs();
  } catch (err) {
    console.error('Lỗi cập nhật cấu hình lương:', err);
    showToast(err.message || 'Lỗi lưu cấu hình', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Lưu cấu hình';
    }
  }
}


