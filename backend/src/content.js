/* =============================================================
   Nội dung cho giao diện: trả đúng dạng dữ liệu cũ (window.RAW_DOCS, CATALOG…)
   nhưng chỉ gồm những gì người dùng được xem.
   - Văn bản hạn chế (access_level) bị ẩn kèm file gốc, biểu mẫu trong form_dir,
     điều khoản chủ đề và câu tra cứu nhanh trỏ tới nó.
   - File riêng tư chỉ có tên, không có nội dung, không tải được.
   ============================================================= */
import express from 'express';
import { config } from './config.js';
import { query, audit } from './db.js';
import { requireUser } from './auth.js';
import { fileId, available, openStream, mimeOf } from './files.js';

/* Văn bản người dùng KHÔNG được xem: id + thư mục biểu mẫu */
async function hiddenDocs(userId) {
  const r = await query('SELECT id, form_dir FROM documents WHERE id NOT IN (SELECT id FROM visible_documents($1))', [userId]);
  return r.rows;
}

/* Danh sách file người dùng được thấy (kể cả file riêng tư – chỉ tên) */
async function visibleFiles(userId) {
  const hidden = await hiddenDocs(userId);
  const ids = new Set(hidden.map((d) => d.id));
  const dirs = hidden.map((d) => d.form_dir).filter(Boolean);
  const r = await query('SELECT * FROM source_files ORDER BY path');
  return r.rows.filter((f) => !ids.has(f.document_id) && !dirs.some((dir) => f.path.startsWith(dir)));
}

const omitEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));

export async function buildGlobals(user) {
  const [groups, docs, files, topics, tdocs, trefs, qtopics, quick, upd] = await Promise.all([
    query('SELECT * FROM doc_groups ORDER BY sort'),
    query('SELECT * FROM visible_documents($1) ORDER BY sort', [user.id]),
    visibleFiles(user.id),
    query('SELECT * FROM topics ORDER BY sort'),
    query('SELECT * FROM topic_documents ORDER BY sort'),
    query('SELECT * FROM topic_refs ORDER BY sort'),
    query('SELECT * FROM quick_topics ORDER BY sort'),
    query('SELECT * FROM quick_questions WHERE is_active ORDER BY sort'),
    query(`SELECT to_char(max(updated_at) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS t FROM documents`),
  ]);
  const seen = new Set(docs.rows.map((d) => d.id));
  const okDoc = (id) => !id || seen.has(id);
  const shown = files.filter((f) => !f.is_private).map((f) => f.path);
  const sheets = shown.length
    ? (await query('SELECT s.*, f.source_modified FROM sheets s JOIN source_files f ON f.path = s.file_path WHERE s.file_path = ANY($1) ORDER BY s.file_path, s.idx', [shown])).rows
    : [];

  const RAW_SHEETS = {};
  sheets.forEach((s) => {
    const e = RAW_SHEETS[s.file_path] || (RAW_SHEETS[s.file_path] = { modified: s.source_modified, sheets: [] });
    e.sheets.push({ name: s.name, rows: s.rows, truncated: s.truncated });
  });
  const FILE_BLOBS = {};
  files.filter((f) => /^xls/.test(f.ext) && available(f)).forEach((f) => { FILE_BLOBS[f.path] = { id: fileId(f.path), name: f.name, kb: f.size_kb }; });

  return {
    COMPANY: config.company,
    RAW_UPDATED: upd.rows[0].t,
    GROUPS: Object.fromEntries(groups.rows.map((g) => [g.code, omitEmpty({ name: g.name, desc: g.description, color: g.color })])),
    CATALOG: docs.rows.map((d) => omitEmpty(Object.assign({
      id: d.id, group: d.group_code, no: d.no, title: d.title, file: d.source_path, summary: d.summary,
      tags: d.tags, notes: d.notes, date: d.issued_label, expired: d.expired_reason, formDir: d.form_dir, parent: d.parent_id,
    }, d.render_opts))),
    RAW_DOCS: Object.fromEntries(docs.rows.filter((d) => d.source_path && d.blocks).map((d) => [d.source_path, { modified: d.source_modified, blocks: d.blocks }])),
    RAW_FILES: files.map((f) => ({ path: f.path, kb: f.size_kb, ext: f.ext, private: f.is_private })),
    RAW_SHEETS,
    FILE_BLOBS,
    TOPICS: Object.fromEntries(topics.rows.map((t) => [t.code, omitEmpty({
      name: t.name, color: t.color, icon: t.icon, q: t.search_q, desc: t.description, note: t.note,
      docs: tdocs.rows.filter((x) => x.topic_code === t.code && seen.has(x.document_id)).map((x) => x.document_id),
      refs: trefs.rows.filter((x) => x.topic_code === t.code && seen.has(x.document_id)).map((x) => ({ doc: x.document_id, find: x.find, label: x.label })),
    })])),
    QUICK_TOPICS: Object.fromEntries(qtopics.rows.map((t) => [t.code, t.name])),
    QUICK: quick.rows.filter((x) => okDoc(x.document_id)).map((x) => omitEmpty({ topic: x.topic_code, q: x.question, a: x.answer, doc: x.document_id, find: x.find })),
  };
}

export const contentRouter = express.Router();
contentRouter.use(requireUser);

contentRouter.get('/me', (req, res) => {
  const u = req.user;
  res.json({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role, department: u.department });
});

contentRouter.get('/bootstrap', async (req, res) => {
  const globals = await buildGlobals(req.user);
  await audit(req, 'load');
  res.json({ globals });
});

/* Tải file gốc: kiểm tra lại quyền ở máy chủ, không tin dữ liệu phía trình duyệt */
contentRouter.get('/files/:id', async (req, res) => {
  if (!/^[0-9a-f]{24}$/.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const f = (await visibleFiles(req.user.id)).find((x) => fileId(x.path) === req.params.id);
  if (!f || !available(f)) return res.status(404).json({ error: 'not_found' });
  const stream = await openStream(f);
  await audit(req, 'download_file', { doc: f.document_id, file: f.path });
  res.setHeader('Content-Type', mimeOf(f.ext));
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  stream.on('error', (e) => { console.error('Đọc file lỗi:', e.message); res.destroy(e); });
  stream.pipe(res);
});
