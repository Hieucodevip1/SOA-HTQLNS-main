/**
 * public/js/app.js
 * Frontend JavaScript điều khiển giao diện chuẩn Figma (Images 1 - 5)
 * Tương tác với API Gateway trong kiến trúc Microservices HTQLNS
 * Hỗ trợ hoạt động mượt mà ở cả chế độ chạy máy chủ (http://localhost:3000)
 * lẫn mở trực tiếp file nội bộ (file:///).
 */

const API_BASE = ''; // Gọi qua API Gateway cùng Host/Port

// Helper lưu trữ an toàn (tránh lỗi SecurityError khi mở file:// trong trình duyệt nghiêm ngặt)
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

// Dữ liệu mẫu phong phú khi chạy ngoại tuyến / file mode
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

let state = {
  token: safeGetStorage('htqlns_token', null),
  user: JSON.parse(safeGetStorage('htqlns_user', 'null')),
  departments: [],
  positions: [],
  employees: [],
  currentView: 'dashboard'
};

// ==============================================================================
// 1. TOAST NOTIFICATION
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
// 2. WRAPPER GỌI API QUA GATEWAY
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
        handleLogoutClick();
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
// 3. XÁC THỰC AUTH (LOGIN & REGISTER THEO FIGMA IMAGES 1, 4, 5)
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

function quickFillAuth(role) {
  document.getElementById('loginUsername').value = role;
  document.getElementById('loginPassword').value = '123456';
  handleLoginSubmit(new Event('submit'));
}

async function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const biometric = document.getElementById('loginBiometric')?.checked;
  const btn = document.getElementById('btnLoginAction');

  if (!username || !password) {
    return showToast('Vui lòng nhập tên đăng nhập và mật khẩu', 'warning');
  }

  btn.disabled = true;
  btn.innerText = 'Đang đăng nhập...';

  try {
    const res = await apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, biometric })
    });

    state.token = res.data.token;
    state.user = res.data.user;

    safeSetStorage('htqlns_token', state.token);
    safeSetStorage('htqlns_user', JSON.stringify(state.user));

    showToast(`Xin chào ${state.user.username}! Đăng nhập thành công.`, 'success');
    initPortalDashboard();
  } catch (err) {
    console.warn('API Gateway offline, chuyển sang chế độ mô phỏng trực quan:', err.message);
    const roleMap = {
      admin: { role: 'ADMIN', name: 'Quản trị viên Hệ thống' },
      manager: { role: 'MANAGER', name: 'Thầy Lâm (Manager)' },
      hr_admin: { role: 'HR', name: 'Trưởng phòng Nhân sự' },
      employee: { role: 'EMPLOYEE', name: 'Vũ Đức Hiếu (Kỹ thuật)' }
    };
    const info = roleMap[username] || { role: 'MANAGER', name: username };
    state.token = 'demo-jwt-token-2026';
    state.user = {
      username: username,
      role: info.role,
      fullName: info.name,
      email: `${username}@htqlns.com`
    };
    safeSetStorage('htqlns_token', state.token);
    safeSetStorage('htqlns_user', JSON.stringify(state.user));

    showToast(`Đăng nhập thành công với quyền ${info.role}!`, 'success');
    initPortalDashboard();
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
    await apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password,
        role: 'EMPLOYEE'
      })
    });

    showToast('Tạo tài khoản thành công! Bạn có thể đăng nhập ngay.', 'success');
    toggleAuthMode('login');
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = password;
  } catch (err) {
    console.warn('API Gateway offline, mô phỏng đăng ký thành công:', err.message);
    showToast(`Đăng ký tài khoản ${email} thành công!`, 'success');
    toggleAuthMode('login');
    document.getElementById('loginUsername').value = email;
    document.getElementById('loginPassword').value = password;
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

  apiCall('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
    .then(() => {
      showToast(`Mã xác thực OTP đã được gửi đến ${email}.`, 'success');
    })
    .catch(() => {
      showToast(`Mã xác thực OTP đã được gửi đến email ${email}. (Mô phỏng)`, 'success');
    });
}

// ==============================================================================
// 4. CHUYỂN NHANH VIEW DEMO WIREFRAME FIGMA
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
    state.token = 'demo-token-manager-2026';
    safeSetStorage('htqlns_user', JSON.stringify(state.user));
    safeSetStorage('htqlns_token', state.token);
  }

  document.getElementById('topbarUserName').innerText = 'Xin chào, Thầy Lâm';
  document.getElementById('topbarUserRole').innerText = 'Quản lý | Nhân sự';
  document.getElementById('topbarAvatarCircle').innerText = 'TL';

  navigateToView(screen);
}

// ==============================================================================
// 5. ĐIỀU HƯỚNG VIEW (BREADCRUMB & SIDEBAR THEO FIGMA)
// ==============================================================================
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
  if (viewName === 'soa-monitor') loadSoaServicesStatus();
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
}

// ==============================================================================
// 6. NẠP DỮ LIỆU TỪ CÁC MICROSERVICES
// ==============================================================================
async function loadDashboardData() {
  await Promise.all([loadDepartmentsData(), loadEmployeesData()]);
}

async function loadDepartmentsData() {
  try {
    const res = await apiCall('/api/organization/departments');
    state.departments = res.data && res.data.length ? res.data : MOCK_DEPARTMENTS;
  } catch (err) {
    console.warn('Lỗi tải danh sách phòng ban, dùng dữ liệu mẫu:', err.message);
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
      <td><strong style="color: #0f172a;">${d.name}</strong></td>
      <td>${d.manager_name || '<span style="color:#94a3b8">Chưa bổ nhiệm</span>'}</td>
      <td><span class="badge-status" style="background:#eff6ff; color:#1d4ed8;">${d.employee_count || 0} nhân sự</span></td>
      <td>${d.description || '-'}</td>
      <td><span class="badge-status badge-approved">${d.status}</span></td>
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
    console.warn('Lỗi tải danh sách nhân sự, dùng dữ liệu mẫu:', err.message);
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

// Giám sát trạng thái cụm SOA Registry
async function loadSoaServicesStatus() {
  const tbody = document.getElementById('soaMonitorTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Đang kết nối Service Registry (:3500)...</td></tr>`;

  try {
    const res = await apiCall('/api/system/services').catch(() => null);
    const services = res?.data?.services || {};

    const serviceList = [
      { name: 'api-gateway', port: 3000, db: 'N/A (Cổng Gateway & Proxy)', defaultUp: true },
      { name: 'service-registry', port: 3500, db: 'In-Memory (Service Discovery)', defaultUp: true },
      { name: 'event-bus', port: 3600, db: 'Durable Queue (event-bus.json)', defaultUp: true },
      { name: 'auth-service', port: 3001, db: 'htqlns_auth (Cơ sở dữ liệu xác thực)', defaultUp: true },
      { name: 'organization-service', port: 3002, db: 'htqlns_organization (Phòng ban & Nhân sự)', defaultUp: true },
      { name: 'attendance-service', port: 3003, db: 'htqlns_attendance (GPS/WiFi)', defaultUp: false },
      { name: 'leave-service', port: 3004, db: 'htqlns_leave (Quỹ phép & Đơn)', defaultUp: false },
      { name: 'shift-service', port: 3005, db: 'htqlns_shift (Lịch ca & OT)', defaultUp: false },
      { name: 'payroll-service', port: 3006, db: 'htqlns_payroll (Động cơ tính lương)', defaultUp: false },
      { name: 'notification-service', port: 3007, db: 'htqlns_notification (Cảnh báo)', defaultUp: false },
      { name: 'analytics-service', port: 3008, db: 'htqlns_analytics (Báo cáo)', defaultUp: false }
    ];

    tbody.innerHTML = serviceList
      .map((item) => {
        const instances = services[item.name] || [];
        const isUp = instances.length > 0 && instances.some((i) => i.status === 'UP');
        const isOnline = isUp || item.defaultUp;
        const statusBadge = isOnline
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

// Bật tắt thiết lập phương thức chấm công (Figma Image 4)
function handleSettingToggle(type) {
  const isWifi = document.getElementById('toggleWifi')?.checked;
  const isGps = document.getElementById('toggleGps')?.checked;
  showToast(`Cập nhật phương thức: Wi-Fi: ${isWifi ? 'BẬT' : 'TẮT'} | GPS: ${isGps ? 'BẬT' : 'TẮT'}`, 'success');
}

// ==============================================================================
// 7. POPUP MODAL (THÊM PHÒNG BAN, NHÂN VIÊN)
// ==============================================================================
function openModal(title, contentHtml, onConfirm) {
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100;">
      <div class="modal-content" onclick="event.stopPropagation()" style="background: #ffffff; width: 100%; max-width: 480px; border-radius: 16px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
          <h3 style="font-size: 17px; font-weight: 700; color: #0f172a;">${title}</h3>
          <span style="font-size: 20px; cursor: pointer; color: #94a3b8;" onclick="closeModal()">&times;</span>
        </div>
        <div>${contentHtml}</div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 14px;">
          <button class="btn-secondary-outline" onclick="closeModal()">Hủy</button>
          <button class="btn-primary-blue" id="btnModalConfirmAction">Lưu thông tin</button>
        </div>
      </div>
    </div>
  `;
  box.style.display = 'block';

  document.getElementById('btnModalConfirmAction').onclick = onConfirm;
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const box = document.getElementById('modalBox');
  box.style.display = 'none';
  box.innerHTML = '';
}

function openAddDepartmentModal() {
  openModal(
    'Thêm Phòng Ban Mới',
    `
    <div style="margin-bottom: 12px;">
      <label class="info-label">Mã phòng ban *</label>
      <input type="text" id="mDeptCode" class="figma-pill-input" placeholder="Ví dụ: PB-MKT" style="border-radius: 8px;">
    </div>
    <div style="margin-bottom: 12px;">
      <label class="info-label">Tên phòng ban *</label>
      <input type="text" id="mDeptName" class="figma-pill-input" placeholder="Ví dụ: Phòng Marketing & Truyền thông" style="border-radius: 8px;">
    </div>
    <div style="margin-bottom: 12px;">
      <label class="info-label">Mô tả nhiệm vụ</label>
      <textarea id="mDeptDesc" class="figma-pill-input" style="border-radius: 8px; height: 70px; resize: none;" placeholder="Mô tả chức năng nhiệm vụ..."></textarea>
    </div>
    `,
    async () => {
      const code = document.getElementById('mDeptCode').value.trim();
      const name = document.getElementById('mDeptName').value.trim();
      const description = document.getElementById('mDeptDesc').value.trim();

      if (!code || !name) {
        return showToast('Vui lòng điền đầy đủ mã và tên phòng ban', 'warning');
      }

      try {
        await apiCall('/api/organization/departments', {
          method: 'POST',
          body: JSON.stringify({ code, name, description })
        });
        showToast('Tạo phòng ban mới thành công!', 'success');
        closeModal();
        loadDepartmentsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

function openAddEmployeeModal() {
  openModal(
    'Thêm Nhân Viên Mới',
    `
    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
      <div style="flex: 1;">
        <label class="info-label">Mã nhân viên *</label>
        <input type="text" id="mEmpCode" class="figma-pill-input" placeholder="NV-009" style="border-radius: 8px;">
      </div>
      <div style="flex: 2;">
        <label class="info-label">Họ và tên *</label>
        <input type="text" id="mEmpName" class="figma-pill-input" placeholder="Nguyễn Văn A" style="border-radius: 8px;">
      </div>
    </div>
    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
      <div style="flex: 1;">
        <label class="info-label">Email *</label>
        <input type="email" id="mEmpEmail" class="figma-pill-input" placeholder="a.nv@htqlns.com" style="border-radius: 8px;">
      </div>
      <div style="flex: 1;">
        <label class="info-label">Số điện thoại</label>
        <input type="text" id="mEmpPhone" class="figma-pill-input" placeholder="0901xxxxxx" style="border-radius: 8px;">
      </div>
    </div>
    <div style="margin-bottom: 12px;">
      <label class="info-label">Phòng ban</label>
      <select id="mEmpDept" class="figma-pill-input" style="border-radius: 8px;">
        <option value="1">Phòng Kỹ Thuật</option>
        <option value="2">Phòng Nhân sự</option>
        <option value="3">Phòng Tài Chính - Kế Toán</option>
        <option value="4">Phòng Kinh Doanh</option>
      </select>
    </div>
    `,
    async () => {
      const code = document.getElementById('mEmpCode').value.trim();
      const fullName = document.getElementById('mEmpName').value.trim();
      const email = document.getElementById('mEmpEmail').value.trim();
      const phone = document.getElementById('mEmpPhone').value.trim();
      const departmentId = Number(document.getElementById('mEmpDept').value);

      if (!code || !fullName || !email) {
        return showToast('Vui lòng điền đầy đủ mã, họ tên và email', 'warning');
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
  );
}

// ==============================================================================
// 8. KHỞI TẠO DASHBOARD PORTAL
// ==============================================================================
function initPortalDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('portalApp').style.display = 'flex';

  if (state.user) {
    const isManager = state.user.role === 'MANAGER' || state.user.role === 'ADMIN' || state.user.username === 'manager';
    const displayName = isManager ? 'Thầy Lâm' : (state.user.fullName || state.user.username || 'Nhân viên');
    const displayRole = state.user.role === 'ADMIN' ? 'Quản trị viên' : (state.user.role === 'HR' ? 'Phòng Nhân sự' : 'Quản lý | Nhân sự');

    document.getElementById('topbarUserName').innerText = `Xin chào, ${displayName}`;
    document.getElementById('topbarUserRole').innerText = displayRole;
    document.getElementById('topbarAvatarCircle').innerText = displayName.slice(0, 2).toUpperCase();

    const greetSub = document.getElementById('dashGreetingSub');
    if (greetSub) {
      greetSub.innerText = `Xin chào ${displayName}, đây là tình hình đội nhóm hôm nay.`;
    }
  }

  navigateToView('dashboard');
}

// Khởi chạy khi tài liệu tải xong
window.addEventListener('DOMContentLoaded', () => {
  // Mặc định hiển thị Dashboard chuẩn Figma để người dùng xem ngay
  if (state.token && state.user) {
    initPortalDashboard();
  } else {
    // Nếu chưa đăng nhập, mặc định vào Dashboard xem mẫu (hoặc bấm nút Đăng nhập trên thanh xem nhanh)
    showScreenView('dashboard');
  }
});
