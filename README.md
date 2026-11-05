# Hệ thống Quản lý Đồ án Tốt nghiệp – Kiến trúc Hướng Dịch Vụ (SOA)
## Cổng thông tin quản lý đồ án tốt nghiệp QNU

Hệ thống được xây dựng theo kiến trúc **SOA (Service-Oriented Architecture)**, gồm các thành phần:
- Mỗi dịch vụ chạy trên một **tiến trình Express riêng biệt**, sử dụng **cơ sở dữ liệu MySQL độc lập** (`soa_auth`, `soa_student`, `soa_topic`, `soa_registration`, `soa_notification`).
- Giao tiếp đồng bộ qua **REST / JSON** và bất đồng bộ qua **Event Bus**.
- Tự động dò tìm động và cân bằng tải qua **Service Registry (:3500)**.
- Kiểm soát truy cập tập trung tại **API Gateway (:3000)** với cơ chế nạp chính sách động (`config/policies.json`).
- Khi một dịch vụ liên quan gián đoạn, chức năng phụ thuộc dịch vụ đó có thể tạm thời không dùng được; các chức năng không phụ thuộc vẫn có thể hoạt động. Một số API tổng hợp trả dữ liệu từng phần kèm trạng thái suy giảm.

---

## 1. Phân quyền và Tính năng chính

### A. Sinh viên (sinhvien)
- **Thông tin cá nhân:** Xem hồ sơ sinh viên, ngành và lớp.
- **Tài khoản:** Có thể tự đăng ký tài khoản sinh viên. Đăng ký công khai luôn tạo vai trò sinh viên; chỉ admin mới được cấp vai trò admin hoặc giảng viên.
- **Đăng ký đề tài tốt nghiệp / lớp học phần:** Lọc đề tài theo chuyên ngành; chỉ đăng ký đề tài đang mở, còn chỉ tiêu. Mỗi sinh viên chỉ có một đăng ký còn hiệu lực. Đăng ký bắt đầu ở trạng thái **"Chờ duyệt"** và có thể hủy khi đang chờ duyệt.
- **Xem điểm:** Xem điểm, kết quả và nhận xét của các đăng ký thuộc tài khoản. Điểm từ 4.0 trở lên được đánh dấu **"Hoàn thành"**; điểm thấp hơn 4.0 không tự đổi trạng thái.
- **Thông báo:** Nhận thông báo được phát qua Event Bus khi có sự kiện đăng ký, duyệt/từ chối hoặc chấm điểm.
- Không có mục thời khóa biểu hoặc chương trình đào tạo trong giao diện hiện tại. Hệ thống không kiểm tra GPA tối thiểu hay môn tiên quyết khi đăng ký.

### B. Giảng viên / Giáo viên (giangvien)
- **Tạo & quản lý đề tài:** Chọn chuyên ngành, đặt số lượng tối đa, mở/khóa đăng ký và chỉ quản lý đề tài mình phụ trách.
- **Duyệt đăng ký:** Xem đăng ký thuộc đề tài mình phụ trách; duyệt hoặc từ chối đăng ký đang chờ duyệt.
- **Tra cứu và chấm điểm:** Xem bảng điểm toàn trường, nhưng chỉ chấm điểm, sửa hoặc xóa đăng ký thuộc đề tài mình phụ trách. Điểm từ 4.0 trở lên chuyển trạng thái sang **"Hoàn thành"**.
- **Đăng ký hộ sinh viên:** Chỉ được đăng ký sinh viên vào đề tài do chính mình phụ trách.
- Không được quản lý tài khoản/vai trò hoặc thao tác lên đăng ký thuộc đề tài của giảng viên khác. Quyền ghi được kiểm tra ở API, không chỉ dựa vào giao diện.

### C. Quản trị viên (admin)
- Quản lý toàn bộ tài khoản người dùng, phân quyền vai trò (`admin`, `giangvien`, `sinhvien`).
- Quản lý hồ sơ sinh viên toàn trường, gồm thông tin cá nhân, lớp và ngành.
- Quản lý đề tài và mọi đăng ký trên toàn trường; duyệt, sửa, chấm điểm hoặc xóa đăng ký.
- Quản lý chính sách bảo mật API Gateway (`config/policies.json`).
- Giám sát sức khỏe kiến trúc SOA: Service Registry, Event Bus metrics, và kiểm thử tính chịu lỗi (Fault Tolerance).

---

## 2. Tài khoản thử nghiệm (Demo Accounts)

Khi nạp dữ liệu mẫu bằng `database/init_all_databases.sql`, mật khẩu mặc định là `123456` cho các tài khoản mẫu:

| Tài khoản mẫu | Vai trò |
|---|---|
| `admin` | Quản trị viên |
| `GV001` đến `GV010`, cùng `gv01` và `gv02` | Giảng viên |
| `SV001` đến `SV005` | Sinh viên |

Trong dữ liệu mẫu, `GV001` và `gv01` cùng đại diện cho TS. Nguyễn Thanh Bình; `GV002` và `gv02` cùng đại diện cho ThS. Trần Thị Mai. Đây là tài khoản demo, không dùng mật khẩu mặc định ở môi trường thật.

---

## 3. Hướng dẫn cài đặt và Chạy hệ thống

### Yêu cầu môi trường:
- **Node.js ≥ 18**
- **MySQL hoặc MariaDB** đang chạy (XAMPP/WAMP dùng được; mặc định cổng 3306).
- File `.env` có `JWT_SECRET` và thông tin kết nối database.

### Cài đặt và khởi chạy trên máy:
```bash
# Tạo .env từ mẫu (PowerShell: Copy-Item .env.example .env)
cp .env.example .env

# Cập nhật DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, JWT_SECRET trong .env
npm install

# Dừng hệ thống trước khi seed. Chỉ chạy trên database thử nghiệm hoặc database mới:
# Lệnh này DROP và tạo lại các bảng, làm mất dữ liệu hiện có.
npm run seed

# Khởi động Registry, Event Bus, 5 service và Gateway
npm start
```

Nếu không muốn khởi tạo lại dữ liệu, bỏ qua `npm run seed`. Các service tự tạo database/bảng còn thiếu khi khởi động, nhưng không tự tạo tài khoản demo. Để có tài khoản mẫu, cần nạp SQL khởi tạo một lần.

### Chuyển dữ liệu từ database monolith cũ:
Nếu dữ liệu đang nằm trong database `graduation_project`, hãy sao lưu trước, khởi động hệ thống một lần để tạo các database/bảng dịch vụ, sau đó dừng hệ thống và chạy `database/migrate_from_monolith.sql` trong MySQL Workbench hoặc phpMyAdmin. Script dùng `INSERT IGNORE` để chỉ thêm bản ghi chưa có, không ghi đè bản ghi trùng khóa ở database đích. Trong quá trình chuyển, chỉ tài khoản admin cũ giữ vai trò admin; các vai trò cũ khác được chuyển thành sinh viên và cần được admin phân quyền lại nếu cần.

Mở giao diện tại **http://localhost:3000**. Tài liệu OpenAPI tổng hợp tại **http://localhost:3000/api-docs**.

`ADMIN_USERNAME` và `ADMIN_PASSWORD` trong `.env` được dùng bởi `scripts/seed.js` và test E2E để đăng nhập tài khoản admin có sẵn; chúng không tự tạo hoặc đổi mật khẩu tài khoản trong database. Mật khẩu admin của SQL mẫu là `123456`.

### Chạy bằng Docker Compose:
```bash
docker compose up --build
```

Compose dùng MySQL trong container với tài khoản `root` không mật khẩu; đặt `DB_PASSWORD=` trong `.env`. Compose không nạp dữ liệu demo tự động. Muốn nạp SQL mẫu, chỉ làm trên database thử nghiệm, khi các service đang dừng:
```bash
docker compose up -d mysql
# Chờ MySQL khỏe mạnh, sau đó:
# Bash / cmd:
docker compose exec -T mysql mysql -uroot < database/init_all_databases.sql
# PowerShell:
Get-Content -Raw database/init_all_databases.sql | docker compose exec -T mysql mysql -uroot
docker compose up --build
```
File SQL có lệnh `DROP TABLE`; không chạy để cập nhật database đang có dữ liệu cần giữ.

---

## 4. Kiểm thử tự động (Test Suites)

- **Kiểm thử hạ tầng SOA (Unit / Mock Infrastructure):**
  ```bash
  npm test
  ```
  *(13 bài test kiểm tra Service Discovery, RBAC, Rate Limiting, cân bằng tải, chịu lỗi và Service Composition.)*

- **Kiểm thử đầu-cuối tích hợp (E2E Integration Test):**
  ```bash
  npm run test:e2e
  ```
  *(17 bài test kiểm tra luồng nghiệp vụ và quyền sở hữu đề tài trên hệ thống thật với MySQL.)*

**Cảnh báo:** E2E cần hệ thống và database thử nghiệm đang chạy. Bước dọn dẹp của `tests/e2e.test.js` gọi `scripts/clean-seed-data.js` (cũng là script chạy bởi `npm run seed`); thao tác này xóa và nạp lại dữ liệu mẫu trên database đang cấu hình. Không chạy E2E trên database có dữ liệu cần giữ.

---

## 5. Đặc tính Giảm sự phụ thuộc (Loose Coupling & Fault Tolerance) trong SOA

Các cơ chế giảm phụ thuộc hiện có:
1. **Cô lập Database (Database-per-service):** Không có Foreign Key hoặc JOIN chéo giữa các database `soa_auth`, `soa_student`, `soa_topic`, `soa_registration`, `soa_notification`.
2. **Giao tiếp qua Service Discovery:** Các dịch vụ không hardcode địa chỉ URL của nhau; định tuyến động qua Service Registry (:3500).
3. **Chế độ suy giảm:** Một số tổng hợp liên dịch vụ dùng `Promise.allSettled` và trả dữ liệu từng phần kèm cờ suy giảm nếu dịch vụ phụ trợ không phản hồi.
4. **Giao diện:** Các phân hệ gọi API riêng và có thể hiện cảnh báo khi dịch vụ phụ thuộc lỗi. Chức năng cần đúng dịch vụ đang lỗi sẽ không hoạt động cho đến khi dịch vụ phục hồi.
