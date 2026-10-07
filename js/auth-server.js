/* =============================================================
   Đăng nhập & tải nội dung – bản chạy với backend (server.html)
   - Đăng nhập bằng tài khoản Microsoft 365 của công ty.
   - Nội dung lấy từ /api/bootstrap, máy chủ đã lọc theo quyền người xem.
   (Bản claude.ai dùng js/auth.js + data/secure.js, không dùng file này.)
   ============================================================= */
(function () {
  'use strict';
  const app = document.getElementById('app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ERR = {
    domain: 'Chỉ tài khoản email công ty được đăng nhập.',
    inactive: 'Tài khoản của bạn đã bị khóa truy cập. Liên hệ Phòng Hành chính – Nhân sự.',
    not_registered: 'Tài khoản chưa được cấp quyền xem. Liên hệ Phòng Hành chính – Nhân sự.',
    tenant: 'Tài khoản không thuộc tổ chức Cát Tường.',
    no_email: 'Không đọc được email từ tài khoản Microsoft.',
    state: 'Phiên đăng nhập đã hết hạn, vui lòng thử lại.',
    ms: 'Đăng nhập Microsoft không thành công, vui lòng thử lại.',
    entra_off: 'Máy chủ chưa cấu hình đăng nhập Microsoft 365.',
  };

  async function api(url, opts) {
    const r = await fetch(url, Object.assign({ credentials: 'same-origin', headers: { Accept: 'application/json' } }, opts));
    if (r.status === 401) { const e = new Error('unauthenticated'); e.status = 401; throw e; }
    if (!r.ok) { const e = new Error('Máy chủ báo lỗi ' + r.status); e.status = r.status; throw e; }
    return r;
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Không tải được ' + src));
      document.body.appendChild(s);
    });
  }

  async function start(me, data) {
    window.API = { me };                                   // feedback.js dùng để chọn chế độ máy chủ
    Object.assign(window, data.globals);                   // RAW_DOCS, CATALOG, QUICK… (đã lọc theo quyền)
    window.AUTH = {
      id: me.id, name: me.name, email: me.email, role: me.role,
      async logout() {
        try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (e) { /* bỏ qua */ }
        location.replace('/');
      },
      async openFile(id) {
        if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Mã file không hợp lệ');
        const r = await api('/api/files/' + id).catch((e) => { throw new Error(e.status === 404 ? 'File không còn hoặc bạn không có quyền tải' : 'Không tải được file'); });
        return new Uint8Array(await r.arrayBuffer());
      },
    };
    document.body.classList.remove('locked');
    await loadScript('js/normalize.js');
    await loadScript('js/feedback.js');
    if (me.role === 'admin') await loadScript('js/admin.js');   // trang quản trị: chỉ nạp cho HCNS
    await loadScript('js/app.js');
    await loadScript('js/export.js');
  }

  async function loginView(msg) {
    document.body.classList.add('locked');
    let opt = { microsoft: true, dev: false };
    try { opt = await (await fetch('/auth/options', { credentials: 'same-origin' })).json(); } catch (e) { /* dùng mặc định */ }
    app.innerHTML = `
    <section class="login">
      <div class="login-card">
        <img src="assets/logo-full.png" alt="Cát Tường" width="96" height="84" class="login-logo">
        <h1>Tra cứu quy chế nội bộ</h1>
        <p class="muted">Cát Tường Homes · Phòng Hành chính – Nhân sự</p>
        <p class="login-err" role="alert">${esc(msg || '')}</p>
        ${opt.microsoft ? `<a class="btn btn-primary btn-lg login-btn" id="lg-ms" href="/auth/login">Đăng nhập bằng Microsoft 365</a>
        <label class="check"><input type="checkbox" id="lg-remember"> Ghi nhớ đăng nhập trên máy này</label>` : ''}
        ${opt.dev ? `<form id="lg-dev" class="login-dev" action="/auth/dev-login" method="get">
          <p class="muted small">Đăng nhập thử (chỉ trên máy chạy thử, không có trên web thật)</p>
          <label class="field"><span>Email</span><input name="email" type="email" required placeholder="ten@cattuongnew.vn"></label>
          <button class="btn btn-ghost">Đăng nhập thử</button></form>` : ''}
        <p class="login-note">Dùng tài khoản email công ty. Chưa vào được, vui lòng liên hệ Phòng Hành chính – Nhân sự.</p>
      </div>
    </section>`;
    const ms = document.getElementById('lg-ms');
    if (ms) ms.addEventListener('click', (e) => {
      if (document.getElementById('lg-remember').checked) { e.preventDefault(); location.href = '/auth/login?remember=1'; }
    });
  }

  async function boot() {
    const err = new URLSearchParams(location.search).get('err');
    if (err) history.replaceState(null, '', location.pathname + location.hash);
    try {
      const me = await (await api('/api/me')).json();
      app.innerHTML = '<div class="wrap page"><div class="empty">Đang tải nội dung…</div></div>';
      const data = await (await api('/api/bootstrap')).json();
      await start(me, data);
    } catch (e) {
      if (e.status === 401) return loginView(err ? ERR[err] || ERR.ms : '');
      app.innerHTML = `<div class="wrap page"><div class="empty">Không kết nối được máy chủ (${esc(e.message)}). Vui lòng tải lại trang.</div></div>`;
    }
  }
  boot();
})();
