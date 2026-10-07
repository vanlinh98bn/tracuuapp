/* Cấu hình đọc từ biến môi trường (file .env khi chạy trên máy, Application settings trên Azure) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const list = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const bool = (s) => /^(1|true|yes)$/i.test(String(s || ''));
const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(env.PORT) || 3000,
  publicUrl: (env.PUBLIC_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/+$/, ''),
  production: env.NODE_ENV === 'production',
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET || '',
  sessionHours: Number(env.SESSION_HOURS) || 12,
  sessionRememberDays: Number(env.SESSION_REMEMBER_DAYS) || 30,
  entra: {
    tenantId: env.ENTRA_TENANT_ID || '',
    clientId: env.ENTRA_CLIENT_ID || '',
    clientSecret: env.ENTRA_CLIENT_SECRET || '',
  },
  allowedDomains: list(env.ALLOWED_EMAIL_DOMAINS || 'cattuongnew.vn'),
  autoCreateUsers: env.AUTO_CREATE_USERS == null ? true : bool(env.AUTO_CREATE_USERS),
  devLogin: bool(env.DEV_LOGIN),
  files: {
    driver: (env.FILES_DRIVER || 'local').toLowerCase(),
    dir: env.FILES_DIR || '',
    azureConnection: env.AZURE_STORAGE_CONNECTION_STRING || '',
    azureContainer: env.AZURE_STORAGE_CONTAINER || 'hcns',
  },
  // Thư mục giao diện: gói triển khai có backend/web/ (tools/dong-goi-azure.ps1); chạy trên máy dùng tra-cuu-quy-che/
  webDir: env.WEB_DIR ? path.resolve(env.WEB_DIR)
    : fs.existsSync(path.resolve(here, '..', 'web', 'server.html')) ? path.resolve(here, '..', 'web') : path.resolve(here, '..', '..'),
  company: { name: 'Cát Tường Homes', unit: 'Phòng Hành chính – Nhân sự', source: 'Thư mục HCNS' },
};

export const entraEnabled = () => !!(config.entra.tenantId && config.entra.clientId && config.entra.clientSecret);

export function checkConfig() {
  const errs = [];
  if (!config.databaseUrl) errs.push('Thiếu DATABASE_URL');
  if (config.sessionSecret.length < 32) errs.push('SESSION_SECRET phải dài ít nhất 32 ký tự');
  if (config.production && config.devLogin) errs.push('Không được bật DEV_LOGIN khi NODE_ENV=production');
  if (config.production && !entraEnabled()) errs.push('Thiếu cấu hình ENTRA_* (đăng nhập Microsoft 365)');
  if (!entraEnabled() && !config.devLogin) errs.push('Chưa có cách đăng nhập: điền ENTRA_* hoặc bật DEV_LOGIN=true để thử trên máy');
  if (errs.length) { errs.forEach((e) => console.error('Lỗi cấu hình: ' + e)); process.exit(1); }
}
