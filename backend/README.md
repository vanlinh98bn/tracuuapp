# Backend – Tra cứu Quy chế

Node.js + PostgreSQL + đăng nhập Microsoft 365. Thay cho bản mã hóa `data/secure.js` trên claude.ai:
- **Đăng nhập** bằng email công ty, không còn file mật khẩu `tai-khoan.csv`.
- **Phân quyền** theo văn bản (tất cả / quản lý / HCNS), máy chủ lọc trước khi gửi.
- **Khóa người dùng** có hiệu lực ngay; **nhật ký** ghi đăng nhập, tải file, góp ý, thao tác quản trị.
- **Góp ý** lưu trong PostgreSQL, không cần tài khoản claude.ai.

Giao diện giữ nguyên (`js/app.js`, `normalize.js`, `export.js`); bản backend dùng `server.html` + `js/auth-server.js`.

## Trang quản trị (Phòng HCNS)
Menu **Quản trị** (`#/quan-tri`) chỉ hiện với tài khoản vai trò HCNS; `js/admin.js` không được nạp cho người khác.
- **Người dùng**: thêm/cấp quyền trước theo email, đổi vai trò, sửa phòng ban, khóa/mở khóa, đăng xuất khỏi mọi thiết bị, tìm không dấu.
- **Quyền xem văn bản**: đặt "Tất cả nhân viên / Quản lý và HCNS / Chỉ HCNS", gắn hoặc bỏ "Hết hiệu lực".
- **Nhật ký**: lọc theo thao tác, người, khoảng ngày, văn bản; xuất CSV. Đăng nhập bị từ chối ghi cả email và lý do.
- Không tự khóa hoặc tự hạ quyền của mình được (tránh mất quyền quản trị).
- Tài khoản HCNS đầu tiên tạo bằng SQL (`db/README.md`), sau đó thêm người khác ngay trên trang.

## Cấu trúc
```
backend/
  package.json
  .env.example        mẫu cấu hình (sao chép thành .env)
  db/schema.sql       cấu trúc database
  db/seed.sql         nội dung quy chế (tự sinh – KHÔNG đưa lên web)
  src/server.js       máy chủ, phục vụ giao diện (chỉ các file được phép)
  src/auth.js         đăng nhập Microsoft 365, phiên đăng nhập
  src/content.js      /api/bootstrap (nội dung đã lọc quyền), /api/files (tải file gốc)
  src/feedback.js     /api/feedback
  src/admin.js        /api/admin (người dùng, quyền văn bản, nhật ký)
../js/admin.js        giao diện trang Quản trị (chỉ nạp cho HCNS)
  src/files.js        đọc file gốc: thư mục HCNS hoặc Azure Blob Storage
```

## Chạy thử trên máy
Cần: Node.js 22 trở lên (bản LTS tại nodejs.org), PostgreSQL (xem `db/README.md`).
```powershell
cd backend
npm install
copy .env.example .env      # rồi mở .env điền SESSION_SECRET, DATABASE_URL
npm run local               # mở http://localhost:3000
```
Chưa có thông tin Microsoft 365 thì đặt `DEV_LOGIN=true` để đăng nhập thử bằng email (chỉ hoạt động trên chính máy đó).

## API
| Đường dẫn | Ai dùng | Việc |
|---|---|---|
| `GET /auth/login` → `/auth/callback` | mọi người | Đăng nhập Microsoft 365 |
| `POST /auth/logout` | đã đăng nhập | Đăng xuất (xóa phiên trên máy chủ) |
| `GET /api/me` | đã đăng nhập | Thông tin người dùng |
| `GET /api/bootstrap` | đã đăng nhập | Toàn bộ nội dung được phép xem |
| `GET /api/files/:id` | đã đăng nhập | Tải file Excel gốc |
| `GET/POST /api/feedback`, `PATCH /api/feedback/:id` | đã đăng nhập / HCNS | Góp ý, trả lời |
| `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id` | HCNS | Thêm người, đổi vai trò, khóa |
| `POST /api/admin/users/:id/logout` | HCNS | Đăng xuất người dùng khỏi mọi thiết bị |
| `GET /api/admin/documents`, `PATCH /api/admin/documents/:id` | HCNS | Mức người xem, hết hiệu lực |
| `GET /api/admin/audit?action=&q=&from=&to=&doc=&limit=` | HCNS | Nhật ký (lọc) |
| `GET /api/admin/stats` | HCNS | Số liệu nhanh |

## Đăng ký ứng dụng Microsoft 365 (việc của IT)
Microsoft Entra admin center → **App registrations → New registration**
1. Name: `Tra cuu quy che`
2. Supported account types: **Single tenant** (chỉ tài khoản công ty)
3. Redirect URI: nền tảng **Web**, địa chỉ `https://<tên miền web>/auth/callback`
   (thêm `http://localhost:3000/auth/callback` nếu cần chạy thử trên máy)
4. **Certificates & secrets → New client secret**
5. Gửi riêng cho người triển khai (không qua chat): **Directory (tenant) ID**, **Application (client) ID**, **Client secret**
   → điền vào `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`.

Quyền API mặc định (Microsoft Graph `User.Read`) là đủ; ứng dụng chỉ đọc `openid profile email`.

## Triển khai lên Azure
1. **Database**: Azure Database for PostgreSQL – Flexible Server. Bật `UNACCENT`, `PG_TRGM` ở `azure.extensions`, chạy `db/schema.sql` rồi `db/seed.sql`, thêm tài khoản HCNS đầu tiên (`db/README.md`).
2. **File gốc**: Storage account → container `hcns` → tải **nguyên thư mục HCNS** lên, giữ đường dẫn. File riêng tư (`tools/khong-dua-len-web.txt`) **không tải lên**.
3. **Web**: App Service (Linux, Node 24 LTS).
   - Application settings: các biến trong `.env.example`, với `NODE_ENV=production`, `PUBLIC_URL=https://…`, `DEV_LOGIN=false`, `FILES_DRIVER=azure`, `DATABASE_URL=…?sslmode=require`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
   - Startup command: `npm start`.
4. Đóng gói và đưa lên:
   ```powershell
   .\tools\dong-goi-azure.ps1          # → dist\tra-cuu-quy-che-azure.zip (chỉ file cần chạy)
   az webapp deploy --resource-group <nhóm> --name <tên app> --src-path dist\tra-cuu-quy-che-azure.zip --type zip
   ```
5. Kiểm tra `https://<tên miền>/healthz` trả `{"ok":true}`.

## Bảo mật đã có
- Cookie phiên `HttpOnly`, `SameSite=Lax`, `Secure` khi chạy HTTPS; mã phiên lưu dạng băm SHA-256.
- Thao tác thay đổi dữ liệu bắt buộc gửi JSON (chặn form giả từ trang khác).
- Content-Security-Policy, chống nhúng khung (`frame-ancestors 'none'`), HSTS khi HTTPS.
- Chỉ phục vụ danh sách file giao diện cố định: `catalog.js`, `raw.js`, `tools/`, `backend/` không bao giờ truy cập được qua web.
- Quyền xem được kiểm tra lại ở máy chủ cho mọi yêu cầu, kể cả tải file.
- `DEV_LOGIN` tự tắt khi `NODE_ENV=production`, chỉ nhận truy cập từ chính máy chạy.
