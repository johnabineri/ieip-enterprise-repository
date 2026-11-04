/* =====================================================================
   SAORAJA EAP — tata kelola (mode live): KRA Manager (EAW-06), Framework Builder (EAW-05), ARB (pre-screening + ajukan ulang), Dashboard (EAW-08).
   Dipasang oleh live.js (LiveGov.install) setelah live-domains.js. Semua angka berasal dari API (RLS pemanggil) — tidak ada angka contoh.
   ===================================================================== */
window.LiveGov = (function () {
  let A, API, D, fail, entUuid, refreshAll;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NEXT = { Draf: ['Divalidasi', 'Ajukan Validasi', 'eaw.workflow.validate'], Divalidasi: ['Ditetapkan', 'Tetapkan (ARB)', 'eaw.arb.approve'], Ditetapkan: ['Dipublikasi', 'Publikasikan', 'eaw.publish.run'],
    Dipublikasi: ['Direviu', 'Mulai Reviu (AF-07)', 'eaw.workflow.validate'], Direviu: ['Ditetapkan', 'Tetapkan versi baru', 'eaw.arb.approve'] };
  const DOMAINS = ['proses_bisnis', 'data', 'layanan', 'aplikasi', 'infrastruktur', 'keamanan'];
  const err = (id, e) => { const el = document.getElementById(id); const html = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`; if (el) el.innerHTML = html; else fail(e); };
  const errBox = (e) => (e.status === 403 ? '<div class="callout warn"><span class="ic">🔒</span><div>Peran Anda tidak memiliki izin untuk melihat data ini (403 dari API).</div></div>' : `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`);
  const syncKra = async () => { try { const r = (await API.all('/api/v1/eaw/references')); D.KRA.length = 0; D.KRA.push(...r.map((x) => ({ id: x.id, kode: x.kode, domain: x.domain, nama: x.nama, versi: x.versi, status: x.status, objek: 0 }))); } catch (e) { /* tanpa izin */ } };
  async function transition(type, id, o, after) {
    const to = NEXT[o.status][0]; let catatan;
    if (['Ditetapkan', 'Direviu'].includes(to)) { catatan = prompt(`Catatan keputusan untuk ${o.status} → ${to} (min. 5 karakter):`); if (!catatan) return; }
    try { await API.post('/api/v1/eaw/transitions', { objekType: type, objekId: id, to, catatan }); A.toast('Transisi tercatat', `${o.status} → ${to}`, 'success'); A.route(); setTimeout(after, 400); } catch (e) { fail(e); }
  }

  /* ================= KRA Manager ================= */
  const kra = {};                                              // id -> referensi terakhir
  async function kraPage() {
    const box = document.getElementById('gov-body'); if (!box) return;
    try {
      const refs = (await API.all('/api/v1/eaw/references')); refs.forEach((r) => { kra[r.id] = r; }); await syncKra();
      const per = (d) => refs.filter((r) => r.domain === d);
      box.innerHTML = `<div class="grid g3 mb">${DOMAINS.map((d) => { const dm = A.dom(d); return `<div class="card kpi" style="border-left:4px solid ${dm.color}"><div class="lbl">D${dm.n} · ${esc(dm.nama)}</div><div class="val">${per(d).length}<small>referensi</small></div><div class="tgt">${per(d).filter((r) => r.status === 'Dipublikasi').length} Dipublikasi</div></div>`; }).join('')}</div>` +
        A.card(`Daftar Referensi (${refs.length})`, A.table([{ h: 'Kode', v: (r) => `<b class="mono">${esc(r.kode)}</b>` }, { h: 'Domain', v: (r) => `<span class="row" style="gap:6px"><i class="dom-dot" style="background:${A.dom(r.domain).color}"></i>${esc(A.dom(r.domain).nama)}</span>` },
          { h: 'Nama', v: (r) => esc(r.nama) }, { h: 'Versi', v: (r) => esc(r.versi) }, { h: 'Status', v: (r) => A.badge(r.status) }], refs, { click: (r) => `App.kraOpen('${r.id}')` }), { flush: true });
    } catch (e) { box.innerHTML = errBox(e); }
  }
  async function kraForm(id) {
    const cur = id ? kra[id] : null;
    A.openModal(`<div class="drawer-hd"><h2>${cur ? 'Ubah' : 'Tambah'} KRA</h2><button class="x" onclick="App.closeAll()">×</button></div>
      <form class="drawer-bd" id="kra-form" onsubmit="App.kraSave(event,'${id || ''}')"><div class="form-grid">
        ${cur ? '' : `<div class="field"><label>Domain <span class="req">*</span></label><select class="select" name="domain">${DOMAINS.map((d) => `<option value="${d}">D${A.dom(d).n} · ${esc(A.dom(d).nama)}</option>`).join('')}</select></div>
        <div class="field"><label>Kode <span class="req">*</span></label><input class="input" name="kode" required placeholder="mis. KRA-DAT-002" pattern="[A-Z0-9][A-Z0-9_.\\-]*"></div>`}
        <div class="field full"><label>Nama <span class="req">*</span></label><input class="input" name="nama" required value="${esc(cur ? cur.nama : '')}"></div>
        <div class="field"><label>Versi</label><input class="input" name="versi" value="${esc(cur ? cur.versi : '1.0')}"></div>
        <div class="field full"><label>Deskripsi</label><textarea class="textarea" name="deskripsi">${esc(cur ? cur.deskripsi || '' : '')}</textarea></div></div><div id="kra-err" class="mt"></div>
        <div class="callout info mt"><span class="ic">ℹ</span>KRA hanya disusun Holding EA Office (AF-04). Objek entitas wajib tertaut ke KRA sebelum Divalidasi.</div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('kra-form').requestSubmit()">Simpan Draf</button></div>`);
  }
  async function kraSave(e, id) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const body = { nama: f.nama, versi: f.versi || undefined, deskripsi: f.deskripsi || undefined };
    try {
      if (id) await API.patch(`/api/v1/eaw/references/${id}`, body, `"${kra[id].version}"`); else await API.post('/api/v1/eaw/references', { ...body, domain: f.domain, kode: f.kode });
      A.closeAll(); A.toast('KRA tersimpan', esc(f.nama), 'success'); A.route();
    } catch (x) { err('kra-err', x); }
  }
  async function kraOpen(id) {
    let r = kra[id]; try { r = await API.get(`/api/v1/eaw/references/${id}`); kra[id] = r; } catch (e) { if (!r) return fail(e); }
    // objek tertaut (EAW-06): hitung objek entitas yang memakai KRA ini
    const linked = {}; const paths = [['Proses', 'processes'], ['Entitas Data', 'data-entities'], ['Layanan', 'services'], ['Infrastruktur', 'infra-assets'], ['Kontrol', 'controls']];
    for (const [l, p] of paths) { try { const n = (await API.all(`/api/v1/eaw/objects/${p}`)).filter((o) => o.referensiId === id).length; if (n) linked[l] = n; } catch (e) { /* tanpa izin */ } }
    const na = D.APPS.filter((a) => a.referensiId === id).length; if (na) linked.Aplikasi = na;
    const next = NEXT[r.status]; const editable = r.status === 'Draf' && A.can('eaw.kra.write');
    A.openDrawer(`<div class="drawer-hd"><div><div class="row">${A.tag(r.kode)}${A.badge(r.status)}</div><h2 class="mt-s">${esc(r.nama)}</h2><p class="small muted">D${A.dom(r.domain).n} · ${esc(A.dom(r.domain).nama)} · versi ${esc(r.versi)}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><h3>Siklus status (AF-05)</h3><div class="mt-s">${A.lifecycle(r.status)}</div>
        <h3 class="mt">Deskripsi</h3><p class="small mt-s">${esc(r.deskripsi || '—')}</p>
        <h3 class="mt">Objek tertaut</h3><div class="stack small mt-s">${Object.keys(linked).length ? Object.entries(linked).map(([l, n]) => `<div class="row"><span style="flex:1">${esc(l)}</span><b>${n}</b></div>`).join('') : '<span class="muted">Belum ada objek yang menautkan KRA ini (hanya objek yang terlihat oleh Anda yang dihitung).</span>'}</div></div>
      <div class="drawer-ft">${editable ? `<button class="btn danger" onclick="App.kraDel('${id}')">Hapus</button><button class="btn" onclick="App.kraForm('${id}')">Ubah</button>` : ''}${A.lockBtn(next[2], next[1], `App.kraTrans('${id}')`, 'btn pri')}</div>`);
  }

  /* ================= Framework Builder ================= */
  const fw = {};
  const fwRules = async (id) => { try { return (await API.get(`/api/v1/eaw/readiness/framework/${id}`)).rules; } catch (e) { return null; } };
  async function fwPage() {
    const box = document.getElementById('gov-body'); if (!box) return;
    try {
      const items = await API.all('/api/v1/eaw/objects/frameworks'); items.forEach((f) => { fw[f.id] = f; });
      const rules = await Promise.all(items.map((f) => fwRules(f.id)));
      box.innerHTML = items.length ? `<div class="grid g3">${items.map((f, i) => { const rs = rules[i] || []; const ok = rs.filter((r) => r.ok).length;
        return A.card(esc(f.layananUtama), `<div class="row">${A.tag(f.tipe)}<span class="small muted">${esc(f.entityCode)}</span></div><div class="progress mt-s"><i style="width:${Math.round((ok / 6) * 100)}%"></i></div><div class="tiny muted mt-s">${ok}/6 domain terpenuhi</div>
          <div class="row mt-s" style="flex-wrap:wrap;gap:4px">${rs.map((r) => `<span class="badge ${r.ok ? 'b-ok' : ''}" title="${esc(r.pesan)}">${esc(r.rule.replace('_', ' '))}</span>`).join('')}</div><div class="row mt-s"><button class="btn sm" onclick="App.fwOpen('${f.id}')">Kelola</button></div>`, { acts: A.badge(f.status) }); }).join('')}</div>`
        : A.card('', '<div class="empty"><div class="big">∅</div>Belum ada Kerangka Kerja. Buat satu per layanan utama (AF-02), lalu tandai relasi objek ke dalamnya.</div>');
    } catch (e) { box.innerHTML = errBox(e); }
  }
  async function fwForm() {
    A.openModal(`<div class="drawer-hd"><h2>Kerangka Kerja Baru</h2><button class="x" onclick="App.closeAll()">×</button></div>
      <form class="drawer-bd" id="fw-form" onsubmit="App.fwSave(event)"><div class="form-grid">
        <div class="field full"><label>Layanan utama <span class="req">*</span></label><input class="input" name="layananUtama" required placeholder="mis. Penjualan Kendaraan"></div>
        <div class="field"><label>Tipe</label><select class="select" name="tipe"><option value="utama">utama</option><option value="pendukung">pendukung</option></select></div>
        <div class="field"><label>Entitas</label><select class="select" name="entityId">${D.ENTITIES.map((e) => `<option value="${esc(e.uuid)}">${esc(e.nama)}</option>`).join('')}</select></div></div><div id="fw-err" class="mt"></div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('fw-form').requestSubmit()">Simpan Draf</button></div>`);
  }
  async function fwSave(e) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try { await API.post('/api/v1/eaw/objects/frameworks', f); A.closeAll(); A.toast('Kerangka Kerja dibuat (Draf)', esc(f.layananUtama), 'success'); A.route(); } catch (x) { err('fw-err', x); }
  }
  async function fwOpen(id) {
    let f = fw[id]; try { f = await API.get(`/api/v1/eaw/objects/frameworks/${id}`); fw[id] = f; } catch (e) { if (!f) return fail(e); }
    const rules = await fwRules(id) || [];
    let inFw = [], free = []; try { inFw = (await API.all('/api/v1/eaw/relations', { kerangkaId: id })); free = (await API.all('/api/v1/eaw/relations')).filter((r) => !r.kerangkaId); } catch (e) { /* tanpa izin */ }
    const editable = f.status === 'Draf' && A.can('eaw.model.write'); const next = NEXT[f.status];
    const lbl = (r) => `${esc(r.sumberLabel || r.sumberType)} <span class="muted">—${esc(r.tipe)}→</span> ${esc(r.targetLabel || r.targetType)}`;
    A.openDrawer(`<div class="drawer-hd"><div><div class="row">${A.tag(f.tipe)}${A.badge(f.status)}</div><h2 class="mt-s">${esc(f.layananUtama)}</h2><p class="small muted">${esc(f.entityCode)} · Kerangka Kerja</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><h3>Siklus status (AF-05)</h3><div class="mt-s">${A.lifecycle(f.status)}</div>
        <h3 class="mt">Cakupan 6 domain (EAW-05)</h3><div class="stack mt-s">${rules.map((r) => `<div class="row small"><span style="color:${r.ok ? 'var(--ok)' : 'var(--err)'};font-weight:800;width:16px">${r.ok ? '✓' : '✕'}</span><span style="flex:1">${esc(r.pesan)}</span></div>`).join('')}</div>
        <h3 class="mt">Relasi dalam kerangka (${inFw.length})</h3><div class="stack small mt-s">${inFw.length ? inFw.map((r) => `<div class="row"><span style="flex:1">${lbl(r)}</span>${editable ? `<button class="btn sm ghost" title="Lepas dari kerangka" onclick="App.fwTag('${id}','${r.id}',null)">✕</button>` : ''}</div>`).join('') : '<span class="muted">Belum ada relasi yang ditandai.</span>'}</div>
        ${editable ? `<h3 class="mt">Tandai relasi yang sudah ada</h3><div class="row mt-s"><select class="select" id="fw-rel"><option value="">— pilih relasi (${free.length}) —</option>${free.map((r) => `<option value="${esc(r.id)}">${esc((r.sumberLabel || r.sumberType) + ' → ' + (r.targetLabel || r.targetType) + ' (' + r.tipe + ')')}</option>`).join('')}</select><button class="btn sm" onclick="App.fwTag('${id}',document.getElementById('fw-rel').value,'${id}')">Tandai</button></div><p class="tiny muted mt-s">Relasi dibuat di detail objek (aplikasi, layanan, proses). Hanya relasi dengan sumber Draf yang dapat ditandai.</p>` : ''}</div>
      <div class="drawer-ft">${editable ? `<button class="btn danger" onclick="App.fwDel('${id}')">Hapus</button>` : ''}${A.lockBtn(next[2], next[1], `App.fwTrans('${id}')`, 'btn pri')}</div>`);
  }

  /* ================= ARB ================= */
  let lastArb = null;
  async function arbScreen(e) {
    e.preventDefault(); if (!A.can('eaw.arb.submit')) return A.deny('eaw.arb.submit');
    const f = new FormData(e.target);
    lastArb = { entityId: entUuid(f.get('entity')), initiativeName: f.get('name'), businessCase: f.get('bc'), estimatedCost: Number(f.get('cost')) || undefined, dataEntities: f.getAll('ent') };
    const out = A.$('#arb-result'); out.innerHTML = A.card('Hasil Pre-Screening', '<div class="empty"><div class="big">⟳</div>Memeriksa katalog aplikasi & prinsip Satu Data Korporasi…</div>');
    try {
      const r = await API.post('/api/v1/gov/arb/clearances/screen', { initiativeName: lastArb.initiativeName, businessCase: lastArb.businessCase, dataEntities: lastArb.dataEntities });
      const hi = r.score >= r.threshold;
      out.innerHTML = A.card('Hasil Pre-Screening', `<div class="row"><div style="font-size:40px;font-weight:800;color:${hi ? 'var(--err)' : 'var(--ok)'}">${r.score}%</div><div class="small">skor kemiripan<br>tertinggi vs katalog</div></div>
        <div class="stack mt small">${r.matches.length ? r.matches.map((m) => A.Chart.hbar(`${m.kode} · ${m.nama}`, m.similarity, 100, { color: m.similarity >= r.threshold ? 'var(--err)' : 'var(--d2)', target: r.threshold, fmt: (v) => v + '%' })).join('') : '<span class="muted">Katalog masih kosong — tidak ada pembanding.</span>'}</div>
        ${r.violations.length ? `<div class="callout err mt"><span class="ic">⛔</span><div><b>Melanggar Prinsip Satu Data Korporasi.</b> ${r.violations.map((v) => esc(v.message)).join(' ')} Usulan ditolak otomatis; integrasikan master dari SEDDI lewat API / replika ref.*.</div></div>` : ''}
        ${hi && !r.violations.length ? '<div class="callout warn mt"><span class="ic">→</span><div><b>Berpotensi duplikasi.</b> Pertimbangkan memakai aplikasi yang sudah ada; ARB akan menilai alasan pengajuan.</div></div>' : ''}
        <div class="tiny muted mt-s">Kemiripan leksikal (pg_trgm) terhadap aplikasi yang terlihat oleh Anda — heuristik, bukan model MIND AI.</div>
        <div class="row mt">${r.violations.length ? '' : '<button class="btn pri" onclick="App.arbSubmit()">Ajukan ke ARB</button>'}</div>`, { meta: 'POST /api/v1/gov/arb/clearances/screen' });
    } catch (x) { out.innerHTML = A.card('Hasil Pre-Screening', errBox(x)); }
  }
  async function arbSubmit() {
    if (!lastArb) return;
    try { const t = await API.post('/api/v1/gov/arb/clearances', lastArb); lastArb = null; A.toast(`Tiket ${esc(t.ticketNumber)} diajukan`, `SUBMITTED · skor kemiripan ${t.aiRiskScore}%`, 'success'); A.TABSTATE.arb = 'sidang'; await refreshAll(); }
    catch (x) { fail(x); }
  }
  async function arbResubmit(no) {
    const t = D.ARB.find((x) => x.no === no);
    try { await API.post(`/api/v1/gov/arb/clearances/${t.id}/transition`, { to: 'SUBMITTED' }); A.toast('Diajukan ulang', no, 'success'); A.closeAll(); await refreshAll(); } catch (x) { fail(x); }
  }

  /* ================= Dashboard ================= */
  async function dashboard() {
    const box = document.getElementById('gov-body'); if (!box) return;
    let d; try { d = await API.get('/api/v1/eaw/dashboard'); } catch (e) { box.innerHTML = errBox(e); return; }
    const TYPES = [['application', 'Aplikasi'], ['process', 'Proses'], ['data_entity', 'Entitas Data'], ['service', 'Layanan'], ['infra_asset', 'Infrastruktur'], ['control', 'Kontrol'], ['framework', 'Kerangka'], ['reference', 'KRA']];
    const ST = ['Draf', 'Divalidasi', 'Ditetapkan', 'Dipublikasi', 'Direviu']; const colors = ['var(--faint)', 'var(--info)', 'var(--ok)', 'var(--violet)', 'var(--warn)'];
    const counts = ST.map((s) => ({ l: s, v: TYPES.reduce((a, [t]) => a + d.objects[t].byStatus[s], 0) })); const total = counts.reduce((a, c) => a + c.v, 0);
    const baseline = d.objects.application.byStatus.Ditetapkan + d.objects.application.byStatus.Dipublikasi;
    const done = d.bootstrap.filter((s) => s.done).length; const firstOpen = d.bootstrap.findIndex((s) => !s.done);
    const arbActive = d.arb.SUBMITTED + d.arb.IN_REVIEW + d.arb.REVISION;
    const rated = d.entities.filter((e) => e.ikaLevel);
    box.innerHTML = A.card('Prinsip Bootstrap — EAP dimulai kosong, diisi Architect (SAF §8.2)', `<div class="onb">${d.bootstrap.map((s, i) => `<div class="s ${s.done ? 'done' : i === firstOpen ? 'cur' : ''}"><b>LANGKAH ${s.step}</b>${esc(s.label)}<div class="tiny faint mono">${esc(s.detail)}</div></div>`).join('')}</div>`, { meta: `Progres onboarding ${Math.round((done / 7) * 100)}%` }) +
      `<div class="grid g5 mt">
        ${A.kpi('IKA Grup (rata-rata)', rated.length ? (rated.reduce((s, e) => s + e.ikaLevel, 0) / rated.length).toFixed(1).replace('.', ',') + '<small>/ 5</small>' : '—', { tgt: rated.length ? `${rated.length} entitas sudah dinilai` : 'belum ada entitas dinilai (eaw.entity_org_metadata)' })}
        ${A.kpi('Aplikasi terdaftar', `${d.objects.application.total}<small>entri</small>`, { delta: `${d.apps.platforms} platform · ${d.apps.workspaces} workspace`, tgt: `${baseline} berstatus baseline` })}
        ${A.kpi('Tiket ARB aktif', arbActive, { tgt: `${d.arb.IN_REVIEW} menunggu putusan · ${d.arb.APPROVED} disetujui` })}
        ${A.kpi('Relasi antar-objek', d.relations, { tgt: 'eaw.relation (ArchiMate)' })}
        ${A.kpi('Workspace belum ditempatkan', d.apps.unplaced, { tgt: d.apps.unplaced ? 'butuh eaw.workspace.assign' : 'semua ditempatkan', up: !d.apps.unplaced })}
      </div>
      <div class="grid g-2-1 mt">
        ${A.card('Kematangan & Kelengkapan per Entitas', d.entities.filter((e) => e.kafLevel !== 'unit').length ? A.table([{ h: 'Entitas', v: (e) => `<b>${esc(e.name)}</b><div class="tiny muted">${esc(e.code)} · ${esc(e.kafLevel || '')}</div>` },
          { h: 'IKA', v: (e) => (e.ikaLevel ? A.ikaPill(e.ikaLevel) : '<span class="muted small">belum dinilai</span>') }, { h: 'Objek', num: 1, v: (e) => e.objects },
          { h: 'Kelengkapan', v: (e) => (e.objects ? A.Chart.hbar('', Math.round((e.validated / e.objects) * 100), 100, { color: 'var(--ok)', fmt: (v) => v + '%' }) : '<span class="muted small">—</span>') }], d.entities.filter((e) => e.kafLevel !== 'unit' && (e.objects || e.ikaLevel))) : '<div class="empty">Belum ada entitas.</div>', { flush: true, meta: 'kelengkapan = objek ≥ Divalidasi / total' })}
        ${A.card('Status Objek (AF-05)', `<div class="row" style="justify-content:center">${A.Chart.donut(counts.map((c, i) => ({ ...c, c: colors[i] })), { label: total, sub: 'objek' })}</div><div class="stack mt-s">${counts.map((c, i) => `<div class="row small"><i class="dom-dot" style="background:${colors[i]}"></i>${c.l}<b class="right">${c.v}</b></div>`).join('')}</div>`)}
      </div>
      <div class="grid g2 mt">
        ${A.card('Objek per Jenis & Status', A.table([{ h: 'Jenis', v: (r) => `<b>${esc(r[1])}</b>` }, ...ST.map((s, i) => ({ h: s, num: 1, v: (r) => d.objects[r[0]].byStatus[s] })), { h: 'Total', num: 1, v: (r) => `<b>${d.objects[r[0]].total}</b>` }], TYPES), { flush: true })}
        ${A.card('Pelacak Tiket ARB Clearance', D.ARB.length ? A.table([{ h: 'Tiket', v: (r) => `<span class="mono">${esc(r.no)}</span>` }, { h: 'Inisiatif', v: (r) => esc(r.name) }, { h: 'Kemiripan', num: 1, v: (r) => `<b style="color:${r.score >= 75 ? 'var(--err)' : 'var(--text)'}">${r.score}%</b>` }, { h: 'Status', v: (r) => A.arbBadge(r.status) }],
          D.ARB.slice(0, 6), { click: (r) => `App.arbDetail('${r.no}')` }) : '<div class="empty">Belum ada tiket ARB.</div>', { flush: true, acts: '<a class="btn sm" href="#/eaw/arb">Meja Sidang →</a>' })}
      </div>`;
  }


  /* ================= Pengaturan -> Struktur Organisasi (atribut arsitektur: tingkat KAF, IKA, KRA default) ================= */
  let orgSel = null;
  async function orgPage() {
    const box = document.getElementById('gov-body'); if (!box) return;
    let rows; try { rows = (await API.get('/api/v1/eaw/entity-org')).data; } catch (e) { box.innerHTML = errBox(e); return; }
    const byParent = new Map(); rows.forEach((r) => { const k = rows.some((x) => x.id === r.parentId) ? r.parentId : ''; (byParent.get(k) || byParent.set(k, []).get(k)).push(r); });
    const node = (r) => `<li><div class="node ${r.id === orgSel ? 'on' : ''}" onclick="App.orgSelect('${r.id}')"><span class="lvl">${esc(r.kafLevel || '')}</span><b style="flex:1">${esc(r.name)}</b><span class="tag">${esc(r.code)}</span>${r.kafLevelConfirmed ? '<span class="badge b-ok nodot" title="Tingkat KAF dikonfirmasi">✓</span>' : '<span class="badge nodot" title="Belum dikonfirmasi (memakai pemetaan bawaan)">·</span>'}${r.ikaLevel ? A.ikaPill(r.ikaLevel) : '<span class="tiny muted">IKA —</span>'}</div>${(byParent.get(r.id) || []).length ? `<ul>${byParent.get(r.id).map(node).join('')}</ul>` : ''}</li>`;
    const roots = byParent.get('') || [];
    const sel = rows.find((r) => r.id === orgSel) || roots[0]; orgSel = sel && sel.id;
    const conf = rows.filter((r) => r.kafLevelConfirmed).length; const rated = rows.filter((r) => r.ikaLevel).length;
    const canW = A.can('eaw.org.write'); const kras = D.KRA.filter((k) => k.status === 'Dipublikasi');
    box.innerHTML = `<div class="callout gold mb"><span class="ic">🔒</span><div><b>CMP = SSOT struktur organisasi.</b> Nama dan hierarki diubah di SEDDI (DD-02). EAP hanya mengelola atribut arsitektur di <code>eaw.entity_org_metadata</code>: tingkat KAF, IKA, tautan KRA, catatan.</div></div>
      <div class="grid g3 mb">${A.kpi('Entitas', rows.length, { tgt: 'dari replika ref.business_groups' })}${A.kpi('Tingkat KAF dikonfirmasi', `${conf}<small>/ ${rows.length}</small>`, { tgt: 'langkah 1 bootstrap' })}${A.kpi('Sudah dinilai IKA', `${rated}<small>/ ${rows.length}</small>`, { tgt: 'skala 1–5 (SAF §6.3)' })}</div>
      <div class="grid g-2-1">${A.card('Hierarki (dari ref.business_groups)', `<div class="tree"><ul>${roots.map(node).join('')}</ul></div>`, { acts: canW && conf < rows.length ? '<button class="btn sm" onclick="App.orgConfirmAll()">✓ Konfirmasi semua tingkat KAF</button>' : '' })}
      ${sel ? A.card('Metadata Arsitektur', `<form id="org-form" onsubmit="App.orgSave(event,'${sel.id}')" class="stack"><div><b>${esc(sel.name)}</b><div class="tiny muted">${esc(sel.code)} · ${esc(sel.groupKind)}</div></div>
        <div class="field"><label>Tingkat KAF</label><select class="select" name="kafLevel" ${canW ? '' : 'disabled'}>${['holding', 'ecosystem', 'sbu', 'unit'].map((k) => `<option ${k === sel.kafLevel ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label>IKA (1–5)</label><select class="select" name="ikaLevel" ${canW ? '' : 'disabled'}><option value="">— belum dinilai —</option>${[1, 2, 3, 4, 5].map((n) => `<option ${n === sel.ikaLevel ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label>Tautan KRA default</label><select class="select" name="referenceId" ${canW ? '' : 'disabled'}><option value="">— tidak ada —</option>${kras.map((k) => `<option value="${esc(k.id)}" ${k.id === sel.referenceId ? 'selected' : ''}>${esc(k.kode)} · ${esc(k.nama)}</option>`).join('')}</select></div>
        <div class="field"><label>Catatan</label><textarea class="textarea" name="notes" ${canW ? '' : 'disabled'}>${esc(sel.notes || '')}</textarea></div><div id="org-err"></div>
        ${canW ? '<button class="btn pri" type="submit">Simpan metadata</button>' : '<div class="tiny muted">Hanya peran holding-wide dengan izin eaw.org.write yang dapat mengubah.</div>'}</form>`) : ''}</div>`;
  }
  async function orgSave(e, id) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const body = { kafLevel: f.kafLevel, notes: f.notes || undefined }; if (f.ikaLevel) body.ikaLevel = Number(f.ikaLevel); if (f.referenceId) body.referenceId = f.referenceId;
    try { await API.put(`/api/v1/eaw/entity-org/${id}/metadata`, body); A.toast('Metadata tersimpan', '', 'success'); await refreshAll(); } catch (x) { err('org-err', x); }
  }
  async function orgConfirmAll() {
    if (!confirm('Konfirmasi tingkat KAF bawaan (pemetaan dari jenis grup) untuk semua entitas yang belum dikonfirmasi?')) return;
    try {
      const rows = (await API.get('/api/v1/eaw/entity-org')).data.filter((r) => !r.kafLevelConfirmed);
      for (const r of rows) await API.put(`/api/v1/eaw/entity-org/${r.id}/metadata`, { kafLevel: r.kafLevel });
      A.toast('Tingkat KAF dikonfirmasi', `${rows.length} entitas`, 'success'); await refreshAll();
    } catch (x) { fail(x); }
  }

  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail; entUuid = ctx.entUuid; refreshAll = ctx.refresh;
    const page = (title, sub, acts, mount) => () => ({ html: A.pageHd(title, sub, acts) + '<div id="gov-body"><div class="small muted">Memuat…</div></div>', mount });
    A.PAGES['eaw/kra'] = page('KRA Manager — Referensi Arsitektur Korporat', 'Referensi baku per domain, berversi; hanya Holding EA Office yang dapat mengubah (AF-04). Objek entitas wajib tertaut ke KRA (EAW-06).', A.lockBtn('eaw.kra.write', '+ KRA baru', 'App.kraForm()', 'btn pri'), kraPage);
    A.PAGES['eaw/kerangka'] = page('Framework Builder', 'Satu Kerangka Kerja per layanan utama (AF-02). Kerangka memuat relasi objek di keenam domain; Divalidasi ditolak bila ada domain yang kosong (EAW-05).', A.lockBtn('eaw.model.write', '+ Kerangka Kerja', 'App.fwForm()', 'btn pri'), fwPage);
    A.PAGES['eaw/dashboard'] = page('Dashboard Arsitektur', 'Ringkasan dihitung otomatis dari data EAW sesuai cakupan akses Anda (EAW-08). Tidak ada angka contoh pada mode live.', '<a class="btn pri" href="#/eaw/publisher">⇩ Terbitkan Dokumen</a>', dashboard);
    A.PAGES['set/org'] = page('Struktur Organisasi', 'Hierarki Holding → Ecosystem → SBU/PT → Unit Usaha (AF-03, SET-01). Struktur dibaca dari replika ref.business_groups — eaw.entity_org adalah VIEW (ADR-CMP-003).', '', orgPage);
    A.orgSelect = (id) => { orgSel = id; A.route(); };
    A.orgSave = orgSave; A.orgConfirmAll = orgConfirmAll;
    A.kraForm = kraForm; A.kraSave = kraSave; A.kraOpen = kraOpen;
    A.kraTrans = (id) => transition('reference', id, kra[id], () => kraOpen(id));
    A.kraDel = async (id) => { if (!confirm('Hapus KRA Draf ini?')) return; try { await API.del(`/api/v1/eaw/references/${id}`); A.closeAll(); A.toast('KRA dihapus', '', 'success'); A.route(); } catch (x) { fail(x); } };
    A.fwForm = fwForm; A.fwSave = fwSave; A.fwOpen = fwOpen;
    A.fwTrans = (id) => transition('framework', id, fw[id], () => fwOpen(id));
    A.fwTag = async (id, relId, kerangkaId) => { if (!relId) return; try { await API.patch(`/api/v1/eaw/relations/${relId}`, { kerangkaId }); A.route(); fwOpen(id); } catch (x) { fail(x); } };
    A.fwDel = async (id) => { if (!confirm('Hapus Kerangka Kerja Draf ini?')) return; try { await API.del(`/api/v1/eaw/objects/frameworks/${id}`); A.closeAll(); A.toast('Kerangka dihapus', '', 'success'); A.route(); } catch (x) { fail(x); } };
    A.arbScreen = arbScreen; A.arbSubmit = arbSubmit; A.arbResubmit = arbResubmit;
    // form pengajuan: kosongkan isian contoh bawaan prototipe
    const arbPage = A.PAGES['eaw/arb'];
    A.PAGES['eaw/arb'] = () => { const o = arbPage(); const m = o.mount; o.mount = (main) => { if (m) m(main); const f = document.getElementById('arb-form'); if (f) { f.elements.name.value = ''; f.elements.cost.value = ''; f.elements.bc.value = ''; f.querySelectorAll('input[name=ent]').forEach((c) => { c.checked = false; }); } }; return o; };
    const arbDetail = A.arbDetail;
    A.arbDetail = (no) => {
      arbDetail(no); const t = D.ARB.find((x) => x.no === no); const ft = document.querySelector('#drawer .drawer-ft');
      if (t && t.status === 'REVISION' && t.proposedBy === D.USERS[0].sub && A.can('eaw.arb.submit')) {
        const html = `<button class="btn pri" onclick="App.arbResubmit('${esc(no)}')">Ajukan ulang</button>`;
        if (ft) ft.insertAdjacentHTML('afterbegin', html); else document.querySelector('#drawer').insertAdjacentHTML('beforeend', `<div class="drawer-ft">${html}</div>`);
      }
    };
  }
  return { install };
})();
