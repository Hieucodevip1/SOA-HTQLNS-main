-- ==============================================================================
-- KỊCH BẢN KHỞI TẠO TỔNG HỢP TOÀN BỘ HỆ THỐNG CSDL HTQLNS
-- Kiến trúc Hướng Dịch Vụ (SOA) với MySQL Database riêng biệt cho từng Microservice
-- ==============================================================================

-- 1. Khởi tạo Cơ sở dữ liệu Xác thực & Tài khoản người dùng (htqlns_auth)
SOURCE 01_auth_db.sql;

-- 2. Khởi tạo Cơ sở dữ liệu Cơ cấu Tổ chức & Nhân sự (htqlns_organization)
SOURCE 02_organization_db.sql;
