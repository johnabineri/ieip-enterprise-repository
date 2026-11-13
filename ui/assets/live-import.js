/* =====================================================================
   SAORAJA EAP — Impor CSV (EAW-09), mode live: kartu "Impor Data" di halaman Penerbit. Alur: pilih jenis + berkas → Validasi (dry-run terhadap SELURUH aturan DB)
   → Commit hanya bila 0 galat untuk berkas yang SAMA (semua-atau-tidak-sama-sekali). Dipasang oleh live.js (LiveImport.install) setelah LiveModel.
   ===================================================================== */
window.LiveImport = (function () {
  let A, API, D, fail;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPES = [['processes', 'Proses Bisnis (D1)'], ['data-entities', 'Entitas Data (D2)'], ['services', 'Layanan (D3)'], ['applications', 'Aplikasi / Platform / Workspace (D4)'], ['infra-assets', 'Aset Infrastruktur (D5)'], ['controls', 'Kontrol Keamanan (D6)'], ['relations', 'Relasi antar-objek'], ['diagram-xml', 'Diagram ArchiMate (Open Group Exchange XML)']];
  const IM = { type: 'processes', csv: null, filename: '', report: null, reportCsv: null, busy: false, entity: '', nama: '', view: '', xsdWarn: false };
  const isXml = () => IM.type === 'diagram-xml';

  async function dlTemplate() {
    try { if (window.Oidc && Oidc.enabled()) await Oidc.ensureFresh(); const r = await fetch(`${API.base()}/api/v1/eaw/import/template?type=${IM.type}`, { headers: { Authorization: 'Bearer ' + API.token() } }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `template-${IM.type}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); } catch (e) { fail(e); }
  }
  function reportHtml() {
    const r = IM.report; if (!r) return '<p class="tiny muted">Pilih berkas CSV lalu klik Validasi. Validasi menjalankan INSERT sungguhan di dalam transaksi yang dibatalkan — seluruh constraint, trigger, dan izin DB ikut menilai tiap baris.</p>';
    const fresh = IM.reportCsv === IM.csv;
    return `<div class="callout ${r.valid ? 'ok' : 'err'}"><span class="ic">${r.valid ? '✓' : '✕'}</span><div>${r.counts ? `<b>${r.valid ? (r.committed ? 'Diagram dibuat' : 'Valid — siap di-commit') : r.errors.length + ' galat'}</b> · model “${esc(r.modelName || '—')}” · view <b>${esc(r.viewName || '(tanpa view)')}</b> · ${r.counts.nodes} node, ${r.counts.edges} relasi dari ${r.counts.elements} elemen / ${r.counts.relationships} relasi${r.counts.skipped ? ` · ${r.counts.skipped} dilewati` : ''}${r.xsd ? ` · ${r.xsd.checked ? (r.xsd.valid ? '<span class="badge b-ok">XSD ArchiMate 3.1 sah</span>' : `<span class="badge ${r.xsd.mode === 'warn' ? 'b-warn' : 'b-err'}">XSD: ${esc(r.xsd.errorCount)}${r.xsd.truncated ? '+' : ''} galat${r.xsd.mode === 'warn' ? ' (diterima)' : ''}</span>`) : `<span class="badge">XSD tidak diperiksa</span>`}` : ''}${r.committed ? ' · <a href="#/eaw/kanvas">buka di kanvas →</a>' : ''}`
        : `<b>${r.valid ? (r.committed ? 'Valid — sudah di-commit' : 'Valid — siap di-commit') : r.errorCount + ' galat'}</b> · ${r.rows} baris data · delimiter <code>${r.delimiter === '\t' ? 'TAB' : esc(r.delimiter)}</code> · ${r.valid ? r.wouldCreate + (r.committed ? ' objek dibuat' : ' objek akan dibuat') : r.wouldCreate + ' baris sah dari ' + r.rows}${fresh ? '' : ' · <b>berkas berubah sejak validasi</b>'}`}</div></div>
      ${r.warnings && r.warnings.length ? `<div class="callout warn mt-s"><span class="ic">⚠</span><div><b>${r.warnings.length} peringatan</b> (tidak memblokir)<ul class="small" style="margin:4px 0 0;padding-left:18px">${r.warnings.slice(0, 8).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div>` : ''}
      ${r.errors.length ? `<div class="tbl-wrap mt-s" style="max-height:300px;overflow:auto"><table class="tbl"><thead><tr><th>Baris</th><th>Kolom</th><th>Pesan</th></tr></thead><tbody>${r.errors.map((e) => `<tr><td class="num">${e.line ?? '—'}</td><td>${esc(e.field || '—')}</td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>${r.errorCount > r.errors.length ? `<div class="tiny muted mt-s">+${r.errorCount - r.errors.length} galat lainnya tidak ditampilkan.</div>` : ''}` : ''}`;
  }
  async function render() {
    const box = document.getElementById('imp-card'); if (!box) return;
    let log = []; try { log = (await API.get('/api/v1/eaw/import/log')).data; } catch (e) { /* tanpa izin */ }
    const can = A.can('eaw.model.write') || A.can('eaw.catalog.write'); const ready = IM.report && IM.report.valid && IM.reportCsv === IM.csv && !IM.report.committed;
    box.innerHTML = A.card('Impor Data (CSV / Exchange XML) — tervalidasi sebelum commit', `<div class="grid g-1-2"><div class="stack">
        <div class="field"><label>Jenis data</label><select class="select" onchange="App.imType(this.value)">${TYPES.map(([k, l]) => `<option value="${k}" ${k === IM.type ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${isXml() ? `<div class="field"><label>Entitas pemilik diagram <span class="req">*</span></label><select class="select" onchange="App.imSet('entity',this.value)"><option value="">— pilih entitas —</option>${(D.ENTITIES || []).map((e) => `<option value="${esc(e.uuid)}" ${e.uuid === IM.entity ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}</select></div>
        <div class="field"><label>Nama diagram <span class="tiny muted">(kosong = nama model)</span></label><input class="input" value="${esc(IM.nama)}" onchange="App.imSet('nama',this.value)"></div>
        <div class="field"><label>View <span class="tiny muted">(kosong = view pertama)</span></label><input class="input" value="${esc(IM.view)}" onchange="App.imSet('view',this.value)"></div>
        <label class="tiny row" style="gap:6px"><input type="checkbox" ${IM.xsdWarn ? 'checked' : ''} onchange="App.imSet('xsdWarn',this.checked)">Terima walau tidak sah terhadap XSD (galat skema menjadi peringatan)</label>
        <div class="row"><input type="file" accept=".xml,text/xml,application/xml" onchange="App.imFile(this.files[0])" style="max-width:260px"></div>
        <div class="tiny muted">${IM.csv ? `${esc(IM.filename)} · ${IM.csv.length.toLocaleString('id-ID')} karakter` : 'Belum ada berkas.'} Hanya isi <b>satu view</b> yang diimpor; tipe di luar subset EAP diperingatkan. DTD/entitas ditolak; divalidasi terhadap XSD resmi ArchiMate 3.1 (Open Group); maks. 2 MB.</div>`
        : `<div class="row"><button class="btn sm" onclick="App.imTpl()">⇩ Templat CSV</button><input type="file" accept=".csv,.txt,text/csv" onchange="App.imFile(this.files[0])" style="max-width:230px"></div>
        <div class="tiny muted">${IM.csv ? `${esc(IM.filename)} · ${IM.csv.length.toLocaleString('id-ID')} karakter` : 'Belum ada berkas.'} Entitas, KRA, dan induk dirujuk lewat <b>kode/nama</b>; maks. 2.000 baris.</div>`}
        <div class="row"><button class="btn" ${IM.csv && !IM.busy && (!isXml() || IM.entity) ? '' : 'disabled'} onclick="App.imValidate()">✓ Validasi (dry-run)</button><button class="btn pri" ${can && ready ? '' : 'disabled'} onclick="App.imCommit()" title="${ready ? '' : 'Validasi dulu sampai 0 galat'}">⇧ Commit</button></div>
        <h3>Jejak impor (hanya yang di-commit)</h3>${log.length ? `<div class="stack small">${log.slice(0, 6).map((l) => `<div class="row"><span class="tag">${esc(l.type)}</span><span style="flex:1">${esc(l.filename || '—')} · ${l.created}/${l.rows} baris</span><code class="tiny">${esc(l.sha256.slice(0, 8))}</code></div>`).join('')}</div>` : '<span class="tiny muted">Belum ada.</span>'}</div>
      <div id="imp-report">${reportHtml()}</div></div>`);
  }
  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail;
    const orig = A.PAGES['eaw/publisher'];
    A.PAGES['eaw/publisher'] = () => { const o = orig(); const m = o.mount; return { html: o.html + '<div id="imp-card" class="mt"></div>', mount: async (main) => { if (m) await m(main); await render(); } }; };
    A.imType = (t) => { IM.type = t; IM.report = null; IM.csv = null; IM.filename = ''; render(); };
    A.imSet = (k, v) => { IM[k] = v; IM.report = null; render(); };
    A.imTpl = dlTemplate;
    const post = (dryRun) => (isXml()
      ? API.post('/api/v1/eaw/diagrams/import-xml', { entityId: IM.entity, xml: IM.csv, nama: IM.nama || undefined, view: IM.view || undefined, xsd: IM.xsdWarn ? 'warn' : undefined, dryRun, filename: IM.filename })
      : API.post('/api/v1/eaw/import', { type: IM.type, csv: IM.csv, dryRun, filename: IM.filename }));
    A.imFile = (f) => { if (!f) return; const rd = new FileReader(); rd.onload = () => { IM.csv = String(rd.result); IM.filename = f.name; IM.report = null; render(); }; rd.onerror = () => fail(new Error('Gagal membaca berkas')); rd.readAsText(f, 'utf-8'); };
    A.imValidate = async () => { IM.busy = true; try { IM.report = await post(true); IM.reportCsv = IM.csv; } catch (e) { if (e.body && e.body.report) { IM.report = e.body.report; IM.reportCsv = IM.csv; } else { IM.report = null; fail(e); } } IM.busy = false; render(); };
    A.imCommit = async () => {
      if (!confirm('Commit impor? Seluruh baris dibuat berstatus Draf dalam satu transaksi dan tercatat di jejak impor.')) return;
      try { IM.report = await post(false); IM.reportCsv = IM.csv; A.toast('Impor di-commit', isXml() ? 'Diagram dibuat — buka di Kanvas ArchiMate' : `${IM.report.created} objek dibuat (Draf)`, 'success'); }
      catch (e) { if (e.body && e.body.report) { IM.report = e.body.report; IM.reportCsv = IM.csv; A.toast('Impor dibatalkan', 'Ada baris tidak valid — tidak ada data yang di-commit.', 'error'); } else fail(e); }
      render();
    };
  }
  return { install };
})();
