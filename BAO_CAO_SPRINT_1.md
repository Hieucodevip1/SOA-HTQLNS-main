# BÁO CÁO SPRINTS
**(In và nộp file này vào buổi Báo cáo)**

---

| **ĐỀ TÀI:** Hệ thống Quản lý Nhân sự & Chấm công (SOA-HTQLNS) | **NHÓM:** 06 |
|:---|:---|
| **Giảng viên hướng dẫn:** Thầy Vũ Sơn Lâm | **Học kỳ / Năm học:** Học kỳ I – 2026 - 2027 |
| **Họ và tên sinh viên thực hiện:** Vũ Đức Hiếu | **Mã số sinh viên (MSSV):** 4501104001 |
| **Số thứ tự (STT trong danh sách lớp):** 01 | **Vai trò:** Scrum Master & Developer & Tester |

---

## HƯỚNG DẪN & QUY ƯỚC ĐÁNH GIÁ SPRINT
1. **Xác định vai trò:** Trong Sprint 1, sinh viên Vũ Đức Hiếu đảm nhiệm vai trò Scrum Master kiêm Fullstack Developer và Automation Tester.
2. **Quy ước Story Point (SP):** Điểm cho mỗi User story được lấy từ dãy số Fibonacci: `[0, 0.5, 1, 2, 3, 5, 8, 13]`. Điểm tối đa không vượt quá 13 theo quy ước của GV.
3. **Phân chia BE / FE:** Một User story phân tách làm Back-end (BE) và Front-end (FE) tính điểm độc lập.
4. **Quy ước tính điểm Tester:** Kiểm thử trọn vẹn cả chức năng = Điểm Back-end (API Testing) + Điểm Front-end (Functional / UI Testing).
5. **Tiến độ:** Tất cả các User story liệt kê trong Sprint 1 đều hoàn thành 100% mục tiêu MVP và được tính điểm.
6. **Sản phẩm bàn giao:**
   - *Scrum Master:* Quản lý dự án, phân rã 6 Epics, 24 User stories, 25 màn hình Figma, kiến trúc SOA 8 Microservices.
   - *Developer:* Mã nguồn Backend & Frontend + 94 Unit tests + Hệ thống quản lý mã nguồn Git branches.
   - *Tester:* 113 Test cases Manual + 83 Automation tests (`node --test`) + Báo cáo phát hiện và xác nhận fix 8 bugs.

---

# SPRINT 1

## I. BÁO CÁO SPRINT

### 1. Developers

| STT | MSSV | Họ và tên | Thực hiện Code | Story Point (SP) | Tiến độ | Số Unit tests | Số bug đã fix được | Ghi chú |
|:---:|:---:|:---|:---|:---:|:---:|:---:|:---:|:---|
| 01 | 4501104001 | Vũ Đức Hiếu | **U6.1** Đăng nhập JWT, OTP sinh trắc & Đổi mật khẩu (BE)<br>**U6.1** Đăng nhập JWT, OTP sinh trắc & Đổi mật khẩu (FE)<br>**U6.2** Quản lý hồ sơ nhân sự & Sơ đồ tổ chức (BE)<br>**U6.2** Quản lý hồ sơ nhân sự & Sơ đồ tổ chức (FE)<br>**U6.3** Ma trận phân quyền RBAC & Gateway Routing (BE)<br>**U6.3** Ma trận phân quyền RBAC & Gateway Routing (FE)<br>**U6.4** Cụm Hạ tầng SOA: Gateway, Registry, Event Bus (BE)<br>**U6.4** Cụm Hạ tầng SOA: Gateway, Registry, Event Bus (FE)<br>**U2.4** Chấm công Geofence GPS, Wi-Fi & Hero Card (BE)<br>**U2.4** Chấm công Geofence GPS, Wi-Fi & Hero Card (FE)<br>**U2.1** Tạo đơn giải trình công khi quên Check-in/out (BE)<br>**U2.1** Tạo đơn giải trình công khi quên Check-in/out (FE)<br>**U2.2** Xem & phê duyệt đơn giải trình giờ công (BE)<br>**U2.2** Xem & phê duyệt đơn giải trình giờ công (FE)<br>**U2.3** Báo cáo & xuất bảng chấm công tổng hợp (BE)<br>**U2.3** Báo cáo & xuất bảng chấm công tổng hợp (FE)<br>**U1.1** Tạo đơn xin nghỉ phép, chọn loại phép, đính kèm (BE)<br>**U1.1** Tạo đơn xin nghỉ phép, chọn loại phép, đính kèm (FE)<br>**U1.2** Quản lý phê duyệt / từ chối đơn xin nghỉ phép (BE)<br>**U1.2** Quản lý phê duyệt / từ chối đơn xin nghỉ phép (FE)<br>**U1.3** Tra cứu số dư quỹ phép năm & Lịch sử sử dụng (BE)<br>**U1.3** Tra cứu số dư quỹ phép năm & Lịch sử sử dụng (FE)<br>**U1.4** Cấu hình loại phép & quy tắc cộng dồn phép năm (BE)<br>**U1.4** Cấu hình loại phép & quy tắc cộng dồn phép năm (FE)<br>**U3.1** Xem lịch phân ca cá nhân & đội nhóm 7 ngày tới (BE)<br>**U3.1** Xem lịch phân ca cá nhân & đội nhóm 7 ngày tới (FE)<br>**U3.2** Tạo đơn đăng ký tăng ca (OT) & Đổi ca làm việc (BE)<br>**U3.2** Tạo đơn đăng ký tăng ca (OT) & Đổi ca làm việc (FE)<br>**U3.3** Quản lý phê duyệt đơn OT & kiểm tra định biên ca (BE)<br>**U3.3** Quản lý phê duyệt đơn OT & kiểm tra định biên ca (FE)<br>**U3.4** Thiết lập danh mục ca, giờ chuẩn & hệ số OT (BE)<br>**U3.4** Thiết lập danh mục ca, giờ chuẩn & hệ số OT (FE)<br>**U4.1** Tra cứu chi tiết Phiếu lương điện tử Payslip (BE)<br>**U4.1** Tra cứu chi tiết Phiếu lương điện tử Payslip (FE)<br>**U4.2** Động cơ đồng bộ công/phép/OT & Tự động tính lương (BE)<br>**U4.2** Động cơ đồng bộ công/phép/OT & Tự động tính lương (FE)<br>**U4.3** Cấu hình công thức lương, phụ cấp, BHXH & Thuế (BE)<br>**U4.3** Cấu hình công thức lương, phụ cấp, BHXH & Thuế (FE)<br>**U4.4** Báo cáo tổng hợp quỹ lương & Phê duyệt chi trả (BE)<br>**U4.4** Báo cáo tổng hợp quỹ lương & Phê duyệt chi trả (FE)<br>**U5.1** Dashboard giám sát tỷ lệ chuyên cần & OT real-time (BE)<br>**U5.1** Dashboard giám sát tỷ lệ chuyên cần & OT real-time (FE)<br>**U5.2** Xuất báo cáo thống kê biến động lao động (BE)<br>**U5.2** Xuất báo cáo thống kê biến động lao động (FE)<br>**U5.3** Phân tích chi phí nhân sự & năng suất bộ phận (BE)<br>**U5.3** Phân tích chi phí nhân sự & năng suất bộ phận (FE)<br>**U5.4** Thiết lập ngưỡng cảnh báo vắng mặt/OT vượt mức (BE)<br>**U5.4** Thiết lập ngưỡng cảnh báo vắng mặt/OT vượt mức (FE) | 5<br>3<br>5<br>3<br>5<br>3<br>8<br>5<br>8<br>5<br>5<br>3<br>5<br>3<br>5<br>3<br>5<br>3<br>5<br>3<br>3<br>2<br>5<br>3<br>3<br>2<br>5<br>3<br>5<br>3<br>5<br>3<br>5<br>3<br>8<br>5<br>5<br>3<br>5<br>3<br>5<br>3<br>3<br>2<br>5<br>3<br>3<br>2 | 100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100% | 6<br>-<br>5<br>-<br>8<br>-<br>15<br>-<br>6<br>-<br>3<br>-<br>3<br>-<br>3<br>-<br>3<br>-<br>3<br>-<br>3<br>-<br>3<br>-<br>4<br>-<br>3<br>-<br>3<br>-<br>3<br>-<br>3<br>-<br>4<br>-<br>2<br>-<br>2<br>-<br>3<br>-<br>2<br>-<br>2<br>-<br>2<br>- | 1<br>-<br>2<br>-<br>1<br>-<br>1<br>-<br>2<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>1<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>-<br>0<br>- | **Scrum Master & Dev**<br>(Tổng: 202 SP, 94 Unit Tests, 8 Bugs Fixed) |

---

### 2. Testers

| STT | MSSV | Họ và tên | Thực hiện Test | Story Point (SP) | Tiến độ | Số Test case (Manual) | Số Test case (Auto) | Số bug tìm thấy |
|:---:|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|
| 01 | 4501104001 | Vũ Đức Hiếu | **Test U6.1** Đăng nhập JWT, xác thực mật khẩu, OTP khôi phục<br>**Test U6.2** CRUD nhân sự, cơ cấu phòng ban & chức danh<br>**Test U6.3** Kiểm thử ma trận phân quyền RBAC qua Gateway<br>**Test U6.4** Kiểm thử hạ tầng SOA: Gateway, Registry, Event Bus<br>**Test U2.4** Kiểm thử Chấm công Geofence GPS & Wi-Fi BSSID<br>**Test U2.1** Tạo đơn giải trình công (quên check-in/out, công tác)<br>**Test U2.2** Phê duyệt / Từ chối đơn giải trình chấm công<br>**Test U2.3** Báo cáo bảng chấm công tổng hợp theo tháng<br>**Test U1.1** Tạo đơn xin nghỉ phép, kiểm tra giới hạn ngày nghỉ<br>**Test U1.2** Phê duyệt đơn xin nghỉ phép, trừ quỹ phép tự động<br>**Test U1.3** Tra cứu số dư quỹ phép năm & kiểm thử cách ly dữ liệu<br>**Test U1.4** Cấu hình loại phép, quy tắc cộng dồn tháng<br>**Test U3.1** Hiển thị lịch phân ca cá nhân & đội nhóm theo tuần<br>**Test U3.2** Đăng ký tăng ca (OT) & Đổi ca làm việc đồng nghiệp<br>**Test U3.3** Phê duyệt tăng ca OT, kiểm tra trùng lịch & định biên ca<br>**Test U3.4** Thiết lập ca làm việc, thời gian chuẩn & hệ số làm thêm<br>**Test U4.1** Tra cứu phiếu lương Payslip, các khoản khấu trừ<br>**Test U4.2** Động cơ tính lương tự động, đồng bộ công, phép, OT<br>**Test U4.3** Cấu hình công thức lương, BHXH, Thuế TNCN<br>**Test U4.4** Báo cáo chi phí tiền lương & Duyệt bảng chi trả<br>**Test U5.1** Giám sát tỷ lệ chuyên cần & OT thời gian thực<br>**Test U5.2** Xuất báo cáo thống kê lao động định kỳ<br>**Test U5.3** Dashboard phân tích năng suất bộ phận & chi phí nhân sự<br>**Test U5.4** Kiểm thử cảnh báo ngưỡng vi phạm & Push Notification | 8<br>8<br>8<br>13<br>13<br>8<br>8<br>8<br>8<br>8<br>5<br>8<br>5<br>8<br>8<br>8<br>8<br>13<br>8<br>8<br>8<br>5<br>8<br>5 | 100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100%<br>100% | 6<br>5<br>6<br>8<br>7<br>4<br>4<br>4<br>5<br>4<br>4<br>4<br>4<br>5<br>4<br>4<br>5<br>6<br>4<br>4<br>5<br>3<br>4<br>4 | 5<br>7<br>4<br>15<br>6<br>3<br>3<br>2<br>4<br>3<br>3<br>2<br>4<br>3<br>3<br>3<br>3<br>4<br>2<br>2<br>3<br>2<br>2<br>2 | 1<br>2<br>1<br>1<br>2<br>0<br>0<br>0<br>0<br>0<br>1<br>0<br>0<br>0<br>0<br>0<br>0<br>0<br>0<br>0<br>0<br>0<br>0<br>0 |

---

## II. RETROSPECTIVE (ĐÁNH GIÁ & ĐÚC KẾT SPRINT)

| Những điều đã làm tốt | Những điều cần cải thiện |
|:---|:---|
| 1. **Kiến trúc phân tán Microservices SOA chuẩn mực**: Xây dựng thành công cụm 8 services độc lập giao tiếp thông qua API Gateway (:3000), Service Registry (:3500) và Event Bus (:3600).<br><br>2. **Đồng bộ chuẩn 100% theo Figma**: Tách biệt rõ ràng 2 không gian trải nghiệm: Dashboard Nhân viên (thao tác nhanh trong 5s, Hero Card chấm công, 4 KPI, lịch tuần) và Dashboard Quản lý (biểu đồ donut, bảng duyệt đơn).<br><br>3. **Phân quyền RBAC & Bảo mật dữ liệu cá nhân**: Cách ly dữ liệu chặt chẽ theo từng người dùng; tự động khóa nút chấm công khi chưa gán tọa độ Geofence nhằm chống lỗi `OUT_OF_RANGE`.<br><br>4. **Quy trình Onboarding hoàn chỉnh**: Admin có giao diện tiếp nhận nhân sự gán đủ 5 trường nghiệp vụ trọng yếu (`department_id`, `manager_id`, `office_id` GPS, `shift_id`, `baseSalary`). | 1. **Môi trường Database**: Phát triển cơ chế In-memory Fallback song song để ứng dụng có thể demo mượt mà trên bất kỳ máy tính nào mà không bị gián đoạn khi service MySQL bị tắt.<br><br>2. **Độ ổn định của Event Bus**: Tiếp tục hoàn thiện cơ chế Dead Letter Queue (DLQ) và Retry khi một service downstream khởi động chậm hơn thông thường.<br><br>3. **Độ phủ Load Testing**: Bổ sung kịch bản kiểm thử tải đồng thời (Concurrent Check-in) khi có 500+ nhân viên chấm công cùng lúc vào đầu giờ sáng. |

---

## III. KÝ TÊN VÀ XÁC NHẬN

| Sinh viên thực hiện | Scrum Master / Nhóm trưởng | Giảng viên hướng dẫn xác nhận |
|:---:|:---:|:---:|
| *(Ký và ghi rõ họ tên)*<br><br><br><br>**Vũ Đức Hiếu** | *(Ký và ghi rõ họ tên)*<br><br><br><br>**Vũ Đức Hiếu** | *(Ký và ghi rõ họ tên)*<br><br><br><br>**Thầy Vũ Sơn Lâm** |
