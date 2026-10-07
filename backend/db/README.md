# Cơ sở dữ liệu PostgreSQL – Tra cứu Quy chế

| File | Nội dung |
|---|---|
| `schema.sql` | Cấu trúc database (bảng, chỉ mục, hàm tìm kiếm, phân quyền). Viết tay. |
| `seed.sql` | Nội dung quy chế hiện có. **Tự sinh, chứa toàn bộ quy chế: không đưa lên web, không gửi ra ngoài.** |

## Tạo database lần đầu
1. Tạo máy chủ PostgreSQL 14 trở lên (Azure Database for PostgreSQL – Flexible Server, Supabase hoặc máy riêng).
   - Azure: vào **Server parameters → `azure.extensions`**, bật `UNACCENT` và `PG_TRGM`.
2. Tạo database, ví dụ `quyche`.
3. Chạy (thay chuỗi kết nối thật, **không lưu mật khẩu vào file trong thư mục này**):
   ```powershell
   psql "host=<máy chủ> dbname=quyche user=<tài khoản> sslmode=require" -f schema.sql
   psql "host=<máy chủ> dbname=quyche user=<tài khoản> sslmode=require" -f seed.sql
   ```
4. Thêm quản trị viên đầu tiên:
   ```sql
   INSERT INTO qc.users (email, full_name, role) VALUES ('ten.hcns@cattuongnew.vn', 'Tên quản trị', 'admin');
   ```

## Cập nhật nội dung khi file Word thay đổi
```powershell
.\tools\cap-nhat-du-lieu.ps1     # Word → data\raw.js (như trước)
.\tools\tao-seed-sql.ps1         # → backend\db\seed.sql
psql "<chuỗi kết nối>" -f backend\db\seed.sql
```
`seed.sql` chạy lại được nhiều lần: cập nhật văn bản, chủ đề, tra cứu nhanh, trắc nghiệm; **giữ nguyên** người dùng, góp ý, nhật ký và file gốc đã tải lên kho.
Khi có trang quản trị, HCNS sẽ sửa trực tiếp trên web, không cần bước này nữa.

## Các bảng
- **Người dùng:** `users` (email Microsoft 365, vai trò `viewer` / `manager` / `admin`, khóa truy cập).
- **Văn bản:** `doc_groups`, `documents` (kèm nội dung Word dạng JSON và cột tìm kiếm không dấu), `source_files` (file Word/Excel gốc), `sheets` (bảng Excel).
- **Tra cứu:** `topics`, `topic_documents`, `topic_refs`, `quick_topics`, `quick_questions`, `quiz_questions`.
- **Góp ý & nhật ký:** `feedback`, `audit_log`.

## Văn bản hạn chế người xem
```sql
UPDATE qc.documents SET access_level = 'manager' WHERE id = 'luong-2p';   -- chỉ quản lý và HCNS xem được
```
Backend lấy danh sách văn bản qua `qc.visible_documents(<id người dùng>)`, nên người không đủ quyền không nhận được dữ liệu.

## Thử tìm kiếm
```sql
SELECT id, no, title FROM qc.documents
WHERE search @@ plainto_tsquery('simple', qc.fold('nghi phep'))
ORDER BY ts_rank(search, plainto_tsquery('simple', qc.fold('nghi phep'))) DESC;
```
