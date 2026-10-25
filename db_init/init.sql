-- ========================================================
-- HỆ THỐNG CRM CHĂM SÓC KHÁCH HÀNG - DATABASE SCHEMA
-- ========================================================

-- 1. Bảng Khách hàng
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    company VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng Người dùng hệ thống (Nhân viên CSKH & Admin)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Bảng Chính sách SLA
CREATE TABLE IF NOT EXISTS sla_policies (
    priority VARCHAR(20) PRIMARY KEY CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    response_hours INT NOT NULL CHECK (response_hours > 0),
    resolution_hours INT NOT NULL CHECK (resolution_hours > 0),
    description VARCHAR(255)
);

-- 4. Bảng Yêu cầu hỗ trợ (Tickets)
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium' REFERENCES sla_policies(priority),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
    sla_deadline TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Bảng Lịch sử xử lý & Kiểm toán
CREATE TABLE IF NOT EXISTS ticket_history (
    id SERIAL PRIMARY KEY,
    ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    internal_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================
-- DỮ LIỆU MẪU BAN ĐẦU (SEED DATA - IDEMPOTENT)
-- ========================================================

-- Cài đặt chính sách SLA
INSERT INTO sla_policies (priority, response_hours, resolution_hours, description)
VALUES 
('urgent', 1, 4, 'Sự cố tê liệt dịch vụ, yêu cầu xử lý khẩn cấp trong 4h'),
('high', 2, 8, 'Lỗi chức năng quan trọng ảnh hưởng trực tiếp đến người dùng'),
('medium', 4, 24, 'Yêu cầu hỗ trợ kỹ thuật và giải đáp thắc mắc thông thường'),
('low', 8, 48, 'Ý kiến đóng góp, thắc mắc về tính năng hoặc tài liệu')
ON CONFLICT (priority) DO NOTHING;

-- Tài khoản người dùng (Mật khẩu: Admin@123 và Agent@123 mã hóa scrypt)
INSERT INTO users (username, password_hash, full_name, role)
VALUES 
('admin', '9b3ca1874f6015db2209826ea379f50d7cbfd86aa01b8dca7c0c3697a52b914f42b279cb2df47c370591cf9317250ee0afa2bdf08200122070c4c4878459893a', 'Quản Trị Viên Hệ Thống', 'admin'),
('agent01', 'aa32be76c05f5e033ba076427189e0b24446c1d2a15ef8f9f51f9e869975b1c06ba9123bc7af940d32a32e6c4c65b1273cdb7342f2aa4f41ace341e9a9bdac74', 'Nguyễn Thị Bích (CSKH)', 'agent')
ON CONFLICT (username) DO NOTHING;

-- Khách hàng mẫu
INSERT INTO customers (full_name, email, phone, company)
VALUES 
('Nguyễn Văn An', 'an.nguyen@techcorp.vn', '0912345678', 'TechCorp Solutions'),
('Trần Thị Mai', 'mai.tran@vinatex.com', '0988776655', 'Vinatex Logistics'),
('Lê Hoàng Long', 'long.le@fpt.vn', '0933445566', 'FPT Software')
ON CONFLICT (email) DO NOTHING;

-- Tickets mẫu đa dạng trạng thái và mức độ ưu tiên
INSERT INTO tickets (title, description, priority, status, customer_id, assigned_to, sla_deadline)
SELECT 
    'Không nhận được mã xác thực OTP qua SMS', 
    'Khách hàng đăng nhập cổng thanh toán nhưng không nhận được mã xác nhận OTP qua số điện thoại đăng ký.', 
    'urgent', 
    'open', 
    c.id, 
    NULL,
    CURRENT_TIMESTAMP + INTERVAL '4 hours'
FROM customers c WHERE c.email = 'an.nguyen@techcorp.vn'
AND NOT EXISTS (SELECT 1 FROM tickets WHERE title = 'Không nhận được mã xác thực OTP qua SMS');

INSERT INTO tickets (title, description, priority, status, customer_id, assigned_to, sla_deadline)
SELECT 
    'Yêu cầu cấp lại hóa đơn VAT điện tử tháng 10', 
    'Kế toán công ty cần xuất hóa đơn VAT điện tử dịch vụ phần mềm kỳ thanh toán tháng 10/2026.', 
    'medium', 
    'in_progress', 
    c.id, 
    u.id,
    CURRENT_TIMESTAMP + INTERVAL '24 hours'
FROM customers c, users u WHERE c.email = 'mai.tran@vinatex.com' AND u.username = 'agent01'
AND NOT EXISTS (SELECT 1 FROM tickets WHERE title = 'Yêu cầu cấp lại hóa đơn VAT điện tử tháng 10');

INSERT INTO tickets (title, description, priority, status, customer_id, assigned_to, sla_deadline)
SELECT 
    'Tư vấn nâng cấp gói tài khoản Doanh nghiệp', 
    'Khách hàng có nhu cầu mở rộng quy mô nhóm làm việc lên 50 người, cần bảng báo giá chi tiết.', 
    'low', 
    'resolved', 
    c.id, 
    u.id,
    CURRENT_TIMESTAMP - INTERVAL '2 hours'
FROM customers c, users u WHERE c.email = 'long.le@fpt.vn' AND u.username = 'agent01'
AND NOT EXISTS (SELECT 1 FROM tickets WHERE title = 'Tư vấn nâng cấp gói tài khoản Doanh nghiệp');

-- Nhật ký lịch sử ban đầu
INSERT INTO ticket_history (ticket_id, user_id, action, old_status, new_status, internal_note)
SELECT t.id, NULL, 'created', NULL, 'open', 'Khách hàng khởi tạo yêu cầu qua giao diện Web'
FROM tickets t WHERE t.title = 'Không nhận được mã xác thực OTP qua SMS'
AND NOT EXISTS (SELECT 1 FROM ticket_history th WHERE th.ticket_id = t.id);

INSERT INTO ticket_history (ticket_id, user_id, action, old_status, new_status, internal_note)
SELECT t.id, u.id, 'assigned', 'open', 'in_progress', 'Nhân viên tiếp nhận xử lý và liên hệ phòng Kế toán'
FROM tickets t, users u WHERE t.title = 'Yêu cầu cấp lại hóa đơn VAT điện tử tháng 10' AND u.username = 'agent01'
AND NOT EXISTS (SELECT 1 FROM ticket_history th WHERE th.ticket_id = t.id);

-- Cấp quyền giám sát hiệu năng cho exporter
GRANT pg_monitor TO crm_user;

