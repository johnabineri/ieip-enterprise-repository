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
        ${A.card('Peringkat & syarat Level 4–5', A.table([{ h: 'Entitas', v: (e) => `<b>${esc(e.name)}</b>` }, { h: 'Level terhitung', v: (e) => `<span class="badge nodot" style="background:${LV[e.level - 1]};color:#fff">L${e.level}</span>` },
          { h: 'Penilaian manual', v: (e) => (e.manualLevel ? A.ikaPill(e.manualLevel) : '<span class="muted small">—</span>') }, { h: 'Objek', num: 1, v: (e) => e.objects },
          { h: 'Relasi', v: (e) => chk(e.checks.relations, 'relasi wajib lengkap') }, { h: 'Git', v: (e) => chk(e.checks.git, 'semua aplikasi bertaut repo_git') }, { h: 'EIO', v: (e) => chk(e.checks.eio, '≥ 1 konektor EIO') },
          { h: 'Drift', v: (e) => chk(e.checks.drift, 'konektor diperiksa ≤ 7 hari, tanpa breaking change') }, { h: 'Reviu', v: (e) => chk(e.checks.review, 'objek Dipublikasi diperbarui ≤ 365 hari') }],
          [...r.entities].filter((e) => e.objects > 0).sort((a, b) => b.level - a.level)), { flush: true, meta: `rata-rata grup: ${r.groupAverage ?? '—'}` })}
        <p class="tiny muted mt">${r.criteria.map(esc).join(' · ')}. Lineage aktif dan cakupan “seluruh referensi KRA” belum dimodelkan sehingga tidak ikut dihitung.</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
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
          { h: '', v: (m) => (can ? `<button class="btn sm ghost" onclick="App.conModelDel('${m.id}')">Hapus</button>` : '') }], ms.data) : '<div class="empty"><div class="big">∅</div>Belum ada model terdaftar.</div>', { flush: true, acts: A.lockBtn('console.ai.admin', '+ Model', 'App.conModelForm()', 'btn sm pri') }) +
        `<div class="mt">${A.card('Dataset RAG (console.rag_dataset)', ds.data.length ? A.table([{ h: 'Dataset', v: (d) => `<b>${esc(d.nama)}</b>` }, { h: 'Store', v: (d) => esc(d.store) }, { h: 'Klasifikasi', v: (d) => esc(d.klasifikasi) }, { h: 'PII', v: (d) => (d.pii ? '<b style="color:var(--err)">Ya</b>' : 'Tidak') },
          { h: 'Model pemroses', v: (d) => (d.modelKode ? `${esc(d.modelKode)} ${A.pill(d.modelLokasi, d.modelLokasi === 'on-prem' ? 'b-ok' : 'b-info')}` : '—') }, { h: '', v: (d) => (can ? `<button class="btn sm ghost" onclick="App.conDsDel('${d.id}')">Hapus</button>` : '') }], ds.data) : '<div class="empty small">Belum ada dataset.</div>', { flush: true, acts: A.lockBtn('console.ai.admin', '+ Dataset', 'App.conDsForm()', 'btn sm') })}</div>
        <p class="tiny muted mt">Aturan D-05 ditegakkan DB: model cloud tidak boleh memproses data terbatas/rahasia; dataset PII/terbatas/rahasia wajib memakai model on-prem terdaftar.</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }
  const field = (l, n, extra = '', full) => `<div class="field ${full ? 'full' : ''}"><label>${l}</label><input class="input" name="${n}" ${extra}></div>`;
  const sel = (l, n, opts) => `<div class="field"><label>${l}</label><select class="select" name="${n}">${opts.map((o) => `<option>${o}</option>`).join('')}</select></div>`;
  const modal = (title, id, onsub, body, err) => A.openModal(`<div class="drawer-hd"><h2>${title}</h2><button class="x" onclick="App.closeAll()">×</button></div><form class="drawer-bd" id="${id}" onsubmit="${onsub}"><div class="form-grid">${body}</div><div id="${err}" class="mt"></div></form>
    <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('${id}').requestSubmit()">Simpan</button></div>`);

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
  const CN = {};
  async function eioPage() {
    const box = document.getElementById('con-body'); if (!box) return;
    try {
      const cs = (await API.get('/api/v1/console/eio/connectors')).data; cs.forEach((c) => { CN[c.id] = c; }); const can = A.can('console.eio.write');
      const st = { up: 'b-ok', degraded: 'b-warn', down: 'b-err', unknown: '' };
      box.innerHTML = `<div class="grid g4 mb">${A.kpi('Konektor', cs.length)}${A.kpi('Sehat (up)', cs.filter((c) => c.status === 'up').length)}${A.kpi('Down / degraded', cs.filter((c) => ['down', 'degraded'].includes(c.status)).length, { up: false })}${A.kpi('Breaking change terbuka', cs.filter((c) => c.breakingChanges.length).length, { tgt: 'EIO-04', up: false })}</div>` +
        A.card('Registri Konektor (console.eio_connector)', cs.length ? A.table([{ h: 'Konektor', v: (c) => `<b>${esc(c.nama)}</b><div class="tiny mono muted">${esc(c.kode)} · ${esc(c.sumber)} → ${esc(c.target)}</div>` }, { h: 'Status', v: (c) => A.pill(c.status, st[c.status]) },
          { h: 'Latensi', num: 1, v: (c) => (c.lastLatencyMs == null ? '—' : c.lastLatencyMs + ' ms') }, { h: 'Diperiksa', v: (c) => `<span class="small mono">${esc(when(c.lastCheckAt))}</span>` },
          { h: 'Kontrak', v: (c) => (c.baseline ? `${c.baseline} operasi ${c.breakingChanges.length ? A.pill(c.breakingChanges.length + ' breaking', 'b-err') : A.pill('stabil', 'b-ok')}` : '<span class="muted small">tanpa baseline</span>') },
          { h: '', v: (c) => `<button class="btn sm" onclick="App.conEioOpen('${c.id}')">Detail</button>${can ? ` <button class="btn sm" onclick="App.conEioCheck('${c.id}')">⟳ Periksa</button>` : ''}` }], cs)
          : '<div class="empty"><div class="big">∅</div>Belum ada konektor. Daftarkan konektor beserta URL health dan OpenAPI untuk memantau kesehatan & breaking change.</div>', { flush: true, acts: A.lockBtn('console.eio.write', '+ Konektor', 'App.conEioForm()', 'btn sm pri') }) +
        '<p class="tiny muted mt">Health check = HTTP GET sungguhan (timeout 5 dtk). Breaking change = operasi dihapus / parameter wajib baru dibanding baseline OpenAPI. Mediasi 6-layer, Saga Temporal, dan event backbone (EIO-01..03) belum dibangun.</p>';
    } catch (e) { box.innerHTML = errBox(e); }
  }
  function eioOpen(id) {
    const c = CN[id]; if (!c) return;
    A.openDrawer(`<div class="drawer-hd"><div><div class="row"><span class="tag">${esc(c.kode)}</span>${A.pill(c.status, { up: 'b-ok', degraded: 'b-warn', down: 'b-err', unknown: '' }[c.status])}</div><h2 class="mt-s">${esc(c.nama)}</h2><p class="small muted">${esc(c.sumber)} → ${esc(c.target)}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><dl class="dl"><dt>Health URL</dt><dd class="mono tiny">${esc(c.healthUrl || '—')}</dd><dt>Spec URL</dt><dd class="mono tiny">${esc(c.specUrl || '—')}</dd><dt>Latensi</dt><dd>${c.lastLatencyMs == null ? '—' : c.lastLatencyMs + ' ms'}</dd><dt>Diperiksa</dt><dd>${esc(when(c.lastCheckAt))}</dd><dt>Galat</dt><dd>${esc(c.lastError || '—')}</dd><dt>Hash kontrak</dt><dd class="mono tiny">${esc(c.specHash || '—')}</dd></dl>
        <h3 class="mt">Breaking change vs baseline (${c.breakingChanges.length})</h3>${c.breakingChanges.length ? `<div class="stack small mt-s">${c.breakingChanges.map((b) => `<div class="callout err"><span class="ic">✕</span><div>${esc(b)}</div></div>`).join('')}</div>` : '<p class="small muted mt-s">Tidak ada.</p>'}</div>
      <div class="drawer-ft">${A.can('console.eio.write') ? `<button class="btn danger" onclick="App.conEioDel('${c.id}')">Hapus</button>${c.breakingChanges.length ? `<button class="btn" onclick="App.conEioBase('${c.id}')">Terima sebagai baseline baru</button>` : ''}<button class="btn pri" onclick="App.conEioCheck('${c.id}')">⟳ Periksa sekarang</button>` : ''}</div>`);
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
            <div style="text-align:right">${A.pill(s.enabled ? 'AKTIF' : 'DIMATIKAN', s.enabled ? 'b-ok' : 'b-err')}<div class="mt-s">${can ? `<button class="btn sm ${s.enabled ? 'danger' : 'pri'}" onclick="App.conSwitch('${esc(s.kode)}',${!s.enabled})">${s.enabled ? '■ Matikan' : '▶ Aktifkan'}</button>` : ''}</div></div></div>`).join(''))}
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
    A.PAGES['console/eio'] = page('EIO Control Center', 'Registri konektor integrasi: health check HTTP nyata dan deteksi breaking change kontrak OpenAPI (EIO-04).', '', eioPage);
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
    // Security
    A.conSwitch = async (kode, enabled) => {
      let reason; if (!enabled) { reason = prompt('Alasan mematikan agen (min. 5 karakter):'); if (!reason) return; }
      try { await API.post(`/api/v1/console/security/switches/${encodeURIComponent(kode)}`, { enabled, reason }); A.toast(enabled ? 'Agen diaktifkan' : 'Agen dimatikan', esc(kode), enabled ? 'success' : 'error'); A.route(); } catch (e) { fail(e); }
    };
  }
  return { install };
})();
