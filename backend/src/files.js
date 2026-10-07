/* =============================================================
   File gốc Word/Excel trong thư mục HCNS
   - local: đọc thẳng từ FILES_DIR (máy nội bộ)
   - azure: Azure Blob Storage. Tải nguyên thư mục HCNS lên container (giữ
     đường dẫn), khóa blob = đường dẫn tương đối; storage_key dùng khi khác.
   ============================================================= */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/* Mã file ổn định theo đường dẫn, không lộ tên thư mục trên link tải */
export const fileId = (p) => crypto.createHash('sha256').update('qc-file:' + p).digest('hex').slice(0, 24);

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};
export const mimeOf = (ext) => MIME[String(ext).toLowerCase()] || 'application/octet-stream';

/* Đường dẫn trên ổ đĩa, chặn thoát ra ngoài FILES_DIR */
function localPath(rel) {
  if (!config.files.dir) return null;
  const root = path.resolve(config.files.dir);
  const full = path.resolve(root, rel);
  return full.startsWith(root + path.sep) ? full : null;
}

let container;
async function blobContainer() {
  if (!container) {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    container = BlobServiceClient.fromConnectionString(config.files.azureConnection).getContainerClient(config.files.azureContainer);
  }
  return container;
}

/* File có sẵn để tải không (không kiểm tra quyền) */
export function available(f) {
  if (f.is_private) return false;
  if (config.files.driver === 'azure') return !!config.files.azureConnection;
  const p = localPath(f.path);
  return !!p && fs.existsSync(p);
}

/* Trả về stream nội dung file */
export async function openStream(f) {
  if (config.files.driver === 'azure') {
    const dl = await (await blobContainer()).getBlobClient(f.storage_key || f.path).download();
    return dl.readableStreamBody;
  }
  return fs.createReadStream(localPath(f.path));
}
