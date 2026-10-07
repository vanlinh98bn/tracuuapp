/* =============================================================
   Góp ý: mỗi người thấy góp ý của mình; HCNS (admin) thấy tất cả và trả lời.
   Dữ liệu trả về giữ dạng cũ của js/feedback.js để giao diện không phải đổi.
   ============================================================= */
import express from 'express';
import { query, audit } from './db.js';
import { requireUser, requireAdmin } from './auth.js';

const TYPES = ['noi-dung', 'cau-hoi', 'loi-web', 'de-xuat', 'huu-ich'];
const STATUS = ['moi', 'dang-xu-ly', 'xong'];
const MAX = 2000;

const item = (f) => ({
  id: String(f.id), uid: f.user_id, type: f.type, doc: f.document_id || '', text: f.content,
  rating: f.rating || 0, at: f.created_at.toISOString(), account: f.full_name || f.email || '',
  status: f.status, reply: f.reply || '', repliedAt: f.replied_at ? f.replied_at.toISOString() : '', repliedBy: f.replied_by || '',
  name: f.full_name || f.email || '',
});
/* "Đánh giá hữu ích" dùng khóa h-<văn bản> như bản cũ (mỗi người một lượt/văn bản) */
const key = (x) => (x.type === 'huu-ich' ? 'h-' + x.doc : x.id);
const SELECT = 'SELECT f.*, u.full_name, u.email FROM feedback f JOIN users u ON u.id = f.user_id';

export const feedbackRouter = express.Router();
feedbackRouter.use(requireUser);

feedbackRouter.get('/', async (req, res) => {
  const mine = (await query(SELECT + ' WHERE f.user_id = $1 ORDER BY f.created_at', [req.user.id])).rows.map(item);
  const out = { admin: req.user.role === 'admin', uid: req.user.id, mine: Object.fromEntries(mine.map((x) => [key(x), x])) };
  if (out.admin) out.all = (await query(SELECT + ' ORDER BY f.created_at')).rows.map(item);
  res.json(out);
});

feedbackRouter.post('/', async (req, res) => {
  const b = req.body || {};
  const type = String(b.type || '');
  const text = String(b.text || '').trim().slice(0, MAX);
  const rating = Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0));
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'invalid_type' });
  if (text.length < (type === 'huu-ich' ? 1 : 5)) return res.status(400).json({ error: 'invalid_text' });
  // Chỉ gắn văn bản người dùng được xem
  let doc = b.doc ? String(b.doc) : null;
  if (doc && !(await query('SELECT 1 FROM visible_documents($1) WHERE id = $2', [req.user.id, doc])).rowCount) doc = null;
  if (type === 'huu-ich') {
    if (!doc) return res.status(400).json({ error: 'invalid_doc' });
    const old = await query(SELECT + ' WHERE f.user_id = $1 AND f.type = \'huu-ich\' AND f.document_id = $2', [req.user.id, doc]);
    if (old.rows[0]) return res.json(item(old.rows[0]));
  }
  const ins = await query(`INSERT INTO feedback (user_id, type, document_id, content, rating, status)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [req.user.id, type, doc, text, rating, type === 'huu-ich' ? 'xong' : 'moi']);
  await audit(req, 'feedback', { doc, detail: { id: ins.rows[0].id, type } });
  res.status(201).json(item((await query(SELECT + ' WHERE f.id = $1', [ins.rows[0].id])).rows[0]));
});

feedbackRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  if (!id) return res.status(404).json({ error: 'not_found' });
  if (b.status != null && !STATUS.includes(b.status)) return res.status(400).json({ error: 'invalid_status' });
  const reply = b.reply != null ? String(b.reply).trim().slice(0, MAX) : null;
  const r = await query(`UPDATE feedback SET status = COALESCE($2, status),
      reply = CASE WHEN $3::text IS NULL THEN reply ELSE NULLIF($3, '') END,
      replied_by = CASE WHEN $3::text IS NULL THEN replied_by ELSE $4 END,
      replied_at = CASE WHEN $3::text IS NULL THEN replied_at ELSE now() END
    WHERE id = $1 RETURNING id`, [id, b.status || null, reply, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  await audit(req, 'reply_feedback', { detail: { id, status: b.status || null } });
  res.json(item((await query(SELECT + ' WHERE f.id = $1', [id])).rows[0]));
});
