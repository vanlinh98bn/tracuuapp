# Tra cứu Quy chế – Cát Tường Homes

Web nội bộ để tra cứu quy chế, quy định, quy trình và biểu mẫu của công ty.

> **Về repo này:** chỉ chứa mã nguồn. Mật khẩu, khóa bí mật và **toàn bộ nội dung quy chế** (kể cả bản đã mã hóa)
> không được đưa lên – xem `.gitignore`. Sau khi tải về, Phòng HCNS tạo lại dữ liệu trên máy nội bộ:
> `js/catalog.js` + `data/raw.js` (từ file Word, `tools/cap-nhat-du-lieu.ps1`), rồi `tools/ma-hoa-du-lieu.ps1`
> (bản tĩnh) hoặc `tools/tao-seed-sql.ps1` (bản backend, xem `backend/README.md`).

## Mở web
Mở `index.html` bằng trình duyệt (Chrome/Edge). Không cần cài đặt máy chủ.

## Đăng nhập & bảo mật
Phải đăng nhập mới đọc được. Toàn bộ nội dung nằm trong `data/secure.js` ở dạng **mã hóa**; không có mật khẩu đúng thì không giải mã được, kể cả khi xem mã nguồn trang.

**Thêm / xóa / đổi mật khẩu tài khoản**
1. Sửa `tools/tai-khoan.csv` (mở bằng Notepad hoặc Excel, lưu dạng CSV UTF-8):
   ```
   TaiKhoan,MatKhau,HoTen
   nguyenvana,MatKhauManh@2026,Nguyễn Văn A
   ```
   Mật khẩu tối thiểu 8 ký tự. Tên tài khoản không phân biệt chữ hoa/thường.
2. Chạy: `.\tools\ma-hoa-du-lieu.ps1` → tạo lại `data/secure.js`.
3. Đăng lại web. Mật khẩu cũ hết hiệu lực ngay khi đăng bản mới.

**Khi đăng web chỉ đưa lên:** `index.html`, `css/`, `js/auth.js`, `js/normalize.js`, `js/app.js`, `data/secure.js`, `assets/`.
**Không bao giờ đưa lên:** `tools/` (có mật khẩu), `data/raw.js`, `js/catalog.js` (nội dung chưa mã hóa), `backend/` (có `seed.sql` chứa toàn bộ nội dung).

## Bản có backend (đăng nhập Microsoft 365, PostgreSQL)
Xem `backend/README.md` (máy chủ, đăng nhập, triển khai Azure) và `backend/db/README.md` (database).
- Giao diện bản backend: `server.html` + `js/auth-server.js` (bản claude.ai vẫn dùng `index.html` + `js/auth.js`).
- Tạo lại dữ liệu nạp vào database: `.\tools\tao-seed-sql.ps1`.
- Đóng gói đưa lên Azure: `.\tools\dong-goi-azure.ps1` → `dist\tra-cuu-quy-che-azure.zip`.

## Cập nhật khi file Word thay đổi
1. Sửa hoặc thêm file Word trong thư mục `Desktop\HCNS`.
2. Chạy trong PowerShell (máy cần có Microsoft Word):
   ```powershell
   .\tools\cap-nhat-du-lieu.ps1              # mặc định đọc Desktop\HCNS
   .\tools\cap-nhat-du-lieu.ps1 -Src "D:\HCNS"
   ```
   Script đọc toàn bộ `.doc/.docx` và ghi lại `data/raw.js`.
3. Nếu **thêm văn bản mới**: khai báo thêm một dòng trong `CATALOG` ở `js/catalog.js` (số hiệu, tên, đường dẫn file, tóm tắt).
4. Chạy `.\tools\ma-hoa-du-lieu.ps1` để mã hóa lại rồi đăng web.

## Biểu mẫu Excel
- `tools/cap-nhat-du-lieu.ps1` đọc cả file Excel (cần Microsoft Excel), hiển thị trên web dạng bảng theo từng sheet (tối đa 400 dòng × 30 cột mỗi sheet).
- `tools/ma-hoa-du-lieu.ps1` mã hóa riêng từng file Excel gốc vào `data/files/<mã>.js`; người dùng bấm "Tải file Excel gốc" mới tải về và giải mã.
- **File chứa thông tin cá nhân** (hợp đồng thật, phiếu đánh giá đã điền…): ghi vào `tools/khong-dua-len-web.txt`. Web chỉ liệt kê tên, không hiển thị nội dung, không cho tải.
- Khi đăng web nhớ đưa lên cả thư mục `data/files/` (và xóa các tệp cũ không còn dùng).

## Góp ý & phản hồi
- Trang `#/gop-y` (js/feedback.js). Chỉ hoạt động trên link claude.ai, lưu trong kho dữ liệu của trang.
- Người gửi cần đăng nhập claude.ai và được chia sẻ quyền **Người đóng góp (Contributor)** trở lên. Mỗi người chỉ thấy góp ý của mình.
- Người có quyền **Người chỉnh sửa (Editor)** hoặc chủ sở hữu thấy tab "Quản lý góp ý": xem tất cả, trả lời, đổi trạng thái, xuất CSV.

## Sửa tra cứu nhanh
Trong `js/catalog.js`:
- `QUICK`: các câu hỏi thường gặp trên trang chủ.
- `TOPICS`: chủ đề tra cứu (Khen thưởng, Kỷ luật & Nội quy, Chế độ & Bảo hiểm, Đánh giá & Thăng tiến) – văn bản thuộc chủ đề và điều khoản tiêu biểu.
- Văn bản hết hiệu lực: thêm `expired: 'lý do'` vào dòng văn bản trong `CATALOG` → web gắn nhãn "Hết hiệu lực".
- "Mới cập nhật" = ngày ban hành hoặc sửa đổi gần nhất trong 12 tháng qua (tự tính).

Sửa xong chạy `.\tools\ma-hoa-du-lieu.ps1` rồi đăng lại web.

## Cấu trúc
```
index.html
css/style.css
js/auth.js        màn hình đăng nhập, giải mã nội dung
js/normalize.js   chuyển nội dung Word → điều khoản, mục lục, lưu đồ
js/app.js         giao diện, tìm kiếm
data/secure.js    nội dung đã mã hóa (tự sinh, đưa lên web)
assets/           logo, ảnh bìa
--- chỉ để trên máy, không đưa lên web ---
js/catalog.js     danh mục văn bản, tra cứu nhanh (sửa tay)
data/raw.js       nội dung đọc từ Word (tự sinh)
tools/cap-nhat-du-lieu.ps1   đọc Word → data/raw.js
tools/ma-hoa-du-lieu.ps1     mã hóa → data/secure.js
tools/tai-khoan.csv          danh sách tài khoản + mật khẩu
tools/xuat-du-lieu.html      dùng nội bộ cho bước mã hóa
```

## Lưu ý về nội dung gốc
- 13 – Con dấu: mục "Quy trình đóng dấu" là sơ đồ hình vẽ, web không hiển thị được.
- 46 – Mượn trả hồ sơ: thư mục có 3 bản trùng, web dùng `46_quytrinh_muontra_hs.docx`.
- 31 và 50 – Công văn đến: ghi số lần lấy thư khác nhau (2 lần/ngày và 1 lần/ngày).
- 07 – Quy chế lương: ngày ban hành ở trang bìa (01/10/2025) khác ngày hiệu lực ở Điều 16 (01/7/2025).
- Biểu mẫu Excel chỉ liệt kê tên, không mở được trên web.
