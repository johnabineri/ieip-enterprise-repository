/* =====================================================================
   SAORAJA EAP — Master IT Roadmap (FR-04.1), mode live: fase + deliverable/milestone bertanggal nyata (/api/v1/eaw/roadmap).
   Zero Pre-Seed: halaman mulai kosong. "Terlambat" dihitung server (target < hari ini & belum selesai). Bukti objek EAW opsional menampilkan status
   objek saat ini tetapi tidak mengubah status butir. Dipasang oleh live.js menggantikan halaman contoh eaw/roadmap.
   ===================================================================== */
window.LiveRoadmap = (function () {
  let A, API, fail;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#0A8F4F', '#2E6FD8', '#B7791F', '#7B4FD0', '#C2410C', '#0E7490'];
  const ST = { direncanakan: ['Direncanakan', ''], berjalan: ['Berjalan', 'b-info'], selesai: ['Selesai', 'b-ok'], terhambat: ['Terhambat', 'b-warn'] };
  const OBJ = { application: ['Aplikasi', '/api/v1/eaw/applications'], process: ['Proses (D1)', '/api/v1/eaw/objects/processes'], data_entity: ['Entitas Data (D2)', '/api/v1/eaw/objects/data-entities'],
    service: ['Layanan (D3)', '/api/v1/eaw/objects/services'], infra_asset: ['Infrastruktur (D5)', '/api/v1/eaw/objects/infra-assets'], control: ['Kontrol (D6)', '/api/v1/eaw/objects/controls'], framework: ['Kerangka Kerja', '/api/v1/eaw/objects/frameworks'] };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const S = { data: null, phases: {}, items: {} };
  const errBox = (e) => (e.status === 403 ? '<div class="callout warn"><span class="ic">🔒</span><div>Peran Anda tidak memiliki izin <code>eaw.catalog.read</code>.</div></div>' : `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`);
  const idx = (d) => { const [y, m] = d.split('-').map(Number); return y * 12 + (m - 1); };
  const fmt = (d) => { if (!d) return '—'; const [y, m, dd] = d.split('-'); return `${Number(dd)} ${MON[Number(m) - 1]} ${y}`; };
  const objLabel = (o) => o.nama || o.namaKanonikal || (o.aspek ? o.aspek + (o.standarRujukan ? ' · ' + o.standarRujukan : '') : '') || o.layananUtama || o.kode || o.id;
  const optLabel = (t, o) => (t === 'application' ? `${o.kode} · ${o.nama}` : objLabel(o));

  function gantt(d) {
    if (!d.range || !d.phases.length) return '<div class="empty"><div class="big">🗓</div>Belum ada fase. Tambahkan fase pertama (mis. “Fase 1 — Fondasi”) lalu isi deliverable dan milestone-nya.</div>';
    const base = idx(d.range.mulai); let n = idx(d.range.selesai) - base + 1; const cut = n > 36; if (cut) n = 36; const cur = idx(d.today) - base + 1;
    const heads = Array.from({ length: n }, (_, i) => { const m = (base + i) % 12; return `<div class="gh" style="${i + 1 === cur ? 'background:var(--accent-soft);color:var(--accent-text)' : ''}">${MON[m]}${m === 0 || i === 0 ? `<br><span class="tiny">${Math.floor((base + i) / 12)}</span>` : ''}</div>`; }).join('');
    const rows = d.phases.map((f, k) => {
      const s = Math.max(1, idx(f.mulai) - base + 1), e = Math.min(n, idx(f.selesai) - base + 1); const done = f.items.filter((i) => i.status === 'selesai').length; const pct = f.items.length ? Math.round((done / f.items.length) * 100) : 0;
      return `<div class="gl">${esc(f.nama)}<div class="tiny muted">${pct}% · ${f.items.length} butir</div></div>${Array.from({ length: n }, (_, i) => i + 1 === s ? `<div class="gb" style="grid-column:span ${Math.max(1, e - s + 1)};padding:0 4px" title="${esc(f.nama)} · ${fmt(f.mulai)} – ${fmt(f.selesai)}"><div class="gbar" style="background:${COLORS[k % COLORS.length]}">${esc(f.items[0] ? f.items[0].judul : f.nama)}${f.items.length > 1 ? ' …' : ''}</div></div>` : i + 1 > s && i + 1 <= e ? '' : `<div style="${i + 1 === cur ? 'background:var(--accent-soft)' : ''}"></div>`).join('')}`;
    }).join('');
    return `<div style="overflow-x:auto"><div class="gantt" style="grid-template-columns:230px repeat(${n},minmax(42px,1fr));min-width:${230 + n * 46}px"><div class="gh" style="text-align:left">Fase</div>${heads}${rows}</div></div>${cut ? '<div class="tiny muted mt-s">Rentang melebihi 36 bulan; hanya 36 bulan pertama digambar.</div>' : ''}`;
  }
  const stBadge = (i) => `${A.pill(ST[i.status][0], ST[i.status][1])}${i.terlambat ? ' <span class="badge b-err">terlambat</span>' : ''}`;
  function itemRow(i, can) {
    const link = i.objectType ? `<div class="tiny muted">🔗 ${esc(OBJ[i.objectType][0])}: ${i.objectLabel ? esc(i.objectLabel) : '(di luar cakupan)'}${i.objectStatus ? ` · <b>${esc(i.objectStatus)}</b>` : ''}</div>` : '';
    return `<tr><td>${i.jenis === 'milestone' ? '◆' : '▪'} <b>${esc(i.judul)}</b>${i.catatan ? `<div class="tiny muted">${esc(i.catatan)}</div>` : ''}${link}</td><td class="mono tiny">${fmt(i.target)}</td>
      <td>${can ? `<select class="select" style="min-width:128px" onchange="App.rmStatus(${window.jsArg(i.id)},this.value)">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>` : ''} ${stBadge(i)}${i.selesaiPada ? `<div class="tiny muted">selesai ${fmt(i.selesaiPada)}</div>` : ''}</td>
      <td style="white-space:nowrap">${can ? `<button class="btn sm" onclick="App.rmItemForm(${window.jsArg(i.phaseId)},${window.jsArg(i.id)})">Ubah</button> <button class="btn sm danger" onclick="App.rmItemDel(${window.jsArg(i.id)})">Hapus</button>` : ''}</td></tr>`;
  }
  function phaseCard(f, k, can) {
    const done = f.items.filter((i) => i.status === 'selesai').length;
    return A.card(`<i class="dom-dot" style="background:${COLORS[k % COLORS.length]}"></i> ${esc(f.nama)}`,
      `${f.deskripsi ? `<p class="small muted mb">${esc(f.deskripsi)}</p>` : ''}${f.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Butir</th><th>Target</th><th>Status</th><th></th></tr></thead><tbody>${f.items.map((i) => itemRow(i, can)).join('')}</tbody></table></div>` : '<div class="empty small">Belum ada deliverable/milestone di fase ini.</div>'}`,
      { flush: !!f.items.length, meta: `${fmt(f.mulai)} – ${fmt(f.selesai)} · ${done}/${f.items.length} selesai`,
        acts: can ? `<button class="btn sm" onclick="App.rmItemForm(${window.jsArg(f.id)})">+ Butir</button><button class="btn sm" onclick="App.rmPhaseForm(${window.jsArg(f.id)})">Ubah</button><button class="btn sm danger" onclick="App.rmPhaseDel(${window.jsArg(f.id)})">Hapus</button>` : '' });
  }
  function tracker(d) {
    const ms = d.phases.flatMap((f) => f.items).filter((i) => i.jenis === 'milestone').sort((a, b) => a.target.localeCompare(b.target));
    return A.card('Pelacak Milestone', ms.length ? `<div class="list">${ms.map((m) => `<div class="li"><span class="ic" style="background:${m.status === 'selesai' ? 'var(--ok-soft)' : m.status === 'berjalan' ? 'var(--accent-soft)' : 'var(--surface-3)'}">${m.status === 'selesai' ? '✓' : m.status === 'berjalan' ? '◐' : m.status === 'terhambat' ? '⚠' : '○'}</span><div class="bd"><div class="t">${esc(m.judul)}</div><div class="tiny muted">${fmt(m.target)}${m.terlambat ? ' · <b style="color:var(--err)">terlambat</b>' : ''}</div></div></div>`).join('')}</div>` : '<div class="empty small">Belum ada milestone.</div>', { flush: !!ms.length });
  }
  async function mount() {
    const box = document.getElementById('rm-body'); if (!box) return;
    try {
      const d = S.data = await API.get('/api/v1/eaw/roadmap'); S.phases = {}; S.items = {};
      d.phases.forEach((f) => { S.phases[f.id] = f; f.items.forEach((i) => { S.items[i.id] = i; }); });
      const can = A.can('eaw.roadmap.write'); const s = d.summary;
      box.innerHTML = `<div class="grid g4 mb">${A.kpi('Butir roadmap', s.total, { tgt: `${d.phases.length} fase` })}${A.kpi('Selesai', `${s.persenSelesai}<small>%</small>`, { tgt: `${s.selesai} dari ${s.total} butir` })}${A.kpi('Terhambat', s.terhambat, { tgt: 'wajib beralasan' })}${A.kpi('Terlambat', s.terlambat, { tgt: 'target lewat, belum selesai' })}</div>
        ${A.card(`Gantt Fase${d.currentPhaseId ? ' — fase berjalan: ' + esc(S.phases[d.currentPhaseId].nama) : ''}`, gantt(d), { meta: `hari ini ${fmt(d.today)}` })}
        <div class="grid g-2-1 mt"><div class="stack">${d.phases.map((f, k) => phaseCard(f, k, can)).join('') || ''}</div>${tracker(d)}</div>
        <p class="tiny muted mt">Roadmap level grup; disusun Holding EA Office (<code>eaw.roadmap.write</code>). Bukti objek (🔗) menampilkan status objek EAW saat ini tetapi tidak mengubah status butir otomatis.</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }

  function phaseForm(id) {
    const cur = id ? S.phases[id] : null;
    A.openModal(`<div class="drawer-hd"><h2>${cur ? 'Ubah' : 'Tambah'} Fase</h2><button class="x" onclick="App.closeAll()">×</button></div>
      <form class="drawer-bd" id="rm-pf" onsubmit="App.rmPhaseSave(event,${window.jsArg(id || '')})"><div class="form-grid">
        <div class="field full"><label>Nama fase <span class="req">*</span></label><input class="input" name="nama" required minlength="2" value="${esc(cur ? cur.nama : '')}" placeholder="mis. Fase 1 — Fondasi"></div>
        <div class="field"><label>Mulai <span class="req">*</span></label><input class="input" type="date" name="mulai" required value="${cur ? cur.mulai : ''}"></div>
        <div class="field"><label>Selesai <span class="req">*</span></label><input class="input" type="date" name="selesai" required value="${cur ? cur.selesai : ''}"></div>
        <div class="field"><label>Urutan</label><input class="input" type="number" min="0" max="100" name="urutan" value="${cur ? cur.urutan : 0}"></div>
        <div class="field full"><label>Deskripsi</label><textarea class="textarea" name="deskripsi">${esc(cur ? cur.deskripsi || '' : '')}</textarea></div></div><div id="rm-err" class="mt"></div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('rm-pf').requestSubmit()">Simpan</button></div>`);
  }
  async function phaseSave(e, id) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const body = { nama: f.nama, mulai: f.mulai, selesai: f.selesai, urutan: Number(f.urutan || 0), deskripsi: f.deskripsi || undefined };
    try { if (id) await API.patch(`/api/v1/eaw/roadmap/phases/${id}`, body, `"${S.phases[id].version}"`); else await API.post('/api/v1/eaw/roadmap/phases', body); A.closeAll(); A.toast('Fase tersimpan', esc(f.nama), 'success'); mount(); }
    catch (er) { const b = document.getElementById('rm-err'); if (b) b.innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(er))}</div></div>`; else fail(er); }
  }
  async function loadObjs(type) {
    const sel = document.getElementById('rm-obj'); if (!sel) return; if (!type) { sel.innerHTML = '<option value="">— tanpa bukti —</option>'; sel.disabled = true; return; }
    sel.disabled = true; sel.innerHTML = '<option>Memuat…</option>';
    try { const r = await API.get(OBJ[type][1], { limit: 100 }); const rows = r.data || r;
      sel.innerHTML = `<option value="">— pilih objek —</option>${rows.map((o) => `<option value="${esc(o.id)}">${esc(optLabel(type, o))}</option>`).join('')}`; sel.disabled = false; } catch (er) { sel.innerHTML = '<option value="">(gagal memuat)</option>'; }
  }
  function itemForm(phaseId, id) {
    const cur = id ? S.items[id] : null; const ph = S.data.phases;
    A.openModal(`<div class="drawer-hd"><h2>${cur ? 'Ubah' : 'Tambah'} Butir Roadmap</h2><button class="x" onclick="App.closeAll()">×</button></div>
      <form class="drawer-bd" id="rm-if" onsubmit="App.rmItemSave(event,${window.jsArg(id || '')})"><div class="form-grid">
        <div class="field"><label>Fase <span class="req">*</span></label><select class="select" name="phaseId">${ph.map((f) => `<option value="${f.id}" ${f.id === (cur ? cur.phaseId : phaseId) ? 'selected' : ''}>${esc(f.nama)} (${fmt(f.mulai)} – ${fmt(f.selesai)})</option>`).join('')}</select></div>
        <div class="field"><label>Jenis <span class="req">*</span></label><select class="select" name="jenis"><option value="deliverable" ${cur && cur.jenis === 'deliverable' ? 'selected' : ''}>Deliverable</option><option value="milestone" ${cur && cur.jenis === 'milestone' ? 'selected' : ''}>Milestone</option></select></div>
        <div class="field full"><label>Judul <span class="req">*</span></label><input class="input" name="judul" required minlength="3" value="${esc(cur ? cur.judul : '')}"></div>
        <div class="field"><label>Target <span class="req">*</span></label><input class="input" type="date" name="target" required value="${cur ? cur.target : ''}"></div>
        <div class="field"><label>Status</label><select class="select" name="status">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${cur && cur.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        <div class="field full"><label>Catatan <span class="tiny muted">(wajib bila Terhambat)</span></label><textarea class="textarea" name="catatan">${esc(cur ? cur.catatan || '' : '')}</textarea></div>
        ${cur && cur.objectType ? `<div class="field full"><div class="tiny muted">🔗 Bukti: ${esc(OBJ[cur.objectType][0])} — ${esc(cur.objectLabel || '(di luar cakupan)')} (tautan tidak diubah di sini)</div></div>` : `<div class="field"><label>Bukti objek EAW (opsional)</label><select class="select" name="objectType" onchange="App.rmLoadObjs(this.value)"><option value="">— tanpa bukti —</option>${Object.entries(OBJ).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div>
        <div class="field"><label>Objek</label><select class="select" name="objectId" id="rm-obj" disabled><option value="">— tanpa bukti —</option></select></div>`}</div><div id="rm-err" class="mt"></div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('rm-if').requestSubmit()">Simpan</button></div>`);
  }
  async function itemSave(e, id) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const body = { phaseId: f.phaseId, jenis: f.jenis, judul: f.judul, target: f.target, status: f.status, catatan: f.catatan || undefined };
    if (!id && f.objectType && f.objectId) { body.objectType = f.objectType; body.objectId = f.objectId; }
    if (!id && f.objectType && !f.objectId) { const b = document.getElementById('rm-err'); if (b) b.innerHTML = '<div class="callout err"><span class="ic">✕</span><div>Pilih objek bukti atau kosongkan jenisnya.</div></div>'; return; }
    try { if (id) await API.patch(`/api/v1/eaw/roadmap/items/${id}`, body, `"${S.items[id].version}"`); else await API.post('/api/v1/eaw/roadmap/items', body); A.closeAll(); A.toast('Butir tersimpan', esc(f.judul), 'success'); mount(); }
    catch (er) { const b = document.getElementById('rm-err'); if (b) b.innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(er))}</div></div>`; else fail(er); }
  }

  function install(app, ctx) {
    A = app; API = ctx.API; fail = ctx.fail;
    A.PAGES['eaw/roadmap'] = () => ({ html: A.pageHd('Peta Rencana & Roadmap', 'Master IT Roadmap transformasi digital dan pelacak milestone (FR-04.1). Fase dan butir bertanggal nyata; tidak ada data contoh — diisi Holding EA Office.',
      `${A.can('eaw.roadmap.write') ? `<button class="btn" onclick="App.rmPhaseForm()">+ Fase</button><button class="btn pri" onclick="App.rmItemForm()">+ Butir</button>` : ''}`) + '<div id="rm-body"><div class="small muted">Memuat…</div></div>', mount });
    A.rmPhaseForm = phaseForm; A.rmPhaseSave = phaseSave; A.rmItemForm = (p, i) => { if (!S.data || !S.data.phases.length) return A.toast('Belum ada fase', 'Tambahkan fase dulu.', 'info'); itemForm(p || S.data.phases[0].id, i); };
    A.rmItemSave = itemSave; A.rmLoadObjs = loadObjs;
    A.rmStatus = async (id, status) => {
      const it = S.items[id]; let catatan;
      if (status === 'terhambat' && !(it.catatan && it.catatan.trim().length >= 5)) { catatan = prompt('Alasan terhambat (min. 5 karakter):'); if (!catatan || catatan.trim().length < 5) { mount(); return; } }
      try { await API.patch(`/api/v1/eaw/roadmap/items/${id}`, { status, ...(catatan ? { catatan } : {}) }, `"${it.version}"`); A.toast('Status diperbarui', `${esc(it.judul)} → ${ST[status][0]}`, 'success'); } catch (e) { fail(e); }
      mount();
    };
    A.rmItemDel = async (id) => { if (!confirm('Hapus butir ini dari roadmap?')) return; try { await API.del(`/api/v1/eaw/roadmap/items/${id}`); A.toast('Butir dihapus', '', 'success'); } catch (e) { fail(e); } mount(); };
    A.rmPhaseDel = async (id) => { if (!confirm('Hapus fase ini? (hanya bila tidak punya butir aktif)')) return; try { await API.del(`/api/v1/eaw/roadmap/phases/${id}`); A.toast('Fase dihapus', '', 'success'); } catch (e) { fail(e); } mount(); };
  }
  return { install };
})();
