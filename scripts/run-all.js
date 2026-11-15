/**
 * scripts/run-all.js
 * Supervisor script – Khởi chạy đồng thời toàn bộ hạ tầng & microservices HTQLNS
 * Hỗ trợ điều phối khởi động theo thứ tự, gán màu log trực quan và tự động tắt sạch khi dừng
 */

require('../shared/env');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// Danh sách các thành phần của hệ thống SOA HTQLNS
const ALL_COMPONENTS = [
  ['registry', 'registry/server.js', 3500],
  ['event-bus', 'event-bus/server.js', 3600],
  ['auth-service', 'services/auth-service/index.js', 3001],
  ['organization-service', 'services/organization-service/index.js', 3002],
  ['attendance-service', 'services/attendance-service/index.js', 3003],
  ['leave-service', 'services/leave-service/index.js', 3004],
  ['shift-service', 'services/shift-service/index.js', 3005],
  ['payroll-service', 'services/payroll-service/index.js', 3006],
  ['notification-service', 'services/notification-service/index.js', 3007],
  ['analytics-service', 'services/analytics-service/index.js', 3008],
  ['gateway', 'gateway/server.js', 3000]
];

// Chỉ khởi động những component có file mã nguồn tồn tại và dung lượng > 0
const COMPONENTS = ALL_COMPONENTS.filter(([name, relPath]) => {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) return false;
  const stat = fs.statSync(fullPath);
  return stat.size > 0;
});

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;

const COLORS = [
  '\x1b[36m', // Cyan
  '\x1b[35m', // Magenta
  '\x1b[33m', // Yellow
  '\x1b[32m', // Green
  '\x1b[34m', // Blue
  '\x1b[96m', // Bright Cyan
  '\x1b[95m', // Bright Magenta
  '\x1b[93m', // Bright Yellow
  '\x1b[92m', // Bright Green
  '\x1b[94m'  // Bright Blue
];

const children = new Map();
let isStopping = false;

function pipeLines(stream, prefix, out) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        out.write(`${prefix} ${line}\n`);
      }
    }
  });
}

function launchComponent(name, relPath, idx) {
  if (isStopping) return;

  const color = COLORS[idx % COLORS.length];
  const prefix = `${color}[${name.padEnd(20)}]\x1b[0m`;

  const child = spawn(process.execPath, [path.join(ROOT, relPath)], {
    cwd: ROOT,
    env: { ...process.env }
  });

  children.set(name, child);

  if (child.stdout) pipeLines(child.stdout, prefix, process.stdout);
  if (child.stderr) pipeLines(child.stderr, prefix, process.stderr);

  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!isStopping) {
      console.log(`${prefix} đã dừng (code: ${code}, signal: ${signal})`);
    }
  });
}

console.log('\n========================================================================');
console.log('   🚀 KHỞI ĐỘNG HỆ THỐNG HTQLNS – KIẾN TRÚC HƯỚNG DỊCH VỤ (SOA)');
console.log('========================================================================\n');

const targetList = COMPONENTS.filter(([name]) => !only || only.includes(name));

// Khởi chạy tuần tự có độ trễ để Registry và Event Bus online trước các Service
targetList.forEach(([name, file], idx) => {
  setTimeout(() => {
    launchComponent(name, file, idx);
  }, idx * 400);
});

// Banner thông báo sau khi khởi động
setTimeout(() => {
  if (!isStopping) {
    console.log('\n------------------------------------------------------------------------');
    console.log('  🌐 GIAO DIỆN HỆ THỐNG SẴN SÀNG TẠI: http://localhost:3000');
    console.log('  📡 API Gateway:         http://localhost:3000');
    console.log('  🔍 Service Registry:    http://localhost:3500/health');
    console.log('  📨 Event Bus:           http://localhost:3600/health');
    console.log('  🔑 Tài khoản demo:     admin / 123456  hoặc  hr_admin / 123456');
    console.log('------------------------------------------------------------------------\n');
  }
}, targetList.length * 400 + 800);

function gracefulShutdown() {
  if (isStopping) return;
  isStopping = true;
  console.log('\n\n🛑 Đang dừng toàn bộ các tiến trình microservices HTQLNS...');
  for (const [name, child] of children.entries()) {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
  setTimeout(() => process.exit(0), 1200);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
