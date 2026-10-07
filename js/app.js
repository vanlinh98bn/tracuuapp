/* =============================================================
   Tra cứu Quy chế – giao diện & điều hướng
   ============================================================= */
const LIB = buildLibrary();
const DOCS_MAIN = LIB.docs.filter((d) => d.group !== 'bieu-mau');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('qc_' + k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('qc_' + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
};
const qs = (o) => { const p = Object.entries(o).filter(([, v]) => v !== '' && v != null); return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : ''; };
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- Icon nét mảnh ---------- */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  scale: '<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
  flow: '<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v4a2 2 0 0 0 2 2H14"/>',
  form: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  excel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 8 8 8M16 8l-8 8"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
};
const icon = (n, s) => `<svg class="ic" width="${s || 18}" height="${s || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const GROUP_ICON = { 'quy-che': 'scale', 'quy-dinh': 'book', 'quy-trinh': 'flow', 'bieu-mau': 'form' };

/* ---------- Tô sáng không phân biệt dấu ---------- */
function termsOf(q) { return fold(q).split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0); }
function ranges(text, terms) {
  const f = fold(text);
  const r = [];
  terms.forEach((t) => { let i = f.indexOf(t); while (i >= 0 && t) { r.push([i, i + t.length]); i = f.indexOf(t, i + t.length); } });
  r.sort((a, b) => a[0] - b[0]);
  const m = [];
  r.forEach((x) => { if (m.length && x[0] <= m[m.length - 1][1]) m[m.length - 1][1] = Math.max(m[m.length - 1][1], x[1]); else m.push(x.slice()); });
  return m;
}
function markHTML(text, terms) {
  if (!terms || !terms.length) return esc(text);
  const chars = Array.from(text);
  let out = '', pos = 0;
  ranges(text, terms).forEach(([a, b]) => { out += esc(chars.slice(pos, a).join('')) + '<mark>' + esc(chars.slice(a, b).join('')) + '</mark>'; pos = b; });
  return out + esc(chars.slice(pos).join(''));
}
function markDOM(root, terms) {
  if (!terms.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const rs = ranges(n.nodeValue, terms);
    if (!rs.length) return;
    const span = document.createElement('span');
    span.innerHTML = markHTML(n.nodeValue, terms);
    n.replaceWith(...span.childNodes);
  });
}

/* ---------- Thành phần dùng chung ---------- */
function groupBadge(g) { return `<span class="gbadge g-${GROUPS[g].color}">${icon(GROUP_ICON[g], 14)} ${GROUPS[g].name}</span>`; }
/* Trạng thái: 'het' (hết hiệu lực – khai báo expired trong catalog), 'moi' (ban hành/sửa đổi trong 12 tháng), 'hieu-luc' */
const NEW_DAYS = 365;
function docStatus(d) {
  if (d.expired) return 'het';
  const u = docUpdated(d);
  return u && Date.now() - u.ts < NEW_DAYS * 864e5 ? 'moi' : 'hieu-luc';
}
function statusBadge(d) {
  const s = docStatus(d);
  return s === 'het' ? `<span class="st st-het" title="${esc(d.expired)}">Hết hiệu lực</span>` : s === 'moi' ? '<span class="st st-moi">Mới cập nhật</span>' : '';
}
function dlButtons(d, cls = 'dl-btn') {
  if (d.missing) return '';
  return `<button type="button" class="${cls}" data-dl="docx" data-id="${d.id}" title="Tải bản Word (.docx)">${icon('download', 15)} Word</button><button type="button" class="${cls}" data-dl="pdf" data-id="${d.id}" title="Tải bản PDF">${icon('download', 15)} PDF</button>`;
}
function sourceLink(doc, find) {
  const d = LIB.byId[doc];
  return d ? `<a class="src-link" href="#/vb/${doc}${qs({ find })}">${icon('book', 14)} ${esc(d.no)} · ${esc(d.title)}${find ? ' – ' + esc(find) : ''}</a>` : '';
}

/* ---------- Trang chủ ---------- */
/* Ngày cập nhật gần nhất của văn bản: lần sửa đổi cuối hoặc ngày ban hành */
function docUpdated(d) {
  let best = null;
  (d.meta.revisions || []).map((r) => r.date).concat(d.meta.date || '').forEach((s) => {
    const m = String(s).match(/(\d{1,3})\/(\d{1,2})\/(\d{4})/);
    if (!m) return;
    const day = Number(m[1]) % 100, mon = Number(m[2]), yr = Number(m[3]);
    const ts = new Date(yr, mon - 1, day).getTime();
    if (!best || ts > best.ts) best = { ts, label: `${String(day).padStart(2, '0')}/${String(mon).padStart(2, '0')}/${yr}` };
  });
  return best;
}
function viewHome(p, q = {}) {
  const docs = docsBlock(q);
  const forms = formsBlock(q);
  const fbBox = fbHomeBlock();
  const hints = ['lương thử việc', 'nghỉ phép', 'thai sản', 'tạm ứng', 'kỷ luật', 'khen thưởng'];
  const html = `
  <section class="hero hero-photo-bg">
    <div class="hero-photo" role="img" aria-label="Phối cảnh dự án chung cư nhà ở xã hội Cát Tường"></div>
    <div class="wrap hero-in hero-cols">
     <div class="hero-main">
      <p class="eyebrow">${esc(COMPANY.name)} · ${esc(COMPANY.unit)}</p>
      <h1>Tra cứu quy chế, quy định nội bộ</h1>
      <p class="hero-sub">Tìm theo từ khóa, đọc theo từng điều khoản, xem biểu mẫu kèm theo.</p>
      <form class="big-search" id="home-search" role="search">
        ${icon('search', 22)}<label class="sr-only" for="home-q">Từ khóa</label>
        <input id="home-q" name="q" placeholder="Nhập từ khóa, ví dụ: lương thử việc, công tác phí…" autocomplete="off">
        <button class="btn btn-gold">Tìm kiếm</button>
      </form>
      <div class="hints">Gợi ý: ${hints.map((h) => `<a href="#/tim${qs({ q: h })}">${esc(h)}</a>`).join('')}</div>
     </div>
    </div>
  </section>

${docs.html}
${forms.html}
  <section class="wrap sec">
    <div class="panel quick-panel">
      <div class="sec-head"><h2>Tra cứu nhanh</h2>
        <div class="quick-tabs" role="group" aria-label="Lọc theo chủ đề">
          <button type="button" class="on" data-topic="">Tất cả</button>${Object.entries(QUICK_TOPICS).map(([k, v]) => `<button type="button" data-topic="${k}">${esc(v)}</button>`).join('')}
        </div></div>
      <div class="quick-list">${QUICK.map((x) => `
        <details class="qa" data-topic="${x.topic}">
          <summary><span>${esc(x.q)}</span>${icon('chev', 18)}</summary>
          <div class="qa-a"><p>${esc(x.a)}</p>
            <a href="#/vb/${x.doc}${qs({ find: x.find })}">${esc(x.find)} · ${esc(LIB.byId[x.doc].title)} ${icon('arrow', 14)}</a></div>
        </details>`).join('')}</div>
      <button type="button" class="quick-more" hidden></button>
    </div>
  </section>
${fbBox.html}`;
  return { html, mount(root) {
    $('#home-search', root).addEventListener('submit', (e) => { e.preventDefault(); const q = $('#home-q', root).value.trim(); if (q) location.hash = '#/tim' + qs({ q }); });
    attachSuggest($('#home-search', root), $('#home-q', root));
    docs.mount(root);
    forms.mount(root);
    fbBox.mount(root);
    // Tra cứu nhanh: mỗi lúc chỉ mở một câu; lọc theo chủ đề; mặc định chỉ hiện vài câu đầu
    const QUICK_SHOW = 4;
    const qa = $$('.qa', root);
    const more = $('.quick-more', root);
    let topic = '', expanded = false;
    const render = () => {
      const match = qa.filter((d) => !topic || d.dataset.topic === topic);
      qa.forEach((d) => { d.hidden = !match.includes(d) || (!expanded && match.indexOf(d) >= QUICK_SHOW); if (d.hidden) d.open = false; });
      more.hidden = match.length <= QUICK_SHOW;
      more.textContent = expanded ? 'Thu gọn' : `Xem thêm ${match.length - QUICK_SHOW} câu hỏi`;
    };
    qa.forEach((d) => d.addEventListener('toggle', () => { if (d.open) qa.forEach((o) => { if (o !== d) o.open = false; }); }));
    $$('.quick-tabs button', root).forEach((b) => b.addEventListener('click', () => {
      $$('.quick-tabs button', root).forEach((x) => x.classList.toggle('on', x === b));
      topic = b.dataset.topic; expanded = false; render();
    }));
    more.addEventListener('click', () => { expanded = !expanded; render(); });
    render();
  } };
}
/* ---------- Văn bản trên trang chủ: thư mục Quy chế / Quy định / Quy trình ----------
   Thư mục đóng sẵn, bấm vào mới hiện văn bản. q.nhom = thư mục cần mở sẵn (link #/van-ban?nhom=…). */
function docsBlock(q) {
  const groups = Object.entries(GROUPS).filter(([k]) => k !== 'bieu-mau')
    .map(([k, g]) => ({ k, g, docs: DOCS_MAIN.filter((d) => d.group === k) })).filter((x) => x.docs.length);
  const html = `
  <section class="wrap sec" id="van-ban">
    <div class="panel docs-panel">
      <div class="sec-head"><h2>Văn bản</h2><span class="muted">${DOCS_MAIN.length} văn bản · ${groups.length} thư mục</span></div>
      <div class="forms-bar">
        <label class="mini-search">${icon('search', 16)}<span class="sr-only">Lọc văn bản</span><input id="dc-q" placeholder="Lọc theo tên hoặc số hiệu, ví dụ: lương, 15…" autocomplete="off"></label>
      </div>
      <div class="folders">${groups.map(({ k, g, docs }) => `
        <details class="folder-group" data-group="${k}"${q.nhom === k ? ' open' : ''}>
          <summary class="folder-head"><span class="folder-ic g-${g.color}">${icon(GROUP_ICON[k], 22)}</span><div class="grow"><h3>${esc(g.name)}</h3><p>${esc(g.desc || '')}</p></div><span class="folder-n">${docs.length} văn bản</span>${icon('chev', 18)}</summary>
          <ul class="upd-mini doc-folder-list">${docs.map((d) => { const u = docUpdated(d); return `<li><a href="#/vb/${d.id}">
            <span class="doc-no sm g-${g.color}">${esc(d.no)}</span>
            <span class="grow"><b>${esc(d.title)} ${statusBadge(d)}</b><small>${esc(d.summary || (d.meta.issue ? 'Lần ban hành ' + d.meta.issue : ''))}</small></span>
            ${u ? `<time>${u.label}</time>` : ''}</a></li>`; }).join('')}</ul>
        </details>`).join('')}</div>
      <div class="empty" id="dc-empty" hidden>Không có văn bản khớp. Thử <a href="#/tim" id="dc-search">tìm trong nội dung văn bản</a>.</div>
    </div>
  </section>`;
  return { html, mount(root) {
    const box = $('#van-ban', root), input = $('#dc-q', box), folders = $$('.folder-group', box);
    input.addEventListener('input', () => {
      const t = fold(input.value.trim());
      let any = false;
      folders.forEach((f) => {
        let hits = 0;
        $$('li', f).forEach((li) => { const ok = !t || fold(li.textContent).includes(t); li.hidden = !ok; if (ok) hits++; });
        f.hidden = !hits; f.open = !!t && hits > 0; if (hits) any = true;
      });
      $('#dc-empty', box).hidden = any;
      $('#dc-search', box).href = '#/tim' + qs({ q: input.value.trim() });
    });
    if (q.toDocs) setTimeout(() => box.scrollIntoView({ block: 'start' }), 60);
  } };
}
/* Link cũ #/van-ban?nhom=…: mở trang chủ, mở sẵn thư mục và cuộn tới khối Văn bản */
function viewLibrary(p, q) { return viewHome(p, Object.assign({}, q, { toDocs: 1 })); }

/* ---------- Hiển thị nội dung văn bản ---------- */
function renderItems(items) {
  let html = '', list = null;
  const close = () => { if (list) { html += '</ul>'; list = null; } };
  items.forEach((it) => {
    if (it.kind === 'li' || it.kind === 'li2') {
      if (!list) { html += '<ul class="d-list">'; list = true; }
      html += `<li class="${it.kind === 'li2' ? 'sub' : ''}">${esc(it.text)}</li>`;
      return;
    }
    close();
    if (it.kind === 'h1') html += `<h2 class="d-h1" id="${it.id}">${esc(it.text)}</h2>`;
    else if (it.kind === 'h2') html += `<h3 class="d-h2" id="${it.id}">${esc(it.text)}</h3>`;
    else if (it.kind === 'h3') html += `<h4 class="d-h3" id="${it.id}">${esc(it.text)}</h4>`;
    else if (it.kind === 'pn') html += `<p class="pn">${esc(it.text)}</p>`;
    else if (it.kind === 'p') html += `<p class="${it.center ? 'center' : ''}">${esc(it.text)}</p>`;
    else if (it.kind === 'table') {
      const cols = Math.max(...it.rows.map((r) => r.length));
      html += `<div class="tbl"><table>${it.rows.map((r, i) => `<tr>${r.map((c, k) => { const tag = i === 0 && it.rows.length > 1 ? 'th' : 'td'; const span = k === r.length - 1 && r.length < cols ? ` colspan="${cols - r.length + 1}"` : ''; return `<${tag}${span}>${esc(c).replace(/\n/g, '<br>')}</${tag}>`; }).join('')}</tr>`).join('')}</table></div>${it.hidden ? `<p class="muted small">… và ${it.hidden} dòng trống của mẫu.</p>` : ''}`;
    } else if (it.kind === 'flow') {
      html += `<ol class="flow">${it.steps.map((s) => {
        const lines = s.desc.split('\n');
        const main = lines.filter((l) => !/^(BM|Biểu mẫu|\+\s*\d)/i.test(l.trim()));
        const forms = lines.filter((l) => /^(BM|\+\s*\d)/i.test(l.trim())).map((l) => l.replace(/^(BM:?|\+)\s*/i, ''));
        return `<li><div class="step-body"><div class="step-top"><span class="actor">${esc(s.actor)}</span>${s.time ? `<span class="time">${icon('clock', 13)} ${esc(s.time)}</span>` : ''}</div>
          <p>${main.map(esc).join('<br>')}</p>${forms.length ? `<div class="step-forms">${forms.map((f) => `<span>${icon('form', 13)} ${esc(f)}</span>`).join('')}</div>` : ''}</div></li>`;
      }).join('')}</ol>`;
    }
  });
  close();
  return html;
}

function viewDoc(p, q) {
  const d = LIB.byId[p.id];
  if (!d) return notFound();
  const recent = [d.id].concat(store.get('recent', []).filter((x) => x !== d.id)).slice(0, 8);
  store.set('recent', recent);
  const toc = d.items.filter((it) => it.kind === 'h1' || it.kind === 'h2');
  const parent = d.parent && LIB.byId[d.parent];
  const sig = d.meta.signers;
  const html = `<div class="wrap page">
    <nav class="crumbs"><a href="#/">Trang chủ</a> / ${d.group === 'bieu-mau' ? `<a href="#/bieu-mau${qs({ mo: d.parent })}">Biểu mẫu</a>` : `<a href="#/van-ban${qs({ nhom: d.group })}">${GROUPS[d.group].name}</a>`} / ${esc(d.no)}</nav>
    <header class="doc-head">
      <div class="doc-head-top">${groupBadge(d.group)}<span class="muted">Số hiệu ${esc(d.no)}</span></div>
      <h1>${esc(d.title)}</h1>
      ${d.summary ? `<p class="lead">${esc(d.summary)}</p>` : ''}
      ${parent ? `<p class="lead">Biểu mẫu dùng trong <a href="#/vb/${parent.id}">${esc(parent.no)} · ${esc(parent.title)}</a>.</p>` : ''}
      <div class="meta-chips">
        ${d.meta.code ? `<span><small>Mã số</small>${esc(d.meta.code)}</span>` : ''}
        ${d.meta.issue ? `<span><small>Lần ban hành</small>${esc(d.meta.issue)}</span>` : ''}
        ${d.meta.date ? `<span><small>Ngày ban hành</small>${esc(d.meta.date)}</span>` : ''}
        ${d.meta.decision ? `<span class="wide"><small>Quyết định</small>${esc(d.meta.decision)}</span>` : ''}
      </div>
      <div class="doc-tools" role="group" aria-label="Công cụ đọc">
        <span class="muted small">Cỡ chữ</span>
        <button type="button" class="tool" data-fs="-1" aria-label="Giảm cỡ chữ">A−</button>
        <button type="button" class="tool" data-fs="0" aria-label="Cỡ chữ mặc định">A</button>
        <button type="button" class="tool" data-fs="1" aria-label="Tăng cỡ chữ">A+</button>
        ${d.missing ? '' : `<span class="muted small tool-sep">Tải về</span>${dlButtons(d, 'tool')}`}      </div>
      ${(d.notes || []).map((n) => `<div class="note">${icon('warn', 16)} <span>${esc(n)}</span></div>`).join('')}
      ${q.q ? `<div class="note info">${icon('search', 16)} <span>Đang tô sáng: <b>${esc(q.q)}</b> · <a href="#/vb/${d.id}">Bỏ tô sáng</a></span></div>` : ''}
    </header>
    <div class="doc-layout${toc.length ? '' : ' no-toc'}">
      ${toc.length ? `<nav class="toc" aria-label="Mục lục"><details open><summary>Mục lục</summary><ol>${toc.map((t) => `<li class="${t.kind}"><button data-goto="${t.id}">${esc(t.text)}</button></li>`).join('')}</ol></details></nav>` : ''}
      <article class="doc-body" id="doc-body">
        ${d.missing ? '<div class="empty">Chưa đọc được nội dung văn bản này. Hãy chạy lại công cụ cập nhật dữ liệu.</div>' : renderItems(d.items)}
        ${d.appendix.length ? `<details class="appendix"><summary>${icon('form', 16)} Mẫu biểu kèm theo trong văn bản</summary><div class="appendix-in">${renderItems(d.appendix)}</div></details>` : ''}
        ${fbHelpfulBox(d)}
        ${docPager(d)}
      </article>
      <aside class="doc-side">
        ${d.forms.length ? `<div class="side-card"><h3>Biểu mẫu kèm theo</h3><ul class="form-list">${d.forms.map(formItem).join('')}</ul></div>` : ''}
        <div class="side-card"><h3>Thông tin văn bản</h3>
          <dl class="kv">
            ${sig ? `<dt>Soạn thảo</dt><dd>${esc(sig.draft || '—')}</dd><dt>Xem xét</dt><dd>${esc(sig.review || '—')}</dd><dt>Phê duyệt</dt><dd>${esc(sig.approve || '—')}</dd>` : ''}
            ${d.meta.attached && !/\.{4,}/.test(d.meta.attached) ? `<dt>Ban hành</dt><dd>${esc(d.meta.attached)}</dd>` : ''}
            <dt>File gốc</dt><dd class="path">${esc(COMPANY.source)}/${esc(d.file)}</dd>
            ${d.modified ? `<dt>Sửa lần cuối</dt><dd>${esc(d.modified.split('-').reverse().join('/'))}</dd>` : ''}
          </dl>
          ${d.meta.revisions.length ? `<h4>Lịch sử sửa đổi</h4><ol class="revs">${d.meta.revisions.map((r) => `<li><b>Lần ${esc(r.issue || '?')}</b> · ${esc(r.date)}<span>${esc(r.note || '')}</span></li>`).join('')}</ol>` : ''}
        </div>
      </aside>
    </div>
    ${toc.length ? `<button type="button" class="toc-fab" id="toc-fab" aria-controls="toc" aria-expanded="false">${icon('list', 18)} Mục lục</button><div class="toc-backdrop" id="toc-bd" hidden></div>` : ''}
  </div>`;
  return { html, mount(root) {
    const body = $('#doc-body', root);
    // Cỡ chữ (nhớ theo trình duyệt)
    const applyFs = (v) => { body.style.setProperty('--doc-fs', v + 'px'); };
    let fs = store.get('fs', 16);
    applyFs(fs);
    $$('[data-fs]', root).forEach((b) => b.addEventListener('click', () => {
      const s = Number(b.dataset.fs);
      fs = s === 0 ? 16 : Math.min(22, Math.max(14, fs + s));
      store.set('fs', fs); applyFs(fs);
    }));
    // Mục lục dạng bảng trượt trên điện thoại
    const tocEl = $('.toc', root), fab = $('#toc-fab', root), bd = $('#toc-bd', root);
    const setToc = (open) => { if (!tocEl) return; tocEl.classList.toggle('open', open); bd.hidden = !open; fab.setAttribute('aria-expanded', open); };
    if (fab) { tocEl.id = 'toc'; fab.addEventListener('click', () => setToc(!tocEl.classList.contains('open'))); bd.addEventListener('click', () => setToc(false)); }
    $$('[data-goto]', root).forEach((b) => b.addEventListener('click', () => { setToc(false); const el = document.getElementById(b.dataset.goto); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    // Thanh tiến độ đọc
    const onScroll = () => {
      const bar = $('#read-prog');
      if (!bar) return;
      const r = body.getBoundingClientRect();
      const total = r.height - window.innerHeight + 120;
      bar.style.width = Math.max(0, Math.min(100, ((120 - r.top) / Math.max(1, total)) * 100)) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    App.cleanups.push(() => { window.removeEventListener('scroll', onScroll); const bar = $('#read-prog'); if (bar) bar.style.width = '0'; });
    let target = null;
    if (q.muc) target = document.getElementById(q.muc);
    if (!target && q.find) {
      const f = fold(q.find);
      target = $$('h2,h3,h4', body).find((h) => fold(h.textContent).includes(f)) || $$('p,li,td,.flow li', body).find((h) => fold(h.textContent).includes(f));
      if (target && target.closest('details') && !target.closest('details').open) target.closest('details').open = true;
    }
    if (q.q) {
      markDOM(body, termsOf(q.q));
      if (!target) target = $('mark', body);
      if (target && target.closest('details')) target.closest('details').open = true;
    }
    if (target) { target.classList.add('flash'); setTimeout(() => target.scrollIntoView({ block: 'start' }), 60); }
    // Tô mục đang đọc trong mục lục
    const links = new Map($$('[data-goto]', root).map((b) => [b.dataset.goto, b]));
    if (links.size && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { links.forEach((b) => b.classList.remove('on')); const b = links.get(e.target.id); if (b) b.classList.add('on'); } }), { rootMargin: '-80px 0px -70% 0px' });
      links.forEach((b, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
      App.cleanups.push(() => io.disconnect());
    }
  } };
}
/* Nút sang văn bản trước / tiếp theo cùng nhóm */
function docPager(d) {
  const list = d.group === 'bieu-mau' ? LIB.docs.filter((x) => x.group === 'bieu-mau') : DOCS_MAIN;
  const i = list.indexOf(d);
  const prev = list[i - 1], next = list[i + 1];
  if (!prev && !next) return '';
  const card = (x, dir) => x ? `<a class="pg pg-${dir}" href="#/vb/${x.id}"><small>${dir === 'prev' ? icon('left', 14) + ' Văn bản trước' : 'Văn bản tiếp theo ' + icon('arrow', 14)}</small><b>${esc(x.no)} · ${esc(x.title)}</b></a>` : '<span></span>';
  return `<nav class="doc-pager" aria-label="Chuyển văn bản">${card(prev, 'prev')}${card(next, 'next')}</nav>`;
}

/* ---------- Ô tìm kiếm có gợi ý khi gõ ---------- */
function attachSuggest(form, input) {
  if (!form || !input) return;
  form.classList.add('has-suggest');
  const box = document.createElement('div');
  box.className = 'suggest';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  form.appendChild(box);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');
  let items = [], active = -1;
  const close = () => { box.hidden = true; active = -1; };
  const go = (href) => { close(); location.hash = href; };
  const render = () => {
    const v = input.value.trim();
    const terms = termsOf(v);
    if (!terms.length) { close(); return; }
    const has = (s) => { const f = fold(s); return terms.every((t) => f.includes(t)); };
    const docs = LIB.docs.filter((d) => has(`${d.no} ${d.title} ${(d.tags || []).join(' ')}`)).slice(0, 5);
    const quick = QUICK.filter((x) => has(`${x.q} ${x.a}`)).slice(0, 3);
    const content = LIB.index.filter((c) => !c.isTitle && terms.every((t) => c.f.includes(t)) && !docs.some((d) => d.id === c.doc)).slice(0, 3);
    items = [];
    let html = '';
    const sec = (title, rows) => { if (rows.length) html += `<div class="sg-sec">${title}</div>` + rows.join(''); };
    sec('Văn bản', docs.map((d) => { items.push(`#/vb/${d.id}`); return `<a class="sg-item" data-i="${items.length - 1}" href="#/vb/${d.id}"><span class="sg-no g-${GROUPS[d.group].color}">${esc(d.no)}</span><span>${markHTML(d.title, terms)}</span></a>`; }));
    sec('Tra cứu nhanh', quick.map((x) => { const h = `#/vb/${x.doc}${qs({ find: x.find })}`; items.push(h); return `<a class="sg-item" data-i="${items.length - 1}" href="${h}"><span class="sg-q">?</span><span><b>${markHTML(x.q, terms)}</b><small>${esc(x.a)}</small></span></a>`; }));
    sec('Trong nội dung', content.map((c) => { const h = `#/vb/${c.doc}${qs({ muc: c.headId, q: v })}`; items.push(h); return `<a class="sg-item" data-i="${items.length - 1}" href="${h}">${icon('book', 15)}<span>${markHTML(c.head, terms)}<small>${esc(LIB.byId[c.doc].no)} · ${esc(LIB.byId[c.doc].title)}</small></span></a>`; }));
    const all = `#/tim${qs({ q: v })}`;
    items.push(all);
    html += `<a class="sg-item sg-all" data-i="${items.length - 1}" href="${all}">${icon('search', 15)}<span>Xem tất cả kết quả cho "<b>${esc(v)}</b>"</span><kbd>Enter</kbd></a>`;
    box.innerHTML = html;
    box.hidden = false;
    active = -1;
  };
  const highlight = () => $$('.sg-item', box).forEach((a, k) => a.classList.toggle('on', k === active));
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 120); });
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; highlight(); }
    else if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(items[active]); }
  });
  box.addEventListener('mousedown', (e) => e.preventDefault()); // giữ focus khi bấm gợi ý
  box.addEventListener('click', (e) => { const a = e.target.closest('.sg-item'); if (a) { e.preventDefault(); go(items[Number(a.dataset.i)]); } });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

function formItem(f) {
  if (f.kind === 'doc') return `<li><a href="#/vb/${f.id}">${icon('form', 15)} <span><b>${esc(f.no)}</b> ${esc(f.title)}</span></a></li>`;
  if (f.private) return `<li class="xls off">${icon('lock', 15)} <span><b>${esc(f.no)}</b> ${esc(f.title)}<small>Excel · chứa thông tin cá nhân, không đăng lên web · liên hệ ${esc(COMPANY.unit)} để lấy mẫu</small></span></li>`;
  if (!f.sheets) return `<li class="xls">${icon('excel', 15)} <span><b>${esc(f.no)}</b> ${esc(f.title)}<small>Excel · ${f.kb} KB · chưa đọc được nội dung, xem tại ${esc(COMPANY.source)}</small></span></li>`;
  return `<li class="xls"><a href="#/bm/${f.id}">${icon('excel', 15)} <span><b>${esc(f.no)}</b> ${esc(f.title)}<small>Excel · ${f.sheets.length} sheet · ${f.kb} KB · xem trên web${f.blob ? ', tải file gốc' : ''}</small></span></a></li>`;
}

/* ---------- Hộp xác nhận trong trang (trang nhúng trên claude.ai không hiện confirm() của trình duyệt) ---------- */
function confirmBox(message, okLabel = 'Đồng ý') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'cbox-backdrop';
    wrap.innerHTML = `<div class="cbox" role="alertdialog" aria-modal="true" aria-labelledby="cbox-msg">
      <p id="cbox-msg"></p>
      <div class="cbox-actions"><button type="button" class="btn btn-ghost" data-v="0">Hủy</button><button type="button" class="btn btn-primary" data-v="1"></button></div></div>`;
    $('#cbox-msg', wrap).textContent = message;
    $('[data-v="1"]', wrap).textContent = okLabel;
    const done = (v) => { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === wrap) done(false); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    $('[data-v="1"]', wrap).focus();
  });
}

/* ---------- Xem biểu mẫu Excel ---------- */
function findSheetForm(id) {
  for (const d of LIB.docs) { const f = (d.forms || []).find((x) => x.kind === 'excel' && x.id === id); if (f) return f; }
  return null;
}
function sheetTable(sh) {
  const cols = Math.max(1, ...sh.rows.map((r) => r.length));
  return `<div class="tbl xls-tbl"><table>${sh.rows.map((r) => `<tr>${Array.from({ length: cols }, (_, k) => `<td>${esc(r[k] || '').replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</table></div>
    ${sh.truncated ? `<p class="muted small">Sheet dài, web chỉ hiển thị 400 dòng đầu. Tải file gốc để xem đầy đủ.</p>` : ''}`;
}
function viewSheet(p, q) {
  const f = findSheetForm(p.id);
  if (!f || f.private || !f.sheets) return notFound();
  const owner = LIB.byId[f.owner];
  const idx = Math.min(Math.max(0, Number(q.sheet) || 0), f.sheets.length - 1);
  const html = `<div class="wrap page">
    <nav class="crumbs"><a href="#/">Trang chủ</a> / <a href="#/bieu-mau${qs({ mo: f.owner })}">Biểu mẫu</a> / ${esc(f.no)}</nav>
    <header class="doc-head">
      <div class="doc-head-top">${groupBadge('bieu-mau')}<span class="muted">Số hiệu ${esc(f.no)} · Excel</span></div>
      <h1>${esc(f.title)}</h1>
      ${owner ? `<p class="lead">Biểu mẫu dùng trong <a href="#/vb/${owner.id}">${esc(owner.no)} · ${esc(owner.title)}</a>.</p>` : ''}
      <div class="doc-tools">${f.blob ? `<button type="button" class="tool" id="xls-dl">${icon('download', 15)} Tải file Excel gốc (${f.blob.kb} KB)</button>` : `<span class="muted small">File gốc lưu tại ${esc(COMPANY.source)}.</span>`}</div>
    </header>
    ${f.sheets.length > 1 ? `<div class="tabs sheet-tabs">${f.sheets.map((s, i) => `<a class="${i === idx ? 'on' : ''}" href="#/bm/${f.id}${qs({ sheet: i || '' })}">${esc(s.name)}</a>`).join('')}</div>` : ''}
    <section class="panel xls-panel"><h2 class="xls-name">${icon('excel', 18)} ${esc(f.sheets[idx].name)}</h2>${sheetTable(f.sheets[idx])}</section>
    <p class="muted small">Nội dung hiển thị dạng bảng, không giữ định dạng ô gộp, màu và công thức. Dùng file gốc khi cần điền hoặc in.</p>
  </div>`;
  return { html, mount(root) {
    const b = $('#xls-dl', root);
    if (b) b.addEventListener('click', async () => {
      const label = b.innerHTML; b.disabled = true; b.textContent = 'Đang chuẩn bị file…';
      try {
        const bytes = await window.AUTH.openFile(f.blob.id);
        if (await Exporter.save(f.blob.name, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })) === 'saved') Exporter.toast('Đã tải ' + f.blob.name);
      } catch (e) { Exporter.toast(e.message || 'Không tải được file', true); } finally { b.disabled = false; b.innerHTML = label; }
    });
  } };
}

/* ---------- Tìm kiếm toàn văn ---------- */
function viewSearch(p, q) {
  const query = (q.q || '').trim();
  const terms = termsOf(query);
  let groups = [];
  if (terms.length) {
    const hits = LIB.index.filter((c) => terms.every((t) => c.f.includes(t))).map((c) => {
      const hf = fold(c.head);
      let score = c.isTitle ? 8 : 0;
      terms.forEach((t) => { score += (c.f.split(t).length - 1) + (hf.includes(t) ? 5 : 0); });
      return Object.assign({ score }, c);
    });
    const byDoc = {};
    hits.forEach((h) => { (byDoc[h.doc] = byDoc[h.doc] || []).push(h); });
    groups = Object.entries(byDoc).map(([doc, hs]) => ({ doc: LIB.byId[doc], hits: hs.sort((a, b) => b.score - a.score), score: Math.max(...hs.map((h) => h.score)) + hs.length }))
      .sort((a, b) => b.score - a.score);
  }
  const snippet = (text) => {
    const f = fold(text);
    const at = Math.min(...terms.map((t) => { const i = f.indexOf(t); return i < 0 ? Infinity : i; }));
    const chars = Array.from(text);
    const s = Math.max(0, (isFinite(at) ? at : 0) - 70);
    const part = chars.slice(s, s + 230).join('');
    return (s > 0 ? '… ' : '') + markHTML(part, terms) + (s + 230 < chars.length ? ' …' : '');
  };
  const total = groups.reduce((s, g) => s + g.hits.length, 0);
  const html = `<div class="wrap page">
    <nav class="crumbs"><a href="#/">Trang chủ</a> / Tìm kiếm</nav>
    <form class="big-search inline" id="s-form" role="search">${icon('search', 20)}<label class="sr-only" for="s-q">Từ khóa</label><input id="s-q" value="${esc(query)}" placeholder="Nhập từ khóa…" autocomplete="off"><button class="btn btn-primary">Tìm</button></form>
    ${!terms.length ? '<div class="empty">Nhập từ khóa để tìm trong toàn bộ nội dung quy chế, quy định, quy trình và biểu mẫu. Có thể gõ không dấu.</div>'
      : groups.length ? `<p class="muted">Tìm thấy <b>${total}</b> đoạn trong <b>${groups.length}</b> văn bản cho "${esc(query)}"</p>
      <div class="results">${groups.map((g) => `<section class="res">
        <a class="res-title" href="#/vb/${g.doc.id}${qs({ q: query })}">${groupBadge(g.doc.group)} <b>${esc(g.doc.no)} · ${markHTML(g.doc.title, terms)}</b></a>
        ${g.hits.filter((h) => !h.isTitle).slice(0, 4).map((h) => `<a class="hit" href="#/vb/${g.doc.id}${qs({ muc: h.headId, q: query })}"><b>${markHTML(h.head, terms)}</b><span>${snippet(h.text)}</span></a>`).join('')}
        ${g.hits.filter((h) => !h.isTitle).length > 4 ? `<a class="more" href="#/vb/${g.doc.id}${qs({ q: query })}">+ ${g.hits.filter((h) => !h.isTitle).length - 4} đoạn khác trong văn bản</a>` : ''}
      </section>`).join('')}</div>`
      : `<div class="empty">Không tìm thấy nội dung khớp "${esc(query)}". Thử từ khóa ngắn hơn hoặc từ đồng nghĩa (ví dụ "phụ cấp" thay cho "trợ cấp").</div>`}
  </div>`;
  return { html, mount(root) {
    $('#s-form', root).addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/tim' + qs({ q: $('#s-q', root).value.trim() }); });
    attachSuggest($('#s-form', root), $('#s-q', root));
    if (!query) setTimeout(() => $('#s-q', root).focus(), 50);
  } };
}

/* ---------- Biểu mẫu ---------- */
/* Thư mục biểu mẫu: lĩnh vực → văn bản (thư mục con) → file. Văn bản có biểu mẫu nhưng chưa xếp vào đâu tự vào "Khác". */
const FORM_FOLDERS = [
  { id: 'nhan-su', name: 'Nhân sự', desc: 'Tuyển dụng, tiếp nhận, đào tạo, đánh giá và chấm dứt hợp đồng', docs: ['tuyen-dung', 'tiep-nhan-ns', 'dao-tao', 'sa-thai'] },
  { id: 'tai-san', name: 'Tài sản & thiết bị', desc: 'Xe ô tô, máy móc thiết bị, công cụ dụng cụ, văn phòng phẩm', docs: ['xe-o-to', 'bao-duong-mmtb', 'mmtb-ccdc', 'may-moc', 'van-phong-pham'] },
  { id: 'hanh-chinh', name: 'Hành chính – lưu trữ', desc: 'Lưu trữ, mượn trả hồ sơ, công văn, con dấu', docs: ['luu-tru', 'muon-tra-ho-so', 'cong-van-den', 'cong-van-di-den', 'con-dau'] },
];
/* Khối Biểu mẫu trên trang chủ: thư mục lớn đóng sẵn, bấm vào mới hiện thư mục con.
   q.mo = mã văn bản hoặc mã thư mục cần mở sẵn (link từ trang văn bản). */
function formsBlock(q) {
  const owners = DOCS_MAIN.filter((d) => d.forms.length);
  const placed = new Set(FORM_FOLDERS.flatMap((f) => f.docs));
  const folders = FORM_FOLDERS.concat([{ id: 'khac', name: 'Khác', desc: 'Biểu mẫu kèm các văn bản khác', docs: owners.map((d) => d.id).filter((id) => !placed.has(id)) }])
    .map((f) => Object.assign({}, f, { docs: f.docs.map((id) => LIB.byId[id]).filter((d) => d && d.forms.length) }))
    .filter((f) => f.docs.length);
  const count = (forms) => {
    const w = forms.filter((x) => x.kind === 'doc').length, x = forms.filter((x) => x.kind === 'excel').length;
    return [w ? `${w} Word` : '', x ? `${x} Excel` : ''].filter(Boolean).join(' · ');
  };
  const total = owners.reduce((s, d) => s + d.forms.length, 0);
  const openFolder = (f) => q.mo === f.id || f.docs.some((d) => d.id === q.mo);
  const html = `
  <section class="wrap sec" id="bieu-mau">
    <div class="panel forms-panel">
      <div class="sec-head"><h2>Biểu mẫu</h2><span class="muted">${total} biểu mẫu · ${folders.length} thư mục</span></div>
      <div class="forms-bar">
        <label class="mini-search">${icon('search', 16)}<span class="sr-only">Lọc biểu mẫu</span><input id="fm-q" placeholder="Lọc theo tên hoặc số hiệu, ví dụ: tuyển dụng, 47.1…" autocomplete="off"></label>
        <div class="forms-actions"><button type="button" class="tool" id="fm-open">Mở tất cả</button><button type="button" class="tool" id="fm-close">Thu gọn</button></div>
      </div>
      <div class="folders" id="fm-tree">${folders.map((f) => `
        <details class="folder-group" data-folder="${f.id}"${openFolder(f) ? ' open' : ''}>
          <summary class="folder-head"><span class="folder-ic">${icon('folder', 22)}</span><div class="grow"><h3>${esc(f.name)}</h3><p>${esc(f.desc)}</p></div><span class="folder-n">${f.docs.reduce((s, d) => s + d.forms.length, 0)} biểu mẫu</span>${icon('chev', 18)}</summary>
          <div class="subfolders">${f.docs.map((d) => `
            <details class="subfolder" data-doc="${d.id}"${q.mo === d.id ? ' open' : ''}>
              <summary>${icon('folder', 18)}<span class="grow"><b>${esc(d.no)} · ${esc(d.title)}</b><small>${count(d.forms)}</small></span>${icon('chev', 16)}</summary>
              <div class="subfolder-body"><ul class="form-list">${d.forms.map(formItem).join('')}</ul>
                <a class="subfolder-src" href="#/vb/${d.id}">${icon('book', 14)} Xem ${esc(d.group === 'quy-trinh' ? 'quy trình' : 'văn bản')} ${esc(d.no)}</a></div>
            </details>`).join('')}</div>
        </details>`).join('')}</div>
      <div class="empty" id="fm-empty" hidden>Không có biểu mẫu khớp từ khóa.</div>
      <p class="muted small forms-note">Biểu mẫu Word và Excel xem được ngay trên trang; biểu mẫu Excel tải được file gốc. Biểu mẫu chứa thông tin cá nhân không đăng lên web, liên hệ ${esc(COMPANY.unit)} để lấy mẫu.</p>
    </div>
  </section>`;
  return { html, mount(root) {
    const groups = $$('.folder-group', root), subs = $$('.subfolder', root), input = $('#fm-q', root);
    $('#fm-open', root).addEventListener('click', () => { groups.forEach((g) => { if (!g.hidden) g.open = true; }); subs.forEach((s) => { if (!s.hidden) s.open = true; }); });
    $('#fm-close', root).addEventListener('click', () => { groups.forEach((g) => { g.open = false; }); subs.forEach((s) => { s.open = false; }); });
    input.addEventListener('input', () => {
      const t = fold(input.value.trim());
      let any = false;
      subs.forEach((s) => {
        const docHit = !t || fold(s.querySelector('summary').textContent).includes(t);
        let hits = 0;
        $$('.form-list li', s).forEach((li) => { const ok = docHit || fold(li.textContent).includes(t); li.hidden = !ok; if (ok) hits++; });
        s.hidden = !hits; if (t) s.open = hits > 0; if (hits) any = true;
      });
      // Đang lọc: mở thư mục lớn có kết quả; xóa lọc: thu gọn lại
      groups.forEach((g) => { const has = $$('.subfolder', g).some((s) => !s.hidden); g.hidden = !has; g.open = !!t && has; });
      $('#fm-empty', root).hidden = any;
    });
    const target = q.mo && $(`.subfolder[data-doc="${CSS.escape(q.mo)}"], .folder-group[data-folder="${CSS.escape(q.mo)}"]`, root);
    if (target || q.toForms) setTimeout(() => (target || $('#bieu-mau', root)).scrollIntoView({ block: 'start' }), 60);
  } };
}
/* Link cũ #/bieu-mau: mở trang chủ và cuộn tới khối Biểu mẫu */
function viewForms(p, q) { return viewHome(p, Object.assign({}, q, { toForms: 1 })); }

function notFound() { return `<div class="wrap page"><div class="empty">Không tìm thấy trang. <a href="#/">Về trang chủ</a></div></div>`; }

/* ---------- Điều hướng ---------- */
const ROUTES = [['/', viewHome], ['/van-ban', viewLibrary], ['/vb/:id', viewDoc], ['/tim', viewSearch], ['/bieu-mau', viewForms], ['/bm/:id', viewSheet], ['/gop-y', viewFeedback]];
// Trang quản trị (js/admin.js): chỉ có ở bản backend, chỉ nạp cho HCNS
const IS_ADMIN = typeof viewAdmin === 'function' && !!window.AUTH && window.AUTH.role === 'admin';
if (IS_ADMIN) ROUTES.push(['/quan-tri', viewAdmin]);
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query] = raw.split('?');
  const q = {};
  (query || '').split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); q[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' ')); });
  return { path: path.replace(/\/+$/, '') || '/', q };
}
const App = {
  cleanups: [], keyHandler: null,
  render() {
    if (!window.AUTH) return; // đã đăng xuất
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.keyHandler = null;
    const { path, q } = parseHash();
    let out = null;
    for (const [pat, fn] of ROUTES) {
      const a = pat.split('/'), b = path.split('/');
      if (a.length !== b.length) continue;
      const params = {};
      if (a.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(b[i])), true) : s === b[i]))) { out = fn(params, q); break; }
    }
    if (!out) out = notFound();
    const res = typeof out === 'string' ? { html: out } : out;
    const view = document.createElement('div');
    view.innerHTML = res.html;
    $('#app').replaceChildren(view);
    window.scrollTo(0, 0);
    if (res.mount) res.mount(view);
    const h1 = $('h1', view);
    document.title = (path === '/' ? '' : (h1 ? h1.textContent.replace(/\s+/g, ' ').trim() + ' · ' : '')) + 'Quy chế Cát Tường Homes';
    this.header(path, q);
  },
  /* Mục "Quản trị": bản backend → trang Quản trị (HCNS);
     bản claude.ai → Quản lý góp ý (chủ sở hữu / người chỉnh sửa, biết sau khi FB kết nối xong) */
  adminLink(path, q) {
    if (IS_ADMIN) return ['#/quan-tri', path === '/quan-tri'];
    if (!window.API && typeof FB !== 'undefined' && FB.admin) return ['#/gop-y?tab=quan-ly', path === '/gop-y' && q.tab === 'quan-ly'];
    return null;
  },
  header(path, q) {
    this.last = { path, q };
    const adm = this.adminLink(path, q);
    const nav = [['#/', 'Trang chủ', ['/', '/bieu-mau', '/van-ban'].includes(path)]];
    if (adm) nav.push([adm[0], 'Quản trị', adm[1]]);
    $('#header').innerHTML = `<div class="wrap hd">
      <a class="brand" href="#/"><img src="assets/logo-mark.png" alt="" width="40" height="40"><span><b>Cát Tường Homes</b><small>Tra cứu quy chế nội bộ</small></span></a>
      <nav class="nav">${nav.map(([h, l, on]) => `<a href="${h}" class="${on ? 'on' : ''}">${l}</a>`).join('')}</nav>
      ${path === '/' ? '' : `<form class="hd-search" id="hd-search" role="search">${icon('search', 16)}<label class="sr-only" for="hd-q">Tìm kiếm</label><input id="hd-q" placeholder="Tìm trong quy chế… (phím /)" value="${esc(path === '/tim' ? q.q || '' : '')}"></form>`}
      ${window.AUTH ? `<button type="button" class="hd-user" id="hd-logout" title="Đăng xuất (${esc(window.AUTH.name)})"><span class="av">${esc((window.AUTH.name || '?').trim().charAt(0).toUpperCase())}</span><span class="nm">${esc(window.AUTH.name)}</span><span>Đăng xuất</span></button>` : ''}
    </div><div class="read-progress" aria-hidden="true"><span id="read-prog"></span></div>`;
    const lo = $('#hd-logout');
    if (lo) lo.addEventListener('click', async () => { if (await confirmBox('Đăng xuất khỏi trang tra cứu quy chế?', 'Đăng xuất')) window.AUTH.logout(); });
    const f = $('#hd-search');
    if (f) {
      f.addEventListener('submit', (e) => { e.preventDefault(); const v = $('#hd-q').value.trim(); if (v) location.hash = '#/tim' + qs({ q: v }); });
      attachSuggest(f, $('#hd-q'));
    }
    // Thanh điều hướng dưới đáy (điện thoại)
    const bn = [['#/', 'home', 'Trang chủ', ['/', '/bieu-mau', '/van-ban'].includes(path)], ['#/tim', 'search', 'Tìm kiếm', path === '/tim']];
    if (adm) bn.push([adm[0], 'shield', 'Quản trị', adm[1]]);
    $('#bnav').innerHTML = bn.map(([h, ic, l, on]) => `<a href="${h}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${icon(ic, 20)}<span>${l}</span></a>`).join('');
  },
};
window.addEventListener('hashchange', () => App.render());
// Nút tải Word/PDF ở danh sách và trang văn bản
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dl]');
  if (b) { e.preventDefault(); Exporter.download(b.dataset.id, b.dataset.dl, b); }
});
document.addEventListener('keydown', (e) => {
  if (App.keyHandler) App.keyHandler(e);
  if (e.key === '/' && !e.target.matches('input,textarea,select')) { const i = $('#hd-q') || $('#home-q'); if (i) { e.preventDefault(); i.focus(); } }
});
// Thanh điều hướng dưới đáy + nút lên đầu trang
const bnav = document.createElement('nav');
bnav.id = 'bnav'; bnav.className = 'bnav'; bnav.setAttribute('aria-label', 'Điều hướng nhanh');
const toTop = document.createElement('button');
toTop.type = 'button'; toTop.className = 'to-top'; toTop.setAttribute('aria-label', 'Lên đầu trang'); toTop.innerHTML = icon('up', 20);
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
document.body.append(bnav, toTop);
window.addEventListener('scroll', () => toTop.classList.toggle('show', window.scrollY > 700), { passive: true });

$('#footer').innerHTML = `<div class="wrap ft">
  <img src="assets/logo-full.png" alt="Cát Tường" width="84" height="74">
  <div><b>${esc(COMPANY.name)} · ${esc(COMPANY.unit)}</b>
    <p>Nội dung lấy từ ${Object.keys(window.RAW_DOCS || {}).length} tệp Word và ${Object.keys(window.RAW_SHEETS || {}).length} tệp Excel trong ${esc(COMPANY.source)}${window.RAW_UPDATED ? `, cập nhật lúc ${esc(window.RAW_UPDATED)}` : ''}. Tài liệu dùng nội bộ, không chia sẻ ra ngoài công ty. Khi có khác biệt, bản gốc đã ký có hiệu lực.</p></div>
</div>`;
App.render();
