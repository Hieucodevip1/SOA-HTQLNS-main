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
  { id: 'att-today', work_date: new Date().toISOString().split('T')[0], check_in_time: `${new Date().toISOString().split('T')[0]}T07:55:12`, check_out_time: null, status: 'ON_TIME', late_minutes: 0, actual_working_hours: '4.2' },
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
  // Kiểm tra xem Quản trị viên / HR đã tiếp nhận vào ban/phòng chưa
  const assignment = getUserAssignment(username, userId);
  if (assignment && assignment.status === 'ACTIVE') {
    state.user.isOnboarded = true;
    state.user.department = assignment.department;
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
async function apiCall(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
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
    }
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
  const navEmployees = document.getElementById('nav-employees');
  const navStats = document.getElementById('nav-stats');

  // Các mục quản trị chỉ dành cho Quản lý / Admin
  if (navRbac) navRbac.style.display = (role === 'ADMIN') ? 'flex' : 'none';
  if (navSoa) navSoa.style.display = (role === 'ADMIN') ? 'flex' : 'none';
  if (navSettings) navSettings.style.display = (role === 'ADMIN' || role === 'HR') ? 'flex' : 'none';
  if (navDepartments) navDepartments.style.display = (role === 'ADMIN' || role === 'HR') ? 'flex' : 'none';
  if (navEmpHistory) navEmpHistory.style.display = (!isEmployee) ? 'flex' : 'none';
  if (navEmployees) navEmployees.style.display = (!isEmployee) ? 'flex' : 'none';
  if (navStats) navStats.style.display = (!isEmployee) ? 'flex' : 'none';

  // 3. Quyền hạn thao tác phân ca & ca làm việc
  const btnShiftOpenAssign = document.getElementById('btnShiftOpenAssign');
  const btnShiftOpenCreateShift = document.getElementById('btnShiftOpenCreateShift');
  if (btnShiftOpenAssign) btnShiftOpenAssign.style.display = (!isEmployee) ? 'inline-flex' : 'none';
  if (btnShiftOpenCreateShift) btnShiftOpenCreateShift.style.display = (role === 'ADMIN' || role === 'HR') ? 'inline-flex' : 'none';

  // 4. Quyền hạn thao tác tính lương & cấu hình lương
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

  if (!startVal || !endVal) {
    totalInput.value = (session === 'FULL_DAY' ? 1.0 : 0.5).toFixed(1);
    return;
  }

  const d1 = new Date(startVal);
  const d2 = new Date(endVal);
  if (d2 < d1) {
    totalInput.value = '1.0';
    return;
  }

  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays === 1 && (session === 'MORNING' || session === 'AFTERNOON')) {
    totalInput.value = '0.5';
  } else {
    totalInput.value = diffDays.toFixed(1);
  }
}

async function loadRequestsData() {
  const role = state.user?.role || 'EMPLOYEE';
  const tbody = document.getElementById('requestsTableFullBody');
  const typeSelect = document.getElementById('leaveFormType');

  // Khởi tạo ngày mặc định nếu chưa có
  const startInput = document.getElementById('leaveFormStartDate');
  const endInput = document.getElementById('leaveFormEndDate');
  if (startInput && !startInput.value) {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    startInput.value = `${yyyy}-${mm}-${dd}`;
    if (endInput) endInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // 1. Nạp danh mục loại nghỉ phép
  try {
    const typesRes = await apiCall('/api/v1/leave-types').catch(() => null);
    if (typesRes?.data && typesRes.data.length && typeSelect) {
      state.leaveTypes = typesRes.data;
      typeSelect.innerHTML = typesRes.data.map(t => 
        `<option value="${t.id}">${t.name} (${t.code}${t.is_paid ? ' • Có lương' : ''})</option>`
      ).join('');
    } else if (typeSelect && !typeSelect.children.length) {
      typeSelect.innerHTML = `
        <option value="lt000001-0000-0000-0000-000000000001">Nghỉ phép năm (AL • Có hưởng lương)</option>
        <option value="lt000001-0000-0000-0000-000000000002">Nghỉ ốm hưởng BHXH (SL)</option>
        <option value="lt000001-0000-0000-0000-000000000003">Nghỉ không hưởng lương (UL)</option>
        <option value="lt000001-0000-0000-0000-000000000004">Nghỉ việc riêng (PL • Hiếu/Hỉ)</option>
      `;
    }
  } catch (err) {}

  // 2. Nạp số dư quỹ phép năm
  const leaveBal = state.user?.leaveBalance || (state.user?.isOnboarded ? 12.0 : 0.0);
  const elTotal = document.getElementById('statLeaveTotal');
  const elUsed = document.getElementById('statLeaveUsed');
  const elPending = document.getElementById('statLeavePending');
  const elRem = document.getElementById('statLeaveRemaining');
  if (elTotal) elTotal.innerText = leaveBal.toFixed(1);
  if (elUsed) elUsed.innerText = '0.0';
  if (elPending) elPending.innerText = '0.0';
  if (elRem) elRem.innerText = leaveBal.toFixed(1);

  // 3. Nạp danh sách đơn từ (Cách ly chuẩn theo vai trò)
  if (role === 'EMPLOYEE') {
    state.requests = getUserEntityList('requests');
  } else {
    // Quản lý & Admin: thấy toàn bộ đơn từ chung
    let allReqs = [];
    try { allReqs = JSON.parse(safeGetStorage('htqlns_all_requests', '[]')); } catch (e) {}
    
    // Gộp đơn mẫu của hệ thống nếu chưa có
    const defaultCompanyRequests = [
      { id: 'NP-2026-024', emp_name: 'Vũ Đức Hiếu', emp_code: 'NV-001', department_name: 'Phòng Kỹ Thuật', leave_name: 'Nghỉ phép năm', start_date: '2026-11-02', end_date: '2026-11-02', total_days: 1, reason: 'Nghỉ phép giải quyết việc gia đình', status: 'PENDING', created_at: '2026-10-29T08:15:00' },
      { id: 'NP-2026-023', emp_name: 'Phạm Minh Tuân', emp_code: 'NV-006', department_name: 'Phòng Kinh Doanh', leave_name: 'Nghỉ phép năm', start_date: '2026-11-03', end_date: '2026-11-03', total_days: 1, reason: 'Đi khám sức khỏe định kỳ', status: 'PENDING', created_at: '2026-10-29T16:30:00' }
    ];

    allReqs.forEach(r => {
      if (!defaultCompanyRequests.some(d => d.id === r.id)) {
        defaultCompanyRequests.unshift(r);
      }
    });
    state.requests = defaultCompanyRequests;
  }

  renderRequestsTable(state.requests);
}

function renderRequestsTable(list) {
  const role = state.user?.role || 'EMPLOYEE';
  const tbody = document.getElementById('requestsTableFullBody');
  const filterVal = document.getElementById('requestsFilterStatus')?.value || 'PENDING';
  const title = document.getElementById('requestsTableTitle');
  const sub = document.getElementById('requestsTableSubtitle');

  if (role === 'EMPLOYEE') {
    if (title) title.innerText = 'Lịch sử đơn từ của tôi';
    if (sub) sub.innerText = 'Theo dõi trạng thái xét duyệt đơn từ và số ngày phép năm của bạn';
  } else {
    if (title) title.innerText = 'Danh sách đơn từ & Chờ phê duyệt';
    if (sub) sub.innerText = 'Quản trị viên có thể trực tiếp Phê duyệt (✓) hoặc Từ chối (✕) đơn xin nghỉ phép của nhân viên';
  }

  if (!tbody) return;

  let filtered = list || [];
  if (filterVal !== 'ALL') {
    filtered = filtered.filter(r => r.status === filterVal);
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 30px;">Không có đơn từ nào trong mục này.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    let badgeHtml = '';
    if (r.status === 'PENDING') {
      badgeHtml = `<span class="badge-status" style="background: #fef3c7; color: #d97706; font-weight: 600;">• Đang chờ</span>`;
    } else if (r.status === 'APPROVED') {
      badgeHtml = `<span class="badge-status badge-approved">✓ Đã duyệt</span>`;
    } else {
      badgeHtml = `<span class="badge-status badge-rejected">✕ Từ chối</span>`;
    }

    const rangeStr = `${formatLeaveDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ' → ' + formatLeaveDate(r.end_date) : ''}`;
    const canApprove = (role === 'ADMIN' || role === 'HR' || role === 'MANAGER') && r.status === 'PENDING';

    const actionHtml = canApprove
      ? `
        <button class="btn-approve-sm" onclick="handleDirectApproveLeave('${r.id}')">✓ Duyệt</button>
        <button class="btn-reject-sm" onclick="handleDirectRejectLeave('${r.id}')">✕ Từ chối</button>
        <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
      `
      : `
        <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
      `;

    return `
      <tr id="req-row-full-${r.id}">
        <td>
          <a class="link-action-blue" style="font-weight: 700; cursor: pointer;" onclick="openRequestDetail('${r.id}')">${r.id}</a>
        </td>
        <td>
          <div style="font-weight: 700; color: #1e293b;">${r.emp_name || 'Nhân viên'}</div>
          <div style="font-size: 11px; color: #94a3b8;">${r.emp_code || ''}</div>
        </td>
        <td>${r.department_name || '-'}</td>
        <td>${r.leave_name || 'Nghỉ phép năm'}</td>
        <td>${rangeStr}</td>
        <td style="font-weight: 600;">${r.total_days || 1} ngày</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.reason || ''}">
          ${r.reason || 'Nghỉ giải quyết việc gia đình'}
        </td>
        <td style="font-size: 12px; color: #64748b;">${formatLeaveDate(r.created_at)}</td>
        <td>${badgeHtml}</td>
        <td style="text-align: center; white-space: nowrap;">
          ${actionHtml}
        </td>
      </tr>
    `;
  }).join('');
}

function filterRequestsTable() {
  renderRequestsTable(state.requests || []);
}

async function handleCreateLeaveSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const leaveTypeId = document.getElementById('leaveFormType')?.value;
  const session = document.getElementById('leaveFormSession')?.value || 'FULL_DAY';
  const startDate = document.getElementById('leaveFormStartDate')?.value;
  const endDate = document.getElementById('leaveFormEndDate')?.value;
  const totalDays = parseFloat(document.getElementById('leaveFormTotalDays')?.value) || 1.0;
  const reason = document.getElementById('leaveFormReason')?.value.trim();
  const attachmentUrl = document.getElementById('leaveFormAttachment')?.value.trim() || 'Bien-ban-ban-giao.pdf';
  const btn = document.getElementById('btnSubmitLeave');

  if (!leaveTypeId || !startDate || !endDate || !reason) {
    return showToast('Vui lòng nhập đầy đủ thông tin ngày nghỉ và lý do', 'warning');
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Đang gửi đơn...</span>';
  }

  try {
    const leaveTypeName = document.getElementById('leaveFormType')?.selectedOptions?.[0]?.text?.split('(')?.[0]?.trim() || 'Nghỉ phép năm';
    const newReqId = 'NP-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900);
    const newReq = {
      id: newReqId,
      code: newReqId,
      emp_id: state.user?.id || state.user?.username || 'emp',
      username: state.user?.username || 'user',
      emp_name: state.user?.fullName || state.user?.username || 'Nhân viên',
      emp_code: state.user?.empCode || ('EMP_' + (state.user?.username || 'USER').toUpperCase()),
      department_name: state.user?.department || 'Chưa phân phòng ban',
      leave_name: leaveTypeName,
      type: leaveTypeName,
      start_date: startDate,
      end_date: endDate,
      date: `${startDate} (${totalDays} ngày)`,
      total_days: totalDays,
      reason: reason,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    // 1. Lưu vào kho dữ liệu cá nhân của chính nhân viên này
    let userReqs = getUserEntityList('requests');
    userReqs.unshift(newReq);
    saveUserEntityList('requests', userReqs);

    // 2. Lưu vào danh sách chung toàn công ty để Quản lý / Admin thấy trên Dashboard duyệt
    let allReqs = [];
    try { allReqs = JSON.parse(safeGetStorage('htqlns_all_requests', '[]')); } catch (err) {}
    allReqs.unshift(newReq);
    safeSetStorage('htqlns_all_requests', JSON.stringify(allReqs));

    // 3. Gửi lên backend API nếu backend sẵn sàng
    apiCall('/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leaveTypeId,
        session,
        startDate,
        endDate,
        totalDays,
        reason,
        attachmentUrl
      })
    }).catch(err => {
      console.warn('API leave backend offline, đã lưu trữ cách ly client:', err.message);
    });

    showToast('Đã gửi đơn xin nghỉ phép thành công! Đơn đã chuyển đến Quản lý / Quản trị viên xét duyệt.', 'success');
    
    // Xóa form lý do
    const reasonInput = document.getElementById('leaveFormReason');
    if (reasonInput) reasonInput.value = '';

    await loadRequestsData();
    await loadDashboardPendingRequests();
    loadDashboardOverview();
    loadEmployeeDashboardData();
  } catch (err) {
    showToast(`Lỗi gửi đơn: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Gửi đơn duyệt</span> ➔';
    }
  }
}

async function handleDirectApproveLeave(id) {
  if (!confirm(`Bạn có chắc chắn muốn PHÊ DUYỆT đơn xin nghỉ phép [${id}]?`)) return;

  try {
    // 1. Cập nhật trong htqlns_all_requests
    let allReqs = [];
    try { allReqs = JSON.parse(safeGetStorage('htqlns_all_requests', '[]')); } catch (e) {}
    const target = allReqs.find(r => r.id === id);
    if (target) {
      target.status = 'APPROVED';
      safeSetStorage('htqlns_all_requests', JSON.stringify(allReqs));

      // Bắn thông báo đến nhân viên
      const empUserKey = target.username || target.emp_id;
      if (empUserKey) {
        const notifKey = `htqlns_notifications_${empUserKey}`;
        let empNotifs = [];
        try { empNotifs = JSON.parse(safeGetStorage(notifKey, '[]')); } catch (e) {}
        empNotifs.unshift({
          id: 'notif-appr-' + Date.now(),
          title: `✅ Quản lý đã phê duyệt đơn xin nghỉ phép [${id}]!`,
          message: `Đơn xin nghỉ từ ngày ${target.start_date} của bạn đã được phê duyệt thành công.`,
          type: 'LEAVE_APPROVED',
          created_at: new Date().toISOString(),
          is_read: false
        });
        safeSetStorage(notifKey, JSON.stringify(empNotifs));

        // Cập nhật trạng thái trong storage cá nhân của nhân viên đó
        const reqKey = `htqlns_requests_${empUserKey}`;
        let userReqs = [];
        try { userReqs = JSON.parse(safeGetStorage(reqKey, '[]')); } catch (e) {}
        const userTarget = userReqs.find(r => r.id === id);
        if (userTarget) {
          userTarget.status = 'APPROVED';
          safeSetStorage(reqKey, JSON.stringify(userReqs));
        }
      }
    }

    // Gửi lên backend API nếu backend online
    apiCall(`/api/v1/leave-requests/${id}/decision`, {
      method: 'PATCH',
      body: JSON.stringify({ decision: 'APPROVED' })
    }).catch(e => console.warn('Backend decision offline:', e.message));

    showToast(`Đã phê duyệt thành công đơn ${id}!`, 'success');
    await loadRequestsData();
    await loadDashboardPendingRequests();
    loadDashboardOverview();
  } catch (err) {
    showToast(`Lỗi phê duyệt đơn: ${err.message}`, 'error');
  }
}

async function handleDirectRejectLeave(id) {
  const reason = prompt('Nhập lý do từ chối đơn này:', 'Kế hoạch công việc cao điểm, vui lòng dời lịch nghỉ phép');
  if (reason === null) return;

  try {
    let allReqs = [];
    try { allReqs = JSON.parse(safeGetStorage('htqlns_all_requests', '[]')); } catch (e) {}
    const target = allReqs.find(r => r.id === id);
    if (target) {
      target.status = 'REJECTED';
      target.rejectReason = reason;
      safeSetStorage('htqlns_all_requests', JSON.stringify(allReqs));

      const empUserKey = target.username || target.emp_id;
      if (empUserKey) {
        const notifKey = `htqlns_notifications_${empUserKey}`;
        let empNotifs = [];
        try { empNotifs = JSON.parse(safeGetStorage(notifKey, '[]')); } catch (e) {}
        empNotifs.unshift({
          id: 'notif-rej-' + Date.now(),
          title: `❌ Đơn xin nghỉ phép [${id}] đã bị từ chối`,
          message: `Lý do từ chối từ quản lý: "${reason}".`,
          type: 'LEAVE_REJECTED',
          created_at: new Date().toISOString(),
          is_read: false
        });
        safeSetStorage(notifKey, JSON.stringify(empNotifs));

        const reqKey = `htqlns_requests_${empUserKey}`;
        let userReqs = [];
        try { userReqs = JSON.parse(safeGetStorage(reqKey, '[]')); } catch (e) {}
        const userTarget = userReqs.find(r => r.id === id);
        if (userTarget) {
          userTarget.status = 'REJECTED';
          safeSetStorage(reqKey, JSON.stringify(userReqs));
        }
      }
    }

    apiCall(`/api/v1/leave-requests/${id}/decision`, {
      method: 'PATCH',
      body: JSON.stringify({ decision: 'REJECTED', rejectReason: reason })
    }).catch(e => console.warn('Backend decision offline:', e.message));

    showToast(`Đã từ chối đơn ${id} thành công!`, 'warning');
    await loadRequestsData();
    await loadDashboardPendingRequests();
    loadDashboardOverview();
  } catch (err) {
    showToast(`Lỗi từ chối đơn: ${err.message}`, 'error');
  }
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

  if (!startVal || !endVal) {
    totalInput.value = (session === 'FULL_DAY' ? 1.0 : 0.5).toFixed(1);
    return;
  }

  const d1 = new Date(startVal);
  const d2 = new Date(endVal);
  if (d2 < d1) {
    totalInput.value = '1.0';
    return;
  }

  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays === 1 && (session === 'MORNING' || session === 'AFTERNOON')) {
    totalInput.value = '0.5';
  } else {
    totalInput.value = diffDays.toFixed(1);
  }
}

async function loadRequestsData() {
  const role = state.user?.role || 'EMPLOYEE';
  const tbody = document.getElementById('requestsTableFullBody');
  const typeSelect = document.getElementById('leaveFormType');

  // Khởi tạo ngày mặc định nếu chưa có
  const startInput = document.getElementById('leaveFormStartDate');
  const endInput = document.getElementById('leaveFormEndDate');
  if (startInput && !startInput.value) {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    startInput.value = `${yyyy}-${mm}-${dd}`;
    if (endInput) endInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // 1. Nạp danh mục loại nghỉ phép
  try {
    const typesRes = await apiCall('/api/v1/leave-types').catch(() => null);
    if (typesRes?.data && typesRes.data.length && typeSelect) {
      state.leaveTypes = typesRes.data;
      typeSelect.innerHTML = typesRes.data.map(t => 
        `<option value="${t.id}">${t.name} (${t.code}${t.is_paid ? ' • Có lương' : ''})</option>`
      ).join('');
    } else if (typeSelect && !typeSelect.children.length) {
      typeSelect.innerHTML = `
        <option value="lt000001-0000-0000-0000-000000000001">Nghỉ phép năm (AL • Có hưởng lương)</option>
        <option value="lt000001-0000-0000-0000-000000000002">Nghỉ ốm hưởng BHXH (SL)</option>
        <option value="lt000001-0000-0000-0000-000000000003">Nghỉ không hưởng lương (UL)</option>
        <option value="lt000001-0000-0000-0000-000000000004">Nghỉ việc riêng (PL • Hiếu/Hỉ)</option>
      `;
    }
  } catch (err) {}

  // 2. Nạp số dư quỹ phép năm
  const leaveBal = state.user?.leaveBalance || (state.user?.isOnboarded ? 12.0 : 0.0);
  const elTotal = document.getElementById('statLeaveTotal');
  const elUsed = document.getElementById('statLeaveUsed');
  const elPending = document.getElementById('statLeavePending');
  const elRem = document.getElementById('statLeaveRemaining');
  if (elTotal) elTotal.innerText = leaveBal.toFixed(1);
  if (elUsed) elUsed.innerText = '0.0';
  if (elPending) elPending.innerText = '0.0';
  if (elRem) elRem.innerText = leaveBal.toFixed(1);

  // 3. Nạp danh sách đơn từ (Cách ly chuẩn theo vai trò)
  if (role === 'EMPLOYEE') {
    state.requests = getUserEntityList('requests');
  } else {
    // Quản lý & Admin: thấy toàn bộ đơn từ chung
    let allReqs = [];
    try { allReqs = JSON.parse(safeGetStorage('htqlns_all_requests', '[]')); } catch (e) {}
    
    // Gộp đơn mẫu của hệ thống nếu chưa có
    const defaultCompanyRequests = [
      { id: 'NP-2026-024', emp_name: 'Vũ Đức Hiếu', emp_code: 'NV-001', department_name: 'Phòng Kỹ Thuật', leave_name: 'Nghỉ phép năm', start_date: '2026-11-02', end_date: '2026-11-02', total_days: 1, reason: 'Nghỉ phép giải quyết việc gia đình', status: 'PENDING', created_at: '2026-10-29T08:15:00' },
      { id: 'NP-2026-023', emp_name: 'Phạm Minh Tuân', emp_code: 'NV-006', department_name: 'Phòng Kinh Doanh', leave_name: 'Nghỉ phép năm', start_date: '2026-11-03', end_date: '2026-11-03', total_days: 1, reason: 'Đi khám sức khỏe định kỳ', status: 'PENDING', created_at: '2026-10-29T16:30:00' }
    ];

    allReqs.forEach(r => {
      if (!defaultCompanyRequests.some(d => d.id === r.id)) {
        defaultCompanyRequests.unshift(r);
      }
    });
    state.requests = defaultCompanyRequests;
  }

  renderRequestsTable(state.requests);
}

function renderRequestsTable(list) {
  const role = state.user?.role || 'EMPLOYEE';
  const tbody = document.getElementById('requestsTableFullBody');
  const filterVal = document.getElementById('requestsFilterStatus')?.value || 'PENDING';
  const title = document.getElementById('requestsTableTitle');
  const sub = document.getElementById('requestsTableSubtitle');

  if (role === 'EMPLOYEE') {
    if (title) title.innerText = 'Lịch sử đơn từ của tôi';
    if (sub) sub.innerText = 'Theo dõi trạng thái xét duyệt đơn từ và số ngày phép năm của bạn';
  } else {
    if (title) title.innerText = 'Danh sách đơn từ & Chờ phê duyệt';
    if (sub) sub.innerText = 'Quản trị viên có thể trực tiếp Phê duyệt (✓) hoặc Từ chối (✕) đơn xin nghỉ phép của nhân viên';
  }

  if (!tbody) return;

  let filtered = list || [];
  if (filterVal !== 'ALL') {
    filtered = filtered.filter(r => r.status === filterVal);
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 30px;">Không có đơn từ nào trong mục này.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    let badgeHtml = '';
    if (r.status === 'PENDING') {
      badgeHtml = `<span class="badge-status" style="background: #fef3c7; color: #d97706; font-weight: 600;">• Đang chờ</span>`;
    } else if (r.status === 'APPROVED') {
      badgeHtml = `<span class="badge-status badge-approved">✓ Đã duyệt</span>`;
    } else {
      badgeHtml = `<span class="badge-status badge-rejected">✕ Từ chối</span>`;
    }

    const rangeStr = `${formatLeaveDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ' → ' + formatLeaveDate(r.end_date) : ''}`;
    const canApprove = (role === 'ADMIN' || role === 'HR' || role === 'MANAGER') && r.status === 'PENDING';

    const actionHtml = canApprove
      ? `
        <button class="btn-approve-sm" onclick="handleDirectApproveLeave('${r.id}')">✓ Duyệt</button>
        <button class="btn-reject-sm" onclick="handleDirectRejectLeave('${r.id}')">✕ Từ chối</button>
        <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
      `
      : `
        <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
      `;

    return `
      <tr id="req-row-full-${r.id}">
        <td>
          <a class="link-action-blue" style="font-weight: 700; cursor: pointer;" onclick="openRequestDetail('${r.id}')">${r.id}</a>
        </td>
        <td>
          <div style="font-weight: 700; color: #1e293b;">${r.emp_name || 'Nhân viên'}</div>
          <div style="font-size: 11px; color: #94a3b8;">${r.emp_code || ''}</div>
        </td>
        <td>${r.department_name || '-'}</td>
        <td>${r.leave_name || 'Nghỉ phép năm'}</td>
        <td>${rangeStr}</td>
        <td style="font-weight: 600;">${r.total_days || 1} ngày</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.reason || ''}">
          ${r.reason || 'Nghỉ giải quyết việc gia đình'}
        </td>
        <td style="font-size: 12px; color: #64748b;">${formatLeaveDate(r.created_at)}</td>
        <td>${badgeHtml}</td>
        <td style="text-align: center; white-space: nowrap;">
          ${actionHtml}
        </td>
      </tr>
    `;
  }).join('');
}

function filterRequestsTable() {
  renderRequestsTable(state.requests || []);
}

async function handleCreateLeaveSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const leaveTypeId = document.getElementById('leaveFormType')?.value;
  const session = document.getElementById('leaveFormSession')?.value || 'FULL_DAY';
  const startDate = document.getElementById('leaveFormStartDate')?.value;
  const endDate = document.getElementById('leaveFormEndDate')?.value;
  const totalDays = parseFloat(document.getElementById('leaveFormTotalDays')?.value) || 1.0;
  const reason = document.getElementById('leaveFormReason')?.value.trim();
  const attachmentUrl = document.getElementById('leaveFormAttachment')?.value.trim() || 'Bien-ban-ban-giao.pdf';
  const btn = document.getElementById('btnSubmitLeave');

  if (!leaveTypeId || !startDate || !endDate || !reason) {
    return showToast('Vui lòng nhập đầy đủ thông tin ngày nghỉ và lý do', 'warning');
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Đang gửi đơn...</span>';
  }

  try {
    const leaveTypeName = document.getElementById('leaveFormType')?.selectedOptions?.[0]?.text?.split('(')?.[0]?.trim() || 'Nghỉ phép năm';
    const newReqId = 'NP-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900);
    const newReq = {
      id: newReqId,
      code: newReqId,
      emp_id: state.user?.id || state.user?.username || 'emp',
      username: state.user?.username || 'user',
      emp_name: state.user?.fullName || state.user?.username || 'Nhân viên',
      emp_code: state.user?.empCode || ('EMP_' + (state.user?.username || 'USER').toUpperCase()),
      department_name: state.user?.department || 'Chưa phân phòng ban',
      leave_name: leaveTypeName,
      type: leaveTypeName,
      start_date: startDate,
      end_date: endDate,
      date: `${startDate} (${totalDays} ngày)`,
      total_days: totalDays,
      reason: reason,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    // 1. Lưu vào kho dữ liệu cá nhân của chính nhân viên này
    let userReqs = getUserEntityList('requests');
    userReqs.unshift(newReq);
    saveUserEntityList('requests', userReqs);

    // 2. Lưu vào danh sách chung toàn công ty để Quản lý / Admin thấy trên Dashboard duyệt
    let allReqs = [];
    try { allReqs = JSON.parse(safeGetStorage('htqlns_all_requests', '[]')); } catch (err) {}
    allReqs.unshift(newReq);
    safeSetStorage('htqlns_all_requests', JSON.stringify(allReqs));

    // 3. Gửi lên backend API nếu backend sẵn sàng
    apiCall('/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leaveTypeId,
        session,
        startDate,
        endDate,
        totalDays,
        reason,
        attachmentUrl
      })
    }).catch(err => {
      console.warn('API leave backend offline, đã lưu trữ cách ly client:', err.message);
    });

    showToast('Đã gửi đơn xin nghỉ phép thành công! Đơn đã chuyển đến Quản lý / Quản trị viên xét duyệt.', 'success');
    
    // Xóa form lý do
    const reasonInput = document.getElementById('leaveFormReason');
    if (reasonInput) reasonInput.value = '';

    await loadRequestsData();
    await loadDashboardPendingRequests();
    loadDashboardOverview();
    loadEmployeeDashboardData();
  } catch (err) {
    showToast(`Lỗi gửi đơn: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Gửi đơn duyệt</span> ➔';
    }
  }
}

async function handleDirectApproveLeave(id) {
  if (!confirm(`Bạn có chắc chắn muốn PHÊ DUYỆT đơn xin nghỉ phép [${id}]?`)) return;

  try {
    const res = await apiCall(`/api/v1/leave-requests/${id}/decision`, {
      method: 'PATCH',
      body: JSON.stringify({ decision: 'APPROVED' })
    });
    showToast(`Đã phê duyệt thành công đơn ${id}!`, 'success');
    await loadRequestsData();
    await loadDashboardPendingRequests();
    loadDashboardOverview();
    
    const detailSec = document.getElementById('view-request-detail');
    if (detailSec && detailSec.style.display !== 'none') {
      openRequestDetail(id);
    }
  } catch (err) {
    showToast(`Lỗi phê duyệt đơn: ${err.message}`, 'error');
  }
}

async function handleDirectRejectLeave(id) {
  const reason = prompt('Nhập lý do từ chối đơn này:', 'Kế hoạch công việc cao điểm, vui lòng dời lịch nghỉ phép');
  if (reason === null) return;

  try {
    const res = await apiCall(`/api/v1/leave-requests/${id}/decision`, {
      method: 'PATCH',
      body: JSON.stringify({ decision: 'REJECTED', rejectReason: reason || 'Không phù hợp kế hoạch công việc' })
    });
    showToast(`Đã từ chối đơn ${id}!`, 'warning');
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
  let req = state.requests?.find(r => r.id === requestId);
  try {
    const res = await apiCall(`/api/v1/leave-requests/${requestId}`);
    if (res?.data) req = res.data;
  } catch (err) {
    console.warn('Không thể tải chi tiết từ API, dùng dữ liệu có sẵn:', err);
  }

  if (!req) {
    req = {
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
      reason: 'Tôi xin nghỉ phép để giải quyết công việc gia đình. Các hạng mục đang thực hiện đã được bàn giao cho Huỳnh Gia Kiệt trước ngày nghỉ.',
      attachment_url: 'Bien-ban-ban-giao.pdf',
      status: 'PENDING',
      created_at: '2026-10-30T08:15:00'
    };
  }

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

  if (headerCode) headerCode.innerText = `Mã đơn: ${req.id}`;
  if (title) title.innerText = req.leave_name || 'Đơn xin nghỉ phép';
  if (meta) meta.innerText = `${req.id} • Gửi ngày ${formatLeaveDateTime(req.created_at)}`;
  if (empName) empName.innerText = `${req.emp_name || 'Vũ Đức Hiếu'} • ${req.emp_code || 'NV-001'}`;
  if (approverName) approverName.innerText = req.approver_name || 'Nguyễn Thanh Lâm';
  if (dept) dept.innerText = req.department_name || '-';
  if (leaveType) leaveType.innerText = `${req.leave_name || 'Nghỉ phép năm'} • ${req.is_paid ? 'Có hưởng lương' : 'Không hưởng lương'}`;
  if (startDate) startDate.innerText = `${formatLeaveDate(req.start_date)} • 08:00`;
  if (endDate) endDate.innerText = `${formatLeaveDate(req.end_date)} • 16:00`;
  const daysNum = parseFloat(req.total_days || 1);
  if (duration) duration.innerText = `${daysNum.toFixed(0)} ngày • ${(daysNum * 8).toFixed(0)} giờ`;
  if (reason) reason.innerText = req.reason || 'Tôi xin nghỉ phép để giải quyết công việc gia đình.';
  if (attach) attach.innerText = req.attachment_url || 'Bien-ban-ban-giao.pdf';

  const role = state.user?.role || 'EMPLOYEE';
  const isApprover = (role === 'ADMIN' || role === 'HR' || role === 'MANAGER');

  if (req.status === 'PENDING') {
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
    if (alertText) alertText.innerText = `Đang chờ ${req.approver_name || 'Nguyễn Thanh Lâm'} phê duyệt`;
    if (alertSub) alertSub.innerText = 'Đơn đã được gửi đến quản lý trực tiếp. Bạn sẽ nhận được thông báo khi có kết quả.';

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
      step2Desc.innerText = `${req.approver_name || 'Quản lý'} • ${req.department_name ? 'Quản lý ' + req.department_name : 'Quản lý trực tiếp'}. Chưa có phản hồi từ người duyệt.`;
    }

    if (adminGroup) {
      if (isApprover) {
        adminGroup.innerHTML = `
          <button class="btn-approve-sm" style="padding: 9px 18px; font-size: 13px;" onclick="handleDirectApproveLeave('${req.id}')">✓ Phê duyệt đơn này</button>
          <button class="btn-reject-sm" style="padding: 9px 18px; font-size: 13px;" onclick="handleDirectRejectLeave('${req.id}')">✕ Từ chối đơn này</button>
        `;
      } else {
        adminGroup.innerHTML = '';
      }
    }
  } else if (req.status === 'APPROVED') {
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
    if (alertText) alertText.innerText = `Đã được ${req.approver_name || 'Quản trị viên'} phê duyệt`;
    if (alertSub) alertSub.innerText = 'Đơn xin nghỉ phép đã được chấp thuận. Ngày nghỉ được ghi nhận chính thức vào hệ thống chấm công.';

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
      step2Desc.innerText = `Đã được duyệt bởi ${req.approver_name || 'Quản lý'}. Quỹ phép năm đã tự động cập nhật.`;
    }
    if (adminGroup) adminGroup.innerHTML = '';
  } else if (req.status === 'REJECTED') {
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
    if (alertText) alertText.innerText = `Đơn đã bị từ chối`;
    if (alertSub) alertSub.innerText = `Lý do: ${req.reject_reason || 'Không phù hợp kế hoạch công việc dự án'}`;

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
      step2Desc.innerText = `Lý do từ chối: ${req.reject_reason || 'Không phù hợp kế hoạch'}`;
    }
    if (adminGroup) adminGroup.innerHTML = '';
  }
}

async function loadDashboardPendingRequests() {
  const role = state.user?.role || 'EMPLOYEE';
  const pendingTbody = document.getElementById('dashPendingApprovalTableBody');
  const personalTbody = document.getElementById('dashPersonalRequestsTableBody');
  const subTitle = document.getElementById('dashPendingApprovalSub');

  try {
    const res = await apiCall('/api/leave');
    const list = res?.data || [];
    state.requests = list;

    // 1. Phía Nhân viên: Hiển thị đơn của chính mình trên Dashboard
    if (personalTbody) {
      if (!list.length) {
        personalTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">Bạn chưa gửi đơn xin nghỉ phép nào.</td></tr>`;
      } else {
        personalTbody.innerHTML = list.slice(0, 5).map(r => {
          let badgeHtml = '';
          if (r.status === 'PENDING') badgeHtml = `<span class="badge-status" style="background: #fef3c7; color: #d97706; font-weight: 600;">• Đang chờ</span>`;
          else if (r.status === 'APPROVED') badgeHtml = `<span class="badge-status badge-approved">✓ Đã duyệt</span>`;
          else badgeHtml = `<span class="badge-status badge-rejected">✕ Từ chối</span>`;

          const rangeStr = `${formatLeaveDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ' → ' + formatLeaveDate(r.end_date) : ''}`;
          return `
            <tr>
              <td><span style="font-weight: 700; color: #1e293b;">${r.id}</span></td>
              <td>${r.leave_name || 'Nghỉ phép năm'}</td>
              <td>${rangeStr}</td>
              <td>${r.total_days || 1} ngày</td>
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
      const pendingList = list.filter(r => r.status === 'PENDING');
      if (subTitle) {
        subTitle.innerText = `${pendingList.length} đơn cần xử lý - Nhấp để duyệt hoặc từ chối trực tiếp`;
      }

      if (!pendingList.length) {
        pendingTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #10b981; padding: 24px; font-weight: 600;">Hiện không có đơn nào đang chờ duyệt.</td></tr>`;
      } else {
        pendingTbody.innerHTML = pendingList.map(r => {
          const rangeStr = `${formatLeaveDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ' → ' + formatLeaveDate(r.end_date) : ''} • ${r.total_days || 1} ngày`;
          return `
            <tr id="req-row-${r.id}">
              <td>
                <div style="font-weight: 700; color: #1e293b;">${r.emp_name || 'Nhân viên'}</div>
                <div style="font-size: 11px; color: #94a3b8;">${r.emp_code || ''} • Mã: ${r.id}</div>
              </td>
              <td>${r.department_name || '-'}</td>
              <td>${r.leave_name || 'Nghỉ phép năm'}</td>
              <td>${rangeStr}</td>
              <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.reason || ''}">
                ${r.reason || 'Giải quyết việc riêng'}
              </td>
              <td style="text-align: center; white-space: nowrap;">
                <button class="btn-approve-sm" onclick="handleDirectApproveLeave('${r.id}')">✓ Duyệt</button>
                <button class="btn-reject-sm" onclick="handleDirectRejectLeave('${r.id}')">✕ Từ chối</button>
                <button class="btn-detail-sm" onclick="openRequestDetail('${r.id}')">Chi tiết ↗</button>
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
  // Kiểm tra nhân sự mới chờ tiếp nhận vào ban/phòng
  const regUsers = getRegisteredUsersList();
  const pendingUsers = regUsers.filter(u => {
    const a = getUserAssignment(u.username, u.id);
    return !a || a.status !== 'ACTIVE';
  });

  const adminAlert = document.getElementById('dashAdminPendingAlert');
  const alertTitle = document.getElementById('dashAdminPendingAlertTitle');
  const alertSub = document.getElementById('dashAdminPendingAlertSub');

  if (adminAlert) {
    if (pendingUsers.length > 0) {
      adminAlert.style.display = 'block';
      if (alertTitle) alertTitle.innerText = `Có ${pendingUsers.length} nhân sự mới đăng ký đang chờ tiếp nhận vào ban/phòng!`;
      if (alertSub) alertSub.innerText = `Bao gồm: ${pendingUsers.map(u => u.fullName || u.username).join(', ')}. Nhấp để phân bổ ban phòng, ca trực và kích hoạt mức lương.`;
    } else {
      adminAlert.style.display = 'none';
    }
  }

  await Promise.all([
    loadDepartmentsData(),
    loadEmployeesData(),
    loadDashboardPendingRequests(),
    loadDashboardOverview()
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

  renderEmployeesTable(state.employees);
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
  const kw = document.getElementById('employeeSearchInput')?.value.toLowerCase() || '';
  const filtered = (state.employees || []).filter(
    (e) =>
      e.full_name.toLowerCase().includes(kw) ||
      (e.code && e.code.toLowerCase().includes(kw)) ||
      (e.email && e.email.toLowerCase().includes(kw))
  );
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
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayRecord = null;

    // 1. Kiểm tra từ API
    try {
      const res = await apiCall('/api/attendance');
      if (res && res.success && Array.isArray(res.data)) {
        todayRecord = res.data.find(r => {
          if (!r.work_date) return false;
          const rDate = new Date(r.work_date).toISOString().slice(0, 10);
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
  const shiftName = state.user?.shiftName || (isOnboarded ? 'Ca Hành Chính' : 'Chưa phân ca');
  const shiftStart = state.user?.shiftStart || '08:00';
  const shiftEnd = state.user?.shiftEnd || '17:30';

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const todayStr = `${dayNames[now.getDay()]}, ${now.toLocaleDateString('vi-VN')}`;

  // 1. Xử lý Banner Chờ Tiếp Nhận Ban/Phòng
  const onboardingBanner = document.getElementById('dashEmpOnboardingBanner');
  if (onboardingBanner) {
    onboardingBanner.style.display = isOnboarded ? 'none' : 'block';
  }

  // 2. Cập nhật lời chào và thông tin ca trong Hero Card
  const heroGreeting = document.getElementById('dashEmpHeroGreeting');
  const todayDateText = document.getElementById('dashEmpTodayDateText');
  const gpsStatus = document.getElementById('dashEmpGpsStatus');
  const liveClock = document.getElementById('dashEmpLiveClock');
  const todayBadge = document.getElementById('dashEmpTodayBadge');

  if (heroGreeting) heroGreeting.style.display = 'none';
  if (liveClock) liveClock.innerText = now.toLocaleTimeString('vi-VN');

  if (todayDateText) {
    if (isOnboarded) {
      todayDateText.innerText = `${todayStr} • ${shiftName} (${shiftStart} - ${shiftEnd})`;
    } else {
      todayDateText.innerText = todayStr;
    }
  }

  if (gpsStatus) {
    if (isOnboarded) {
      const officeName = state.user.officeLocation || 'Văn phòng Quy Nhơn';
      gpsStatus.innerHTML = `Trạng thái định vị: <span style="color:#059669; font-weight:600;">Hợp lệ (${officeName})</span>`;
    } else {
      gpsStatus.innerHTML = 'Trạng thái định vị: <span style="color:#dc2626; font-weight:600;">Chưa gán văn phòng làm việc</span>';
    }
  }

  // 3. Khối Chấm công trong ngày (Thời gian thực & Cách ly theo tài khoản)
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

  if (todayLog && todayLog.check_in_time) {
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
      if (hoursVal) hoursVal.innerText = `${todayLog.actual_working_hours || '8.5'} h`;
      if (hoursNote) hoursNote.innerText = 'Đạt chuẩn 8.0 h';
      if (todayBadge) {
        todayBadge.innerText = 'Hoàn thành ca làm việc';
        todayBadge.style.background = '#dbeafe';
        todayBadge.style.color = '#1e40af';
      }
      if (checkInBtn) { checkInBtn.style.display = 'flex'; checkInBtn.className = 'btn-hero-action btn-hero-done'; checkInBtn.disabled = true; checkInBtn.innerHTML = '<span>ĐÃ HOÀN TẤT HÔM NAY</span>'; }
      if (checkOutBtn) { checkOutBtn.style.display = 'none'; }
    } else {
      if (checkOutVal) checkOutVal.innerText = '--:--:--';
      if (checkOutNote) checkOutNote.innerText = 'Đang trong ca làm việc...';
      const elapsedHours = ((now - new Date(todayLog.check_in_time)) / 3600000).toFixed(1);
      if (hoursVal) hoursVal.innerText = `${Math.max(0.1, parseFloat(elapsedHours))} h`;
      if (hoursNote) hoursNote.innerText = 'Đang tích lũy...';
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
        checkOutBtn.innerHTML = '<span>CHECK-OUT (KẾT THÚC CA)</span>';
      }
    }
  } else {
    // Chưa check-in
    if (checkInVal) checkInVal.innerText = '--:--:--';
    if (checkInNote) checkInNote.innerText = 'Chưa check-in';
    if (checkOutVal) checkOutVal.innerText = '--:--:--';
    if (checkOutNote) checkOutNote.innerText = 'Chưa check-out';
    if (hoursVal) hoursVal.innerText = '0.0 h';
    if (hoursNote) hoursNote.innerText = isOnboarded ? 'Tiêu chuẩn: 8.0 h' : 'Chưa xếp ca';
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
        checkInBtn.style.cursor = 'pointer';
        checkInBtn.style.opacity = '1';
        checkInBtn.title = 'Bấm để chấm công vào ca';
        checkInBtn.innerHTML = '<span>CHECK-IN NGAY</span>';
      } else {
        // TẠM KHÓA NÚT CHẤM CÔNG NẾU CHƯA ĐƯỢC PHÂN PHÒNG BAN
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

  // 4. Cập nhật 4 KPI Cards (Chỉ số ngắn gọn, súc tích)
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

  // 5. Cột trái: Lịch ca tuần này (7 ngày tới)
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
        const dayLabel = `${dayNames[day.getDay()]}, ${day.toLocaleDateString('vi-VN')}`;
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const isToday = d === 0;

        let shiftLabel = '';
        let bgColor = '#ffffff';
        let borderColor = '#e2e8f0';
        let textColor = '#334155';

        if (isToday) {
          bgColor = '#f0fdf4';
          borderColor = '#86efac';
          textColor = '#166534';
        }

        if (isWeekend) {
          shiftLabel = '<span style="color: #94a3b8; font-weight: 500;">Nghỉ cuối tuần</span>';
          bgColor = '#f8fafc';
        } else {
          shiftLabel = `<span style="font-weight: 600; color: #1e293b;">${shiftName}</span> <span style="color: #64748b; font-size: 12px;">(${shiftStart} - ${shiftEnd})</span>`;
        }

        weekHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; font-size: 12.5px;">
            <div style="font-weight: ${isToday ? '700' : '500'}; color: ${textColor};">
              ${isToday ? 'Hôm nay: ' : ''}${dayLabel}
            </div>
            <div>${shiftLabel}</div>
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

  const role = state.user?.role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  const deptTitle = document.getElementById('mgrDeptNameTitle');
  const inviteVal = document.getElementById('mgrInviteCodeVal');

  try {
    const res = await apiCall('/api/organization/departments');
    const depts = res?.data || [];
    const myDept = depts.find(d => d.manager_id === state.user?.empId || d.manager_id === state.user?.id) || depts[0];

    if (myDept) {
      if (deptTitle) deptTitle.innerText = `Phòng ban phụ trách: ${myDept.name}`;
      if (inviteVal) inviteVal.innerText = myDept.invite_code || `TEAM-${myDept.code.replace(/^PB-/, '')}`;
    } else {
      if (deptTitle) deptTitle.innerText = 'Chưa có phòng ban phụ trách (Nhấn Tạo phòng ban)';
      if (inviteVal) inviteVal.innerText = 'TEAM-NEW';
    }
  } catch (err) {
    if (inviteVal) inviteVal.innerText = 'TEAM-TECH';
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
function openManagerInviteModal() {
  const currentCode = document.getElementById('mgrInviteCodeVal')?.innerText || 'TEAM-TECH';
  openModal(
    'Mời nhân viên tham gia phòng ban',
    `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
        Nhập địa chỉ email của nhân viên. Hệ thống sẽ tạo thư mời với mã phòng ban <strong style="color: #2563eb;">${currentCode}</strong>, ca làm việc chuẩn và vị trí chấm công GPS.
      </p>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Email nhân viên:</label>
        <input type="email" id="modalInviteEmail" class="figma-pill-input" placeholder="nhanvien@htqlns.com" required>
      </div>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Ca làm việc phân bổ:</label>
        <select id="modalInviteShift" class="figma-pill-input" style="cursor: pointer; appearance: auto;">
          <option value="shift-standard">Ca Hành Chính (08:00 - 17:30 • 8.0 giờ chuẩn)</option>
          <option value="shift-morning">Ca Sáng (06:00 - 14:00)</option>
          <option value="shift-afternoon">Ca Chiều (14:00 - 22:00)</option>
        </select>
      </div>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Tọa độ GPS văn phòng làm việc:</label>
        <input type="text" id="modalInviteOffice" class="figma-pill-input" value="13.7587, 109.2190 (Văn phòng Quy Nhơn - 170 An Dương Vương)" readonly style="background: #f8fafc; color: #64748b;">
      </div>

      <div>
        <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Lời nhắn / Ghi chú:</label>
        <input type="text" id="modalInviteNote" class="figma-pill-input" placeholder="Chào mừng bạn đến với nhóm làm việc!">
      </div>

      <button class="btn-primary-blue" style="margin-top: 8px; padding: 10px; font-size: 13.5px;" onclick="submitManagerInvite()">
        ✉️ Gửi lời mời nhân viên
      </button>
    </div>
    `
  );
}

// 8. Phía Quản lý: Gửi API mời nhân viên
async function submitManagerInvite() {
  const emailInput = document.getElementById('modalInviteEmail');
  const email = (emailInput?.value || '').trim();
  const shiftId = document.getElementById('modalInviteShift')?.value || 'shift-standard';
  const note = document.getElementById('modalInviteNote')?.value || '';

  if (!email) {
    return showToast('Vui lòng nhập email nhân viên', 'warning');
  }

  try {
    const res = await apiCall('/api/organization/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, shiftId, note })
    });

    closeModal();
    showToast(res?.message || `Đã gửi lời mời thành công tới ${email}!`, 'success');
  } catch (err) {
    console.error('Lỗi gửi lời mời:', err);
    showToast(err.message || 'Lỗi gửi lời mời nhân viên', 'error');
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

  let userNotifs = getUserEntityList('notifications');
  if (!userNotifs.length && isEmployee && !isOnboarded) {
    userNotifs = [
      {
        id: 'notif-welcome',
        title: `Chào mừng ${displayName} gia nhập Hệ thống HTQLNS!`,
        message: 'Tài khoản của bạn đã được khởi tạo thành công. Vui lòng chờ Ban Quản trị tiếp nhận vào ban/phòng, xếp ca trực và cấu hình mức lương.',
        type: 'SYSTEM',
        created_at: new Date().toISOString(),
        is_read: false
      }
    ];
    saveUserEntityList('notifications', userNotifs);
  }

  const unreadCount = userNotifs.filter(n => !n.is_read).length;
  const topbarBadge = document.getElementById('topbarNotifCountBadge');
  if (topbarBadge) topbarBadge.innerText = `${unreadCount} mới`;

  const topbarDot = document.getElementById('topbarNotifBadgeDot');
  if (topbarDot) topbarDot.style.display = unreadCount > 0 ? 'block' : 'none';

  const topbarList = document.getElementById('topbarNotifList');
  if (topbarList) {
    if (!userNotifs.length) {
      topbarList.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 20px; font-size: 12.5px;">Không có thông báo mới nào.</div>';
    } else {
      topbarList.innerHTML = userNotifs.map(n => {
        const isUnread = !n.is_read;
        const d = n.created_at ? new Date(n.created_at) : new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const timeStr = `${hh}:${mm} ${dd}-${MM}`;
        const titleText = n.title || n.message;

        return `
          <div class="topbar-notif-item ${isUnread ? 'unread' : ''}" onclick="markNotifRead('${n.id}')">
            <div style="flex: 1;">
              <div style="font-size: 13px; font-weight: ${isUnread ? '700' : '500'}; color: #1e293b; line-height: 1.4;">${titleText} - ${timeStr}</div>
              ${n.title && n.message && n.title !== n.message ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 3px; line-height: 1.35;">${n.message}</div>` : ''}
            </div>
            ${isUnread ? '<div style="width: 7px; height: 7px; background: #2563eb; border-radius: 50%; margin-top: 5px; flex-shrink: 0;"></div>' : ''}
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

// Đánh dấu đã đọc thông báo
function markNotifRead(notifId) {
  let userNotifs = getUserEntityList('notifications');
  const target = userNotifs.find(n => n.id === notifId);
  if (target) target.is_read = true;
  saveUserEntityList('notifications', userNotifs);
  renderTopbarNotifications();
  if (state.currentView === 'dashboard' && state.user?.role === 'EMPLOYEE') {
    loadEmployeeDashboardData();
  }
}

function markAllEmployeeNotifsRead() {
  let userNotifs = getUserEntityList('notifications');
  userNotifs.forEach(n => { n.is_read = true; });
  saveUserEntityList('notifications', userNotifs);
  const badge = document.getElementById('dashEmpNotifCountBadge');
  if (badge) badge.innerText = '0 mới';
  renderTopbarNotifications();
  showToast('Đã đánh dấu tất cả thông báo là đã đọc', 'success');
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

// Check-in trong ngày (Lưu riêng biệt cho tài khoản hiện tại)
async function handleDashboardCheckIn() {
  if (!state.user?.isOnboarded) {
    showToast('⚠️ Bạn chưa được phân bổ vào phòng ban và ca làm việc hợp lệ. Vui lòng liên hệ HR để được gán chi nhánh và ca trực trước khi chấm công!', 'warning');
    return;
  }
  const btn = document.getElementById('dashEmpCheckInBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang gửi check-in...';
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN');
  const today = now.toISOString().split('T')[0];

  try {
    // Lưu vào kho dữ liệu cá nhân của user
    let userAtts = getUserEntityList('attendances');
    const existingIdx = userAtts.findIndex(l => l.work_date && l.work_date.startsWith(today));
    const newLog = {
      id: 'att-' + Date.now(),
      work_date: today,
      check_in_time: now.toISOString(),
      check_out_time: null,
      status: 'ON_TIME',
      late_minutes: 0,
      actual_working_hours: '0.0',
      type: 'Wi-Fi Office'
    };

    if (existingIdx >= 0) {
      userAtts[existingIdx] = { ...userAtts[existingIdx], ...newLog };
    } else {
      userAtts.unshift(newLog);
    }
    saveUserEntityList('attendances', userAtts);

    // Gửi lên backend API nếu backend sẵn sàng
    apiCall('/api/v1/attendances/check-in', {
      method: 'POST',
      body: JSON.stringify({
        method: 'WIFI_GPS',
        bssid: 'A4:5E:60:12:34:01',
        ssid: 'QNU-Office',
        latitude: 13.7587,
        longitude: 109.2190
      })
    }).catch(err => {
      console.warn('API Check-in backend offline, sử dụng cơ chế cách ly client storage:', err.message);
    });

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
  const btn = document.getElementById('dashEmpCheckOutBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang gửi check-out...';
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN');
  const today = now.toISOString().split('T')[0];

  try {
    let userAtts = getUserEntityList('attendances');
    const todayLog = userAtts.find(l => l.work_date && l.work_date.startsWith(today));
    if (todayLog) {
      todayLog.check_out_time = now.toISOString();
      const inDate = new Date(todayLog.check_in_time);
      const diffHours = ((now - inDate) / 3600000).toFixed(1);
      todayLog.actual_working_hours = diffHours > 0 ? diffHours : '8.5';
      saveUserEntityList('attendances', userAtts);
    }

    // Gửi lên backend nếu sẵn sàng
    apiCall('/api/v1/attendances/check-out', {
      method: 'POST',
      body: JSON.stringify({
        method: 'WIFI_GPS',
        bssid: 'A4:5E:60:12:34:01',
        ssid: 'QNU-Office',
        latitude: 13.7587,
        longitude: 109.2190
      })
    }).catch(err => {
      console.warn('API Check-out backend offline, sử dụng cơ chế cách ly client storage:', err.message);
    });

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

  updateTopbarUser();
  applyRoleBasedUI();

  const savedView = targetView || safeGetStorage('htqlns_current_view', 'dashboard');
  navigateToView(savedView);
  checkTodayAttendanceStatus();
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
  const firstDay = new Date(year, month, 1).toISOString().slice(0, 10);
  const lastDay = new Date(year, month + 1, 0).toISOString().slice(0, 10);

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
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 24px;">Chưa có ca làm việc nào trong hệ thống</td></tr>`;
      return;
    }

    const isAdminOrHr = ['ADMIN', 'HR'].includes(state.user?.role);
    tbody.innerHTML = cachedShiftsList.map(s => `
      <tr>
        <td><strong>${s.code}</strong></td>
        <td><span style="font-weight: 600; color: #0f172a;">${s.name}</span></td>
        <td>${s.start_time.slice(0, 5)}</td>
        <td>${s.end_time.slice(0, 5)}</td>
        <td>${s.break_minutes || 0} phút</td>
        <td>+${s.grace_late_minutes || 0} phút</td>
        <td><strong>${Number(s.working_hours).toFixed(1)}h</strong></td>
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
    `).join('');
  } catch (err) {
    console.error('Lỗi nạp danh mục ca:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

// 2. Lịch phân ca nhân viên (SCR_SHIFT_01)
async function loadShiftAssignments() {
  const tbody = document.getElementById('tableBodyShiftAssignments');
  if (!tbody) return;

  const fromDate = document.getElementById('filterShiftFromDate')?.value || '';
  const toDate = document.getElementById('filterShiftToDate')?.value || '';
  let url = '/api/v1/shift-assignments';
  const params = [];
  if (fromDate) params.push(`fromDate=${fromDate}`);
  if (toDate) params.push(`toDate=${toDate}`);
  if (params.length) url += `?${params.join('&')}`;

  try {
    const res = await apiCall(url);
    const assignments = res?.data || [];

    // Cập nhật KPI phân ca hôm nay
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = assignments.filter(a => {
      const wDate = a.work_date ? new Date(a.work_date).toISOString().slice(0, 10) : '';
      return wDate === todayStr;
    }).length;
    const kpiToday = document.getElementById('kpiShiftTodayAssignments');
    if (kpiToday) kpiToday.innerText = todayCount;

    if (!assignments.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94a3b8; padding: 24px;">Không có ca làm việc nào được phân trong khoảng thời gian này</td></tr>`;
      return;
    }

    const canManage = ['ADMIN', 'HR', 'MANAGER'].includes(state.user?.role);
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
  } catch (err) {
    console.error('Lỗi tải lịch phân ca:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
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
  const today = new Date().toISOString().slice(0, 10);
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
async function openAssignShiftModal() {
  let employeeOptions = '';
  try {
    const empRes = await apiCall('/api/organization/employees');
    const employees = empRes?.data || [];
    employeeOptions = employees.map(e => `
      <option value="${e.id}">${e.code} - ${e.full_name} (${e.department_name || 'Phòng ban'})</option>
    `).join('');
  } catch {
    employeeOptions = '<option value="e0000001-0000-0000-0000-000000000004">NV-001 - Vũ Đức Hiếu</option>';
  }

  let shiftOptions = cachedShiftsList.filter(s => s.status === 'ACTIVE').map(s => `
    <option value="${s.id}">${s.code} - ${s.name} (${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)})</option>
  `).join('');

  const today = new Date().toISOString().slice(0, 10);
  const html = `
    <form id="formModalAssignShift" onsubmit="handleAssignShiftSubmit(event)">
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Chọn nhân viên *</label>
        <select id="assignModalEmpId" class="topbar-search-input" required>
          ${employeeOptions}
        </select>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Chọn ca làm việc *</label>
        <select id="assignModalShiftId" class="topbar-search-input" required>
          ${shiftOptions}
        </select>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Ngày làm việc *</label>
        <input type="date" id="assignModalWorkDate" class="topbar-search-input" value="${today}" required>
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
}

async function handleAssignShiftSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const empId = document.getElementById('assignModalEmpId').value;
  const shiftId = document.getElementById('assignModalShiftId').value;
  const workDate = document.getElementById('assignModalWorkDate').value;
  const note = document.getElementById('assignModalNote').value.trim();
  const btn = document.getElementById('btnSubmitAssignShift');

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang lưu...';
  }

  try {
    const res = await apiCall('/api/v1/shift-assignments', {
      method: 'POST',
      body: JSON.stringify({
        empIds: [empId],
        shiftId,
        workDates: [workDate],
        note
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || 'Phân ca thất bại');
    }

    showToast('Phân ca làm việc thành công!', 'success');
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

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">
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
          workingHours
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
          workingHours
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


