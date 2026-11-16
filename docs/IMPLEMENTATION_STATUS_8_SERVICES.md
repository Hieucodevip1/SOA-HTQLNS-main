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


## Đợt bổ sung tiếp theo: Backend còn thiếu và frontend tương ứng

### Attendance: quản lý địa điểm và chặn Wi-Fi giả mạo

- ADMIN/HR: `POST /api/v1/work-locations`, `PUT /api/v1/work-locations/:id`, `DELETE /api/v1/work-locations/:id` (DELETE chỉ chuyển `INACTIVE`; giữ lịch sử và khóa ngoại).
- Validation mã/tên, tọa độ, bán kính, trạng thái và quyền; không cho bật `requireFaceId` khi chưa có xác thực thật.
- Check-in/check-out **bắt buộc có tọa độ GPS hợp lệ trong vùng**. SSID được gửi từ client không phải bằng chứng xác thực mạng; chấm công bằng Wi-Fi thuần đã bị chặn. Check-out ngoài vùng và check-out lần hai bị từ chối.
- UI đã hỗ trợ sửa/ngừng sử dụng địa điểm bằng API. Tọa độ browser vẫn có thể bị giả lập trên thiết bị bị kiểm soát; triển khai xác minh vị trí mức độ cao cần ứng dụng đáng tin cậy/device attestation.

### Leave: lưu và tải minh chứng có bảo mật

- Bảng mới `htqlns_leave.leave_attachments` chứa dữ liệu nhị phân trong MySQL để không phụ thuộc tệp tại ổ đĩa một instance.
- `POST /api/v1/leave-attachments`: JSON `{fileName, mediaType, contentBase64}`, JWT bắt buộc, tối đa 2 MiB, chỉ PDF/PNG/JPEG, kiểm tra chữ ký định dạng cơ bản.
- `GET /api/v1/leave-attachments/:id`: chỉ chủ sở hữu hoặc người có thẩm quyền; trả `Content-Disposition: attachment` và `Cache-Control: no-store`. MANAGER chỉ được truy cập minh chứng của người có `manager_id` tương ứng.
- Khi tạo đơn, `attachmentUrl` phải là URL tệp đã upload, có tồn tại trong MySQL và thuộc về người gửi; tên tệp tự điền không còn được coi là minh chứng.
- UI cho phép chọn file thực, upload trước khi gửi đơn và tải file có token. Các bản ghi demo cũ chỉ lưu tên tệp không thể tải được cho đến khi chuyển đổi dữ liệu.
- Nên có chính sách lưu trữ/xóa minh chứng, quét virus và backup MySQL trước khi triển khai thật.

### Auth: OTP email thực khi cấu hình provider

- `POST /api/auth/forgot-password` dùng mã ngẫu nhiên bảo mật, lưu HMAC thay cho OTP thô; gửi trực tiếp tới Resend REST API **chỉ khi** cấu hình `RESEND_API_KEY` và `OTP_SENDER_EMAIL` (email từ tên miền đã xác minh).
- `POST /api/auth/reset-password`: OTP 6 chữ số, hết hạn 15 phút, giới hạn 5 lần đoán/email trong bộ nhớ mỗi 15 phút, so sánh mã an toàn; thu hồi refresh token sau đổi mật khẩu.
- Không phát OTP lên Event Bus. Nếu chưa cấu hình email API sẽ trả `503 OTP_EMAIL_NOT_CONFIGURED`, không tuyên bố gửi thành công giả.
- Cấu hình chỉ ở `.env` cá nhân hoặc secrets của môi trường triển khai. Không commit API key. `OTP_HASH_SECRET` tùy chọn, khuyến khích dùng khóa riêng dài và ngẫu nhiên.
- Các giới hạn theo IP/email ở cấp Gateway/nhớ tiến trình chưa thay thế được Redis rate limiting khi triển khai nhiều instance; cần bổ sung để đạt bảo mật production.

### Lệnh kiểm thử

```powershell
npm run db:init
npm run test:attendance
npm run test:leave
npm run test:auth-org
# npm start trên terminal khác rồi chạy:
npm run test:e2e
```

GitHub Actions tự kiểm tra cú pháp, UI/security regression, các API trực tiếp, MySQL nghiệp vụ và E2E qua Gateway. Những chức năng còn cần môi trường thực để nghiệm thu: gửi OTP đến email bên ngoài (cần tài khoản provider), WebAuthn/FaceID (cần HTTPS, RP ID và thiết bị hỗ trợ), kiểm thử trình duyệt tương tác, Wi-Fi BSSID tin cậy và nghiệp vụ Payroll phù hợp chính sách doanh nghiệp/pháp luật.


## Đồng bộ các màn hình quản trị cuối cùng

Đã hoàn thiện trên nhánh riêng (không merge `main`):

- **Quản trị tài khoản (ADMIN):** bảng RBAC có thao tác đổi vai trò, khóa/mở khóa (ACTIVE, INACTIVE, LOCKED), và xóa tài khoản đăng nhập với hộp xác nhận. UI chặn tác động lên chính mình. Auth Service cũng kiểm tra quyền, cấm tự hạ quyền/tự khóa và cấm xóa hoặc khóa ADMIN đang hoạt động cuối cùng; thu hồi refresh token của tài khoản bị ngừng/khoá.
- **Hồ sơ cá nhân:** `PUT /api/auth/me` cho thay email sau khi xác thực mật khẩu hiện tại; hai schema Auth/Organization cập nhật trong MySQL transaction; UI yêu cầu đăng nhập lại sau cập nhật. Không cho client tự bật `biometric_enabled` khi chưa có WebAuthn. **Chưa có bước xác minh quyền sở hữu email mới**, không sử dụng quy trình này cho hệ thống production trước khi bổ sung xác minh email.
- **Quản trị phòng ban (ADMIN/HR):** nút Ngừng dùng thực hiện `PUT /api/organization/departments/:id` với `status=INACTIVE`, giữ dữ liệu nhân sự và tránh xóa vật lý.
- **Nhật ký kiểm toán (ADMIN):** bảng Audit Log trên màn Cơ cấu phòng ban lấy 100 hoạt động gần nhất từ `GET /api/organization/audit-logs`.
- **Danh mục nghỉ phép (ADMIN/HR):** bảng danh mục và form tạo loại phép mới; `GET/POST /api/v1/leave-types` với có/không hưởng lương, số ngày/năm và giấy tờ minh chứng.
- **Danh mục ca (ADMIN/HR):** Ngừng dùng qua `DELETE /api/v1/shifts/:id` (server soft-disable) và kích hoạt lại bằng `PUT /api/v1/shifts/:id` với `status=ACTIVE`.
- **Kiểm thử thao tác thật trên Chrome/Chromium:** `tests/browser-admin.e2e.js` đăng nhập từng vai trò ADMIN, HR, MANAGER, EMPLOYEE; kiểm tra màn quản trị và phân quyền, tạo loại phép, danh mục ca và trạng thái tài khoản. Workflow `.github/workflows/security-and-syntax.yml` dùng Ubuntu 24.04 cho trình duyệt và vẫn chạy các bài test API/MySQL có sẵn.

Lệnh dành cho máy đã cấu hình Node.js + MySQL:

```powershell
npm run db:init
npm start
# trên cửa sổ PowerShell thứ hai
npm run test:ui
npm run test:e2e
```

Để chạy browser test ở máy riêng cần cài Playwright/Chromium tương ứng (`npm install --no-save playwright@1.56.1`, `npx playwright install chromium`), khởi động cả hệ thống và đảm bảo dữ liệu kiểm thử được cô lập.

**Giới hạn:** E2E browser mới kiểm tra các luồng quản trị trọng yếu, chưa bao phủ mọi trường hợp lỗi UI và chưa xác nhận tính đúng đắn nghiệp vụ Payroll khi triển khai thực tế. Việc khóa tài khoản thu hồi refresh token nhưng access JWT đã cấp có thể còn hiệu lực tới khi hết hạn; cần session/token-revocation tập trung để khóa tức thời trên toàn bộ Microservices. Không được xem dự án là production-ready chỉ vì CI xanh.
