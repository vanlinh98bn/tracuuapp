-- =============================================================
--  Cơ sở dữ liệu Tra cứu Quy chế – Cát Tường Homes
--  PostgreSQL 14+ (Azure Database for PostgreSQL Flexible Server,
--  Supabase hoặc máy chủ riêng).
--
--  Chạy một lần khi tạo database mới:
--     psql "<chuỗi kết nối>" -f schema.sql
--  Sau đó nạp dữ liệu:  psql "<chuỗi kết nối>" -f seed.sql
--
--  Azure: trước khi chạy, vào Server parameters → azure.extensions,
--  bật UNACCENT và PG_TRGM.
-- =============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS qc;
SET search_path = qc, public;

-- ---------- Hàm tìm kiếm tiếng Việt: bỏ dấu, chữ thường ----------
-- "Nghỉ phép" → "nghi phep", để gõ có dấu hay không dấu đều tìm được.
CREATE OR REPLACE FUNCTION qc.fold(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  SET search_path = public, extensions
AS $$ SELECT lower(unaccent('unaccent', t)) $$;

CREATE OR REPLACE FUNCTION qc.doc_search(no text, title text, summary text, tags text[], body text) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT setweight(to_tsvector('simple', qc.fold(coalesce(no, '') || ' ' || coalesce(title, ''))), 'A')
      || setweight(to_tsvector('simple', qc.fold(coalesce(summary, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))), 'B')
      || setweight(to_tsvector('simple', qc.fold(coalesce(body, ''))), 'C')
$$;

CREATE OR REPLACE FUNCTION qc.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- =============================================================
--  NGƯỜI DÙNG (đăng nhập bằng Microsoft 365)
-- =============================================================
-- role: viewer = nhân viên (xem) · manager = quản lý (xem cả văn bản hạn chế)
--       admin  = Phòng HCNS (sửa nội dung, trả lời góp ý)
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_oid     uuid UNIQUE,                    -- Object ID trong Microsoft Entra, tự điền ở lần đăng nhập đầu
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  full_name     text NOT NULL DEFAULT '',
  department    text,
  role          text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'manager', 'admin')),
  is_active     boolean NOT NULL DEFAULT true,  -- false = khóa truy cập web (không cần chờ IT khóa email)
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Phiên đăng nhập: cookie chỉ giữ mã ngẫu nhiên, ở đây lưu bản băm SHA-256 của mã.
-- Xóa dòng = đăng xuất người đó ngay.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          inet,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- =============================================================
--  VĂN BẢN
-- =============================================================
CREATE TABLE IF NOT EXISTS doc_groups (
  code        text PRIMARY KEY,                 -- quy-che, quy-dinh, quy-trinh, bieu-mau
  name        text NOT NULL,
  description text,
  color       text,
  sort        int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id              text PRIMARY KEY,             -- mã dùng trên link web, VD 'luong-2p'
  group_code      text NOT NULL REFERENCES doc_groups(code),
  parent_id       text REFERENCES documents(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED, -- biểu mẫu thuộc quy trình nào
  no              text NOT NULL,                -- số hiệu, VD '07', '10.1'
  title           text NOT NULL,
  summary         text,
  tags            text[] NOT NULL DEFAULT '{}',
  notes           text[] NOT NULL DEFAULT '{}', -- ghi chú của HCNS về nội dung gốc
  issued_label    text,                         -- ngày ban hành ghi tay, VD 'Áp dụng năm 2025'
  expired_reason  text,                         -- khác NULL = hết hiệu lực
  access_level    text NOT NULL DEFAULT 'all' CHECK (access_level IN ('all', 'manager', 'admin')),
  source_path     text,                         -- đường dẫn file Word trong thư mục HCNS
  form_dir        text,                         -- thư mục biểu mẫu đi kèm
  render_opts     jsonb NOT NULL DEFAULT '{}',  -- appendixFrom, dropFrom… (cách web tách phụ lục)
  blocks          jsonb,                        -- nội dung đọc từ Word: đoạn văn và bảng
  body_text       text,                         -- chữ thuần của blocks, dùng để tìm kiếm
  source_modified date,                         -- ngày sửa file Word gốc
  sort            int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  search          tsvector GENERATED ALWAYS AS (qc.doc_search(no, title, summary, tags, body_text)) STORED
);
CREATE INDEX IF NOT EXISTS documents_search_idx ON documents USING gin (search);
CREATE INDEX IF NOT EXISTS documents_title_trgm_idx ON documents USING gin (qc.fold(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS documents_group_idx ON documents (group_code, sort);
DROP TRIGGER IF EXISTS documents_touch ON documents;
CREATE TRIGGER documents_touch BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION qc.touch_updated_at();

-- File gốc trong thư mục HCNS (Word, Excel). File thật để trong kho file
-- (Azure Blob Storage / Supabase Storage), ở đây chỉ lưu thông tin.
CREATE TABLE IF NOT EXISTS source_files (
  path            text PRIMARY KEY,             -- đường dẫn tương đối trong thư mục HCNS
  name            text NOT NULL,
  ext             text NOT NULL,
  size_kb         int,
  is_private      boolean NOT NULL DEFAULT false, -- chứa thông tin cá nhân: chỉ liệt kê tên, không cho xem/tải
  document_id     text REFERENCES documents(id) ON DELETE SET NULL,
  storage_key     text,                         -- khóa trong kho file; NULL = chưa tải lên
  source_modified date,
  uploaded_at     timestamptz
);
CREATE INDEX IF NOT EXISTS source_files_doc_idx ON source_files (document_id);

-- Nội dung từng sheet Excel (hiển thị dạng bảng trên web)
CREATE TABLE IF NOT EXISTS sheets (
  file_path text NOT NULL REFERENCES source_files(path) ON DELETE CASCADE ON UPDATE CASCADE,
  idx       int NOT NULL,
  name      text NOT NULL,
  rows      jsonb NOT NULL,
  truncated boolean NOT NULL DEFAULT false,
  PRIMARY KEY (file_path, idx)
);

-- =============================================================
--  CHỦ ĐỀ, TRA CỨU NHANH, TRẮC NGHIỆM
-- =============================================================
CREATE TABLE IF NOT EXISTS topics (
  code        text PRIMARY KEY,                 -- khen-thuong, ky-luat…
  name        text NOT NULL,
  description text,
  color       text,
  icon        text,
  search_q    text,                             -- từ khóa tìm kiếm mặc định
  note        text,
  sort        int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS topic_documents (
  topic_code  text NOT NULL REFERENCES topics(code) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  sort        int NOT NULL DEFAULT 0,
  PRIMARY KEY (topic_code, document_id)
);
CREATE TABLE IF NOT EXISTS topic_refs (           -- điều khoản tiêu biểu của chủ đề
  id          serial PRIMARY KEY,
  topic_code  text NOT NULL REFERENCES topics(code) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  find        text NOT NULL,                    -- đoạn chữ để nhảy tới trong văn bản
  label       text NOT NULL,
  sort        int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quick_topics (
  code text PRIMARY KEY,                        -- luong, chedo, phucloi…
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quick_questions (
  id          serial PRIMARY KEY,
  topic_code  text NOT NULL REFERENCES quick_topics(code),
  question    text NOT NULL,
  answer      text NOT NULL,
  document_id text REFERENCES documents(id) ON DELETE SET NULL,
  find        text,
  sort        int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS quick_questions_touch ON quick_questions;
CREATE TRIGGER quick_questions_touch BEFORE UPDATE ON quick_questions FOR EACH ROW EXECUTE FUNCTION qc.touch_updated_at();

-- answers[1] luôn là đáp án đúng; web tự xáo trộn khi hiển thị
CREATE TABLE IF NOT EXISTS quiz_questions (
  id          serial PRIMARY KEY,
  document_id text REFERENCES documents(id) ON DELETE CASCADE,
  find        text,
  question    text NOT NULL,
  answers     text[] NOT NULL CHECK (cardinality(answers) >= 2),
  explanation text,
  sort        int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

-- =============================================================
--  GÓP Ý (thay cho kho dữ liệu claude.ai)
-- =============================================================
CREATE TABLE IF NOT EXISTS feedback (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL CHECK (type IN ('noi-dung', 'cau-hoi', 'loi-web', 'de-xuat', 'huu-ich')),
  document_id text REFERENCES documents(id) ON DELETE SET NULL,
  content     text NOT NULL,
  rating      smallint CHECK (rating BETWEEN 0 AND 5),
  status      text NOT NULL DEFAULT 'moi' CHECK (status IN ('moi', 'dang-xu-ly', 'xong')),
  reply       text,
  replied_by  uuid REFERENCES users(id),
  replied_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id, created_at DESC);

-- =============================================================
--  NHẬT KÝ TRUY CẬP
-- =============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES users(id),
  action      text NOT NULL,                    -- login, view_doc, download_file, edit_doc, reply_feedback…
  document_id text,
  file_path   text,
  detail      jsonb,
  ip          inet
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id, at DESC);

-- =============================================================
--  PHÂN QUYỀN: văn bản một người được xem
--  Backend gọi: SELECT … FROM qc.visible_documents(<user_id>)
-- =============================================================
CREATE OR REPLACE FUNCTION qc.visible_documents(p_user uuid) RETURNS SETOF qc.documents
  LANGUAGE sql STABLE
AS $$
  SELECT d.* FROM qc.documents d
  JOIN qc.users u ON u.id = p_user AND u.is_active
  WHERE d.access_level = 'all'
     OR (d.access_level = 'manager' AND u.role IN ('manager', 'admin'))
     OR (d.access_level = 'admin'   AND u.role = 'admin')
$$;

COMMIT;
