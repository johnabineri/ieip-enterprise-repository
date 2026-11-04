/* SAORAJA EAP — Workspace EAW (Enterprise Architecture Workbench) */
(function () {
  const A = window.App, D = A.D, P = A.PAGES, T = A.TABSTATE;
  const { esc, badge, pill, tag, card, kpi, table, pageHd, tabs, Chart } = A;

  /* ================= 1.1 Dashboard ================= */
  P['eaw/dashboard'] = () => {
    const apps = D.APPS.length, pub = D.APPS.filter((a) => ['Ditetapkan', 'Dipublikasi'].includes(a.status)).length;
    const counts = D.STATUS.map((s) => ({ l: s, v: D.APPS.filter((a) => a.status === s).length + D.DATA_ENTITIES.filter((d) => d.status === s).length + D.SERVICES.filter((d) => d.status === s).length }));
    const colors = ['var(--faint)', 'var(--info)', 'var(--ok)', 'var(--violet)', 'var(--warn)'];
    const onb = [['Struktur Entitas', 'eaw.entity_org', 'done'], ['KRA 6 Domain', 'eaw.reference', 'done'], ['Platform & Workspace', 'eaw.application', 'done'], ['Kerangka Kerja ×11', 'eaw.framework', 'cur'], ['Isi 6 Domain', '29 entitas CMP', 'cur'], ['Relasi Antar-Domain', 'eaw.relation', ''], ['Validasi → Publikasi', 'AF-05', '']];
    const sbu = D.ENTITIES.filter((e) => e.tingkat !== 'unit');
    return {
      html: pageHd('Dashboard Arsitektur', 'Executive scorecard Indeks Kematangan Arsitektur (IKA), topologi makro ekosistem, dan monitor redundansi — dihitung otomatis dari data EAW (EAW-08, FR-01.1–01.4).',
        `<button class="btn" onclick="App.copilot('Aplikasi apa saja yang terdampak jika server On-Prem Makassar mengalami downtime?')">✦ Tanya MIND</button><a class="btn pri" href="#/eaw/publisher">⇩ Terbitkan Dokumen</a>`) +
        card('Prinsip Bootstrap — EAP dimulai kosong, diisi Architect (SAF §8.2)', `<div class="onb">${onb.map((s, i) => `<div class="s ${s[2]}"><b>LANGKAH ${i + 1}</b>${s[0]}<div class="tiny faint mono">${s[1]}</div></div>`).join('')}</div>`, { meta: 'Progres onboarding 64%' }) +
        `<div class="grid g5 mt">
          ${kpi('IKA Grup (rata-rata)', (window.API && API.live()) ? ((D.ENTITIES.filter((e) => e.ika > 0).reduce((s, e) => s + e.ika, 0) / (D.ENTITIES.filter((e) => e.ika > 0).length || 1)).toFixed(1).replace('.', ',') + '<small>/ 5</small>') : '2,6<small>/ 5</small>', (window.API && API.live()) ? { tgt: 'dari eaw.entity_org_metadata (entitas yang sudah dinilai)' } : { delta: '▲ 0,2 vs Okt', tgt: 'Target F3: L3 umum · L2 khusus' })}
          ${kpi('Aplikasi terdaftar', `${apps}<small>entri</small>`, { delta: `${pub} berstatus baseline`, tgt: 'K-01: 100% akhir Fase 2' })}
          ${kpi('Tiket ARB aktif', D.ARB.filter((a) => ['SUBMITTED', 'IN_REVIEW', 'REVISION'].includes(a.status)).length, ((window.API && API.live()) ? { tgt: 'FR-01.4' } : { delta: '2 menunggu putusan Chair', up: false, tgt: 'FR-01.4' }))}
          ${kpi('Alert redundansi', (window.API && API.live()) ? '—' : '3', (window.API && API.live()) ? { tgt: 'butuh MIND Pre-ARB (belum tersedia)' } : { delta: '1 shadow DB terdeteksi', up: false, tgt: 'ambang kemiripan ≥ 75%' })}
          ${kpi('Kolom PII di kalla_eap', '0', { delta: 'pii-guard lolos', tgt: 'NFR-09 · D-14' })}
        </div>
        <div class="grid g-2-1 mt">
          ${card('Skor IKA per Entitas', sbu.map((e) => Chart.hbar(e.nama, e.ika, 5, { color: A.ikaColor(e.ika), target: e.target, fmt: (v) => v.toFixed(1) })).join('') + `<div class="legend mt-s"><span><i class="dom-dot" style="background:var(--text);opacity:.55;width:2px"></i>garis = target IKA</span><span><i class="dom-dot" style="background:var(--ok)"></i>≥ 3,5</span><span><i class="dom-dot" style="background:var(--d2)"></i>2,5–3,4</span><span><i class="dom-dot" style="background:var(--warn)"></i>1,8–2,4</span><span><i class="dom-dot" style="background:var(--err)"></i>&lt; 1,8</span></div>`, { meta: 'per entitas · AF-03', acts: '<a class="btn sm" href="#/console/ika">Detail →</a>' })}
          ${card('Status Objek (AF-05)', `<div class="row" style="justify-content:center">${Chart.donut(counts.map((c, i) => ({ ...c, c: colors[i] })), { label: counts.reduce((a, c) => a + c.v, 0), sub: 'objek' })}</div><div class="stack mt-s">${counts.map((c, i) => `<div class="row small"><i class="dom-dot" style="background:${colors[i]}"></i>${c.l}<b class="right">${c.v}</b></div>`).join('')}</div>`)}
        </div>
        <div class="grid g-2-1 mt">
          ${card('Peta Topologi Makro — Dual-Core & Lini PANRITA', topology(), { meta: 'klik node untuk membuka katalog', flush: true })}
          ${card('Redundancy & Drift Monitor', `<div class="list">
            ${[['⛔', 'Vendor Portal Lokal BK', '91% mirip VANTAGE · ARB-2026-0027', 'b-err', 'Duplikasi'], ['⚠', 'Data Lake Konstruksi BSB', '77% mirip PANRITA-OLP · ARB-2026-0028', 'b-warn', 'Duplikasi'], ['◉', 'DB bayangan crm_local_hk', 'Tidak terdaftar di EAW · scan Git', 'b-err', 'Shadow IT'], ['◉', 'Endpoint /v1/legacy/vendors', 'Tanpa kontrak OpenAPI · APISIX', 'b-warn', 'Drift'], ['↻', 'KRA-DAT-001 v2.0', '14 objek perlu direviu', 'b-info', 'KRA']].map((r) => `<div class="li"><span class="ic">${r[0]}</span><div class="bd"><div class="t">${r[1]}</div><div class="d">${r[2]}</div></div>${pill(r[4], r[3])}</div>`).join('')}
          </div>`, { flush: true, meta: 'MIND · scan 03:00 WITA' })}
        </div>
        <div class="grid g2 mt">
          ${card('Pelacak Tiket ARB Clearance', table([
            { h: 'Tiket', v: (r) => `<span class="mono">${r.no}</span>` }, { h: 'Inisiatif', v: (r) => esc(r.name) }, { h: 'Skor MIND', num: 1, v: (r) => `<b style="color:${r.score >= 75 ? 'var(--err)' : 'var(--text)'}">${r.score}%</b>` }, { h: 'Status', v: (r) => arbBadge(r.status) },
          ], D.ARB.slice(0, 5), { click: (r) => `App.arbDetail('${r.no}')` }), { flush: true, acts: '<a class="btn sm" href="#/eaw/arb">Meja Sidang →</a>' })}
          ${card('KPI Ekosistem (PRD §15)', D.KPIS.map((k) => Chart.hbar(`${k[0]} · ${k[1]}`, k[3], 100, { color: k[3] >= 100 ? 'var(--ok)' : k[3] >= 80 ? 'var(--d2)' : 'var(--warn)', fmt: () => k[2] })).join(''), { meta: 'capaian vs target' })}
        </div>`,
    };
  };
  function topology() {
    const sat = [['PANRITA-OLP', 'FLUX', 90, 70], ['PANRITA-SSP', 'ESS · AGILE', 90, 190], ['PANRITA-B-LINK', 'FORGE · VANTAGE', 90, 310], ['PANRITA-BASE', 'PULSE · AEGIS · OPTIMA …', 610, 70], ['PANRITA-SVP', 'VANGUARD · CORE', 610, 190], ['STRIDE-Hk', 'ASI · ASM · FIA', 610, 310], ['STRIDE-Bsu', 'AV · AEPS', 350, 345]];
    const nd = (x, y, t, s, fill, stroke, w = 170) => `<g style="cursor:pointer" onclick="location.hash='#/eaw/aplikasi'"><rect x="${x - w / 2}" y="${y - 22}" width="${w}" height="44" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><text x="${x}" y="${y - 3}" text-anchor="middle" style="font-weight:700;fill:var(--text);font-size:12px">${t}</text><text x="${x}" y="${y + 13}" text-anchor="middle" style="font-size:10px">${s}</text></g>`;
    return `<svg class="chart" viewBox="0 0 700 380" role="img" aria-label="Topologi ekosistem">
      <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)"/></marker></defs>
      <rect x="230" y="40" width="240" height="250" rx="16" fill="var(--accent-soft)" opacity=".55"/>
      <text x="350" y="62" text-anchor="middle" style="font-weight:800;fill:var(--accent-text);letter-spacing:.1em;font-size:10.5px">DUAL-CORE FOUNDATION</text>
      ${sat.map(([, , x, y]) => `<path d="M${x < 350 ? x + 85 : x > 350 ? x - 85 : x} ${y < 340 ? y : y - 22} L${x < 350 ? 268 : x > 350 ? 432 : 350} ${y < 340 ? Math.min(Math.max(y, 110), 250) : 262}" stroke="var(--border-strong)" stroke-dasharray="4 3" fill="none" marker-end="url(#ar)"/>`).join('')}
      ${nd(350, 110, 'SAORAJA · EAP', 'Arsitektur · ARB · GSE', 'var(--surface)', 'var(--accent)', 200)}
      ${nd(350, 230, 'SEDDI · CMP', 'Golden Record · CDC pub_cmp_ref', 'var(--surface)', 'var(--d2)', 200)}
      <path d="M340 132 L340 208" stroke="var(--d2)" stroke-width="2" marker-end="url(#ar)"/><path d="M360 208 L360 132" stroke="var(--accent)" stroke-width="2" marker-end="url(#ar)"/>
      <text x="368" y="160" style="font-size:9.5px">ref.applications</text><text x="252" y="185" style="font-size:9.5px">ref.* (31 tabel)</text>
      ${sat.map(([t, s, x, y]) => nd(x, y, t, s, 'var(--surface)', 'var(--border-strong)')).join('')}
    </svg>`;
  }

  /* ================= 1.2 Proses Bisnis ================= */
  const flatProc = []; (function walk(l) { l.forEach((p) => { flatProc.push(p); walk(p.kids || []); }); })(D.PROCESSES);
  const treeHtml = (list, sel) => `<ul>${list.map((p) => `<li><div class="node ${p.id === sel ? 'on' : ''}" onclick="App.selProc('${p.id}')"><span class="lvl">L${p.level}</span><span style="flex:1">${esc(p.nama)}</span>${badge(p.status)}</div>${p.kids && p.kids.length ? treeHtml(p.kids, sel) : ''}</li>`).join('')}</ul>`;
  A.selProc = (id) => { T.proc = id; A.route(); };
  P['eaw/proses'] = () => {
    const sel = T.proc || 'L1-HK1'; const p = flatProc.find((x) => x.id === sel);
    return {
      html: pageHd('Domain 1 · Proses Bisnis', 'Peta rantai nilai Holding (L0), Core Industry (L1), dan rincian SOP (L2–L3). Setiap proses wajib menghasilkan Layanan, memakai Entitas Data, dan dilayani Aplikasi (SAF §5).',
        A.lockBtn('eaw.model.write', '+ Tambah Proses', "App.procForm()", 'btn pri')) +
        `<div class="grid g-1-2">
          ${card('Hierarki Proses L0–L3', `<div class="tree">${treeHtml(D.PROCESSES, sel)}</div>`, { meta: `${flatProc.length} proses` })}
          <div class="stack">
            ${card(esc(p.nama), `${A.lifecycle(p.status)}<dl class="dl mt"><dt>ID</dt><dd class="mono">${p.id}</dd><dt>Level</dt><dd>L${p.level} ${['Value Chain Holding', 'Core Industry Value Chain', 'Proses', 'Sub-proses / SOP'][p.level]}</dd><dt>Pemilik (jabatan)</dt><dd>${esc(p.owner)}</dd><dt>Entitas</dt><dd>${esc(A.ent(p.entity).nama)}</dd><dt>Input</dt><dd>${esc(p.input || '—')}</dd><dt>Output</dt><dd>${esc(p.output || '—')}</dd><dt>Tautan KRA</dt><dd>${p.level <= 1 ? tag('KRA-PRS-001') : p.status === 'Draf' ? pill('Belum tertaut', 'b-err') : tag('KRA-PRS-002')}</dd></dl>`,
              { acts: `<button class="btn sm" onclick="App.toast('Transisi diajukan','${p.id}: ${p.status} → berikutnya · tercatat di eaw.workflow','success')">Ajukan transisi</button>` })}
            ${card('Relasi Wajib (ArchiMate)', `<div class="grid g3">${[['Menghasilkan Layanan', p.level >= 1 ? 2 : 0, 'var(--d3)'], ['Memakai Entitas Data', p.level >= 1 ? 3 : 1, 'var(--d2)'], ['Dilayani Aplikasi', p.status === 'Draf' ? 0 : 1, 'var(--d4)']].map(([l, n, c]) => `<div class="card kpi" style="box-shadow:none;border-left:4px solid ${c}"><div class="lbl">${l}</div><div class="val">${n}</div>${n ? '<div class="delta up">✓ terpenuhi</div>' : '<div class="delta dn">✕ relasi kurang</div>'}</div>`).join('')}</div>`)}
            ${card('Matriks RACI Proses', table([{ h: 'Aktivitas', v: (r) => r[0] }, { h: 'BPO', v: (r) => r[1] }, { h: 'Business Arch.', v: (r) => r[2] }, { h: 'SBU Arch.', v: (r) => r[3] }, { h: 'Auditor', v: (r) => r[4] }],
              [['Penyusunan model proses', 'R', 'A', 'C', 'I'], ['Validasi kelengkapan & KRA', 'C', 'R', 'I', 'I'], ['Penetapan baseline', 'I', 'C', 'I', 'I']]), { flush: true })}
          </div>
        </div>`,
    };
  };
  A.procForm = () => A.openModal(`<div class="drawer-hd"><h2>Tambah Proses Bisnis</h2><button class="x" onclick="App.closeAll()">×</button></div><div class="drawer-bd"><div class="form-grid">
    <div class="field full"><label>Nama proses <span class="req">*</span></label><input class="input" placeholder="mis. Pengujian Laboratorium Mutu Aspal"></div>
    <div class="field"><label>Level <span class="req">*</span></label><select class="select"><option>L1 — Rantai nilai</option><option>L2 — Proses</option><option>L3 — Sub-proses</option></select></div>
    <div class="field"><label>Parent</label><select class="select">${flatProc.map((p) => `<option>${p.id} · ${esc(p.nama)}</option>`).join('')}</select></div>
    <div class="field"><label>Pemilik (jabatan) <span class="req">*</span></label><input class="input" placeholder="Jabatan, bukan nama orang (D-14)"></div>
    <div class="field"><label>Referensi KRA <span class="req">*</span></label><select class="select">${D.KRA.filter((k) => k.domain === 'proses_bisnis').map((k) => `<option>${k.kode} · ${esc(k.nama)}</option>`).join('')}</select></div>
    <div class="field"><label>Input</label><input class="input"></div><div class="field"><label>Output</label><input class="input"></div></div>
    <div class="callout info mt"><span class="ic">ℹ</span>Objek baru tersimpan berstatus <b>Draf</b> (AF-05). Hak edit terbatas pada entitas Anda dan turunannya (AF-03).</div></div>
    <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="App.closeAll();App.toast('Proses tersimpan (Draf)','eaw.process · audit_logs insert','success')">Simpan Draf</button></div>`);

  /* ================= 1.3 Data & Informasi ================= */
  P['eaw/data'] = () => {
    const t = T.data || 'kamus';
    const klsCls = { publik: 'b-ok', internal: 'b-info', terbatas: 'b-warn', rahasia: 'b-err' };
    let body = '';
    if (t === 'kamus') body = card('', `<div class="toolbar"><div class="search"><input class="input" placeholder="Cari entitas kanonikal…" oninput="App.filterRows(this,'#tbl-data')"></div><div class="chips">${['publik', 'internal', 'terbatas', 'rahasia'].map((k) => pill(k, klsCls[k])).join('')}</div><span class="right small muted">Klasifikasi UU PDP No. 27/2022</span></div><div id="tbl-data">` + table([
      { h: 'Entitas Kanonikal', v: (r) => `<b>${esc(r.nama)}</b>` }, { h: 'Domain', v: (r) => tag(r.dd) }, { h: 'Klasifikasi', v: (r) => pill(r.klas, klsCls[r.klas]) }, { h: 'PII', v: (r) => r.pii ? '<b style="color:var(--err)">Ya</b>' : 'Tidak' },
      { h: 'Steward', v: (r) => esc(r.steward) }, { h: 'Sumber Otoritatif (SoR)', v: (r) => `<code>${esc(r.sor)}</code>` }, { h: 'Retensi', num: 1, v: (r) => r.ret ? r.ret + ' hr' : '—' }, { h: 'KRA', v: (r) => r.ref ? tag(r.ref) : pill('tanpa KRA', 'b-err') }, { h: 'Status', v: (r) => badge(r.status) },
    ], D.DATA_ENTITIES) + '</div>', { flush: true });
    if (t === 'mapping') body = `<div class="callout gold mb"><span class="ic">◆</span><div><b>Prinsip Satu Data Korporasi.</b> Pelanggan dan vendor adalah <i>peran</i> pada satu Party (M2). Konsumen dilarang membuat master lokal, wajib replika read-only <code>ref.*</code> via CDC <code>pub_cmp_ref</code> (31 tabel) dan API SEDDI untuk operasi butuh kesegaran. DD-05 Asset TIK dipindah ke <code>kalla_base.optima</code> (ADR-022).</div></div>` +
      `<div class="grid g3">${D.MASTER_DOMAINS.map((m) => card(`${m.dd} · ${m.nama}`, `<p class="small">${esc(m.isi)}</p><dl class="dl mt-s" style="grid-template-columns:90px 1fr;font-size:12px"><dt>Konsumen</dt><dd>${esc(m.konsumen)}</dd><dt>Tabel</dt><dd>${m.tabel} entitas master</dd><dt>PII</dt><dd>${m.pii ? pill('Ya — hanya di kalla_cmp', 'b-err') : pill('Tidak', 'b-ok')}</dd></dl>`, { meta: 'SoR: kalla_cmp' })).join('')}
        ${card('Pendaftaran 29 Entitas Master', `<div class="kpi" style="padding:0"><div class="val">22<small>/ 29</small></div></div><div class="progress mt-s"><i style="width:76%"></i></div><p class="small muted mt-s">Didaftarkan manual oleh Data Architect via EAW — bukan seed otomatis (cmp/SRS §8.2).</p>`, { acts: A.lockBtn('eaw.catalog.write', '+ Daftarkan', "App.toast('Form entitas master','Pilih tabel kalla_cmp.mdm.* sebagai SoR','info')", 'btn sm') })}
        ${card('Gate Konsistensi Replika', `<div class="stack small"><div class="row">${pill('lolos', 'b-ok')}<code>cross_check_consumers.sh</code></div><div class="row">${pill('lolos', 'b-ok')}<code>cross_check_shared.sh</code></div><div class="row">${pill('0 mismatch', 'b-ok')}<span>ref.* ↔ pub_cmp_ref</span></div><p class="muted tiny">NFR-17, NFR-18 · ADR-CMP-004/005</p></div>`)}</div>`;
    if (t === 'lineage') body = card('Data Pipeline & Lineage — Produsen → SEDDI → Konsumen → OLP', pipelineSvg(), { meta: 'FR-02.4 · metadata dari PANRITA-OLP FLUX', flush: true }) +
      `<div class="grid g3 mt">${[['FLUX job hk_sales_daily', 'ASI.orders → dwh.fact_sales', 'ok', '02:00 · 1,2 jt baris'], ['FLUX job fia_gl_sync', 'FIA.journals → dwh.fact_gl', 'ok', '02:30 · 340 rb baris'], ['FLUX job bsu_delivery', 'AV.deliveries → dwh.fact_delivery', 'err', 'Gagal: konektor OLP down']].map(([n, d, s, m]) => card(n, `<p class="small"><code>${d}</code></p><div class="row mt-s">${pill(s === 'ok' ? 'sukses' : 'gagal', s === 'ok' ? 'b-ok' : 'b-err')}<span class="small muted">${m}</span></div>`)).join('')}</div>`;
    return { html: pageHd('Domain 2 · Data & Informasi', 'Kamus data kanonikal, pemetaan master SEDDI (7 domain data master), dan silsilah data. Setiap entitas data wajib memiliki steward dan sumber otoritatif.', A.lockBtn('eaw.catalog.write', '+ Entitas Data', "App.toast('Form entitas data','klasifikasi · pii · steward · sumber_otoritatif · retensi_hari · referensi_id','info')", 'btn pri')) +
      tabs('data', [['kamus', 'Kamus Data Kanonikal'], ['mapping', 'Mapping Master SEDDI'], ['lineage', 'Data Lineage & Pipeline']], t) + body };
  };
  function pipelineSvg() {
    const cols = [['Produsen (SBU)', ['ASI · STRIDE-Hk', 'VANTAGE · B-LINK', 'PULSE · BASE']], ['SEDDI (CMP)', ['mdm.parties', 'mdm.products', 'mdm.employees']], ['Replika CDC', ['ref.* (kalla_eap)', 'ref.* (kalla_base)', 'ref.* (kalla_stride_hk)']], ['PANRITA-OLP', ['FLUX ETL', 'dwh (kalla_olp)']], ['Konsumen Analitik', ['VANGUARD', 'ACCORD', 'CORE']]];
    const W = 900, colW = W / cols.length; let s = '', pos = {};
    cols.forEach(([h, items], ci) => { const x = ci * colW + 14; s += `<text x="${x}" y="22" class="lane-lbl">${h}</text>`; items.forEach((it, ri) => { const y = 40 + ri * 62; pos[`${ci}-${ri}`] = [x, y]; s += `<rect x="${x}" y="${y}" width="${colW - 36}" height="40" rx="8" fill="var(--surface-2)" stroke="${['var(--d1)', 'var(--d2)', 'var(--d3)', 'var(--d4)', 'var(--d5)'][ci]}" stroke-width="1.5"/><text x="${x + 10}" y="${y + 25}" style="fill:var(--text);font-size:11.5px">${it}</text>`; }); });
    const e = [['0-0', '1-0'], ['0-0', '1-1'], ['0-1', '1-0'], ['0-2', '1-2'], ['1-0', '2-0'], ['1-0', '2-2'], ['1-1', '2-2'], ['1-2', '2-1'], ['2-1', '3-0'], ['2-2', '3-0'], ['3-0', '3-1'], ['3-1', '4-0'], ['3-1', '4-1'], ['3-1', '4-2']];
    const lines = e.map(([a, b]) => { const [x1, y1] = pos[a], [x2, y2] = pos[b]; if (a[0] === b[0]) return `<path d="M${x1 + 60} ${y1 + 40} L${x2 + 60} ${y2}" class="lin-edge"/>`; return `<path d="M${x1 + colW - 36} ${y1 + 20} C${x1 + colW} ${y1 + 20}, ${x2 - 20} ${y2 + 20}, ${x2} ${y2 + 20}" class="lin-edge"/>`; }).join('');
    return `<div style="overflow-x:auto"><svg class="chart" viewBox="0 0 ${W} 240" style="min-width:760px">${lines}${s}</svg></div>`;
  }
  A.filterRows = (inp, sel) => { const q = inp.value.toLowerCase(); A.$$(`${sel} tbody tr`).forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };

  /* ================= 1.4 Layanan ================= */
  P['eaw/layanan'] = () => {
    const f = T.svc || 'all'; const rows = D.SERVICES.filter((s) => f === 'all' || s.tipe === f);
    const tracked = D.SERVICES.filter((s) => s.slo_now);
    return {
      html: pageHd('Domain 3 · Layanan Enterprise', 'Katalog layanan Internal Korporat (H2E, antar-entitas) dan Layanan Pelanggan & Mitra (B2B/B2C), beserta SLO. Setiap layanan wajib punya ≥ 1 proses.', A.lockBtn('eaw.catalog.write', '+ Layanan', "App.toast('Form layanan','nama · tipe · kategori · pemilik · SLO · kanal · referensi_id','info')", 'btn pri')) +
        `<div class="grid g-2-1"><div>${card('', `<div class="toolbar"><div class="chips">${[['all', 'Semua'], ['internal', 'Internal Korporat'], ['pelanggan-mitra', 'Pelanggan & Mitra']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" onclick="App.tab('svc','${k}')">${l}</button>`).join('')}</div><span class="right small muted">${rows.length} layanan</span></div>` + table([
          { h: 'Layanan', v: (r) => `<b>${esc(r.nama)}</b><div class="tiny muted">${esc(r.pemilik)}</div>` }, { h: 'Tipe', v: (r) => pill(r.tipe === 'internal' ? 'Internal' : 'Pelanggan & Mitra', r.tipe === 'internal' ? 'b-info' : 'b-gold') }, { h: 'Kategori', v: (r) => r.kat }, { h: 'Kanal', v: (r) => esc(r.kanal) }, { h: 'Aplikasi', v: (r) => tag(r.app) }, { h: 'SLO', v: (r) => `<span class="small">${esc(r.slo)}</span>` }, { h: 'Status', v: (r) => badge(r.status) },
        ], rows), { flush: true })}</div>
        ${card('SLO Tracker (30 hari)', tracked.map((s) => { const tgt = parseFloat(s.slo.replace(',', '.')); return `<div class="small" style="margin-bottom:10px"><div class="row"><b style="flex:1">${esc(s.nama)}</b><span class="mono" style="color:${s.slo_now >= tgt ? 'var(--ok)' : 'var(--err)'}">${s.slo_now.toFixed(2)}%</span></div><div class="progress mt-s"><i style="width:${(s.slo_now - 98) * 50}%;background:${s.slo_now >= tgt ? 'var(--ok)' : 'var(--err)'}"></i></div><div class="tiny faint">target ${esc(s.slo.split('·')[0])}${s.slo_now < tgt ? ' · <b style="color:var(--err)">BREACH</b>' : ''}</div></div>`; }).join(''), { meta: 'skala 98–100%' })}</div>`,
    };
  };

  /* ================= 1.5 Aplikasi ================= */
  const appFilter = { q: '', jenis: 'all', status: 'all' };
  const appRows = () => D.APPS.filter((a) => (appFilter.jenis === 'all' || a.jenis === appFilter.jenis) && (appFilter.status === 'all' || a.status === appFilter.status) && (a.kode + a.nama + a.platform).toLowerCase().includes(appFilter.q.toLowerCase()));
  const appTable = () => table([
    { h: 'Kode', v: (a) => `<b class="mono">${a.kode}</b>` }, { h: 'Nama', v: (a) => esc(a.nama) + `<div class="tiny muted">${a.platform !== '—' ? 'workspace di ' + a.platform : 'platform'}</div>` },
    { h: 'Jenis', v: (a) => pill(a.jenis === 'umum' ? 'Umum' : 'Khusus', a.jenis === 'umum' ? 'b-info nodot' : 'b-gold nodot') }, { h: 'Mode', v: (a) => A.modeTag(a.mode) },
    { h: 'Lifecycle', v: (a) => a.lifecycle }, { h: 'Kritikalitas', v: (a) => pill(a.krit, { critical: 'b-err', high: 'b-warn', medium: 'b-info', low: '' }[a.krit]) }, { h: 'Risiko AI', v: (a) => a.ai },
    { h: 'Owner Bisnis', v: (a) => `<span class="small">${esc(a.ob)}</span>` }, { h: 'Status', v: (a) => badge(a.status) },
  ], appRows(), { click: (a) => `App.appDetail('${a.kode}')` });
  A.appFilter = (k, v) => { appFilter[k] = v; const el = A.$('#app-tbl'); if (el) el.innerHTML = appTable(); A.$('#app-cnt').textContent = appRows().length + ' entri'; };
  P['eaw/aplikasi'] = () => {
    const t = T.app || 'katalog'; let body = '';
    if (t === 'katalog') body = card('', `<div class="toolbar"><div class="search"><input class="input" placeholder="Cari kode, nama, platform…" value="${esc(appFilter.q)}" oninput="App.appFilter('q',this.value)"></div>
      <select class="select" onchange="App.appFilter('jenis',this.value)"><option value="all">Semua jenis</option><option value="umum">Aplikasi Umum (Holding)</option><option value="khusus">Aplikasi Khusus (STRIDE)</option></select>
      <select class="select" onchange="App.appFilter('status',this.value)"><option value="all">Semua status</option>${D.STATUS.map((s) => `<option>${s}</option>`).join('')}</select><span class="right small muted" id="app-cnt">${appRows().length} entri</span></div><div id="app-tbl">${appTable()}</div>`, { flush: true });
    if (t === 'mode') body = `<div class="grid g2 mb">${card('FEDERATED_REMOTE · Module Federation 2.0', `<p class="small">Dipilih bila workspace dikembangkan tim independen, siklus CI/CD terpisah, atau kode masif. Host memuat <code>remoteEntry.js</code> saat runtime; singleton <code>react</code>, <code>react-dom</code>, <code>@tanstack/react-query</code>, <code>zustand</code>, <code>@panrita/shell-api</code>; Error Boundary terisolasi.</p>`, { meta: D.APPS.filter((a) => a.mode === 'FEDERATED_REMOTE').length + ' workspace' })}${card('INTERNAL_ROUTED · Sub-App', `<p class="small">Dipilih bila ringan, bergantung erat pada shell, atau dikelola tim yang sama. Dibundel di repo shell dan dimount via React Router tanpa panggilan jaringan remoteEntry.</p>`, { meta: D.APPS.filter((a) => a.mode === 'INTERNAL_ROUTED').length + ' workspace' })}</div>` +
      card('Konfigurasi Mode Workspace (eaw.application.workspace_mode)', table([{ h: 'Workspace', v: (a) => `<b class="mono">${a.kode}</b>` }, { h: 'Platform', v: (a) => a.platform }, { h: 'Mode', v: (a) => A.modeTag(a.mode) }, { h: 'federation_scope', v: (a) => `<code>${a.scope}</code>` }, { h: 'remote_entry_url', v: (a) => a.mode === 'FEDERATED_REMOTE' && a.scope !== '—' ? `<code class="tiny">https://${a.scope.replace(/_/g, '-')}.apps.kalla/remoteEntry.js</code>` : '<span class="faint">— dibundel di shell</span>' }, { h: '', v: (a) => A.lockBtn('eaw.catalog.write', 'Ubah', `App.modeEdit('${a.kode}')`, 'btn sm') }], D.APPS.filter((a) => a.ws !== '—')), { flush: true });
    if (t === 'api') body = card('API & Service Registry (OpenAPI 3.1 Hub)', table([{ h: 'Method', v: (r) => tag(r[0], r[0] === 'GET' ? 'mf' : 'ir') }, { h: 'Path', v: (r) => `<code>${r[1]}</code>` }, { h: 'Pemilik', v: (r) => r[2] }, { h: 'Scope', v: (r) => `<code class="tiny">${r[3]}</code>` }, { h: 'Versi', v: (r) => r[4] }, { h: 'Kontrak', v: (r) => r[5] === 'bc' ? pill('breaking change', 'b-err') : pill('kompatibel', 'b-ok') }], [
      ['GET', '/api/v1/eaw/applications', 'EAW', 'eaw.catalog.read', '3.0.0', 'ok'], ['POST', '/api/v1/eaw/applications', 'EAW', 'eaw.catalog.write', '3.0.0', 'ok'], ['POST', '/api/v1/arb/screen-redundancy', 'SEDDI', 'cmp.arb.screen', '1.2.0', 'ok'],
      ['GET', '/api/v1/search/index-feed', 'SEDDI', 'cmp.search.read', '1.0.3', 'ok'], ['POST', '/api/v1/webhooks/employee-sync', 'set (semua platform)', 'set.webhook.write', '1.1.0', 'ok'], ['GET', '/api/v1/parties?role=vendor', 'SEDDI', 'cmp.party.read', '2.0.0', 'ok'], ['GET', '/api/v2/asi/orders', 'STRIDE-Hk ASI', 'asi.order.read', '2.0.0-rc1', 'bc'],
    ]), { flush: true, acts: '<button class="btn sm" onclick="App.toast(\'Impor OpenAPI\',\'Spesifikasi divalidasi skema sebelum commit (EAW-09)\',\'info\')">⇧ Impor spesifikasi</button>' });
    return { html: pageHd('Domain 4 · Aplikasi & Integrasi', 'Katalog portofolio APM (dimulai kosong — Zero Pre-Seed), konfigurasi mode workspace, dan registri API. Entri baru wajib 4 metadata: Pemilik Bisnis, Tim Pengembang, Risiko AI, SLO (EAW-02).',
      A.lockBtn('eaw.catalog.write', '+ Daftarkan Aplikasi', 'App.appForm()', 'btn pri')) + tabs('app', [['katalog', 'Katalog Portofolio APM'], ['mode', 'Mode Workspace (MF 2.0 vs Internal)'], ['api', 'API Registry']], t) + body };
  };
  A.modeEdit = (k) => { const a = D.APPS.find((x) => x.kode === k); a.mode = a.mode === 'FEDERATED_REMOTE' ? 'INTERNAL_ROUTED' : 'FEDERATED_REMOTE'; A.toast('workspace_mode diperbarui', `${k} → ${a.mode} · row_version +1`, 'success'); A.route(); };
  A.appForm = () => A.openModal(`<div class="drawer-hd"><div><h2>Daftarkan Aplikasi / Workspace</h2><p class="small muted">POST /api/v1/eaw/applications · scope eaw.catalog.write</p></div><button class="x" onclick="App.closeAll()">×</button></div>
    <form class="drawer-bd" id="app-form" onsubmit="App.appSave(event)"><div class="form-grid">
      <div class="field"><label>Kode <span class="req">*</span></label><input class="input" name="kode" required placeholder="mis. FORTRESS"></div>
      <div class="field"><label>Nama <span class="req">*</span></label><input class="input" name="nama" required placeholder="Mutu & GRC FORTRESS"></div>
      <div class="field"><label>Platform induk</label><select class="select" name="platform"><option>—</option>${['PANRITA-BASE', 'PANRITA-B-LINK', 'PANRITA-SVP', 'PANRITA-OLP', 'PANRITA-SSP', 'PANRITA-STRIDE-Hk', 'PANRITA-STRIDE-Bsu'].map((p) => `<option>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Jenis <span class="req">*</span></label><select class="select" name="jenis"><option value="umum">Umum (platform holding)</option><option value="khusus">Khusus (STRIDE per SBU)</option></select></div>
      <div class="field full"><label>Mode workspace <span class="req">*</span></label><div class="radio-cards">
        <label class="radio-card"><input type="radio" name="mode" value="FEDERATED_REMOTE" checked><b>FEDERATED_REMOTE</b><div class="d">SPA mandiri via Module Federation 2.0 — tim independen, CI/CD terpisah.</div></label>
        <label class="radio-card"><input type="radio" name="mode" value="INTERNAL_ROUTED"><b>INTERNAL_ROUTED</b><div class="d">Sub-app dibundel di shell — ringan, tim sama.</div></label></div></div>
      <div class="field full"><div class="callout gold"><span class="ic">★</span><div><b>4 metadata wajib (EAW-02)</b> — penyimpanan ditolak bila tidak lengkap.</div></div></div>
      <div class="field"><label>Pemilik Bisnis (jabatan) <span class="req">*</span></label><input class="input" name="ob" placeholder="mis. Kepala Divisi Mutu"></div>
      <div class="field"><label>Tim Pengembang <span class="req">*</span></label><input class="input" name="ot" placeholder="mis. Tim GRC Tech"></div>
      <div class="field"><label>Risiko AI <span class="req">*</span></label><select class="select" name="ai"><option value="">— pilih —</option><option>none</option><option>low</option><option>medium</option><option>high</option></select></div>
      <div class="field"><label>SLO <span class="req">*</span></label><input class="input" name="slo" placeholder="mis. 99,5% · p95 ≤ 500ms"></div>
      <div class="field"><label>Repositori Git (D-02)</label><input class="input" name="repo" placeholder="git.kalla/base"></div>
      <div class="field"><label>Entitas pemilik</label><select class="select" name="entity">${D.ENTITIES.map((e) => `<option value="${e.id}">${esc(e.nama)}</option>`).join('')}</select></div>
    </div><div id="app-err" class="mt"></div></form>
    <div class="drawer-ft"><span class="small muted" style="margin-right:auto">Status awal: <b>Draf</b> (AF-05)</span><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('app-form').requestSubmit()">Simpan Draf</button></div>`);
  A.appSave = (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const miss = [['ob', 'Pemilik Bisnis'], ['ot', 'Tim Pengembang'], ['ai', 'Risiko AI'], ['slo', 'SLO']].filter(([k]) => !f[k]).map(([, l]) => l);
    if (miss.length) { A.$('#app-err').innerHTML = `<div class="callout err"><span class="ic">✕</span><div><b>422 — Metadata wajib belum lengkap.</b> Lengkapi: ${miss.join(', ')}.</div></div>`; return; }
    if (D.APPS.some((a) => a.kode === f.kode.toUpperCase())) { A.$('#app-err').innerHTML = `<div class="callout err"><span class="ic">✕</span>Kode ${esc(f.kode)} sudah terdaftar.</div>`; return; }
    D.APPS.unshift({ kode: f.kode.toUpperCase(), nama: f.nama, platform: f.platform, ws: f.kode.toUpperCase(), jenis: f.jenis, mode: f.mode, lifecycle: 'planned', krit: 'medium', ai: f.ai, status: 'Draf', entity: f.entity, ob: f.ob, ot: f.ot, slo: f.slo, repo: f.repo || '—', scope: '—', db: '—', rel: { layanan: 0, proses: 0, data: 0, infra: 0, kontrol: 0, kra: false } });
    A.closeAll(); A.toast('201 Created — aplikasi terdaftar', `${esc(f.kode.toUpperCase())} berstatus Draf · direplikasi ke kalla_cmp.ref.applications (ADR-CMP-005)`, 'success'); A.route();
  };
  const relRules = (a) => [['≥ 1 Layanan', a.rel.layanan >= 1, a.rel.layanan], ['≥ 1 Proses', a.rel.proses >= 1, a.rel.proses], ['≥ 1 Entitas Data', a.rel.data >= 1, a.rel.data], ['1 Infrastruktur', a.rel.infra === 1 || a.rel.infra >= 1, a.rel.infra], ['≥ 1 Kontrol Keamanan', a.rel.kontrol >= 1, a.rel.kontrol], ['Tautan KRA', a.rel.kra, a.rel.kra ? 'KRA-APL-001' : '—']];
  A.appDetail = (k) => {
    const a = D.APPS.find((x) => x.kode === k); if (!a) return;
    const rules = relRules(a); const ok = rules.every((r) => r[1]); const gse = D.STATUS.indexOf(a.status) >= 1;
    const next = { Draf: ['Ajukan Validasi', 'eaw.workflow.validate'], Divalidasi: ['Tetapkan (ARB)', 'eaw.arb.approve'], Ditetapkan: ['Publikasikan', 'eaw.publish.run'], Dipublikasi: ['Mulai Reviu (AF-07)', 'eaw.workflow.validate'], Direviu: ['Tetapkan versi baru', 'eaw.arb.approve'] }[a.status];
    A.openDrawer(`<div class="drawer-hd"><div><div class="row">${tag(a.kode)}${A.modeTag(a.mode)}${badge(a.status)}</div><h2 class="mt-s">${esc(a.nama)}</h2><p class="small muted">eaw.application · ${a.platform !== '—' ? 'workspace di ' + a.platform : 'platform'} · ${esc(A.ent(a.entity).nama)}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
    <div class="drawer-bd"><h3>Siklus status (AF-05)</h3><div class="mt-s">${A.lifecycle(a.status)}</div>
      <h3 class="mt">Metadata</h3><dl class="dl mt-s"><dt>Jenis</dt><dd>${a.jenis === 'umum' ? 'Aplikasi Umum (platform holding)' : 'Aplikasi Khusus (STRIDE)'}</dd><dt>Owner bisnis</dt><dd>${esc(a.ob)}</dd><dt>Owner teknis</dt><dd>${esc(a.ot)}</dd><dt>Lifecycle</dt><dd>${a.lifecycle}</dd><dt>Kritikalitas</dt><dd>${a.krit}</dd><dt>Risiko AI</dt><dd>${a.ai}</dd><dt>SLO</dt><dd>${esc(a.slo)}</dd><dt>Repo Git</dt><dd class="mono">${esc(a.repo)}</dd><dt>federation_scope</dt><dd class="mono">${esc(a.scope)}</dd><dt>Basis data</dt><dd class="mono">${esc(a.db)}</dd></dl>
      <h3 class="mt">Validasi relasi wajib (EAW-05)</h3><div class="stack mt-s">${rules.map(([l, pass, n]) => `<div class="row small"><span style="color:${pass ? 'var(--ok)' : 'var(--err)'};font-weight:800;width:16px">${pass ? '✓' : '✕'}</span><span style="flex:1">${l}</span><span class="mono muted">${n}</span></div>`).join('')}</div>
      ${ok ? '<div class="callout ok mt"><span class="ic">✓</span>Seluruh relasi wajib dan tautan KRA terpenuhi.</div>' : `<div class="callout err mt"><span class="ic">✕</span><div><b>Belum dapat Divalidasi.</b> ${esc(a.kode)} kekurangan: ${rules.filter((r) => !r[1]).map((r) => r[0]).join(', ')}.</div></div>`}
      <h3 class="mt">Gate GSE (AF-06)</h3><div class="callout ${gse ? 'ok' : 'warn'} mt-s"><span class="ic">${gse ? '⚙' : '⛔'}</span>${gse ? 'Scaffolding GSE diizinkan untuk aplikasi ini.' : 'Scaffolding diblokir — status minimal harus <b>Divalidasi</b>.'}</div>
      <h3 class="mt">Riwayat transisi (eaw.workflow · append-only)</h3><div class="stack small mt-s"><div class="row"><span class="mono faint">2026-10-02 09:14</span>— → Draf · ${esc(a.ot)}</div>${D.STATUS.indexOf(a.status) >= 1 ? '<div class="row"><span class="mono faint">2026-10-11 14:30</span>Draf → Divalidasi · app.architect</div>' : ''}${D.STATUS.indexOf(a.status) >= 2 ? '<div class="row"><span class="mono faint">2026-10-20 10:00</span>Divalidasi → Ditetapkan · chief.architect (ARB)</div>' : ''}${D.STATUS.indexOf(a.status) >= 3 ? '<div class="row"><span class="mono faint">2026-10-21 08:00</span>Ditetapkan → Dipublikasi · chief.architect</div>' : ''}</div>
    </div>
    <div class="drawer-ft">${gse ? `<a class="btn" href="#/gse/proyek" onclick="App.T_gse('${a.kode}')">⚙ Scaffold di GSE</a>` : ''}${A.lockBtn(next[1], next[0], `App.transition('${a.kode}')`, 'btn pri')}</div>`);
  };
  A.T_gse = (k) => { T.gseApp = k; T.gseStep = 1; };
  A.transition = (k) => {
    const a = D.APPS.find((x) => x.kode === k);
    if (a.status === 'Draf' && !relRules(a).every((r) => r[1])) { A.toast('Validasi ditolak (EAW-05)', `${k}: relasi wajib atau tautan KRA belum lengkap.`, 'error'); return; }
    const i = D.STATUS.indexOf(a.status); const to = a.status === 'Direviu' ? 'Ditetapkan' : D.STATUS[Math.min(4, i + 1)];
    D.AUDIT.unshift({ id: D.AUDIT[0].id + 1, t: A.now(), sch: 'eaw', tbl: 'workflow', act: 'insert', by: A.currentUser().uname, rec: k, ch: `${a.status} → ${to}` });
    A.toast('Transisi tercatat', `${k}: ${a.status} → ${to} · eaw.workflow (append-only)`, 'success'); a.status = to; A.route(); A.appDetail(k);
  };

  /* ================= 1.6 Infrastruktur ================= */
  P['eaw/infra'] = () => {
    const icon = { 'klaster-k8s': '☸', 'klaster-db': '⛁', gpu: '▣', jaringan: '⇄', cloud: '☁', 'dc-fisik': '▤' };
    return {
      html: pageHd('Domain 5 · Infrastruktur & Teknologi', 'Topologi Hybrid Multi-Cloud (DC On-Prem Makassar + cloud), SD-WAN antar-cabang, dan IdP terpusat. Setiap aset wajib menjalankan ≥ 1 aplikasi.', A.lockBtn('eaw.catalog.write', '+ Aset Infrastruktur', "App.toast('Form aset','tipe · lokasi · kapasitas · dr_tier · referensi_id','info')", 'btn pri')) +
        `<div class="grid g4 mb">${A.kpi('Klaster K8s', '2', { tgt: '24 node prod' })}${A.kpi('GPU On-Prem', '8×80GB', { tgt: 'D-05 data rahasia' })}${A.kpi('Cabang SD-WAN', '64 + 7', { tgt: 'cabang + site proyek' })}${A.kpi('RPO / RTO', '15m / 4j', { tgt: 'NFR-13' })}</div>` +
        `<div class="grid g3">${D.INFRA.map((i) => card(`${icon[i.tipe]} ${esc(i.nama)}`, `<dl class="dl" style="grid-template-columns:90px 1fr;font-size:12.5px"><dt>Tipe</dt><dd>${tag(i.tipe)}</dd><dt>Lokasi</dt><dd>${esc(i.lokasi)}</dd><dt>Kapasitas</dt><dd>${esc(i.kap)}</dd><dt>DR Tier</dt><dd>${esc(i.dr)}</dd><dt>Menjalankan</dt><dd>${i.apps.map((x) => tag(x)).join(' ')}</dd></dl>`, { acts: badge(i.status) })).join('')}</div>`,
    };
  };

  /* ================= 1.7 Keamanan ================= */
  P['eaw/keamanan'] = () => {
    const asp = ['kerahasiaan', 'keutuhan', 'ketersediaan', 'keaslian', 'kenirsangkalan'];
    const penCls = { penuh: 'b-ok', sebagian: 'b-warn', belum: 'b-err' };
    const score = (a) => { const c = D.CONTROLS.filter((x) => x.aspek === a); return Math.round((c.reduce((s, x) => s + ({ penuh: 1, sebagian: 0.5, belum: 0 }[x.pen]), 0) / c.length) * 100); };
    return {
      html: pageHd('Domain 6 · Keamanan Informasi', 'Matriks kepatuhan UU PDP No. 27/2022, PP 71/2019, dan ISO/IEC 27001 per 5 aspek keamanan; profil risiko sistem. Zero Trust & least privilege.', A.lockBtn('eaw.catalog.write', '+ Kontrol', "App.toast('Form kontrol','aspek · standar_rujukan · status_penerapan','info')", 'btn pri')) +
        `<div class="grid g5 mb">${asp.map((a) => `<div class="card kpi"><div class="lbl" style="text-transform:capitalize">${a}</div><div class="val">${score(a)}<small>%</small></div><div class="progress mt-s"><i style="width:${score(a)}%;background:${score(a) >= 80 ? 'var(--ok)' : score(a) >= 50 ? 'var(--warn)' : 'var(--err)'}"></i></div></div>`).join('')}</div>` +
        `<div class="grid g-2-1">${card('Kontrol Keamanan Baseline (eaw.control)', table([{ h: 'Aspek', v: (r) => `<span style="text-transform:capitalize">${r.aspek}</span>` }, { h: 'Kontrol', v: (r) => esc(r.nama) }, { h: 'Standar', v: (r) => tag(r.std) }, { h: 'Penerapan', v: (r) => pill(r.pen, penCls[r.pen]) }, { h: 'Status', v: (r) => badge(r.status) }], D.CONTROLS), { flush: true })}
        ${card('Profil Risiko Sistem', `<div class="heat" style="grid-template-columns:70px repeat(3,1fr)"><div></div><div class="h">Rendah</div><div class="h">Sedang</div><div class="h">Tinggi</div>
          ${[['Tinggi', ['', 'FORGE', 'CORE · ASI']], ['Sedang', ['OPTIMA', 'PULSE · REQ', 'GSE']], ['Rendah', ['SET · AV', 'CONSOLE', '']]].map(([d, cells], ri) => `<div class="h">${d}</div>${cells.map((c, ci) => `<div class="c" style="background:color-mix(in srgb, ${['var(--ok)', 'var(--warn)', 'var(--err)'][Math.min(2, Math.floor((2 - ri + ci) / 1.5))]} 30%, var(--surface));font-size:10.5px;min-height:46px">${c}</div>`).join('')}`).join('')}</div><p class="tiny muted mt-s">Sumbu Y: dampak bisnis · Sumbu X: kemungkinan · risiko AI dari eaw.application.risiko_ai</p>`)}</div>`,
    };
  };

  /* ================= EAW-01 Kanvas ArchiMate ================= */
  const CV = { nodes: [
    { id: 'n1', t: 'Business Process', n: 'Penjualan Mobil Baru', x: 60, y: 60, l: 'b' }, { id: 'n2', t: 'Business Service', n: 'Layanan Penjualan Kendaraan', x: 300, y: 60, l: 'b' }, { id: 'n3', t: 'Business Object', n: 'Party (Customer)', x: 540, y: 60, l: 'b' },
    { id: 'n4', t: 'Application Component', n: 'ASI (STRIDE-Hk)', x: 160, y: 200, l: 'a' }, { id: 'n5', t: 'Application Component', n: 'SEDDI · MDM', x: 420, y: 200, l: 'a' }, { id: 'n6', t: 'Data Object', n: 'ref.parties', x: 640, y: 200, l: 'a' },
    { id: 'n7', t: 'Node', n: 'K8s Prod Makassar', x: 160, y: 340, l: 't' }, { id: 'n8', t: 'System Software', n: 'PostgreSQL HA', x: 420, y: 340, l: 't' },
  ], edges: [['n2', 'n1', 'serving'], ['n1', 'n3', 'access'], ['n4', 'n2', 'serving'], ['n4', 'n6', 'access'], ['n5', 'n6', 'realization'], ['n7', 'n4', 'serving'], ['n8', 'n5', 'serving']], sel: 'n4' };
  const LAYER = { m: ['Motivation', '#CCCCFF'], s: ['Strategy', '#F5DEAA'], b: ['Business', '#FFFFB5'], a: ['Application', '#B5FFFF'], t: ['Technology', '#C9E7B7'], p: ['Physical', '#C9E7B7'], i: ['Implementation', '#FFE0E0'] };
  const PALETTE = [['b', 'Business Actor'], ['b', 'Business Process'], ['b', 'Business Service'], ['b', 'Business Object'], ['a', 'Application Component'], ['a', 'Application Service'], ['a', 'Data Object'], ['t', 'Node'], ['t', 'System Software'], ['t', 'Communication Network'], ['m', 'Goal'], ['s', 'Capability'], ['p', 'Facility'], ['i', 'Work Package']];
  function cvSvg() {
    const c = (id) => CV.nodes.find((n) => n.id === id);
    const lanes = [['b', 20, 130], ['a', 160, 130], ['t', 300, 120]];
    return `<svg id="cv-svg" viewBox="0 0 820 440"><defs><marker id="am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>
      ${lanes.map(([k, y, h]) => `<rect x="6" y="${y}" width="808" height="${h}" rx="8" fill="${LAYER[k][1]}" opacity=".18"/><text class="lane-lbl" x="14" y="${y + 14}">${LAYER[k][0]} layer</text>`).join('')}
      ${CV.edges.map(([s, t, ty]) => { const a = c(s), b = c(t); if (!a || !b) return ''; return `<line x1="${a.x + 75}" y1="${a.y + 25}" x2="${b.x + 75}" y2="${b.y + 25}" stroke="var(--muted)" stroke-width="1.4" ${ty === 'access' ? 'stroke-dasharray="3 3"' : ty === 'realization' ? 'stroke-dasharray="7 4"' : ''} marker-end="url(#am)"/><text x="${(a.x + b.x) / 2 + 75}" y="${(a.y + b.y) / 2 + 20}" text-anchor="middle" style="font-size:9.5px">${ty}</text>`; }).join('')}
      ${CV.nodes.map((n) => `<g class="anode ${n.id === CV.sel ? 'sel' : ''}" data-id="${n.id}" transform="translate(${n.x},${n.y})"><rect width="150" height="50" rx="${n.l === 'b' && /Process|Service/.test(n.t) ? 14 : 4}" fill="${LAYER[n.l][1]}" stroke="#555"/><text x="8" y="18" style="font-size:9.5px;fill:#555">«${n.t}»</text><text x="8" y="36" style="font-weight:700">${esc(n.n.length > 22 ? n.n.slice(0, 21) + '…' : n.n)}</text></g>`).join('')}</svg>`;
  }
  function cvInspector() {
    const n = CV.nodes.find((x) => x.id === CV.sel);
    const issues = CV.nodes.filter((x) => !CV.edges.some((e) => e[0] === x.id || e[1] === x.id));
    return `<h3>Inspector</h3>${n ? `<div class="field mt-s"><label>Nama</label><input class="input" value="${esc(n.n)}" oninput="App.cvRename(this.value)"></div><dl class="dl mt-s" style="grid-template-columns:70px 1fr;font-size:12px"><dt>Tipe</dt><dd>${n.t}</dd><dt>Layer</dt><dd>${LAYER[n.l][0]}</dd><dt>ABB/SBB</dt><dd>${tag(n.l === 'a' ? 'SBB → Project.md' : 'ABB')}</dd><dt>Relasi</dt><dd>${CV.edges.filter((e) => e.includes(n.id)).length}</dd></dl><button class="btn sm mt-s" onclick="App.cvDelete()">Hapus elemen</button>` : '<p class="small muted mt-s">Pilih elemen pada kanvas.</p>'}
      <h3 class="mt">Validasi metamodel</h3><div class="stack small mt-s">${issues.length ? issues.map((i) => `<div class="callout err" style="padding:8px"><span>✕</span><div><b>${esc(i.n)}</b> tidak memiliki relasi. Elemen ${i.t} wajib terhubung (AC-3).</div></div>`).join('') : '<div class="callout ok" style="padding:8px">✓ Model valid terhadap metamodel ArchiMate 3.2</div>'}</div>
      <h3 class="mt">ADR tertaut</h3><div class="row mt-s">${tag('D-01')}${tag('D-07')}${tag('D-14')}</div>`;
  }
  A.cvRename = (v) => { const n = CV.nodes.find((x) => x.id === CV.sel); n.n = v; A.$('#cv').innerHTML = cvSvg(); bindCanvas(); };
  A.cvDelete = () => { CV.nodes = CV.nodes.filter((n) => n.id !== CV.sel); CV.edges = CV.edges.filter((e) => !e.includes(CV.sel)); CV.sel = null; refreshCv(); };
  A.cvAdd = (l, t) => { const id = 'n' + Date.now(); CV.nodes.push({ id, t, n: t + ' baru', x: 560 + Math.random() * 60, y: { b: 60, a: 200, t: 340, m: 60, s: 60, p: 340, i: 340 }[l], l }); CV.sel = id; refreshCv(); A.toast('Elemen ditambahkan', `${t} · validasi real-time aktif`, 'info'); };
  A.cvConnect = () => { if (!CV.sel) return; const other = CV.nodes.find((n) => n.id !== CV.sel && !CV.edges.some((e) => e.includes(CV.sel) && e.includes(n.id))); if (other) { CV.edges.push([CV.sel, other.id, 'association']); refreshCv(); } };
  A.cvExport = () => { const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" identifier="saoraja-model">\n  <name xml:lang="id">SAORAJA — Kerangka FW-HK-01</name>\n  <elements>\n${CV.nodes.map((n) => `    <element identifier="${n.id}" xsi:type="${n.t.replace(/ /g, '')}"><name xml:lang="id">${esc(n.n)}</name></element>`).join('\n')}\n  </elements>\n  <relationships>\n${CV.edges.map((e, i) => `    <relationship identifier="r${i}" source="${e[0]}" target="${e[1]}" xsi:type="${e[2][0].toUpperCase() + e[2].slice(1)}"/>`).join('\n')}\n  </relationships>\n</model>\n`; download('saoraja-model.xml', xml, 'application/xml'); A.toast('Ekspor Open Group Exchange XML', 'saoraja-model.xml diunduh (EAW-01 AC-4)', 'success'); };
  function refreshCv() { A.$('#cv').innerHTML = cvSvg(); A.$('#cv-insp').innerHTML = cvInspector(); bindCanvas(); }
  function bindCanvas() {
    const svg = A.$('#cv-svg'); if (!svg) return; let drag = null, off = [0, 0];
    const pt = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    A.$$('.anode', svg).forEach((g) => g.addEventListener('pointerdown', (e) => { const n = CV.nodes.find((x) => x.id === g.dataset.id); CV.sel = n.id; drag = n; const p = pt(e); off = [p.x - n.x, p.y - n.y]; g.setPointerCapture(e.pointerId); A.$$('.anode', svg).forEach((x) => x.classList.toggle('sel', x === g)); A.$('#cv-insp').innerHTML = cvInspector(); }));
    svg.addEventListener('pointermove', (e) => { if (!drag) return; const p = pt(e); drag.x = Math.max(8, Math.min(660, p.x - off[0])); drag.y = Math.max(8, Math.min(385, p.y - off[1])); A.$('#cv').innerHTML = cvSvg(); bindCanvas(); });
    svg.addEventListener('pointerup', () => { drag = null; });
  }
  P['eaw/kanvas'] = () => ({
    html: pageHd('Kanvas ArchiMate 3.2', 'Pemodelan visual 7 layer ArchiMate dengan validasi metamodel real-time, penautan ABB/SBB ke platform, dan ekspor Open Group Exchange XML (EAW-01). Implementasi produksi: @xyflow/react 12.',
      `<select class="select"><option>FW-HK-01 · Penjualan kendaraan</option>${D.FRAMEWORKS.slice(1).map((f) => `<option>${f.id} · ${esc(f.layanan)}</option>`).join('')}</select><button class="btn" onclick="App.cvConnect()">⤳ Hubungkan</button><button class="btn" onclick="App.cvExport()">⇩ Exchange XML</button>${A.lockBtn('eaw.model.write', 'Simpan model', "App.toast('Model tersimpan','eaw.relation · 8 elemen · versi Git','success')", 'btn pri')}`) +
      `<div class="card canvas-wrap"><div class="palette"><div class="nav-group" style="padding-left:2px">Elemen</div>${PALETTE.map(([l, t]) => `<div class="pi" onclick="App.cvAdd('${l}','${t}')"><span class="sw" style="background:${LAYER[l][1]}"></span>${t}</div>`).join('')}<div class="nav-group" style="padding-left:2px">Layer</div><div class="legend" style="flex-direction:column;gap:4px">${Object.values(LAYER).map(([n, c]) => `<span><span class="sw" style="background:${c};width:12px;height:10px;border-radius:2px;display:inline-block"></span>${n}</span>`).join('')}</div></div>
      <div class="cv" id="cv">${cvSvg()}</div><div class="inspector" id="cv-insp">${cvInspector()}</div></div><p class="tiny muted mt-s">Seret elemen untuk memindahkan · klik palet untuk menambah · “Hubungkan” membuat relasi dari elemen terpilih.</p>`,
    mount: bindCanvas,
  });

  /* ================= EAW-03 Lineage & Impact ================= */
  const LN = { cols: ['Proses Bisnis', 'Layanan', 'Workspace', 'Skema DB', 'Infrastruktur'], nodes: [
    ['p1', 0, 'Penjualan Mobil Baru'], ['p2', 0, 'Servis & Suku Cadang'], ['p3', 0, 'Hire-to-Retire'], ['p4', 0, 'Procure-to-Pay'],
    ['s1', 1, 'Penjualan Kendaraan'], ['s2', 1, 'Booking Servis'], ['s3', 1, 'Cuti & Slip Gaji'], ['s4', 1, 'Shared Procurement'],
    ['w1', 2, 'ASI'], ['w2', 2, 'ASM'], ['w3', 2, 'PULSE / ESS'], ['w4', 2, 'VANTAGE'], ['w5', 2, 'SEDDI MDM'],
    ['d1', 3, 'kalla_stride_hk.asi'], ['d2', 3, 'kalla_base.pulse'], ['d3', 3, 'kalla_blink.vantage'], ['d4', 3, 'kalla_cmp.mdm'],
    ['i1', 4, 'K8s Prod Makassar'], ['i2', 4, 'PostgreSQL HA'], ['i3', 4, 'Cloud Region'], ['i4', 4, 'SD-WAN'],
  ], edges: [['p1', 's1'], ['p2', 's2'], ['p3', 's3'], ['p4', 's4'], ['s1', 'w1'], ['s2', 'w2'], ['s3', 'w3'], ['s4', 'w4'], ['s1', 'w5'], ['s4', 'w5'], ['w1', 'd1'], ['w2', 'd1'], ['w3', 'd2'], ['w4', 'd3'], ['w5', 'd4'], ['w1', 'd4'], ['d1', 'i2'], ['d2', 'i2'], ['d4', 'i2'], ['d3', 'i3'], ['w1', 'i1'], ['w3', 'i1'], ['w5', 'i1'], ['w4', 'i3'], ['w1', 'i4'], ['w2', 'i4']] };
  function lineageSvg(src) {
    const W = 980, cw = W / 5, pos = {}; LN.cols.forEach((c, ci) => LN.nodes.filter((n) => n[1] === ci).forEach((n, ri) => { pos[n[0]] = [ci * cw + 12, 44 + ri * 58]; }));
    let hit = new Set();
    if (src) { const q = [src]; hit.add(src); const adj = (id) => LN.edges.filter((e) => e[0] === id || e[1] === id).map((e) => (e[0] === id ? e[1] : e[0])); while (q.length) { const c = q.shift(); adj(c).forEach((n) => { if (!hit.has(n)) { hit.add(n); q.push(n); } }); } }
    const st = (id) => (!src ? '' : id === src ? 'src' : hit.has(id) ? 'hit' : 'dim');
    return `<svg class="chart" viewBox="0 0 ${W} 340" style="min-width:820px">${LN.cols.map((c, ci) => `<text x="${ci * cw + 12}" y="24" class="lane-lbl">${c}</text>`).join('')}
      ${LN.edges.map(([a, b]) => { const [x1, y1] = pos[a], [x2, y2] = pos[b]; const cls = !src ? '' : hit.has(a) && hit.has(b) ? 'hit' : 'dim'; return `<path class="lin-edge ${cls}" d="M${x1 + cw - 30} ${y1 + 18} C${x1 + cw} ${y1 + 18}, ${x2 - 20} ${y2 + 18}, ${x2} ${y2 + 18}"/>`; }).join('')}
      ${LN.nodes.map(([id, , l]) => `<g class="lin-node ${st(id)}" onclick="App.lineage('${id}')"><rect x="${pos[id][0]}" y="${pos[id][1]}" width="${cw - 30}" height="36" rx="7"/><text x="${pos[id][0] + 10}" y="${pos[id][1] + 22}">${l}</text></g>`).join('')}</svg>`;
  }
  A.lineage = (id) => { T.ln = T.ln === id ? null : id; A.route(); };
  P['eaw/lineage'] = () => {
    const src = T.ln; const node = LN.nodes.find((n) => n[0] === src);
    let impacted = [];
    if (src) { const set = new Set([src]); const q = [src]; while (q.length) { const c = q.shift(); LN.edges.filter((e) => e.includes(c)).forEach((e) => { const o = e[0] === c ? e[1] : e[0]; if (!set.has(o)) { set.add(o); q.push(o); } }); } impacted = LN.nodes.filter((n) => set.has(n[0]) && n[0] !== src); }
    return {
      html: pageHd('Dependency Lineage & Impact Analysis', 'Graf relasi Proses Bisnis → Layanan → Workspace → Skema DB → Infrastruktur. Klik node untuk mensimulasikan perubahan skema/endpoint dan melihat seluruh dampaknya (EAW-03; ≤ 1.000 node dalam ≤ 10 dtk).', `<button class="btn" onclick="App.copilot('Aplikasi apa saja yang terdampak jika server On-Prem Makassar mengalami downtime?')">✦ Tanya MIND (NL query)</button>`) +
        `<div class="grid g-2-1">${card('Graf Lineage', `<div style="overflow-x:auto">${lineageSvg(src)}</div>`, { flush: true, meta: `${LN.nodes.length} node · ${LN.edges.length} relasi · render ${(Math.random() * 40 + 20).toFixed(0)}ms` })}
        ${card(src ? `Dampak perubahan: ${esc(node[2])}` : 'Analisis Dampak', src ? `<div class="callout err mb"><span class="ic">⚠</span><div><b>${impacted.length} objek terdampak</b> bila <i>${esc(node[2])}</i> berubah atau down.</div></div>` + LN.cols.map((c, ci) => { const xs = impacted.filter((n) => n[1] === ci); return xs.length ? `<div class="small" style="margin-bottom:8px"><b>${c}</b><div class="row mt-s">${xs.map((n) => tag(n[2])).join('')}</div></div>` : ''; }).join('') + `<button class="btn sm mt" onclick="App.lineage('${src}')">Reset</button>` : '<div class="empty"><div class="big">⤳</div>Pilih node pada graf (mis. <b>PostgreSQL HA</b> atau <b>kalla_cmp.mdm</b>) untuk melihat daftar proses dan platform yang terdampak.</div>')}</div>`,
    };
  };

  /* ================= EAW-05 Framework Builder ================= */
  P['eaw/kerangka'] = () => {
    const sel = T.fw || 'FW-HK-01'; const f = D.FRAMEWORKS.find((x) => x.id === sel);
    const missing = D.DOMAINS.filter((d, i) => !f.dom[i]);
    return {
      html: pageHd('Framework Builder — Kerangka Kerja per Layanan Utama', 'Satu Kerangka Kerja per layanan utama unit usaha (AF-02); setiap kerangka wajib mengisi keenam domain dan relasi wajibnya sebelum dapat Divalidasi (EAW-05). 11 kerangka sesuai SAF §4.', A.lockBtn('eaw.model.write', '+ Kerangka Kerja', "App.toast('Kerangka baru','eaw.framework · tipe utama/pendukung','info')", 'btn pri')) +
        `<div class="grid g-1-2">${card('11 Kerangka Kerja', `<div class="list">${D.FRAMEWORKS.map((x) => { const filled = x.dom.filter(Boolean).length; return `<div class="li" style="cursor:pointer;${x.id === sel ? 'background:var(--accent-soft)' : ''}" onclick="App.tab('fw','${x.id}')"><div class="bd"><div class="t">${esc(x.layanan)}</div><div class="d">${esc(A.ent(x.entity).nama)} · ${esc(x.app)}</div><div class="row mt-s" style="gap:3px">${x.dom.map((n, i) => `<span title="${D.DOMAINS[i].nama}: ${n}" style="width:22px;height:6px;border-radius:3px;background:${n ? D.DOMAINS[i].color : 'var(--surface-3)'}"></span>`).join('')}<span class="tiny faint" style="margin-left:6px">${filled}/6</span></div></div>${badge(x.status)}</div>`; }).join('')}</div>`, { flush: true })}
        <div class="stack">${card(`${f.id} · ${esc(f.layanan)}`, `${A.lifecycle(f.status)}<div class="grid g3 mt">${D.DOMAINS.map((d, i) => `<div class="card" style="box-shadow:none;border-top:4px solid ${d.color};padding:12px"><div class="small muted">D${d.n} · ${d.nama}</div><div style="font-size:22px;font-weight:800">${f.dom[i]}</div><div class="tiny ${f.dom[i] ? 'faint' : ''}" style="${f.dom[i] ? '' : 'color:var(--err);font-weight:700'}">${f.dom[i] ? 'objek terisi' : 'WAJIB DIISI'}</div></div>`).join('')}</div>`,
          { acts: `<a class="btn sm" href="#/eaw/kanvas">Buka di kanvas</a>${A.lockBtn('eaw.workflow.validate', 'Validasi', `App.fwValidate('${f.id}')`, 'btn sm pri')}` })}
        ${card('Hasil validasi kelengkapan', missing.length || f.id !== 'FW-HK-01' ? `<div class="callout err"><span class="ic">✕</span><div><b>Status Divalidasi ditolak.</b><ul style="margin:6px 0 0;padding-left:18px">${missing.map((d) => `<li>Domain <b>${d.nama}</b> belum memiliki objek</li>`).join('')}${f.dom[3] ? `<li>Aplikasi <b>${esc(f.app)}</b> belum memiliki relasi ke ≥ 1 Kontrol Keamanan</li>` : ''}<li>${f.dom[1] ? 'Entitas Data “Order” belum memiliki steward' : 'Tidak ada Entitas Data dengan sumber otoritatif'}</li></ul></div></div>` : '<div class="callout ok"><span class="ic">✓</span>Seluruh objek memiliki relasi wajib dan tautan KRA. Siap ditetapkan ARB.</div>', { meta: 'aturan relasi SAF §7' })}</div></div>`,
    };
  };
  A.fwValidate = (id) => { const f = D.FRAMEWORKS.find((x) => x.id === id); if (f.id === 'FW-HK-01') { A.toast('Validasi lolos', `${id} memenuhi aturan relasi`, 'success'); } else A.toast('Validasi ditolak (EAW-05)', 'Lihat daftar objek & relasi yang kurang', 'error'); };

  /* ================= EAW-06 KRA ================= */
  P['eaw/kra'] = () => ({
    html: pageHd('KRA Manager — Referensi Arsitektur Korporat', 'Referensi baku per domain, berversi; hanya Holding EA Office yang dapat mengubah (AF-04). Objek entitas wajib tertaut ke KRA; perubahan versi menandai objek terdampak untuk direviu (EAW-06).', A.lockBtn('eaw.kra.write', '+ KRA baru', "App.toast('KRA baru','eaw.reference · domain · kode · versi','info')", 'btn pri')) +
      `<div class="callout warn mb"><span class="ic">↻</span><div><b>KRA-DAT-001 naik ke v2.0</b> (Model Kanonikal Party). 14 objek tertaut ditandai <b>Direviu</b>. <a href="#" onclick="App.toast('14 objek','eaw.data_entity ×6 · eaw.application ×5 · eaw.process ×3','info');return false">Lihat daftar →</a></div></div>` +
      `<div class="grid g3 mb">${D.DOMAINS.map((d) => { const k = D.KRA.filter((x) => x.domain === d.id); return `<div class="card kpi" style="border-left:4px solid ${d.color}"><div class="lbl">D${d.n} · ${d.nama}</div><div class="val">${k.length}<small>referensi</small></div><div class="tgt">${k.reduce((s, x) => s + x.objek, 0)} objek tertaut</div></div>`; }).join('')}</div>` +
      card('Daftar Referensi (eaw.reference)', table([{ h: 'Kode', v: (r) => `<b class="mono">${r.kode}</b>` }, { h: 'Domain', v: (r) => `<span class="row" style="gap:6px"><i class="dom-dot" style="background:${A.dom(r.domain).color}"></i>${A.dom(r.domain).nama}</span>` }, { h: 'Nama', v: (r) => esc(r.nama) + (r.changed ? ' ' + A.pill('versi baru', 'b-warn') : '') }, { h: 'Versi', v: (r) => tag('v' + r.versi) }, { h: 'Objek tertaut', num: 1, v: (r) => r.objek }, { h: 'Status', v: (r) => badge(r.status) }, { h: '', v: () => A.lockBtn('eaw.kra.write', 'Revisi', "App.toast('Revisi KRA','Versi baru dibuat; versi lama tetap tersimpan','success')", 'btn sm') }], D.KRA), { flush: true, meta: '100% objek entitas wajib tertaut' }),
  });

  /* ================= 1.8 ARB Clearance ================= */
  const ARBST = { SUBMITTED: ['Diajukan', 'b-info'], IN_REVIEW: ['Review Domain', 'b-vio'], REVISION: ['Butuh Revisi', 'b-warn'], APPROVED: ['Disetujui', 'b-ok'], REJECTED: ['Ditolak', 'b-err'] };
  const arbBadge = (s) => pill(ARBST[s][0], ARBST[s][1]);
  A.arbBadge = arbBadge;
  P['eaw/arb'] = () => {
    const t = T.arb || 'sidang'; let body = '';
    if (t === 'sidang') body = `<div class="kanban">${Object.keys(ARBST).map((s) => { const xs = D.ARB.filter((a) => a.status === s); return `<div class="kcol"><h3>${arbBadge(s)}<span class="faint">${xs.length}</span></h3>${xs.map((a) => `<div class="kcard" onclick="App.arbDetail('${a.no}')"><div class="row"><span class="mono tiny faint">${a.no}</span><span class="right tiny" style="font-weight:800;color:${a.score >= 75 ? 'var(--err)' : 'var(--ok)'}">MIND ${a.score}%</span></div><div class="t">${esc(a.name)}</div><div class="tiny muted">${esc(A.ent(a.entity).nama)} · ${A.idr(a.cost)}</div>${a.dup ? `<div class="tiny mt-s" style="color:var(--err)">≈ ${esc(a.dup)}</div>` : ''}</div>`).join('') || '<div class="tiny faint" style="padding:8px">Kosong</div>'}</div>`; }).join('')}</div>`;
    if (t === 'baru') body = arbForm();
    if (t === 'register') body = card('Register Sertifikat Architecture Clearance', table([{ h: 'Sertifikat', v: (r) => `<b class="mono">${r.cert}</b>` }, { h: 'Tiket', v: (r) => `<span class="mono">${r.no}</span>` }, { h: 'Inisiatif', v: (r) => esc(r.name) }, { h: 'Entitas', v: (r) => esc(A.ent(r.entity).nama) }, { h: 'Tanggal', v: (r) => r.date }, { h: 'Gate AF-06', v: () => A.pill('terbuka', 'b-ok') }, { h: '', v: (r) => `<button class="btn sm" onclick="event.stopPropagation();App.certView('${r.no}')">Lihat</button>` }], D.ARB.filter((a) => a.cert), { click: (r) => `App.certView('${r.no}')` }), { flush: true });
    return { html: pageHd('Tata Kelola & ARB Clearance', 'Setiap pengadaan/pembuatan aplikasi baru wajib clearance ARB (anti-redundansi). Alur: Pengajuan SBU → Pre-screening MIND AI → Evaluasi Domain Architects → Putusan ARB Chair → Sertifikat → Gate AF-06 terbuka.',
      A.lockBtn('eaw.arb.submit', '+ Ajukan Inisiatif', "App.tab('arb','baru')", 'btn pri')) +
      `<div class="steps">${['Pengajuan SBU', 'Pre-Screening MIND', 'Evaluasi 6 Domain', 'Sidang ARB Chair', 'Sertifikat & Gate AF-06'].map((s, i) => `<div class="step done"><b>Tahap ${i + 1}</b>${s}</div>`).join('')}</div>` +
      tabs('arb', [['sidang', 'Meja Sidang Review'], ['baru', 'Pengajuan Baru'], ['register', 'Register Sertifikat']], t) + body };
  };
  function arbForm() {
    return `<div class="grid g-2-1">${card('Formulir Pengajuan (FR-03.1)', `<form id="arb-form" onsubmit="App.arbScreen(event)"><div class="form-grid">
      <div class="field full"><label>Nama inisiatif <span class="req">*</span></label><input class="input" name="name" required value="Aplikasi Manajemen Pelanggan Mall Kalla Land"></div>
      <div class="field"><label>Entitas pengusul</label><select class="select" name="entity">${D.ENTITIES.filter((e) => e.tingkat === 'sbu').map((e) => `<option value="${e.id}" ${e.id === 'BAD' ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}</select></div>
      <div class="field"><label>Estimasi anggaran (Rp) <span class="req">*</span></label><input class="input" name="cost" type="number" value="1450000000"></div>
      <div class="field full"><label>Kebutuhan bisnis <span class="req">*</span></label><textarea class="textarea" name="bc">Mengelola data tenant & pengunjung mall, program loyalitas, dan keluhan pelanggan secara terpusat.</textarea></div>
      <div class="field full"><label>Entitas data yang akan disimpan</label><div class="chips">${['customer', 'vendor', 'employee', 'tenant_contract', 'loyalty_point', 'complaint_ticket'].map((x, i) => `<label class="chip" style="display:inline-flex;align-items:center;gap:5px"><input type="checkbox" name="ent" value="${x}" ${i === 0 || i > 2 ? 'checked' : ''}>${x}</label>`).join('')}</div><span class="hint">Dicek ke SEDDI: POST /api/v1/arb/screen-redundancy (prinsip M1)</span></div>
      <div class="field full"><label>Rencana software</label><select class="select"><option>Bangun baru (scaffold via GSE)</option><option>Beli / SaaS</option><option>Perluas platform bersama eksisting</option></select></div>
    </div><div class="row mt"><button class="btn pri" type="submit">✦ Jalankan Pre-Screening MIND</button><span class="small muted">Status awal tiket: SUBMITTED</span></div></form>`)}
    <div id="arb-result">${card('Hasil Pre-Screening', '<div class="empty"><div class="big">✦</div>MIND AI akan mencocokkan kapabilitas dengan portofolio aplikasi eksisting dan memeriksa kepatuhan Satu Data Korporasi.</div>')}</div></div>`;
  }
  A.arbScreen = (e) => {
    e.preventDefault(); if (!A.can('eaw.arb.submit')) return A.deny('eaw.arb.submit');
    const f = new FormData(e.target); const ents = f.getAll('ent'); const masters = ents.filter((x) => ['customer', 'vendor', 'employee'].includes(x));
    A.$('#arb-result').innerHTML = card('Hasil Pre-Screening', '<div class="empty"><div class="big">⟳</div>Menganalisis 19 aplikasi & 7 domain master…</div>');
    setTimeout(() => {
      const score = masters.length ? 78 : 34;
      A.$('#arb-result').innerHTML = card('Hasil Pre-Screening', `<div class="row"><div style="font-size:40px;font-weight:800;color:${score >= 75 ? 'var(--err)' : 'var(--ok)'}">${score}%</div><div class="small">skor kemiripan<br>tertinggi vs portofolio</div></div>
        <div class="stack mt small">${Chart.hbar('FORGE (CRM)', score, 100, { color: 'var(--err)', target: 75, fmt: (v) => v + '%' })}${Chart.hbar('VANGUARD', 22, 100, { color: 'var(--d2)', target: 75, fmt: (v) => v + '%' })}${Chart.hbar('PULSE', 8, 100, { color: 'var(--d2)', target: 75, fmt: (v) => v + '%' })}</div>
        ${masters.length ? `<div class="callout err mt"><span class="ic">⛔</span><div><b>Melanggar Prinsip Satu Data Korporasi.</b> ${masters.map((m) => `Master <code>${m}</code> sudah dikelola kanonikal di SEDDI (rule M1).`).join(' ')} Aplikasi wajib mengintegrasikan master dari SEDDI via API — usulan otomatis ditolak.</div></div><pre class="code mt-s">{ "violations": [${masters.map((m) => `\n  { "entity": "${m}", "rule": "M1",\n    "message": "Master ${m} sudah dikelola kanonikal di SEDDI. Dilarang membuat tabel lokal." }`).join(',')}\n] }</pre>` : ''}
        ${score >= 75 ? '<div class="callout warn mt"><span class="ic">→</span><div><b>Rekomendasi MIND:</b> manfaatkan PANRITA-B-LINK FORGE (modul loyalitas) — zero capex baru.</div></div>' : ''}
        <div class="row mt"><button class="btn" onclick="App.toast('Draf disimpan','','info')">Simpan draf</button><button class="btn pri" onclick="App.toast('Tiket ARB-2026-0029 diajukan','Masuk antrean evaluasi Domain Architects','success');App.tab('arb','sidang')">Ajukan tetap ke ARB</button></div>`, { meta: 'POST /api/v1/arb/screen-redundancy · 320ms' });
    }, 900);
  };
  A.arbDetail = (no) => {
    const a = D.ARB.find((x) => x.no === no); const stages = ['Pengajuan', 'Pre-screening MIND', 'Evaluasi Domain', 'Sidang ARB', 'Putusan'];
    A.openDrawer(`<div class="drawer-hd"><div><div class="row"><span class="mono small">${a.no}</span>${arbBadge(a.status)}</div><h2 class="mt-s">${esc(a.name)}</h2><p class="small muted">${esc(A.ent(a.entity).nama)} · diajukan ${a.by} · ${a.date}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><div class="steps">${stages.map((s, i) => `<div class="step ${i < a.step ? 'done' : i === a.step ? 'on' : ''}"><b>${i + 1}</b>${s}</div>`).join('')}</div>
      <div class="grid g3">${A.kpi('Estimasi biaya', A.idr(a.cost))}${A.kpi('Skor redundansi', `<span style="color:${a.score >= 75 ? 'var(--err)' : 'var(--ok)'}">${a.score}%</span>`, { tgt: 'ambang ≥ 75%' })}${A.kpi('Duplikasi', a.dup ? `<span style="font-size:14px">${esc(a.dup)}</span>` : '—')}</div>
      ${a.violations.length ? `<div class="callout err mt"><span class="ic">⛔</span><div>${a.violations.map((v) => `<b>${v.rule}</b> · ${esc(v.message)}`).join('<br>')}</div></div>` : ''}
      <h3 class="mt">Evaluasi 6 Domain</h3><div class="stack mt-s small">${D.DOMAINS.map((d, i) => { const st = a.status === 'APPROVED' ? 'ok' : i === 1 && a.violations.length ? 'err' : i < a.step + 1 ? 'ok' : 'wait'; return `<div class="row"><i class="dom-dot" style="background:${d.color}"></i><span style="flex:1">${d.nama}</span>${st === 'ok' ? A.pill('sesuai', 'b-ok') : st === 'err' ? A.pill('pelanggaran', 'b-err') : A.pill('menunggu', '')}</div>`; }).join('')}</div>
      <h3 class="mt">Catatan ARB</h3><p class="small mt-s">${esc(a.notes)}</p>${a.cert ? `<div class="callout ok mt"><span class="ic">✓</span>Sertifikat <b class="mono">${a.cert}</b> terbit · Gate AF-06 terbuka.</div>` : ''}
      ${['SUBMITTED', 'IN_REVIEW', 'REVISION'].includes(a.status) ? `<div class="field mt"><label>Catatan putusan</label><textarea class="textarea" id="arb-note" placeholder="Catatan teknis untuk SBU…"></textarea></div>` : ''}</div>
      ${['SUBMITTED', 'IN_REVIEW', 'REVISION'].includes(a.status) ? `<div class="drawer-ft">${A.lockBtn('eaw.arb.review', 'Teruskan ke Sidang', `App.arbDecide('${a.no}','IN_REVIEW')`, 'btn')}${A.lockBtn('eaw.arb.approve', 'Butuh Revisi', `App.arbDecide('${a.no}','REVISION')`, 'btn')}${A.lockBtn('eaw.arb.approve', 'Tolak', `App.arbDecide('${a.no}','REJECTED')`, 'btn danger')}${A.lockBtn('eaw.arb.approve', 'Setujui & Terbitkan Sertifikat', `App.arbDecide('${a.no}','APPROVED')`, 'btn pri')}</div>` : ''}`);
  };
  A.arbDecide = (no, st) => { const a = D.ARB.find((x) => x.no === no); a.status = st; a.step = st === 'IN_REVIEW' ? 3 : st === 'REVISION' ? 3 : 5; if (st === 'APPROVED') a.cert = 'CLR-' + no.slice(4) + '-SAORAJA'; const n = A.$('#arb-note'); if (n && n.value) a.notes = n.value; A.toast('Putusan tercatat', `${no} → ${ARBST[st][0]}${a.cert && st === 'APPROVED' ? ' · sertifikat ' + a.cert : ''}`, st === 'REJECTED' ? 'warning' : 'success'); A.route(); A.arbDetail(no); };
  A.certView = (no) => { const a = D.ARB.find((x) => x.no === no); A.openModal(`<div class="drawer-hd"><h2>Sertifikat Architecture Clearance</h2><button class="x" onclick="App.closeAll()">×</button></div><div class="drawer-bd"><div style="border:3px double var(--accent);border-radius:12px;padding:28px;text-align:center;background:var(--surface-2)"><div class="brand-mark" style="margin:0 auto;width:48px;height:48px;font-size:22px">S</div><div class="tiny muted mt" style="letter-spacing:.2em">SAORAJA · ARCHITECTURE REVIEW BOARD</div><h1 class="mt-s">Architecture Clearance</h1><p class="mt">Diberikan kepada inisiatif</p><h2 class="mt-s">${esc(a.name)}</h2><p class="small muted">${esc(A.ent(a.entity).nama)}</p><div class="row mt" style="justify-content:center"><span class="tag">${a.cert}</span><span class="tag">${a.no}</span><span class="tag">${a.date}</span></div><p class="small mt">${esc(a.notes)}</p><p class="tiny faint mt">Ditandatangani digital oleh ROLE_EAP_ARB_CHAIR · tercatat di eaw.arb_clearances & eaw.workflow</p></div></div><div class="drawer-ft"><button class="btn" onclick="window.print()">Cetak</button><button class="btn pri" onclick="App.closeAll()">Tutup</button></div>`); };

  /* ================= 1.9 Roadmap ================= */
  P['eaw/roadmap'] = () => ({
    html: pageHd('Peta Rencana & Roadmap', 'Master IT Roadmap transformasi digital dan pelacak milestone (FR-04.1). Bulan berjalan: Bulan 6 — Fase 2.', A.lockBtn('eaw.model.write', '+ Milestone', "App.toast('Milestone baru','','info')", 'btn pri')) +
      card('Gantt Fase 0–3 (Bulan 1–12)', `<div style="overflow-x:auto"><div class="gantt"><div class="gh" style="text-align:left">Fase</div>${Array.from({ length: 12 }, (_, i) => `<div class="gh" style="${i === 5 ? 'background:var(--accent-soft);color:var(--accent-text)' : ''}">B${i + 1}</div>`).join('')}
        ${D.ROADMAP.map((r) => `<div class="gl">${esc(r.fase)}</div>${Array.from({ length: 12 }, (_, i) => i + 1 === r.from ? `<div class="gb" style="grid-column:span ${r.to - r.from + 1};padding:0 4px"><div class="gbar" style="background:${r.color}">${r.items[0]} …</div></div>` : i + 1 > r.from && i + 1 <= r.to ? '' : '<div class="gb"></div>').join('')}`).join('')}</div></div>`, { flush: false }) +
      `<div class="grid g-2-1 mt">${card('Deliverable per Fase', `<div class="grid g2">${D.ROADMAP.map((r) => `<div><div class="row"><i class="dom-dot" style="background:${r.color}"></i><b>${esc(r.fase)}</b></div><ul class="small" style="margin:6px 0 0;padding-left:20px">${r.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>`)}
      ${card('Pelacak Milestone', `<div class="list">${D.MILESTONES.map((m) => `<div class="li"><span class="ic" style="background:${m.s === 'done' ? 'var(--ok-soft)' : m.s === 'cur' ? 'var(--accent-soft)' : 'var(--surface-3)'}">${m.s === 'done' ? '✓' : m.s === 'cur' ? '◐' : '○'}</span><div class="bd"><div class="t">${esc(m.m)}</div><div class="d">Bulan ${m.b}</div></div></div>`).join('')}</div>`, { flush: true })}</div>`,
  });

  /* ================= 1.10 ADR ================= */
  const adrCls = { Proposed: 'b-info', Accepted: 'b-ok', Deprecated: 'b-warn', Superseded: '' };
  P['eaw/adr'] = () => {
    const f = T.adrf || 'all';
    return {
      html: pageHd('Architecture Decision Records', 'Register keputusan berversi Git (D-01 s/d D-14 sejak Fase 0, plus ADR-CMP & ADR-EAP). Status: Proposed, Accepted, Deprecated, Superseded (EAW-04). Disimpan sebagai Markdown di repo eap.', A.lockBtn('eaw.adr.write', '+ ADR Baru', 'App.adrForm()', 'btn pri')) +
        `<div class="grid g-2-1"><div>${card('', `<div class="toolbar"><div class="search"><input class="input" placeholder="Cari ADR…" oninput="App.filterRows(this,'#tbl-adr')"></div><div class="chips">${['all', 'Proposed', 'Accepted', 'Deprecated', 'Superseded'].map((s) => `<button class="chip ${f === s ? 'on' : ''}" onclick="App.tab('adrf','${s}')">${s === 'all' ? 'Semua' : s}</button>`).join('')}</div></div><div id="tbl-adr">` + table([{ h: 'Kode', v: (r) => `<b class="mono">${r.code}</b>` }, { h: 'Aspek', v: (r) => esc(r.aspek) }, { h: 'Keputusan', v: (r) => esc(r.title) }, { h: 'Status', v: (r) => A.pill(r.status, adrCls[r.status]) }, { h: 'Git', v: (r) => `<code class="tiny">${r.git}</code>` }], D.ADR.filter((a) => f === 'all' || a.status === f), { click: (r) => `App.adrView('${r.code}')` }) + '</div>', { flush: true })}</div>
        ${card('Keputusan Terkunci SAF (AF-01 – AF-08)', `<div class="list">${D.AF.map(([c, t]) => `<div class="li"><span class="tag">${c}</span><div class="bd small">${esc(t)}</div><span class="badge b-ok nodot">🔒</span></div>`).join('')}</div>`, { flush: true })}</div>`,
    };
  };
  A.adrView = (c) => { const a = D.ADR.find((x) => x.code === c); A.openDrawer(`<div class="drawer-hd"><div><div class="row"><span class="tag">${a.code}</span>${A.pill(a.status, adrCls[a.status])}</div><h2 class="mt-s">${esc(a.title)}</h2><p class="small muted">${esc(a.aspek)} · ${a.date}</p></div><button class="x" onclick="App.closeAll()">×</button></div><div class="drawer-bd"><h3>Konteks</h3><p class="small mt-s">Kebutuhan ${esc(a.aspek.toLowerCase())} yang konsisten di seluruh ekosistem KEIS dan lini PANRITA.</p><h3 class="mt">Keputusan</h3><p class="small mt-s"><b>${esc(a.title)}</b></p><h3 class="mt">Rasional & Konsekuensi</h3><p class="small mt-s">${esc(a.why)}</p><h3 class="mt">Elemen model tertaut (EAW-01)</h3><div class="row mt-s">${tag('SAORAJA-EAP')}${tag('KRA-APL-001')}${tag('FW-HK-01')}</div><h3 class="mt">Berkas Git</h3><pre class="code mt-s"><span class="c"># ${a.git}</span>\n<span class="k">---</span>\nid: ${a.code}\nstatus: ${a.status}\ndate: ${a.date}\n<span class="k">---</span>\n# ${esc(a.title)}</pre></div><div class="drawer-ft">${A.lockBtn('eaw.adr.write', 'Supersede', "App.toast('ADR baru dibuat','Status lama → Superseded; commit ke repo eap','success')", 'btn')}${A.lockBtn('eaw.adr.write', 'Deprecate', "App.toast('ADR ditandai Deprecated','commit ke repo eap','warning')", 'btn')}</div>`); };
  A.adrForm = () => A.openModal(`<div class="drawer-hd"><h2>ADR Baru</h2><button class="x" onclick="App.closeAll()">×</button></div><div class="drawer-bd"><div class="form-grid"><div class="field"><label>Kode</label><input class="input" value="ADR-EAP-016"></div><div class="field"><label>Status</label><select class="select"><option>Proposed</option><option>Accepted</option></select></div><div class="field full"><label>Judul</label><input class="input" placeholder="Keputusan…"></div><div class="field full"><label>Konteks</label><textarea class="textarea"></textarea></div><div class="field full"><label>Keputusan</label><textarea class="textarea"></textarea></div><div class="field full"><label>Konsekuensi</label><textarea class="textarea"></textarea></div></div></div><div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="App.closeAll();App.toast('ADR tersimpan','Commit eap/docs/adr/adr-eap-016.md ke feature branch','success')">Simpan & Commit</button></div>`);

  /* ================= EAW-09 Publisher ================= */
  P['eaw/publisher'] = () => ({
    html: pageHd('Penerbit Dokumen Arsitektur', 'Dokumen Arsitektur untuk Keputusan Direksi dihasilkan otomatis dari data EAW — bukan ditulis manual (AF-08). Impor CSV / Open Group Exchange tervalidasi skema 100% sebelum commit (EAW-09).') +
      `<div class="grid g-1-2">${card('Konfigurasi', `<div class="stack"><div class="field"><label>Kerangka Kerja</label><select class="select" id="pub-fw">${D.FRAMEWORKS.map((f) => `<option value="${f.id}">${f.id} · ${esc(f.layanan)}</option>`).join('')}</select></div>
        <div class="field"><label>Format</label><div class="chips"><label class="chip"><input type="radio" name="fmt" value="pdf" checked> PDF</label><label class="chip"><input type="radio" name="fmt" value="md"> Markdown</label></div></div>
        <div class="field"><label>Isi dokumen</label>${['6 domain arsitektur', 'Diagram ArchiMate', 'Matriks relasi', 'Skor IKA & kelengkapan', 'ADR tertaut', 'Lampiran kontrol keamanan'].map((x) => `<label class="small row" style="gap:6px"><input type="checkbox" checked>${x}</label>`).join('')}</div>
        ${A.lockBtn('eaw.publish.run', '⇩ Terbitkan Dokumen', 'App.publish()', 'btn pri')}</div>
        <hr style="border:0;border-top:1px solid var(--border);margin:16px 0"><h3>Impor</h3><div class="mt-s" style="border:2px dashed var(--border-strong);border-radius:10px;padding:20px;text-align:center" class="small muted">Tarik berkas <b>.csv</b> atau <b>.xml</b> (Open Group Exchange)<br><button class="btn sm mt-s" onclick="App.toast('Validasi impor','48 baris valid · 2 ditolak (kolom pii tanpa klasifikasi) — tidak di-commit','warning')">Pilih berkas</button></div>`)}
      ${card('Pratinjau', `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:24px;font-size:13px;line-height:1.7"><div class="tiny muted">KEIS-EAP-DOC-FW-HK-01 · dihasilkan ${new Date().toLocaleDateString('id-ID')}</div><h2 class="mt-s">Dokumen Arsitektur — Penjualan Kendaraan (PT Hadji Kalla)</h2>
        <ol style="padding-left:20px"><li><b>Ringkasan Eksekutif</b> — IKA 2,9 · status Divalidasi</li><li><b>Domain 1 Proses Bisnis</b> — 6 proses (L1–L3)</li><li><b>Domain 2 Data & Informasi</b> — 5 entitas; SoR kalla_cmp.mdm</li><li><b>Domain 3 Layanan</b> — 3 layanan pelanggan & mitra</li><li><b>Domain 4 Aplikasi</b> — ASI (FEDERATED_REMOTE), SEDDI</li><li><b>Domain 5 Infrastruktur</b> — K8s Prod Makassar, PostgreSQL HA</li><li><b>Domain 6 Keamanan</b> — 3 kontrol, 5 aspek</li><li><b>Diagram ArchiMate</b> & <b>Matriks Relasi</b></li><li><b>Lampiran</b> — ADR D-01, D-07, D-14</li></ol></div><div id="pub-prog" class="mt"></div>`)}</div>`,
  });
  A.publish = () => { const el = A.$('#pub-prog'); let p = 0; const iv = setInterval(() => { p += 20; el.innerHTML = `<div class="progress"><i style="width:${p}%"></i></div><div class="tiny muted mt-s">${['Mengambil objek 6 domain…', 'Merender diagram…', 'Menyusun matriks relasi…', 'Menghitung IKA…', 'Menyusun dokumen…'][p / 20 - 1] || ''}</div>`; if (p >= 100) { clearInterval(iv); const fw = A.$('#pub-fw').value; const md = `# Dokumen Arsitektur — ${fw}\n\n> Dihasilkan otomatis dari SAORAJA EAW (AF-08) · ${A.now()}\n\n## 1. Proses Bisnis\n## 2. Data & Informasi\n## 3. Layanan\n## 4. Aplikasi\n## 5. Infrastruktur\n## 6. Keamanan\n`; download(`dokumen-arsitektur-${fw}.md`, md, 'text/markdown'); A.toast('Dokumen terbit', `dokumen-arsitektur-${fw} · tersimpan di shared.documents`, 'success'); } }, 280); };

  function download(name, text, type) { const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  A.download = download;
})();
