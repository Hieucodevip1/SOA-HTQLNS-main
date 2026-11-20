/**
 * scripts/clean-test-data.js
 * Script dọn dẹp dữ liệu rác phát sinh từ quá trình kiểm thử tự động (Automated Tests):
 *  - Xóa các hồ sơ nhân viên test (email LIKE 'tester_%', 'user_%', Vũ Văn Kiểm Thử, trạng thái RESIGNED/TERMINATED/DELETED/rỗng)
 *  - Xóa các tài khoản người dùng test (username LIKE 'user_1%', testuser_soa, email LIKE 'tester_%', 'user_%')
 *  - Giữ nguyên các tài khoản và nhân viên thật hợp lệ của hệ thống (admin, manager, hr_admin, employee, và người dùng thật đã đăng ký).
 */

require('../shared/env');
const db = require('../shared/db');

async function cleanTestData() {
  console.log('--- BẮT ĐẦU DỌN DẸP DỮ LIỆU TEST RÁC ---');

  try {
    const orgPool = db.getPool('htqlns_organization');
    const authPool = db.getPool('htqlns_auth');

    // 1. Kiểm tra và dọn dẹp bảng employees trong htqlns_organization
    const [testEmps] = await orgPool.query(`
      SELECT id, code, full_name, email, status FROM employees
      WHERE email LIKE 'tester_%' 
         OR email LIKE 'user_%' 
         OR full_name LIKE 'user_%' 
         OR full_name LIKE 'Vũ Văn Kiểm Thử%' 
         OR status IN ('RESIGNED', 'TERMINATED', 'DELETED', '')
         OR code LIKE 'EMP_SOA_%'
    `);
    console.log(`[ORG] Tìm thấy ${testEmps.length} bản ghi nhân sự test rác.`);

    if (testEmps.length > 0) {
      const [delRes] = await orgPool.query(`
        DELETE FROM employees
        WHERE email LIKE 'tester_%' 
           OR email LIKE 'user_%' 
           OR full_name LIKE 'user_%' 
           OR full_name LIKE 'Vũ Văn Kiểm Thử%' 
           OR status IN ('RESIGNED', 'TERMINATED', 'DELETED', '')
           OR code LIKE 'EMP_SOA_%'
      `);
      console.log(`[ORG] Đã xóa thành công ${delRes.affectedRows} bản ghi nhân sự test khỏi MySQL.`);
    }

    // 2. Kiểm tra và dọn dẹp bảng users trong htqlns_auth
    const [testUsers] = await authPool.query(`
      SELECT id, username, email FROM users
      WHERE username LIKE 'user_1%' 
         OR email LIKE 'tester_%' 
         OR email LIKE 'user_%' 
         OR username = 'testuser_soa'
    `);
    console.log(`[AUTH] Tìm thấy ${testUsers.length} tài khoản người dùng test rác.`);

    if (testUsers.length > 0) {
      const [delUserRes] = await authPool.query(`
        DELETE FROM users
        WHERE username LIKE 'user_1%' 
           OR email LIKE 'tester_%' 
           OR email LIKE 'user_%' 
           OR username = 'testuser_soa'
      `);
      console.log(`[AUTH] Đã xóa thành công ${delUserRes.affectedRows} tài khoản user test khỏi MySQL.`);
    }

    // 3. Dọn dẹp bản ghi chấm công mồ côi (orphaned attendance logs)
    const attPool = db.getPool('htqlns_attendance');
    const [delAttRes] = await attPool.query(`
      DELETE FROM attendance_logs 
      WHERE emp_id NOT IN (SELECT id FROM htqlns_organization.employees)
         OR emp_id LIKE 'e_test_%'
         OR emp_id LIKE 'emp_test_%'
    `);
    if (delAttRes.affectedRows > 0) {
      console.log(`[ATTENDANCE] Đã xóa thành công ${delAttRes.affectedRows} bản ghi chấm công mồ côi khỏi MySQL.`);
    }

    // 3. Hiển thị danh sách nhân sự và tài khoản còn lại
    const [remainingEmps] = await orgPool.query('SELECT id, code, full_name, email, status FROM employees');
    console.log(`\n[ORG] Danh sách nhân sự đang hoạt động (${remainingEmps.length} nhân sự):`);
    remainingEmps.forEach((e) => console.log(` - [${e.code}] ${e.full_name} (${e.email}) - Status: ${e.status}`));

    const [remainingUsers] = await authPool.query('SELECT id, username, email, role, status FROM users');
    console.log(`\n[AUTH] Danh sách tài khoản người dùng (${remainingUsers.length} tài khoản):`);
    remainingUsers.forEach((u) => console.log(` - [${u.role}] ${u.username} (${u.email}) - Status: ${u.status}`));

    console.log('\n--- HOÀN TẤT DỌN DẸP DỮ LIỆU TEST ---');
  } catch (err) {
    console.error('Lỗi khi dọn dẹp dữ liệu:', err);
    process.exit(1);
  } finally {
    await db.closeAllPools();
    process.exit(0);
  }
}

cleanTestData();
