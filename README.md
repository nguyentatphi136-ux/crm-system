# Customer Support CRM Infrastructure (Dockerized & Hardened)

Dự án này triển khai một hệ thống phần mềm **CRM Chăm sóc Khách hàng (Customer Support & Ticket Management)** tích hợp đầy đủ hạ tầng tiêu chuẩn công nghiệp: Microservices container hóa, Reverse Proxy, Giám sát hệ thống toàn diện (Monitoring với Prometheus & Grafana), Quản lý Log tập trung (Centralized Logging với Loki & Promtail + LogQL) và các biện pháp bảo mật chuyên sâu (Hardening), được đóng gói hoàn toàn bằng Docker Compose.

---

## 🏗️ Cấu trúc hệ thống (Architecture)

Hệ thống bao gồm **12 container** chạy đồng thời, được phân lập thành 2 mạng bridge độc lập (`frontend_net` và `backend_net`) để đảm bảo an toàn tuyệt đối cho cơ sở dữ liệu:

1. **Reverse Proxy (`crm_proxy`)**: Nginx Reverse Proxy tiếp nhận request, cấu hình 7 HTTP Security Headers, ẩn version, định tuyến `/` vào Frontend, `/api/` vào Backend, `/health` & `/metrics` và endpoint `/stub_status`.
2. **Frontend Web App (`crm_frontend`)**: Ứng dụng SPA Web Dashboard phục vụ giao diện người dùng, gửi ticket, quản lý khách hàng và SLA.
3. **Backend API (`crm_backend`)**: RESTful API viết bằng Node.js Express, xác thực JWT, phân quyền RBAC, xuất native Prometheus `/metrics` và ghi structured logfmt. Chạy dưới quyền người dùng không đặc quyền **`USER node`**.
4. **Database (`crm_db`)**: Cơ sở dữ liệu PostgreSQL 15 Alpine nằm hoàn toàn trong `backend_net`, không mở port ra máy chủ host.
5. **pgAdmin 4 (`crm_pgadmin`)**: Công cụ quản trị trực quan nền web cho PostgreSQL.
6. **Prometheus (`crm_prometheus`)**: Thu thập và lưu trữ metrics từ toàn bộ các thành phần trong hệ thống.
7. **PostgreSQL Exporter (`crm_postgres_exporter`)**: Thu thập chỉ số hiệu năng chuyên sâu của CSDL PostgreSQL (connections, cache hit ratio, transactions, size).
8. **Nginx Exporter (`crm_nginx_exporter`)**: Thu thập chỉ số lưu lượng và kết nối của Nginx Web Server.
9. **cAdvisor (`crm_cadvisor`)**: Thu thập chỉ số tài nguyên phần cứng (CPU, RAM, Network I/O) của tất cả các container.
10. **Grafana (`crm_grafana`)**: Hiển thị trực quan dữ liệu giám sát thông qua 5 Dashboards tự động nạp sẵn (Provisioning) và truy vấn Log tập trung.
11. **Loki (`crm_loki`)**: Hệ thống lưu trữ và đánh chỉ mục Log tập trung.
12. **Promtail (`crm_promtail`)**: Thu thập log thời gian thực từ Docker socket của tất cả containers `crm_*` và đẩy về Loki.

---

## 🛡️ Các biện pháp bảo mật (Hardening) đã áp dụng

Hệ thống tuân thủ nghiêm ngặt **7 biện pháp bảo mật** từ tầng mạng, container, dịch vụ cho đến mã nguồn:

1. **Non-root Container (Chạy người dùng phi đặc quyền):**
   - Backend Node.js được cấu hình trong `Dockerfile` để chạy dưới quyền **`USER node`** thay vì quyền `root`.
   - Xác thực: `docker exec crm_backend whoami` trả về `node`.
2. **Network Isolation (Phân lập mạng nội bộ 2 tầng):**
   - Phân tách thành 2 mạng bridge: `frontend_net` (hướng ngoài) và `backend_net` (hướng nội bộ).
   - PostgreSQL nằm riêng biệt trong `backend_net`, không map cổng 5432 ra host, ngăn chặn mọi nguy cơ quét cổng hoặc tấn công từ mạng ngoài.
3. **Mật khẩu mạnh & Quản lý biến môi trường an toàn:**
   - Sử dụng mật khẩu phức tạp cho toàn bộ tài khoản hệ thống (`Crm_User_P@ssw0rd_2026!`, `PgAdmin_Adm1n_Sec2026!`, `Grafana_Adm1n_Sec2026!`).
   - Mật khẩu được quản lý tách biệt qua file `.env` (được đưa vào `.gitignore` để tránh rò rỉ mã nguồn) và cung cấp file mẫu `.env.example`.
4. **Hạn chế quyền người dùng Database (Least Privilege DB User):**
   - Backend sử dụng tài khoản `crm_user` với quyền hạn cần thiết trên database `crm_db`.
   - Exporter được cấp quyền kiểm toán hiệu năng `pg_monitor` an toàn.
5. **Nginx Security Headers & Ẩn thông tin công nghệ (Server Information Disclosure):**
   - Cấu hình `server_tokens off;` để ẩn phiên bản Nginx.
   - Cấu hình `proxy_hide_header X-Powered-By;` để ẩn hoàn toàn dấu vết công nghệ backend.
   - Cấu hình đầy đủ các HTTP Security Headers tiêu chuẩn:
     - `X-Frame-Options: "SAMEORIGIN"` (Chống Clickjacking)
     - `X-Content-Type-Options: "nosniff"` (Chống MIME sniffing)
     - `X-XSS-Protection: "1; mode=block"` (Chống phản xạ XSS)
     - `Referrer-Policy: "strict-origin-when-cross-origin"`
     - `Permissions-Policy: "geolocation=(), microphone=(), camera=()"`
     - `Content-Security-Policy: "default-src 'self' ..."` (Chống chèn mã độc XSS)
6. **Ngăn chặn leo thang đặc quyền (no-new-privileges):**
   - Khai báo cờ `security_opt: - no-new-privileges:true` cho toàn bộ các container trọng yếu, ngăn chặn các tiến trình con bên trong container chiếm quyền qua cơ chế SUID/SGID.
7. **Phòng chống SQL Injection ở tầng mã nguồn (Application Hardening):**
   - Nâng cấp 100% các truy vấn trong `backend/server.js` sang sử dụng Parameterized Queries (`$1, $2, $3...` thông qua thư viện `pg`), triệt tiêu hoàn toàn rủi ro tấn công SQL Injection.

---

## 📊 Hệ thống giám sát (Monitoring - Prometheus & Grafana)

Hệ thống được cấu hình tự động nạp cấu hình (**Provisioning**) Datasources và Dashboards:
- **Datasources tự động:** Prometheus (`http://prometheus:9090`) và Loki (`http://loki:3100`).
- **5 Dashboards chuyên biệt (thư mục *CRM Support System* trên Grafana):**
  1. **CRM Business & Ticket SLA Metrics (`crm-business-dashboard`)**: Theo dõi tổng số HTTP requests, lỗi 4xx/5xx, biểu đồ tròn phân bố Ticket theo Trạng thái (Status) & Mức độ ưu tiên (Priority/SLA), tốc độ truy vấn QPS thời gian thực.
  2. **PostgreSQL Database Overview (`postgres-database`)**: Trạng thái database (UP/DOWN), số lượng Active Connections, Buffer Cache Hit Ratio (%), dung lượng Database `crm_db`, tốc độ giao dịch (Commits & Rollbacks/giây).
  3. **Nginx Web Server Overview (`nginx-webserver`)**: Trạng thái Nginx, Active connections, số lượng Request/giây (QPS), Connection States (Reading/Writing/Waiting).
  4. **Container Monitoring (`Cadvisor exporter`)**: Theo dõi CPU, RAM, Network I/O, Disk usage của từng container.
  5. **Log Centralization (`Centralized Logging (Loki & LogQL)`)**: Giám sát log tập trung trực quan thời gian thực, biểu đồ tần suất log, phân tách log Nginx, Backend API, PostgreSQL và phát hiện log lỗi tự động.

---

## 📜 Hệ thống Log tập trung (Loki & Promtail + LogQL)

Promtail tự động phát hiện Docker socket, chuẩn hóa nhãn `service` và `container` của toàn bộ dịch vụ trong hệ thống `crm_*` để đẩy về Loki.

### 🔍 Bảng câu lệnh LogQL mẫu để Demo (Grafana Explore):
Vào **Grafana** (`http://localhost:3000`) -> **Explore** -> Chọn data source **Loki**, sau đó chạy các câu query sau:

| STT | Mục đích truy vấn | Câu lệnh LogQL | Giải thích kỹ thuật |
| :---: | :--- | :--- | :--- |
| **1** | **Xem toàn bộ Access Log của Nginx Reverse Proxy** | `{service="proxy"}` | Lọc toàn bộ luồng log từ Web Server Nginx (IP client, method, URL, status code). |
| **2** | **Xem log hoạt động của Backend API (Node.js)** | `{service="backend"}` | Giám sát các request RESTful API, sự kiện auth, xử lý ticket và logfmt. |
| **3** | **Lọc các request HTTP cụ thể (GET/POST)** | `{service="proxy"} \|= "GET"` | Dùng toán tử lọc chuỗi `\|= "GET"` để lọc các request lấy dữ liệu. |
| **4** | **Lọc lỗi truy cập HTTP 4xx hoặc 5xx** | `{service="proxy"} \|~ "HTTP/1.1\\\" [45]"` | Sử dụng Regex Filter `\|~` để tìm nhanh các lỗi Client (401, 403, 404) hoặc Server (500, 502). |
| **5** | **Xem log hoạt động của Database PostgreSQL** | `{service="db"}` | Theo dõi kết nối, truy vấn và trạng thái của PostgreSQL Server. |
| **6** | **Thống kê số lượng log theo từng dịch vụ** | `sum by (service) (count_over_time({job="crm_logs"}[1m]))` | Metric Query: Chuyển đổi dữ liệu Log thành biểu đồ thống kê lưu lượng log theo thời gian. |
| **7** | **Bộ lọc phát hiện cảnh báo và lỗi toàn hệ thống** | `{job="crm_logs"} \|~ "(?i)error\|warn\|fail\|fatal\|denied"` | Lọc tự động các dòng log chứa từ khóa lỗi trên toàn bộ các container. |

---

## 🌐 Danh sách các cổng truy cập (Access Points)

| Dịch vụ | URL Truy cập | Tài khoản / Mật khẩu / Ghi chú |
| :--- | :--- | :--- |
| **Website CRM (Nginx)** | [http://localhost:8088](http://localhost:8088) | Giao diện CRM Helpdesk & Quản lý Ticket |
| **pgAdmin 4** | [http://localhost:8086](http://localhost:8086) | User: `admin@crm.com`<br>Pass: `PgAdmin_Adm1n_Sec2026!` |
| **Grafana** | [http://localhost:3000](http://localhost:3000) | User: `admin`<br>Pass: `Grafana_Adm1n_Sec2026!` (5 Dashboards sẵn sàng) |
| **Prometheus** | [http://localhost:9090](http://localhost:9090) | Quản lý metrics và targets giám sát |
| **cAdvisor** | [http://localhost:8082](http://localhost:8082) | Thông số tài nguyên container |
| **Loki API** | [http://localhost:3100](http://localhost:3100) | Cổng lưu trữ và truy vấn log tập trung |
| **Nginx Metrics** | [http://localhost:9113/metrics](http://localhost:9113/metrics) | Endpoint metrics Nginx |
| **PostgreSQL Metrics** | [http://localhost:9187/metrics](http://localhost:9187/metrics) | Endpoint metrics PostgreSQL |
| **CRM Backend Metrics** | [http://localhost:8088/metrics](http://localhost:8088/metrics) | Endpoint native metrics CRM |

---

## 👥 Danh sách tài khoản Demo đăng nhập Website CRM

| Tài khoản | Mật khẩu | Vai trò (Role) | Chức năng chính |
| :--- | :--- | :--- | :--- |
| **`admin`** | `Admin@123` | **Quản Trị Viên (admin)** | Toàn quyền quản trị hệ thống, quản lý SLA, phân công ticket, xem audit logs |
| **`agent01`** | `Agent@123` | **Nhân Viên CSKH (agent)** | Tiếp nhận ticket, cập nhật trạng thái (`in_progress`, `resolved`), ghi internal notes |
| *(Khách vãng lai)* | *(Không cần login)* | **Khách hàng** | Gửi ticket hỗ trợ trực tiếp từ form trên trang chủ |

---

## 🚀 Hướng dẫn vận hành

### Khởi chạy hệ thống
```bash
cd d:\TTCS\test\crm-project
docker compose up -d --build
```

### Dừng hệ thống
```bash
docker compose down
```
