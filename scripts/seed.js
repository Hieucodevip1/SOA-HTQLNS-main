/**
 * Script khởi tạo và chuẩn hoá dữ liệu (Seed Data)
 * Hệ thống HTQLNS - Phân hệ Tổ chức & Nhân sự
 */
const path = require('path');
const db = require(path.resolve(__dirname, '..', 'shared', 'db'));

async function seed() {
  console.log('[SEED] Bắt đầu đồng bộ và chuẩn hoá danh mục chức danh & nhân sự...');
  let pool;
  try {
    pool = db.getPool('htqlns_organization');
  } catch (e) {
    console.warn('[SEED] Không thể kết nối DB pool:', e.message);
    return;
  }

  try {
    // 1. Cập nhật mọi chức danh có chứa SOA hoặc Kỹ Sư Lập Trình Phần Mềm về 'Kỹ Sư Phần Mềm'
    await pool.query(`
      UPDATE positions 
      SET title = 'Kỹ Sư Phần Mềm' 
      WHERE title IN ('Kỹ sư phần mềm SOA', 'Kỹ Sư Phần Mềm SOA', 'Kỹ Sư Lập Trình Phần Mềm') 
         OR code = 'POS-DEV'
    `);

    // 2. Xử lý gộp bản ghi trùng lặp nếu có nhiều vị trí cùng mang tên Kỹ Sư Phần Mềm
    const [dupPositions] = await pool.query(`
      SELECT id, code, title FROM positions 
      WHERE title IN ('Kỹ Sư Phần Mềm', 'Kỹ sư phần mềm')
    `);

    if (dupPositions && dupPositions.length > 1) {
      const canonical = dupPositions.find(p => p.code === 'POS-DEV') || dupPositions[0];
      const otherIds = dupPositions.filter(p => p.id !== canonical.id).map(p => p.id);
      for (const oid of otherIds) {
        await pool.query('UPDATE employees SET position_id = ? WHERE position_id = ?', [canonical.id, oid]);
        await pool.query('DELETE FROM positions WHERE id = ?', [oid]);
      }
      console.log(`[SEED] Đã gộp ${otherIds.length} bản ghi chức danh trùng lặp về vị trí chuẩn [${canonical.code}] ${canonical.title}`);
    }

    // 3. Đảm bảo vị trí POS-DEV tồn tại
    await pool.query(`
      INSERT INTO positions (id, code, title, department_id, base_salary_min, base_salary_max, status)
      VALUES ('p0000001-0000-0000-0000-000000000004', 'POS-DEV', 'Kỹ Sư Phần Mềm', 'd0000001-0000-0000-0000-000000000003', 12000000.00, 25000000.00, 'ACTIVE')
      ON DUPLICATE KEY UPDATE title = 'Kỹ Sư Phần Mềm'
    `);

    // 4. Chuẩn hoá tên phòng ban thống nhất về 'Phòng Hành chính Nhân sự'
    await pool.query(`
      UPDATE departments 
      SET name = 'Phòng Hành chính Nhân sự' 
      WHERE name = 'Phòng Nhân sự'
    `);

    // 5. Chuẩn hoá phòng ban và vị trí việc làm cho các nhân sự ACTIVE
    await pool.query(`
      UPDATE employees 
      SET department_id = 'd0000001-0000-0000-0000-000000000002',
          position_id = 'p0000001-0000-0000-0000-000000000004'
      WHERE code = 'EMP_11800' OR full_name LIKE '%Nguyễn Huy%'
    `);

    await pool.query(`
      UPDATE employees 
      SET department_id = 'd0000001-0000-0000-0000-000000000003',
          position_id = 'p0000001-0000-0000-0000-000000000004',
          manager_id = 'e0000001-0000-0000-0000-000000000003'
      WHERE code IN ('EMP_VUONGLAM', 'EMP_DUCHIEUNGOPT') 
         OR email LIKE '%vuonglam%' OR email LIKE '%duchieungopt%'
    `);

    await pool.query(`
      UPDATE employees 
      SET department_id = 'd0000001-0000-0000-0000-000000000003'
      WHERE status = 'ACTIVE' AND (department_id IS NULL OR department_id = '')
    `);

    await pool.query(`
      UPDATE employees 
      SET position_id = 'p0000001-0000-0000-0000-000000000004'
      WHERE status = 'ACTIVE' AND (position_id IS NULL OR position_id = '')
    `);

    console.log('[SEED] Chuẩn hoá chức danh và nhân sự hoàn tất thành công!');
  } catch (err) {
    console.warn('[SEED] Cảnh báo khi chuẩn hoá DB positions:', err.message);
  }
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed };
