import pg from 'pg';
import { config } from './config.js';

// DATE trả về dạng 'YYYY-MM-DD' như dữ liệu cũ, không đổi sang Date theo múi giờ
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  options: '-c search_path=qc,public',
});
pool.on('error', (e) => console.error('PostgreSQL:', e.message));

export const query = (text, params) => pool.query(text, params);

export async function audit(req, action, extra = {}) {
  try {
    await query(
      'INSERT INTO audit_log (user_id, action, document_id, file_path, detail, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user ? req.user.id : extra.userId || null, action, extra.doc || null, extra.file || null,
        extra.detail ? JSON.stringify(extra.detail) : null, clientIp(req)],
    );
  } catch (e) { console.error('Ghi nhật ký lỗi:', e.message); }
}

export function clientIp(req) {
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  return /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}
