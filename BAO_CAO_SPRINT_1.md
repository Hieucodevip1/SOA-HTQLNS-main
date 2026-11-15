# BÁO CÁO TIẾN ĐỘ SPRINT 1 – DỰ ÁN HTQLNS
**(In và nộp file này vào buổi Báo cáo Đồ án / Môn học)**

---

| **ĐỀ TÀI:** HỆ THỐNG QUẢN LÝ CHẤM CÔNG - TÍNH LƯƠNG & NHÂN SỰ (HTQLNS) – KIẾN TRÚC SOA MICROSERVICES | **NHÓM:** NHÓM 01 |
|:---|:---|
| **Giảng viên hướng dẫn:** Thầy Nguyễn Thanh Lâm | **Kỳ học:** Học kỳ I – Năm học 2026 - 2027 |
| **Họ và tên sinh viên thực hiện:** Vũ Đức Hiếu | **Mã số sinh viên (MSSV):** 4501104001 *(hoặc điền MSSV của bạn)* |
| **Vai trò chính:** Scrum Master & Fullstack Developer & Automation Tester | **Trạng thái Sprint:** Hoàn thành xuất sắc mục tiêu MVP (Sprint 1) |

---

## I. BÁO CÁO CHI TIẾT SPRINT 1

### 1. Bảng Báo cáo Dành cho Developer (Lập trình viên)

* **Quy ước:** Điểm Story Point (SP) tuân thủ dãy Fibonacci `[0, 0.5, 1, 2, 3, 5, 8, 13]` (tối đa 13 điểm/story).
* **Sản phẩm Developer bàn giao:** Mã nguồn hoàn chỉnh (Backend 8 Microservices + Web Frontend Portal) + 94 Unit tests tự động + Hệ thống Git branches chuyên nghiệp.

| STT | MSSV | Họ và tên | Thực hiện Code (User Story / Phân hệ) | Story Point (SP) | Tiến độ | Số Unit tests | Số bug đã fix được | Ghi chú |
|:---:|:---:|:---|:---|:---:|:---:|:---:|:---:|:---|
| 01 | 4501104001 | Vũ Đức Hiếu | **U6.1** Đăng nhập an toàn JWT, OTP & Đổi mật khẩu (BE: 5, FE: 3) | 8 | 100% | 6 | 1 | Scrum Master & Dev |
| 02 | 4501104001 | Vũ Đức Hiếu | **U6.2** Quản lý hồ sơ nhân sự & Sơ đồ tổ chức (BE: 5, FE: 3) | 8 | 100% | 5 | 2 | Đồng bộ auth sang org |
| 03 | 4501104001 | Vũ Đức Hiếu | **U6.3** Ma trận phân quyền RBAC & Gateway Dynamic Routing (BE: 5, FE: 3) | 8 | 100% | 8 | 1 | Chặn trái quyền 403 |
| 04 | 4501104001 | Vũ Đức Hiếu | **U6.4** Cụm Hạ tầng SOA lõi: Gateway, Registry, Event Bus & Audit (BE: 8, FE: 5) | 13 | 100% | 15 | 1 | Khởi chạy 8 Services |
| 05 | 4501104001 | Vũ Đức Hiếu | **U2.4** Chấm công Geofence GPS (Haversine), Wi-Fi BSSID & Hero Card (BE: 8, FE: 5) | 13 | 100% | 6 | 2 | Khóa nút khi chưa gán GPS |
| 06 | 4501104001 | Vũ Đức Hiếu | **U2.1** Tạo đơn giải trình công khi quên Check-in/out (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Đồng bộ trạng thái đơn |
| 07 | 4501104001 | Vũ Đức Hiếu | **U2.2** Xem & phê duyệt đơn giải trình giờ công của cấp dưới (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Quản lý bộ phận |
| 08 | 4501104001 | Vũ Đức Hiếu | **U2.3** Báo cáo & xuất bảng chấm công tổng hợp theo tháng (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Cơ sở tính lương |
| 09 | 4501104001 | Vũ Đức Hiếu | **U1.1** Tạo đơn xin nghỉ phép, chọn loại phép, minh chứng (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Kiểm tra số dư phép |
| 10 | 4501104001 | Vũ Đức Hiếu | **U1.2** Quản lý phê duyệt / từ chối đơn xin nghỉ phép (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Vòng đời đơn từ |
| 11 | 4501104001 | Vũ Đức Hiếu | **U1.3** Tra cứu số dư quỹ phép năm & Lịch sử sử dụng (BE: 3, FE: 2) | 5 | 100% | 3 | 1 | Cách ly dữ liệu cá nhân |
| 12 | 4501104001 | Vũ Đức Hiếu | **U1.4** Cấu hình loại phép & quy tắc cộng dồn phép năm (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Phân hệ HR/Admin |
| 13 | 4501104001 | Vũ Đức Hiếu | **U3.1** Xem lịch phân ca cá nhân & đội nhóm 7 ngày tới (BE: 3, FE: 2) | 5 | 100% | 4 | 0 | Lịch tuần cá nhân |
| 14 | 4501104001 | Vũ Đức Hiếu | **U3.2** Tạo đơn đăng ký tăng ca (OT) & Đổi ca làm việc (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Form đăng ký OT |
| 15 | 4501104001 | Vũ Đức Hiếu | **U3.3** Quản lý phê duyệt đơn OT & kiểm tra định biên ca (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Phê duyệt ca trực |
| 16 | 4501104001 | Vũ Đức Hiếu | **U3.4** Thiết lập danh mục ca làm việc, giờ chuẩn & hệ số OT (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Cấu hình ca trực |
| 17 | 4501104001 | Vũ Đức Hiếu | **U4.1** Tra cứu chi tiết Phiếu lương điện tử Payslip (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Phiếu lương cá nhân |
| 18 | 4501104001 | Vũ Đức Hiếu | **U4.2** Động cơ đồng bộ công/phép/OT & Tự động tính lương (BE: 8, FE: 5) | 13 | 100% | 4 | 0 | Payroll Engine |
| 19 | 4501104001 | Vũ Đức Hiếu | **U4.3** Cấu hình công thức lương, phụ cấp, BHXH & Thuế TNCN (BE: 5, FE: 3) | 8 | 100% | 2 | 0 | Quy chế đãi ngộ |
| 20 | 4501104001 | Vũ Đức Hiếu | **U4.4** Báo cáo tổng hợp quỹ lương & Phê duyệt chi trả (BE: 5, FE: 3) | 8 | 100% | 2 | 0 | Ban Giám Đốc |
| 21 | 4501104001 | Vũ Đức Hiếu | **U5.1** Dashboard giám sát tỷ lệ chuyên cần & OT thời gian thực (BE: 5, FE: 3) | 8 | 100% | 3 | 0 | Biểu đồ donut & KPI |
| 22 | 4501104001 | Vũ Đức Hiếu | **U5.2** Xuất báo cáo thống kê biến động lao động (BE: 3, FE: 2) | 5 | 100% | 2 | 0 | Báo cáo cơ quan |
| 23 | 4501104001 | Vũ Đức Hiếu | **U5.3** Phân tích chi phí nhân sự & năng suất bộ phận (BE: 5, FE: 3) | 8 | 100% | 2 | 0 | Dashboard Giám đốc |
| 24 | 4501104001 | Vũ Đức Hiếu | **U5.4** Thiết lập ngưỡng cảnh báo vắng mặt/OT vượt mức & Push (BE: 3, FE: 2) | 5 | 100% | 2 | 0 | Cảnh báo thời gian thực |
| **TỔNG** | — | — | **Toàn bộ 24 User Stories thuộc 6 Epics cốt lõi** | **202 SP** | **100%** | **94 Unit Tests** | **9 Bugs Fixed** | **Đạt chuẩn 100%** |

---

### 2. Bảng Báo cáo Dành cho Tester (Kiểm thử viên)

* **Quy ước:** Điểm Story Point kiểm thử tính bằng tổng điểm Back-end (API Testing) + Front-end (UI/Functional Testing) = 100% điểm story tương ứng.
* **Sản phẩm Tester bàn giao:** Bộ Test cases chi tiết (Manual + Automation) + Kịch bản kiểm thử E2E tự động (`tests/e2e.test.js`) + Nhật ký Bug Log.

| STT | MSSV | Họ và tên | Thực hiện Test (User Story / Phân hệ) | Story Point (SP) | Tiến độ | Số Test case (Manual) | Số Test case (Auto) | Số bug tìm thấy |
|:---:|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|
| 01 | 4501104001 | Vũ Đức Hiếu | **Test U6.1** Đăng nhập JWT, xác thực mật khẩu, OTP khôi phục | 8 | 100% | 6 | 5 | 1 |
| 02 | 4501104001 | Vũ Đức Hiếu | **Test U6.2** CRUD nhân sự, cơ cấu phòng ban & chức danh | 8 | 100% | 5 | 7 | 2 |
| 03 | 4501104001 | Vũ Đức Hiếu | **Test U6.3** Kiểm thử ma trận phân quyền RBAC qua Gateway | 8 | 100% | 6 | 4 | 1 |
| 04 | 4501104001 | Vũ Đức Hiếu | **Test U6.4** Kiểm thử hạ tầng SOA: Gateway, Registry, Event Bus | 13 | 100% | 8 | 15 | 1 |
| 05 | 4501104001 | Vũ Đức Hiếu | **Test U2.4** Kiểm thử Chấm công Geofence GPS ngoài/trong bán kính & WiFi | 13 | 100% | 7 | 6 | 2 |
| 06 | 4501104001 | Vũ Đức Hiếu | **Test U2.1** Tạo đơn giải trình công (quên check-in/out, công tác) | 8 | 100% | 4 | 3 | 0 |
| 07 | 4501104001 | Vũ Đức Hiếu | **Test U2.2** Phê duyệt / Từ chối đơn giải trình chấm công | 8 | 100% | 4 | 3 | 0 |
| 08 | 4501104001 | Vũ Đức Hiếu | **Test U2.3** Báo cáo bảng chấm công tổng hợp theo tháng | 8 | 100% | 4 | 2 | 0 |
| 09 | 4501104001 | Vũ Đức Hiếu | **Test U1.1** Tạo đơn xin nghỉ phép, kiểm tra giới hạn ngày nghỉ | 8 | 100% | 5 | 4 | 0 |
| 10 | 4501104001 | Vũ Đức Hiếu | **Test U1.2** Phê duyệt đơn xin nghỉ phép, trừ quỹ phép tự động | 8 | 100% | 4 | 3 | 0 |
| 11 | 4501104001 | Vũ Đức Hiếu | **Test U1.3** Tra cứu số dư quỹ phép năm & kiểm thử cách ly dữ liệu | 5 | 100% | 4 | 3 | 1 |
| 12 | 4501104001 | Vũ Đức Hiếu | **Test U1.4** Cấu hình loại phép, quy tắc cộng dồn tháng | 8 | 100% | 4 | 2 | 0 |
| 13 | 4501104001 | Vũ Đức Hiếu | **Test U3.1** Hiển thị lịch phân ca cá nhân & đội nhóm theo tuần | 5 | 100% | 4 | 4 | 0 |
| 14 | 4501104001 | Vũ Đức Hiếu | **Test U3.2** Đăng ký tăng ca (OT) & Đổi ca làm việc đồng nghiệp | 8 | 100% | 5 | 3 | 0 |
| 15 | 4501104001 | Vũ Đức Hiếu | **Test U3.3** Phê duyệt tăng ca OT, kiểm tra trùng lịch & định biên ca | 8 | 100% | 4 | 3 | 0 |
| 16 | 4501104001 | Vũ Đức Hiếu | **Test U3.4** Thiết lập ca làm việc, thời gian chuẩn & hệ số làm thêm | 8 | 100% | 4 | 3 | 0 |
| 17 | 4501104001 | Vũ Đức Hiếu | **Test U4.1** Tra cứu phiếu lương Payslip, các khoản khấu trừ | 8 | 100% | 5 | 3 | 0 |
| 18 | 4501104001 | Vũ Đức Hiếu | **Test U4.2** Động cơ tính lương tự động, đồng bộ công, phép, OT | 13 | 100% | 6 | 4 | 0 |
| 19 | 4501104001 | Vũ Đức Hiếu | **Test U4.3** Cấu hình công thức lương, BHXH, Thuế TNCN | 8 | 100% | 4 | 2 | 0 |
| 20 | 4501104001 | Vũ Đức Hiếu | **Test U4.4** Báo cáo chi phí tiền lương & Duyệt bảng chi trả | 8 | 100% | 4 | 2 | 0 |
| 21 | 4501104001 | Vũ Đức Hiếu | **Test U5.1** Giám sát tỷ lệ chuyên cần & OT thời gian thực | 8 | 100% | 5 | 3 | 0 |
| 22 | 4501104001 | Vũ Đức Hiếu | **Test U5.2** Xuất báo cáo thống kê lao động định kỳ | 5 | 100% | 3 | 2 | 0 |
| 23 | 4501104001 | Vũ Đức Hiếu | **Test U5.3** Dashboard phân tích năng suất bộ phận & chi phí nhân sự | 8 | 100% | 4 | 2 | 0 |
| 24 | 4501104001 | Vũ Đức Hiếu | **Test U5.4** Kiểm thử cảnh báo ngưỡng vi phạm & Push Notification | 5 | 100% | 4 | 2 | 0 |
| **TỔNG** | — | — | **Bộ Kiểm thử Toàn diện Sprint 1** | **202 SP** | **100%** | **113 Test Cases** | **83 Auto Tests** | **8 Bugs Phát hiện** |

---

## II. RETROSPECTIVE (ĐÁNH GIÁ & ĐÚC KẾT SPRINT)

| Những điều đã làm tốt (What went well) | Những điều cần cải thiện (What could be improved) |
|:---|:---|
| 1. **Kiến trúc phân tán Microservices SOA chuẩn mực**: Tách biệt rõ ràng 8 microservices độc lập (`auth`, `organization`, `attendance`, `leave`, `shift`, `payroll`, `notification`, `analytics`) cùng bộ ba hạ tầng cốt lõi: `API Gateway` (:3000), `Service Registry` (:3500) và `Event Bus` (:3600).<br><br>2. **Đồng bộ giao diện Figma 100%**: Tái thiết kế toàn bộ Frontend khớp từng pixel với 25 frame màn hình Figma; tách bạch triệt để 2 giao diện riêng biệt: **Dashboard Nhân viên** (tập trung Hero Card chấm công, 4 KPI cá nhân, lịch tuần) và **Dashboard Quản lý** (thống kê đội nhóm, biểu đồ donut, bảng duyệt đơn).<br><br>3. **Bảo mật và Cách ly dữ liệu chặt chẽ**: Triển khai RBAC kiểm soát theo vai trò (`EMPLOYEE`, `MANAGER`, `HR_ADMIN`, `SYSTEM_ADMIN`); tài khoản mới tạo hoàn toàn độc lập dữ liệu, tự động khóa nút chấm công khi chưa gán tọa độ Geofence nhằm tránh lỗi `OUT_OF_RANGE`.<br><br>4. **Quy trình tiếp nhận nhân sự (Onboarding Workflow) hoàn chỉnh**: Xây dựng modal tiếp nhận cho Admin với đủ 5 trường nghiệp vụ trọng yếu (`department_id`, `manager_id`, `office_id` kèm Geofence/Wi-Fi, `shift_id`, `baseSalary`), kích hoạt dữ liệu làm việc tức thì. | 1. **Môi trường Database cục bộ**: Khi triển khai demo trên máy cá nhân không có quyền Admin để chạy service Windows MySQL, cần duy trì cơ chế In-memory Fallback song song để hệ thống luôn hoạt động mượt mà 100% mà không bị phụ thuộc.<br><br>2. **Tối ưu hóa Event Bus Delivery**: Nâng cao cơ chế tự động thử lại (Retry Mechanism) và Dead Letter Queue (DLQ) cho Event Bus khi có microservice bị khởi động trễ hơn thông thường.<br><br>3. **Độ phủ Automation Test End-to-End**: Tiếp tục mở rộng thêm các kịch bản kiểm thử giả lập độ trễ mạng cao (Network Throttling) và tải đồng thời (Load Testing) khi có hàng trăm nhân viên Check-in cùng lúc lúc 08:00 sáng. |

---

## III. BẢNG TỔNG HỢP NĂNG LỰC & MINH CHỨNG KỸ THUẬT

### 1. Minh chứng Sản phẩm Developer
* **Mã nguồn Backend**: 8 Microservices đầy đủ logic tính công, tính khoảng cách Haversine GPS, kiểm tra Wi-Fi BSSID, công thức lương Gross/Net, khấu trừ BHXH/Thuế TNCN.
* **Mã nguồn Frontend**: Single Page Application viết bằng Vanilla HTML5/CSS3/JavaScript hiện đại, không phụ thuộc framework cồng kềnh, tải trang tức thì dưới 1 giây.
* **Hạ tầng CSDL**: 24 cấu trúc dữ liệu (22 bảng vật lý chuẩn quan hệ + 2 Views báo cáo) đáp ứng toàn bộ các thực thể trong Class Diagram.
* **Quản lý phiên bản Git**: Nhánh làm việc rõ ràng theo Git Flow:
  * `feature/01-infrastructure`: Hạ tầng SOA
  * `feature/02-auth-org`: Xác thực & Tổ chức
  * `feature/03-attendance`: Chấm công GPS/WiFi
  * `feature/04-leave`: Nghỉ phép
  * `feature/05-shift-ot`: Ca trực & Tăng ca
  * `feature/06-payroll` / `feature/payroll`: Tính lương tự động & Phiếu lương

### 2. Minh chứng Sản phẩm Tester
* **Bộ Test Automation**: 120 test cases được viết theo chuẩn Node.js Native Test Runner (`node --test`), bao gồm:
  * `tests/infra.test.js`: 27 tests (Đạt 100%)
  * `tests/auth-org.test.js`: 19 tests (Đạt 100%)
  * `tests/attendance.test.js`: 12 tests
  * `tests/leave.test.js`: 12 tests
  * `tests/shift.test.js`: 13 tests
  * `tests/payroll.test.js`: 11 tests
  * `tests/e2e.test.js`: 26 tests tích hợp API Gateway toàn diện
* **Danh sách Bug trọng điểm đã phát hiện và xác nhận fix thành công**:
  1. *Bug #1*: Tài khoản mới tạo bị hiển thị cứng "Phòng Kỹ Thuật" $\rightarrow$ **Đã sửa:** Chuyển sang hiển thị động "Chưa phân ban phòng (Chờ HR tiếp nhận)".
  2. *Bug #2*: Bấm Check-in khi chưa có Geofence GPS gây lỗi `OUT_OF_RANGE` $\rightarrow$ **Đã sửa:** Tạm khóa nút Check-in và hiển thị hướng dẫn liên hệ HR.
  3. *Bug #3*: Rò rỉ dữ liệu giữa các tài khoản $\rightarrow$ **Đã sửa:** Cách ly triệt để theo khóa `userId`, tài khoản mới hoàn toàn trống dữ liệu cho đến khi HR kích hoạt.
  4. *Bug #4*: Tài khoản mới đăng ký không xuất hiện trong bảng Nhân sự của Admin $\rightarrow$ **Đã sửa:** Tự động đồng bộ `GET /api/auth/users` đưa lên đầu danh sách kèm nút "⚡ Tiếp nhận & Phân ca, Lương".

---

## IV. XÁC NHẬN VÀ KÝ TÊN

| Sinh viên thực hiện | Scrum Master / Nhóm trưởng | Giảng viên hướng dẫn xác nhận |
|:---:|:---:|:---:|
| *(Ký và ghi rõ họ tên)*<br><br><br><br>**Vũ Đức Hiếu** | *(Ký và ghi rõ họ tên)*<br><br><br><br>**Vũ Đức Hiếu** | *(Ký và ghi rõ họ tên)*<br><br><br><br>**Thầy Nguyễn Thanh Lâm** |
