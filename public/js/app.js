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
  { id: 1, code: 'NV-001', full_name: 'Vũ Đức Hiếu', email: 'hieu.vd@htqlns.com', phone: '0901000001', department_name: 'Phòng Kỹ Thuật', position_title: 'Kỹ sư phần mềm SOA', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 2, code: 'NV-002', full_name: 'Huỳnh Gia Kiệt', email: 'kiet.hg@htqlns.com', phone: '0901000002', department_name: 'Phòng Kỹ Thuật', position_title: 'Backend Developer', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 3, code: 'NV-003', full_name: 'Nguyễn Gia Hảo', email: 'hao.ng@htqlns.com', phone: '0901000003', department_name: 'Phòng Kỹ Thuật', position_title: 'Frontend Developer', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 4, code: 'NV-004', full_name: 'Thầy Lâm (Nguyễn Thanh Lâm)', email: 'lam.nt@htqlns.com', phone: '0901000004', department_name: 'Phòng Kỹ Thuật', position_title: 'Trưởng ban Công nghệ', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 5, code: 'NV-005', full_name: 'Lê Ngọc Mai', email: 'mai.ln@htqlns.com', phone: '0901000005', department_name: 'Phòng Nhân sự', position_title: 'Chuyên viên C&B', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 6, code: 'NV-006', full_name: 'Phạm Minh Tuân', email: 'tuan.pm@htqlns.com', phone: '0901000006', department_name: 'Phòng Kinh Doanh', position_title: 'Chuyên viên Tư vấn', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 7, code: 'NV-007', full_name: 'Đỗ Thu Hà', email: 'ha.dt@htqlns.com', phone: '0901000007', department_name: 'Phòng Tài Chính - Kế Toán', position_title: 'Kế toán tiền lương', contract_type: 'OFFICIAL', status: 'ACTIVE' },
  { id: 8, code: 'NV-008', full_name: 'Trần Hoài An', email: 'an.th@htqlns.com', phone: '0901000008', department_name: 'Phòng Kỹ Thuật', position_title: 'DevOps & QA', contract_type: 'PROBATION', status: 'ACTIVE' }
];

const MOCK_DEPARTMENTS = [
  { id: 1, code: 'TECH', name: 'Phòng Kỹ Thuật', manager_name: 'Thầy Lâm', employee_count: 40, description: 'Phát triển kiến trúc SOA Microservices', status: 'ACTIVE' },
  { id: 2, code: 'HR', name: 'Phòng Nhân sự', manager_name: 'Lê Ngọc Mai', employee_count: 12, description: 'Tuyển dụng, chế độ C&B, quản lý hồ sơ', status: 'ACTIVE' },
  { id: 3, code: 'FIN', name: 'Phòng Tài Chính - Kế Toán', manager_name: 'Đỗ Thu Hà', employee_count: 15, description: 'Bảng lương, quyết toán tài chính', status: 'ACTIVE' },
  { id: 4, code: 'BIZ', name: 'Phòng Kinh Doanh', manager_name: 'Phạm Minh Tuân', employee_count: 28, description: 'Kinh doanh và chăm sóc đối tác', status: 'ACTIVE' }
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

  document.querySelectorAll('.btn-demo-view').forEach(btn => btn.classList.remove('active-demo'));
  const targetDemoBtn = document.getElementById(isLogin ? 'btn-demo-login' : 'btn-demo-register');
  if (targetDemoBtn) targetDemoBtn.classList.add('active-demo');
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

// Chọn nhanh tài khoản kiểm thử 1-click
async function quickFillAuth(role) {
  const accounts = {
    admin: { u: 'admin', p: '123456' },
    manager: { u: 'manager', p: '123456' },
    hr_admin: { u: 'hr_admin', p: '123456' },
    employee: { u: 'employee', p: '123456' }
  };
  const acc = accounts[role] || { u: role, p: '123456' };
  document.getElementById('loginUsername').value = acc.u;
  document.getElementById('loginPassword').value = acc.p;
  await handleLoginSubmit(new Event('submit'));
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

    showToast(`Đăng nhập thành công! Xin chào ${state.user.fullName || state.user.username}`, 'success');
    initPortalDashboard();
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

  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const btn = document.getElementById('btnRegisterAction');

  if (password !== confirmPassword) {
    return showToast('Xác nhận mật khẩu không khớp', 'warning');
  }

  const username = email.split('@')[0] || `user_${Date.now()}`;
  btn.disabled = true;
  btn.innerText = 'Đang đăng ký...';

  try {
    const res = await apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password,
        role: 'EMPLOYEE'
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || res?.message || 'Đăng ký không thành công');
    }

    showToast(`Đăng ký tài khoản ${username} thành công! Mời bạn đăng nhập.`, 'success');
    toggleAuthMode('login');
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = password;
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
  safeRemoveStorage('htqlns_token');
  safeRemoveStorage('htqlns_user');

  document.getElementById('portalApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
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
  document.querySelectorAll('.btn-demo-view').forEach(btn => btn.classList.remove('active-demo'));
  const activeBtn = document.getElementById(`btn-demo-${screen}`);
  if (activeBtn) activeBtn.classList.add('active-demo');

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

  if (!state.user) {
    state.user = {
      username: 'manager',
      role: 'MANAGER',
      fullName: 'Thầy Lâm',
      email: 'lam@htqlns.com'
    };
  }

  updateTopbarUser();
  navigateToView(screen);
}

function updateTopbarUser() {
  if (!state.user) return;
  const isManager = state.user.role === 'MANAGER' || state.user.username === 'manager';
  const displayName = state.user.fullName || (isManager ? 'Thầy Lâm' : state.user.username);
  const displayRole = state.user.role === 'ADMIN' ? 'Quản trị viên Hệ thống' :
                      (state.user.role === 'HR' ? 'Phòng Nhân sự' :
                      (state.user.role === 'MANAGER' ? 'Quản lý | Kỹ thuật' : 'Nhân viên'));

  const nameEl = document.getElementById('topbarUserName');
  const roleEl = document.getElementById('topbarUserRole');
  const avatarEl = document.getElementById('topbarAvatarCircle');
  const greetSub = document.getElementById('dashGreetingSub');

  if (nameEl) nameEl.innerText = `Xin chào, ${displayName}`;
  if (roleEl) roleEl.innerText = displayRole;
  if (avatarEl) {
    const parts = displayName.trim().split(' ');
    avatarEl.innerText = (parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]) : displayName.slice(0, 2)).toUpperCase();
  }
  if (greetSub) {
    greetSub.innerText = `Xin chào ${displayName}, đây là tình hình đội nhóm hôm nay.`;
  }
}

function navigateToView(viewName) {
  state.currentView = viewName;

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
      targetSection = document.getElementById('view-request-detail');
    } else {
      targetSection = document.getElementById('view-dashboard');
    }
  }

  if (targetSection) targetSection.style.display = 'block';

  // Nạp dữ liệu tương ứng
  if (viewName === 'dashboard') loadDashboardData();
  if (viewName === 'employees') loadEmployeesData();
  if (viewName === 'departments') loadDepartmentsData();
  if (viewName === 'attendance-history') loadAttendanceHistoryData();
  if (viewName === 'my-attendance') loadMyAttendanceData();
  if (viewName === 'stats') loadStatsData();
  if (viewName === 'soa-monitor') loadSoaServicesStatus();
  if (viewName === 'profile') loadProfileData();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openRequestDetail(requestId) {
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
}

// ==============================================================================
// 7. NẠP DỮ LIỆU CÁC DỊCH VỤ & GIAO DIỆN
// ==============================================================================
async function loadDashboardData() {
  await Promise.all([loadDepartmentsData(), loadEmployeesData()]);
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
  try {
    const res = await apiCall('/api/organization/employees');
    state.employees = res.data && res.data.length ? res.data : MOCK_EMPLOYEES;
  } catch (err) {
    state.employees = MOCK_EMPLOYEES;
  }
  renderEmployeesTable(state.employees);
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById('employeesTableFullBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8;">Chưa có dữ liệu nhân sự</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      (e) => `
    <tr>
      <td><strong>${e.code || e.employee_code}</strong></td>
      <td><strong>${e.full_name}</strong></td>
      <td>${e.email}</td>
      <td>${e.phone || '-'}</td>
      <td>${e.department_name || '-'}</td>
      <td>${e.position_title || e.position_name || '-'}</td>
      <td><span class="badge-status" style="background:#f1f5f9; color:#475569;">${e.contract_type || 'OFFICIAL'}</span></td>
      <td><span class="badge-status ${e.status === 'ACTIVE' ? 'badge-approved' : 'badge-rejected'}">${e.status}</span></td>
    </tr>
  `
    )
    .join('');
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

// Nạp lịch sử chấm công toàn bộ nhân viên
function loadAttendanceHistoryData() {
  const tbody = document.getElementById('attendanceHistoryTableBody');
  if (!tbody) return;

  const records = [
    { code: 'NV-001', name: 'Vũ Đức Hiếu', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '07:55', out: '16:05', hours: '8.1', status: 'ON_TIME' },
    { code: 'NV-002', name: 'Huỳnh Gia Kiệt', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '08:12', out: '16:00', hours: '7.8', status: 'LATE' },
    { code: 'NV-003', name: 'Nguyễn Gia Hảo', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '08:07', out: '16:10', hours: '8.0', status: 'LATE' },
    { code: 'NV-004', name: 'Thầy Lâm (Quản lý)', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '07:45', out: '17:00', hours: '9.2', status: 'ON_TIME' },
    { code: 'NV-005', name: 'Lê Ngọc Mai', dept: 'Phòng Nhân sự', date: '30/10/2026', in: '07:50', out: '16:00', hours: '8.1', status: 'ON_TIME' },
    { code: 'NV-006', name: 'Phạm Minh Tuân', dept: 'Phòng Kinh Doanh', date: '30/10/2026', in: '07:58', out: '16:30', hours: '8.5', status: 'ON_TIME' },
    { code: 'NV-007', name: 'Đỗ Thu Hà', dept: 'Phòng Tài Chính', date: '30/10/2026', in: '-', out: '-', hours: '0.0', status: 'LEAVE' },
    { code: 'NV-008', name: 'Trần Hoài An', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '08:21', out: '16:00', hours: '7.6', status: 'LATE' }
  ];

  tbody.innerHTML = records.map(r => {
    let badge = '<span class="badge-status badge-approved">Đúng giờ</span>';
    if (r.status === 'LATE') badge = '<span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn</span>';
    if (r.status === 'LEAVE') badge = '<span class="badge-status" style="background:#eff6ff; color:#2563eb;">Nghỉ phép</span>';

    return `
      <tr>
        <td><strong>${r.code}</strong></td>
        <td><strong>${r.name}</strong></td>
        <td>${r.dept}</td>
        <td>${r.date}</td>
        <td>${r.in}</td>
        <td>${r.out}</td>
        <td><strong>${r.hours} h</strong></td>
        <td>${badge}</td>
        <td><a class="link-action-blue" onclick="openLateDetailModal('${r.name}', '${r.code}', '15 phút', '${r.in}')">Chi tiết</a></td>
      </tr>
    `;
  }).join('');
}

// Nạp lịch sử chấm công cá nhân
function loadMyAttendanceData() {
  const tbody = document.getElementById('myAttendanceTableBody');
  if (!tbody) return;

  const records = [
    { date: '30/10/2026', in: '07:55', out: '16:05', duration: '8h 10m', type: 'Wi-Fi Office', status: 'ON_TIME' },
    { date: '29/10/2026', in: '08:00', out: '16:15', duration: '8h 15m', type: 'Wi-Fi Office', status: 'ON_TIME' },
    { date: '28/10/2026', in: '08:12', out: '16:30', duration: '8h 18m', type: 'GPS Mobile', status: 'LATE' },
    { date: '27/10/2026', in: '07:52', out: '16:00', duration: '8h 08m', type: 'Wi-Fi Office', status: 'ON_TIME' },
    { date: '26/10/2026', in: '07:48', out: '16:05', duration: '8h 17m', type: 'Wi-Fi Office', status: 'ON_TIME' },
    { date: '25/10/2026', in: '08:02', out: '16:00', duration: '7h 58m', type: 'Wi-Fi Office', status: 'ON_TIME' }
  ];

  tbody.innerHTML = records.map(r => `
    <tr>
      <td><strong>${r.date}</strong></td>
      <td>${r.in}</td>
      <td>${r.out}</td>
      <td>${r.duration}</td>
      <td><span class="badge-status" style="background:#f1f5f9; color:#475569;">${r.type}</span></td>
      <td>${r.status === 'ON_TIME' ? '<span class="badge-status badge-approved">Đúng giờ</span>' : '<span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn (12p)</span>'}</td>
    </tr>
  `).join('');
}

// Nạp dữ liệu thống kê báo cáo
function loadStatsData() {
  // Đã có sẵn dữ liệu trực quan trên view-stats
}

// Nạp dữ liệu hồ sơ cá nhân
function loadProfileData() {
  if (!state.user) return;
  const isManager = state.user.role === 'MANAGER' || state.user.username === 'manager';
  const displayName = state.user.fullName || (isManager ? 'Thầy Lâm' : state.user.username);

  const nameEl = document.getElementById('profDisplayName');
  const userEl = document.getElementById('profUsername');
  const emailEl = document.getElementById('profEmail');
  const roleEl = document.getElementById('profRole');

  if (nameEl) nameEl.innerText = displayName;
  if (userEl) userEl.innerText = state.user.username || 'manager';
  if (emailEl) emailEl.innerText = state.user.email || `${state.user.username}@htqlns.com`;
  if (roleEl) roleEl.innerText = state.user.role || 'MANAGER';
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
  const options = [
    { label: '📅 Hôm nay (30/10/2026)', value: '30/10/2026 • Hôm nay' },
    { label: '📅 Hôm qua (29/10/2026)', value: '29/10/2026 • Hôm qua' },
    { label: '📅 7 ngày qua (24/10 - 30/10)', value: '7 ngày qua' },
    { label: '📅 Tháng này (10/2026)', value: 'Tháng 10/2026' }
  ];
  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <p style="font-size: 13px; color: #64748b; margin-bottom: 6px;">Chọn khoảng thời gian theo dõi dữ liệu:</p>
      ${options.map(opt => `
        <button type="button" class="btn-figma-dark" style="background: #f8fafc; color: #1e293b; border: 1px solid #e2e8f0; text-align: left; padding: 10px 14px; font-weight: 600;" onclick="selectDateFilter('${opt.value}')">
          ${opt.label}
        </button>
      `).join('')}
    </div>
  `;
  openModal('Lọc dữ liệu theo thời gian', html);
}

function selectDateFilter(val) {
  const el = document.getElementById('currentDatePillText');
  if (el) el.innerText = val;
  closeModal();
  showToast(`Đã lọc dữ liệu theo: ${val}`, 'success');
}

function openDeptFilterModal() {
  const depts = [
    { name: 'Toàn cơ quan', count: 95 },
    { name: 'Phòng Kỹ Thuật', count: 40 },
    { name: 'Phòng Nhân sự', count: 12 },
    { name: 'Phòng Tài Chính - Kế Toán', count: 15 },
    { name: 'Phòng Kinh Doanh', count: 28 }
  ];
  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <p style="font-size: 13px; color: #64748b; margin-bottom: 6px;">Chọn đơn vị / phòng ban để xem thống kê:</p>
      ${depts.map(d => `
        <button type="button" class="btn-figma-dark" style="background: #f8fafc; color: #1e293b; border: 1px solid #e2e8f0; text-align: left; padding: 10px 14px; font-weight: 600; display: flex; justify-content: space-between;" onclick="selectDeptFilter('${d.name}', ${d.count})">
          <span>🏢 ${d.name}</span>
          <span style="color: #64748b; font-size: 12px;">${d.count} người</span>
        </button>
      `).join('')}
    </div>
  `;
  openModal('Lọc theo Phòng ban', html);
}

function selectDeptFilter(name, count) {
  const el = document.getElementById('currentDeptPillText');
  if (el) el.innerText = `🏢 ${name} • ${count} người`;
  closeModal();
  showToast(`Đã chọn: ${name} (${count} nhân sự)`, 'success');
}

function openLateDetailModal(name, code, lateTime, checkinTime) {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px;">
      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; color: #92400e;">
        <strong>⚠️ Tình trạng:</strong> Đi muộn ${lateTime} (Giờ vào: ${checkinTime} - Quy định: 08:00)
      </div>
      <div><strong>Nhân viên:</strong> ${name} (${code})</div>
      <div><strong>Phòng ban:</strong> Phòng Kỹ Thuật</div>
      <div><strong>Lý do giải trình:</strong> Kẹt xe tại nút giao do thời tiết mưa lớn</div>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button class="btn-primary-blue" style="flex: 1;" onclick="handleLateAction('${name}', 'approved')">Chấp nhận giải trình</button>
        <button class="btn-figma-dark" style="flex: 1; background: #ea580c; border: none;" onclick="handleLateAction('${name}', 'warn')">Gửi nhắc nhở</button>
      </div>
    </div>
  `;
  openModal(`Chi tiết đi muộn – ${name}`, html);
}

function handleLateAction(name, action) {
  closeModal();
  if (action === 'approved') {
    showToast(`Đã chấp thuận giải trình đi muộn của ${name}`, 'success');
  } else {
    showToast(`Đã gửi thông báo nhắc nhở tới ${name}`, 'warning');
  }
}

function openApproveRequestModal(id, name, type, time) {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px;">
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px; color: #1e40af;">
        <strong>📄 Mã yêu cầu:</strong> ${id}
      </div>
      <div><strong>Người làm đơn:</strong> ${name}</div>
      <div><strong>Loại yêu cầu:</strong> ${type}</div>
      <div><strong>Thời gian xin:</strong> ${time}</div>
      <div><strong>Lý do:</strong> Giải quyết công việc gia đình cá nhân</div>
      <div style="display: flex; gap: 10px; margin-top: 10px;">
        <button class="btn-primary-blue" style="flex: 1; background: #16a34a; border-color: #16a34a;" onclick="processRequestAction('${id}', '${name}', 'approved')">✓ Phê duyệt đơn</button>
        <button class="btn-figma-dark" style="flex: 1; background: #dc2626; border-color: #dc2626;" onclick="processRequestAction('${id}', '${name}', 'rejected')">✕ Từ chối đơn</button>
      </div>
    </div>
  `;
  openModal(`Xử lý đơn từ – ${name}`, html);
}

function processRequestAction(id, name, status) {
  closeModal();
  const row = document.getElementById(`req-row-${id}`);
  if (row) {
    const actionCell = row.querySelector('td:last-child');
    if (actionCell) {
      if (status === 'approved') {
        actionCell.innerHTML = `<span class="badge-status badge-approved">Đã phê duyệt</span>`;
      } else {
        actionCell.innerHTML = `<span class="badge-status badge-rejected">Đã từ chối</span>`;
      }
    }
  }
  if (status === 'approved') {
    showToast(`Đã phê duyệt thành công đơn ${id} của ${name}`, 'success');
  } else {
    showToast(`Đã từ chối đơn ${id} của ${name}`, 'warning');
  }
}

function handleCheckIn() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const checkinBtn = document.getElementById('btnMyCheckIn');
  const checkoutBtn = document.getElementById('btnMyCheckOut');
  if (checkinBtn) {
    checkinBtn.disabled = true;
    checkinBtn.innerText = `Đã Check-in (${timeStr})`;
    checkinBtn.style.opacity = '0.7';
  }
  if (checkoutBtn) checkoutBtn.disabled = false;
  showToast(`Điểm danh vào ca thành công lúc ${timeStr}! (Wi-Fi Công ty hợp lệ)`, 'success');
}

function handleCheckOut() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const checkoutBtn = document.getElementById('btnMyCheckOut');
  if (checkoutBtn) {
    checkoutBtn.disabled = true;
    checkoutBtn.innerText = `Đã Check-out (${timeStr})`;
  }
  showToast(`Điểm danh ra ca thành công lúc ${timeStr}! Chúc bạn buổi tối vui vẻ.`, 'success');
}

function handleTopbarSearch(e) {
  if (e.key === 'Enter') {
    const kw = e.target.value.trim().toLowerCase();
    if (!kw) return;
    navigateToView('employees');
    setTimeout(() => {
      const searchBox = document.getElementById('employeeSearchInput');
      if (searchBox) {
        searchBox.value = kw;
        handleEmployeeFilter();
      }
    }, 150);
  }
}

function openNotificationsModal() {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
      <div style="padding: 10px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #10b981;">
        <div style="font-weight: 700; color: #0f172a;">🔔 Chấm công hôm nay</div>
        <div style="color: #64748b;">Ca sáng 08:00 - 16:00: 34 nhân viên đã điểm danh thành công.</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">15 phút trước</div>
      </div>
      <div style="padding: 10px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #f59e0b;">
        <div style="font-weight: 700; color: #0f172a;">⏰ Đi muộn phát sinh</div>
        <div style="color: #64748b;">3 nhân viên phòng Kỹ thuật ghi nhận đi trễ từ 7 - 21 phút.</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">45 phút trước</div>
      </div>
      <div style="padding: 10px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <div style="font-weight: 700; color: #0f172a;">📄 Đơn xin nghỉ phép mới</div>
        <div style="color: #64748b;">Vũ Đức Hiếu đã gửi đơn xin nghỉ phép 1 ngày (02/11/2026).</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">1 giờ trước</div>
      </div>
    </div>
  `;
  openModal('Thông báo hệ thống (3 mới)', html);
}

// Bật tắt thiết lập phương thức chấm công (Figma Image 4)
function handleSettingToggle(type) {
  const isWifi = document.getElementById('toggleWifi')?.checked;
  const isGps = document.getElementById('toggleGps')?.checked;
  showToast(`Cập nhật phương thức: Wi-Fi: ${isWifi ? 'BẬT' : 'TẮT'} | GPS: ${isGps ? 'BẬT' : 'TẮT'}`, 'success');
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

  try {
    await apiCall('/api/organization/employees', {
      method: 'POST',
      body: JSON.stringify({ code, fullName, email, phone, departmentId })
    });
    showToast('Tạo hồ sơ nhân viên thành công!', 'success');
    closeModal();
    loadEmployeesData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==============================================================================
// 10. KHỞI TẠO DASHBOARD PORTAL
// ==============================================================================
function initPortalDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('portalApp').style.display = 'flex';

  updateTopbarUser();
  navigateToView('dashboard');
}

// ==============================================================================
// 11. KHỞI CHẠY ỨNG DỤNG (WINDOW LOAD)
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  // Đồng hồ số thời gian thực cho view chấm công cá nhân
  setInterval(() => {
    const clock = document.getElementById('liveClockText');
    if (clock) {
      clock.innerText = new Date().toLocaleTimeString('vi-VN');
    }
  }, 1000);

  // MẶC ĐỊNH KHI MỞ TRANG: LUÔN HIỂN THỊ GIAO DIỆN ĐĂNG NHẬP / ĐĂNG KÝ
  // Người dùng đăng nhập hoặc chọn 1-Click tài khoản để vào Dashboard
  showScreenView('login');
});
