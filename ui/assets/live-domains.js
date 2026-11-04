/* =====================================================================
   SAORAJA EAP — halaman domain (mode live): D1 Proses, D2 Data, D3 Layanan, D5 Infrastruktur, D6 Keamanan
   terhubung ke /api/v1/eaw/objects/*, /eaw/relations, /eaw/readiness, /eaw/transitions. Dipasang oleh live.js (LiveDomains.install).
   Pola seragam: daftar → tambah/ubah (Draf) → detail (siklus AF-05, kesiapan relasi wajib, relasi, transisi, hapus Draf).
   ===================================================================== */
window.LiveDomains = (function () {
  let A, API, D, fail, entUuid;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NEXT = { Draf: ['Divalidasi', 'Ajukan Validasi', 'eaw.workflow.validate'], Divalidasi: ['Ditetapkan', 'Tetapkan (ARB)', 'eaw.arb.approve'], Ditetapkan: ['Dipublikasi', 'Publikasikan', 'eaw.publish.run'],
    Dipublikasi: ['Direviu', 'Mulai Reviu (AF-07)', 'eaw.workflow.validate'], Direviu: ['Ditetapkan', 'Tetapkan versi baru', 'eaw.arb.approve'] };
  const RULED = ['service', 'data_entity'];                       // jenis dengan aturan relasi/atribut wajib (EAW-05)
  const cache = {};                                              // key -> daftar objek terakhir

  const opt = (list) => list.map((x) => (Array.isArray(x) ? x : [x, x]));
  const CFG = {
    proses: { type: 'process', path: 'processes', domain: 'proses_bisnis', title: 'Domain 1 · Proses Bisnis', add: '+ Tambah Proses', label: 'proses',
      sub: 'Hierarki proses L1–L3 (rantai nilai → proses → sub-proses/SOP). Setiap proses wajib dikaitkan KRA; Layanan memakai Proses dan Proses memakai Entitas Data (SAF Bab 7).',
      fields: [{ n: 'nama', l: 'Nama proses', req: 1 }, { n: 'level', l: 'Level', t: 'select', num: 1, req: 1, opts: opt([[1, 'L1 — Rantai nilai'], [2, 'L2 — Proses'], [3, 'L3 — Sub-proses / SOP']]) },
        { n: 'parentId', l: 'Proses induk', t: 'parent' }, { n: 'pemilikJabatan', l: 'Pemilik (jabatan, bukan nama orang — D-14)' }, { n: 'input', l: 'Input' }, { n: 'output', l: 'Output' }],
      rels: [['data_entity', 'Entitas Data', 'data-entities', ['access']], ['process', 'Proses lain', 'processes', ['composition', 'triggering', 'flow']]] },
    data: { type: 'data_entity', path: 'data-entities', domain: 'data', title: 'Domain 2 · Data & Informasi', add: '+ Entitas Data', label: 'entitas data',
      sub: 'Kamus data kanonikal. Setiap entitas data wajib punya steward dan sumber otoritatif (mis. kalla_cmp.mdm.parties) sebelum Divalidasi. PII hanya penanda — datanya tetap di kalla_cmp (D-14).',
      fields: [{ n: 'namaKanonikal', l: 'Nama kanonikal', req: 1 }, { n: 'klasifikasi', l: 'Klasifikasi', t: 'select', req: 1, opts: opt(['publik', 'internal', 'terbatas', 'rahasia']) },
        { n: 'pii', l: 'Berisi PII di sumbernya', t: 'check' }, { n: 'steward', l: 'Steward (jabatan)' }, { n: 'sumberOtoritatif', l: 'Sumber otoritatif (SoR)' }, { n: 'retensiHari', l: 'Retensi (hari)', t: 'number', num: 1 }], rels: [] },
    layanan: { type: 'service', path: 'services', domain: 'layanan', title: 'Domain 3 · Layanan Enterprise', add: '+ Layanan', label: 'layanan',
      sub: 'Katalog layanan Internal Korporat dan Pelanggan & Mitra beserta SLO. Setiap layanan wajib terhubung ke ≥ 1 Proses.',
      fields: [{ n: 'nama', l: 'Nama layanan', req: 1 }, { n: 'tipe', l: 'Tipe', t: 'select', req: 1, opts: opt([['internal', 'Internal Korporat'], ['pelanggan-mitra', 'Pelanggan & Mitra']]) },
        { n: 'kategori', l: 'Kategori', t: 'select', req: 1, opts: opt(['utama', 'pendukung']) }, { n: 'pemilik', l: 'Pemilik (jabatan)' }, { n: 'slo', l: 'SLO' }, { n: 'kanal', l: 'Kanal' }],
      rels: [['process', 'Proses', 'processes', ['realization', 'association', 'serving']]] },
    infra: { type: 'infra_asset', path: 'infra-assets', domain: 'infrastruktur', title: 'Domain 5 · Infrastruktur & Teknologi', add: '+ Aset Infrastruktur', label: 'aset infrastruktur',
      sub: 'Topologi infrastruktur (klaster, DB, GPU, jaringan, cloud, DC). Aplikasi menautkan asetnya lewat relasi (assignment) dari detail aplikasi.',
      fields: [{ n: 'nama', l: 'Nama aset', req: 1 }, { n: 'tipe', l: 'Tipe', t: 'select', req: 1, opts: opt(['klaster-k8s', 'klaster-db', 'gpu', 'jaringan', 'cloud', 'dc-fisik']) },
        { n: 'lokasi', l: 'Lokasi' }, { n: 'kapasitas', l: 'Kapasitas' }, { n: 'drTier', l: 'DR Tier' }], rels: [] },
    keamanan: { type: 'control', path: 'controls', domain: 'keamanan', title: 'Domain 6 · Keamanan Informasi', add: '+ Kontrol', label: 'kontrol keamanan',
      sub: 'Kontrol keamanan per 5 aspek (kerahasiaan, keutuhan, ketersediaan, keaslian, kenirsangkalan) dengan standar rujukan dan status penerapan.',
      fields: [{ n: 'aspek', l: 'Aspek', t: 'select', req: 1, opts: opt(['kerahasiaan', 'keutuhan', 'ketersediaan', 'keaslian', 'kenirsangkalan']) }, { n: 'standarRujukan', l: 'Standar rujukan / uraian kontrol' },
        { n: 'statusPenerapan', l: 'Status penerapan', t: 'select', req: 1, opts: opt(['belum', 'sebagian', 'penuh']) }], rels: [] },
  };
  const nameOf = (c, o) => o.nama || o.namaKanonikal || (o.aspek ? o.aspek + (o.standarRujukan ? ' · ' + o.standarRujukan : '') : '') || o.layananUtama;
  const kraTag = (o) => { const k = D.KRA.find((x) => x.id === o.referensiId); return k ? A.tag(k.kode) : A.pill('tanpa KRA', 'b-err'); };

  /* ---------- render per domain ---------- */
  const R = {
    proses(items) {
      const kids = new Map(); items.forEach((p) => { const k = p.parentId && items.some((x) => x.id === p.parentId) ? p.parentId : ''; (kids.get(k) || kids.set(k, []).get(k)).push(p); });
      const flat = []; const walk = (k, d) => (kids.get(k) || []).sort((a, b) => a.nama.localeCompare(b.nama)).forEach((p) => { flat.push({ ...p, depth: d }); walk(p.id, d + 1); }); walk('', 0);
      return A.card(`Hierarki Proses (${items.length})`, A.table([
        { h: 'Proses', v: (p) => `<span style="padding-left:${p.depth * 18}px"><span class="lvl tiny mono muted">L${p.level}</span> <b>${esc(p.nama)}</b></span>` },
        { h: 'Pemilik (jabatan)', v: (p) => esc(p.pemilikJabatan || '—') }, { h: 'Entitas', v: (p) => esc(p.entityCode) }, { h: 'KRA', v: kraTag }, { h: 'Status', v: (p) => A.badge(p.status) }],
        flat, { click: (p) => `App.domOpen('proses','${p.id}')` }), { flush: true });
    },
    data(items) {
      const kls = { publik: 'b-ok', internal: 'b-info', terbatas: 'b-warn', rahasia: 'b-err' };
      return A.card(`Kamus Data Kanonikal (${items.length})`, A.table([
        { h: 'Entitas Kanonikal', v: (o) => `<b>${esc(o.namaKanonikal)}</b>` }, { h: 'Klasifikasi', v: (o) => A.pill(o.klasifikasi, kls[o.klasifikasi]) }, { h: 'PII', v: (o) => (o.pii ? '<b style="color:var(--err)">Ya</b>' : 'Tidak') },
        { h: 'Steward', v: (o) => esc(o.steward || '—') }, { h: 'Sumber Otoritatif', v: (o) => (o.sumberOtoritatif ? `<code>${esc(o.sumberOtoritatif)}</code>` : '—') },
        { h: 'Retensi', num: 1, v: (o) => (o.retensiHari ? o.retensiHari + ' hr' : '—') }, { h: 'KRA', v: kraTag }, { h: 'Status', v: (o) => A.badge(o.status) }],
        items, { click: (o) => `App.domOpen('data','${o.id}')` }), { flush: true });
    },
    layanan(items) {
      const f = cache._svc || 'all'; const rows = items.filter((s) => f === 'all' || s.tipe === f);
      return A.card('', `<div class="toolbar"><div class="chips">${[['all', 'Semua'], ['internal', 'Internal Korporat'], ['pelanggan-mitra', 'Pelanggan & Mitra']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" onclick="App.domSvc('${k}')">${l}</button>`).join('')}</div><span class="right small muted">${rows.length} layanan</span></div>` +
        A.table([{ h: 'Layanan', v: (s) => `<b>${esc(s.nama)}</b><div class="tiny muted">${esc(s.pemilik || '')}</div>` }, { h: 'Tipe', v: (s) => A.pill(s.tipe === 'internal' ? 'Internal' : 'Pelanggan & Mitra', s.tipe === 'internal' ? 'b-info' : 'b-gold') },
          { h: 'Kategori', v: (s) => esc(s.kategori) }, { h: 'Kanal', v: (s) => esc(s.kanal || '—') }, { h: 'SLO', v: (s) => esc(s.slo || '—') }, { h: 'KRA', v: kraTag }, { h: 'Status', v: (s) => A.badge(s.status) }], rows, { click: (s) => `App.domOpen('layanan','${s.id}')` }), { flush: true });
    },
    infra(items) {
      const icon = { 'klaster-k8s': '☸', 'klaster-db': '⛁', gpu: '▣', jaringan: '⇄', cloud: '☁', 'dc-fisik': '▤' };
      if (!items.length) return A.card('', '<div class="empty"><div class="big">∅</div>Belum ada aset infrastruktur. Tambahkan lewat tombol di atas (Zero Pre-Seed).</div>');
      return `<div class="grid g3">${items.map((i) => A.card(`${icon[i.tipe] || ''} ${esc(i.nama)}`, `<dl class="dl" style="grid-template-columns:90px 1fr;font-size:12.5px"><dt>Tipe</dt><dd>${A.tag(i.tipe)}</dd><dt>Lokasi</dt><dd>${esc(i.lokasi || '—')}</dd><dt>Kapasitas</dt><dd>${esc(i.kapasitas || '—')}</dd><dt>DR Tier</dt><dd>${esc(i.drTier || '—')}</dd><dt>KRA</dt><dd>${kraTag(i)}</dd></dl><div class="row mt-s"><button class="btn sm" onclick="App.domOpen('infra','${i.id}')">Detail</button></div>`, { acts: A.badge(i.status) })).join('')}</div>`;
    },
    keamanan(items) {
      const asp = ['kerahasiaan', 'keutuhan', 'ketersediaan', 'keaslian', 'kenirsangkalan']; const pen = { penuh: 'b-ok', sebagian: 'b-warn', belum: 'b-err' };
      const score = (a) => { const c = items.filter((x) => x.aspek === a); return c.length ? Math.round((c.reduce((s, x) => s + { penuh: 1, sebagian: 0.5, belum: 0 }[x.statusPenerapan], 0) / c.length) * 100) : null; };
      return `<div class="grid g5 mb">${asp.map((a) => { const s = score(a); return `<div class="card kpi"><div class="lbl" style="text-transform:capitalize">${a}</div><div class="val">${s === null ? '—' : s + '<small>%</small>'}</div><div class="progress mt-s"><i style="width:${s || 0}%;background:${s >= 80 ? 'var(--ok)' : s >= 50 ? 'var(--warn)' : 'var(--err)'}"></i></div></div>`; }).join('')}</div>` +
        A.card(`Kontrol Keamanan (${items.length})`, A.table([{ h: 'Aspek', v: (o) => `<span style="text-transform:capitalize">${esc(o.aspek)}</span>` }, { h: 'Standar / uraian', v: (o) => esc(o.standarRujukan || '—') },
          { h: 'Penerapan', v: (o) => A.pill(o.statusPenerapan, pen[o.statusPenerapan]) }, { h: 'KRA', v: kraTag }, { h: 'Status', v: (o) => A.badge(o.status) }], items, { click: (o) => `App.domOpen('keamanan','${o.id}')` }), { flush: true });
    },
  };

  async function loadPage(key) {
    const c = CFG[key]; const box = document.getElementById('dom-body'); if (!box) return;
    try { cache[key] = await API.all(`/api/v1/eaw/objects/${c.path}`); box.innerHTML = R[key](cache[key]); }
    catch (e) { box.innerHTML = e.status === 403 ? '<div class="callout warn"><span class="ic">🔒</span><div>Peran Anda tidak memiliki izin <code>eaw.model.read</code>.</div></div>' : `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`; }
  }

  /* ---------- form tambah/ubah ---------- */
  const fieldHtml = (f, v, parents) => {
    const val = v ?? '';
    if (f.t === 'select') return `<select class="select" name="${f.n}">${f.req ? '' : '<option value="">—</option>'}${f.opts.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (f.t === 'check') return `<label class="small row" style="gap:6px"><input type="checkbox" name="${f.n}" ${v ? 'checked' : ''}> ya</label>`;
    if (f.t === 'parent') return `<select class="select" name="${f.n}"><option value="">— tanpa induk —</option>${(parents || []).map((p) => `<option value="${esc(p.id)}" ${p.id === v ? 'selected' : ''}>L${p.level} · ${esc(p.nama)}</option>`).join('')}</select>`;
    return `<input class="input" name="${f.n}" type="${f.t === 'number' ? 'number' : 'text'}" value="${esc(val)}" ${f.req ? 'required' : ''}>`;
  };
  async function form(key, id) {
    const c = CFG[key]; const cur = id ? (cache[key] || []).find((x) => x.id === id) : null;
    let parents = []; if (key === 'proses') { try { parents = cache.proses || (await API.all('/api/v1/eaw/objects/processes')); } catch (e) { /* tanpa izin */ } parents = parents.filter((p) => p.id !== id); }
    const kras = D.KRA.filter((k) => k.domain === c.domain);
    A.openModal(`<div class="drawer-hd"><h2>${cur ? 'Ubah' : 'Tambah'} ${esc(c.label)}</h2><button class="x" onclick="App.closeAll()">×</button></div>
      <form class="drawer-bd" id="dom-form" onsubmit="App.domSave(event,'${key}','${id || ''}')"><div class="form-grid">
        ${c.fields.map((f) => `<div class="field ${f.t === 'select' || f.t === 'check' ? '' : 'full'}"><label>${esc(f.l)}${f.req ? ' <span class="req">*</span>' : ''}</label>${fieldHtml(f, cur && cur[f.n], parents)}</div>`).join('')}
        ${cur ? '' : `<div class="field full"><label>Entitas pemilik <span class="req">*</span></label><select class="select" name="entityId">${D.ENTITIES.map((e) => `<option value="${esc(e.uuid)}">${esc(e.nama)}</option>`).join('')}</select></div>`}
        <div class="field full"><label>Referensi KRA (wajib sebelum Divalidasi)</label><select class="select" name="referensiId"><option value="">— belum ditautkan —</option>${kras.map((k) => `<option value="${esc(k.id)}" ${cur && cur.referensiId === k.id ? 'selected' : ''}>${esc(k.kode)} · ${esc(k.nama)}</option>`).join('')}</select></div></div>
        <div id="dom-err" class="mt"></div><div class="callout info mt"><span class="ic">ℹ</span>Objek baru tersimpan berstatus <b>Draf</b> (AF-05); hak susun terbatas pada entitas Anda dan turunannya (AF-03).</div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('dom-form').requestSubmit()">Simpan Draf</button></div>`);
  }
  async function save(e, key, id) {
    e.preventDefault(); const c = CFG[key]; const fd = new FormData(e.target); const body = {};
    for (const f of c.fields) {
      if (f.t === 'check') { body[f.n] = fd.get(f.n) === 'on'; continue; }
      const v = fd.get(f.n); if (v === '' || v === null) { if (id) body[f.n] = null; continue; }
      body[f.n] = f.num ? Number(v) : v;
    }
    const k = fd.get('referensiId'); if (k) body.referensiId = k; else if (id) body.referensiId = null;
    if (!id) body.entityId = fd.get('entityId');
    try {
      if (id) { const cur = cache[key].find((x) => x.id === id); await API.patch(`/api/v1/eaw/objects/${c.path}/${id}`, body, `"${cur.version}"`); }
      else await API.post(`/api/v1/eaw/objects/${c.path}`, body);
      A.closeAll(); A.toast('Tersimpan (Draf)', esc(c.label), 'success'); A.route();
    } catch (err) { const el = document.getElementById('dom-err'); if (el) el.innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(err))}</div></div>`; else fail(err); }
  }

  /* ---------- detail ---------- */
  async function open(key, id) {
    const c = CFG[key]; let o = (cache[key] || []).find((x) => x.id === id);
    try { o = await API.get(`/api/v1/eaw/objects/${c.path}/${id}`); const i = (cache[key] || []).findIndex((x) => x.id === id); if (i >= 0) cache[key][i] = o; } catch (e) { if (!o) return fail(e); }
    let rules = null, rels = [];
    try { if (RULED.includes(c.type)) rules = (await API.get(`/api/v1/eaw/readiness/${c.type}/${id}`)).rules; } catch (e) { /* tanpa izin */ }
    try { rels = (await API.get('/api/v1/eaw/relations', { objekType: c.type, objekId: id })).data; } catch (e) { /* tanpa izin */ }
    const next = NEXT[o.status]; const editable = o.status === 'Draf' && A.can('eaw.model.write');
    const attrs = c.fields.map((f) => `<dt>${esc(f.l.replace(/\s*\(.*\)/, ''))}</dt><dd>${f.t === 'check' ? (o[f.n] ? 'Ya' : 'Tidak') : f.t === 'parent' ? esc(((cache.proses || []).find((p) => p.id === o.parentId) || {}).nama || '—') : esc(o[f.n] ?? '—')}</dd>`).join('');
    A.openDrawer(`<div class="drawer-hd"><div><div class="row">${A.tag(c.type)}${A.badge(o.status)}</div><h2 class="mt-s">${esc(nameOf(c, o))}</h2><p class="small muted">${esc(o.entityCode)} · ${esc(c.label)}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><h3>Siklus status (AF-05)</h3><div class="mt-s">${A.lifecycle(o.status)}</div>
        <h3 class="mt">Atribut</h3><dl class="dl mt-s">${attrs}<dt>KRA</dt><dd>${kraTag(o)}</dd></dl>
        ${rules ? `<h3 class="mt">Kelengkapan wajib (EAW-05)</h3><div class="stack mt-s">${rules.map((r) => `<div class="row small"><span style="color:${r.ok ? 'var(--ok)' : 'var(--err)'};font-weight:800;width:16px">${r.ok ? '✓' : '✕'}</span><span style="flex:1">${esc(r.pesan)}</span></div>`).join('')}</div>` : ''}
        <h3 class="mt">Relasi ArchiMate (${rels.length})</h3><div class="stack small mt-s">${rels.length ? rels.map((r) => { const out = r.sumberId === id; return `<div class="row"><span class="tag">${esc(r.tipe)}</span><span>${out ? '→' : '←'}</span><span style="flex:1">${esc((out ? r.targetLabel : r.sumberLabel) || (out ? r.targetType : r.sumberType))}</span><span class="tiny muted">${esc(out ? r.targetType : r.sumberType)}</span>${editable && out ? `<button class="btn sm ghost" title="Hapus relasi" onclick="App.domRelDel('${key}','${id}','${r.id}')">✕</button>` : ''}</div>`; }).join('') : '<span class="muted">Belum ada relasi.</span>'}</div>
        ${editable && c.rels.length ? `<div class="row mt-s">${c.rels.map(([tt, lbl], i) => `<button class="btn sm" onclick="App.domRelForm('${key}','${id}',${i})">+ ${esc(lbl)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="drawer-ft">${editable ? `<button class="btn danger" onclick="App.domDel('${key}','${id}')">Hapus</button><button class="btn" onclick="App.domForm('${key}','${id}')">Ubah</button>` : ''}${A.lockBtn(next[2], next[1], `App.domTransition('${key}','${id}')`, 'btn pri')}</div>`);
  }
  async function transition(key, id) {
    const c = CFG[key]; const o = (cache[key] || []).find((x) => x.id === id); const to = NEXT[o.status][0]; let catatan;
    if (['Ditetapkan', 'Direviu'].includes(to)) { catatan = prompt(`Catatan keputusan untuk ${o.status} → ${to} (min. 5 karakter):`); if (!catatan) return; }
    try { await API.post('/api/v1/eaw/transitions', { objekType: c.type, objekId: id, to, catatan }); A.toast('Transisi tercatat', `${esc(nameOf(c, o))}: ${o.status} → ${to}`, 'success'); A.route(); setTimeout(() => open(key, id), 400); }
    catch (err) { fail(err); }
  }
  async function del(key, id) {
    if (!confirm('Hapus objek Draf ini? Jejak tetap tersimpan di audit trail.')) return;
    try { await API.del(`/api/v1/eaw/objects/${CFG[key].path}/${id}`); A.closeAll(); A.toast('Objek dihapus', '', 'success'); A.route(); } catch (err) { fail(err); }
  }
  async function relForm(key, id, idx) {
    const c = CFG[key]; const [tt, lbl, path, tipes] = c.rels[idx]; let items = [];
    try { items = (await API.all(`/api/v1/eaw/objects/${path}`)).filter((x) => x.id !== id); } catch (e) { /* tanpa izin */ }
    A.openModal(`<div class="drawer-hd"><h2>Hubungkan → ${esc(lbl)}</h2><button class="x" onclick="App.closeAll()">×</button></div>
      <form class="drawer-bd" id="drel-form" onsubmit="App.domRelSave(event,'${key}','${id}',${idx})"><div class="form-grid">
        <div class="field"><label>Tipe relasi</label><select class="select" name="tipe">${tipes.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(lbl)}</label><select class="select" name="targetId" required><option value="">— pilih —</option>${items.map((x) => `<option value="${esc(x.id)}">${esc(nameOf(CFG[Object.keys(CFG).find((k) => CFG[k].path === path)], x))}</option>`).join('')}</select></div></div><div id="drel-err" class="mt"></div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('drel-form').requestSubmit()">Hubungkan</button></div>`);
  }

  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail; entUuid = ctx.entUuid;
    for (const key of Object.keys(CFG)) {
      const c = CFG[key];
      A.PAGES[`eaw/${key}`] = () => ({
        html: A.pageHd(c.title, c.sub, A.lockBtn('eaw.model.write', c.add, `App.domForm('${key}')`, 'btn pri')) + '<div id="dom-body"><div class="small muted">Memuat…</div></div>',
        mount: () => loadPage(key),
      });
    }
    A.domForm = form; A.domSave = save; A.domOpen = open; A.domTransition = transition; A.domDel = del; A.domRelForm = relForm;
    A.domSvc = (k) => { cache._svc = k; if (cache.layanan) document.getElementById('dom-body').innerHTML = R.layanan(cache.layanan); };
    A.domRelDel = async (key, id, rid) => { try { await API.del(`/api/v1/eaw/relations/${rid}`); A.toast('Relasi dihapus', '', 'success'); open(key, id); } catch (err) { fail(err); } };
    A.domRelSave = async (e, key, id, idx) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const c = CFG[key]; const tt = c.rels[idx][0];
      try { await API.post('/api/v1/eaw/relations', { sumberType: c.type, sumberId: id, targetType: tt, targetId: f.targetId, tipe: f.tipe }); A.closeAll(); A.toast('Relasi dibuat', '', 'success'); setTimeout(() => open(key, id), 200); }
      catch (err) { document.getElementById('drel-err').innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(err))}</div></div>`; }
    };
  }
  return { install };
})();
