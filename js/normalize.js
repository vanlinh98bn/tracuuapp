/* =============================================================
   Chuyển dữ liệu thô (đọc từ Word) thành văn bản có cấu trúc:
   - bỏ trang bìa, quyết định ban hành, mục lục; lấy thông tin mã số,
     lần ban hành, lịch sử sửa đổi, người soạn thảo/phê duyệt
   - nhận diện Phần/Chương/Điều/Mục để dựng mục lục
   - bảng lưu đồ quy trình → danh sách bước
   ============================================================= */

/* Bỏ dấu tiếng Việt, giữ nguyên độ dài chuỗi (để tô sáng kết quả tìm kiếm) */
function fold(s) {
  let out = '';
  for (const ch of String(s || '')) {
    const b = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += (b === 'đ' ? 'd' : b === 'Đ' ? 'D' : b).charAt(0) || ch;
  }
  return out.toLowerCase();
}

const RX = {
  part: /^(PHẦN|Phần)\s+([IVXLC\d]+)\b/,
  chapter: /^(CHƯƠNG|Chương)\s+([IVXLC\d]+)\b/,
  article: /^Điều\s+\d+/,
  roman: /^[IVX]{1,4}\s*[.\-–]\s*\S/,
  appendix: /^PHỤ LỤC/i,
  numbered: /^(\d+(\.\d+)*)[.)]?\s+\S/,
  letter: /^[a-zđ][.)]\s+\S/i,
};
const isUpperish = (s) => s.length > 3 && s === s.toUpperCase() && /[A-ZÀ-Ỹ]/.test(s);

function blockText(b) {
  if (b.t === 'table') return b.rows.map((r) => r.join(' | ')).join('\n');
  return b.text;
}
function tableHas(b, ...words) {
  const t = blockText(b);
  return words.some((w) => t.includes(w));
}

/* ---------- Thông tin văn bản từ trang bìa ---------- */
function extractMeta(blocks) {
  const meta = { revisions: [], signers: null, code: '', issue: '', date: '' };
  for (const b of blocks.slice(0, 14)) {
    const txt = blockText(b).replace(/\n/g, ' ');
    const m = txt.match(/Mã số:\s*([A-Z0-9.\/]+)\s*Lần ban hành:\s*(\d+)\s*[-–]?\s*Ngày ban hành:?\s*([\d\/]*)/i);
    if (m && !meta.code) { meta.code = m[1].replace(/\.\.+/, '.').replace(/\.$/, ''); meta.issue = m[2]; meta.date = m[3]; }
    if (b.t === 'table' && b.rows[0] && /Ngày\/tháng/.test(b.rows[0][0] || '')) {
      meta.revisions = b.rows.slice(1).filter((r) => r.some((c) => c)).map((r) => ({ date: r[0], issue: r[1], note: (r[2] || '').replace(/\n/g, ' ') }));
    }
    if (b.t === 'table' && b.rows[0] && /SOẠN THẢO/.test(b.rows[0][0] || '')) {
      const names = (b.rows[2] || []).map((x) => x.replace(/^Họ tên:\s*/, ''));
      if (names.some(Boolean)) meta.signers = { draft: names[0] || '', review: names[1] || '', approve: names[2] || '' };
    }
  }
  if (!meta.date && meta.revisions.length) meta.date = meta.revisions[meta.revisions.length - 1].date;
  return meta;
}

function isCoverBlock(b) {
  if (b.t === 'table') return tableHas(b, 'NƠI NHẬN', 'SOẠN THẢO', 'Ngày/tháng', 'PHÂN PHỐI', 'Mã số:');
  const t = b.text.trim();
  return /^(PHÂN PHỐI|TÌNH TRẠNG SỬA ĐỔI|Ký hiệu chỉ định|CÁT TƯỜNG( HOMES| GROUP)?$|-+\*+-+$|\/$|\(Mã số)/.test(t);
}
function isNationalHeader(b) {
  if (b.t === 'table') return tableHas(b, 'CỘNG HOÀ', 'CỘNG HÒA') && tableHas(b, 'Độc', 'Hạnh phúc');
  return /^(CỘNG HÒA XÃ HỘI|CỘNG HOÀ XÃ HỘI|Độc lập\s*[-–]|[–—-]{6,}$|Bắc (N|n)inh,\s*(N|n)gày)/.test(b.text.trim());
}

/* ---------- Làm sạch danh sách khối của thân văn bản ---------- */
function cleanBody(blocks, cfg, meta) {
  let list = blocks.slice();
  // 1) Trang bìa ở đầu văn bản
  let i = 0;
  while (i < list.length && (isCoverBlock(list[i]) || isNationalHeader(list[i]))) i++;
  list = list.slice(i);

  // 2) Cắt phần bỏ đi / phần phụ lục theo cấu hình
  const findIdx = (text) => list.findIndex((b) => blockText(b).includes(text));
  let appendix = [];
  if (cfg.dropFrom) {
    const k = findIdx(cfg.dropFrom);
    if (k > 0) list = list.slice(0, Math.max(0, k - (cfg.dropBack || 0)));
  }
  if (cfg.appendixFrom) {
    const k = findIdx(cfg.appendixFrom);
    if (k > 0) { const s = Math.max(0, k - (cfg.appendixBack || 0)); appendix = list.slice(s); list = list.slice(0, s); }
  }

  // 3) Quyết định ban hành đi kèm (từ "QUYẾT ĐỊNH" tới bảng "Nơi nhận")
  const qd = list.findIndex((b) => b.t === 'p' && /^QUYẾT ĐỊNH$/.test(b.text.trim()));
  if (qd >= 0 && qd < 12) {
    const end = list.findIndex((b, k) => k > qd && b.t === 'table' && tableHas(b, 'Nơi nhận'));
    if (end > 0 && end - qd < 25) {
      // Mọi thứ trước bảng "Nơi nhận" ở đầu văn bản đều thuộc quyết định ban hành (tiêu đề, V/v, Căn cứ, Điều 1–3)
      const vv = list.slice(0, end).find((b) => b.t === 'p' && /^(V\/v|Vv)/.test(b.text));
      if (vv) meta.decision = vv.text.replace(/^V\/v:?\s*|^Vv:?\s*/, '');
      list = list.slice(end + 1);
    }
  }

  // 4) Mục lục
  const toc = list.findIndex((b) => b.t === 'p' && /^MỤC LỤC$/i.test(b.text.trim()));
  if (toc >= 0) {
    const end = list.findIndex((b, k) => k > toc && b.t === 'p' && b.al === 1);
    if (end > 0) list = list.slice(0, toc).concat(list.slice(end));
  }

  // 5) Dòng tiêu đề lặp lại ở đầu, dòng "Ban hành kèm theo…", tiêu ngữ, ngày tháng
  const out = [];
  let head = true;
  list.forEach((b) => {
    if (isNationalHeader(b)) return;
    if (b.t === 'p') {
      const t = b.text.trim();
      if (/^\(Ban hành kèm theo/i.test(t)) { meta.attached = t.replace(/^\(|\)$/g, ''); return; }
      if (head && b.al === 1 && !RX.chapter.test(t) && !RX.part.test(t) && !RX.article.test(t) && !/^\{?[IVX]+\./.test(t) && out.length < 6) return;
    }
    head = false;
    out.push(b);
  });
  return { body: out, appendix };
}

/* ---------- Chuyển khối thành phần tử hiển thị ---------- */
function isFlowTable(rows) {
  const h = (rows[0] || []).map((c) => fold(c));
  return (h.some((c) => c.includes('thuc hien')) && h.some((c) => c.includes('mo ta'))) || (h[0] === 'buoc' && h.some((c) => c.includes('mo ta')));
}
function flowSteps(rows) {
  const h = rows[0].map((c) => fold(c));
  const iActor = h.findIndex((c) => c.includes('thuc hien'));
  const iDesc = h.findIndex((c) => c.includes('mo ta'));
  const iTime = h.findIndex((c) => c.includes('thoi gian'));
  return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => ({
    actor: r[iActor] || '', desc: r[iDesc] || '', time: iTime >= 0 ? r[iTime] || '' : '',
  }));
}
function trimTable(rows) {
  const isEmpty = (r) => r.every((c) => !c || /^[☐(\s]*$/.test(c));
  let empties = 0;
  const out = [];
  let hidden = 0;
  rows.forEach((r) => {
    if (isEmpty(r)) { empties++; if (empties > 2) { hidden++; return; } } else empties = 0;
    out.push(r);
  });
  return { rows: out, hidden };
}

/* Một dòng văn bản → { kind: 'h1'|'h2'|'h3'|'p'|'li'|'li2', text, num } */
function classifyLine(line, b, first) {
  const t = line.trim();
  // Word đôi khi gắn số tự động trước "Điều …/Chương …" (VD: "3. Điều 2.") → bỏ số đó
  const ownHeading = RX.article.test(t) || RX.chapter.test(t) || RX.part.test(t);
  const list = first && !ownHeading ? (b.list || '') : '';
  const full = list && !/^[-•+\uf0b7\uf0a7\uf076o]$/.test(list) ? `${list} ${t}` : t;
  const bullet = /^[-•\uf0b7\uf0a7\uf076o]$/.test(list) || (!list && /^[-–•]\s/.test(t));
  const sub = list === '+' || (!list && /^\+\s?/.test(t));
  if (RX.part.test(full) || RX.chapter.test(full)) return { kind: 'h1', text: full };
  if (RX.article.test(full) || RX.appendix.test(full)) return { kind: 'h2', text: full };
  if (RX.roman.test(full) && (b.bold || b.ol < 10 || isUpperish(full.replace(/^[IVX]+\.\s*/, '')) || full.length < 90)) return { kind: 'h2', text: full };
  if (sub) return { kind: 'li2', text: t.replace(/^\+\s?/, '') };
  if (bullet) return { kind: 'li', text: t.replace(/^[-–•]\s*/, '') };
  if (first && b.bold && full.length < 110 && !/[.;]$/.test(full)) return { kind: 'h3', text: full };
  if (first && b.ol < 10 && full.length < 110) return { kind: 'h3', text: full };
  if (RX.numbered.test(full) || RX.letter.test(full)) return { kind: 'pn', text: full };
  return { kind: 'p', text: full };
}

function renderBlocks(blocks, ctx) {
  const items = [];
  let pendingChapter = null;
  blocks.forEach((b) => {
    if (b.t === 'table') {
      if (!b.rows.length) return;
      if (isFlowTable(b.rows)) items.push({ kind: 'flow', steps: flowSteps(b.rows) });
      else { const tt = trimTable(b.rows); items.push({ kind: 'table', rows: tt.rows, hidden: tt.hidden }); }
      return;
    }
    const lines = b.text.split('\n');
    lines.forEach((ln, k) => {
      const it = classifyLine(ln, b, k === 0);
      it.center = b.al === 1;
      // "CHƯƠNG I" + dòng tên chương ngay sau → gộp
      if (pendingChapter && (it.kind === 'p' || it.kind === 'h3') && isUpperish(it.text) && it.text.length < 80) {
        pendingChapter.text += ' – ' + it.text; pendingChapter = null; return;
      }
      pendingChapter = it.kind === 'h1' && /^(CHƯƠNG|Chương|PHẦN|Phần)\s+[IVXLC\d]+$/.test(it.text.trim()) ? it : null;
      items.push(it);
    });
  });
  // Đánh id cho tiêu đề để dựng mục lục
  items.forEach((it) => { if (/^h[123]$/.test(it.kind)) it.id = `${ctx}-${++renderBlocks.n}`; });
  return items;
}
renderBlocks.n = 0;

/* ---------- Xây toàn bộ thư viện ---------- */
function buildLibrary() {
  const raw = window.RAW_DOCS || {};
  const files = window.RAW_FILES || [];
  const docs = CATALOG.map((c) => {
    const r = raw[c.file];
    const d = Object.assign({ missing: !r }, c);
    if (!r) { d.items = []; d.appendix = []; d.meta = { revisions: [] }; return d; }
    d.modified = r.modified;
    d.meta = extractMeta(r.blocks);
    const { body, appendix } = cleanBody(r.blocks, c, d.meta);
    d.items = renderBlocks(body, c.id);
    d.appendix = renderBlocks(appendix, c.id + '-pl');
    if (c.date) d.meta.date = c.date;
    return d;
  });
  const byId = Object.fromEntries(docs.map((d) => [d.id, d]));

  // Biểu mẫu kèm theo: tài liệu Word đã có trong danh mục + tệp Excel cùng thư mục
  docs.forEach((d) => {
    d.forms = docs.filter((x) => x.parent === d.id).map((x) => ({ id: x.id, no: x.no, title: x.title, kind: 'doc' }));
    if (d.formDir) {
      files.filter((f) => f.path.startsWith(d.formDir) && f.ext.startsWith('xls')).forEach((f) => {
        const name = f.path.split('/').pop().replace(/\.[^.]+$/, '');
        const m = name.match(/^([\d.]+)\s*[-–]?\s*(.*)$/);
        const no = m ? m[1].replace(/\.$/, '') : '';
        d.forms.push({
          id: 'xls-' + (no || fold(name).replace(/[^a-z0-9]+/g, '-')).replace(/\./g, '-'),
          no, title: m ? m[2] : name, kind: 'excel', path: f.path, kb: f.kb, owner: d.id,
          private: !!f.private,
          sheets: ((window.RAW_SHEETS || {})[f.path] || {}).sheets || null,
          blob: (window.FILE_BLOBS || {})[f.path] || null,
        });
      });
      d.forms.sort((a, b) => a.no.localeCompare(b.no, 'vi', { numeric: true }));
    }
  });

  // Chỉ mục tìm kiếm: mỗi đoạn theo tiêu đề gần nhất
  const index = [];
  docs.forEach((d) => {
    let cur = { doc: d.id, head: d.title, headId: '', text: [] };
    const push = () => { if (cur.text.length || cur.headId) index.push(Object.assign({}, cur, { text: cur.text.join(' '), f: fold(cur.head + ' ' + cur.text.join(' ')) })); };
    d.items.concat(d.appendix).forEach((it) => {
      if (/^h[12]$/.test(it.kind)) { push(); cur = { doc: d.id, head: it.text, headId: it.id, text: [] }; return; }
      if (it.kind === 'flow') cur.text.push(it.steps.map((s) => `${s.actor}: ${s.desc}`).join(' '));
      else if (it.kind === 'table') cur.text.push(it.rows.map((r) => r.join(' ')).join(' '));
      else cur.text.push(it.text);
    });
    push();
    index.push({ doc: d.id, head: d.title, headId: '', text: d.summary || '', f: fold(`${d.title} ${d.no} ${(d.tags || []).join(' ')} ${d.summary || ''}`), isTitle: true });
  });
  return { docs, byId, index, files };
}
