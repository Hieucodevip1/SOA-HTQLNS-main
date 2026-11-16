/**
 * tests/attendance.test.js
 * Bộ kiểm thử tự động cho Attendance Service (feature/03-attendance)
 * Phân hệ Quản lý Chấm công (GPS/WiFi/FaceID) & Giải trình công
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('child_process');
const path = require('path');
const jwt = require('../shared/jwt');
const env = require('../shared/env');

describe('Kiểm thử Phân hệ Attendance Service (:3103)', () => {
  let attProcess = null;
  const ATT_PORT = 3103;

  const adminToken = jwt.signToken({
    userId: 'u_admin_test',
    empId: 'e0000001-0000-0000-0000-000000000001',
    username: 'admin',
    role: 'ADMIN'
  });

  const employeeToken = jwt.signToken({
    userId: 'u_emp_test_' + Date.now(),
    empId: 'e_test_' + Date.now(),
    username: 'test_emp',
    role: 'EMPLOYEE'
  });

  before(async () => {
    // Khởi chạy attendance-service trên cổng kiểm thử độc lập :3103
    attProcess = fork(path.resolve(__dirname, '..', 'services', 'attendance-service', 'index.js'), [], {
      env: {
        ...process.env,
        ATTENDANCE_SERVICE_PORT: String(ATT_PORT),
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    // Chờ service sẵn sàng
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${ATT_PORT}/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  after(() => {
    if (attProcess) attProcess.kill();
  });

  // 1. Health check
  test('Health check /health trả về UP và database UP', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'UP');
    assert.strictEqual(data.service, 'attendance-service');
  });

  // 2. Tra cứu danh sách địa điểm chấm công
  test('Tra cứu danh sách địa điểm chấm công /api/attendance/work-locations', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/work-locations`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
  });

  // 3. Nhân viên không có quyền thêm địa điểm chấm công (HTTP 403)
  test('Từ chối khi Nhân viên thêm địa điểm chấm công (HTTP 403)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/work-locations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'LOC-TEST-FAIL',
        name: 'Chi nhánh Test',
        latitude: 10.776889,
        longitude: 106.700806
      })
    });
    assert.strictEqual(res.status, 403);
  });

  // 4. Admin thêm mới địa điểm chấm công văn phòng chi nhánh (HTTP 201)
  let testLocationCode = `LOC_${Date.now()}`;
  let testLocationId = null;
  test('Admin thêm mới địa điểm chấm công thành công (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/work-locations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: testLocationCode,
        name: 'Văn phòng Chi nhánh TP.HCM',
        address: 'Quận 1, TP. Hồ Chí Minh',
        latitude: 10.776889,
        longitude: 106.700806,
        radiusMeters: 120,
        wifiSsid: 'HTQLNS_HCM_OFFICE'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.code, testLocationCode);
    testLocationId = data.data.id;
  });

  test('Admin cập nhật địa điểm GPS và EMPLOYEE không được sửa', async () => {
    assert.ok(testLocationId);
    const endpoint = `http://localhost:${ATT_PORT}/api/v1/work-locations/${testLocationId}`;
    const request = token => fetch(endpoint, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Chi nhánh kiểm thử cập nhật', radiusMeters: 130 })
    });
    assert.equal((await request(employeeToken)).status, 403);
    const response = await request(adminToken);
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.data.radius_meters, 130);
    assert.equal(json.data.name, 'Chi nhánh kiểm thử cập nhật');
  });

  test('Admin ngừng sử dụng địa điểm bằng soft-delete và vẫn đọc được lịch sử cấu hình', async () => {
    const url = `http://localhost:${ATT_PORT}/api/v1/work-locations/${testLocationId}`;
    assert.equal((await fetch(url, { method: 'DELETE', headers: {
      Authorization: `Bearer ${employeeToken}`
    } })).status, 403);
    const result = await fetch(url, { method: 'DELETE', headers: {
      Authorization: `Bearer ${adminToken}`
    } });
    assert.equal(result.status, 200);
    const details = await fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(details.status, 200);
    assert.equal((await details.json()).data.status, 'INACTIVE');
  });

  // 5. Check-in ngoài bán kính GPS (HTTP 403 OUT_OF_RANGE)
  test('Từ chối Check-in khi tọa độ GPS ngoài bán kính Geofence (HTTP 403 OUT_OF_RANGE)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'GPS',
        latitude: 21.028511, // Hà Nội (cách Quy Nhơn > 800km)
        longitude: 105.854444,
        bypassGeofence: false
      })
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, 'OUT_OF_RANGE');
  });

  // 6. Wi-Fi SSID supplied by client alone is not a trusted presence proof.
  test('Từ chối Check-in chỉ bằng tên Wi-Fi (HTTP 400)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'WIFI', wifiSsid: 'HTQLNS_OFFICE_5G' })
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'LOCATION_REQUIRED');
  });

  test('Check-in được chấp nhận khi có GPS trong vùng hợp lệ (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'GPS',
        latitude: 13.759142,
        longitude: 109.218536
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id);
    assert.equal(data.data.check_in_method, 'GPS');
  });

  // 7. Từ chối Check-in lần 2 trong cùng một ngày (HTTP 400)
  test('Từ chối Check-in lần 2 trong ngày (HTTP 400)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'WIFI',
        wifiSsid: 'HTQLNS_OFFICE_5G'
      })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('đã chấm công vào'));
  });

  // 8. Check-out ra ca thành công (HTTP 200)
  test('Check-out ra ca thành công và tính giờ làm việc (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-out`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'WIFI',
        latitude: 13.759142,
        longitude: 109.218536
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.check_out_time);
  });

  test('Check-out lần hai phải bị từ chối (409)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/check-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GPS', latitude: 13.759142, longitude: 109.218536 })
    });
    assert.equal(res.status, 409);
  });

  // 9. Lấy lịch sử chấm công cá nhân
  test('Lấy danh sách lịch sử chấm công /api/attendance (HTTP 200)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);
  });

  // 10. Gửi đơn giải trình chấm công (SCR_ATT_03)
  let adjustmentId = null;
  test('Gửi đơn giải trình chấm công /api/attendance/adjustments (HTTP 201)', async () => {
    const res = await fetch(`http://localhost:${ATT_PORT}/api/attendance/adjustments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workDate: new Date().toISOString().slice(0, 10),
        adjustmentType: 'FORGOT_CHECK_IN',
        requestedCheckIn: '2026-11-15 08:00:00',
        requestedCheckOut: '2026-11-15 17:00:00',
        reason: 'Quên chấm công do tham gia hội thảo khách hàng buổi sáng'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id);
    adjustmentId = data.data.id;
  });

  // 11. Quản lý duyệt đơn giải trình công (SCR_ATT_04)
  test('Quản trị viên / Quản lý phê duyệt đơn giải trình công (HTTP 200)', async () => {
    assert.ok(adjustmentId);
    const res = await fetch(`http://localhost:${ATT_PORT}/api/v1/attendance-adjustments/${adjustmentId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decision: 'APPROVED'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'APPROVED');
  });

  // 12. Internal monthly summary API (bảo mật bằng x-internal-key)
  test('Internal API /internal/attendances/monthly-summary yêu cầu x-internal-key', async () => {
    // Khi thiếu key -> HTTP 403 Forbidden
    const resNoKey = await fetch(`http://localhost:${ATT_PORT}/internal/attendances/monthly-summary?month=11&year=2026`);
    assert.strictEqual(resNoKey.status, 403);

    // Khi có key hợp lệ -> HTTP 200
    const resWithKey = await fetch(`http://localhost:${ATT_PORT}/internal/attendances/monthly-summary?month=11&year=2026`, {
      headers: { 'x-internal-key': env.INTERNAL_API_KEY }
    });
    assert.strictEqual(resWithKey.status, 200);
    const data = await resWithKey.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
  });
});
