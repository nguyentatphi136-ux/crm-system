const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Biến môi trường và cấu hình
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'crm_jwt_super_secret_key_2026';
const SALT = process.env.PASSWORD_SALT || 'crm_salt_2026';

// Kết nối PostgreSQL Pool
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER || 'crm_user',
  password: process.env.DB_PASSWORD || 'secret123',
  database: process.env.DB_NAME || 'crm_db',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DATABASE ERROR] Lỗi bất ngờ trên client rảnh:', err);
});

// Hàm băm và kiểm tra mật khẩu an toàn bằng scrypt native
function hashPassword(password) {
  return crypto.scryptSync(password, SALT, 64).toString('hex');
}

function verifyPassword(password, storedHash) {
  const hash = crypto.scryptSync(password, SALT, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// Hàm ghi log có cấu trúc chuẩn logfmt cho Promtail / Loki
function logStructured(event, data = {}) {
  const ts = new Date().toISOString();
  let details = Object.entries(data)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join(' ');
  console.log(`time="${ts}" level="INFO" event="${event}" ${details}`);
}

// Đếm request cho Metrics
let requestCountTotal = 0;
let requestErrorTotal = 0;

app.use((req, res, next) => {
  requestCountTotal++;
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) requestErrorTotal++;
    const duration = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/metrics') {
      logStructured('http_request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        ip: req.ip
      });
    }
  });
  next();
});

// ========================================================
// MIDDLEWARE XÁC THỰC & PHÂN QUYỀN (JWT & RBAC)
// ========================================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    }
    req.user = user;
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || (req.user.role !== role && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  };
}

// ========================================================
// 1. HEALTH CHECK & METRICS ENDPOINTS
// ========================================================
app.get(['/health', '/api/health'], async (req, res) => {
  try {
    const dbRes = await pool.query('SELECT 1');
    res.json({
      status: 'UP',
      database: 'CONNECTED',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'DOWN',
      database: 'DISCONNECTED',
      error: err.message
    });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    const ticketStats = await pool.query(`
      SELECT 
        status, 
        priority, 
        COUNT(*) as count 
      FROM tickets 
      GROUP BY status, priority
    `);

    let metricsText = `# HELP crm_http_requests_total Total number of HTTP requests\n`;
    metricsText += `# TYPE crm_http_requests_total counter\n`;
    metricsText += `crm_http_requests_total ${requestCountTotal}\n\n`;

    metricsText += `# HELP crm_http_errors_total Total number of HTTP 4xx/5xx errors\n`;
    metricsText += `# TYPE crm_http_errors_total counter\n`;
    metricsText += `crm_http_errors_total ${requestErrorTotal}\n\n`;

    metricsText += `# HELP crm_tickets_by_status_priority Current ticket count grouped by status and priority\n`;
    metricsText += `# TYPE crm_tickets_by_status_priority gauge\n`;
    ticketStats.rows.forEach(r => {
      metricsText += `crm_tickets_by_status_priority{status="${r.status}",priority="${r.priority}"} ${r.count}\n`;
    });

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metricsText);
  } catch (err) {
    res.status(500).send('# ERROR collecting metrics: ' + err.message);
  }
});

// ========================================================
// 2. AUTHENTICATION ENDPOINTS
// ========================================================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      logStructured('login_failed', { username, reason: 'user_not_found' });
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }

    const user = result.rows[0];
    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      logStructured('login_failed', { username, reason: 'wrong_password' });
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    logStructured('login_success', { username: user.username, role: user.role });
    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ khi đăng nhập: ' + err.message });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ========================================================
// 3. CUSTOMER MANAGEMENT ENDPOINTS
// ========================================================
app.get('/api/customers', async (req, res) => {
  try {
    const query = `
      SELECT c.*, COUNT(t.id) as ticket_count
      FROM customers c
      LEFT JOIN tickets t ON c.id = t.customer_id
      GROUP BY c.id
      ORDER BY c.id DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  const { full_name, email, phone, company } = req.body;
  if (!full_name || !email) {
    return res.status(400).json({ error: 'Họ tên và email là thông tin bắt buộc.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customers (full_name, email, phone, company) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (email) DO UPDATE SET 
         full_name = EXCLUDED.full_name, 
         phone = COALESCE(EXCLUDED.phone, customers.phone),
         company = COALESCE(EXCLUDED.company, customers.company)
       RETURNING *`,
      [full_name, email, phone || null, company || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================
// 4. SLA POLICIES ENDPOINT
// ========================================================
app.get('/api/sla-policies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sla_policies ORDER BY response_hours ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================
// 5. TICKETS MANAGEMENT ENDPOINTS
// ========================================================
app.get('/api/tickets', async (req, res) => {
  const { status, priority, search } = req.query;
  let sql = `
    SELECT 
      t.id, t.title, t.description, t.priority, t.status, 
      t.sla_deadline, t.created_at, t.updated_at,
      c.id AS customer_id, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, c.company AS customer_company,
      u.full_name AS assigned_to_name,
      CASE WHEN (t.status != 'resolved' AND t.status != 'closed' AND CURRENT_TIMESTAMP > t.sla_deadline) THEN true ELSE false END AS is_breached
    FROM tickets t
    JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    params.push(status);
    sql += ` AND t.status = $${params.length}`;
  }
  if (priority) {
    params.push(priority);
    sql += ` AND t.priority = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (t.title ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
  }

  sql += ` ORDER BY t.created_at DESC`;

  try {
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const ticketRes = await pool.query(
      `SELECT t.*, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, c.company AS customer_company,
              u.full_name AS assigned_to_name,
              CASE WHEN (t.status != 'resolved' AND t.status != 'closed' AND CURRENT_TIMESTAMP > t.sla_deadline) THEN true ELSE false END AS is_breached
       FROM tickets t
       JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = $1`,
      [id]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy yêu cầu hỗ trợ (Ticket).' });
    }

    const historyRes = await pool.query(
      `SELECT th.*, u.full_name AS user_name
       FROM ticket_history th
       LEFT JOIN users u ON th.user_id = u.id
       WHERE th.ticket_id = $1
       ORDER BY th.created_at ASC`,
      [id]
    );

    res.json({
      ticket: ticketRes.rows[0],
      history: historyRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tạo ticket mới (Public hoặc Agent)
app.post('/api/tickets', async (req, res) => {
  const { title, description, priority = 'medium', customer_name, customer_email, customer_phone, customer_company } = req.body;

  if (!title || !customer_email || !customer_name) {
    return res.status(400).json({ error: 'Tiêu đề, Tên khách hàng và Email là bắt buộc.' });
  }

  const validPriorities = ['low', 'medium', 'high', 'urgent'];
  const safePriority = validPriorities.includes(priority) ? priority : 'medium';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Tìm hoặc tạo khách hàng
    const custRes = await client.query(
      `INSERT INTO customers (full_name, email, phone, company)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET 
         full_name = EXCLUDED.full_name, 
         phone = COALESCE(EXCLUDED.phone, customers.phone),
         company = COALESCE(EXCLUDED.company, customers.company)
       RETURNING id`,
      [customer_name, customer_email, customer_phone || null, customer_company || null]
    );
    const customer_id = custRes.rows[0].id;

    // 2. Tra cứu thời hạn SLA
    const slaRes = await client.query(
      'SELECT resolution_hours FROM sla_policies WHERE priority = $1',
      [safePriority]
    );
    const resolutionHours = slaRes.rows.length > 0 ? slaRes.rows[0].resolution_hours : 24;

    // 3. Tạo ticket với thời hạn SLA
    const ticketRes = await client.query(
      `INSERT INTO tickets (title, description, priority, status, customer_id, sla_deadline)
       VALUES ($1, $2, $3, 'open', $4, CURRENT_TIMESTAMP + ($5 || ' hours')::INTERVAL)
       RETURNING *`,
      [title, description || '', safePriority, customer_id, resolutionHours]
    );
    const newTicket = ticketRes.rows[0];

    // 4. Ghi nhận lịch sử khởi tạo
    await client.query(
      `INSERT INTO ticket_history (ticket_id, user_id, action, old_status, new_status, internal_note)
       VALUES ($1, NULL, 'created', NULL, 'open', 'Khách hàng gửi yêu cầu hỗ trợ qua cổng Web')`,
      [newTicket.id]
    );

    await client.query('COMMIT');

    logStructured('ticket_created', {
      ticket_id: newTicket.id,
      priority: safePriority,
      customer_email
    });

    res.status(201).json(newTicket);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Lỗi khi tạo ticket: ' + err.message });
  } finally {
    client.release();
  }
});

// Cập nhật trạng thái ticket (Nhận xử lý, Hoàn thành, Đóng ticket)
// Sử dụng Database Transaction và SELECT ... FOR UPDATE chống Race Condition
app.patch('/api/tickets/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, internal_note } = req.body;

  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Khóa dòng dữ liệu an toàn
    const checkRes = await client.query(
      'SELECT * FROM tickets WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket không tồn tại.' });
    }

    const currentTicket = checkRes.rows[0];
    const oldStatus = currentTicket.status;

    // Cập nhật người phụ trách nếu đang nhận ticket
    let assignedTo = currentTicket.assigned_to;
    if (status === 'in_progress' && !assignedTo) {
      assignedTo = req.user.id;
    }

    const updateRes = await client.query(
      `UPDATE tickets 
       SET status = $1, assigned_to = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 
       RETURNING *`,
      [status, assignedTo, id]
    );

    // Ghi nhận nhật ký lịch sử kiểm toán
    await client.query(
      `INSERT INTO ticket_history (ticket_id, user_id, action, old_status, new_status, internal_note)
       VALUES ($1, $2, 'status_change', $3, $4, $5)`,
      [id, req.user.id, oldStatus, status, internal_note || `Đổi trạng thái từ ${oldStatus} sang ${status}`]
    );

    await client.query('COMMIT');

    logStructured('ticket_status_changed', {
      ticket_id: id,
      user_id: req.user.id,
      from_status: oldStatus,
      to_status: status
    });

    res.json(updateRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái ticket: ' + err.message });
  } finally {
    client.release();
  }
});

// ========================================================
// 6. DASHBOARD STATISTICS ENDPOINT
// ========================================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const statsQuery = await pool.query(`
      SELECT
        COUNT(*) AS total_tickets,
        COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_tickets,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress_tickets,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) AS resolved_tickets,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) AS closed_tickets,
        COUNT(CASE WHEN priority = 'urgent' AND status IN ('open', 'in_progress') THEN 1 END) AS urgent_unresolved,
        COUNT(CASE WHEN status NOT IN ('resolved', 'closed') AND CURRENT_TIMESTAMP > sla_deadline THEN 1 END) AS sla_breached
      FROM tickets
    `);

    const customerCountQuery = await pool.query('SELECT COUNT(*) AS total_customers FROM customers');

    res.json({
      ...statsQuery.rows[0],
      total_customers: customerCountQuery.rows[0].total_customers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Khởi chạy máy chủ HTTP
app.listen(PORT, () => {
  console.log(`[CRM Backend Service] Đang chạy tại cổng ${PORT}`);
});
