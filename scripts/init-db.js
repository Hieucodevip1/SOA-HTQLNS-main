/**
 * Initializes the eight independent MySQL schemas in dependency order.
 * Run from repository root: npm run db:init
 * Do NOT apply to production databases without backing them up first.
 */
require('../shared/env');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const env = require('../shared/env');

const files = [
  '01_auth_db.sql',
  '02_organization_db.sql',
  '03_attendance_db.sql',
  '04_leave_db.sql',
  '05_shift_db.sql',
  '06_payroll_db.sql',
  '07_notification_db.sql',
  '08_analytics_db.sql'
];

async function initDatabases() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER,
    password: env.DB_PASSWORD, multipleStatements: false
  });
  try {
    for (const file of files) {
      const sql = await fs.readFile(path.join(__dirname, '..', 'database', file), 'utf8');
      // These schema files contain ordinary CREATE/ALTER/INSERT SQL statements.
      // The MySQL CLI-only SOURCE directive in init_all_databases.sql is not executed.
      const statements = sql
        .split('\n')
        .filter(line => !/^\s*--/.test(line))
        .join('\n')
        .split(/;\s*(?:\r?\n|$)/)
        .map(s => s.trim())
        .filter(Boolean);

      for (const statement of statements) {
        // Existing foreign keys must not be recreated on a repeat run.
        const match = statement.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)/i);
        if (match) {
          const [[row]] = await connection.query(
            `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
            [match[1], match[2]]
          );
          if (Number(row.n) > 0) continue;
        }
        try {
          await connection.query(statement);
        } catch (err) {
          err.message = `${file}: ${err.message}`;
          throw err;
        }
      }
      console.log(`✓ Khởi tạo ${file}`);
    }
    console.log('✓ Hoàn tất khởi tạo 8 databases.');
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  initDatabases().catch(err => {
    console.error('Khởi tạo thất bại:', err.message);
    console.error('Nếu bảng InnoDB lỗi, hãy sao lưu dữ liệu và kiểm tra MySQL trước khi khởi tạo lại.');
    process.exitCode = 1;
  });
}

module.exports = { initDatabases };
