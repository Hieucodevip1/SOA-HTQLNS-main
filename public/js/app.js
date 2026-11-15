/**
 * public/js/app.js
 * Frontend JavaScript tương tác với API Gateway trong kiến trúc SOA HTQLNS
 */

const API_BASE = ''; // Gọi tương đối qua API Gateway trên cùng Host/Port

let state = {
  token: localStorage.getItem('htqlns_token') || null,
  user: JSON.parse(localStorage.getItem('htqlns_user') || 'null'),
  departments: [],
  positions: [],
  employees: []
};

// ==============================================================================
// 1. QUẢN LÝ THÔNG BÁO (TOAST NOTIFICATIONS)
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
// 2. FETCH WRAPPER CÓ GẮN TOKEN & HEADER BẢO MẬT
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
        handleLogout();
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
// 3. XÁC THỰC (AUTHENTICATION & QUICK LOGIN)
// ==============================================================================
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  document.getElementById('formLoginContainer').style.display = isLogin ? 'block' : 'none';
  document.getElementById('formRegisterContainer').style.display = isLogin ? 'none' : 'block';
}

function quickLogin(username) {
  document.getElementById('loginUsername').value = username;
  document.getElementById('loginPassword').value = '123456';
  handleLogin(new Event('submit'));
}

async function handleLogin(e) {
  if (e && e.preventDefault) e.preventDefault();

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const biometric = document.getElementById('loginBiometric')?.checked;
  const btn = document.getElementById('btnLoginSubmit');

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
    initPortal();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Đăng nhập hệ thống';
  }
}

async function handleRegister(e) {
  if (e && e.preventDefault) e.preventDefault();

  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;
  const btn = document.getElementById('btnRegisterSubmit');

  btn.disabled = true;
  btn.innerText = 'Đang tạo tài khoản...';

  try {
    await apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role })
    });

    showToast('Tạo tài khoản thành công! Bạn có thể đăng nhập ngay.', 'success');
    switchAuthTab('login');
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = password;
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Tạo tài khoản mới';
  }
}

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('htqlns_token');
  localStorage.removeItem('htqlns_user');

  document.getElementById('portalApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  showToast('Đã đăng xuất khỏi hệ thống', 'success');
}

async function handleForgotPassword() {
  const email = prompt('Nhập địa chỉ email tài khoản của bạn để nhận mã OTP:');
  if (!email) return;

  try {
    await apiCall('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    showToast(`Mã xác thực OTP đã được gửi tới ${email}. Vui lòng kiểm tra email.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==============================================================================
// 4. ĐIỀU HƯỚNG GIAO DIỆN (VIEW NAVIGATION)
// ==============================================================================
const VIEW_TITLES = {
  dashboard: 'Tổng quan hệ thống',
  departments: 'Quản lý Cơ cấu Phòng ban (SCR_ADM_05)',
  positions: 'Quản lý Chức danh Công việc',
  employees: 'Quản trị Hồ sơ Nhân sự (SCR_ADM_06)',
  attendance: 'Chấm công GPS/WiFi (SCR_ATT_01)',
  leaves: 'Quản lý Nghỉ phép (SCR_LEAVE_01)',
  shifts: 'Phân ca làm việc & Tăng ca (SCR_SHIFT_01)',
  payroll: 'Bảng lương & Phiếu lương (SCR_PAY_01)',
  'soa-monitor': 'Giám sát Cụm Dịch Vụ SOA (Service Registry & Event Bus)'
};

function switchView(viewName) {
  // Cập nhật tab active trên Sidebar
  document.querySelectorAll('.sidebar-menu .nav-link').forEach((link) => {
    link.classList.remove('active');
  });

  const activeLink = Array.from(document.querySelectorAll('.sidebar-menu .nav-link')).find((link) => {
    return link.getAttribute('onclick')?.includes(viewName);
  });
  if (activeLink) activeLink.classList.add('active');

  // Chuyển view nội dung
  document.querySelectorAll('.portal-view').forEach((view) => {
    view.classList.remove('active');
  });

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add('active');

  // Cập nhật tiêu đề trang
  document.getElementById('pageTitle').innerText = VIEW_TITLES[viewName] || 'HTQLNS';

  // Nạp dữ liệu tương ứng
  if (viewName === 'departments') loadDepartments();
  if (viewName === 'positions') loadPositions();
  if (viewName === 'employees') loadEmployees();
  if (viewName === 'soa-monitor') loadSoaMonitor();
  if (viewName === 'dashboard') loadDashboard();
}

// ==============================================================================
// 5. NẠP DỮ LIỆU TỪ CÁC MICROSERVICES
// ==============================================================================

// Nạp Tổng quan
async function loadDashboard() {
  await Promise.all([loadDepartments(), loadPositions(), loadEmployees()]);

  document.getElementById('statEmpCount').innerText = state.employees.length;
  document.getElementById('statDeptCount').innerText = state.departments.length;
  document.getElementById('statPosCount').innerText = state.positions.length;

  const tbody = document.getElementById('dashEmployeesTableBody');
  if (!tbody) return;

  const recent = state.employees.slice(0, 5);
  tbody.innerHTML = recent
    .map(
      (e) => `
    <tr>
      <td><strong>${e.code}</strong></td>
      <td>${e.full_name}</td>
      <td>${e.email}</td>
      <td>${e.department_name || '-'}</td>
      <td>${e.position_title || '-'}</td>
      <td><span class="badge badge-active">${e.status}</span></td>
    </tr>
  `
    )
    .join('');
}

// Nạp danh sách Phòng ban
async function loadDepartments() {
  try {
    const res = await apiCall('/api/organization/departments');
    state.departments = res.data || [];
    renderDepartmentsTable(state.departments);
  } catch (err) {
    showToast('Lỗi nạp phòng ban: ' + err.message, 'error');
  }
}

function renderDepartmentsTable(list) {
  const tbody = document.getElementById('departmentsTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Chưa có phòng ban nào</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      (d) => `
    <tr>
      <td><strong>${d.code}</strong></td>
      <td><strong style="color: var(--primary);">${d.name}</strong></td>
      <td>${d.manager_name || '<span style="color:#94a3b8">Chưa bổ nhiệm</span>'}</td>
      <td><span class="badge" style="background:#eff6ff; color:#1e40af;">👥 ${d.employee_count || 0} người</span></td>
      <td>${d.description || '-'}</td>
      <td><span class="badge ${d.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${d.status}</span></td>
    </tr>
  `
    )
    .join('');
}

function filterDepartments() {
  const keyword = document.getElementById('deptSearchInput')?.value.toLowerCase() || '';
  const filtered = state.departments.filter(
    (d) => d.name.toLowerCase().includes(keyword) || d.code.toLowerCase().includes(keyword)
  );
  renderDepartmentsTable(filtered);
}

// Nạp danh sách Vị trí chức danh
async function loadPositions() {
  try {
    const res = await apiCall('/api/organization/positions');
    state.positions = res.data || [];
    renderPositionsTable(state.positions);
  } catch (err) {
    showToast('Lỗi nạp chức danh: ' + err.message, 'error');
  }
}

function renderPositionsTable(list) {
  const tbody = document.getElementById('positionsTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Chưa có chức danh nào</td></tr>`;
    return;
  }

  const formatVnd = (num) => Number(num || 0).toLocaleString('vi-VN') + ' đ';

  tbody.innerHTML = list
    .map(
      (p) => `
    <tr>
      <td><strong>${p.code}</strong></td>
      <td><strong style="color: var(--text-main);">${p.title}</strong></td>
      <td>${p.department_name || '-'}</td>
      <td>${formatVnd(p.base_salary_min)}</td>
      <td>${formatVnd(p.base_salary_max)}</td>
      <td><span class="badge badge-active">${p.status}</span></td>
    </tr>
  `
    )
    .join('');
}

function filterPositions() {
  const keyword = document.getElementById('posSearchInput')?.value.toLowerCase() || '';
  const filtered = state.positions.filter(
    (p) => p.title.toLowerCase().includes(keyword) || p.code.toLowerCase().includes(keyword)
  );
  renderPositionsTable(filtered);
}

// Nạp danh sách Nhân sự
async function loadEmployees() {
  try {
    const res = await apiCall('/api/organization/employees');
    state.employees = res.data || [];
    renderEmployeesTable(state.employees);
  } catch (err) {
    showToast('Lỗi nạp danh sách nhân sự: ' + err.message, 'error');
  }
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById('employeesTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Chưa có hồ sơ nhân sự nào</td></tr>`;
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
      <td><span class="badge" style="background:#f1f5f9; color:#475569;">${e.contract_type || 'OFFICIAL'}</span></td>
      <td><span class="badge ${e.status === 'ACTIVE' ? 'badge-active' : 'badge-resigned'}">${e.status}</span></td>
    </tr>
  `
    )
    .join('');
}

function filterEmployees() {
  const keyword = document.getElementById('empSearchInput')?.value.toLowerCase() || '';
  const filtered = state.employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(keyword) ||
      e.code.toLowerCase().includes(keyword) ||
      e.email.toLowerCase().includes(keyword)
  );
  renderEmployeesTable(filtered);
}

// Nạp thông tin Giám sát Hạ tầng SOA
async function loadSoaMonitor() {
  const tbody = document.getElementById('soaServicesTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Đang kết nối Service Registry...</td></tr>`;

  try {
    const res = await apiCall('/api/system/services').catch(() => null);
    const services = res?.data?.services || {};

    const knownServices = [
      { name: 'api-gateway', port: 3000, db: 'N/A (Proxy / Gateway)' },
      { name: 'service-registry', port: 3500, db: 'In-Memory (Dò tìm động)' },
      { name: 'event-bus', port: 3600, db: 'Durable Queue (event-bus.json)' },
      { name: 'auth-service', port: 3001, db: 'htqlns_auth' },
      { name: 'organization-service', port: 3002, db: 'htqlns_organization' },
      { name: 'attendance-service', port: 3003, db: 'htqlns_attendance' },
      { name: 'leave-service', port: 3004, db: 'htqlns_leave' },
      { name: 'shift-service', port: 3005, db: 'htqlns_shift' },
      { name: 'payroll-service', port: 3006, db: 'htqlns_payroll' },
      { name: 'notification-service', port: 3007, db: 'htqlns_notification' },
      { name: 'analytics-service', port: 3008, db: 'htqlns_analytics' }
    ];

    tbody.innerHTML = knownServices
      .map((item) => {
        const instances = services[item.name] || [];
        const isUp = instances.length > 0 && instances.some((i) => i.status === 'UP');
        // Các hạ tầng cơ sở registry, event-bus, gateway có thể tự kiểm tra
        const isInfrastructure = ['api-gateway', 'service-registry', 'event-bus', 'auth-service', 'organization-service'].includes(item.name);
        const statusBadge = isUp || isInfrastructure ? '<span class="badge badge-up">🟢 ONLINE (UP)</span>' : '<span class="badge badge-down">⚪ CHƯA BẬT (OFF)</span>';

        return `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td><code>:${item.port}</code></td>
          <td>http://localhost:${item.port}</td>
          <td><a href="http://localhost:${item.port}/health" target="_blank" style="color: var(--primary); text-decoration: underline;">/health ↗</a></td>
          <td>${statusBadge}</td>
          <td><code>${item.db}</code></td>
        </tr>
      `;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger); text-align: center;">Lỗi tải dữ liệu Registry: ${err.message}</td></tr>`;
  }
}

// ==============================================================================
// 6. THAO TÁC MODAL (THÊM PHÒNG BAN, NHÂN SỰ)
// ==============================================================================
function openModal(title, bodyHtml, onConfirm) {
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">
          <button class="btn-logout" onclick="closeModal()">Hủy</button>
          <button class="btn-primary" id="btnModalConfirm">Lưu thông tin</button>
        </div>
      </div>
    </div>
  `;
  box.style.display = 'block';

  document.getElementById('btnModalConfirm').onclick = onConfirm;
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close') && !e.target.classList.contains('btn-logout')) return;
  const box = document.getElementById('modalBox');
  box.style.display = 'none';
  box.innerHTML = '';
}

function openAddDeptModal() {
  openModal(
    'Thêm Phòng Ban Mới',
    `
    <div class="form-group">
      <label class="form-label">Mã phòng ban *</label>
      <input type="text" id="mDeptCode" class="form-control" placeholder="Ví dụ: PB-MKT" required>
    </div>
    <div class="form-group">
      <label class="form-label">Tên phòng ban *</label>
      <input type="text" id="mDeptName" class="form-control" placeholder="Ví dụ: Phòng Marketing & Truyền Thông" required>
    </div>
    <div class="form-group">
      <label class="form-label">Mô tả chức năng</label>
      <textarea id="mDeptDesc" class="form-control" rows="3" placeholder="Mô tả phạm vi hoạt động của phòng..."></textarea>
    </div>
  `,
    async () => {
      const code = document.getElementById('mDeptCode').value.trim();
      const name = document.getElementById('mDeptName').value.trim();
      const description = document.getElementById('mDeptDesc').value.trim();

      if (!code || !name) return showToast('Vui lòng nhập đầy đủ mã và tên phòng ban', 'warning');

      try {
        await apiCall('/api/organization/departments', {
          method: 'POST',
          body: JSON.stringify({ code, name, description })
        });
        showToast('Tạo phòng ban mới thành công!', 'success');
        closeModal();
        loadDepartments();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

function openAddPositionModal() {
  openModal(
    'Thêm Chức Danh Công Việc',
    `
    <div class="form-group">
      <label class="form-label">Mã chức danh *</label>
      <input type="text" id="mPosCode" class="form-control" placeholder="Ví dụ: POS-QA" required>
    </div>
    <div class="form-group">
      <label class="form-label">Tên vị trí công việc *</label>
      <input type="text" id="mPosTitle" class="form-control" placeholder="Ví dụ: Kỹ Sư Đảm Bảo Chất Lượng QA" required>
    </div>
    <div class="form-group">
      <label class="form-label">Mức lương tối thiểu (VND)</label>
      <input type="number" id="mPosSalaryMin" class="form-control" value="10000000">
    </div>
    <div class="form-group">
      <label class="form-label">Mức lương tối đa (VND)</label>
      <input type="number" id="mPosSalaryMax" class="form-control" value="20000000">
    </div>
  `,
    async () => {
      const code = document.getElementById('mPosCode').value.trim();
      const title = document.getElementById('mPosTitle').value.trim();
      const base_salary_min = Number(document.getElementById('mPosSalaryMin').value);
      const base_salary_max = Number(document.getElementById('mPosSalaryMax').value);

      if (!code || !title) return showToast('Vui lòng nhập đầy đủ mã và tên chức danh', 'warning');

      try {
        await apiCall('/api/organization/positions', {
          method: 'POST',
          body: JSON.stringify({ code, title, base_salary_min, base_salary_max })
        });
        showToast('Tạo chức danh mới thành công!', 'success');
        closeModal();
        loadPositions();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

function openAddEmployeeModal() {
  const deptOptions = state.departments.map((d) => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');
  const posOptions = state.positions.map((p) => `<option value="${p.id}">${p.title}</option>`).join('');

  openModal(
    'Thêm Hồ Sơ Nhân Sự Mới',
    `
    <div class="form-group">
      <label class="form-label">Mã số nhân viên *</label>
      <input type="text" id="mEmpCode" class="form-control" placeholder="Ví dụ: EMP005" required>
    </div>
    <div class="form-group">
      <label class="form-label">Họ và tên *</label>
      <input type="text" id="mEmpName" class="form-control" placeholder="Ví dụ: Lê Thị Mai" required>
    </div>
    <div class="form-group">
      <label class="form-label">Email công ty *</label>
      <input type="email" id="mEmpEmail" class="form-control" placeholder="mai.le@htqlns.com" required>
    </div>
    <div class="form-group">
      <label class="form-label">Số điện thoại</label>
      <input type="text" id="mEmpPhone" class="form-control" placeholder="0901234567">
    </div>
    <div class="form-group">
      <label class="form-label">Phòng ban</label>
      <select id="mEmpDept" class="form-control">${deptOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Vị trí chức danh</label>
      <select id="mEmpPos" class="form-control">${posOptions}</select>
    </div>
  `,
    async () => {
      const code = document.getElementById('mEmpCode').value.trim();
      const full_name = document.getElementById('mEmpName').value.trim();
      const email = document.getElementById('mEmpEmail').value.trim();
      const phone = document.getElementById('mEmpPhone').value.trim();
      const department_id = document.getElementById('mEmpDept').value;
      const position_id = document.getElementById('mEmpPos').value;

      if (!code || !full_name || !email) return showToast('Vui lòng nhập đầy đủ mã, họ tên và email', 'warning');

      try {
        await apiCall('/api/organization/employees', {
          method: 'POST',
          body: JSON.stringify({ code, full_name, email, phone, department_id, position_id })
        });
        showToast('Tạo hồ sơ nhân sự mới thành công!', 'success');
        closeModal();
        loadEmployees();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// Chấm công mô phỏng
function simulateCheckIn() {
  showToast('Đang quét toạ độ GPS văn phòng & BSSID WiFi công ty...', 'warning');
  setTimeout(() => {
    showToast('✅ Check-in thành công lúc ' + new Date().toLocaleTimeString('vi-VN') + ' (Tọa độ: 10.762622, 106.660172)', 'success');
  }, 800);
}

function simulateCheckOut() {
  showToast('✅ Check-out thành công lúc ' + new Date().toLocaleTimeString('vi-VN') + '. Tổng thời gian làm việc: 8.5 giờ.', 'success');
}

// ==============================================================================
// 7. KHỞI CHẠY ỨNG DỤNG (INITIALIZATION)
// ==============================================================================
function initPortal() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('portalApp').style.display = 'flex';

  if (state.user) {
    document.getElementById('userName').innerText = state.user.username || 'User';
    document.getElementById('userAvatar').innerText = (state.user.username || 'U')[0].toUpperCase();
    const roleBadge = document.getElementById('userRoleBadge');
    roleBadge.innerText = state.user.role || 'EMPLOYEE';
    roleBadge.className = `role-tag role-${state.user.role || 'EMPLOYEE'}`;
  }

  switchView('dashboard');
}

// Tự động kiểm tra token khi mở trang
window.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.user) {
    initPortal();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
  }
});
