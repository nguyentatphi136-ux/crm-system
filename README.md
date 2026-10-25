# Hệ Thống CRM Chăm Sóc Khách Hàng (Customer Support CRM)
**Học phần:** Triển khai và Quản trị Hệ thống Phần mềm  
**Đề tài:** Đề 4 — Hệ thống CRM Chăm sóc Khách hàng  
**Giai đoạn:** Giai đoạn 1 — Web App CRM + CSDL PostgreSQL + Nginx Reverse Proxy  

---

## 1. Giới thiệu tổng quan
Hệ thống **Nexus CRM** là giải pháp tiếp nhận, phân loại và quản trị vòng đời yêu cầu hỗ trợ (Ticket Management) theo kiến trúc Container hóa Microservices bằng Docker. Dự án đáp ứng các tiêu chuẩn kỹ thuật:
- **Tiếp nhận & Phân loại Ticket:** Quản lý quy trình `open` → `in_progress` → `resolved` → `closed`.
- **Tự động hóa SLA:** Cam kết thời hạn chất lượng dịch vụ theo 4 mức ưu tiên (Khẩn cấp: 4h, Cao: 8h, Trung bình: 24h, Thấp: 48h).
- **Hồ sơ Khách hàng (Customer 360):** Quản lý tập trung thông tin đối tác và lịch sử tương tác.
- **Lịch sử kiểm toán (Audit Trail):** Ghi nhận chi tiết mọi thay đổi trên từng ticket.
- **Phân quyền theo vai trò (RBAC):** Khách hàng vãng lai, Nhân viên CSKH (`agent`), Quản trị viên (`admin`).
- **Bảo mật cổng vào:** Nginx Reverse Proxy trang bị 7 HTTP Security Headers, ẩn `server_tokens` và backend technology.

---

## 2. Kiến trúc Giai đoạn 1 (5 Dịch vụ cốt lõi)
1. **`crm_proxy` (Nginx Reverse Proxy):** Tiếp nhận toàn bộ lưu lượng cổng 8088, chuyển hướng traffic vào Frontend và Backend API.
2. **`crm_frontend` (SPA Web Dashboard):** Giao diện người dùng hiện đại, tối ưu trải nghiệm chăm sóc khách hàng.
3. **`crm_backend` (Node.js RESTful API):** Xử lý nghiệp vụ CRM, JWT authentication, kiểm toán ticket, non-root user `node`.
4. **`crm_db` (PostgreSQL 15 Alpine):** CSDL quan hệ lưu trữ khách hàng, người dùng, chính sách SLA, tickets và nhật ký.
5. **`crm_pgadmin` (pgAdmin 4):** Giao diện trực quan quản trị CSDL qua cổng 8086.

---

## 3. Hướng dẫn cài đặt & Khởi chạy Giai đoạn 1
```bash
# 1. Tạo tệp cấu hình môi trường từ mẫu
cp .env.example .env

# 2. Khởi chạy 5 dịch vụ cốt lõi
docker compose up -d

# 3. Kiểm tra trạng thái các container
docker compose ps
```

- **Giao diện Web CRM:** [http://localhost:8088](http://localhost:8088)
- **Quản trị pgAdmin 4:** [http://localhost:8086](http://localhost:8086)
- **Tài khoản Demo CSKH:**
  - `admin` / `Admin@123` (Quản trị viên)
  - `agent01` / `Agent@123` (Nhân viên CSKH)
