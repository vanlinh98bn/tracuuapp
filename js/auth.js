/* =============================================================
   Đăng nhập & giải mã nội dung
   - Toàn bộ nội dung (văn bản, tra cứu nhanh, câu hỏi) nằm trong
     data/secure.js dưới dạng mã hóa AES-256-CBC + HMAC-SHA256.
   - Mỗi tài khoản giữ một bản khóa nội dung, được khóa bằng mật khẩu
     (PBKDF2-SHA256). Sai mật khẩu → không giải mã được → không đọc được gì.
   - Tài khoản do Phòng HCNS cấp: tools/tai-khoan.csv + tools/ma-hoa-du-lieu.ps1
   ============================================================= */
(function () {
  'use strict';
  const S = window.SECURE;
  const SESSION_KEY = 'qc_session';
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const app = document.getElementById('app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get() { for (const st of [sessionStorage, localStorage]) { try { const v = JSON.parse(st.getItem(SESSION_KEY)); if (v) return v; } catch (e) { /* bỏ qua */ } } return null; },
    set(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
    clear() { [sessionStorage, localStorage].forEach((st) => { try { st.removeItem(SESSION_KEY); } catch (e) { /* bỏ qua */ } }); },
  };

  async function userId(user) {
    const h = await crypto.subtle.digest('SHA-256', enc.encode('qc:' + user.trim().toLowerCase()));
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  /* Giải một hộp mã hóa: kiểm tra HMAC-SHA256 trước, rồi giải AES-256-CBC.
     key64 = 32 byte khóa AES || 32 byte khóa HMAC (tạo bởi tools/ma-hoa-du-lieu.ps1). */
  async function openBox(key64, ivB64, ctB64, macB64) {
    const iv = fromB64(ivB64), ct = fromB64(ctB64);
    const data = new Uint8Array(iv.length + ct.length); data.set(iv); data.set(ct, iv.length);
    const mk = await crypto.subtle.importKey('raw', key64.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('HMAC', mk, fromB64(macB64), data))) throw new Error('auth');
    const ek = await crypto.subtle.importKey('raw', key64.slice(0, 32), 'AES-CBC', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, ek, ct));
  }
  /* Mở khóa nội dung bằng tài khoản + mật khẩu → { k (base64), name } */
  async function unlock(user, pass) {
    const rec = S.users[await userId(user)];
    if (!rec) throw new Error('auth');
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const kek = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(rec.salt), iterations: S.iter, hash: 'SHA-256' }, base, 512));
    return JSON.parse(dec.decode(await openBox(kek, rec.iv, rec.wk, rec.mac)));
  }
  async function openData(kB64) {
    return JSON.parse(dec.decode(await openBox(fromB64(kB64), S.iv, S.ct, S.mac)));
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Không tải được ' + src));
      document.body.appendChild(s);
    });
  }
  async function start(data, name, k) {
    // Đăng nhập lại trên cùng trang sau khi đăng xuất: tải lại để nạp ứng dụng từ đầu (phiên đã được lưu)
    if (window.__qcStarted) { location.reload(); return; }
    window.__qcStarted = true;
    Object.assign(window, data.globals); // RAW_DOCS, RAW_SHEETS, FILE_BLOBS, CATALOG, QUICK…
    window.AUTH = {
      name,
      logout() {
        store.clear();
        window.AUTH = null;                                   // app.js ngừng vẽ trang khi không còn phiên
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* bỏ qua */ }
        // Hiện ngay màn hình đăng nhập, rồi tải lại trang để xóa dữ liệu đã giải mã khỏi bộ nhớ
        ['header', 'footer'].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
        loginView('Bạn đã đăng xuất.');
        try { location.reload(); } catch (e) { /* trang vẫn ở màn hình đăng nhập */ }
      },
      /* Mở một file gốc đã mã hóa riêng (data/files/<id>.js) → Uint8Array */
      async openFile(id) {
        if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Mã file không hợp lệ');
        const all = window.QC_BLOB || {};
        if (!all[id]) await loadScript('data/files/' + id + '.js');
        const b = (window.QC_BLOB || {})[id];
        if (!b) throw new Error('Không tải được file');
        return openBox(fromB64(k), b.iv, b.ct, b.mac);
      },
    };
    document.body.classList.remove('locked');
    await loadScript('js/normalize.js');
    await loadScript('js/feedback.js');
    await loadScript('js/app.js');
    await loadScript('js/export.js');
  }

  function loginView(msg) {
    document.body.classList.add('locked');
    app.innerHTML = `
    <section class="login">
      <div class="login-card">
        <img src="assets/logo-full.png" alt="Cát Tường" width="96" height="84" class="login-logo">
        <h1>Tra cứu quy chế nội bộ</h1>
        <p class="muted">Cát Tường Homes · Phòng Hành chính – Nhân sự</p>
        <form id="lg-form" novalidate>
          <label class="field"><span>Tài khoản</span><input id="lg-user" name="user" autocomplete="username" required placeholder="Email hoặc tên đăng nhập"></label>
          <label class="field"><span>Mật khẩu</span>
            <span class="pw"><input id="lg-pass" name="pass" type="password" autocomplete="current-password" required>
            <button type="button" class="pw-toggle" id="lg-eye" aria-label="Hiện mật khẩu">Hiện</button></span></label>
          <label class="check"><input type="checkbox" id="lg-remember"> Ghi nhớ đăng nhập trên máy này</label>
          <p class="login-err" id="lg-err" role="alert">${esc(msg || '')}</p>
          <button class="btn btn-primary btn-lg login-btn" id="lg-btn">Đăng nhập</button>
        </form>
        <p class="login-note">Tài liệu chỉ dùng nội bộ. Chưa có tài khoản hoặc quên mật khẩu, vui lòng liên hệ Phòng Hành chính – Nhân sự.</p>
      </div>
    </section>`;
    const form = document.getElementById('lg-form');
    const btn = document.getElementById('lg-btn');
    const err = document.getElementById('lg-err');
    const pass = document.getElementById('lg-pass');
    document.getElementById('lg-eye').addEventListener('click', (e) => {
      const show = pass.type === 'password';
      pass.type = show ? 'text' : 'password';
      e.target.textContent = show ? 'Ẩn' : 'Hiện';
    });
    document.getElementById('lg-user').focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = document.getElementById('lg-user').value;
      if (!user.trim() || !pass.value) { err.textContent = 'Vui lòng nhập tài khoản và mật khẩu.'; return; }
      btn.disabled = true; btn.textContent = 'Đang kiểm tra…'; err.textContent = '';
      try {
        const sess = await unlock(user, pass.value);
        const data = await openData(sess.k);
        store.set(sess, document.getElementById('lg-remember').checked);
        await start(data, sess.name, sess.k);
      } catch (ex) {
        btn.disabled = false; btn.textContent = 'Đăng nhập';
        err.textContent = ex && ex.message && ex.message.startsWith('Không tải') ? ex.message : 'Tài khoản hoặc mật khẩu không đúng.';
        pass.select();
      }
    });
  }

  async function boot() {
    if (!S || !S.ct) { app.innerHTML = '<div class="wrap page"><div class="empty">Chưa có dữ liệu. Phòng HCNS cần chạy công cụ mã hóa dữ liệu (tools/ma-hoa-du-lieu.ps1).</div></div>'; return; }
    if (!window.crypto || !crypto.subtle) { loginView('Trình duyệt không hỗ trợ giải mã. Hãy mở web qua địa chỉ https:// bằng Chrome, Edge, Safari hoặc Firefox bản mới.'); return; }
    const sess = store.get();
    if (sess && sess.k) {
      try { await start(await openData(sess.k), sess.name, sess.k); return; } catch (e) { store.clear(); }
    }
    loginView();
  }
  boot();
})();
