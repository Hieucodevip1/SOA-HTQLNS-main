/**
 * tests/frontend.test.js
 * Unit Tests cho Frontend (public/js/app.js) — Sử dụng Node.js built-in test runner (node:test)
 * Bao phủ đầy đủ các User Story Front-end của Vũ Đức Hiếu:
 * - E1.1 Tạo đơn xin nghỉ phép (FE) HRMS-88
 * - E1.2 Phê duyệt đơn nghỉ phép (FE) HRMS-88
 * - E2.4 Chấm công GPS/Wi-Fi (FE) HRMS-88
 * - E3.2 Phân ca, đăng ký OT (FE) HRMS-88
 * - E4.1 Phiếu lương điện tử (FE) HRMS-88
 * - E5.1 Thống kê chuyên cần (FE) HRMS-105
 * - NOTIF-01 Header thông báo (FE) HRMS-106
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS_PATH = path.join(__dirname, '..', 'public', 'js', 'app.js');
const appJsSource = fs.readFileSync(APP_JS_PATH, 'utf8');

function createMockElement(id, initial = {}) {
  return {
    id,
    value: initial.value ?? '',
    innerText: initial.innerText ?? '',
    textContent: initial.textContent ?? '',
    innerHTML: initial.innerHTML ?? '',
    className: initial.className ?? '',
    disabled: false,
    style: { display: '' },
    children: [],
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._set.has(c)) this._set.delete(c);
          else this._set.add(c);
        } else if (force) this._set.add(c);
        else this._set.delete(c);
      },
      contains(c) { return this._set.has(c); }
    },
    focus() {},
    scrollIntoView() {},
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
}

function createFrontendSandbox() {
  const elements = new Map();
  const storage = new Map();
  const apiCalls = [];
  const toasts = [];
  let mockFetchHandler = async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });

  const ensureElement = (id, initial) => {
    if (!elements.has(id)) elements.set(id, createMockElement(id, initial));
    return elements.get(id);
  };

  const documentMock = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement(tag) { return createMockElement(tag); },
    body: createMockElement('body')
  };

  const localStorageMock = {
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); },
    clear() { storage.clear(); }
  };

  const windowMock = {
    addEventListener() {},
    location: { href: 'http://localhost:3000/', pathname: '/', search: '' },
    innerWidth: 1280
  };

  const context = vm.createContext({
    window: windowMock,
    document: documentMock,
    localStorage: localStorageMock,
    navigator: { geolocation: null },
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Promise,
    Error,
    encodeURIComponent,
    decodeURIComponent,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: async (url, opts = {}) => {
      apiCalls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
      return mockFetchHandler(url, opts);
    }
  });

  vm.runInContext(appJsSource, context, { filename: 'public/js/app.js' });

  // Override showToast & helper loaders để cô lập unit test
  vm.runInContext(`
    var __capturedToasts = [];
    showToast = function(msg, type) {
      __capturedToasts.push({ msg, type: type || 'success' });
    };
    loadRequestsData = async function() {};
    loadDashboardPendingRequests = async function() {};
    loadDashboardOverview = async function() {};
    loadMyLeaveBalance = async function() {};
    loadEmployeeDashboardData = async function() {};
    loadOtRequests = async function() {};
    closeModal = function() {};
  `, context);

  return {
    ctx: context,
    elements,
    ensureElement,
    storage,
    apiCalls,
    getToasts: () => vm.runInContext('__capturedToasts', context),
    setFetchMock: (fn) => { mockFetchHandler = fn; },
    run: (code) => vm.runInContext(code, context)
  };
}

describe('Kiểm thử Unit Test Frontend (public/js/app.js)', () => {
  let sb;

  beforeEach(() => {
    sb = createFrontendSandbox();
    sb.run(`
      state.token = 'mock-jwt-token';
      state.user = {
        id: 'e0000001-0000-0000-0000-000000000004',
        userId: 'u0000001-0000-0000-0000-000000000004',
        username: 'hieuvd',
        fullName: 'Vũ Đức Hiếu',
        role: 'EMPLOYEE',
        isOnboarded: true
      };
    `);
  });

  // =========================================================================
  // E1.1 Tạo đơn xin nghỉ phép (FE) HRMS-88
  // =========================================================================
  describe('E1.1 Tạo đơn xin nghỉ phép (FE) HRMS-88', () => {
    test('calculateLeaveDays() tính đúng số ngày nghỉ bỏ qua Thứ 7 và Chủ nhật', () => {
      // Thứ 2 (2026-11-23) đến Thứ 6 (2026-11-27) = 5 ngày
      sb.ensureElement('leaveFormStartDate', { value: '2026-11-23' });
      sb.ensureElement('leaveFormEndDate', { value: '2026-11-27' });
      sb.ensureElement('leaveFormSession', { value: 'FULL_DAY' });
      const totalEl = sb.ensureElement('leaveFormTotalDays', { value: '' });

      sb.ctx.calculateLeaveDays();
      assert.strictEqual(totalEl.value, '5.0');

      // Nghỉ buổi sáng 1 ngày -> 0.5 ngày
      sb.ensureElement('leaveFormEndDate').value = '2026-11-23';
      sb.ensureElement('leaveFormSession').value = 'MORNING';
      sb.ctx.calculateLeaveDays();
      assert.strictEqual(totalEl.value, '0.5');
    });

    test('handleCreateLeaveSubmit() chặn gửi và cảnh báo khi thiếu lý do xin nghỉ', async () => {
      sb.ensureElement('leaveFormTypeId', { value: 'lt-annual' });
      sb.ensureElement('leaveFormStartDate', { value: '2026-11-25' });
      sb.ensureElement('leaveFormEndDate', { value: '2026-11-25' });
      sb.ensureElement('leaveFormReason', { value: '   ' });
      sb.ensureElement('leaveFormTotalDays', { value: '1.0' });

      await sb.ctx.handleCreateLeaveSubmit();
      assert.strictEqual(sb.apiCalls.length, 0);
      assert.ok(sb.getToasts().some(t => t.type === 'warning' && t.msg.includes('lý do')));
    });

    test('handleCreateLeaveSubmit() gửi đúng payload POST /api/leave khi dữ liệu hợp lệ', async () => {
      sb.ensureElement('leaveFormTypeId', { value: 'lt-annual' });
      sb.ensureElement('leaveFormStartDate', { value: '2026-11-25' });
      sb.ensureElement('leaveFormEndDate', { value: '2026-11-26' });
      sb.ensureElement('leaveFormReason', { value: 'Giải quyết việc gia đình' });
      sb.ensureElement('leaveFormTotalDays', { value: '2.0' });

      sb.setFetchMock(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ status: 'success', data: { id: 'leave-uuid-1' } })
      }));

      await sb.ctx.handleCreateLeaveSubmit();
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/leave');
      assert.strictEqual(sb.apiCalls[0].method, 'POST');
      assert.deepStrictEqual(sb.apiCalls[0].body, {
        leave_type_id: 'lt-annual',
        start_date: '2026-11-25',
        end_date: '2026-11-26',
        total_days: 2,
        reason: 'Giải quyết việc gia đình'
      });
    });
  });

  // =========================================================================
  // E1.2 Phê duyệt đơn nghỉ phép (FE) HRMS-88
  // =========================================================================
  describe('E1.2 Phê duyệt đơn nghỉ phép (FE) HRMS-88', () => {
    test('handleDirectApprove() ánh xạ requestCode (NP-2026-024) sang UUID và gọi POST /api/v1/leaves/:id/decision', async () => {
      sb.run(`
        state.unifiedRequests = [
          { id: 'uuid-leave-024', requestCode: 'NP-2026-024', type: 'LEAVE' }
        ];
      `);
      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      }));

      await sb.ctx.handleDirectApprove('NP-2026-024', 'LEAVE');
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/v1/leaves/uuid-leave-024/decision');
      assert.strictEqual(sb.apiCalls[0].method, 'POST');
      assert.strictEqual(sb.apiCalls[0].body.decision, 'APPROVED');
    });

    test('handleDirectReject() gọi POST /api/v1/leaves/:id/decision với decision REJECTED', async () => {
      sb.run(`
        state.unifiedRequests = [
          { id: 'uuid-leave-025', requestCode: 'NP-2026-025', type: 'LEAVE' }
        ];
      `);
      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      }));

      await sb.ctx.handleDirectReject('uuid-leave-025', 'LEAVE');
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/v1/leaves/uuid-leave-025/decision');
      assert.strictEqual(sb.apiCalls[0].method, 'POST');
      assert.strictEqual(sb.apiCalls[0].body.decision, 'REJECTED');
    });

    test('handleDirectApproveLeave() tương thích ngược gọi đúng luồng duyệt đơn LEAVE', async () => {
      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      }));

      await sb.ctx.handleDirectApproveLeave('uuid-leave-999');
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/v1/leaves/uuid-leave-999/decision');
    });
  });

  // =========================================================================
  // E2.4 Chấm công GPS/Wi-Fi (FE) HRMS-88
  // =========================================================================
  describe('E2.4 Chấm công GPS/Wi-Fi (FE) HRMS-88', () => {
    test('handleDashboardCheckIn() chặn check-in khi nhân viên chưa được phân bổ phòng ban', async () => {
      sb.run('state.user.isOnboarded = false;');

      await sb.ctx.handleDashboardCheckIn();
      assert.strictEqual(sb.apiCalls.length, 0);
      assert.ok(sb.getToasts().some(t => t.type === 'warning' && t.msg.includes('phân bổ')));
    });

    test('handleDashboardCheckIn() chặn check-in khi hôm nay chưa có ca làm việc', async () => {
      sb.run('checkUserHasShiftToday = function() { return false; };');

      await sb.ctx.handleDashboardCheckIn();
      assert.strictEqual(sb.apiCalls.length, 0);
      assert.ok(sb.getToasts().some(t => t.type === 'warning' && t.msg.includes('phân ca')));
    });

    test('handleDashboardCheckIn() gửi đúng dữ liệu GPS/Wi-Fi tới POST /api/v1/attendances/check-in', async () => {
      sb.run('checkUserHasShiftToday = function() { return true; };');
      sb.setFetchMock(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: { id: 'att-1', status: 'ON_TIME' } })
      }));

      await sb.ctx.handleDashboardCheckIn();
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/v1/attendances/check-in');
      assert.strictEqual(sb.apiCalls[0].method, 'POST');
      assert.strictEqual(sb.apiCalls[0].body.method, 'WIFI_GPS');
      assert.ok(typeof sb.apiCalls[0].body.latitude === 'number');
      assert.ok(typeof sb.apiCalls[0].body.longitude === 'number');
    });
  });

  // =========================================================================
  // E3.2 Phân ca, đăng ký OT (FE) HRMS-88
  // =========================================================================
  describe('E3.2 Phân ca, đăng ký OT (FE) HRMS-88', () => {
    test('calcOtModalHours() tính đúng số giờ OT trong ngày và qua đêm', () => {
      sb.ensureElement('otModalStartTime', { value: '18:00' });
      sb.ensureElement('otModalEndTime', { value: '20:30' });
      const totalEl = sb.ensureElement('otModalTotalHours', { value: '' });

      sb.ctx.calcOtModalHours();
      assert.strictEqual(totalEl.value, 2.5);

      // Qua đêm 22:00 -> 02:00 = 4 giờ
      sb.ensureElement('otModalStartTime').value = '22:00';
      sb.ensureElement('otModalEndTime').value = '02:00';
      sb.ctx.calcOtModalHours();
      assert.strictEqual(totalEl.value, 4);
    });

    test('handleCreateOtSubmit() gửi đúng payload POST /api/v1/ot-requests', async () => {
      sb.ensureElement('otModalWorkDate', { value: '2026-11-28' });
      sb.ensureElement('otModalType', { value: 'WEEKEND' });
      sb.ensureElement('otModalStartTime', { value: '08:00' });
      sb.ensureElement('otModalEndTime', { value: '12:00' });
      sb.ensureElement('otModalTotalHours', { value: '4' });
      sb.ensureElement('otModalReason', { value: 'Triển khai release cuối tuần' });

      sb.setFetchMock(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: { id: 'ot-1' } })
      }));

      await sb.ctx.handleCreateOtSubmit({ preventDefault() {} });
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/v1/ot-requests');
      assert.strictEqual(sb.apiCalls[0].method, 'POST');
      assert.deepStrictEqual(sb.apiCalls[0].body, {
        workDate: '2026-11-28',
        startTime: '08:00:00',
        endTime: '12:00:00',
        totalHours: 4,
        otType: 'WEEKEND',
        reason: 'Triển khai release cuối tuần'
      });
    });

    test('applyShiftWeekdayPreset() và toggleAssignWeekday() cập nhật đúng ngày trong tuần', () => {
      sb.run('updateAssignModalPreview = function() {};');
      sb.ctx.applyShiftWeekdayPreset('all');
      let selected = Array.from(sb.run('assignModalSelectedWeekdays'));
      assert.deepStrictEqual(selected, [1, 2, 3, 4, 5, 6, 0]);

      sb.ctx.toggleAssignWeekday(0); // Bỏ Chủ nhật
      selected = Array.from(sb.run('assignModalSelectedWeekdays'));
      assert.deepStrictEqual(selected, [1, 2, 3, 4, 5, 6]);
    });
  });

  // =========================================================================
  // E4.1 Phiếu lương điện tử (FE) HRMS-88
  // =========================================================================
  describe('E4.1 Phiếu lương điện tử (FE) HRMS-88', () => {
    test('formatVND() định dạng chuẩn tiền tệ VND và xử lý giá trị rỗng', () => {
      assert.strictEqual(sb.ctx.formatVND(null), '0 đ');
      assert.strictEqual(sb.ctx.formatVND(undefined), '0 đ');
      assert.strictEqual(sb.ctx.formatVND('abc'), '0 đ');
      const formatted = sb.ctx.formatVND(15000000);
      assert.ok(formatted.includes('15') && formatted.endsWith(' đ'));
    });

    test('loadPayslips() với vai trò EMPLOYEE chỉ truy vấn /api/v1/payrolls/my', async () => {
      sb.ensureElement('tableBodyPayrollSlips', { innerHTML: '' });
      sb.ensureElement('filterPayrollMonth', { value: '11' });
      sb.ensureElement('filterPayrollYear', { value: '2026' });
      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] })
      }));

      await sb.ctx.loadPayslips();
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.ok(sb.apiCalls[0].url.startsWith('/api/v1/payrolls/my?month=11&year=2026'));
    });

    test('loadPayslips() với vai trò ADMIN gọi /api/v1/payslips và cập nhật KPI quỹ lương', async () => {
      sb.run("state.user.role = 'ADMIN';");
      sb.ensureElement('tableBodyPayrollSlips', { innerHTML: '' });
      sb.ensureElement('filterPayrollMonth', { value: '11' });
      sb.ensureElement('filterPayrollYear', { value: '2026' });
      const kpiGross = sb.ensureElement('kpiPayrollTotalGross', { innerText: '' });
      const kpiStaff = sb.ensureElement('kpiPayrollStaffCount', { innerText: '' });

      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { id: 'ps-1', gross_salary: 12000000, net_salary: 10500000, status: 'PUBLISHED' },
            { id: 'ps-2', gross_salary: 18000000, net_salary: 15500000, status: 'PUBLISHED' }
          ]
        })
      }));

      await sb.ctx.loadPayslips();
      assert.strictEqual(sb.apiCalls[0].url, '/api/v1/payslips?month=11&year=2026');
      assert.strictEqual(kpiStaff.innerText, 2);
      assert.ok(kpiGross.innerText.includes('30'));
    });
  });

  // =========================================================================
  // E5.1 Thống kê chuyên cần (FE) HRMS-105
  // =========================================================================
  describe('E5.1 Thống kê chuyên cần (FE) HRMS-105', () => {
    test('renderThresholdAlerts() hiển thị badge số ngưỡng kích hoạt và danh sách vi phạm', () => {
      const badge = sb.ensureElement('statThresholdActiveBadge');
      const tbody = sb.ensureElement('statThresholdTableBody');

      sb.ctx.renderThresholdAlerts([
        {
          code: 'TH-LATE-3',
          name: 'Đi muộn quá 3 lần/tháng',
          metricTarget: 'Số lần đi muộn',
          activationLevel: '> 3 lần',
          severity: 'WARNING',
          violationCount: 2,
          violatingNames: ['Nguyễn Văn A', 'Trần Thị B']
        }
      ], 1);

      assert.strictEqual(badge.textContent, '1 ngưỡng kích hoạt');
      assert.ok(tbody.innerHTML.includes('TH-LATE-3'));
      assert.ok(tbody.innerHTML.includes('Nguyễn Văn A, Trần Thị B'));
    });

    test('renderThresholdAlerts() hiển thị trạng thái an toàn khi không có ngưỡng vi phạm', () => {
      const badge = sb.ensureElement('statThresholdActiveBadge');
      const tbody = sb.ensureElement('statThresholdTableBody');

      sb.ctx.renderThresholdAlerts([], 0);
      assert.strictEqual(badge.textContent, '0 ngưỡng kích hoạt');
      assert.ok(tbody.innerHTML.includes('Không có cấu hình cảnh báo'));
    });
  });

  // =========================================================================
  // NOTIF-01 Header thông báo (FE) HRMS-106
  // =========================================================================
  describe('NOTIF-01 Header thông báo (FE) HRMS-106', () => {
    test('renderTopbarNotifications() đếm đúng thông báo chưa đọc và cập nhật badge trên Header', () => {
      const badge = sb.ensureElement('topbarNotifCountBadge');
      const dot = sb.ensureElement('topbarNotifBadgeDot');
      const listEl = sb.ensureElement('topbarNotifList');

      sb.run(`
        cachedNotifications = [
          { id: 'n1', title: 'Đơn nghỉ phép đã duyệt', content: 'Quản lý đã duyệt đơn', is_read: false, created_at: '2026-11-27T08:00:00Z' },
          { id: 'n2', title: 'Phân ca mới', content: 'Ca hành chính', is_read: true, created_at: '2026-11-26T08:00:00Z' },
          { id: 'n3', title: 'Tiếp nhận phòng ban', content: 'Phòng Kỹ thuật', is_read: 0, created_at: '2026-11-27T09:00:00Z' }
        ];
      `);

      sb.ctx.renderTopbarNotifications();
      assert.strictEqual(badge.innerText, '2 mới');
      assert.strictEqual(dot.style.display, 'flex');
      assert.strictEqual(dot.innerText, '2');
      assert.ok(listEl.innerHTML.includes('Đơn nghỉ phép đã duyệt'));
    });

    test('renderTopbarNotifications() ẩn chấm đỏ khi đã đọc hết và escape ký tự XSS', () => {
      const badge = sb.ensureElement('topbarNotifCountBadge');
      const dot = sb.ensureElement('topbarNotifBadgeDot');
      const listEl = sb.ensureElement('topbarNotifList');

      sb.run(`
        cachedNotifications = [
          { id: 'n1', title: '<script>alert(1)</script>', content: 'An toàn', is_read: true, created_at: '2026-11-27T08:00:00Z' }
        ];
      `);

      sb.ctx.renderTopbarNotifications();
      assert.strictEqual(badge.innerText, '0 mới');
      assert.strictEqual(dot.style.display, 'none');
      assert.ok(!listEl.innerHTML.includes('<script>'));
      assert.ok(listEl.innerHTML.includes('&lt;script&gt;'));
    });

    test('markNotifRead() gọi PATCH /api/v1/notifications/:id/read và cập nhật trạng thái đã đọc', async () => {
      sb.ensureElement('topbarNotifCountBadge');
      sb.ensureElement('topbarNotifBadgeDot');
      sb.ensureElement('topbarNotifList');

      sb.run(`
        cachedNotifications = [
          { id: 'notif-abc', title: 'Thông báo mới', content: 'Chi tiết', is_read: false, created_at: '2026-11-27T08:00:00Z' }
        ];
      `);
      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      }));

      await sb.ctx.markNotifRead('notif-abc');
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/v1/notifications/notif-abc/read');
      assert.strictEqual(sb.apiCalls[0].method, 'PATCH');
      assert.strictEqual(sb.run('cachedNotifications[0].is_read'), true);
    });
  });
});
