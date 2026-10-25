# Hệ Thống CRM Chăm Sóc Khách Hàng (Customer Support CRM)
**Học phần:** Triển khai và Quản trị Hệ thống Phần mềm  
**Đề tài:** Đề 4 — Hệ thống CRM Chăm sóc Khách hàng  
**Giai đoạn:** Giai đoạn 2 — Tích hợp Hệ thống Giám sát Prometheus & Grafana  

---

## 1. Giới thiệu tổng quan
Hệ thống **Nexus CRM** là giải pháp tiếp nhận, phân loại và quản trị vòng đời yêu cầu hỗ trợ (Ticket Management) theo kiến trúc Container hóa Microservices bằng Docker. Dự án đáp ứng các tiêu chuẩn kỹ thuật:
- **Tiếp nhận & Phân loại Ticket:** Quản lý quy trình `open` → `in_progress` → `resolved` → `closed`.
- **Tự động hóa SLA:** Cam kết thời hạn chất lượng dịch vụ theo 4 mức ưu tiên (Khẩn cấp: 4h, Cao: 8h, Trung bình: 24h, Thấp: 48h).
- **Hồ sơ Khách hàng (Customer 360):** Quản lý tập trung thông tin đối tác và lịch sử tương tác.
- **Giám sát thời gian thực:** Thu thập metrics hệ thống, container, web server, CSDL và các chỉ số nghiệp vụ ticket theo chu kỳ 15s.

---

## 2. Kiến trúc Giai đoạn 2 (10 Dịch vụ)
1. **`crm_proxy` (Nginx Reverse Proxy):** Tiếp nhận toàn bộ lưu lượng cổng 8088, trang bị 7 HTTP Security Headers.
2. **`crm_frontend` (SPA Web Dashboard):** Giao diện người dùng hiện đại, tối ưu trải nghiệm chăm sóc khách hàng.
3. **`crm_backend` (Node.js RESTful API):** Xử lý nghiệp vụ CRM, JWT authentication, non-root user `node`.
4. **`crm_db` (PostgreSQL 15 Alpine):** CSDL quan hệ lưu trữ dữ liệu CRM.
5. **`crm_pgadmin` (pgAdmin 4):** Quản trị CSDL trực quan trên nền web.
6. **`crm_prometheus` (Prometheus):** Thu thập dữ liệu chỉ số từ 5 targets (Backend API, PostgreSQL, Nginx, cAdvisor, Prometheus).
7. **`crm_grafana` (Grafana):** Hệ thống trực quan hóa với 4 Dashboards cấu hình tự động (Provisioning).
8. **`crm_postgres_exporter`:** Thu thập chỉ số kết nối, cache hit ratio, transactions của CSDL PostgreSQL.
9. **`crm_nginx_exporter`:** Thu thập chỉ số request, active connections từ endpoint `/stub_status`.
10. **`crm_cadvisor`:** Giám sát tài nguyên phần cứng (CPU, RAM, Network I/O) của tất cả containers.

---

## 3. Danh sách 4 Dashboards Grafana tự động nạp sẵn
Truy cập [http://localhost:3000](http://localhost:3000) (User: `admin` / Password: `${GF_SECURITY_ADMIN_PASSWORD}`):
1. **CRM Business & Ticket SLA Metrics:** Biểu đồ donut trạng thái ticket, mức độ ưu tiên, QPS và vi phạm SLA.
2. **PostgreSQL Database Overview:** Active connections, Buffer cache hit ratio, commit rate, kích thước CSDL.
3. **Nginx Web Server Metrics:** QPS, active connections, trạng thái đọc/ghi/chờ của Nginx.
4. **Cadvisor exporter:** CPU, RAM, Network I/O của toàn bộ 10 container.

---

## 4. Hướng dẫn khởi chạy Giai đoạn 2
```bash
# Khởi chạy toàn bộ 10 dịch vụ bằng file compose mở rộng
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Kiểm tra trạng thái các container
docker compose ps
```
