/* =============================================================
   Tải văn bản về máy: Word (.docx tự dựng, không cần thư viện)
   và PDF (dựng trang A4 bằng html2pdf.js từ cdnjs).
   Trên claude.ai dùng quyền "downloads" (người xem xác nhận trước khi lưu);
   mở file trực tiếp trên máy thì tải bằng liên kết thường.
   ============================================================= */
const Exporter = (() => {
  const enc = new TextEncoder();

  /* ---------- Nén ZIP dạng lưu trữ (không nén) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const parts = [], central = [];
    let off = 0;
    files.forEach(({ name, data }) => {
      const nm = enc.encode(name), d = typeof data === 'string' ? enc.encode(data) : data, crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(h.buffer), nm, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + d.length;
    });
    const size = central.reduce((s, x) => s + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------- Dựng nội dung Word ---------- */
  const x = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
  const run = (text, o = {}) => String(text == null ? '' : text).split('\n').map((ln, i) =>
    `<w:r><w:rPr>${FONT}${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 26}"/></w:rPr>${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${x(ln)}</w:t></w:r>`).join('');
  const para = (runs, o = {}) => `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 100 : o.after}"/>${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="${o.hang || 0}"/>` : ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${runs}</w:p>`;
  const BORDER = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('');
  function table(rows, head) {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${BORDER}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>`
      + `<w:tblGrid>${'<w:gridCol/>'.repeat(cols)}</w:tblGrid>`
      + rows.map((r, i) => `<w:tr>${Array.from({ length: cols }, (_, k) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${i === 0 && head ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EFF9"/>' : ''}</w:tcPr>${para(run(r[k] || '', { b: i === 0 && head, sz: 22 }), { after: 0 })}</w:tc>`).join('')}</w:tr>`).join('')
      + '</w:tbl>' + para('', { after: 60 });
  }
  function bodyXml(items) {
    return items.map((it) => {
      if (it.kind === 'h1') return para(run(it.text, { b: true, sz: 28, color: '143A75' }), { before: 240, after: 120, keep: true });
      if (it.kind === 'h2') return para(run(it.text, { b: true, sz: 26 }), { before: 160, after: 80, keep: true });
      if (it.kind === 'h3') return para(run(it.text, { b: true, i: true, sz: 26 }), { before: 100, after: 60, keep: true });
      if (it.kind === 'li') return para(run('•\t' + it.text), { ind: 567, hang: 283 });
      if (it.kind === 'li2') return para(run('+\t' + it.text), { ind: 851, hang: 283 });
      if (it.kind === 'table') return table(it.rows, it.rows.length > 1);
      if (it.kind === 'flow') return table([['Bước', 'Thực hiện', 'Mô tả', 'Thời gian']].concat(it.steps.map((s, i) => [String(i + 1), s.actor, s.desc, s.time])), true);
      return para(run(it.text), { align: it.center ? 'center' : 'both' });
    }).join('');
  }
  const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
  const metaLine = (d) => [d.no && `Số hiệu ${d.no}`, d.meta.code && `Mã số ${d.meta.code}`, d.meta.issue && `Lần ban hành ${d.meta.issue}`, d.meta.date && `Ngày ban hành ${d.meta.date}`].filter(Boolean).join(' · ');

  function docx(d) {
    const head = para(run(COMPANY.name.toUpperCase(), { b: true, sz: 24, color: '1D4F9C' }), { align: 'center', after: 60 })
      + para(run(d.title.toUpperCase(), { b: true, sz: 32 }), { align: 'center', after: 80 })
      + para(run(metaLine(d), { i: true, sz: 22 }), { align: 'center', after: 240 });
    const app = d.appendix && d.appendix.length ? para(run('MẪU BIỂU KÈM THEO', { b: true, sz: 28, color: '143A75' }), { before: 360, after: 120 }) + bodyXml(d.appendix) : '';
    const foot = para(run(`Bản xuất từ trang Tra cứu quy chế nội bộ ngày ${today()} – tài liệu nội bộ, không phát tán ra ngoài. Bản có giá trị là bản đã ký lưu tại ${COMPANY.unit}.`, { i: true, sz: 20, color: '777777' }), { before: 360 });
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + head + (d.missing ? para(run('Chưa đọc được nội dung văn bản này.')) : bodyXml(d.items)) + app + foot
      + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc },
    ]);
  }

  /* ---------- PDF ---------- */
  let libPromise = null;
  const loadLib = () => libPromise || (libPromise = new Promise((res, rej) => {
    if (window.html2pdf) return res(window.html2pdf);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = () => res(window.html2pdf); s.onerror = () => { libPromise = null; rej(new Error('Không tải được bộ tạo PDF. Kiểm tra kết nối mạng.')); };
    document.head.appendChild(s);
  }));
  async function pdf(d) {
    const lib = await loadLib();
    const el = document.createElement('div');
    el.className = 'pdf-sheet';
    el.innerHTML = `<p class="pdf-co">${esc(COMPANY.name.toUpperCase())}</p><h1>${esc(d.title)}</h1><p class="pdf-meta">${esc(metaLine(d))}</p>
      ${d.missing ? '<p>Chưa đọc được nội dung văn bản này.</p>' : renderItems(d.items)}
      ${d.appendix && d.appendix.length ? `<h2 class="d-h1">Mẫu biểu kèm theo</h2>${renderItems(d.appendix)}` : ''}
      <p class="pdf-foot">Bản xuất từ trang Tra cứu quy chế nội bộ ngày ${today()} – tài liệu nội bộ, không phát tán ra ngoài. Bản có giá trị là bản đã ký lưu tại ${esc(COMPANY.unit)}.</p>`;
    // Để html2pdf tự đặt trang vào khung dựng của nó (phần tử chưa gắn vào trang)
    return lib().set({
      margin: [12, 12, 14, 12], image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2', 'h3', 'h4', '.flow li'] },
    }).from(el).outputPdf('blob');
  }

  /* ---------- Lưu file ---------- */
  const fileName = (d, ext) => `${d.no} - ${d.title}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) + '.' + ext;
  let dlCap;
  const getCap = () => dlCap || (dlCap = window.claude && typeof window.claude.use === 'function' ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null));
  async function save(filename, blob) {
    const cap = await getCap();
    if (cap) {
      try { await cap.save({ filename, data: blob }); return 'saved'; } catch (e) {
        if (e && e.code === 'declined') return 'declined';
        if (e && e.code === 'rate_limited') throw new Error('Đang có một hộp xác nhận tải file mở. Vui lòng thử lại sau.');
        if (!e || !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) throw new Error('Không tải được file: ' + ((e && e.message) || 'lỗi không rõ'));
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return 'saved';
  }

  async function download(id, kind, btn) {
    const d = LIB.byId[id];
    if (!d || (btn && btn.disabled)) return;
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = kind === 'pdf' ? 'Đang tạo PDF…' : 'Đang tạo…'; }
    try {
      const blob = kind === 'pdf' ? await pdf(d) : docx(d);
      const r = await save(fileName(d, kind === 'pdf' ? 'pdf' : 'docx'), blob);
      if (r === 'saved') toast(`Đã tạo ${kind === 'pdf' ? 'PDF' : 'Word'}: ${d.no} · ${d.title}`);
    } catch (e) { toast(e.message || 'Không tải được file.', true); } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  }
  function toast(msg, bad) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3500);
  }
  return { docx, pdf, download, fileName, save, toast };
})();
