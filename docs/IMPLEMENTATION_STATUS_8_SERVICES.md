# Tiến độ hoàn thiện 8 Microservices – HTQLNS

**Nhánh thực hiện:** `feature/complete-8-microservices` (fork của NguyenHao129600)  
**Nhánh nền:** `feature/06-payroll`  
**Trạng thái:** Có API và các luồng nghiệp vụ cơ bản; **chưa nghiệm thu hệ thống hoàn chỉnh**.

## Danh mục nghiệp vụ đã có trong code

| Microservice | Các nghiệp vụ có API | Bổ sung trong nhánh |
| --- | --- | --- |
| Auth (3001) | Đăng ký, đăng nhập, làm mới JWT, đổi/quên mật khẩu, quản trị tài khoản | Chặn tự cấp vai trò, giả mạo hồ sơ và đăng nhập biometric không có mật khẩu |
| Organization (3002) | Nhân viên, phòng ban, chức vụ, audit | Bắt buộc JWT ngay cả khi gọi trực tiếp service; phân quyền ghi |
| Attendance (3003) | Check-in/out, vị trí làm việc, giải trình | Bỏ cơ chế `bypassGeofence` phía client; lấy GPS thực trên UI |
| Leave (3004) | Loại phép, quỹ phép, tạo, xem, duyệt/từ chối đơn | Tính ngày tại server, transaction khi duyệt, hủy đơn chờ duyệt, hoàn quota, quyền xem hồ sơ |
| Shift (3005) | CRUD ca, phân ca, tăng ca | Tính giờ OT phía server, đổi ca có duyệt/từ chối/hủy và trao đổi phân ca trong transaction |
| Payroll (3006) | Cấu hình lương, tính kỳ, chốt, phiếu lương | Không chạy tính lương khi thiếu dữ liệu từ Attendance/Leave/Shift |
| Notification (3007) | Lấy thông báo, đánh dấu đã đọc, nhận Event Bus | Webhook đúng định dạng, chống gửi trùng, trạng thái đã đọc theo người dùng, sự kiện nghỉ phép/đổi ca |
| Analytics (3008) | Dashboard và cấu hình ngưỡng cảnh báo | Trả lỗi 503 khi không lấy được nguồn số liệu thay vì âm thầm trả số 0 |

## Các API được bổ sung

- `POST /api/v1/leave-requests/:id/cancel` — hủy đơn chờ duyệt (chủ đơn hoặc ADMIN/HR)
- `GET /api/v1/shift-swaps` — danh sách yêu cầu đổi ca theo quyền
- `GET /api/v1/shift-swaps/candidates?date=YYYY-MM-DD` — ca có thể đổi trong ngày tương ứng
- `POST /api/v1/shift-swaps` — tạo yêu cầu với `requesterAssignmentId`, `targetAssignmentId`, `reason`
- `PATCH /api/v1/shift-swaps/:id/decision` — `APPROVED` hoặc `REJECTED` (ADMIN/HR/MANAGER)
- `POST /api/v1/shift-swaps/:id/cancel` — hủy yêu cầu đổi ca do chính mình tạo

Truy cập qua API Gateway `http://localhost:3000` và gửi JWT trong `Authorization: Bearer <token>`.

## Khởi động local

1. Cài Node.js 22+, MySQL 8; sao lưu database nếu đã có dữ liệu.
2. `npm ci` (hoặc `npm install` khi không có lockfile).
3. Sao chép `.env.example` thành `.env`, điền `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `INTERNAL_API_KEY` (tuyệt đối không commit `.env`).
4. `npm run db:init` — áp dụng 8 schema. Nếu MySQL báo lỗi InnoDB/cấu trúc bảng cũ, **không DROP bảng đang có dữ liệu**.
5. `npm start`; mở `http://localhost:3000`.
6. `npm run test:security` — kiểm thử JWT không cần database.
7. `npm run test:features` — kiểm thử Leave/Shift thực tế; cần MySQL đã khởi tạo.
8. `npm test` — các bộ kiểm thử sẵn có của nhóm, yêu cầu hệ thống/ngữ cảnh dữ liệu theo từng test.

Workflow `.github/workflows/security-and-syntax.yml` chạy kiểm tra cú pháp, security regression và test tích hợp MySQL 8 trên GitHub Actions.

## Giới hạn cần hoàn thiện trước nghiệm thu

- **Auth:** sinh trắc học hiện chưa dùng WebAuthn/chứng thực thật, OTP chưa hoàn thiện kênh gửi an toàn; chưa sẵn sàng cho tài khoản thật.
- **Attendance:** GPS do trình duyệt báo, chưa chống giả mạo vị trí/WiFi, chưa quản lý ngày lễ hoặc ca qua đêm đầy đủ.
- **Leave:** đang tính ngày làm việc thứ Hai–Sáu; chưa xét ngày lễ, lịch làm cá nhân, phép qua năm.
- **Shift:** quy trình đổi ca yêu cầu quản lý duyệt; chưa có bước xác nhận đồng ý của nhân viên được đổi.
- **Payroll:** thuế, bảo hiểm và xử lý làm tròn đang theo mô hình demo, chưa kiểm toán đủ điều kiện pháp lý hiện hành; chưa dùng để chi trả thật.
- **Notification:** thông báo trong hệ thống; chưa tích hợp gửi email/push thực.
- **Analytics:** mới có KPI tổng hợp cơ bản; chưa có xuất báo cáo, lọc nâng cao và snapshot đầy đủ.
- **Frontend:** còn đoạn mã/dữ liệu demo ở các màn hình khác; cần tiếp tục thay bằng API thực.
- **SOA/DB:** một số truy vấn chéo schema tồn tại; còn cần đánh giá lại tính độc lập của service và kiểm thử recovery/failure.

## Quy tắc Git

Chỉ commit lên fork `NguyenHao129600/SOA-HTQLNS-main`, nhánh
`feature/complete-8-microservices`. Không push hay merge vào nhánh `main`
của nhóm `Hieucodevip1/SOA-HTQLNS-main` nếu chưa thống nhất và duyệt PR.


## Kiểm thử tự động đã xác nhận trên GitHub Actions

- `verify`: Node.js syntax checks, JWT security regression, UI regression — **PASS**.
- `integration`: MySQL 8, tạo 8 database, kiểm thử Leave/Shift, đăng ký tài khoản Auth/Organization — **PASS**.
- `integration`: khởi chạy Gateway, Registry, Event Bus và đủ 8 Microservices; chạy `npm run test:e2e` qua Gateway — **PASS**.
- Lần chạy tham chiếu: https://github.com/NguyenHao129600/SOA-HTQLNS-main/actions/runs/43781358793

**Chưa được xác nhận:** trải nghiệm giao diện bằng browser E2E thực tế, giao tiếp Event Bus → Notification theo một phép thử đầu-cuối riêng, các nghiệp vụ tính lương sát luật hiện hành, và khả năng phục hồi khi dịch vụ gặp sự cố.

## Các sửa đổi giao diện và đăng ký tài khoản sau đợt đầu

- Đã bỏ danh sách nhân viên, phòng ban, tài khoản RBAC và bản ghi chấm công giả khỏi các đường fallback quan trọng của `public/js/app.js`.
- Hiển thị lỗi thật khi dữ liệu chưa tải được, không biến lỗi kết nối thành dữ liệu mẫu; escape một số bảng nhân viên/phòng ban/RBAC trước khi render HTML.
- Form tạo nhân viên gửi tên trường tương thích Organization API, xóa nhân viên theo quy trình chuyển trạng thái thay vì yêu cầu xóa vĩnh viễn.
- Auth đăng ký tài khoản và tạo hồ sơ nhân viên bằng MySQL transaction, kiểm tra hồ sơ liên kết và rollback nếu lỗi; không cho bật sinh trắc học chỉ từ flag client.
- Những màn hình khác vẫn cần rà soát dữ liệu mô phỏng và kiểm thử browser E2E.


## Đồng bộ frontend với backend (đợt mới nhất)

Các hạng mục đã sửa trực tiếp trong `public/index.html` và `public/js/app.js`:

- **Auth/Profile**: đăng nhập chỉ dùng `user` thực từ Auth API, không tạo phiên giả bằng thanh demo; đăng ký công khai chỉ EMPLOYEE; đổi mật khẩu gửi `POST /api/auth/change-password`, xóa phiên và yêu cầu đăng nhập lại; Profile đọc `GET /api/auth/me`, hồ sơ nhân viên liên kết qua Organization; Logout gọi Auth API.
- **Notification**: chuông đọc `GET /api/v1/notifications`, cập nhật unread, `PATCH /api/v1/notifications/:id/read` để đánh dấu đã đọc; không còn bản tin giả.
- **SOA Monitor**: `GET /api/system/services` lấy dữ liệu Registry và trạng thái UP/STALE/UNHEALTHY theo instance thật.
- **Analytics/Báo cáo**: lựa chọn tháng hiện tại, tháng trước, quý hiện tại; tổng hợp số liệu từ Attendance, Leave, Organization và Analytics; xuất CSV và in/lưu PDF bằng trình duyệt, không thông báo giả đã xuất Excel/PDF.
- **Dashboard**: KPI cá nhân và quản lý dựa trên API thật, lọc ngày/phòng ban bằng truy vấn, bỏ bộ số mẫu; lưu ý tỷ lệ công chuẩn là ước tính theo ngày làm việc thứ Hai–thứ Sáu.
- **Attendance**: check-in và check-out lấy GPS trình duyệt, không gắn tọa độ giả; lịch sử cá nhân không còn mock; giải trình dùng enum `OTHER` được DB chấp nhận; xuất CSV từ danh sách đã lọc; cấu hình địa điểm bằng GET/POST `/api/v1/work-locations`. Chỉnh sửa địa điểm, Wi-Fi BSSID/FaceID chưa có API tương ứng.
- **Organization**: lấy nhân viên/phòng ban/chức vụ từ API; thêm và sửa nhân viên, phòng ban bằng API thật; tạo chức vụ qua API; sử dụng định danh, tên trường và enum hợp lệ; nhân viên nghỉ việc được chuyển trạng thái, không xóa vĩnh viễn bằng UI.
- **Leave/Shift**: giao diện đã gửi/hủy/duyệt đơn nghỉ phép và đổi ca qua API, không sửa trạng thái giả.
- **Payroll**: bộ lọc tháng/năm theo thời gian hiện tại, gọi API theo vai trò, form tạo và sửa cấu hình lương, bảng phiếu lương và phát hành kỳ lương qua API. **Thuế/bảo hiểm/tỷ lệ tính lương vẫn là mô hình demo**, chưa đủ đảm bảo đúng pháp luật và tính lương sản xuất.
- **Kiểm thử UI contract**: `npm run test:ui` có các assertion ngăn dữ liệu mẫu, xác nhận các API route và khả năng escape HTML.

**Lưu ý nghiệm thu:** CI hiện bao gồm syntax, security, UI-contract test và API E2E xuyên 8 service; đây **không phải** browser E2E thao tác bấm chuột thực. Các luồng SSO, OTP email, WebAuthn, tải tệp minh chứng, điều chỉnh chính sách Wi-Fi và chỉnh sửa địa điểm cần backend riêng, không được đánh dấu là đã hoàn thành.
