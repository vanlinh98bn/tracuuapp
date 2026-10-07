/* =============================================================
   Máy chủ web Tra cứu Quy chế – Cát Tường Homes
   Chạy trên máy:   npm run local      (đọc file .env)
   Trên Azure:      npm start          (biến môi trường ở Application settings)
   ============================================================= */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { config, checkConfig, entraEnabled } from './config.js';
import { query } from './db.js';
import { authRouter, loadUser, startSessionCleanup } from './auth.js';
import { contentRouter } from './content.js';
import { feedbackRouter } from './feedback.js';
import { adminRouter } from './admin.js';

checkConfig();
const app = express();
app.set('trust proxy', 1);          // Azure App Service đứng sau proxy HTTPS
app.disable('x-powered-by');
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",               // html2pdf khi xuất PDF
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '));
  if (config.publicUrl.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

app.get('/healthz', async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

/* ---------- API ---------- */
app.use(express.json({ limit: '100kb' }));
app.use(loadUser);
// Chống gửi yêu cầu giả từ trang khác: thao tác thay đổi dữ liệu phải gửi JSON
app.use(['/api', '/auth/logout'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) return res.status(415).json({ error: 'json_required' });
  next();
});
app.use('/auth', authRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/admin', adminRouter);
app.use('/api', contentRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

/* ---------- Giao diện: chỉ phục vụ đúng các file được phép ---------- */
const web = config.webDir;
const JS = new Set(['auth-server.js', 'normalize.js', 'app.js', 'export.js', 'feedback.js', 'admin.js']);
const staticOpts = { index: false, dotfiles: 'deny', fallthrough: false, maxAge: '1h' };
// Trang chính: gắn số phiên bản (thời điểm sửa file) vào link CSS để trình duyệt không dùng CSS cũ đã lưu
app.get('/', (req, res) => {
  const css = fs.statSync(path.join(web, 'css', 'style.css')).mtimeMs.toString(36).replace('.', '');
  const html = fs.readFileSync(path.join(web, 'server.html'), 'utf8').replace('href="css/style.css"', `href="css/style.css?v=${css}"`);
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
});
// CSS luôn kiểm tra bản mới (như JS): tránh trình duyệt dùng CSS cũ với JS mới sau mỗi lần cập nhật giao diện
app.use('/css', express.static(path.join(web, 'css'), Object.assign({}, staticOpts, { maxAge: 0, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') })));
app.use('/assets', express.static(path.join(web, 'assets'), staticOpts));
app.get('/js/:name', (req, res, next) => {
  if (!JS.has(req.params.name)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(web, 'js', req.params.name));
});
app.use((req, res) => res.status(404).type('text').send('Không tìm thấy'));

app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.destroy();
  res.status(status).json({ error: status >= 500 ? 'server_error' : err.type || 'bad_request' });
});

startSessionCleanup();
app.listen(config.port, () => {
  console.log(`Tra cứu Quy chế đang chạy: ${config.publicUrl}`);
  console.log(`Đăng nhập: ${entraEnabled() ? 'Microsoft 365' : ''}${entraEnabled() && config.devLogin ? ' + ' : ''}${config.devLogin ? 'đăng nhập thử (DEV_LOGIN)' : ''}`);
  console.log(`File gốc: ${config.files.driver === 'azure' ? 'Azure Blob Storage' : config.files.dir || '(chưa cấu hình FILES_DIR)'}`);
});
