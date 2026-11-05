// Kiểm thử đầu-cuối trên HỆ THỐNG THẬT (5 dịch vụ + MySQL). Cần chạy `npm start` trước.
//   npm run test:e2e         (đổi địa chỉ: GATEWAY_URL=http://host:3000)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../shared/env');

const GW = process.env.GATEWAY_URL || `http://localhost:${process.env.GATEWAY_PORT || 3000}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
const SV1 = `T${rnd}1`, SV2 = `T${rnd}2`, SV3 = `T${rnd}3`, DT1 = `D${rnd}1`, DT2 = `D${rnd}2`;
const GV1 = `gv${rnd}`, GV2 = `gvother${rnd}`;
let admin, gv, gvOther, sv1;

async function call(method, path, { token, body } = {}) {
    const res = await fetch(GW + path, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
}
// /api/auth/register bị giới hạn 10 lần/phút/IP (chính sách của gateway): gặp 429 thì chờ rồi thử lại
async function registerUser(TenDangNhap, MatKhau, HoTen) {
    for (let i = 0; i < 70; i++) {
        const r = await call('POST', '/api/auth/register', { body: { TenDangNhap, MatKhau, HoTen } });
        if (r.status !== 429) return r;
        await sleep(1000);
    }
    throw new Error('Bị giới hạn tốc độ đăng ký quá lâu');
}
async function loginAs(u, p) { return (await call('POST', '/api/auth/login', { body: { TenDangNhap: u, MatKhau: p } })).json.token; }
async function waitFor(fn, ms = 10000) {
    const end = Date.now() + ms;
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(300); }
}

before(async () => {
    try { await fetch(GW + '/health'); } catch { throw new Error(`Không kết nối được ${GW}. Hãy chạy "npm start" trước.`); }
    admin = await loginAs(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || '123456');
    assert.ok(admin, 'Không đăng nhập được admin (kiểm tra ADMIN_USERNAME/ADMIN_PASSWORD trong .env)');

    // dữ liệu thử + tài khoản: SV1 (sinhvien, tên đăng nhập = mã SV), gv (giangvien)
    await call('POST', '/api/students', { token: admin, body: { MaSV: SV1, HoTen: 'SV Test 1' } });
    await call('POST', '/api/students', { token: admin, body: { MaSV: SV2, HoTen: 'SV Test 2' } });
    await call('POST', '/api/students', { token: admin, body: { MaSV: SV3, HoTen: 'SV Test 3' } });
    await registerUser(SV1, '123456', 'SV Test 1');
    await registerUser(GV1, '123456', 'GV Test 1');
    await registerUser(GV2, '123456', 'GV Test 2');
    const users = (await call('GET', '/api/auth/users', { token: admin })).json.data;
    await call('PUT', `/api/auth/users/${users.find((u) => u.TenDangNhap === GV1).MaTK}/role`, { token: admin, body: { VaiTro: 'giangvien' } });
    await call('PUT', `/api/auth/users/${users.find((u) => u.TenDangNhap === GV2).MaTK}/role`, { token: admin, body: { VaiTro: 'giangvien' } });
    sv1 = await loginAs(SV1, '123456');
    gv = await loginAs(GV1, '123456');
    gvOther = await loginAs(GV2, '123456');
    await call('POST', '/api/topics', { token: gv, body: { MaDT: DT1, TenDT: 'De tai cua GV1' } });
    await call('POST', '/api/topics', { token: gvOther, body: { MaDT: DT2, TenDT: 'De tai cua GV2' } });
});

test('1. Xác thực: không token -> 401; sai mật khẩu -> 401', async () => {
    assert.equal((await call('GET', '/api/students')).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { body: { TenDangNhap: 'admin', MatKhau: 'sai-mat-khau' } })).status, 401);
});

test('2. Phân quyền: sinh viên không thêm được sinh viên/đề tài; giảng viên thêm được đề tài nhưng không thêm được sinh viên', async () => {
    assert.equal((await call('POST', '/api/students', { token: sv1, body: { MaSV: 'X1', HoTen: 'x' } })).status, 403);
    assert.equal((await call('POST', '/api/topics', { token: sv1, body: { MaDT: 'X1', TenDT: 'x' } })).status, 403);
    assert.equal((await call('POST', '/api/students', { token: gv, body: { MaSV: 'X1', HoTen: 'x' } })).status, 403);
    assert.equal((await call('POST', '/api/topics', { token: gv, body: { MaDT: `G${rnd}`, TenDT: 'Do GV tao' } })).status, 201);
});

test('3. Dịch vụ độc lập: đăng ký sinh viên/đề tài không tồn tại -> 400', async () => {
    assert.equal((await call('POST', '/api/registrations', { token: admin, body: { MaSV: 'KHONGCO', MaDT: DT1 } })).status, 400);
    assert.equal((await call('POST', '/api/registrations', { token: admin, body: { MaSV: SV2, MaDT: 'KHONGCO' } })).status, 400);
});

test('4. Sinh viên không được đăng ký hộ người khác', async () => {
    assert.equal((await call('POST', '/api/registrations', { token: sv1, body: { MaSV: SV2, MaDT: DT1 } })).status, 403);
});

let regId;
test('5. Sinh viên đăng ký cho mình: trạng thái luôn "Cho duyet", không tự đặt điểm', async () => {
    const r = await call('POST', '/api/registrations', { token: sv1, body: { MaDT: DT1, TrangThai: 'Da duyet', Diem: 10 } });
    assert.equal(r.status, 201);
    regId = r.json.data.MaDK;
    const d = (await call('GET', `/api/registrations/${regId}`, { token: admin })).json.data;
    assert.equal(d.TrangThai, 'Cho duyet');
    assert.equal(d.Diem, null);
    assert.equal(d.HoTen, 'SV Test 1');       // họ tên lấy từ student-service
    assert.equal(d.TenDT, 'De tai 1');        // tên đề tài lấy từ topic-service
});

test('6. Mỗi sinh viên chỉ 01 đăng ký còn hiệu lực -> đăng ký thêm bị 409', async () => {
    assert.equal((await call('POST', '/api/registrations', { token: sv1, body: { MaDT: DT2 } })).status, 409);
    assert.equal((await call('POST', '/api/registrations', { token: sv1, body: { MaDT: DT1 } })).status, 409);
});

test('7. Sinh viên chỉ thấy đăng ký của mình; giảng viên thấy tất cả', async () => {
    const mine = (await call('GET', '/api/registrations', { token: sv1 })).json.data;
    assert.ok(mine.length >= 1 && mine.every((x) => x.MaSV === SV1));
    const all = (await call('GET', '/api/registrations', { token: gv })).json.data;
    assert.ok(all.some((x) => x.MaDK === regId));
});

test('8. Giảng viên chỉ thao tác đăng ký trên đề tài của mình; admin vẫn quản lý toàn trường', async () => {
    assert.equal((await call('POST', '/api/registrations', { token: gv, body: { MaSV: SV3, MaDT: DT2 } })).status, 403);
    const created = await call('POST', '/api/registrations', { token: admin, body: { MaSV: SV3, MaDT: DT2 } });
    assert.equal(created.status, 201);
    const otherRegId = created.json.data.MaDK;

    assert.equal((await call('PUT', `/api/registrations/${otherRegId}/approve`, { token: gv })).status, 403);
    assert.equal((await call('PUT', `/api/registrations/${otherRegId}/reject`, { token: gv, body: { LyDoTuChoi: 'Không phụ trách' } })).status, 403);
    assert.equal((await call('PUT', `/api/registrations/${otherRegId}/grade`, { token: gv, body: { Diem: 8 } })).status, 403);
    assert.equal((await call('PUT', `/api/registrations/${otherRegId}`, { token: gv, body: { Diem: 8 } })).status, 403);
    assert.equal((await call('DELETE', `/api/registrations/${otherRegId}`, { token: gv })).status, 403);
    assert.equal((await call('PUT', `/api/registrations/${regId}`, { token: gv, body: { MaDT: DT2 } })).status, 403);
    assert.equal((await call('PUT', `/api/registrations/${otherRegId}/approve`, { token: gvOther })).status, 200);
    assert.equal((await call('PUT', `/api/registrations/${otherRegId}/grade`, { token: admin, body: { Diem: 8 } })).status, 200);
});

test('9. Giảng viên duyệt + chấm điểm; sinh viên không sửa được; trạng thái sai -> 400; điểm sai -> 400', async () => {
    assert.equal((await call('PUT', `/api/registrations/${regId}`, { token: sv1, body: { Diem: 9 } })).status, 403);
    assert.equal((await call('PUT', `/api/registrations/${regId}`, { token: gv, body: { TrangThai: 'abc' } })).status, 400);
    assert.equal((await call('PUT', `/api/registrations/${regId}`, { token: gv, body: { Diem: 11 } })).status, 400);
    assert.equal((await call('PUT', `/api/registrations/${regId}`, { token: gv, body: { TrangThai: 'Da duyet', Diem: 9 } })).status, 200);
    const updated = (await call('GET', `/api/registrations/${regId}`, { token: admin })).json.data;
    assert.equal(Number(updated.Diem), 9);
    assert.equal(updated.TrangThai, 'Hoan thanh');
});

test('10. Bất đồng bộ: thao tác trên đăng ký sinh ra thông báo qua Event Bus', async () => {
    const got = await waitFor(async () => {
        const n = (await call('GET', '/api/notifications', { token: sv1 })).json.data || [];
        return n.some((x) => /điểm/i.test(x.title)) && n.some((x) => /ghi nhận/i.test(x.title));
    });
    assert.ok(got, 'sinh viên không nhận được thông báo đăng ký/điểm');
    const staff = (await call('GET', '/api/notifications', { token: gv })).json.data || [];
    assert.ok(staff.length > 0);
});

test('11. Từ chối thì được đăng ký đề tài khác (1 SV 1 đề tài chỉ tính đăng ký còn hiệu lực)', async () => {
    assert.equal((await call('PUT', `/api/registrations/${regId}`, { token: gv, body: { TrangThai: 'Tu choi' } })).status, 200);
    assert.equal((await call('POST', '/api/registrations', { token: sv1, body: { MaDT: DT2 } })).status, 201);
});

test('12. Choreography: xóa sinh viên -> đăng ký của sinh viên tự chuyển "Da huy" (qua sự kiện)', async () => {
    assert.equal((await call('POST', '/api/registrations', { token: admin, body: { MaSV: SV2, MaDT: DT1 } })).status, 201);
    assert.equal((await call('DELETE', `/api/students/${SV2}`, { token: admin })).status, 200);
    const ok = await waitFor(async () => {
        const all = (await call('GET', '/api/registrations', { token: admin })).json.data;
        const mine = all.filter((x) => x.MaSV === SV2);
        return mine.length && mine.every((x) => x.TrangThai === 'Da huy');
    });
    assert.ok(ok);
});

test('13. Chính sách: body quá lớn -> 413 (không phải 500)', async () => {
    const r = await call('POST', '/api/students', { token: admin, body: { MaSV: 'BIG', HoTen: 'a'.repeat(200000) } });
    assert.equal(r.status, 413);
});

test('14. Chính sách: cập nhật thiếu "limits" không làm sập gateway', async () => {
    const cur = (await call('GET', '/api/system/policies', { token: admin })).json.data;
    const r = await call('PUT', '/api/system/policies', { token: admin, body: { routes: cur.routes } });
    assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/students', { token: admin })).status, 200);
});

test('15. Dò tìm động: registry liệt kê đủ 5 dịch vụ nghiệp vụ + gateway; tài liệu API tổng hợp', async () => {
    const s = (await call('GET', '/api/system/services', { token: admin })).json.data;
    for (const n of ['auth-service', 'student-service', 'topic-service', 'registration-service', 'notification-service', 'api-gateway']) {
        assert.ok(s.services[n] && s.services[n].some((i) => i.status === 'UP'), n + ' chưa UP');
    }
    const docs = await (await fetch(GW + '/api-docs.json')).json();
    assert.ok(docs.paths['/api/registrations'] && docs.paths['/api/students'] && docs.paths['/api/topics']);
    assert.equal(docs.paths['/api/registrations'].post.requestBody.content['application/json'].schema.properties.Diem.type, 'number');
});

test('16. Dịch vụ tổng hợp: /api/dashboard gom dữ liệu từ 3 dịch vụ', async () => {
    const d = (await call('GET', '/api/dashboard', { token: sv1 })).json.data;
    assert.ok(d.students >= 1 && d.topics >= 2 && d.registrations >= 1);
    assert.deepEqual(d.degraded, []);
});

test('17. Đăng ký công khai không thể tự cấp quyền admin hoặc sửa tài khoản đặc quyền', async () => {
    const username = `ROLE${rnd}`;
    const created = await call('POST', '/api/auth/register', {
        body: { TenDangNhap: username, MatKhau: 'test123456', HoTen: 'Role Test', VaiTro: 'admin' }
    });
    assert.equal(created.status, 201);

    const users = (await call('GET', '/api/auth/users', { token: admin })).json.data;
    const testUser = users.find((user) => user.TenDangNhap === username);
    assert.equal(testUser && testUser.VaiTro, 'sinhvien');

    const takeover = await call('POST', '/api/auth/register', {
        body: { TenDangNhap: process.env.ADMIN_USERNAME || 'admin', MatKhau: 'attacker123', HoTen: 'Unauthorized', VaiTro: 'admin' }
    });
    assert.equal(takeover.status, 403);

    if (testUser) await call('DELETE', `/api/auth/users/${testUser.MaTK}`, { token: admin });
});

after(async () => {
    // Tự động dọn dẹp các bản ghi phát sinh trong test để database luôn sạch sẽ
    try {
        const { fork } = require('child_process');
        await new Promise((resolve) => {
            const p = fork(require('path').join(__dirname, '../scripts/clean-seed-data.js'), { stdio: 'ignore' });
            p.on('exit', resolve);
        });
    } catch { /* ignore */ }
});
