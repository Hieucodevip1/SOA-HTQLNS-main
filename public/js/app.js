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
  const role = document.getElementById('regRole')?.value || 'EMPLOYEE';
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
        role,
        first_name: firstName,
        last_name: lastName
      })
    });

    if (!res || !res.success) {
      throw new Error(res?.error || res?.message || 'Đăng ký không thành công');
    }

    const roleLabel = role === 'MANAGER' ? 'Quản lý' : 'Nhân viên';
    showToast(`Đăng ký tài khoản ${username} (${roleLabel}) thành công! Mời bạn đăng nhập.`, 'success');
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

  let displayName = state.user.fullName;
  if (!displayName) {
    if (state.user.username === 'employee') displayName = 'Vũ Đức Hiếu';
    else if (state.user.username === 'manager') displayName = 'Thầy Lâm';
    else if (state.user.username === 'admin') displayName = 'Nguyễn Quản Trị (Admin)';
    else if (state.user.username === 'hr_admin') displayName = 'Trần Thị Thu Hà (HR)';
    else displayName = state.user.username;
  }

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
    if (state.user.role === 'EMPLOYEE') {
      greetSub.innerText = `Xin chào ${displayName}, chúc bạn một ngày làm việc hiệu quả và năng suất!`;
    } else {
      greetSub.innerText = `Xin chào ${displayName}, đây là tình hình đội nhóm và chuyên cần hôm nay.`;
    }
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

  const adminOverviewSection = document.getElementById('dashAdminOverviewSection');
  const empOverviewSection = document.getElementById('dashEmployeeOverviewSection');

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

  // 6. Điều chỉnh phân hệ Dashboard theo vai trò:
  if (role === 'EMPLOYEE') {
    if (adminOverviewSection) adminOverviewSection.style.display = 'none';
    if (empOverviewSection) empOverviewSection.style.display = 'block';
    if (pendingRequestsCard) pendingRequestsCard.style.display = 'none';
    if (personalRequestsCard) personalRequestsCard.style.display = 'block';
    loadEmployeeDashboardData();
  } else {
    if (adminOverviewSection) adminOverviewSection.style.display = 'block';
    if (empOverviewSection) empOverviewSection.style.display = 'none';
    if (pendingRequestsCard) pendingRequestsCard.style.display = 'block';
    if (personalRequestsCard) personalRequestsCard.style.display = 'none';
    loadDashboardPendingRequests();
  }

  // 7. Thống kê chuyên cần cá nhân (nếu ở view stats)
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

  // 7. Quyền hạn thao tác phân ca & ca làm việc
  const btnShiftOpenAssign = document.getElementById('btnShiftOpenAssign');
  const btnShiftOpenCreateShift = document.getElementById('btnShiftOpenCreateShift');
  if (btnShiftOpenAssign) {
    btnShiftOpenAssign.style.display = (role !== 'EMPLOYEE') ? 'inline-flex' : 'none';
  }
  if (btnShiftOpenCreateShift) {
    btnShiftOpenCreateShift.style.display = (role === 'ADMIN' || role === 'HR') ? 'inline-flex' : 'none';
  }

  // 8. Quyền hạn thao tác tính lương & cấu hình lương
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
  if (tabPayrollPer) tabPayrollPer.style.display = (role !== 'EMPLOYEE') ? 'inline-block' : 'none';

  if (role === 'EMPLOYEE') {
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

  // Match leave-service: count Monday-Friday and allow a half-day only
  // when the request covers a single working day.
  let workingDays = 0;
  for (let date = new Date(d1); date <= d2; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) workingDays++;
  }
  const total = session !== 'FULL_DAY'
    ? (startVal === endVal && workingDays === 1 ? 0.5 : 0)
    : workingDays;
  totalInput.value = total.toFixed(1);
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
    } else if (r.status === 'CANCELLED') {
      badgeHtml = `<span class="badge-status badge-rejected">Đã hủy</span>`;
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
        ${role === 'EMPLOYEE' && r.status === 'PENDING'
          ? `<button class="btn-reject-sm" onclick="handleCancelLeave('${r.id}')">Hủy đơn</button>`
          : ''}
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

async function handleCancelLeave(id) {
  if (!confirm('Bạn có chắc muốn hủy đơn nghỉ phép đang chờ duyệt?')) return;
  try {
    await apiCall(`/api/v1/leave-requests/${encodeURIComponent(id)}/cancel`, {
      method: 'POST'
    });
    showToast('Đã hủy đơn nghỉ phép thành công', 'success');
    await loadRequestsData();
    await loadDashboardPendingRequests();
  } catch (err) {
    showToast(`Không thể hủy đơn: ${err.message}`, 'error');
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
          else if (r.status === 'CANCELLED') badgeHtml = `<span class="badge-status badge-rejected">Đã hủy</span>`;
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
                ${r.status === 'PENDING' ? `<button class="btn-reject-sm" onclick="handleCancelLeave('${r.id}')">Hủy</button>` : ''}
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8;">Chưa có dữ liệu nhân sự</td></tr>`;
    return;
  }

  const canDelete = ['ADMIN', 'HR', 'MANAGER'].includes(state.user?.role);

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
      <td style="text-align: center;">
        ${canDelete ? `<button class="btn-reject-sm" onclick="confirmDeleteEmployee('${e.id}', '${e.full_name || e.code}')" style="cursor: pointer; padding: 4px 10px; font-size: 11.5px; border-radius: 6px;">🗑️ Xóa</button>` : '-'}
      </td>
    </tr>
  `
    )
    .join('');
}

async function confirmDeleteEmployee(id, name) {
  if (!confirm(`Bạn có chắc chắn muốn xóa nhân viên "${name}" khỏi hệ thống không?`)) {
    return;
  }
  try {
    const res = await apiCall(`/api/organization/employees/${id}?permanent=true`, {
      method: 'DELETE'
    });
    if (res && res.success) {
      showToast(`Đã xóa nhân viên "${name}" thành công!`, 'success');
      loadEmployeesData();
    } else {
      throw new Error(res?.error || 'Xóa nhân viên thất bại');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
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

  const filterDate = document.getElementById('attFilterDate')?.value || '';
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
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      records = res.data.map(r => {
        const empCode = r.emp_code || (r.emp_id ? (r.emp_id.length > 10 ? 'NV-' + r.emp_id.slice(-4) : r.emp_id) : 'NV-001');
        return {
          id: r.id,
          emp_id: r.emp_id,
          code: empCode,
          name: r.emp_name || `Nhân viên (${empCode})`,
          dept: r.dept_name || 'Phòng Kỹ Thuật',
          dept_code: r.dept_code || 'TECH',
          work_date: r.work_date ? new Date(r.work_date).toISOString().split('T')[0] : '2026-10-30',
          date: r.work_date ? new Date(r.work_date).toLocaleDateString('vi-VN') : '30/10/2026',
          in: r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
          out: r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
          hours: r.actual_working_hours ? `${r.actual_working_hours} h` : (r.check_in_time && r.check_out_time ? '8.0 h' : '0.0 h'),
          status: r.status,
          late_minutes: r.late_minutes || 0,
          adj_id: r.adjustment_id || null,
          adj_reason: r.adjustment_reason || null,
          adj_status: r.adjustment_status || null
        };
      });
    }
  } catch (err) {
    console.warn('Lỗi tải dữ liệu attendance toàn công ty, sử dụng fallback demo:', err.message);
  }

  if (!records.length) {
    records = [
      { id: 'att-1', code: 'NV-001', name: 'Vũ Đức Hiếu', dept: 'Phòng Kỹ Thuật', dept_code: 'TECH', work_date: '2026-10-30', date: '30/10/2026', in: '07:55', out: '16:05', hours: '8.1 h', status: 'ON_TIME', late_minutes: 0, adj_id: null, adj_reason: null, adj_status: null },
      { id: 'att-2', code: 'NV-002', name: 'Huỳnh Gia Kiệt', dept: 'Phòng Kỹ Thuật', dept_code: 'TECH', work_date: '2026-10-30', date: '30/10/2026', in: '08:12', out: '16:00', hours: '7.8 h', status: 'LATE', late_minutes: 12, adj_id: 'adj-02', adj_reason: 'Kẹt xe ngập đường tại giao lộ Nguyễn Tri Phương', adj_status: 'PENDING' },
      { id: 'att-3', code: 'NV-003', name: 'Nguyễn Gia Hảo', dept: 'Phòng Kỹ Thuật', dept_code: 'TECH', work_date: '2026-10-30', date: '30/10/2026', in: '08:07', out: '16:10', hours: '8.0 h', status: 'LATE', late_minutes: 7, adj_id: null, adj_reason: null, adj_status: null },
      { id: 'att-4', code: 'NV-004', name: 'Thầy Lâm (Quản lý)', dept: 'Phòng Kỹ Thuật', dept_code: 'TECH', work_date: '2026-10-30', date: '30/10/2026', in: '07:45', out: '17:00', hours: '9.2 h', status: 'ON_TIME', late_minutes: 0, adj_id: null, adj_reason: null, adj_status: null },
      { id: 'att-5', code: 'NV-005', name: 'Lê Ngọc Mai', dept: 'Phòng Nhân sự', dept_code: 'HR', work_date: '2026-10-30', date: '30/10/2026', in: '07:50', out: '16:00', hours: '8.1 h', status: 'ON_TIME', late_minutes: 0, adj_id: null, adj_reason: null, adj_status: null },
      { id: 'att-6', code: 'NV-006', name: 'Phạm Minh Tuân', dept: 'Phòng Kinh Doanh', dept_code: 'BIZ', work_date: '2026-10-30', date: '30/10/2026', in: '07:58', out: '16:30', hours: '8.5 h', status: 'ON_TIME', late_minutes: 0, adj_id: null, adj_reason: null, adj_status: null },
      { id: 'att-7', code: 'NV-007', name: 'Đỗ Thu Hà', dept: 'Phòng Tài Chính - Kế Toán', dept_code: 'FIN', work_date: '2026-10-30', date: '30/10/2026', in: '-', out: '-', hours: '0.0 h', status: 'LEAVE', late_minutes: 0, adj_id: null, adj_reason: null, adj_status: null },
      { id: 'att-8', code: 'NV-008', name: 'Trần Hoài An', dept: 'Phòng Kỹ Thuật', dept_code: 'TECH', work_date: '2026-10-30', date: '30/10/2026', in: '08:21', out: '16:00', hours: '7.6 h', status: 'LATE', late_minutes: 21, adj_id: 'adj-08', adj_reason: 'Hỏng xe máy giữa cầu vượt', adj_status: 'PENDING' }
    ];
  }

  // Áp dụng bộ lọc chính xác
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;">Không có bản ghi chấm công nào phù hợp bộ lọc</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    let badge = '<span class="badge-status badge-approved">Đúng giờ</span>';
    if (r.status === 'LATE') badge = `<span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn (${r.late_minutes || 15}p)</span>`;
    if (r.status === 'LEAVE') badge = '<span class="badge-status" style="background:#eff6ff; color:#2563eb;">Nghỉ phép</span>';

    const cleanName = (r.name || '').replace(/'/g, "\\'");
    const cleanDept = (r.dept || '').replace(/'/g, "\\'");
    const cleanReason = (r.adj_reason || '').replace(/'/g, "\\'");

    let actionBtn = `<a class="link-action-blue" style="cursor: pointer;" onclick="openOnTimeDetailModal('${cleanName}', '${r.code}', '${r.in}', '${r.out}', '${cleanDept}')">Chi tiết</a>`;
    if (r.status === 'LATE') {
      actionBtn = `<a class="link-action-blue" style="cursor: pointer; color: #d97706; font-weight: 600;" onclick="openLateDetailModal('${cleanName}', '${r.code}', '${r.late_minutes || 15} phút', '${r.in}', '${cleanDept}', '${cleanReason}', '${r.adj_id || ''}', '${r.adj_status || ''}')">Xem xét giải trình →</a>`;
    } else if (r.status === 'LEAVE') {
      actionBtn = `<a class="link-action-blue" style="cursor: pointer; color: #2563eb;" onclick="navigateToView('requests')">Xem đơn nghỉ ↗</a>`;
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
async function loadMyAttendanceData() {
  const tbody = document.getElementById('myAttendanceTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 15px;">Đang nạp dữ liệu chấm công cá nhân...</td></tr>`;

  let records = [];
  try {
    const res = await apiCall('/api/attendance');
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      records = res.data.map(r => ({
        id: r.id,
        work_date: r.work_date ? new Date(r.work_date).toLocaleDateString('vi-VN') : 'Hôm nay',
        date: r.work_date ? new Date(r.work_date).toLocaleDateString('vi-VN') : 'Hôm nay',
        in: r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
        out: r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
        duration: r.actual_working_hours ? `${r.actual_working_hours} h` : (r.check_in_time ? 'Đang trong ca' : '-'),
        type: r.check_in_method === 'WIFI' ? 'Wi-Fi Office' : (r.check_in_method === 'GPS' ? 'GPS Mobile' : (r.location_name || 'Văn phòng')),
        status: r.status,
        late_minutes: r.late_minutes || 0,
        adj_id: r.adjustment_id || null,
        adj_reason: r.adjustment_reason || null,
        adj_status: r.adjustment_status || null
      }));
    }
  } catch (err) {
    console.warn('Lỗi gọi API attendance cá nhân, sử dụng dữ liệu mặc định:', err.message);
  }

  if (!records.length) {
    records = [
      { id: 'my-1', date: '30/10/2026', work_date: '30/10/2026', in: '07:55', out: '16:05', duration: '8h 10m', type: 'Wi-Fi Office', status: 'ON_TIME', late_minutes: 0, adj_status: null },
      { id: 'my-2', date: '29/10/2026', work_date: '29/10/2026', in: '08:00', out: '16:15', duration: '8h 15m', type: 'Wi-Fi Office', status: 'ON_TIME', late_minutes: 0, adj_status: null },
      { id: 'my-3', date: '28/10/2026', work_date: '28/10/2026', in: '08:12', out: '16:30', duration: '8h 18m', type: 'GPS Mobile', status: 'LATE', late_minutes: 12, adj_status: null },
      { id: 'my-4', date: '27/10/2026', work_date: '27/10/2026', in: '07:52', out: '16:00', duration: '8h 08m', type: 'Wi-Fi Office', status: 'ON_TIME', late_minutes: 0, adj_status: null },
      { id: 'my-5', date: '26/10/2026', work_date: '26/10/2026', in: '07:48', out: '16:05', duration: '8h 17m', type: 'Wi-Fi Office', status: 'ON_TIME', late_minutes: 0, adj_status: null }
    ];
  }

  tbody.innerHTML = records.map(r => {
    let statusBadge = '<span class="badge-status badge-approved">Đúng giờ</span>';
    let adjCell = '<span style="color: #94a3b8;">-</span>';

    if (r.status === 'LATE') {
      statusBadge = `<span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn (${r.late_minutes || 15}p)</span>`;
      if (r.adj_status === 'APPROVED') {
        adjCell = '<span class="badge-status badge-approved">✓ Đã duyệt giải trình</span>';
      } else if (r.adj_status === 'PENDING') {
        adjCell = '<span class="badge-status" style="background:#fef3c7; color:#b45309;">⏳ Chờ duyệt giải trình</span>';
      } else {
        adjCell = `<button class="btn-primary-blue" style="padding: 4px 10px; font-size: 11.5px; border-radius: 6px;" onclick="openSubmitAdjustmentModal('${r.id || ''}', '${r.date}', '${r.in}')">📝 Gửi giải trình</button>`;
      }
    } else if (r.status === 'LEAVE') {
      statusBadge = '<span class="badge-status" style="background:#eff6ff; color:#2563eb;">Nghỉ phép</span>';
    }

    return `
      <tr>
        <td><strong>${r.date}</strong></td>
        <td>${r.in}</td>
        <td>${r.out}</td>
        <td>${r.duration}</td>
        <td><span class="badge-status" style="background:#f1f5f9; color:#475569;">${r.type}</span></td>
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

function openOnTimeDetailModal(name, code, checkinTime, checkoutTime, dept) {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px;">
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px; color: #065f46;">
        <strong>✅ Tình trạng:</strong> Chấm công Đúng giờ (Giờ vào: ${checkinTime || '07:55'} - Giờ ra: ${checkoutTime || '16:05'})
      </div>
      <div><strong>Nhân viên:</strong> ${name} (${code})</div>
      <div><strong>Phòng ban:</strong> ${dept || 'Phòng Kỹ Thuật'}</div>
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
      <div><strong>Phòng ban:</strong> ${dept || 'Phòng Kỹ Thuật'}</div>
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
async function loadEmployeeDashboardData() {
  const checkInVal = document.getElementById('dashEmpCheckInVal');
  const checkInNote = document.getElementById('dashEmpCheckInNote');
  const checkOutVal = document.getElementById('dashEmpCheckOutVal');
  const checkOutNote = document.getElementById('dashEmpCheckOutNote');
  const hoursVal = document.getElementById('dashEmpHoursVal');
  const todayBadge = document.getElementById('dashEmpTodayBadge');
  const recentAttTbody = document.getElementById('dashEmpRecentAttendanceBody');
  const recentReqTbody = document.getElementById('dashEmpRecentRequestsBody');

  try {
    const res = await apiCall('/api/attendance');
    const logs = (res && res.success && Array.isArray(res.data)) ? res.data : [];

    if (logs.length > 0) {
      const latest = logs[0];
      const inTime = latest.check_in_time ? new Date(latest.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;
      const outTime = latest.check_out_time ? new Date(latest.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;

      if (inTime) {
        if (checkInVal) checkInVal.innerText = inTime;
        if (checkInNote) checkInNote.innerText = latest.status === 'LATE' ? `Đi muộn ${latest.late_minutes || 15}p` : 'Đúng giờ';
        if (checkInNote) checkInNote.style.color = latest.status === 'LATE' ? '#d97706' : '#059669';
        if (todayBadge) {
          todayBadge.innerText = latest.status === 'LATE' ? '⚠️ Đã vào ca (Đi muộn)' : '🟢 Đã vào ca (Đúng giờ)';
          todayBadge.style.background = latest.status === 'LATE' ? '#fef3c7' : '#dcfce7';
          todayBadge.style.color = latest.status === 'LATE' ? '#b45309' : '#15803d';
        }
      }

      if (outTime) {
        if (checkOutVal) checkOutVal.innerText = outTime;
        if (checkOutNote) checkOutNote.innerText = 'Đã hoàn tất ca';
        if (hoursVal) hoursVal.innerText = `${latest.actual_working_hours || '8.0'} h`;
        if (todayBadge) {
          todayBadge.innerText = '🔵 Hoàn thành ca làm việc';
          todayBadge.style.background = '#dbeafe';
          todayBadge.style.color = '#1e40af';
        }
      } else if (inTime) {
        if (checkOutVal) checkOutVal.innerText = '--:--';
        if (checkOutNote) checkOutNote.innerText = 'Đang trong ca làm việc';
      }
    }

    if (recentAttTbody) {
      const top5 = logs.slice(0, 5);
      if (!top5.length) {
        recentAttTbody.innerHTML = `
          <tr>
            <td>30/10/2026</td>
            <td>07:58</td>
            <td>16:30</td>
            <td><span class="badge-status badge-approved">Đúng giờ</span></td>
            <td><span style="color:#94a3b8;">-</span></td>
          </tr>
          <tr>
            <td>29/10/2026</td>
            <td>08:15</td>
            <td>16:30</td>
            <td><span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn (15p)</span></td>
            <td><button class="btn-primary-blue" style="padding: 3px 8px; font-size: 11px;" onclick="openSubmitAdjustmentModal('', '29/10/2026', '08:15')">📝 Giải trình</button></td>
          </tr>
        `;
      } else {
        recentAttTbody.innerHTML = top5.map(r => {
          const dateStr = r.work_date ? new Date(r.work_date).toLocaleDateString('vi-VN') : '30/10/2026';
          const inStr = r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-';
          const outStr = r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-';

          let statusBadge = '<span class="badge-status badge-approved">Đúng giờ</span>';
          let adjBtn = '<span style="color:#94a3b8;">-</span>';

          if (r.status === 'LATE') {
            statusBadge = `<span class="badge-status" style="background:#fef3c7; color:#d97706;">Đi muộn (${r.late_minutes || 15}p)</span>`;
            if (r.adjustment_status === 'APPROVED') {
              adjBtn = '<span class="badge-status badge-approved">✓ Đã duyệt</span>';
            } else if (r.adjustment_status === 'PENDING') {
              adjBtn = '<span class="badge-status" style="background:#fef3c7; color:#b45309;">⏳ Đang chờ</span>';
            } else {
              adjBtn = `<button class="btn-primary-blue" style="padding: 3px 8px; font-size: 11px;" onclick="openSubmitAdjustmentModal('${r.id || ''}', '${dateStr}', '${inStr}')">📝 Giải trình</button>`;
            }
          } else if (r.status === 'LEAVE') {
            statusBadge = '<span class="badge-status" style="background:#eff6ff; color:#2563eb;">Nghỉ phép</span>';
          }

          return `
            <tr>
              <td>${dateStr}</td>
              <td>${inStr}</td>
              <td>${outStr}</td>
              <td>${statusBadge}</td>
              <td>${adjBtn}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.warn('Lỗi loadEmployeeDashboardData:', err);
  }

  try {
    const resLeaves = await apiCall('/api/leave');
    const reqList = (resLeaves && resLeaves.success && Array.isArray(resLeaves.data)) ? resLeaves.data : [];
    if (recentReqTbody) {
      if (!reqList.length) {
        recentReqTbody.innerHTML = `
          <tr>
            <td><strong>NP-2026-024</strong></td>
            <td>Nghỉ phép năm</td>
            <td>02/11/2026</td>
            <td><span class="badge-status" style="background:#fef3c7; color:#b45309;">⏳ Đang chờ</span></td>
          </tr>
        `;
      } else {
        recentReqTbody.innerHTML = reqList.slice(0, 5).map(req => {
          let badge = '<span class="badge-status" style="background:#fef3c7; color:#b45309;">⏳ Đang chờ</span>';
          if (req.status === 'APPROVED') badge = '<span class="badge-status badge-approved">✓ Đã duyệt</span>';
          if (req.status === 'REJECTED') badge = '<span class="badge-status badge-rejected">✕ Từ chối</span>';

          return `
            <tr>
              <td><strong>${req.id || req.code || 'NP-001'}</strong></td>
              <td>${req.type_name || req.leave_type || 'Nghỉ phép'}</td>
              <td>${req.start_date || '02/11/2026'}</td>
              <td>${badge}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch {}
}

async function handleDashboardCheckIn() {
  await handleCheckIn();
  loadEmployeeDashboardData();
}

async function handleDashboardCheckOut() {
  await handleCheckOut();
  loadEmployeeDashboardData();
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
    // Use the browser's real coordinates rather than spoofed office GPS/WiFi.
    if (!navigator.geolocation) {
      throw new Error('Trình duyệt không hỗ trợ định vị GPS để chấm công');
    }
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 12000, maximumAge: 0
      });
    });
    const res = await apiCall('/api/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify({
        method: 'GPS',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
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
    loadShiftSwapRequests();
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
    loadShiftSwapRequests(),
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
          <td>${a.department_name || 'Phòng Kỹ Thuật'}</td>
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
            ` : ((state.user?.role === 'EMPLOYEE' && ['SCHEDULED','SWAPPED'].includes(a.status) &&
              String(a.work_date).slice(0,10) > new Date().toISOString().slice(0,10))
                ? `<button class="btn-secondary-outline" style="padding: 4px 10px; font-size: 11.5px;" onclick="openShiftSwapModal('${a.id}', '${String(a.work_date).slice(0,10)}')">Xin đổi ca</button>`
                : `<span style="font-size: 11px; color: #94a3b8;">—</span>`)}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi tải lịch phân ca:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #ef4444; padding: 20px;">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

// Swap requests are rendered from Shift Service rather than simulated UI state.
function swapUiText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function loadShiftSwapRequests() {
  const parent = document.getElementById('tabContentAssignments');
  if (!parent) return;
  let panel = document.getElementById('shiftSwapRequestsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'shiftSwapRequestsPanel';
    panel.style.marginTop = '22px';
    parent.appendChild(panel);
  }
  try {
    const response = await apiCall('/api/v1/shift-swaps');
    const rows = response?.data || [];
    const canApprove = ['ADMIN', 'HR', 'MANAGER'].includes(state.user?.role);
    const myId = state.user?.empId || state.user?.emp_id;
    panel.innerHTML = `
      <h3 style="font-size: 16px; margin-bottom: 10px;">Yêu cầu đổi ca</h3>
      <div style="overflow-x: auto;">
        <table class="figma-table">
          <thead><tr><th>Ngày</th><th>Nhân viên yêu cầu</th><th>Nhân viên đổi cùng</th><th>Đổi ca</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(s => `
              <tr>
                <td>${swapUiText(String(s.work_date).slice(0,10))}</td>
                <td>${swapUiText(s.requester_emp_id)}</td>
                <td>${swapUiText(s.target_emp_id)}</td>
                <td>${swapUiText(s.requester_shift_code)} ↔ ${swapUiText(s.target_shift_code)}</td>
                <td>${swapUiText(s.status)}</td>
                <td>
                  ${canApprove && s.status === 'PENDING' ? `
                    <button class="btn-approve-sm" onclick="handleShiftSwapDecision('${s.id}', 'APPROVED')">Duyệt</button>
                    <button class="btn-reject-sm" onclick="handleShiftSwapDecision('${s.id}', 'REJECTED')">Từ chối</button>
                  ` : ''}
                  ${s.status === 'PENDING' && s.requester_emp_id === myId ? `
                    <button class="btn-reject-sm" onclick="cancelShiftSwap('${s.id}')">Hủy</button>
                  ` : ''}
                </td>
              </tr>`).join('') : '<tr><td colspan="6">Chưa có yêu cầu đổi ca</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    panel.textContent = 'Không thể tải yêu cầu đổi ca: ' + err.message;
  }
}

async function openShiftSwapModal(assignmentId, date) {
  try {
    const response = await apiCall(`/api/v1/shift-swaps/candidates?date=${encodeURIComponent(date)}`);
    const candidates = response?.data || [];
    if (!candidates.length) {
      showToast('Không tìm thấy ca làm việc khác để đổi vào ngày này', 'warning');
      return;
    }
    const options = candidates.map(c => `
      <option value="${swapUiText(c.id)}">${swapUiText(c.shift_code)} - ${swapUiText(c.emp_id)}</option>`
    ).join('');
    openModal('Yêu cầu đổi ca', `
      <form onsubmit="submitShiftSwap(event, '${assignmentId}')">
        <label>Chọn phân ca muốn đổi</label>
        <select id="swapTargetAssignment" class="topbar-search-input" required>${options}</select>
        <label style="display:block;margin-top:12px;">Lý do đổi ca</label>
        <textarea id="swapRequestReason" class="topbar-search-input" rows="3" required maxlength="1000"></textarea>
        <button type="submit" class="btn-primary-blue" style="margin-top:12px;">Gửi yêu cầu</button>
      </form>`);
  } catch (err) { showToast('Lỗi tải phân ca: ' + err.message, 'error'); }
}

async function submitShiftSwap(e, requesterAssignmentId) {
  e.preventDefault();
  try {
    await apiCall('/api/v1/shift-swaps', {
      method: 'POST',
      body: JSON.stringify({
        requesterAssignmentId,
        targetAssignmentId: document.getElementById('swapTargetAssignment').value,
        reason: document.getElementById('swapRequestReason').value.trim()
      })
    });
    closeModal();
    showToast('Đã gửi yêu cầu đổi ca để quản lý xét duyệt', 'success');
    await loadShiftSwapRequests();
  } catch (err) { showToast('Không thể gửi yêu cầu: ' + err.message, 'error'); }
}

async function handleShiftSwapDecision(id, decision) {
  if (!confirm(decision === 'APPROVED' ? 'Xác nhận đổi ca cho hai nhân viên?' : 'Từ chối yêu cầu đổi ca?')) return;
  try {
    await apiCall(`/api/v1/shift-swaps/${encodeURIComponent(id)}/decision`, {
      method: 'PATCH', body: JSON.stringify({ decision })
    });
    showToast(decision === 'APPROVED' ? 'Đã thực hiện đổi ca' : 'Đã từ chối đổi ca', 'success');
    await Promise.all([loadShiftAssignments(), loadShiftSwapRequests()]);
  } catch (err) { showToast('Không thể xử lý yêu cầu: ' + err.message, 'error'); }
}

async function cancelShiftSwap(id) {
  if (!confirm('Hủy yêu cầu đổi ca này?')) return;
  try {
    await apiCall(`/api/v1/shift-swaps/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    showToast('Đã hủy yêu cầu đổi ca', 'success');
    await loadShiftSwapRequests();
  } catch (err) { showToast('Không thể hủy yêu cầu: ' + err.message, 'error'); }
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
        <td>${o.department_name || 'Phòng Kỹ Thuật'}</td>
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
          <td>${p.department_name || 'Phòng Kỹ Thuật'}</td>
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
        <strong>⚡ Quy trình tổng hợp tự động:</strong>
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


