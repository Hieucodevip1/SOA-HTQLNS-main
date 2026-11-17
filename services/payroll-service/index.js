/**
 * services/payroll-service/index.js
 * Microservice Tính lương, Chốt kỳ lương & Phiếu lương Payslip (Cổng :3006)
 * Màn hình Figma: SCR_PAY_01, SCR_ADM_04, SCR_ADM_07
 * Kiến trúc phân tầng: routes -> controllers -> services -> repositories
 */

require('../../shared/env');
const { createServiceApp } = require('../../shared/service-base');
const registrar = require('../../shared/registrar');
const repository = require('./repositories/payrollRepository');
const payrollRoutes = require('./routes/payrollRoutes');

const SERVICE_NAME = 'payroll-service';
const PORT = Number(process.env.PAYROLL_SERVICE_PORT || 3006);

const app = createServiceApp(SERVICE_NAME, {
  port: PORT,
  checkHealth: async () => {
    if (process.env.REQUIRE_DB === 'true') {
      return await repository.isDbAvailable();
    }
    // Hỗ trợ Hybrid In-memory Fallback trơn tru khi không bật MySQL
    return await repository.isDbAvailable();
  }
});

// Middleware phân tầng routes
app.use(payrollRoutes);

app.useErrorHandler();

app.start(PORT, () => {
  registrar.register({
    name: SERVICE_NAME,
    port: PORT,
    host: 'localhost',
    prefix: '/api/v1/payrolls'
  });
});

module.exports = app;
