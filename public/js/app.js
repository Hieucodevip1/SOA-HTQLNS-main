/**
 * public/js/app.js
 * Frontend JavaScript điều khiển giao diện chuẩn Figma (Images 1 - 5)
 * Tương tác với API Gateway trong kiến trúc Microservices HTQLNS
 */

const API_BASE = ''; // Gọi qua API Gateway cùng Host/Port

let state = {
  token: localStorage.getItem('htqlns_token') || null,
  user: JSON.parse(localStorage.getItem('htqlns_user') || 'null'),
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
// 3. XÁC THỰC AUTH (LOGIN & REGISTER THEO FIGMA IMAGE 5)
// ==============================================================================
function toggleAuthMode(mode) {
  const isLogin = mode === 'login';
  document.getElementById('authLoginFormContainer').style.display = isLogin ? 'block' : 'none';
  document.getElementById('authRegisterFormContainer').style.display = isLogin ? 'none' : 'block';
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

    localStorage.setItem('htqlns_token', state.token);
    localStorage.setItem('htqlns_user', JSON.stringify(state.user));

    showToast(`Xin chào ${state.user.username}! Đăng nhập thành công.`, 'success');
    initPortalDashboard();
  } catch (err) {
    showToast(err.message, 'error');
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
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Register';
  }
}

function handleLogoutClick() {
  if (!confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) return;

  state.token = null;
  state.user = null;
  localStorage.removeItem('htqlns_token');
  localStorage.removeItem('htqlns_user');

  document.getElementById('portalApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  showToast('Đã đăng xuất thành công', 'success');
}

function handleForgotPasswordClick() {
  const email = prompt('Nhập địa chỉ email tài khoản để nhận mã OTP khôi phục:');
  if (!email) return;

  apiCall('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
    .then(() => {
      showToast(`Mã xác thực OTP đã được gửi đến ${email}.`, 'success');
    })
    .catch((err) => showToast(err.message, 'error'));
}

// ==============================================================================
// 4. ĐIỀU HƯỚNG VIEW (BREADCRUMB & SIDEBAR THEO FIGMA)
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
// 5. NẠP DỮ LIỆU TỪ CÁC MICROSERVICES
// ==============================================================================
async function loadDashboardData() {
  await Promise.all([loadDepartmentsData(), loadEmployeesData()]);
}

async function loadDepartmentsData() {
  try {
    const res = await apiCall('/api/organization/departments');
    state.departments = res.data || [];
    renderDepartmentsTable(state.departments);
  } catch (err) {
    console.warn('Lỗi tải danh sách phòng ban:', err.message);
  }
}

function renderDepartmentsTable(list) {
  const tbody = document.getElementById('departmentsTableFullBody');
  if (!tbody) return;

  if (list.length === 0) {
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
  const filtered = state.departments.filter(
    (d) => d.name.toLowerCase().includes(kw) || d.code.toLowerCase().includes(kw)
  );
  renderDepartmentsTable(filtered);
}

async function loadEmployeesData() {
  try {
    const res = await apiCall('/api/organization/employees');
    state.employees = res.data || [];
    renderEmployeesTable(state.employees);
  } catch (err) {
    console.warn('Lỗi tải danh sách nhân sự:', err.message);
  }
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById('employeesTableFullBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8;">Chưa có dữ liệu nhân sự</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      (e) => `
    <tr>
      <td><strong>${e.code}</strong></td>
      <td><strong>${e.full_name}</strong></td>
      <td>${e.email}</td>
      <td>${e.phone || '-'}</td>
      <td>${e.department_name || '-'}</td>
      <td>${e.position_title || '-'}</td>
      <td><span class="badge-status" style="background:#f1f5f9; color:#475569;">${e.contract_type || 'OFFICIAL'}</span></td>
      <td><span class="badge-status ${e.status === 'ACTIVE' ? 'badge-approved' : 'badge-rejected'}">${e.status}</span></td>
    </tr>
  `
    )
    .join('');
}

function handleEmployeeFilter() {
  const kw = document.getElementById('employeeSearchInput')?.value.toLowerCase() || '';
  const filtered = state.employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(kw) ||
      e.code.toLowerCase().includes(kw) ||
      e.email.toLowerCase().includes(kw)
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
// 6. POPUP MODAL (THÊM PHÒNG BAN, NHÂN VIÊN)
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
      <input type="text" id="mDeptName" class="figma-pill-input" placeholder="Ví dụ: Phòng Marketing & Thương hiệu" style="border-radius: 8px;">
    </div>
    <div style="margin-bottom: 12px;">
      <label class="info-label">Mô tả chức năng</label>
      <textarea id="mDeptDesc" class="figma-pill-input" rows="3" placeholder="Mô tả phạm vi hoạt động..." style="border-radius: 8px;"></textarea>
    </div>
  `,
    async () => {
      const code = document.getElementById('mDeptCode').value.trim();
      const name = document.getElementById('mDeptName').value.trim();
      const description = document.getElementById('mDeptDesc').value.trim();

      if (!code || !name) return showToast('Vui lòng nhập mã và tên phòng ban', 'warning');

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
  const deptOpts = state.departments.map((d) => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');

  openModal(
    'Thêm Nhân Viên Mới (SCR_ADM_06)',
    `
    <div style="margin-bottom: 10px;">
      <label class="info-label">Mã nhân viên *</label>
      <input type="text" id="mEmpCode" class="figma-pill-input" placeholder="Ví dụ: EMP005" style="border-radius: 8px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label class="info-label">Họ và tên *</label>
      <input type="text" id="mEmpName" class="figma-pill-input" placeholder="Ví dụ: Trần Văn Nam" style="border-radius: 8px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label class="info-label">Email công ty *</label>
      <input type="email" id="mEmpEmail" class="figma-pill-input" placeholder="nam.tran@htqlns.com" style="border-radius: 8px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label class="info-label">Số điện thoại</label>
      <input type="text" id="mEmpPhone" class="figma-pill-input" placeholder="0901234567" style="border-radius: 8px;">
    </div>
    <div style="margin-bottom: 10px;">
      <label class="info-label">Phòng ban</label>
      <select id="mEmpDept" class="figma-pill-input" style="border-radius: 8px;">${deptOpts}</select>
    </div>
  `,
    async () => {
      const code = document.getElementById('mEmpCode').value.trim();
      const full_name = document.getElementById('mEmpName').value.trim();
      const email = document.getElementById('mEmpEmail').value.trim();
      const phone = document.getElementById('mEmpPhone').value.trim();
      const department_id = document.getElementById('mEmpDept').value;

      if (!code || !full_name || !email) return showToast('Vui lòng nhập đủ mã, họ tên và email', 'warning');

      try {
        await apiCall('/api/organization/employees', {
          method: 'POST',
          body: JSON.stringify({ code, full_name, email, phone, department_id })
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
// 7. KHỞI TẠO DASHBOARD PORTAL
// ==============================================================================
function initPortalDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('portalApp').style.display = 'flex';

  if (state.user) {
    const isManager = state.user.role === 'MANAGER' || state.user.role === 'ADMIN' || state.user.username === 'manager';
    const displayName = isManager ? 'Thầy Lâm' : (state.user.username || 'Nhân viên');
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

// Kiểm tra phiên đăng nhập sẵn có
window.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.user) {
    initPortalDashboard();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
  }
});
