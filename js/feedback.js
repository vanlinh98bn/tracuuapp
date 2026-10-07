/* =============================================================
   Phản hồi & góp ý của người dùng
   - Lưu trên kho dữ liệu của trang (claude.ai, quyền "db"):
       feedback/<mã người dùng>  →  { items: { <id>: góp ý } }
     Mỗi người chỉ đọc/ghi hồ sơ của mình; người quản lý trang
     (Chủ sở hữu, Người chỉnh sửa) đọc tất cả và trả lời.
   - Bản chạy với backend (window.API, xem js/auth-server.js): lưu trong
     PostgreSQL qua /api/feedback; HCNS (role admin) quản lý góp ý.
   - Mở file trực tiếp trên máy thì chức năng này tắt.
   ============================================================= */
const FB_TYPES = {
  'noi-dung': 'Góp ý nội dung văn bản',
  'cau-hoi': 'Câu hỏi cần HCNS giải đáp',
  'loi-web': 'Báo lỗi trang web',
  'de-xuat': 'Đề xuất tính năng',
  'huu-ich': 'Đánh giá nhanh văn bản',
};
const FB_STATUS = { moi: 'Mới gửi', 'dang-xu-ly': 'Đang xử lý', xong: 'Đã trả lời' };
const FB_MAX = 2000;

const FB = {
  state: 'loading', // loading | on | off
  offReason: '',
  db: null, user: null, uid: null, admin: false,
  mine: {},   // id → góp ý của tôi
  all: [],    // [{ uid, id, ...item }] (chỉ người quản lý)
  async init() {
    if (window.API) return this.initServer();
    try {
      if (!window.claude || typeof window.claude.use !== 'function') throw new Error('local');
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) throw new Error('cap');
      const uid = await user.id();
      if (!uid) throw new Error('anon');
      Object.assign(this, { db, user, uid, admin: await user.canEdit(), state: 'on' });
      db.doc('feedback/' + uid).onSnapshot((s) => { this.mine = (s.exists && s.data().items) || {}; this.changed(); }, () => {});
      if (this.admin) {
        db.collection('feedback').onSnapshot((snap) => {
          this.all = snap.docs.flatMap((d) => Object.entries((d.data() || {}).items || {}).map(([id, it]) => Object.assign({ uid: d.id, id }, it)));
          this.changed();
        }, () => {});
      }
    } catch (e) {
      this.state = 'off';
      this.offReason = e.message === 'local'
        ? 'Chức năng góp ý chỉ hoạt động khi mở web qua link claude.ai.'
        : 'Bạn cần đăng nhập claude.ai và được chia sẻ quyền "Người đóng góp" (Contributor) trở lên để gửi góp ý.';
    }
    this.changed();
  },
  changed() {
    if (typeof App !== 'undefined' && location.hash.startsWith('#/gop-y')) FB.paint();
    const n = document.getElementById('fbh-links');
    if (n) fbHomeLinks(n);
    // Biết quyền quản lý góp ý sau khi kết nối xong: vẽ lại menu để hiện/ẩn mục "Quản trị"
    if (this.admin !== this.navAdmin) {
      this.navAdmin = this.admin;
      if (typeof App !== 'undefined' && App.last) App.header(App.last.path, App.last.q);
    }
  },
  /* Thêm hoặc cập nhật một góp ý của chính mình (gộp theo id, không ghi đè góp ý khác) */
  async save(id, item) {
    if (window.API) {
      await this.send('POST', '/api/feedback', { type: item.type, doc: item.doc, text: item.text, rating: item.rating });
      return this.refresh();
    }
    const ref = this.db.doc('feedback/' + this.uid);
    const snap = await ref.get();
    if (snap.exists) await ref.update({ items: { [id]: item } });
    else await ref.set({ items: { [id]: item } });
  },
  async reply(uid, id, patch) {
    if (window.API) {
      await this.send('PATCH', '/api/feedback/' + encodeURIComponent(id), { status: patch.status, reply: patch.reply });
      return this.refresh();
    }
    await this.db.doc('feedback/' + uid).update({ items: { [id]: patch } });
  },
  newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  /* ---------- Chế độ máy chủ ---------- */
  async initServer() {
    try { await this.refresh(); this.state = 'on'; } catch (e) {
      this.state = 'off';
      this.offReason = 'Chưa tải được góp ý từ máy chủ. Vui lòng tải lại trang.';
    }
    // Cập nhật góp ý mới mỗi phút khi đang mở trang Góp ý
    setInterval(() => { if (this.state === 'on' && location.hash.startsWith('#/gop-y')) this.refresh().catch(() => {}); }, 60000);
    this.changed();
  },
  async refresh() {
    const r = await fetch('/api/feedback', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('feedback ' + r.status);
    const d = await r.json();
    const names = {};
    (d.all || []).forEach((x) => { names[x.uid] = { name: x.name }; });
    Object.assign(this, { uid: d.uid, admin: d.admin, mine: d.mine || {}, all: d.all || [], user: { profiles: async () => names } });
    this.changed();
  },
  async send(method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const e = new Error('send ' + r.status); e.code = r.status === 401 ? 'unauthenticated' : 'server'; throw e; }
    return r.json();
  },
};
FB.init();

const fbDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fbErr = (e) => (e && e.code === 'quota_exceeded' ? 'Kho góp ý đã đầy. Vui lòng báo Phòng HCNS.' : e && e.code === 'invalid_argument' ? 'Bạn chưa có quyền gửi góp ý trên trang này. Liên hệ người chia sẻ link để được cấp quyền "Người đóng góp".' : 'Chưa gửi được, vui lòng thử lại.');
const stars = (n) => (n ? `<span class="fb-stars" aria-label="${n} sao">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : '');

/* ---------- Khung góp ý gọn trên trang chủ ---------- */
function fbHomeLinks(box) {
  const mine = Object.values(FB.mine || {}).filter((x) => x.type !== 'huu-ich');
  const replied = mine.filter((x) => x.reply).length;
  const waiting = (FB.all || []).filter((x) => x.type !== 'huu-ich' && x.status !== 'xong').length;
  box.innerHTML = [
    mine.length ? `<a href="#/gop-y">Góp ý của bạn (${mine.length}${replied ? ` · ${replied} đã trả lời` : ''})</a>` : '',
    FB.admin ? `<a href="#/gop-y?tab=quan-ly">Quản lý góp ý${waiting ? ` (${waiting} chờ)` : ''}</a>` : '',
  ].filter(Boolean).join('');
}
function fbHomeBlock() {
  const html = `
  <section class="wrap sec" id="gop-y-nhanh">
    <div class="panel fbh">
      <div class="sec-head"><h2>Góp ý cho Phòng HCNS</h2><div class="fbh-links" id="fbh-links"></div></div>
      <form class="fbh-form" id="fbh-form" novalidate>
        <label class="sr-only" for="fbh-type">Loại góp ý</label>
        <select id="fbh-type">${Object.entries(FB_TYPES).filter(([k]) => k !== 'huu-ich').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <label class="sr-only" for="fbh-text">Nội dung</label>
        <textarea id="fbh-text" rows="1" maxlength="${FB_MAX}" placeholder="Câu hỏi, đề xuất hoặc lỗi bạn gặp…"></textarea>
        <button class="btn btn-primary" id="fbh-send">Gửi</button>
      </form>
      <p class="login-err fbh-err" id="fbh-err" role="alert"></p>
    </div>
  </section>`;
  return { html, mount(root) {
    const form = $('#fbh-form', root), text = $('#fbh-text', root), err = $('#fbh-err', root), btn = $('#fbh-send', root);
    fbHomeLinks($('#fbh-links', root));
    // Ô nhập tự cao lên khi gõ nhiều dòng
    text.addEventListener('input', () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 200) + 'px'; err.textContent = ''; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = text.value.trim();
      if (FB.state !== 'on') { err.textContent = FB.state === 'off' ? FB.offReason : 'Đang kết nối, vui lòng thử lại sau giây lát.'; return; }
      if (body.length < 5) { err.textContent = 'Vui lòng nhập nội dung góp ý.'; text.focus(); return; }
      btn.disabled = true; err.textContent = '';
      try {
        await FB.save(FB.newId(), { type: $('#fbh-type', root).value, doc: '', text: body, rating: 0, at: new Date().toISOString(), account: (window.AUTH && AUTH.name) || '', status: 'moi' });
        text.value = ''; text.style.height = '';
        fbToast('Đã gửi góp ý. Phòng HCNS sẽ trả lời tại mục "Góp ý của bạn".');
        fbHomeLinks($('#fbh-links', root));
      } catch (ex) { err.textContent = fbErr(ex); } finally { btn.disabled = false; }
    });
  } };
}

/* ---------- Đánh giá nhanh ở cuối mỗi văn bản ---------- */
function fbHelpfulBox(d) {
  const voted = !!FB.mine['h-' + d.id];
  return `<div class="fb-quick" data-doc="${d.id}"><span>Nội dung này có giúp ích cho bạn không?</span>
    <button type="button" class="btn btn-ghost btn-sm" data-help="1"${voted ? ' disabled' : ''}>👍 ${voted ? 'Bạn đã đánh giá hữu ích' : 'Có'}</button>
    <button type="button" class="btn btn-ghost btn-sm" data-help="0">👎 Chưa</button>
    <a class="btn btn-ghost btn-sm" href="#/gop-y${qs({ vb: d.id })}">Góp ý văn bản này</a><span class="fb-quick-msg" role="status"></span></div>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-help]');
  if (!b) return;
  const box = b.closest('.fb-quick'), msg = $('.fb-quick-msg', box), doc = box.dataset.doc;
  if (b.dataset.help === '0') { location.hash = '#/gop-y' + qs({ vb: doc, loai: 'noi-dung' }); return; }
  if (FB.state !== 'on') { msg.textContent = FB.state === 'off' ? FB.offReason : 'Đang kết nối…'; return; }
  b.disabled = true;
  try {
    await FB.save('h-' + doc, { type: 'huu-ich', doc, rating: 5, text: 'Văn bản hữu ích', at: new Date().toISOString(), account: (window.AUTH && AUTH.name) || '', status: 'xong' });
    msg.textContent = 'Cảm ơn bạn đã phản hồi!';
  } catch (err) { msg.textContent = fbErr(err); b.disabled = false; }
});

/* ---------- Trang Góp ý ---------- */
function viewFeedback(p, q) {
  const tab = q.tab === 'quan-ly' ? 'quan-ly' : '';
  const html = `<div class="wrap page">
    <nav class="crumbs"><a href="#/">Trang chủ</a> / Góp ý</nav>
    <div class="sec-head"><h1>Phản hồi & góp ý</h1><div class="tabs" id="fb-tabs"></div></div>
    <div id="fb-root"><div class="empty">Đang tải…</div></div>
  </div>`;
  return { html, mount() { FB.view = { tab, q }; FB.paint(); } };
}

FB.paint = async function () {
  const root = $('#fb-root');
  if (!root || !this.view) return;
  const { tab, q } = this.view;
  const tabs = $('#fb-tabs');
  if (tabs) tabs.innerHTML = this.admin ? `<a class="${tab ? '' : 'on'}" href="#/gop-y">Gửi góp ý</a><a class="${tab ? 'on' : ''}" href="#/gop-y?tab=quan-ly">Quản lý góp ý <span>${this.all.filter((x) => x.type !== 'huu-ich' && x.status !== 'xong').length} chờ</span></a>` : '';
  if (this.state === 'loading') { root.innerHTML = '<div class="empty">Đang kết nối kho góp ý…</div>'; return; }
  if (this.state === 'off') { root.innerHTML = `<div class="empty">${icon('info', 18)} ${esc(this.offReason)}</div>`; return; }
  if (tab && this.admin) return this.paintAdmin(root, q);
  this.paintForm(root, q);
};

FB.paintForm = function (root, q) {
  // Giữ nội dung đang gõ khi danh sách cập nhật
  const old = $('#fb-form', root);
  if (old) { this.paintMine($('#fb-mine', root)); return; }
  const docs = DOCS_MAIN.concat(LIB.docs.filter((d) => d.group === 'bieu-mau'));
  const vb = LIB.byId[q.vb] ? q.vb : '';
  const loai = FB_TYPES[q.loai] && q.loai !== 'huu-ich' ? q.loai : vb ? 'noi-dung' : '';
  root.innerHTML = `<div class="fb-layout">
    <form class="panel fb-form" id="fb-form" novalidate>
      <h2>Gửi góp ý cho Phòng HCNS</h2>
      <p class="muted small">Góp ý giúp hoàn thiện quy chế và trang tra cứu. Phòng HCNS sẽ xem và trả lời ngay tại đây.</p>
      <label class="field"><span>Loại góp ý</span>
        <select id="fb-type" required><option value="">– Chọn loại –</option>${Object.entries(FB_TYPES).filter(([k]) => k !== 'huu-ich').map(([k, v]) => `<option value="${k}"${loai === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Văn bản liên quan <small class="muted">(không bắt buộc)</small></span>
        <select id="fb-doc"><option value="">– Không chọn –</option>${['quy-che', 'quy-dinh', 'quy-trinh', 'bieu-mau'].map((g) => `<optgroup label="${GROUPS[g].name}">${docs.filter((d) => d.group === g).map((d) => `<option value="${d.id}"${vb === d.id ? ' selected' : ''}>${esc(d.no)} · ${esc(d.title)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="field"><span>Nội dung</span>
        <textarea id="fb-text" rows="6" maxlength="${FB_MAX}" required placeholder="Ví dụ: Điều 7 chưa nói rõ thủ tục xin nghỉ phép, đề nghị bổ sung mẫu đơn…"></textarea>
        <small class="muted fb-count" id="fb-count">0/${FB_MAX}</small></label>
      <fieldset class="field"><legend>Mức độ hài lòng với trang tra cứu <small class="muted">(không bắt buộc)</small></legend>
        <div class="fb-rate" role="radiogroup">${[5, 4, 3, 2, 1].map((n) => `<label><input type="radio" name="fb-rate" value="${n}"><span title="${n} sao">★</span></label>`).join('')}</div></fieldset>
      <p class="login-err" id="fb-err" role="alert"></p>
      <button class="btn btn-primary btn-lg" id="fb-send">${icon('arrow', 18)} Gửi góp ý</button>
    </form>
    <section class="panel" id="fb-mine"></section>
  </div>`;
  const text = $('#fb-text', root), count = $('#fb-count', root), err = $('#fb-err', root), btn = $('#fb-send', root);
  if (q.nd) { text.value = String(q.nd).slice(0, FB_MAX); count.textContent = `${text.value.length}/${FB_MAX}`; } // câu hỏi chuyển từ trợ lý AI
  text.addEventListener('input', () => { count.textContent = `${text.value.length}/${FB_MAX}`; });
  $('#fb-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = $('#fb-type', root).value, body = text.value.trim();
    if (!type) { err.textContent = 'Vui lòng chọn loại góp ý.'; return; }
    if (body.length < 5) { err.textContent = 'Vui lòng nhập nội dung góp ý.'; text.focus(); return; }
    const r = $('input[name=fb-rate]:checked', root);
    btn.disabled = true; err.textContent = '';
    try {
      await FB.save(FB.newId(), { type, doc: $('#fb-doc', root).value, text: body, rating: r ? Number(r.value) : 0, at: new Date().toISOString(), account: (window.AUTH && AUTH.name) || '', status: 'moi' });
      text.value = ''; count.textContent = `0/${FB_MAX}`; if (r) r.checked = false;
      fbToast('Đã gửi góp ý. Cảm ơn bạn!');
    } catch (ex) { err.textContent = fbErr(ex); } finally { btn.disabled = false; }
  });
  this.paintMine($('#fb-mine', root));
};

FB.paintMine = function (box) {
  const list = Object.entries(this.mine).map(([id, it]) => Object.assign({ id }, it)).filter((x) => x.type !== 'huu-ich').sort((a, b) => String(b.at).localeCompare(String(a.at)));
  box.innerHTML = `<h2>Góp ý của bạn <span class="muted small">(${list.length})</span></h2>
    ${list.length ? `<ol class="fb-list">${list.map((x) => fbItem(x, false)).join('')}</ol>` : '<p class="muted">Bạn chưa gửi góp ý nào. Góp ý chỉ bạn và Phòng HCNS xem được.</p>'}`;
};

function fbItem(x, admin, who) {
  const d = x.doc && LIB.byId[x.doc];
  return `<li class="fb-item st-${x.status || 'moi'}" data-uid="${esc(x.uid || '')}" data-id="${esc(x.id)}">
    <div class="fb-top"><span class="fb-type">${esc(FB_TYPES[x.type] || x.type)}</span><span class="fb-st">${esc(FB_STATUS[x.status] || FB_STATUS.moi)}</span>${stars(x.rating)}<time>${fbDate(x.at)}</time></div>
    ${admin ? `<p class="fb-who"><span class="fb-name" data-uid="${esc(x.uid)}">…</span>${x.account ? ` · tài khoản tra cứu: ${esc(x.account)}` : ''}</p>` : ''}
    ${d ? `<a class="fb-doc" href="#/vb/${d.id}">${icon('book', 14)} ${esc(d.no)} · ${esc(d.title)}</a>` : ''}
    <p class="fb-text"></p>
    ${x.reply ? `<div class="fb-reply"><b>Phòng HCNS trả lời</b>${x.repliedAt ? ` <small>${fbDate(x.repliedAt)}</small>` : ''}<p></p></div>` : ''}
    ${admin ? `<form class="fb-answer"><textarea rows="2" maxlength="${FB_MAX}" placeholder="Nhập câu trả lời cho người góp ý…"></textarea>
      <div class="fb-answer-row"><select>${Object.entries(FB_STATUS).map(([k, v]) => `<option value="${k}"${(x.status || 'moi') === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm">Lưu</button><span class="fb-saved muted small" role="status"></span></div></form>` : ''}
  </li>`;
}
/* Nội dung do người dùng nhập: gán bằng textContent */
function fbFill(box, list) {
  list.forEach((x) => {
    const li = box.querySelector(`.fb-item[data-uid="${CSS.escape(x.uid || '')}"][data-id="${CSS.escape(x.id)}"]`);
    if (!li) return;
    $('.fb-text', li).textContent = x.text || '';
    const rp = $('.fb-reply p', li); if (rp) rp.textContent = x.reply;
    const ta = $('.fb-answer textarea', li); if (ta) ta.value = x.reply || '';
  });
}
const _paintMine = FB.paintMine;
FB.paintMine = function (box) { _paintMine.call(this, box); fbFill(box, Object.entries(this.mine).map(([id, it]) => Object.assign({ id, uid: '' }, it))); };

FB.paintAdmin = async function (root, q) {
  if ($('.fb-answer textarea:focus', root)) return; // đang gõ trả lời: không vẽ lại
  const st = FB_STATUS[q.tt] ? q.tt : '';
  const type = FB_TYPES[q.loai] ? q.loai : '';
  const items = this.all.filter((x) => x.type !== 'huu-ich');
  const list = items.filter((x) => (!st || (x.status || 'moi') === st) && (!type || x.type === type)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const votes = {};
  this.all.filter((x) => x.type === 'huu-ich').forEach((x) => { votes[x.doc] = (votes[x.doc] || 0) + 1; });
  const rated = items.filter((x) => x.rating);
  const avg = rated.length ? (rated.reduce((s, x) => s + x.rating, 0) / rated.length).toFixed(1) : '–';
  const link = (o) => '#/gop-y' + qs(Object.assign({ tab: 'quan-ly', tt: st, loai: type }, o));
  root.innerHTML = `<div class="fb-stats">
      <div class="panel"><b>${items.length}</b><span>Góp ý</span></div>
      <div class="panel"><b>${items.filter((x) => (x.status || 'moi') === 'moi').length}</b><span>Mới, chưa xử lý</span></div>
      <div class="panel"><b>${avg}</b><span>Điểm hài lòng TB (${rated.length} lượt)</span></div>
      <div class="panel"><b>${Object.values(votes).reduce((s, n) => s + n, 0)}</b><span>Lượt "hữu ích"</span></div>
    </div>
    <div class="filters">
      <div class="chips"><span class="flabel">Trạng thái</span><a class="chip${st ? '' : ' on'}" href="${link({ tt: '' })}">Tất cả</a>${Object.entries(FB_STATUS).map(([k, v]) => `<a class="chip${st === k ? ' on' : ''}" href="${link({ tt: k })}">${v} (${items.filter((x) => (x.status || 'moi') === k).length})</a>`).join('')}</div>
      <label class="fsel"><span class="flabel">Loại</span><select id="fb-ftype"><option value="">Tất cả</option>${Object.entries(FB_TYPES).filter(([k]) => k !== 'huu-ich').map(([k, v]) => `<option value="${k}"${type === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <button type="button" class="dl-btn" id="fb-csv">${icon('download', 15)} Xuất Excel (CSV)</button>
    </div>
    ${list.length ? `<ol class="fb-list">${list.map((x) => fbItem(x, true)).join('')}</ol>` : '<div class="empty">Chưa có góp ý nào phù hợp.</div>'}
    ${Object.keys(votes).length ? `<section class="panel fb-votes"><h2>Văn bản được đánh giá "hữu ích"</h2><ul>${Object.entries(votes).sort((a, b) => b[1] - a[1]).map(([id, n]) => { const d = LIB.byId[id]; return d ? `<li><a href="#/vb/${id}">${esc(d.no)} · ${esc(d.title)}</a><b>${n}</b></li>` : ''; }).join('')}</ul></section>` : ''}`;
  fbFill(root, list);
  // Tên người góp ý: tra theo mã, không lưu tên vào dữ liệu
  const ids = [...new Set(list.map((x) => x.uid))];
  if (ids.length) {
    const ps = await this.user.profiles(ids);
    $$('.fb-name', root).forEach((el) => { el.textContent = (ps[el.dataset.uid] && ps[el.dataset.uid].name) || 'Người dùng'; });
  }
  $('#fb-ftype', root).addEventListener('change', (e) => { location.hash = link({ loai: e.target.value }); });
  $('#fb-csv', root).addEventListener('click', async () => {
    const ps = ids.length ? await this.user.profiles(ids) : {};
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['Thời gian', 'Người góp ý', 'Tài khoản tra cứu', 'Loại', 'Văn bản', 'Nội dung', 'Hài lòng (sao)', 'Trạng thái', 'Trả lời', 'Ngày trả lời']]
      .concat(list.map((x) => [fbDate(x.at), (ps[x.uid] && ps[x.uid].name) || '', x.account, FB_TYPES[x.type] || x.type, x.doc && LIB.byId[x.doc] ? `${LIB.byId[x.doc].no} · ${LIB.byId[x.doc].title}` : '', x.text, x.rating || '', FB_STATUS[x.status] || FB_STATUS.moi, x.reply, x.repliedAt ? fbDate(x.repliedAt) : '']));
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    try {
      // Exporter.save: dùng quyền tải file của claude.ai nếu có, không thì tải trực tiếp
      if (await Exporter.save(`Gop-y-tra-cuu-quy-che-${new Date().toISOString().slice(0, 10)}.csv`, blob) === 'saved') fbToast('Đã xuất danh sách góp ý.');
    } catch (e) { fbToast('Không xuất được file.', true); }
  });
  $$('.fb-answer', root).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const li = f.closest('.fb-item'), msg = $('.fb-saved', f), btn = $('button', f);
    const reply = $('textarea', f).value.trim(), status = $('select', f).value;
    btn.disabled = true; msg.textContent = 'Đang lưu…';
    try {
      await FB.reply(li.dataset.uid, li.dataset.id, Object.assign({ status }, reply ? { reply, repliedAt: new Date().toISOString(), repliedBy: FB.uid } : {}));
      msg.textContent = 'Đã lưu';
      $('textarea', f).blur();
      FB.paint();
    } catch (ex) { msg.textContent = fbErr(ex); } finally { btn.disabled = false; }
  }));
};

function fbToast(msg, bad) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(fbToast.t); fbToast.t = setTimeout(() => { t.className = 'toast'; }, 3500);
}
