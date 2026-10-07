/* =============================================================
   Quản trị (chỉ role = admin, tức Phòng HCNS)
   - Người dùng: thêm, đổi vai trò, khóa/mở
   - Văn bản: đặt mức người xem, đánh dấu hết hiệu lực
   - Nhật ký truy cập
   ============================================================= */
import express from 'express';
import { query, audit } from './db.js';
import { requireAdmin } from './auth.js';

const ROLES = ['viewer', 'manager', 'admin'];
const LEVELS = ['all', 'manager', 'admin'];
const str = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n));

export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/users', async (req, res) => {
  const r = await query(`SELECT u.id, u.email, u.full_name, u.department, u.role, u.is_active, u.created_at, u.last_login_at,
      (u.entra_oid IS NOT NULL) AS linked,
      (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS sessions
    FROM users u ORDER BY u.is_active DESC, u.full_name, u.email`);
  res.json(r.rows);
});

/* Đăng xuất người dùng khỏi mọi thiết bị (VD: nghi lộ máy, máy dùng chung) */
adminRouter.post('/users/:id/logout', async (req, res) => {
  const u = await query('SELECT email FROM users WHERE id = $1::uuid', [req.params.id]).catch(() => ({ rowCount: 0 }));
  if (!u.rowCount) return res.status(404).json({ error: 'not_found' });
  const r = await query('DELETE FROM sessions WHERE user_id = $1::uuid', [req.params.id]);
  await audit(req, 'admin_logout_user', { detail: { id: req.params.id, email: u.rows[0].email, sessions: r.rowCount } });
  res.json({ ok: true, sessions: r.rowCount });
});

/* Thêm hoặc cập nhật theo email (dùng khi AUTO_CREATE_USERS=false hoặc để cấp quyền trước) */
adminRouter.post('/users', async (req, res) => {
  const b = req.body || {};
  const email = str(b.email, 320)?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  const role = ROLES.includes(b.role) ? b.role : 'viewer';
  const r = await query(`INSERT INTO users (email, full_name, department, role) VALUES ($1, COALESCE($2, ''), $3, $4)
    ON CONFLICT (email) DO UPDATE SET full_name = COALESCE(NULLIF($2, ''), users.full_name),
      department = COALESCE($3, users.department), role = $4
    RETURNING id, email, full_name, department, role, is_active`, [email, str(b.full_name), str(b.department), role]);
  await audit(req, 'admin_user', { detail: { email, role } });
  res.status(201).json(r.rows[0]);
});

adminRouter.patch('/users/:id', async (req, res) => {
  const b = req.body || {};
  if (b.role != null && !ROLES.includes(b.role)) return res.status(400).json({ error: 'invalid_role' });
  // Không tự hạ quyền hoặc tự khóa mình (tránh mất quyền quản trị)
  if (req.params.id === req.user.id && ((b.role && b.role !== 'admin') || b.is_active === false)) return res.status(400).json({ error: 'self_lockout' });
  const r = await query(`UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active),
      full_name = COALESCE($4, full_name), department = COALESCE($5, department)
    WHERE id = $1::uuid RETURNING id, email, full_name, department, role, is_active`,
  [req.params.id, b.role || null, typeof b.is_active === 'boolean' ? b.is_active : null, str(b.full_name), str(b.department)]).catch(() => ({ rowCount: 0 }));
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  // Khóa tài khoản hoặc đổi vai trò: buộc đăng nhập lại
  if (b.is_active === false || b.role) await query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
  await audit(req, 'admin_user', { detail: Object.assign({ id: req.params.id, email: r.rows[0].email }, b) });
  res.json(r.rows[0]);
});

adminRouter.get('/documents', async (req, res) => {
  const r = await query('SELECT id, group_code, no, title, access_level, expired_reason, source_modified, updated_at FROM documents ORDER BY sort');
  res.json(r.rows);
});

adminRouter.patch('/documents/:id', async (req, res) => {
  const b = req.body || {};
  if (b.access_level != null && !LEVELS.includes(b.access_level)) return res.status(400).json({ error: 'invalid_level' });
  const r = await query(`UPDATE documents SET access_level = COALESCE($2, access_level),
      expired_reason = CASE WHEN $3::boolean THEN NULLIF($4, '') ELSE expired_reason END
    WHERE id = $1 RETURNING id, no, title, access_level, expired_reason`,
  [req.params.id, b.access_level || null, 'expired_reason' in b, str(b.expired_reason, 500)]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  await audit(req, 'edit_doc', { doc: req.params.id, detail: b });
  res.json(r.rows[0]);
});

/* Nhật ký: lọc theo thao tác, người (tên/email), văn bản, khoảng ngày (YYYY-MM-DD, giờ Việt Nam) */
adminRouter.get('/audit', async (req, res) => {
  const limit = Math.min(2000, parseInt(req.query.limit, 10) || 300);
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const r = await query(`SELECT a.id, a.at, a.action, a.document_id, a.file_path, a.detail, host(a.ip) AS ip,
      u.email, u.full_name, d.no AS doc_no, d.title AS doc_title
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN documents d ON d.id = a.document_id
    WHERE ($1::text IS NULL OR a.action = $1)
      AND ($2::text IS NULL OR u.email ILIKE '%' || $2 || '%' OR qc.fold(u.full_name) LIKE '%' || qc.fold($2) || '%')
      AND ($3::date IS NULL OR a.at >= ($3::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
      AND ($4::date IS NULL OR a.at < (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
      AND ($5::text IS NULL OR a.document_id = $5)
    ORDER BY a.at DESC LIMIT $6`,
  [str(req.query.action, 40) || null, str(req.query.q, 100) || null, day(req.query.from), day(req.query.to), str(req.query.doc, 100) || null, limit]);
  res.json(r.rows);
});

/* Số liệu nhanh cho trang quản trị */
adminRouter.get('/stats', async (req, res) => {
  const r = await query(`SELECT
      (SELECT count(*) FROM users WHERE is_active)::int AS active_users,
      (SELECT count(*) FROM users WHERE NOT is_active)::int AS locked_users,
      (SELECT count(DISTINCT user_id) FROM audit_log WHERE action = 'login' AND at > now() - interval '30 days')::int AS users_30d,
      (SELECT count(*) FROM audit_log WHERE action = 'download_file' AND at > now() - interval '30 days')::int AS downloads_30d,
      (SELECT count(*) FROM audit_log WHERE action = 'login_denied' AND at > now() - interval '30 days')::int AS denied_30d,
      (SELECT count(*) FROM documents WHERE access_level <> 'all')::int AS restricted_docs`);
  res.json(r.rows[0]);
});
