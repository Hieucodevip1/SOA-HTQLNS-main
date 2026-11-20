/**
 * services/attendance-service/index.js
 * Microservice Quản lý Chấm công (GPS/WiFi/FaceID) & Giải trình công (Cổng :3003)
 * Màn hình Figma: SCR_ATT_01, SCR_ATT_02, SCR_ATT_03, SCR_ATT_04, SCR_ADM_02
 * Kiến trúc phân tầng: routes -> controllers -> services -> repositories
 */

require('../../shared/env');
const { createServiceApp } = require('../../shared/service-base');
const registrar = require('../../shared/registrar');
const repository = require('./repositories/attendanceRepository');
const attendanceRoutes = require('./routes/attendanceRoutes');

const SERVICE_NAME = 'attendance-service';
const PORT = Number(process.env.ATTENDANCE_SERVICE_PORT || 3003);

const app = createServiceApp(SERVICE_NAME, {
  port: PORT,
  checkHealth: async () => {
    if (process.env.REQUIRE_DB === 'true') {
      return await repository.isDbAvailable();
    }
    return true; // Hỗ trợ In-memory Fallback trơn tru khi không bật DB
  }
});

// Middleware phân tầng routes
app.use(attendanceRoutes);

app.useErrorHandler();

app.start(PORT, () => {
  registrar.register({
    name: SERVICE_NAME,
    port: PORT,
    host: 'localhost',
    prefix: '/api/v1/attendances'
  });
});

module.exports = app;
