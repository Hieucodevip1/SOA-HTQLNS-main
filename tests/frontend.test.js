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
    prompt: () => 'kiet@htqlns.com',
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

  // =========================================================================
  // PHẦN UNIT TEST FRONTEND CỦA HUỲNH GIA KIỆT
  // =========================================================================

  // E5.1 Dashboard tổng quan (FE) HRMS-83
  describe('E5.1 Dashboard tổng quan (FE) HRMS-83', () => {
    test('renderDashboardOverview() hiển thị đúng các thẻ KPI và nhãn phòng ban/ngày', () => {
      const datePill = sb.ensureElement('currentDatePillText');
      const deptPill = sb.ensureElement('currentDeptPillText');
      const presentEl = sb.ensureElement('dashMetricPresent');
      const leaveEl = sb.ensureElement('dashMetricLeave');
      const lateEl = sb.ensureElement('dashMetricLate');

      sb.ctx.renderDashboardOverview({
        date: '2026-11-27',
        departmentName: 'Phòng Kỹ thuật',
        metrics: { totalEmployees: 20, presentCount: 18, attendanceRate: 90, leaveCount: 2, lateCount: 1 },
        donut: {},
        lateEmployees: []
      });

      assert.strictEqual(datePill.innerText, '27/11/2026 • Hôm nay');
      assert.strictEqual(deptPill.innerText, 'Phòng Kỹ thuật • 20 người');
      assert.strictEqual(presentEl.innerText, '18 / 20');
      assert.strictEqual(leaveEl.innerText, '02');
      assert.strictEqual(lateEl.innerText, '01');
    });

    test('renderDashboardOverview() xử lý an toàn khi totalEmployees bằng 0', () => {
      const presentSub = sb.ensureElement('dashMetricPresentSub');
      const lateSub = sb.ensureElement('dashMetricLateSub');

      sb.ctx.renderDashboardOverview({
        date: '2026-11-27',
        metrics: { totalEmployees: 0, presentCount: 0, leaveCount: 0, lateCount: 0 }
      });

      assert.strictEqual(presentSub.innerText, 'Chưa có nhân sự trong phạm vi quản lý');
      assert.strictEqual(lateSub.innerText, 'Không có dữ liệu');
    });
  });

  // E6.1 Đăng nhập, xác thực (FE) HRMS-83
  describe('E6.1 Đăng nhập, xác thực (FE) HRMS-83', () => {
    test('isTokenValid() xác thực đúng JWT còn hạn và từ chối JWT hết hạn/sai định dạng', () => {
      const makeJwt = (expSec) => {
        const h = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
        const p = Buffer.from(JSON.stringify({ sub: '1', exp: expSec })).toString('base64url');
        return `${h}.${p}.sig`;
      };
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const pastExp = Math.floor(Date.now() / 1000) - 60;

      assert.strictEqual(sb.ctx.isTokenValid(makeJwt(futureExp)), true);
      assert.strictEqual(sb.ctx.isTokenValid(makeJwt(pastExp)), false);
      assert.strictEqual(sb.ctx.isTokenValid('invalid-token'), false);
    });

    test('toggleAuthMode() chuyển đổi qua lại giữa form đăng nhập và đăng ký', () => {
      const loginForm = sb.ensureElement('authLoginFormContainer');
      const regForm = sb.ensureElement('authRegisterFormContainer');

      sb.ctx.toggleAuthMode('register');
      assert.strictEqual(loginForm.style.display, 'none');
      assert.strictEqual(regForm.style.display, 'block');

      sb.ctx.toggleAuthMode('login');
      assert.strictEqual(loginForm.style.display, 'block');
      assert.strictEqual(regForm.style.display, 'none');
    });

    test('handleLoginSubmit() gọi POST /api/auth/login và lưu token vào localStorage', async () => {
      sb.ensureElement('loginUsername', { value: 'admin' });
      sb.ensureElement('loginPassword', { value: '123456' });
      sb.ensureElement('btnLoginAction', { innerText: 'Login' });
      sb.run(`
        fetchCurrentUserProfile = async function() {};
        initPortalDashboard = function() {};
      `);

      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { token: 'jwt-admin-123', user: { id: 'u1', username: 'admin', role: 'ADMIN' } }
        })
      }));

      await sb.ctx.handleLoginSubmit({ preventDefault() {} });
      assert.strictEqual(sb.apiCalls[0].url, '/api/auth/login');
      assert.strictEqual(sb.apiCalls[0].method, 'POST');
      assert.strictEqual(sb.storage.get('htqlns_token'), 'jwt-admin-123');
    });
  });

  // E6.2 Đổi mật khẩu (FE+BE) HRMS-89
  describe('E6.2 Đổi mật khẩu (FE+BE) HRMS-89', () => {
    test('togglePasswordVisibility() chuyển đổi trạng thái ẩn/hiện mật khẩu', () => {
      const input = sb.ensureElement('loginPassword', { value: 'secret' });
      input.type = 'password';
      const btn = createMockElement('btnTogglePwd');

      sb.ctx.togglePasswordVisibility('loginPassword', btn);
      assert.strictEqual(input.type, 'text');
      assert.strictEqual(btn.textContent, 'Ẩn');

      sb.ctx.togglePasswordVisibility('loginPassword', btn);
      assert.strictEqual(input.type, 'password');
      assert.strictEqual(btn.textContent, 'Hiện');
    });

    test('handleForgotPasswordClick() hiển thị thông báo hướng dẫn khôi phục mật khẩu', () => {
      sb.ctx.handleForgotPasswordClick();
      assert.ok(sb.getToasts().some(t => t.type === 'success' && t.msg.includes('OTP')));
    });
  });

  // E6.3 Phân quyền RBAC (FE+BE) HRMS-89
  describe('E6.3 Phân quyền RBAC (FE+BE) HRMS-89', () => {
    test('handleUpdateUserRole() gửi PUT /api/auth/users/:id/role với vai trò mới', async () => {
      sb.ensureElement('role-select-u123', { value: 'MANAGER' });
      sb.run('loadRbacUsersData = async function() {};');
      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      }));

      await sb.ctx.handleUpdateUserRole('u123', 'nguyenvana');
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/auth/users/u123/role');
      assert.strictEqual(sb.apiCalls[0].method, 'PUT');
      assert.deepStrictEqual(sb.apiCalls[0].body, { role: 'MANAGER' });
    });

    test('applyRoleBasedUI() ẩn các mục quản trị (RBAC, Cài đặt) đối với EMPLOYEE', () => {
      const navRbac = sb.ensureElement('nav-rbac');
      const navSettings = sb.ensureElement('nav-settings');
      sb.run("state.user.role = 'EMPLOYEE';");

      sb.ctx.applyRoleBasedUI();
      assert.strictEqual(navRbac.style.display, 'none');
      assert.strictEqual(navSettings.style.display, 'none');
    });
  });

  // EMP-US01 Thêm nhân viên mới (FE+BE) HRMS-101
  describe('EMP-US01 Thêm nhân viên mới (FE+BE) HRMS-101', () => {
    test('submitNewEmployee() cảnh báo khi thiếu mã nhân viên, họ tên hoặc email', async () => {
      sb.ensureElement('newEmpCode', { value: '' });
      sb.ensureElement('newEmpName', { value: 'Nguyễn Văn A' });
      sb.ensureElement('newEmpEmail', { value: '' });

      await sb.ctx.submitNewEmployee();
      assert.strictEqual(sb.apiCalls.length, 0);
      assert.ok(sb.getToasts().some(t => t.type === 'warning'));
    });

    test('submitNewEmployee() gọi POST /api/organization/employees khi dữ liệu hợp lệ', async () => {
      sb.ensureElement('newEmpCode', { value: 'EMP_999' });
      sb.ensureElement('newEmpName', { value: 'Trần Văn Mới' });
      sb.ensureElement('newEmpEmail', { value: 'moitv@company.vn' });
      sb.ensureElement('newEmpPhone', { value: '0909123456' });
      sb.ensureElement('newEmpDept', { value: 'dept-1' });
      sb.run('loadEmployeesData = async function() {};');

      sb.setFetchMock(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ success: true })
      }));

      await sb.ctx.submitNewEmployee();
      assert.strictEqual(sb.apiCalls.length, 1);
      assert.strictEqual(sb.apiCalls[0].url, '/api/organization/employees');
      assert.strictEqual(sb.apiCalls[0].method, 'POST');
      assert.strictEqual(sb.apiCalls[0].body.code, 'EMP_999');
    });
  });

  // EMP-US02 Danh sách nhân viên (FE+BE) HRMS-101
  describe('EMP-US02 Danh sách nhân viên (FE+BE) HRMS-101', () => {
    test('renderEmployeesTable() render danh sách nhân viên và hiển thị trạng thái rỗng', () => {
      const tbody = sb.ensureElement('employeesTableFullBody');

      sb.ctx.renderEmployeesTable([]);
      assert.ok(tbody.innerHTML.includes('Chưa có dữ liệu nhân sự'));

      sb.ctx.renderEmployeesTable([
        { id: 'e1', code: 'EMP_001', full_name: 'Huỳnh Gia Kiệt', email: 'kiet@company.vn', status: 'ACTIVE' }
      ]);
      assert.ok(tbody.innerHTML.includes('EMP_001'));
      assert.ok(tbody.innerHTML.includes('Huỳnh Gia Kiệt'));
    });
  });

  // EMP-US04 Chỉnh sửa nhân viên (FE+BE) HRMS-101
  describe('EMP-US04 Chỉnh sửa nhân viên (FE+BE) HRMS-101', () => {
    test('handleUpdateEmployeeSubmit() validate trường bắt buộc và gửi PUT /api/v1/employees/:id', async () => {
      sb.ensureElement('editEmpCode', { value: 'emp_001' });
      sb.ensureElement('editEmpFullName', { value: 'Huỳnh Gia Kiệt' });
      sb.ensureElement('editEmpEmail', { value: 'kiet@company.vn' });
      sb.ensureElement('editEmpPhone', { value: '0901234567' });
      sb.ensureElement('editEmpDept', { value: 'Phòng Kỹ thuật' });
      sb.ensureElement('editEmpStatus', { value: 'ACTIVE' });
      sb.run(`
        state.employees = [{ id: 'e1', code: 'EMP_001', fullName: 'Cũ' }];
        renderEmployeesTable = function() {};
      `);

      sb.setFetchMock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      }));

      await sb.ctx.handleUpdateEmployeeSubmit({ preventDefault() {} }, 'e1');
      const putCall = sb.apiCalls.find(c => c.url === '/api/v1/employees/e1' && c.method === 'PUT');
      assert.ok(putCall);
      assert.strictEqual(putCall.body.code, 'EMP_001');
    });
  });

  // EMP-US05 Tìm kiếm nhân viên (FE+BE) HRMS-101
  describe('EMP-US05 Tìm kiếm nhân viên (FE+BE) HRMS-101', () => {
    test('handleEmployeeFilter() lọc nhân viên theo từ khóa và trạng thái', () => {
      const tbody = sb.ensureElement('employeesTableFullBody');
      const searchInput = sb.ensureElement('employeeSearchInput', { value: 'hieu' });
      const statusSelect = sb.ensureElement('employeeFilterStatus', { value: 'ALL' });

      sb.run(`
        state.employees = [
          { id: 'e1', code: 'EMP_KIET', full_name: 'Huỳnh Gia Kiệt', email: 'kiet@test.vn', status: 'ACTIVE' },
          { id: 'e2', code: 'EMP_HIEU', full_name: 'Vũ Đức Hiếu', email: 'hieu@test.vn', status: 'PENDING_ASSIGNMENT' }
        ];
      `);

      sb.ctx.handleEmployeeFilter();
      assert.ok(tbody.innerHTML.includes('Vũ Đức Hiếu'));
      assert.ok(!tbody.innerHTML.includes('Huỳnh Gia Kiệt'));

      // Lọc theo trạng thái ACTIVE không khớp với PENDING_ASSIGNMENT
      searchInput.value = '';
      statusSelect.value = 'ACTIVE';
      sb.ctx.handleEmployeeFilter();
      assert.ok(tbody.innerHTML.includes('Huỳnh Gia Kiệt'));
      assert.ok(!tbody.innerHTML.includes('Vũ Đức Hiếu'));
    });
  });

  // INFRA-02 Tích hợp các module (FE+BE) HRMS-91
  describe('INFRA-02 Tích hợp các module (FE+BE) HRMS-91', () => {
    test('apiCall() tự động gắn Bearer Token và xử lý 401 khi phiên đăng nhập hết hạn', async () => {
      const portalEl = sb.ensureElement('portalApp');
      const loginEl = sb.ensureElement('loginScreen');
      let capturedHeaders = null;

      sb.setFetchMock(async (_url, opts) => {
        capturedHeaders = opts.headers;
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' })
        };
      });

      await assert.rejects(
        () => sb.ctx.apiCall('/api/organization/employees'),
        /Unauthorized/
      );
      assert.strictEqual(capturedHeaders.Authorization, 'Bearer mock-jwt-token');
      assert.strictEqual(sb.run('state.token'), null);
      assert.strictEqual(portalEl.style.display, 'none');
      assert.strictEqual(loginEl.style.display, 'flex');
    });
  });
});
