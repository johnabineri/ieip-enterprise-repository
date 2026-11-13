/* =====================================================================
   SAORAJA EAP — CONSOLE (mode live): Skor IKA, AI Register, FinOps, EIO, Observability, Security Center. Terhubung ke /api/v1/console/*.
   Semua angka berasal dari data/metrik nyata; keterbatasan dinyatakan di UI (IKA hanya dari data EAW; metering hanya panggilan LLM EAP;
   metrik API in-memory; saklar `enforced` hanya untuk mesin yang sungguh memeriksanya). Dipasang oleh live.js (LiveConsole.install).
   ===================================================================== */
window.LiveConsole = (function () {
  let A, API, D, fail;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errBox = (e) => (e.status === 403 ? '<div class="callout warn"><span class="ic">🔒</span><div>Peran Anda tidak memiliki izin untuk melihat halaman ini (403 dari API).</div></div>' : `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`);
  const inErr = (id, e) => { const el = document.getElementById(id); const h = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`; if (el) el.innerHTML = h; else fail(e); };
  const idr = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const num = (n) => Number(n || 0).toLocaleString('id-ID');
  const when = (s) => (s ? new Date(s).toISOString().replace('T', ' ').slice(0, 19) : '—');
  const LV = ['var(--err)', 'var(--warn)', 'var(--d2)', 'var(--ok)', 'var(--violet)'];

  /* ================= 4.1 IKA ================= */
  async function ikaPage() {
    const box = document.getElementById('con-body'); if (!box) return;
    try {
      const [r, tr] = await Promise.all([API.get('/api/v1/console/ika'), API.get('/api/v1/console/ika/trend')]);
      const per = [1, 2, 3, 4, 5].map((l) => r.entities.filter((e) => e.objects > 0 && e.level === l).length);
      const chk = (ok, t) => `<span class="badge ${ok ? 'b-ok' : ''} nodot" title="${esc(t)}">${ok ? '✓' : '–'}</span>`;
      box.innerHTML = `<div class="grid g5 mb">${r.criteria.map((c, i) => `<div class="card kpi"><div class="row"><span class="avatar" style="background:${LV[i]};color:#fff">L${i + 1}</span><span class="tiny muted" style="flex:1">${esc(c.slice(4))}</span></div><div class="val">${per[i]}<small>entitas</small></div></div>`).join('')}</div>
        <div class="grid g-2-1">${A.card('Heatmap IKA terhitung — Entitas × Domain', r.entities.filter((e) => e.objects > 0).length ? `<div style="overflow-x:auto"><div class="heat" style="grid-template-columns:200px repeat(6,minmax(64px,1fr)) 70px;min-width:700px"><div></div>${r.entities[0].domains.map((d, i) => `<div class="h" style="text-align:center">D${i + 1}<div class="tiny faint">${esc(d.label.split(' ')[0])}</div></div>`).join('')}<div class="h" style="text-align:center">Level</div>
            ${r.entities.filter((e) => e.objects > 0).map((e) => `<div class="h" style="text-align:left">${esc(e.name)}<div class="tiny faint">${esc(e.code)}</div></div>${e.domains.map((d) => `<div class="c" style="background:${A.heatBg(d.level)}" title="${d.objects} objek, ${d.baseline} ≥ Ditetapkan">${d.level}</div>`).join('')}<div class="c" style="background:var(--surface-3);font-weight:800">L${e.level}</div>`).join('')}</div></div>`
          : '<div class="empty"><div class="big">∅</div>Belum ada objek arsitektur — IKA terhitung muncul setelah Architect mengisi EAW.</div>', { meta: 'level domain 1–3 dari status objek' })}
        ${A.card('Tren IKA Grup', tr.data.length ? A.Chart.line(tr.data.map((t) => t.avgLevel), { labels: tr.data.map((t) => String(t.date).slice(5, 10)), max: 5, target: 3, fmt: (v) => String(v).replace('.', ',') }) + `<p class="small muted mt-s">Rata-rata level entitas ber-objek per snapshot (${tr.data.length} titik).</p>` : '<div class="empty small">Belum ada snapshot. Ambil snapshot untuk memulai tren.</div>',
          { acts: A.lockBtn('console.dashboard.write', '⟳ Ambil snapshot', 'App.conSnap()', 'btn sm') })}</div>
        ${A.card('Peringkat & syarat Level 3–5', A.table([{ h: 'Entitas', v: (e) => `<b>${esc(e.name)}</b>` }, { h: 'Level terhitung', v: (e) => `<span class="badge nodot" style="background:${LV[e.level - 1]};color:#fff">L${e.level}</span>` },
          { h: 'Penilaian manual', v: (e) => (e.manualLevel ? A.ikaPill(e.manualLevel) : '<span class="muted small">—</span>') }, { h: 'Objek', num: 1, v: (e) => e.objects },
          { h: 'KRA', v: (e) => chk(e.checks.kra, e.gaps.kra.count ? `${e.gaps.kra.count} objek belum patuh KRA berlaku se-domain (syarat L3)` : 'semua objek patuh KRA berlaku se-domain (syarat L3)') },
          { h: 'Relasi', v: (e) => chk(e.checks.relations, 'relasi wajib lengkap') },
          { h: 'Lineage', v: (e) => chk(e.checks.lineage, e.gaps.lineage.dataEntities ? `${e.gaps.lineage.dataEntities - e.gaps.lineage.count}/${e.gaps.lineage.dataEntities} entitas data dengan lineage aktif (syarat L4)` : 'belum ada entitas data') }, { h: 'Git', v: (e) => chk(e.checks.git, 'semua aplikasi bertaut repo_git') }, { h: 'EIO', v: (e) => chk(e.checks.eio, '≥ 1 konektor EIO') },
          { h: 'Drift', v: (e) => chk(e.checks.drift, 'konektor diperiksa ≤ 7 hari, tanpa breaking change') }, { h: 'Reviu', v: (e) => chk(e.checks.review, 'objek Dipublikasi diperbarui ≤ 365 hari') }],
          [...r.entities].filter((e) => e.objects > 0).sort((a, b) => b.level - a.level)), { flush: true, meta: `rata-rata grup: ${r.groupAverage ?? '—'}` })}
        ${gapCard(r)}${kraCard(r)}
        <p class="tiny muted mt">${r.criteria.map(esc).join(' · ')}. Lineage = jejak Proses → Entitas Data ← Aplikasi aktif di graf relasi EAW (bukan lineage tingkat kolom/pipeline). Angka mengikuti cakupan peran Anda.</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }

  // celah yang menahan level (sampel ≤ 5 per pemeriksaan, dari API)
  function gapCard(r) {
    const rows = r.entities.filter((e) => e.objects > 0).flatMap((e) => [
      ...e.gaps.kra.sample.map((g) => ({ e, g, chk: 'KRA (L3)', n: e.gaps.kra.count })), ...e.gaps.lineage.sample.map((g) => ({ e, g, chk: 'Lineage (L4)', n: e.gaps.lineage.count }))]);
    if (!rows.length) return '';
    const TY = { process: 'Proses', data_entity: 'Entitas Data', service: 'Layanan', application: 'Aplikasi', infra_asset: 'Infrastruktur', control: 'Kontrol' };
    return A.card('Yang menahan level — kepatuhan KRA & lineage', A.table([{ h: 'Entitas', v: (x) => esc(x.e.code) }, { h: 'Syarat', v: (x) => esc(x.chk) },
      { h: 'Objek', v: (x) => `<span class="tiny muted">${esc(TY[x.g.type] || x.g.type)}</span> ${esc(x.g.label ?? '(di luar cakupan)')}` },
      { h: 'Alasan', v: (x) => esc((r.reasons && r.reasons[x.g.reason]) || x.g.reason) }, { h: 'Total celah', num: 1, v: (x) => x.n }], rows), { flush: true, meta: 'maks. 5 contoh per syarat per entitas' });
  }
  // cakupan per-KRA: berapa entitas/objek mengadopsi tiap referensi
  function kraCard(r) {
    if (!r.kra || !r.kra.length) return A.card('Cakupan per-KRA', '<div class="empty small">Belum ada KRA. Holding EA Office menyusun KRA di KRA Manager.</div>');
    return A.card('Cakupan per-KRA', A.table([{ h: 'KRA', v: (k) => `<b>${esc(k.kode)}</b><div class="tiny muted">${esc(k.nama)} · v${esc(k.versi)}</div>` }, { h: 'Domain', v: (k) => esc(k.domain) },
      { h: 'Status', v: (k) => `${esc(k.status)}${k.inForce ? '' : ' <span class="tiny muted">(belum berlaku)</span>'}` }, { h: 'Entitas pengadopsi', num: 1, v: (k) => k.entities },
      { h: 'Objek patuh / tertaut', num: 1, v: (k) => `${k.conformant} / ${k.objects}` },
      { h: 'Beda domain', num: 1, v: (k) => (k.otherDomain ? `<span class="badge b-warn nodot">${k.otherDomain}</span>` : '0') },
      { h: 'Direviu', num: 1, v: (k) => (k.pendingReview ? `<span class="badge b-warn nodot">${k.pendingReview}</span>` : '0') }], r.kra), { flush: true, meta: 'objek patuh = ≥ Ditetapkan, KRA berlaku se-domain, tidak Direviu' });
  }

  /* ================= 4.2 AI register ================= */
  const M = {};
  async function aiPage() {
    const box = document.getElementById('con-body'); if (!box) return;
    try {
      const [ms, ds] = await Promise.all([API.get('/api/v1/console/ai/models'), API.get('/api/v1/console/ai/datasets')]);
      ms.data.forEach((m) => { M[m.id] = m; }); const can = A.can('console.ai.admin');
      const risk = { low: 'b-ok', medium: 'b-warn', high: 'b-err' };
      box.innerHTML = `<div class="grid g4 mb">${A.kpi('Model aktif', ms.data.filter((m) => m.status === 'aktif').length)}${A.kpi('On-Prem GPU', ms.data.filter((m) => m.lokasi === 'on-prem').length, { tgt: 'data rahasia & PII' })}${A.kpi('Cloud', ms.data.filter((m) => m.lokasi === 'cloud').length, { tgt: 'maks. data internal (D-05)' })}${A.kpi('Dataset RAG', ds.data.length)}</div>` +
        A.card('Register Model LLM (console.ai_model)', ms.data.length ? A.table([{ h: 'Model', v: (m) => `<b>${esc(m.nama)}</b><div class="tiny mono muted">${esc(m.kode)}</div>` }, { h: 'Penyedia', v: (m) => esc(m.penyedia || '—') }, { h: 'Lokasi', v: (m) => A.pill(m.lokasi, m.lokasi === 'on-prem' ? 'b-ok' : 'b-info') },
          { h: 'Klasifikasi maks.', v: (m) => esc(m.klasifikasiMaks) }, { h: 'Risiko', v: (m) => A.pill(m.risiko, risk[m.risiko]) }, { h: 'Harga /1k token (in/out)', v: (m) => `<span class="mono tiny">${m.hargaInPer1k} / ${m.hargaOutPer1k}</span>` }, { h: 'Status', v: (m) => A.pill(m.status, m.status === 'aktif' ? 'b-ok' : '') },
          { h: '', v: (m) => (can ? `<button class="btn sm ghost" onclick="App.conModelDel(${window.jsArg(m.id)})">Hapus</button>` : '') }], ms.data) : '<div class="empty"><div class="big">∅</div>Belum ada model terdaftar.</div>', { flush: true, acts: A.lockBtn('console.ai.admin', '+ Model', 'App.conModelForm()', 'btn sm pri') }) +
        `<div class="mt">${A.card('Dataset RAG (console.rag_dataset)', ds.data.length ? A.table([{ h: 'Dataset', v: (d) => `<b>${esc(d.nama)}</b>` }, { h: 'Store', v: (d) => esc(d.store) }, { h: 'Klasifikasi', v: (d) => esc(d.klasifikasi) }, { h: 'PII', v: (d) => (d.pii ? '<b style="color:var(--err)">Ya</b>' : 'Tidak') },
          { h: 'Model pemroses', v: (d) => (d.modelKode ? `${esc(d.modelKode)} ${A.pill(d.modelLokasi, d.modelLokasi === 'on-prem' ? 'b-ok' : 'b-info')}` : '—') }, { h: '', v: (d) => (can ? `<button class="btn sm ghost" onclick="App.conDsDel(${window.jsArg(d.id)})">Hapus</button>` : '') }], ds.data) : '<div class="empty small">Belum ada dataset.</div>', { flush: true, acts: A.lockBtn('console.ai.admin', '+ Dataset', 'App.conDsForm()', 'btn sm') })}</div>
        <p class="tiny muted mt">Aturan D-05 ditegakkan DB: model cloud tidak boleh memproses data terbatas/rahasia; dataset PII/terbatas/rahasia wajib memakai model on-prem terdaftar.</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }
  const field = (l, n, extra = '', full) => `<div class="field ${full ? 'full' : ''}"><label>${l}</label><input class="input" name="${n}" ${extra}></div>`;
  const sel = (l, n, opts) => `<div class="field"><label>${l}</label><select class="select" name="${n}">${opts.map((o) => `<option>${o}</option>`).join('')}</select></div>`;
  const modal = (title, id, onsub, body, err, okLabel = 'Simpan') => A.openModal(`<div class="drawer-hd"><h2>${title}</h2><button class="x" onclick="App.closeAll()">×</button></div><form class="drawer-bd" id="${id}" onsubmit="${onsub}"><div class="form-grid">${body}</div><div id="${err}" class="mt"></div></form>
    <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById(${window.jsArg(id)}).requestSubmit()">${okLabel}</button></div>`);

  /* ================= 4.3 FinOps ================= */
  let fmonth = new Date().toISOString().slice(0, 7);
  async function finopsPage() {
    const box = document.getElementById('con-body'); if (!box) return;
    try {
      const f = await API.get('/api/v1/console/finops/summary', { month: fmonth }); const t = f.totals;
      const maxE = Math.max(1, ...f.byEntity.map((e) => e.costIdr));
      box.innerHTML = `<div class="row mb"><label class="small">Bulan</label><input class="input" type="month" value="${esc(fmonth)}" style="max-width:170px" onchange="App.conMonth(this.value)"></div>
        <div class="grid g4 mb">${A.kpi('Token (masukan + keluaran)', num(t.promptTokens + t.completionTokens), { tgt: `${num(t.promptTokens)} in · ${num(t.completionTokens)} out` })}${A.kpi('Biaya terukur', idr(t.costIdr), { tgt: 'dari harga model terdaftar' })}${A.kpi('Panggilan LLM', num(t.calls))}${A.kpi('Faktur direkonsiliasi', f.reconciliation.invoices.length, { tgt: `selisih ≤ ${f.reconciliation.targetPct}% (FIN-01)` })}</div>
        <div class="grid g2">${A.card('Showback per Entitas', f.byEntity.length ? f.byEntity.map((e) => A.Chart.hbar(e.name, e.costIdr, maxE, { fmt: (v) => idr(v) })).join('') : '<div class="empty small">Belum ada pemakaian pada bulan ini.</div>')}
          ${A.card('Per Model & Workspace', A.table([{ h: 'Model', v: (m) => `<span class="mono small">${esc(m.modelName)}</span>` }, { h: 'Token', num: 1, v: (m) => num(m.tokens) }, { h: 'Biaya', num: 1, v: (m) => idr(m.costIdr) }], f.byModel) + `<div class="chips mt-s">${f.byWorkspace.map((w) => `<span class="badge b-info nodot">${esc(w.workspace)} · ${num(w.tokens)} tok</span>`).join('') || ''}</div>`, { flush: true })}</div>
        ${A.card('Pemakaian Harian (token)', f.daily.length ? A.Chart.bars(f.daily.map((d) => ({ l: String(d.date).slice(8, 10), v: d.tokens })), { fmt: (v) => num(v) }) : '<div class="empty small">—</div>', { cls: 'mt' })}
        ${A.card('Rekonsiliasi Metering vs Faktur Penyedia', f.reconciliation.invoices.length ? A.table([{ h: 'Model', v: (i) => `<span class="mono small">${esc(i.modelName)}</span>` }, { h: 'Token faktur', num: 1, v: (i) => num(i.billedTokens) }, { h: 'Token terukur', num: 1, v: (i) => num(i.meteredTokens) },
          { h: 'Biaya faktur', num: 1, v: (i) => idr(i.billedIdr) }, { h: 'Biaya terukur', num: 1, v: (i) => idr(i.meteredIdr) }, { h: 'Selisih', num: 1, v: (i) => `<b>${String(i.diffPct).replace('.', ',')}%</b>` }, { h: 'Target ≤ 2%', v: (i) => A.pill(i.withinTarget ? 'lolos' : 'di luar target', i.withinTarget ? 'b-ok' : 'b-err') }], f.reconciliation.invoices)
          : '<div class="empty small">Belum ada faktur untuk bulan ini.</div>', { flush: true, cls: 'mt', acts: A.lockBtn('console.ai.admin', '+ Faktur', 'App.conInvForm()', 'btn sm') })}
        <p class="tiny muted mt">${esc(f.note)}</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }

  /* ================= 4.4 EIO ================= */
  const CN = {}; const EIO = { routes: {}, models: {}, flows: [] };
  const RST = { active: 'b-ok', draft: '', disabled: 'b-warn', retired: 'b-warn' };
  const XST = { ok: 'b-ok', rejected: 'b-warn', failed: 'b-err' };
  const LAYERS = [['L1', 'Normalisasi protokol', 'REST/JSON masuk & keluar (GET/DELETE → query). gRPC/GraphQL/webhook belum.'],
    ['L2', 'Propagasi identitas', 'JWT pemanggil tidak diteruskan; target menerima X-Corporate-Id (ref.users CMP).'],
    ['L3', 'Pemetaan kanonikal', 'Validasi ketat model kanonikal berversi + request/response map.'],
    ['L4', 'Aturan bisnis', 'Aturan deklaratif per rute (lokal, deterministik — bukan OPA).'],
    ['L5', 'Orkestrasi', 'Konektor REST (retry hanya bila idempoten) atau saga GSE (eksekutor ringan, bukan Temporal).'],
    ['L6', 'Publikasi peristiwa', 'Outbox → NATS: eap.console.eio_exchange_completed (tanpa data/identitas).']];
  async function eioPage() {
    const box = document.getElementById('con-body'); if (!box) return;
    try {
      const [cs, ms, rs, ex] = await Promise.all([API.get('/api/v1/console/eio/connectors').then((r) => r.data), API.get('/api/v1/console/eio/canonical-models').then((r) => r.data),
        API.get('/api/v1/console/eio/routes').then((r) => r.data), API.get('/api/v1/console/eio/exchanges', { limit: 30 })]);
      cs.forEach((c) => { CN[c.id] = c; }); ms.forEach((m) => { EIO.models[m.id] = m; }); rs.forEach((r) => { EIO.routes[r.id] = r; });
      const can = A.can('console.eio.write'); const canRun = A.can('console.eio.run'); const s24 = ex.stats24h;
      const st = { up: 'b-ok', degraded: 'b-warn', down: 'b-err', unknown: '' };
      box.innerHTML = `<div class="grid g4 mb">${A.kpi('Rute aktif', rs.filter((r) => r.status === 'active').length, { tgt: `${rs.length} rute · ${ms.filter((m) => m.status === 'active').length} model aktif` })}${A.kpi('Pertukaran live 24 jam', num(s24.total), { tgt: `${s24.ok} sukses` })}${A.kpi('p95 mediasi (24 jam)', s24.p95Ms == null ? '—' : `${s24.p95Ms}<small>ms</small>`, { tgt: 'NFR-06 ≤ 500 ms' })}${A.kpi('Ditolak / gagal 24 jam', `${s24.rejected} / ${s24.failed}`, { up: false })}</div>` +
        `<div class="grid g-1-2">${A.card('6-Layer Mediation (eksekutor ringan)', `<div class="stack">${LAYERS.map(([n, t, d], i) => `<div class="row" style="padding:8px 10px;border-radius:8px;flex-wrap:nowrap;align-items:flex-start;background:color-mix(in srgb, var(--d4) ${8 + (i + 1) * 4}%, var(--surface))"><b class="mono" style="min-width:24px">${n}</b><div><b class="small">${t}</b><div class="tiny muted">${esc(d)}</div></div></div>`).join('')}</div>`)}
        ${A.card('Rute Mediasi (console.eio_route)', rs.length ? A.table([{ h: 'Rute', v: (r) => `<b class="mono small">${esc(r.kode)}</b><div class="tiny muted">${esc(r.nama)}</div>` },
          { h: 'Model', v: (r) => `<span class="mono tiny">${esc(r.canonicalKode)} v${r.canonicalVersi}</span>` },
          { h: 'Target', v: (r) => (r.targetKind === 'connector' ? `<span class="tiny mono">${esc(r.connectorKode || '?')} · ${esc(r.method)} ${esc(r.path)}</span>${r.targetConfigured ? '' : `<div class="tiny" style="color:var(--warn)">env ${esc(r.targetEnv || '')} belum diatur</div>`}` : `<span class="tiny">saga <b>${esc(r.sagaFlowNama || '?')}</b></span>`) },
          { h: 'Aturan', num: 1, v: (r) => r.rules.length }, { h: 'Status', v: (r) => A.pill(r.status, RST[r.status]) },
          { h: '', v: (r) => `${can || canRun ? `<button class="btn sm" onclick="App.conEioMediate(${window.jsArg(r.id)})">▶ Uji</button>` : ''}${can ? (r.status === 'active' ? ` <button class="btn sm" onclick="App.conEioRouteSt(${window.jsArg(r.id)},'disable')">Nonaktifkan</button>` : ` <button class="btn sm" onclick="App.conEioRouteSt(${window.jsArg(r.id)},'activate')">Aktifkan</button> <button class="btn sm danger" onclick="App.conEioRouteDel(${window.jsArg(r.id)})">Hapus</button>`) : ''}` }], rs)
          : '<div class="empty"><div class="big">∅</div>Belum ada rute. Buat model kanonikal (aktifkan), lalu rute yang menargetkan konektor atau flow saga GSE.</div>', { flush: true, acts: A.lockBtn('console.eio.write', '+ Rute', 'App.conEioRouteForm()', 'btn sm pri') })}</div>` +
        A.card('Model Kanonikal (console.eio_canonical)', ms.length ? A.table([{ h: 'Model', v: (m) => `<b class="mono small">${esc(m.kode)}</b> <span class="tag">v${m.versi}</span><div class="tiny muted">${esc(m.nama)}</div>` },
          { h: 'Field', v: (m) => `<span class="tiny mono">${m.fields.map((f) => esc(f.name) + (f.required ? '*' : '') + ':' + esc(f.type)).join(', ')}</span>` },
          { h: 'Status', v: (m) => A.pill(m.status, RST[m.status]) + (m.inUse ? ' <span class="tag">dipakai rute aktif</span>' : '') },
          { h: '', v: (m) => (can ? (m.status === 'draft' ? `<button class="btn sm" onclick="App.conEioModelSt(${window.jsArg(m.id)},'activate')">Aktifkan</button> <button class="btn sm danger" onclick="App.conEioModelDel(${window.jsArg(m.id)})">Hapus</button>` : m.status === 'active' && !m.inUse ? `<button class="btn sm" onclick="App.conEioModelSt(${window.jsArg(m.id)},'retire')">Pensiunkan</button>` : '') : '') }], ms)
          : '<div class="empty small">Belum ada model kanonikal.</div>', { flush: true, cls: 'mt', meta: 'active/retired beku — ubah = versi baru', acts: A.lockBtn('console.eio.write', '+ Model', 'App.conEioModelForm()', 'btn sm pri') }) +
        A.card('Pertukaran Terbaru (console.eio_exchange — tanpa payload)', ex.data.length ? A.table([{ h: 'Waktu', v: (x) => `<span class="mono tiny">${esc(when(x.createdAt))}</span>` }, { h: 'Rute', v: (x) => `<span class="mono small">${esc(x.routeKode)}</span>` },
          { h: 'Mode', v: (x) => A.tag(x.mode) }, { h: 'Status', v: (x) => A.pill(x.status, XST[x.status]) }, { h: 'Lapisan', v: (x) => `<span class="mono">L${x.layer}</span>` }, { h: 'HTTP', num: 1, v: (x) => x.httpStatus ?? '—' },
          { h: 'Durasi', num: 1, v: (x) => x.durationMs + ' ms' }, { h: 'Keterangan', v: (x) => `<span class="small">${esc(x.error || (x.sagaRunId ? 'saga ' + x.sagaRunId.slice(0, 8) : '—'))}</span>` }], ex.data)
          : '<div class="empty small">Belum ada pertukaran.</div>', { flush: true, cls: 'mt', meta: 'pemegang console.eio.run tanpa dashboard hanya melihat miliknya' }) +
        A.card('Registri Konektor (console.eio_connector)', cs.length ? A.table([{ h: 'Konektor', v: (c) => `<b>${esc(c.nama)}</b><div class="tiny mono muted">${esc(c.kode)} · ${esc(c.sumber)} → ${esc(c.target)}</div>` }, { h: 'Status', v: (c) => A.pill(c.status, st[c.status]) },
          { h: 'Latensi', num: 1, v: (c) => (c.lastLatencyMs == null ? '—' : c.lastLatencyMs + ' ms') }, { h: 'Diperiksa', v: (c) => `<span class="small mono">${esc(when(c.lastCheckAt))}</span>` },
          { h: 'Kontrak', v: (c) => (c.baseline ? `${c.baseline} operasi ${c.breakingChanges.length ? A.pill(c.breakingChanges.length + ' breaking', 'b-err') : A.pill('stabil', 'b-ok')}` : '<span class="muted small">tanpa baseline</span>') },
          { h: '', v: (c) => `<button class="btn sm" onclick="App.conEioOpen(${window.jsArg(c.id)})">Detail</button>${can ? ` <button class="btn sm" onclick="App.conEioCheck(${window.jsArg(c.id)})">⟳ Periksa</button>` : ''}` }], cs)
          : '<div class="empty"><div class="big">∅</div>Belum ada konektor. Daftarkan konektor beserta URL health dan OpenAPI untuk memantau kesehatan & breaking change.</div>', { flush: true, cls: 'mt', acts: A.lockBtn('console.eio.write', '+ Konektor', 'App.conEioForm()', 'btn sm pri') }) +
        '<p class="tiny muted mt">Health check = HTTP GET sungguhan (timeout 5 dtk). Breaking change = operasi dihapus / parameter wajib baru dibanding baseline OpenAPI; rute ke operasi yang berubah ditolak (409). Mediasi berjalan SINKRON di dalam permintaan (tanpa antrean/DLQ); alamat target hanya dari env <code>EIO_SVC_&lt;KODE&gt;</code>. Belum ada layanan KEIS nyata yang terdaftar sebagai target; broker Kafka & Temporal belum dibangun.</p>';
    } catch (e) { box.innerHTML = errBox(e); }
  }
  function eioOpen(id) {
    const c = CN[id]; if (!c) return;
    A.openDrawer(`<div class="drawer-hd"><div><div class="row"><span class="tag">${esc(c.kode)}</span>${A.pill(c.status, { up: 'b-ok', degraded: 'b-warn', down: 'b-err', unknown: '' }[c.status])}</div><h2 class="mt-s">${esc(c.nama)}</h2><p class="small muted">${esc(c.sumber)} → ${esc(c.target)}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><dl class="dl"><dt>Health URL</dt><dd class="mono tiny">${esc(c.healthUrl || '—')}</dd><dt>Spec URL</dt><dd class="mono tiny">${esc(c.specUrl || '—')}</dd><dt>Latensi</dt><dd>${c.lastLatencyMs == null ? '—' : c.lastLatencyMs + ' ms'}</dd><dt>Diperiksa</dt><dd>${esc(when(c.lastCheckAt))}</dd><dt>Galat</dt><dd>${esc(c.lastError || '—')}</dd><dt>Hash kontrak</dt><dd class="mono tiny">${esc(c.specHash || '—')}</dd></dl>
        <h3 class="mt">Breaking change vs baseline (${c.breakingChanges.length})</h3>${c.breakingChanges.length ? `<div class="stack small mt-s">${c.breakingChanges.map((b) => `<div class="callout err"><span class="ic">✕</span><div>${esc(b)}</div></div>`).join('')}</div>` : '<p class="small muted mt-s">Tidak ada.</p>'}</div>
      <div class="drawer-ft">${A.can('console.eio.write') ? `<button class="btn danger" onclick="App.conEioDel(${window.jsArg(c.id)})">Hapus</button>${c.breakingChanges.length ? `<button class="btn" onclick="App.conEioBase(${window.jsArg(c.id)})">Terima sebagai baseline baru</button>` : ''}<button class="btn pri" onclick="App.conEioCheck(${window.jsArg(c.id)})">⟳ Periksa sekarang</button>` : ''}</div>`);
  }

  /* ================= 4.5 Observability ================= */
  async function obsPage() {
    const box = document.getElementById('con-body'); if (!box) return;
    try {
      const o = await API.get('/api/v1/console/obs'); const a = o.api;
      const up = a.uptimeS >= 3600 ? Math.floor(a.uptimeS / 3600) + ' j ' + Math.floor((a.uptimeS % 3600) / 60) + ' m' : Math.floor(a.uptimeS / 60) + ' m ' + (a.uptimeS % 60) + ' d';
      box.innerHTML = `<div class="grid g5 mb">${A.kpi('Uptime API', up, { tgt: 'sejak ' + when(a.startedAt) })}${A.kpi('Permintaan', num(a.requests))}${A.kpi('Latensi p50 / p95', `${a.p50Ms} / ${a.p95Ms}<small>ms</small>`, { tgt: `p99 ${a.p99Ms} ms` })}${A.kpi('Galat 5xx', `${String(a.errorRate).replace('.', ',')}<small>%</small>`, { tgt: `${a.errors5xx} dari ${a.requests}`, up: a.errors5xx === 0 })}${A.kpi('Ping DB', `${o.db.pingMs}<small>ms</small>`)}</div>
        <div class="grid g2">${A.card('SLO API EAP', A.table([{ h: 'SLO', v: (s) => esc(s.name) }, { h: 'Target', v: (s) => esc(s.target) }, { h: 'Aktual', v: (s) => (s.actual == null ? '—' : esc(s.actual)) }, { h: 'Status', v: (s) => (s.ok == null ? '—' : A.pill(s.ok ? 'terpenuhi' : 'terlampaui', s.ok ? 'b-ok' : 'b-err')) }], o.slo), { flush: true })}
          ${A.card('Replikasi Logis (pg_stat_subscription)', o.db.replication && o.db.replication.length ? A.table([{ h: 'Langganan', v: (r) => `<span class="mono small">${esc(r.name)}</span>` }, { h: 'Aktif', v: (r) => A.pill(r.active ? 'ya' : 'tidak', r.active ? 'b-ok' : 'b-err') }, { h: 'Lag', num: 1, v: (r) => (r.lagSeconds == null ? '—' : r.lagSeconds + ' dtk') }, { h: 'Pesan terakhir', v: (r) => `<span class="small mono">${esc(when(r.lastMessageAt))}</span>` }], o.db.replication) : '<div class="empty small">Tidak ada langganan terdeteksi / tanpa izin membaca.</div>', { flush: true })}</div>
        ${A.card('Rute Teratas', a.top.length ? A.table([{ h: 'Rute', v: (r) => `<span class="mono tiny">${esc(r.route)}</span>` }, { h: 'Permintaan', num: 1, v: (r) => num(r.count) }, { h: 'Galat 5xx', num: 1, v: (r) => r.errors }, { h: 'p95', num: 1, v: (r) => r.p95Ms + ' ms' }], a.top) : '<div class="empty small">—</div>', { flush: true, cls: 'mt' })}
        ${o.targets.length ? A.card('Dependensi (OBS_TARGETS)', A.table([{ h: 'Target', v: (t) => `<b>${esc(t.name)}</b><div class="tiny mono muted">${esc(t.url)}</div>` }, { h: 'Status', v: (t) => A.pill(t.status, t.status === 'up' ? 'b-ok' : 'b-err') }, { h: 'Respon', num: 1, v: (t) => (t.ms == null ? '—' : t.ms + ' ms') }], o.targets), { flush: true, cls: 'mt' }) : ''}
        <p class="tiny muted mt">${esc(o.note)} Atur <code>OBS_TARGETS="Keycloak=http://…/health/ready,CMP=http://…"</code> di server untuk memantau dependensi.</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }

  /* ================= 4.6 Security ================= */
  async function secPage() {
    const box = document.getElementById('con-body'); if (!box) return;
    try {
      const sw = (await API.get('/api/v1/console/security/switches')).data; const can = A.can('console.security.admin');
      const gl = await API.get('/api/v1/console/security/guard-log').catch(() => null);
      box.innerHTML = `<div class="grid g-1-2">${A.card('AI Kill-Switch', sw.map((s) => `<div class="killrow"><div style="flex:1"><b class="small">${esc(s.nama)}</b><div class="tiny muted">${esc(s.deskripsi || '')}</div><div class="tiny">${s.enforced ? A.pill('diperiksa mesin sebelum tiap panggilan', 'b-ok') : A.pill('belum terhubung ke mesin', '')} ${s.reason ? `<span class="muted">· ${esc(s.reason)}</span>` : ''}</div></div>
            <div style="text-align:right">${A.pill(s.enabled ? 'AKTIF' : 'DIMATIKAN', s.enabled ? 'b-ok' : 'b-err')}<div class="mt-s">${can ? `<button class="btn sm ${s.enabled ? 'danger' : 'pri'}" onclick="App.conSwitch(${window.jsArg(s.kode)},${!s.enabled})">${s.enabled ? '■ Matikan' : '▶ Aktifkan'}</button>` : ''}</div></div></div>`).join(''))}
        <div class="stack">${A.card('Kebijakan Guardrail REQ', `<div class="stack small"><div class="row">Engine<b class="right">aturan deterministik lokal</b></div><div class="row">Mode gagal<b class="right">fail-closed (503)</b></div><div class="row">PII masking<b class="right">email · NPWP · NIK · telepon</b></div><div class="row">Dapat dimatikan<b class="right">tidak (D-03)</b></div><p class="tiny muted">Bukan NeMo/OPA sungguhan; tanpa klaim akurasi.</p></div>`)}
        ${gl ? A.card(`Log Penolakan Guardrail (${gl.total}; hari ini ${gl.today}; rata-rata ${gl.avgMs} ms)`, gl.data.length ? A.table([{ h: 'Waktu', v: (g) => `<span class="mono tiny">${esc(when(g.created_at))}</span>` }, { h: 'Engine', v: (g) => A.tag(g.engine) }, { h: 'Kategori', v: (g) => A.pill(g.category, g.category === 'jailbreak' ? 'b-err' : 'b-warn') }, { h: 'Kutipan (termasking)', v: (g) => `<span class="small">${esc(g.excerpt)}</span>` }, { h: 'ms', num: 1, v: (g) => g.ms }], gl.data) : '<div class="empty small">Belum ada penolakan.</div>', { flush: true }) : ''}</div></div>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }

  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail;
    const page = (title, sub, acts, mount) => () => ({ html: A.pageHd(title, sub, acts) + '<div id="con-body"><div class="small muted">Memuat…</div></div>', mount });
    A.PAGES['console/ika'] = page('Dashboard Skor Kematangan IKA', 'IKA SAORAJA Level 1–5 dihitung otomatis dari data EAW (SAF §6.3, EAW-08): per entitas × domain, dengan syarat Level 4–5 dan tren dari snapshot.', '', ikaPage);
    A.PAGES['console/ai'] = page('AI Model & Risk Register', 'Inventaris model LLM dan dataset RAG. Model cloud tidak boleh memproses data terbatas/rahasia; dataset sensitif wajib model on-premises (GOV-02, D-05) — ditegakkan DB.', '', aiPage);
    A.PAGES['console/finops'] = page('FinOps Console', 'Metering token nyata → showback per entitas, serta rekonsiliasi terhadap faktur penyedia (selisih ≤ 2%, FIN-01).', '', finopsPage);
    A.PAGES['console/eio'] = page('EIO Control Center', 'Mediasi integrasi 6-layer ringan (EIO-01..03): model kanonikal, rute ke konektor atau saga GSE, jejak pertukaran; plus registri konektor dengan health check & deteksi breaking change kontrak (EIO-04).', '', eioPage);
    A.PAGES['console/obs'] = page('Observability & SLO', 'Metrik nyata proses API EAP, kesehatan DB dan replikasi logis (OPS-01 sebagian).', '<button class="btn" onclick="App.route()">↻ Segarkan</button>', obsPage);
    A.PAGES['console/security'] = page('Security Center', 'AI kill-switch (efek segera pada mesin yang memeriksanya) dan log penolakan guardrail (SEC-01).', '', secPage);

    A.conSnap = async () => { try { const r = await API.post('/api/v1/console/ika/snapshot', {}); A.toast('Snapshot IKA tersimpan', `${r.entities} entitas · rata-rata ${r.groupAverage}`, 'success'); A.route(); } catch (e) { fail(e); } };
    A.conMonth = (v) => { if (v) { fmonth = v; A.route(); } };
    // AI
    A.conModelForm = () => modal('Daftarkan Model AI', 'mdl-form', 'App.conModelSave(event)',
      field('Kode <span class="req">*</span>', 'kode', 'required placeholder="llama-3.3-70b-instruct"') + field('Nama <span class="req">*</span>', 'nama', 'required') + field('Penyedia', 'penyedia') + sel('Lokasi', 'lokasi', ['on-prem', 'cloud']) +
      sel('Klasifikasi data maks.', 'klasifikasiMaks', ['rahasia', 'terbatas', 'internal', 'publik']) + sel('Risiko', 'risiko', ['medium', 'low', 'high']) + sel('Status', 'status', ['evaluasi', 'aktif', 'nonaktif']) +
      field('Harga masukan / 1k token (IDR)', 'hargaInPer1k', 'type="number" min="0" step="0.0001" value="0"') + field('Harga keluaran / 1k token (IDR)', 'hargaOutPer1k', 'type="number" min="0" step="0.0001" value="0"') + field('Lisensi', 'lisensi') + field('Kegunaan', 'guna', '', true), 'mdl-err');
    A.conModelSave = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const b = { ...f, hargaInPer1k: Number(f.hargaInPer1k), hargaOutPer1k: Number(f.hargaOutPer1k) }; Object.keys(b).forEach((k) => b[k] === '' && delete b[k]);
      try { await API.post('/api/v1/console/ai/models', b); A.closeAll(); A.toast('Model terdaftar', esc(f.kode), 'success'); A.route(); } catch (x) { inErr('mdl-err', x); } };
    A.conModelDel = async (id) => { if (!confirm('Hapus model ini dari register?')) return; try { await API.del(`/api/v1/console/ai/models/${id}`); A.route(); } catch (e) { fail(e); } };
    A.conDsForm = async () => { const ms = (await API.get('/api/v1/console/ai/models')).data; modal('Daftarkan Dataset RAG', 'ds-form', 'App.conDsSave(event)', field('Nama <span class="req">*</span>', 'nama', 'required') + sel('Store', 'store', ['pgvector', 'qdrant', 'lainnya']) + sel('Klasifikasi', 'klasifikasi', ['internal', 'publik', 'terbatas', 'rahasia']) +
      `<div class="field"><label>Mengandung PII</label><label class="small row" style="gap:6px"><input type="checkbox" name="pii"> ya</label></div><div class="field full"><label>Model pemroses</label><select class="select" name="modelId"><option value="">— tidak ada —</option>${ms.map((m) => `<option value="${esc(m.id)}">${esc(m.kode)} (${esc(m.lokasi)})</option>`).join('')}</select></div>`, 'ds-err'); };
    A.conDsSave = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const b = { nama: f.nama, store: f.store, klasifikasi: f.klasifikasi, pii: !!f.pii }; if (f.modelId) b.modelId = f.modelId;
      try { await API.post('/api/v1/console/ai/datasets', b); A.closeAll(); A.toast('Dataset terdaftar', esc(f.nama), 'success'); A.route(); } catch (x) { inErr('ds-err', x); } };
    A.conDsDel = async (id) => { if (!confirm('Hapus dataset ini?')) return; try { await API.del(`/api/v1/console/ai/datasets/${id}`); A.route(); } catch (e) { fail(e); } };
    // FinOps
    A.conInvForm = () => modal('Faktur Penyedia', 'inv-form', 'App.conInvSave(event)', `<div class="field"><label>Periode</label><input class="input" type="month" name="periode" value="${esc(fmonth)}" required></div>` + field('Model (kode) <span class="req">*</span>', 'modelName', 'required') + field('Token tertagih', 'billedTokens', 'type="number" min="0" required') + field('Total tagihan (IDR)', 'billedIdr', 'type="number" min="0" step="0.01" required'), 'inv-err');
    A.conInvSave = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try { await API.post('/api/v1/console/finops/invoices', { periode: f.periode, modelName: f.modelName, billedTokens: Number(f.billedTokens), billedIdr: Number(f.billedIdr) }); A.closeAll(); fmonth = f.periode; A.toast('Faktur tercatat', '', 'success'); A.route(); } catch (x) { inErr('inv-err', x); } };
    // EIO
    A.conEioForm = () => modal('Daftarkan Konektor EIO', 'eio-form', 'App.conEioSave(event)', field('Kode <span class="req">*</span>', 'kode', 'required pattern="[A-Z0-9][A-Z0-9_.\\-]*" placeholder="SEDDI-PARTY"') + field('Nama <span class="req">*</span>', 'nama', 'required') + field('Sumber (produsen)', 'sumber', 'required') + field('Target (konsumen)', 'target', 'required') +
      field('Health URL', 'healthUrl', 'placeholder="https://…/health"', true) + field('OpenAPI URL (JSON)', 'specUrl', 'placeholder="https://…/openapi.json"', true) + `<div class="field full"><label>Entitas pemilik</label><select class="select" name="entityId"><option value="">—</option>${D.ENTITIES.map((e) => `<option value="${esc(e.uuid)}">${esc(e.nama)}</option>`).join('')}</select></div>`, 'eio-err');
    A.conEioSave = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); Object.keys(f).forEach((k) => f[k] === '' && delete f[k]);
      try { await API.post('/api/v1/console/eio/connectors', f); A.closeAll(); A.toast('Konektor terdaftar', esc(f.kode), 'success'); A.route(); } catch (x) { inErr('eio-err', x); } };
    A.conEioOpen = eioOpen;
    A.conEioCheck = async (id) => { try { const r = await API.post(`/api/v1/console/eio/connectors/${id}/check`, {}); A.toast(`Konektor ${esc(r.status)}`, r.breakingChanges.length ? r.breakingChanges.length + ' breaking change' : (r.lastError ? esc(r.lastError) : 'diperiksa'), r.status === 'up' && !r.breakingChanges.length ? 'success' : 'error'); A.route(); } catch (e) { fail(e); } };
    A.conEioBase = async (id) => { if (!confirm('Terima kontrak terkini sebagai baseline? Breaking change dianggap sudah ditinjau.')) return; try { await API.post(`/api/v1/console/eio/connectors/${id}/baseline`, {}); A.closeAll(); A.toast('Baseline diperbarui', '', 'success'); A.route(); } catch (e) { fail(e); } };
    A.conEioDel = async (id) => { if (!confirm('Hapus konektor ini?')) return; try { await API.del(`/api/v1/console/eio/connectors/${id}`); A.closeAll(); A.route(); } catch (e) { fail(e); } };
    const jsonArea = (l, n, ph, val = '') => `<div class="field full"><label>${l}</label><textarea class="input mono" name="${n}" rows="5" style="min-height:96px;height:auto;resize:vertical" placeholder="${esc(ph)}">${esc(val)}</textarea></div>`;
    const parseJson = (txt, label, def) => { if (!String(txt || '').trim()) return def; try { return JSON.parse(txt); } catch (e) { throw new Error(`${label}: JSON tidak sah (${e.message})`); } };
    A.conEioModelForm = () => modal('Model Kanonikal Baru', 'eio-m-form', 'App.conEioModelSave(event)', field('Kode <span class="req">*</span>', 'kode', 'required pattern="[A-Z0-9][A-Z0-9_.\\-]*" placeholder="SALES-ORDER"') + field('Versi', 'versi', 'type="number" min="1" max="999" value="1"') +
      field('Nama <span class="req">*</span>', 'nama', 'required', true) + jsonArea('Field (JSON) <span class="req">*</span>', 'fields', '[{"name":"order_id","type":"string","required":true,"maxLength":40},{"name":"amount","type":"number","required":true}]', '[{"name":"order_id","type":"string","required":true,"maxLength":40},{"name":"amount","type":"number","required":true}]') +
      '<p class="tiny muted full">Tipe: string|number|integer|boolean|object|array; opsional required, maxLength (string), enum. Model baru berstatus draft; setelah aktif BEKU.</p>', 'eio-m-err');
    A.conEioModelSave = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try { await API.post('/api/v1/console/eio/canonical-models', { kode: f.kode, versi: Number(f.versi || 1), nama: f.nama, fields: parseJson(f.fields, 'Field', []) }); A.closeAll(); A.toast('Model kanonikal dibuat', esc(f.kode), 'success'); A.route(); } catch (x) { inErr('eio-m-err', x); } };
    A.conEioModelSt = async (id, act) => { try { await API.post(`/api/v1/console/eio/canonical-models/${id}/${act === 'retire' ? 'retire' : 'activate'}`, {}); A.toast(act === 'retire' ? 'Model dipensiunkan' : 'Model diaktifkan', '', 'success'); A.route(); } catch (e) { fail(e); } };
    A.conEioModelDel = async (id) => { if (!confirm('Hapus model kanonikal draft ini?')) return; try { await API.del(`/api/v1/console/eio/canonical-models/${id}`); A.route(); } catch (e) { fail(e); } };
    A.conEioRouteForm = async () => {
      const flows = await API.get('/api/v1/gse/flows').then((r) => (r.data || []).filter((f) => f.kind === 'saga' && f.status === 'committed')).catch(() => []);
      const models = Object.values(EIO.models).filter((m) => m.status !== 'retired'); const cons = Object.values(CN);
      modal('Rute Mediasi Baru', 'eio-r-form', 'App.conEioRouteSave(event)', field('Kode <span class="req">*</span>', 'kode', 'required pattern="[A-Z0-9][A-Z0-9_.\\-]*" placeholder="SO-INVOICE"') + field('Nama <span class="req">*</span>', 'nama', 'required') +
        `<div class="field full"><label>Model kanonikal <span class="req">*</span></label><select class="select" name="canonicalId" required>${models.map((m) => `<option value="${esc(m.id)}">${esc(m.kode)} v${m.versi} (${esc(m.status)})</option>`).join('')}</select></div>` +
        `<div class="field"><label>Jenis target</label><select class="select" name="targetKind"><option value="connector">konektor (REST)</option><option value="saga">flow saga GSE</option></select></div>` +
        `<div class="field"><label>Konektor</label><select class="select" name="connectorId"><option value="">—</option>${cons.map((c) => `<option value="${esc(c.id)}">${esc(c.kode)}</option>`).join('')}</select></div>` +
        sel('Method', 'method', ['POST', 'GET', 'PUT', 'PATCH', 'DELETE']) + field('Path', 'path', 'placeholder="/orders/${order_id}/invoice"') +
        `<div class="field full"><label>Flow saga (committed)</label><select class="select" name="sagaFlowId"><option value="">—</option>${flows.map((f) => `<option value="${esc(f.id)}">${esc(f.nama)}</option>`).join('')}</select></div>` +
        jsonArea('request_map (JSON)', 'requestMap', '{"invoice.ref": "order_id", "source": {"const": "EIO"}} — kosong = data diteruskan apa adanya') + jsonArea('response_map (JSON, konektor)', 'responseMap', '{"invoiceNo": "data.number"}') +
        jsonArea('rules (JSON)', 'rules', '[{"field":"amount","op":"gt","value":0,"message":"amount harus positif"}]') +
        '<p class="tiny muted full">Aktivasi diperiksa DB: model aktif, field yang dirujuk ada, operasi ada di baseline kontrak konektor, flow saga committed. Rute aktif beku.</p>', 'eio-r-err');
    };
    A.conEioRouteSave = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try {
        const b = { kode: f.kode, nama: f.nama, canonicalId: f.canonicalId, targetKind: f.targetKind, requestMap: parseJson(f.requestMap, 'request_map', undefined), rules: parseJson(f.rules, 'rules', undefined) };
        if (f.targetKind === 'connector') Object.assign(b, { connectorId: f.connectorId || undefined, method: f.method, path: f.path || undefined, responseMap: parseJson(f.responseMap, 'response_map', undefined) });
        else b.sagaFlowId = f.sagaFlowId || undefined;
        Object.keys(b).forEach((k) => b[k] === undefined && delete b[k]);
        await API.post('/api/v1/console/eio/routes', b); A.closeAll(); A.toast('Rute dibuat (draft)', esc(f.kode), 'success'); A.route();
      } catch (x) { inErr('eio-r-err', x); } };
    A.conEioRouteSt = async (id, act) => { try { await API.post(`/api/v1/console/eio/routes/${id}/${act === 'disable' ? 'disable' : 'activate'}`, {}); A.toast(act === 'disable' ? 'Rute dinonaktifkan' : 'Rute diaktifkan', '', 'success'); A.route(); } catch (e) { fail(e); } };
    A.conEioRouteDel = async (id) => { if (!confirm('Hapus rute ini?')) return; try { await API.del(`/api/v1/console/eio/routes/${id}`); A.route(); } catch (e) { fail(e); } };
    A.conEioMediate = (id) => {
      const r = EIO.routes[id]; if (!r) return; const m = EIO.models[r.canonicalId];
      const sample = {}; (m ? m.fields : []).forEach((x) => { sample[x.name] = x.enum ? x.enum[0] : ({ string: '', number: 0, integer: 0, boolean: false, object: {}, array: [] })[x.type]; });
      const modes = A.can('console.eio.run') && r.status === 'active' ? ['simulate', 'live'] : ['simulate'];
      modal(`Uji Rute ${esc(r.kode)}`, 'eio-x-form', 'App.conEioMediateRun(event)', `<input type="hidden" name="kode" value="${esc(r.kode)}">` + sel('Mode', 'mode', modes) + field('Idempotency-Key (opsional)', 'idem', 'maxlength="100"') +
        jsonArea(`Data (model ${esc(r.canonicalKode)} v${r.canonicalVersi})`, 'data', '{}', JSON.stringify(sample, null, 2)) +
        '<p class="tiny muted full">simulate = L1–L4 + rencana L5 tanpa memanggil target/membuat run saga dan tanpa peristiwa. live = memanggil target sungguhan (butuh console.eio.run & rute aktif).</p><div id="eio-x-out" class="full"></div>', 'eio-x-err', '▶ Jalankan');
    };
    A.conEioMediateRun = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const out = document.getElementById('eio-x-out'); const er = document.getElementById('eio-x-err'); er.innerHTML = '';
      try {
        const r = await API.post(`/api/v1/console/eio/routes/${encodeURIComponent(f.kode)}/mediate`, { mode: f.mode, data: parseJson(f.data, 'Data', {}) }, f.idem ? { idem: true, key: f.idem } : {});
        out.innerHTML = `<div class="callout ok mt"><span class="ic">✓</span><div>${esc(r.mode)} sukses · ${r.layers.map((l) => 'L' + l.layer).join(' → ')}</div></div><pre class="mono tiny" style="white-space:pre-wrap;max-height:260px;overflow:auto">${esc(JSON.stringify(r.plan || r.data, null, 2))}</pre>`;
      } catch (x) {
        const b = (x && x.body) || {}; const extra = b.errors ? b.errors.join('; ') : b.breakingChanges ? b.breakingChanges.join('; ') : b.upstream ? `target HTTP ${b.upstream.status}` : '';
        out.innerHTML = `<div class="callout err mt"><span class="ic">✕</span><div>${b.layer ? `<b>Berhenti di L${b.layer}</b> · ` : ''}${esc(API.explain(x))}${extra ? `<div class="tiny mt-s">${esc(extra)}</div>` : ''}</div></div>`;
      }
    };
    // Security
    A.conSwitch = async (kode, enabled) => {
      let reason; if (!enabled) { reason = prompt('Alasan mematikan agen (min. 5 karakter):'); if (!reason) return; }
      try { await API.post(`/api/v1/console/security/switches/${encodeURIComponent(kode)}`, { enabled, reason }); A.toast(enabled ? 'Agen diaktifkan' : 'Agen dimatikan', esc(kode), enabled ? 'success' : 'error'); A.route(); } catch (e) { fail(e); }
    };
  }
  return { install };
})();
