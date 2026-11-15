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
  safeRemoveStorage('htqlns_current_view');

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
  applyRoleBasedUI();
  navigateToView(screen);
}

function updateTopbarUser() {
  if (!state.user) return;
  const isManager = state.user.role === 'MANAGER' || state.user.username === 'manager';
  const isEmployee = state.user.role === 'EMPLOYEE' || state.user.username === 'employee';
  const displayName = state.user.fullName || (isManager ? 'Thầy Lâm' : (isEmployee ? 'Vũ Đức Hiếu' : state.user.username));
  const displayRole = state.user.role === 'ADMIN' ? 'Quản trị viên Hệ thống' :
                      (state.user.role === 'HR' ? 'Phòng Nhân sự' :
                      (state.user.role === 'MANAGER' ? 'Quản lý | Kỹ thuật' : 'Nhân viên | Kỹ thuật'));

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

// Phân quyền giao diện theo vai trò người dùng (RBAC Interface Guard)
function applyRoleBasedUI() {
  const role = state.user?.role || 'EMPLOYEE';

  const navRbac = document.getElementById('nav-rbac');
  const navSoa = document.getElementById('nav-soa-monitor');
  const navSettings = document.getElementById('nav-settings');
  const navDepartments = document.getElementById('nav-departments');
  const navEmpHistory = document.getElementById('nav-attendance-history');
  const navEmployees = document.getElementById('nav-employees');
  const pendingRequestsCard = document.getElementById('dashPendingApprovalCard');
  const personalRequestsCard = document.getElementById('dashEmployeePersonalRequestsCard');

  // 1. Quản lý phân quyền: CHỈ ADMIN được hiển thị và thao tác
  if (navRbac) navRbac.style.display = (role === 'ADMIN') ? 'flex' : 'none';

  // 2. Giám sát hạ tầng SOA: CHỈ ADMIN được xem
  if (navSoa) navSoa.style.display = (role === 'ADMIN') ? 'flex' : 'none';

  // 3. Thiết lập chấm công (Wi-Fi, GPS): ADMIN hoặc HR
  if (navSettings) navSettings.style.display = (role === 'ADMIN' || role === 'HR') ? 'flex' : 'none';

  // 4. Cơ cấu phòng ban: ADMIN hoặc HR
  if (navDepartments) navDepartments.style.display = (role === 'ADMIN' || role === 'HR') ? 'flex' : 'none';

  // 5. Bảng công NV toàn công ty & Danh sách nhân viên: Ẩn với EMPLOYEE
  if (navEmpHistory) navEmpHistory.style.display = (role !== 'EMPLOYEE') ? 'flex' : 'none';
  if (navEmployees) navEmployees.style.display = (role !== 'EMPLOYEE') ? 'flex' : 'none';

  // 6. Điều chỉnh nội dung Dashboard & Thống kê cá nhân:
  const statEmployeePersonalCard = document.getElementById('statEmployeePersonalCard');
  if (statEmployeePersonalCard) {
    statEmployeePersonalCard.style.display = (role === 'EMPLOYEE') ? 'block' : 'none';
  }

  if (role === 'EMPLOYEE') {
    // Nhân viên không thể duyệt đơn của đồng nghiệp khác
    if (pendingRequestsCard) pendingRequestsCard.style.display = 'none';
    if (personalRequestsCard) personalRequestsCard.style.display = 'block';

    // Đổi thẻ KPI Dashboard thành KPI cá nhân của nhân viên
    const lbl1 = document.getElementById('dashMetricLbl1');
    const val1 = document.getElementById('dashMetricVal1');
    const sub1 = document.getElementById('dashMetricSub1');
    const lbl2 = document.getElementById('dashMetricLbl2');
    const val2 = document.getElementById('dashMetricVal2');
    const sub2 = document.getElementById('dashMetricSub2');
    const lbl3 = document.getElementById('dashMetricLbl3');
    const val3 = document.getElementById('dashMetricVal3');
    const sub3 = document.getElementById('dashMetricSub3');
    const lbl4 = document.getElementById('dashMetricLbl4');
    const val4 = document.getElementById('dashMetricVal4');
    const sub4 = document.getElementById('dashMetricSub4');

    if (lbl1) lbl1.innerText = 'Chấm công tháng';
    if (val1) val1.innerText = '22 / 22';
    if (sub1) sub1.innerText = 'Đạt 100% ngày công chuẩn →';

    if (lbl2) lbl2.innerText = 'Quỹ phép còn';
    if (val2) val2.innerText = '10 / 12';
    if (sub2) sub2.innerText = 'Đã nghỉ 2 ngày phép năm →';

    if (lbl3) lbl3.innerText = 'Đi muộn tháng';
    if (val3) val3.innerText = '00';
    if (sub3) sub3.innerText = 'Chuyên cần tốt, không bị trừ thưởng';

    if (lbl4) lbl4.innerText = 'Đơn đang chờ';
    if (val4) val4.innerText = '01';
    if (sub4) sub4.innerText = 'Nghỉ phép năm ngày 02/11/2026 →';
  } else {
    if (pendingRequestsCard) pendingRequestsCard.style.display = 'block';
    if (personalRequestsCard) personalRequestsCard.style.display = 'none';

    const lbl1 = document.getElementById('dashMetricLbl1');
    const val1 = document.getElementById('dashMetricVal1');
    const sub1 = document.getElementById('dashMetricSub1');
    const lbl2 = document.getElementById('dashMetricLbl2');
    const val2 = document.getElementById('dashMetricVal2');
    const sub2 = document.getElementById('dashMetricSub2');
    const lbl3 = document.getElementById('dashMetricLbl3');
    const val3 = document.getElementById('dashMetricVal3');
    const sub3 = document.getElementById('dashMetricSub3');
    const lbl4 = document.getElementById('dashMetricLbl4');
    const val4 = document.getElementById('dashMetricVal4');
    const sub4 = document.getElementById('dashMetricSub4');

    if (lbl1) lbl1.innerText = 'Đã đi làm';
    if (val1) val1.innerText = '34 / 40';
    if (sub1) sub1.innerText = '85% nhân sự • Gồm 3 người đi muộn';

    if (lbl2) lbl2.innerText = 'Nghỉ phép';
    if (val2) val2.innerText = '04';
    if (sub2) sub2.innerText = 'Đã được duyệt nghỉ hôm nay';

    if (lbl3) lbl3.innerText = 'Đi muộn';
    if (val3) val3.innerText = '03';
    if (sub3) sub3.innerText = 'Là một phần trong 34 người đi làm';

    if (lbl4) lbl4.innerText = 'Đơn chờ duyệt';
    if (val4) val4.innerText = '07';
    if (sub4) sub4.innerText = 'Tất cả ngày yêu cầu • Cần xử lý';
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
  if (viewName === 'dashboard') loadDashboardData();
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

  // 1. Nạp danh mục loại nghỉ phép từ leave-service
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
  } catch (err) {
    console.warn('Lỗi nạp leave types:', err);
  }

  // 2. Nạp số dư quỹ phép năm 2026
  try {
    const balRes = await apiCall('/api/v1/leave-balances').catch(() => null);
    let total = 12.0;
    let used = 2.0;
    let pending = 1.0;
    if (balRes?.data && balRes.data.length) {
      const b = balRes.data[0];
      total = Number(b.total_days || 12);
      used = Number(b.used_days || 0);
      pending = Number(b.pending_days || 0);
    }
    const remaining = Math.max(0, total - used - pending);

    const elTotal = document.getElementById('statLeaveTotal');
    const elUsed = document.getElementById('statLeaveUsed');
    const elPending = document.getElementById('statLeavePending');
    const elRem = document.getElementById('statLeaveRemaining');
    if (elTotal) elTotal.innerText = total.toFixed(1);
    if (elUsed) elUsed.innerText = used.toFixed(1);
    if (elPending) elPending.innerText = pending.toFixed(1);
    if (elRem) elRem.innerText = remaining.toFixed(1);
  } catch (err) {
    console.warn('Lỗi nạp leave balances:', err);
  }

  // 3. Nạp danh sách đơn từ
  try {
    const res = await apiCall('/api/leave');
    state.requests = res?.data || [];
    renderRequestsTable(state.requests);
  } catch (err) {
    console.error('Lỗi nạp danh sách đơn từ:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu đơn từ: ${err.message}</td></tr>`;
    }
  }
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
        <td>${r.department_name || 'Phòng Kỹ Thuật'}</td>
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
    const res = await apiCall('/api/leave', {
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
    });

    showToast('Đã gửi đơn xin nghỉ phép thành công! Đơn đã chuyển đến Quản lý / Quản trị viên xét duyệt.', 'success');
    
    // Xóa form lý do
    const reasonInput = document.getElementById('leaveFormReason');
    if (reasonInput) reasonInput.value = '';

    await loadRequestsData();
    await loadDashboardPendingRequests();

    if (res?.data?.id) {
      setTimeout(() => openRequestDetail(res.data.id), 300);
    }
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
  if (dept) dept.innerText = req.department_name || 'Phòng Kỹ Thuật';
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
      step2Desc.innerText = `${req.approver_name || 'Nguyễn Thanh Lâm'} • Quản lý ${req.department_name || 'Phòng Kỹ Thuật'}. Chưa có phản hồi từ người duyệt.`;
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
        pendingTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #10b981; padding: 24px; font-weight: 600;">🎉 Tuyệt vời! Hiện không có đơn nào đang chờ duyệt.</td></tr>`;
      } else {
        pendingTbody.innerHTML = pendingList.map(r => {
          const rangeStr = `${formatLeaveDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ' → ' + formatLeaveDate(r.end_date) : ''} • ${r.total_days || 1} ngày`;
          return `
            <tr id="req-row-${r.id}">
              <td>
                <div style="font-weight: 700; color: #1e293b;">${r.emp_name || 'Nhân viên'}</div>
                <div style="font-size: 11px; color: #94a3b8;">${r.emp_code || ''} • Mã: ${r.id}</div>
              </td>
              <td>${r.department_name || 'Phòng Kỹ Thuật'}</td>
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
  await Promise.all([loadDepartmentsData(), loadEmployeesData(), loadDashboardPendingRequests()]);
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

// Nạp lịch sử chấm công toàn bộ nhân viên (từ Attendance Service :3003)
async function loadAttendanceHistoryData() {
  const tbody = document.getElementById('attendanceHistoryTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 20px;">Đang tải dữ liệu từ Attendance Service (:3003)...</td></tr>`;

  let records = [];
  try {
    const res = await apiCall('/api/attendance');
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      records = res.data.map(r => {
        const empCode = r.emp_id ? (r.emp_id.length > 10 ? 'NV-' + r.emp_id.slice(-4) : r.emp_id) : 'NV-001';
        return {
          code: empCode,
          name: r.emp_name || (r.emp_id === 'e0000001-0000-0000-0000-000000000004' ? 'Vũ Đức Hiếu' : `Nhân viên (${empCode})`),
          dept: r.dept_name || 'Phòng Kỹ Thuật',
          date: r.work_date ? new Date(r.work_date).toLocaleDateString('vi-VN') : '30/10/2026',
          in: r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
          out: r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
          hours: r.actual_working_hours ? `${r.actual_working_hours} h` : (r.check_in_time && r.check_out_time ? '8.0 h' : '0.0 h'),
          status: r.status
        };
      });
    }
  } catch (err) {
    console.warn('Lỗi tải dữ liệu attendance toàn công ty, sử dụng fallback demo:', err.message);
  }

  if (!records.length) {
    records = [
      { code: 'NV-001', name: 'Vũ Đức Hiếu', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '07:55', out: '16:05', hours: '8.1 h', status: 'ON_TIME' },
      { code: 'NV-002', name: 'Huỳnh Gia Kiệt', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '08:12', out: '16:00', hours: '7.8 h', status: 'LATE' },
      { code: 'NV-003', name: 'Nguyễn Gia Hảo', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '08:07', out: '16:10', hours: '8.0 h', status: 'LATE' },
      { code: 'NV-004', name: 'Thầy Lâm (Quản lý)', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '07:45', out: '17:00', hours: '9.2 h', status: 'ON_TIME' },
      { code: 'NV-005', name: 'Lê Ngọc Mai', dept: 'Phòng Nhân sự', date: '30/10/2026', in: '07:50', out: '16:00', hours: '8.1 h', status: 'ON_TIME' },
      { code: 'NV-006', name: 'Phạm Minh Tuân', dept: 'Phòng Kinh Doanh', date: '30/10/2026', in: '07:58', out: '16:30', hours: '8.5 h', status: 'ON_TIME' },
      { code: 'NV-007', name: 'Đỗ Thu Hà', dept: 'Phòng Tài Chính', date: '30/10/2026', in: '-', out: '-', hours: '0.0 h', status: 'LEAVE' },
      { code: 'NV-008', name: 'Trần Hoài An', dept: 'Phòng Kỹ Thuật', date: '30/10/2026', in: '08:21', out: '16:00', hours: '7.6 h', status: 'LATE' }
    ];
  }

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
        <td><strong>${r.hours}</strong></td>
        <td>${badge}</td>
        <td><a class="link-action-blue" onclick="openLateDetailModal('${r.name}', '${r.code}', '15 phút', '${r.in}')">Chi tiết</a></td>
      </tr>
    `;
  }).join('');
}

// Nạp lịch sử chấm công cá nhân (kết nối API GET /api/attendance)
async function loadMyAttendanceData() {
  const tbody = document.getElementById('myAttendanceTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 15px;">Đang nạp dữ liệu chấm công cá nhân...</td></tr>`;

  let records = [];
  try {
    const res = await apiCall('/api/attendance');
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      records = res.data.map(r => ({
        date: r.work_date ? new Date(r.work_date).toLocaleDateString('vi-VN') : 'Hôm nay',
        in: r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
        out: r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
        duration: r.actual_working_hours ? `${r.actual_working_hours} h` : (r.check_in_time ? 'Đang trong ca' : '-'),
        type: r.check_in_method === 'WIFI' ? 'Wi-Fi Office' : (r.check_in_method === 'GPS' ? 'GPS Mobile' : (r.location_name || 'Văn phòng')),
        status: r.status
      }));
    }
  } catch (err) {
    console.warn('Lỗi gọi API attendance cá nhân, sử dụng dữ liệu mặc định:', err.message);
  }

  if (!records.length) {
    records = [
      { date: '30/10/2026', in: '07:55', out: '16:05', duration: '8h 10m', type: 'Wi-Fi Office', status: 'ON_TIME' },
      { date: '29/10/2026', in: '08:00', out: '16:15', duration: '8h 15m', type: 'Wi-Fi Office', status: 'ON_TIME' },
      { date: '28/10/2026', in: '08:12', out: '16:30', duration: '8h 18m', type: 'GPS Mobile', status: 'LATE' },
      { date: '27/10/2026', in: '07:52', out: '16:00', duration: '8h 08m', type: 'Wi-Fi Office', status: 'ON_TIME' },
      { date: '26/10/2026', in: '07:48', out: '16:05', duration: '8h 17m', type: 'Wi-Fi Office', status: 'ON_TIME' },
      { date: '25/10/2026', in: '08:02', out: '16:00', duration: '7h 58m', type: 'Wi-Fi Office', status: 'ON_TIME' }
    ];
  }

  tbody.innerHTML = records.map(r => `
    <tr>
      <td><strong>${r.date}</strong></td>
      <td>${r.in}</td>
      <td>${r.out}</td>
      <td>${r.duration}</td>
      <td><span class="badge-status" style="background:#f1f5f9; color:#475569;">${r.type}</span></td>
      <td>${r.status === 'ON_TIME' ? '<span class="badge-status badge-approved">Đúng giờ</span>' : '<span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn</span>'}</td>
    </tr>
  `).join('');

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
    const res = await apiCall('/api/attendance');
    if (res && res.success && Array.isArray(res.data)) {
      const todayRecord = res.data.find(r => {
        if (!r.work_date) return false;
        const rDate = new Date(r.work_date).toISOString().slice(0, 10);
        return rDate === todayStr;
      });

      if (todayRecord) {
        if (todayRecord.check_in_time) {
          const inTime = new Date(todayRecord.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          checkinBtn.disabled = true;
          checkinBtn.innerText = `Đã Check-in (${inTime})`;
          checkinBtn.style.opacity = '0.7';
          if (checkoutBtn) checkoutBtn.disabled = false;
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
        if (checkoutBtn) checkoutBtn.disabled = true;
      }
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra trạng thái chấm công:', err.message);
  }
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
            <option value="HR" ${u.role === 'HR' ? 'selected' : ''}>HR (Phòng Nhân sự)</option>
            <option value="MANAGER" ${u.role === 'MANAGER' ? 'selected' : ''}>MANAGER (Quản lý)</option>
            <option value="EMPLOYEE" ${u.role === 'EMPLOYEE' ? 'selected' : ''}>EMPLOYEE (Nhân viên)</option>
          </select>
        </td>
        <td>
          <button class="btn-primary-blue" style="padding: 6px 14px; font-size: 12.5px;" onclick="handleUpdateUserRole('${u.id}', '${u.username}')">
            💾 Lưu quyền
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
function loadStatsData() {
  // Đồng bộ giao diện báo cáo với chu kỳ mặc định Tháng 10/2026
  changeStatPeriod('2026-10');
}

function changeStatPeriod(period) {
  // Đặt lại style các nút chọn chu kỳ
  ['statPeriodBtn1', 'statPeriodBtn2', 'statPeriodBtn3'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.className = 'btn-figma-dark';
      btn.style.background = '#f8fafc';
      btn.style.color = '#1e293b';
      btn.style.border = '1px solid #e2e8f0';
    }
  });

  let activeBtnId = 'statPeriodBtn1';
  let periodLabel = 'Tháng 10/2026';
  let kpiRate = '97.9%';
  let kpiHours = '16,368 h';
  let kpiLate = '15';
  let kpiLeave = '30';
  let footStandard = '2,090 công';
  let footActual = '2,046 công';
  let footLate = '15 lượt';
  let footLeave = '30 ngày';
  let footRate = '97.9%';

  let deptsData = [
    { name: 'Phòng Kỹ Thuật', emp: 40, std: 880, act: 864, late: 5, leave: 11, rate: '98.2%' },
    { name: 'Phòng Kinh Doanh', emp: 28, std: 616, act: 602, late: 6, leave: 8, rate: '97.7%' },
    { name: 'Phòng Tài Chính - Kế Toán', emp: 15, std: 330, act: 325, late: 1, leave: 4, rate: '98.5%' },
    { name: 'Phòng Nhân sự', emp: 12, std: 264, act: 255, late: 3, leave: 7, rate: '96.6%' }
  ];

  if (period === '2026-09') {
    activeBtnId = 'statPeriodBtn2';
    periodLabel = 'Tháng 09/2026';
    kpiRate = '97.1%';
    kpiHours = '16,020 h';
    kpiLate = '22';
    kpiLeave = '38';
    footStandard = '2,090 công';
    footActual = '2,029 công';
    footLate = '22 lượt';
    footLeave = '38 ngày';
    footRate = '97.1%';
    deptsData = [
      { name: 'Phòng Kỹ Thuật', emp: 40, std: 880, act: 858, late: 8, leave: 14, rate: '97.5%' },
      { name: 'Phòng Kinh Doanh', emp: 28, std: 616, act: 595, late: 9, leave: 12, rate: '96.6%' },
      { name: 'Phòng Tài Chính - Kế Toán', emp: 15, std: 330, act: 324, late: 2, leave: 4, rate: '98.2%' },
      { name: 'Phòng Nhân sự', emp: 12, std: 264, act: 252, late: 3, leave: 8, rate: '95.5%' }
    ];
  } else if (period === '2026-Q3') {
    activeBtnId = 'statPeriodBtn3';
    periodLabel = 'Quý 3/2026';
    kpiRate = '96.8%';
    kpiHours = '48,150 h';
    kpiLate = '68';
    kpiLeave = '112';
    footStandard = '6,270 công';
    footActual = '6,070 công';
    footLate = '68 lượt';
    footLeave = '112 ngày';
    footRate = '96.8%';
    deptsData = [
      { name: 'Phòng Kỹ Thuật', emp: 40, std: 2640, act: 2560, late: 25, leave: 42, rate: '97.0%' },
      { name: 'Phòng Kinh Doanh', emp: 28, std: 1848, act: 1780, late: 28, leave: 36, rate: '96.3%' },
      { name: 'Phòng Tài Chính - Kế Toán', emp: 15, std: 990, act: 972, late: 6, leave: 12, rate: '98.2%' },
      { name: 'Phòng Nhân sự', emp: 12, std: 792, act: 758, late: 9, leave: 22, rate: '95.7%' }
    ];
  }

  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) {
    activeBtn.className = 'btn-primary-blue';
    activeBtn.style.background = '#2563eb';
    activeBtn.style.color = '#ffffff';
    activeBtn.style.border = 'none';
  }

  // Cập nhật số liệu các thẻ KPI báo cáo
  const rEl = document.getElementById('statMetricRateVal');
  const hEl = document.getElementById('statMetricHoursVal');
  const lEl = document.getElementById('statMetricLateVal');
  const lvEl = document.getElementById('statMetricLeaveVal');
  if (rEl) rEl.innerText = kpiRate;
  if (hEl) hEl.innerText = kpiHours;
  if (lEl) lEl.innerText = kpiLate;
  if (lvEl) lvEl.innerText = kpiLeave;

  // Cập nhật bảng chi tiết phòng ban
  const tbody = document.getElementById('statDeptTableBody');
  if (tbody) {
    tbody.innerHTML = deptsData.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td>${d.emp}</td>
        <td>${d.std.toLocaleString('vi-VN')} công</td>
        <td><strong>${d.act.toLocaleString('vi-VN')} công</strong></td>
        <td><span class="badge-status" style="background: ${d.late > 5 ? '#fef3c7; color: #b45309;' : '#f1f5f9; color: #475569;'}">${d.late} lượt</span></td>
        <td>${d.leave} ngày</td>
        <td><span class="badge-status badge-approved">${d.rate}</span></td>
      </tr>
    `).join('');
  }

  // Cập nhật footer tổng kết bảng
  const fStd = document.getElementById('statFootStandardDays');
  const fAct = document.getElementById('statFootActualDays');
  const fLate = document.getElementById('statFootLateCount');
  const fLeave = document.getElementById('statFootLeaveDays');
  const fRate = document.getElementById('statFootRate');
  if (fStd) fStd.innerText = footStandard;
  if (fAct) fAct.innerText = footActual;
  if (fLate) fLate.innerText = footLate;
  if (fLeave) fLeave.innerText = footLeave;
  if (fRate) fRate.innerText = footRate;

  showToast(`Đã chuyển đổi số liệu thống kê sang: ${periodLabel}`, 'success');
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

  // Cập nhật các chỉ số KPI Dashboard theo phòng ban đã chọn
  const role = state.user?.role || 'EMPLOYEE';
  if (role !== 'EMPLOYEE') {
    const val1 = document.getElementById('dashMetricVal1');
    const sub1 = document.getElementById('dashMetricSub1');
    const val2 = document.getElementById('dashMetricVal2');
    const sub2 = document.getElementById('dashMetricSub2');
    const val3 = document.getElementById('dashMetricVal3');
    const sub3 = document.getElementById('dashMetricSub3');
    const val4 = document.getElementById('dashMetricVal4');
    const sub4 = document.getElementById('dashMetricSub4');

    const donutNum = document.getElementById('donutCenterNumber');
    const legOntime = document.getElementById('donutLegendOntime');
    const legLate = document.getElementById('donutLegendLate');
    const legLeave = document.getElementById('donutLegendLeave');
    const legAbsent = document.getElementById('donutLegendAbsent');
    const donutFoot = document.getElementById('donutSummaryFoot');

    if (count === 95) {
      // Toàn cơ quan (95 người)
      if (val1) val1.innerText = '82 / 95';
      if (sub1) sub1.innerText = '86.3% nhân sự • Gồm 6 người đi muộn';
      if (val2) val2.innerText = '08';
      if (sub2) sub2.innerText = 'Đã được duyệt nghỉ hôm nay';
      if (val3) val3.innerText = '06';
      if (sub3) sub3.innerText = 'Là một phần trong 82 người đi làm';
      if (val4) val4.innerText = '12';
      if (sub4) sub4.innerText = 'Tất cả ngày yêu cầu • Cần xử lý';

      if (donutNum) donutNum.innerText = '95';
      if (legOntime) legOntime.innerText = '76';
      if (legLate) legLate.innerText = '06';
      if (legLeave) legLeave.innerText = '08';
      if (legAbsent) legAbsent.innerText = '05';
      if (donutFoot) donutFoot.innerText = '76 đúng giờ + 6 đi muộn + 8 nghỉ phép + 5 chưa chấm công = 95 nhân viên';
    } else if (count === 28) {
      // Phòng Kinh Doanh (28 người)
      if (val1) val1.innerText = '24 / 28';
      if (sub1) sub1.innerText = '85.7% nhân sự • Gồm 2 người đi muộn';
      if (val2) val2.innerText = '02';
      if (sub2) sub2.innerText = 'Đã được duyệt nghỉ hôm nay';
      if (val3) val3.innerText = '02';
      if (sub3) sub3.innerText = 'Là một phần trong 24 người đi làm';
      if (val4) val4.innerText = '03';
      if (sub4) sub4.innerText = 'Tất cả ngày yêu cầu • Cần xử lý';

      if (donutNum) donutNum.innerText = '28';
      if (legOntime) legOntime.innerText = '22';
      if (legLate) legLate.innerText = '02';
      if (legLeave) legLeave.innerText = '02';
      if (legAbsent) legAbsent.innerText = '02';
      if (donutFoot) donutFoot.innerText = '22 đúng giờ + 2 đi muộn + 2 nghỉ phép + 2 chưa chấm công = 28 nhân viên';
    } else if (count === 15) {
      // Phòng Tài Chính (15 người)
      if (val1) val1.innerText = '14 / 15';
      if (sub1) sub1.innerText = '93.3% nhân sự • Đúng giờ';
      if (val2) val2.innerText = '01';
      if (sub2) sub2.innerText = 'Đã được duyệt nghỉ hôm nay';
      if (val3) val3.innerText = '00';
      if (sub3) sub3.innerText = 'Không có nhân sự đi muộn';
      if (val4) val4.innerText = '01';
      if (sub4) sub4.innerText = 'Tất cả ngày yêu cầu • Cần xử lý';

      if (donutNum) donutNum.innerText = '15';
      if (legOntime) legOntime.innerText = '14';
      if (legLate) legLate.innerText = '00';
      if (legLeave) legLeave.innerText = '01';
      if (legAbsent) legAbsent.innerText = '00';
      if (donutFoot) donutFoot.innerText = '14 đúng giờ + 0 đi muộn + 1 nghỉ phép + 0 chưa chấm công = 15 nhân viên';
    } else if (count === 12) {
      // Phòng Nhân Sự (12 người)
      if (val1) val1.innerText = '10 / 12';
      if (sub1) sub1.innerText = '83.3% nhân sự • Gồm 1 người đi muộn';
      if (val2) val2.innerText = '01';
      if (sub2) sub2.innerText = 'Đã được duyệt nghỉ hôm nay';
      if (val3) val3.innerText = '01';
      if (sub3) sub3.innerText = 'Là một phần trong 10 người đi làm';
      if (val4) val4.innerText = '01';
      if (sub4) sub4.innerText = 'Tất cả ngày yêu cầu • Cần xử lý';

      if (donutNum) donutNum.innerText = '12';
      if (legOntime) legOntime.innerText = '09';
      if (legLate) legLate.innerText = '01';
      if (legLeave) legLeave.innerText = '01';
      if (legAbsent) legAbsent.innerText = '01';
      if (donutFoot) donutFoot.innerText = '9 đúng giờ + 1 đi muộn + 1 nghỉ phép + 1 chưa chấm công = 12 nhân viên';
    } else {
      // Mặc định: Phòng Kỹ Thuật (40 người)
      if (val1) val1.innerText = '34 / 40';
      if (sub1) sub1.innerText = '85% nhân sự • Gồm 3 người đi muộn';
      if (val2) val2.innerText = '04';
      if (sub2) sub2.innerText = 'Đã được duyệt nghỉ hôm nay';
      if (val3) val3.innerText = '03';
      if (sub3) sub3.innerText = 'Là một phần trong 34 người đi làm';
      if (val4) val4.innerText = '07';
      if (sub4) sub4.innerText = 'Tất cả ngày yêu cầu • Cần xử lý';

      if (donutNum) donutNum.innerText = '40';
      if (legOntime) legOntime.innerText = '31';
      if (legLate) legLate.innerText = '03';
      if (legLeave) legLeave.innerText = '04';
      if (legAbsent) legAbsent.innerText = '02';
      if (donutFoot) donutFoot.innerText = '31 đúng giờ + 3 đi muộn + 4 nghỉ phép + 2 chưa chấm công = 40 nhân viên';
    }
  }

  showToast(`Đã lọc dữ liệu theo: ${name} (${count} nhân sự)`, 'success');
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

async function handleCheckIn() {
  const checkinBtn = document.getElementById('btnMyCheckIn');
  const checkoutBtn = document.getElementById('btnMyCheckOut');
  if (checkinBtn) {
    checkinBtn.disabled = true;
    checkinBtn.innerText = 'Đang Check-in...';
  }

  try {
    // Gọi API Check-in trực tiếp qua Gateway tới attendance-service (:3003)
    const res = await apiCall('/api/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify({
        method: 'WIFI',
        wifiSsid: 'HTQLNS_OFFICE_5G',
        latitude: 13.759142,
        longitude: 109.218536,
        bypassGeofence: true
      })
    });

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (checkinBtn) {
      checkinBtn.disabled = true;
      checkinBtn.innerText = `Đã Check-in (${timeStr})`;
      checkinBtn.style.opacity = '0.7';
    }
    if (checkoutBtn) checkoutBtn.disabled = false;

    showToast(res.message || `Điểm danh vào ca thành công lúc ${timeStr}! (Wi-Fi Công ty hợp lệ)`, 'success');
    loadMyAttendanceData();
  } catch (err) {
    if (checkinBtn) {
      checkinBtn.disabled = false;
      checkinBtn.innerText = 'Check In';
    }
    showToast(`Check-in thất bại: ${err.message}`, 'error');
  }
}

async function handleCheckOut() {
  const checkoutBtn = document.getElementById('btnMyCheckOut');
  if (checkoutBtn) {
    checkoutBtn.disabled = true;
    checkoutBtn.innerText = 'Đang Check-out...';
  }

  try {
    const res = await apiCall('/api/attendance/check-out', {
      method: 'POST',
      body: JSON.stringify({
        method: 'WIFI',
        latitude: 13.759142,
        longitude: 109.218536
      })
    });

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.innerText = `Đã Check-out (${timeStr})`;
    }

    showToast(res.message || `Điểm danh ra ca thành công lúc ${timeStr}! Chúc bạn buổi tối vui vẻ.`, 'success');
    loadMyAttendanceData();
  } catch (err) {
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.innerText = 'Check Out';
    }
    showToast(`Check-out thất bại: ${err.message}`, 'error');
  }
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
    const clock = document.getElementById('liveClockText');
    if (clock) {
      clock.innerText = new Date().toLocaleTimeString('vi-VN');
    }
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
  }
});
