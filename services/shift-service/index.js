/**
 * services/shift-service/index.js
 * Microservice Quản lý Ca làm việc, Phân ca & Tăng ca OT (Cổng :3005)
 * Màn hình Figma: SCR_SHIFT_01, SCR_OT_01, SCR_OT_02, SCR_ADM_03, SCR_REQ_01
 * Kiến trúc phân tầng: routes -> controllers -> services -> repositories
 */

require('../../shared/env');
const { createServiceApp } = require('../../shared/service-base');
const registrar = require('../../shared/registrar');
const repository = require('./repositories/shiftRepository');
const shiftRoutes = require('./routes/shiftRoutes');

const SERVICE_NAME = 'shift-service';
const PORT = Number(process.env.SHIFT_SERVICE_PORT || 3005);

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
app.use(shiftRoutes);

app.useErrorHandler();

app.start(PORT, () => {
  registrar.register({
    name: SERVICE_NAME,
    port: PORT,
    host: 'localhost',
    prefix: '/api/v1/shifts'
  });
});

module.exports = app;
