/* =============================================================
   Trang quản trị – Phòng HCNS (#/quan-tri)
   - Chỉ có ở bản chạy với backend (server.html), chỉ hiện với role admin.
   - Mọi thao tác đều được máy chủ kiểm tra quyền lại (/api/admin/*).
   Tab: Người dùng · Quyền xem văn bản · Nhật ký
   ============================================================= */
const ADM = {
  ROLE: { viewer: 'Nhân viên', manager: 'Quản lý', admin: 'HCNS (quản trị)' },
  LEVEL: { all: 'Tất cả nhân viên', manager: 'Quản lý và HCNS', admin: 'Chỉ HCNS' },
  ACTION: {
    login: 'Đăng nhập', login_denied: 'Đăng nhập bị từ chối', logout: 'Đăng xuất', load: 'Mở trang tra cứu',
    download_file: 'Tải file gốc', feedback: 'Gửi góp ý', reply_feedback: 'Trả lời góp ý',
    admin_user: 'Sửa người dùng', admin_logout_user: 'Đăng xuất người dùng', edit_doc: 'Sửa quyền văn bản',
  },
  DENY: {
    domain: 'email ngoài công ty', inactive: 'tài khoản đã bị khóa', not_registered: 'chưa được cấp quyền',
    tenant: 'không thuộc tổ chức', no_email: 'không đọc được email',
  },
  ERR: {
    self_lockout: 'Không thể tự hạ quyền hoặc tự khóa tài khoản của chính mình.',
    invalid_email: 'Email không hợp lệ.', invalid_role: 'Vai trò không hợp lệ.', invalid_level: 'Mức xem không hợp lệ.',
    not_found: 'Không tìm thấy, có thể đã bị xóa. Hãy tải lại trang.',
    unauthenticated: 'Phiên đăng nhập đã hết. Vui lòng tải lại trang và đăng nhập.', forbidden: 'Bạn không có quyền quản trị.',
  },
  async call(method, url, body) {
    const r = await fetch(url, Object.assign({ method, credentials: 'same-origin', headers: { Accept: 'application/json' } },
      body ? { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) } : {}));
    let data = null; try { data = await r.json(); } catch (e) { /* không có nội dung */ }
    if (!r.ok) throw new Error(this.ERR[data && data.error] || 'Máy chủ báo lỗi (' + r.status + '). Vui lòng thử lại.');
    return data;
  },
  get(url) { return this.call('GET', url); },
  date(iso) { return iso ? fbDate(iso) : ''; },
  ago(iso) {
    if (!iso) return 'Chưa đăng nhập';
    const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
    return days < 1 ? 'Hôm nay' : days < 2 ? 'Hôm qua' : days < 31 ? `${days} ngày trước` : fbDate(iso).slice(0, 10);
  },
};

function viewAdmin(p, q) {
  if (!window.API || !window.AUTH || AUTH.role !== 'admin') {
    return `<div class="wrap page"><div class="empty">${icon('lock', 18)} Trang quản trị chỉ dành cho Phòng Hành chính – Nhân sự.</div></div>`;
  }
  const tabs = [['nguoi-dung', 'Người dùng'], ['van-ban', 'Quyền xem văn bản'], ['nhat-ky', 'Nhật ký']];
  const tab = tabs.some(([k]) => k === q.tab) ? q.tab : 'nguoi-dung';
  const html = `<div class="wrap page adm">
    <nav class="crumbs"><a href="#/">Trang chủ</a> / Quản trị</nav>
    <div class="sec-head"><h1>Quản trị</h1>
      <div class="tabs">${tabs.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/quan-tri${qs({ tab: k === 'nguoi-dung' ? '' : k })}">${l}</a>`).join('')}<a href="#/gop-y?tab=quan-ly">Góp ý</a></div></div>
    <div class="fb-stats adm-stats" id="adm-stats"></div>
    <div id="adm-root"><div class="empty">Đang tải…</div></div>
  </div>`;
  return { html, mount(root) {
    ADM.paintStats($('#adm-stats', root));
    const box = $('#adm-root', root);
    ({ 'nguoi-dung': ADM.users, 'van-ban': ADM.docs, 'nhat-ky': ADM.audit })[tab].call(ADM, box, q)
      .catch((e) => { box.innerHTML = `<div class="empty">${icon('warn', 18)} ${esc(e.message)}</div>`; });
  } };
}

ADM.paintStats = async function (box) {
  try {
    const s = await this.get('/api/admin/stats');
    box.innerHTML = `
      <div class="panel"><b>${s.active_users}</b><span>Người dùng đang hoạt động${s.locked_users ? ` · ${s.locked_users} đã khóa` : ''}</span></div>
      <div class="panel"><b>${s.users_30d}</b><span>Người đăng nhập trong 30 ngày</span></div>
      <div class="panel"><b>${s.downloads_30d}</b><span>Lượt tải file gốc trong 30 ngày</span></div>
      <a class="panel" href="#/quan-tri?tab=van-ban&muc=han-che"><b>${s.restricted_docs}</b><span>Văn bản hạn chế người xem</span></a>
      ${s.denied_30d ? `<a class="note adm-alert" href="#/quan-tri${qs({ tab: 'nhat-ky', tk: 'login_denied' })}">${icon('warn', 16)} <span>${s.denied_30d} lần đăng nhập bị từ chối trong 30 ngày qua. Xem nhật ký</span></a>` : ''}`;
  } catch (e) { box.innerHTML = ''; }
};

/* ---------- Tab Người dùng ---------- */
ADM.users = async function (box, q) {
  const vt = this.ROLE[q.vt] ? q.vt : '';
  const tt = ['hoat-dong', 'khoa'].includes(q.tt) ? q.tt : '';
  const link = (o) => '#/quan-tri' + qs(Object.assign({ vt, tt }, o));
  let list = await this.get('/api/admin/users');
  const count = (f) => list.filter(f).length;
  box.innerHTML = `
    <details class="panel adm-add"${list.length <= 1 ? ' open' : ''}>
      <summary>${icon('arrow', 16)} Thêm người dùng hoặc cấp quyền trước khi họ đăng nhập</summary>
      <form id="adm-add" class="adm-form" novalidate>
        <label class="field"><span>Email công ty</span><input name="email" type="email" required placeholder="ten@cattuongnew.vn"></label>
        <label class="field"><span>Họ tên</span><input name="full_name" placeholder="Nguyễn Văn A"></label>
        <label class="field"><span>Phòng ban</span><input name="department" placeholder="Phòng Kế toán"></label>
        <label class="field"><span>Vai trò</span><select name="role">${Object.entries(this.ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <button class="btn btn-primary">Lưu</button>
        <p class="login-err" id="adm-add-err" role="alert"></p>
      </form>
      <p class="muted small">Email đã có thì cập nhật họ tên, phòng ban và vai trò. Nhân viên mới đăng nhập lần đầu sẽ tự có tài khoản "Nhân viên" (nếu máy chủ bật AUTO_CREATE_USERS).</p>
    </details>
    <div class="filters">
      <div class="chips"><span class="flabel">Vai trò</span><a class="chip${vt ? '' : ' on'}" href="${link({ vt: '' })}">Tất cả (${list.length})</a>${Object.entries(this.ROLE).map(([k, v]) => `<a class="chip${vt === k ? ' on' : ''}" href="${link({ vt: k })}">${v} (${count((u) => u.role === k)})</a>`).join('')}</div>
      <div class="chips"><span class="flabel">Trạng thái</span><a class="chip${tt ? '' : ' on'}" href="${link({ tt: '' })}">Tất cả</a><a class="chip${tt === 'hoat-dong' ? ' on' : ''}" href="${link({ tt: 'hoat-dong' })}">Đang hoạt động (${count((u) => u.is_active)})</a><a class="chip${tt === 'khoa' ? ' on' : ''}" href="${link({ tt: 'khoa' })}">Đã khóa (${count((u) => !u.is_active)})</a></div>
      <label class="fsel adm-search">${icon('search', 15)}<input id="adm-q" type="search" placeholder="Tìm tên, email, phòng ban…" aria-label="Tìm người dùng"></label>
    </div>
    <div id="adm-users"></div>
    <p class="muted small">Đổi vai trò hoặc khóa tài khoản: người đó bị đăng xuất ngay và phải đăng nhập lại. Khóa ở đây chỉ chặn trang tra cứu, không ảnh hưởng email công ty.</p>`;

  const tableBox = $('#adm-users', box), search = $('#adm-q', box);
  const paint = () => {
    const t = fold(search.value.trim());
    const rows = list.filter((u) => (!vt || u.role === vt) && (!tt || (tt === 'khoa' ? !u.is_active : u.is_active))
      && (!t || fold(`${u.full_name} ${u.email} ${u.department || ''}`).includes(t)));
    tableBox.innerHTML = rows.length ? `<div class="tbl adm-tbl"><table>
      <thead><tr><th>Người dùng</th><th>Phòng ban</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th></tr></thead>
      <tbody>${rows.map((u) => {
        const me = u.id === AUTH.id;
        return `<tr class="${u.is_active ? '' : 'off'}" data-id="${esc(u.id)}">
          <td><b>${esc(u.full_name || '(chưa có tên)')}</b>${me ? ' <span class="pill">Bạn</span>' : ''}<small>${esc(u.email)}</small></td>
          <td><input class="adm-in" data-dept value="${esc(u.department || '')}" placeholder="—" aria-label="Phòng ban của ${esc(u.email)}"></td>
          <td><select class="adm-in" data-role aria-label="Vai trò của ${esc(u.email)}"${me ? ' disabled title="Không tự đổi vai trò của mình"' : ''}>${Object.entries(this.ROLE).map(([k, v]) => `<option value="${k}"${u.role === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
          <td>${u.is_active ? '<span class="pill ok">Hoạt động</span>' : '<span class="pill bad">Đã khóa</span>'}
            ${me ? '' : `<button type="button" class="link-btn" data-lock="${u.is_active ? '0' : '1'}">${u.is_active ? 'Khóa' : 'Mở khóa'}</button>`}</td>
          <td>${esc(this.ago(u.last_login_at))}${u.last_login_at ? `<small>${esc(this.date(u.last_login_at))}</small>` : ''}
            ${u.sessions ? `<small>${u.sessions} phiên đang mở${me ? '' : ` · <button type="button" class="link-btn" data-kick>Đăng xuất mọi thiết bị</button>`}</small>` : ''}
            <small><a href="#/quan-tri${qs({ tab: 'nhat-ky', ng: u.email })}">Xem nhật ký</a></small></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">Không có người dùng phù hợp.</div>';
  };
  const reload = async () => { list = await this.get('/api/admin/users'); paint(); this.paintStats($('#adm-stats')); };
  const userOf = (el) => list.find((u) => u.id === el.closest('tr').dataset.id);
  search.addEventListener('input', paint);
  paint();

  tableBox.addEventListener('change', async (e) => {
    const el = e.target, u = userOf(el);
    if (!u) return;
    const body = el.matches('[data-role]') ? { role: el.value } : el.matches('[data-dept]') ? { department: el.value.trim() } : null;
    if (!body) return;
    if (body.role && !(await confirmBox(`Đổi vai trò của ${u.full_name || u.email} thành "${this.ROLE[body.role]}"? Người này sẽ phải đăng nhập lại.`, 'Đổi vai trò'))) { el.value = u.role; return; }
    el.disabled = true;
    try { await this.call('PATCH', '/api/admin/users/' + u.id, body); fbToast('Đã lưu thay đổi cho ' + (u.full_name || u.email)); await reload(); } catch (err) { fbToast(err.message, true); el.value = body.role ? u.role : u.department || ''; el.disabled = false; }
  });
  tableBox.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lock], [data-kick]');
    if (!b) return;
    const u = userOf(b), who = u.full_name || u.email;
    try {
      if (b.matches('[data-kick]')) {
        if (!(await confirmBox(`Đăng xuất ${who} khỏi mọi thiết bị? Người này vẫn đăng nhập lại được.`, 'Đăng xuất'))) return;
        await this.call('POST', `/api/admin/users/${u.id}/logout`, {});
        fbToast('Đã đăng xuất ' + who);
      } else {
        const lock = b.dataset.lock === '0';
        if (!(await confirmBox(lock ? `Khóa ${who}? Người này bị đăng xuất ngay và không vào được trang tra cứu.` : `Mở khóa cho ${who}?`, lock ? 'Khóa' : 'Mở khóa'))) return;
        await this.call('PATCH', '/api/admin/users/' + u.id, { is_active: !lock });
        fbToast((lock ? 'Đã khóa ' : 'Đã mở khóa ') + who);
      }
      await reload();
    } catch (err) { fbToast(err.message, true); }
  });

  const form = $('#adm-add', box), err = $('#adm-add-err', box);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { err.textContent = 'Vui lòng nhập email hợp lệ.'; return; }
    const btn = $('button', form); btn.disabled = true; err.textContent = '';
    try {
      const u = await this.call('POST', '/api/admin/users', f);
      form.reset(); fbToast(`Đã lưu ${u.email} – ${this.ROLE[u.role]}`); await reload();
    } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
  });
};

/* ---------- Tab Quyền xem văn bản ---------- */
ADM.docs = async function (box, q) {
  const nhom = GROUPS[q.nhom] ? q.nhom : '';
  const muc = ['han-che', ...Object.keys(this.LEVEL)].includes(q.muc) ? q.muc : '';
  const link = (o) => '#/quan-tri' + qs(Object.assign({ tab: 'van-ban', nhom, muc }, o));
  let list = await this.get('/api/admin/documents');
  const okMuc = (d) => !muc || (muc === 'han-che' ? d.access_level !== 'all' : d.access_level === muc);
  box.innerHTML = `
    <div class="note info">${icon('info', 16)} <span>Văn bản hạn chế bị ẩn hoàn toàn với người không đủ quyền: cả nội dung, file gốc, biểu mẫu đi kèm, chủ đề và câu tra cứu nhanh liên quan. Người dùng thấy thay đổi khi tải lại trang.</span></div>
    <div class="filters adm-filters">
      <div class="chips"><span class="flabel">Nhóm</span><a class="chip${nhom ? '' : ' on'}" href="${link({ nhom: '' })}">Tất cả</a>${Object.entries(GROUPS).map(([k, g]) => `<a class="chip${nhom === k ? ' on' : ''}" href="${link({ nhom: k })}">${esc(g.name)} (${list.filter((d) => d.group_code === k).length})</a>`).join('')}</div>
      <div class="chips"><span class="flabel">Người xem</span><a class="chip${muc ? '' : ' on'}" href="${link({ muc: '' })}">Tất cả</a><a class="chip${muc === 'han-che' ? ' on' : ''}" href="${link({ muc: 'han-che' })}">Đang hạn chế (${list.filter((d) => d.access_level !== 'all').length})</a></div>
      <label class="fsel adm-search">${icon('search', 15)}<input id="adm-q" type="search" placeholder="Tìm số hiệu, tên văn bản…" aria-label="Tìm văn bản"></label>
    </div>
    <div id="adm-docs"></div>`;
  const tableBox = $('#adm-docs', box), search = $('#adm-q', box);
  const paint = () => {
    const t = fold(search.value.trim());
    const rows = list.filter((d) => (!nhom || d.group_code === nhom) && okMuc(d) && (!t || fold(`${d.no} ${d.title}`).includes(t)));
    tableBox.innerHTML = rows.length ? `<div class="tbl adm-tbl"><table>
      <thead><tr><th>Số hiệu</th><th>Văn bản</th><th>Ai được xem</th><th>Hiệu lực</th><th>Cập nhật</th></tr></thead>
      <tbody>${rows.map((d) => `<tr class="${d.access_level !== 'all' ? 'restricted' : ''}${d.expired_reason ? ' off' : ''}" data-id="${esc(d.id)}">
        <td><span class="doc-no sm g-${(GROUPS[d.group_code] || {}).color || 'blue'}">${esc(d.no)}</span></td>
        <td><b>${esc(d.title)}</b><small>${esc((GROUPS[d.group_code] || {}).name || '')} · <a href="#/quan-tri${qs({ tab: 'nhat-ky', doc: d.id })}">Nhật ký</a></small></td>
        <td><select class="adm-in" data-level aria-label="Ai được xem ${esc(d.title)}">${Object.entries(this.LEVEL).map(([k, v]) => `<option value="${k}"${d.access_level === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input class="adm-in" data-exp value="${esc(d.expired_reason || '')}" placeholder="Còn hiệu lực" aria-label="Lý do hết hiệu lực ${esc(d.title)}">
          ${d.expired_reason ? '<small class="bad-t">Hết hiệu lực</small>' : ''}</td>
        <td><small>${esc(this.date(d.updated_at).slice(0, 10))}</small></td>
      </tr>`).join('')}</tbody></table></div>
      <p class="muted small">Hiệu lực: để trống là còn hiệu lực; nhập lý do (VD "Thay thế bởi QĐ số 12/2026") để gắn nhãn "Hết hiệu lực".</p>`
      : '<div class="empty">Không có văn bản phù hợp.</div>';
  };
  search.addEventListener('input', paint);
  paint();
  tableBox.addEventListener('change', async (e) => {
    const el = e.target, tr = el.closest('tr');
    const d = tr && list.find((x) => x.id === tr.dataset.id);
    if (!d) return;
    let body;
    if (el.matches('[data-level]')) {
      if (el.value !== 'all' && !(await confirmBox(`Chỉ cho "${this.LEVEL[el.value]}" xem ${d.no} · ${d.title}? Nhân viên khác sẽ không thấy văn bản này nữa.`, 'Hạn chế'))) { el.value = d.access_level; return; }
      body = { access_level: el.value };
    } else if (el.matches('[data-exp]')) body = { expired_reason: el.value.trim() };
    else return;
    el.disabled = true;
    try {
      const r = await this.call('PATCH', '/api/admin/documents/' + encodeURIComponent(d.id), body);
      Object.assign(d, r, { updated_at: new Date().toISOString() });
      fbToast(body.access_level ? `${d.no}: ${this.LEVEL[r.access_level]}` : r.expired_reason ? `${d.no}: đã gắn "Hết hiệu lực"` : `${d.no}: còn hiệu lực`);
      paint(); this.paintStats($('#adm-stats'));
    } catch (err) { fbToast(err.message, true); el.value = body.access_level ? d.access_level : d.expired_reason || ''; el.disabled = false; }
  });
};

/* ---------- Tab Nhật ký ---------- */
ADM.auditDetail = function (a) {
  const d = a.detail || {};
  const doc = a.document_id ? `${a.doc_no ? a.doc_no + ' · ' : ''}${a.doc_title || a.document_id}` : '';
  const parts = [];
  switch (a.action) {
    case 'login': if (d.remember) parts.push('Ghi nhớ đăng nhập'); break;
    case 'login_denied': parts.push('Lý do: ' + (this.DENY[d.reason] || d.reason || '?')); if (d.email) parts.push(d.email); if (d.dev) parts.push('đăng nhập thử'); break;
    case 'download_file': parts.push((a.file_path || '').split('/').pop()); if (doc) parts.push(doc); break;
    case 'feedback': parts.push(FB_TYPES[d.type] || d.type || ''); if (doc) parts.push(doc); break;
    case 'reply_feedback': parts.push('Góp ý #' + d.id); if (d.status) parts.push(FB_STATUS[d.status] || d.status); break;
    case 'admin_user':
      if (d.email) parts.push(d.email);
      if (d.role) parts.push('vai trò → ' + (this.ROLE[d.role] || d.role));
      if (d.is_active === false) parts.push('khóa'); if (d.is_active === true) parts.push('mở khóa');
      if (d.department != null) parts.push('phòng ban → ' + (d.department || '—'));
      if (d.full_name) parts.push('họ tên → ' + d.full_name);
      break;
    case 'admin_logout_user': parts.push((d.email || '') + ` (${d.sessions || 0} phiên)`); break;
    case 'edit_doc':
      parts.push(doc);
      if (d.access_level) parts.push('người xem → ' + (this.LEVEL[d.access_level] || d.access_level));
      if ('expired_reason' in d) parts.push(d.expired_reason ? 'hết hiệu lực: ' + d.expired_reason : 'còn hiệu lực');
      break;
    default: if (doc) parts.push(doc);
  }
  return parts.filter(Boolean).join(' · ');
};

ADM.audit = async function (box, q) {
  const f = { action: this.ACTION[q.tk] ? q.tk : '', q: q.ng || '', from: q.tu || '', to: q.den || '', doc: q.doc || '', limit: ['300', '1000', '2000'].includes(q.n) ? q.n : '300' };
  const rows = await this.get('/api/admin/audit' + qs(f));
  const docName = f.doc ? (rows.find((a) => a.document_id === f.doc) || {}).doc_title || f.doc : '';
  box.innerHTML = `
    <form class="panel adm-form adm-filter" id="adm-audit-f">
      <label class="field"><span>Thao tác</span><select name="tk"><option value="">Tất cả</option>${Object.entries(this.ACTION).map(([k, v]) => `<option value="${k}"${f.action === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Người dùng</span><input name="ng" value="${esc(f.q)}" placeholder="Tên hoặc email"></label>
      <label class="field"><span>Từ ngày</span><input name="tu" type="date" value="${esc(f.from)}"></label>
      <label class="field"><span>Đến ngày</span><input name="den" type="date" value="${esc(f.to)}"></label>
      <label class="field"><span>Số dòng</span><select name="n">${['300', '1000', '2000'].map((n) => `<option${f.limit === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="adm-form-btns"><button class="btn btn-primary">Lọc</button><a class="btn btn-ghost" href="#/quan-tri?tab=nhat-ky">Xóa lọc</a></div>
    </form>
    <div class="filters">
      <span class="muted">${rows.length} dòng${rows.length >= Number(f.limit) ? ` (giới hạn ${f.limit} dòng mới nhất)` : ''}${docName ? ` · văn bản: <b>${esc(docName)}</b> <a href="#/quan-tri${qs(Object.assign({ tab: 'nhat-ky' }, { tk: f.action, ng: f.q, tu: f.from, den: f.to }))}">bỏ</a>` : ''}</span>
      <button type="button" class="dl-btn" id="adm-csv"${rows.length ? '' : ' disabled'}>${icon('download', 15)} Xuất Excel (CSV)</button>
    </div>
    ${rows.length ? `<div class="tbl adm-tbl adm-log"><table>
      <thead><tr><th>Thời gian</th><th>Người</th><th>Thao tác</th><th>Chi tiết</th><th>IP</th></tr></thead>
      <tbody>${rows.map((a) => `<tr class="${a.action === 'login_denied' ? 'deny' : ''}">
        <td><small class="nowrap">${esc(this.date(a.at))}</small></td>
        <td>${a.email ? `<b>${esc(a.full_name || a.email)}</b><small>${esc(a.email)}</small>` : '<span class="muted">—</span>'}</td>
        <td><span class="pill${a.action === 'login_denied' ? ' bad' : /^admin|edit_doc|reply/.test(a.action) ? ' brand' : ''}">${esc(this.ACTION[a.action] || a.action)}</span></td>
        <td>${esc(this.auditDetail(a))}</td>
        <td><small>${esc(a.ip || '')}</small></td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Không có hoạt động nào phù hợp.</div>'}`;

  $('#adm-audit-f', box).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    location.hash = '#/quan-tri' + qs({ tab: 'nhat-ky', tk: v.tk, ng: v.ng.trim(), tu: v.tu, den: v.den, n: v.n === '300' ? '' : v.n, doc: f.doc });
  });
  $('#adm-csv', box).addEventListener('click', async () => {
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [['Thời gian', 'Họ tên', 'Email', 'Thao tác', 'Chi tiết', 'IP']]
      .concat(rows.map((a) => [this.date(a.at), a.full_name || '', a.email || '', this.ACTION[a.action] || a.action, this.auditDetail(a), a.ip || '']))
      .map((r) => r.map(cell).join(',')).join('\r\n');
    try {
      if (await Exporter.save(`Nhat-ky-tra-cuu-quy-che-${new Date().toISOString().slice(0, 10)}.csv`, new Blob([csv], { type: 'text/csv' })) === 'saved') fbToast('Đã xuất nhật ký.');
    } catch (e) { fbToast('Không xuất được file.', true); }
  });
};
