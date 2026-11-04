/* =====================================================================
   SAORAJA EAP — Kanvas ArchiMate (EAW-01) dan Penerbit Dokumen Arsitektur (EAW-09/AF-08), mode live. Terhubung ke /api/v1/eaw/diagrams dan /eaw/publisher|publications.
   Kanvas: node dapat TERIKAT ke objek EAW nyata, impor dari model, sinkron relasi gambar → eaw.relation, ekspor SVG / Open Group Exchange XML.
   Penerbit: dokumen dihasilkan server dari data EAW (hanya baseline), versi + sha256, append-only. Dipasang oleh live.js (LiveModel.install).
   ===================================================================== */
window.LiveModel = (function () {
  let A, API, D, fail;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errBox = (e) => (e.status === 403 ? '<div class="callout warn"><span class="ic">🔒</span><div>Peran Anda tidak memiliki izin untuk halaman ini (403 dari API).</div></div>' : `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`);
  const LAYER = { s: ['Strategy', '#F5DEAA'], b: ['Business', '#FFFFB5'], a: ['Application', '#B5FFFF'], t: ['Technology', '#C9E7B7'], p: ['Physical', '#C9E7B7'], m: ['Motivation', '#CCCCFF'], i: ['Implementation', '#FFE0E0'] };
  const LANE = { s: 0, m: 0, b: 1, a: 2, t: 3, p: 3, i: 3 }; const NW = 150, NH = 50;
  const dl = async (path, name) => {
    try { if (window.Oidc && Oidc.enabled()) await Oidc.ensureFresh(); const r = await fetch(API.base() + path, { headers: { Authorization: 'Bearer ' + API.token() } }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); } catch (e) { fail(e); }
  };

  /* ================= Kanvas ================= */
  const CV = { meta: null, list: [], dg: null, etag: null, sel: null, selEdge: null, connect: null, dirty: false, validation: null, objs: {}, newEdgeType: 'association' };
  const OBJ_PATH = { application: 'applications', service: 'objects/services', process: 'objects/processes', data_entity: 'objects/data-entities', infra_asset: 'objects/infra-assets', control: 'objects/controls' };
  const elOf = (t) => CV.meta.elements.find((e) => e.type === t);
  const layerOf = (t) => (elOf(t) || {}).layer || 'a';
  const nodeById = (id) => CV.dg.content.nodes.find((n) => n.id === id);
  const uid = (p) => p + Math.random().toString(36).slice(2, 8);
  const dirty = () => { CV.dirty = true; };

  async function loadObjs(type) {
    if (CV.objs[type]) return CV.objs[type];
    const rows = await API.all('/api/v1/eaw/' + OBJ_PATH[type]); CV.objs[type] = rows.map((o) => ({ id: o.id, label: o.kode ? `${o.kode} · ${o.nama}` : (o.nama || o.namaKanonikal || o.aspek) }));
    return CV.objs[type];
  }
  function svgHtml() {
    const c = CV.dg.content; const byId = new Map(c.nodes.map((n) => [n.id, n]));
    const maxX = Math.max(820, ...c.nodes.map((n) => n.x + NW + 40)); const maxY = Math.max(580, ...c.nodes.map((n) => n.y + NH + 40));
    const lanes = [['s', 0], ['b', 1], ['a', 2], ['t', 3]].map(([k, r]) => `<rect x="6" y="${r * 140 + 6}" width="${maxX - 12}" height="130" rx="8" fill="${LAYER[k][1]}" opacity=".16"/><text class="lane-lbl" x="14" y="${r * 140 + 20}">${k === 's' ? 'Strategy / Motivation' : LAYER[k][0] + (k === 't' ? ' / Physical' : '')}</text>`).join('');
    const edges = c.edges.map((e) => { const a = byId.get(e.source), b = byId.get(e.target); const mx = (a.x + b.x + NW) / 2, my = (a.y + b.y + NH) / 2; const sel = e.id === CV.selEdge;
      return `<g class="aedge" data-id="${esc(e.id)}"><line x1="${a.x + NW / 2}" y1="${a.y + NH / 2}" x2="${b.x + NW / 2}" y2="${b.y + NH / 2}" stroke="${sel ? 'var(--accent)' : 'var(--muted)'}" stroke-width="${sel ? 2.4 : 1.4}" ${['access', 'flow', 'influence'].includes(e.type) ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#am)"/>
        <text x="${mx}" y="${my - 4}" font-size="9" text-anchor="middle" style="fill:var(--text);cursor:pointer">${esc(e.type)}${e.relationId ? ' ●' : ''}</text></g>`; }).join('');
    const nodes = c.nodes.map((n) => { const l = LAYER[layerOf(n.type)][1]; const lbl = elOf(n.type).label;
      return `<g class="anode ${n.id === CV.sel ? 'sel' : ''}" data-id="${esc(n.id)}" transform="translate(${n.x},${n.y})"><rect width="${NW}" height="${NH}" rx="${/Process|Service|Function|Capability/.test(n.type) ? 14 : 4}" fill="${l}" stroke="${n.id === CV.connect ? 'var(--accent)' : '#555'}" stroke-width="${n.id === CV.sel || n.id === CV.connect ? 2.4 : 1}"/>
        <text x="8" y="14" style="font-size:9px;fill:#555">«${esc(lbl)}»${n.objectId ? ' ●' : ''}</text><text x="${NW / 2}" y="34" text-anchor="middle" style="font-size:12px;font-weight:600;fill:#111">${esc(n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label)}</text></g>`; }).join('');
    return `<svg id="cv-svg" viewBox="0 0 ${maxX} ${maxY}" width="${maxX}" height="${maxY}"><defs><marker id="am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>${lanes}${edges}${nodes}</svg>`;
  }
  async function inspectorHtml() {
    const c = CV.dg.content; const n = CV.sel && nodeById(CV.sel); const e = CV.selEdge && c.edges.find((x) => x.id === CV.selEdge);
    const loc = c.nodes.filter((x) => !c.edges.some((ed) => ed.source === x.id || ed.target === x.id));
    let body = '<p class="small muted">Pilih elemen atau relasi di kanvas.</p>';
    if (n) {
      const bindTypes = Object.entries(CV.meta.bindable).filter(([, ts]) => ts.includes(n.type)).map(([k]) => k);
      const opts = n.objectType ? await loadObjs(n.objectType).catch(() => []) : [];
      body = `<div class="field mt-s"><label>Nama</label><input class="input" value="${esc(n.label)}" oninput="App.cvLabel(this.value)"></div>
        <div class="field"><label>Tipe elemen</label><select class="select" onchange="App.cvType(this.value)">${CV.meta.elements.map((x) => `<option value="${x.type}" ${x.type === n.type ? 'selected' : ''}>${esc(LAYER[x.layer][0])} · ${esc(x.label)}</option>`).join('')}</select></div>
        <h3 class="mt">Ikatan ke objek EAW</h3>${n.objectId ? `<div class="small mt-s">${A.pill('terikat', 'b-ok')} ${esc((opts.find((o) => o.id === n.objectId) || {}).label || n.objectId.slice(0, 8))} <span class="tag">${esc(n.objectType)}</span></div><button class="btn sm mt-s" onclick="App.cvUnbind()">Lepas ikatan</button>`
          : bindTypes.length ? `<div class="row mt-s"><select class="select" id="cv-bt">${bindTypes.map((t) => `<option>${t}</option>`).join('')}</select><button class="btn sm" onclick="App.cvBindLoad()">Pilih…</button></div><div id="cv-bsel" class="mt-s"></div>` : '<p class="tiny muted mt-s">Tipe ini tidak mewakili objek EAW.</p>'}
        <button class="btn sm danger mt" onclick="App.cvDelNode()">Hapus elemen</button>`;
    } else if (e) {
      const s = nodeById(e.source), t = nodeById(e.target);
      body = `<div class="small mt-s"><b>${esc(s.label)}</b> → <b>${esc(t.label)}</b></div><div class="field mt-s"><label>Tipe relasi</label><select class="select" onchange="App.cvEdgeType(this.value)">${CV.meta.relations.map((r) => `<option ${r === e.type ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="small mt-s">${e.relationId ? A.pill('tersinkron ke eaw.relation', 'b-ok') : A.pill('hanya di gambar', '')}</div><button class="btn sm danger mt" onclick="App.cvDelEdge()">Hapus relasi</button>`;
    }
    const warn = (CV.validation && CV.validation.warnings) || loc.map((x) => `Elemen "${x.label}" tidak memiliki relasi (AC-3).`);
    return `<h3>Inspector</h3>${body}<h3 class="mt">Validasi metamodel</h3><div class="stack small mt-s">${warn.length ? warn.slice(0, 8).map((w) => `<div class="callout warn" style="padding:8px"><span>⚠</span><div>${esc(w)}</div></div>`).join('') + (warn.length > 8 ? `<div class="tiny muted">+${warn.length - 8} lainnya</div>` : '') : '<div class="callout ok" style="padding:8px"><span>✓</span><div>Tidak ada peringatan.</div></div>'}</div>`;
  }
  async function refresh() { const cv = document.getElementById('cv'), ins = document.getElementById('cv-insp'); if (!cv) return; cv.innerHTML = svgHtml(); ins.innerHTML = await inspectorHtml(); bind(); const st = document.getElementById('cv-state'); if (st) st.textContent = CV.dirty ? '● belum disimpan' : '✓ tersimpan'; }
  function bind() {
    const svg = document.getElementById('cv-svg'); if (!svg) return; let drag = null, off = [0, 0], moved = false;
    const pt = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    svg.querySelectorAll('.anode').forEach((g) => g.addEventListener('pointerdown', (e) => {
      const n = nodeById(g.dataset.id);
      if (CV.connect && CV.connect !== n.id) { const src = CV.connect; CV.connect = null; if (!CV.dg.content.edges.some((x) => x.source === src && x.target === n.id && x.type === CV.newEdgeType)) { CV.dg.content.edges.push({ id: uid('e'), source: src, target: n.id, type: CV.newEdgeType }); dirty(); } CV.sel = n.id; CV.selEdge = null; refresh(); return; }
      CV.sel = n.id; CV.selEdge = null; drag = n; moved = false; const p = pt(e); off = [p.x - n.x, p.y - n.y]; g.setPointerCapture(e.pointerId);
    }));
    svg.querySelectorAll('.aedge text').forEach((t) => t.addEventListener('pointerdown', () => { CV.selEdge = t.parentNode.dataset.id; CV.sel = null; refresh(); }));
    svg.addEventListener('pointermove', (e) => { if (!drag) return; const p = pt(e); drag.x = Math.max(8, Math.round(p.x - off[0])); drag.y = Math.max(8, Math.round(p.y - off[1])); moved = true; document.getElementById('cv').innerHTML = svgHtml(); bind(); });
    svg.addEventListener('pointerup', () => { if (drag) { if (moved) dirty(); drag = null; refresh(); } });
  }
  async function openDiagram(id) {
    const r = await API.getWithEtag(`/api/v1/eaw/diagrams/${id}`); CV.dg = r.data; CV.etag = r.etag; CV.sel = null; CV.selEdge = null; CV.connect = null; CV.dirty = false; CV.validation = r.data.validation;
  }
  async function kanvasMount() {
    const box = document.getElementById('cv-body'); if (!box) return;
    try {
      if (!CV.meta) CV.meta = await API.get('/api/v1/eaw/diagrams/meta');
      CV.list = (await API.get('/api/v1/eaw/diagrams')).data;
      if (CV.dg && !CV.list.some((d) => d.id === CV.dg.id)) CV.dg = null;
      if (!CV.dg && CV.list.length) await openDiagram(CV.list[0].id);
      const can = A.can('eaw.model.write');
      if (!CV.dg) { box.innerHTML = A.card('', `<div class="empty"><div class="big">▣</div>Belum ada diagram. ${can ? '<br><button class="btn pri mt-s" onclick="App.cvNew()">+ Diagram baru</button>' : ''}</div>`); return; }
      const pal = Object.entries(LAYER).map(([k, [nm]]) => `<div class="nav-group" style="padding-left:2px">${nm}</div>${CV.meta.elements.filter((e) => e.layer === k).map((e) => `<div class="pi" onclick="App.cvAdd('${e.type}')"><span class="sw" style="background:${LAYER[k][1]}"></span>${esc(e.label)}</div>`).join('')}`).join('');
      box.innerHTML = `<div class="row mb" style="flex-wrap:wrap;gap:8px"><select class="select" onchange="App.cvSwitch(this.value)">${CV.list.map((d) => `<option value="${d.id}" ${d.id === CV.dg.id ? 'selected' : ''}>${esc(d.nama)} (${esc(d.entityCode)})</option>`).join('')}</select><span class="small muted" id="cv-state">✓ tersimpan</span>
        ${can ? `<button class="btn" onclick="App.cvNew()">+ Baru</button><button class="btn pri" onclick="App.cvSave()">💾 Simpan</button><button class="btn" onclick="App.cvImport()">⇩ Impor dari model</button><button class="btn" onclick="App.cvSync()">⇄ Sinkron ke model</button><select class="select" style="max-width:130px" onchange="App.cvEt(this.value)">${CV.meta.relations.map((r) => `<option ${r === CV.newEdgeType ? 'selected' : ''}>${r}</option>`).join('')}</select><button class="btn" id="cv-conn" onclick="App.cvConnect()">⤳ Hubungkan</button>` : ''}
        <button class="btn" onclick="App.cvSvgDl()">⇩ SVG</button><button class="btn" onclick="App.cvXml()">⇩ Exchange XML</button>${can ? '<button class="btn danger" onclick="App.cvDelDiagram()">Hapus diagram</button>' : ''}</div>
        <div class="card canvas-wrap"><div class="palette">${can ? pal : '<p class="small muted">Read-only</p>'}</div><div class="cv" id="cv" style="overflow:auto"></div><div class="inspector" id="cv-insp"></div></div>
        <p class="tiny muted mt-s">Seret elemen · klik palet untuk menambah · “Hubungkan”: pilih tipe, klik elemen sumber lalu target · ● = terikat ke objek/relasi EAW. Entitas: ${esc(CV.dg.entityCode)} · ${CV.dg.content.nodes.length} elemen, ${CV.dg.content.edges.length} relasi.</p>`;
      await refresh();
    } catch (e) { box.innerHTML = errBox(e); }
  }
  const putDiagram = async () => {
    const r = await API.put(`/api/v1/eaw/diagrams/${CV.dg.id}`, { content: CV.dg.content }, { ifMatch: CV.etag });
    return r;
  };

  /* ================= Penerbit ================= */
  const PB = { scopeType: 'entity', entityId: null, frameworkId: null, format: 'html', includeDraft: false, frameworks: [], preview: null };
  async function publisherMount() {
    const box = document.getElementById('pb-body'); if (!box) return;
    try {
      if (!PB.entityId) PB.entityId = (D.ENTITIES.find((e) => e.tingkat === 'holding') || D.ENTITIES[0] || {}).uuid;
      PB.frameworks = (await API.all('/api/v1/eaw/objects/frameworks').catch(() => []));
      if (!PB.frameworkId && PB.frameworks[0]) PB.frameworkId = PB.frameworks[0].id;
      const scopeKey = PB.scopeType === 'framework' ? PB.frameworkId : PB.entityId;
      const hist = scopeKey ? (await API.get('/api/v1/eaw/publications', { scopeKey })).data : [];
      const can = A.can('eaw.document.approve'); const pv = PB.preview;
      box.innerHTML = `<div class="grid g-1-2">${A.card('Konfigurasi', `<div class="stack"><div class="field"><label>Cakupan</label><div class="chips"><label class="chip"><input type="radio" name="pbs" ${PB.scopeType === 'entity' ? 'checked' : ''} onchange="App.pbSet('scopeType','entity')"> Entitas (+ turunan)</label><label class="chip"><input type="radio" name="pbs" ${PB.scopeType === 'framework' ? 'checked' : ''} onchange="App.pbSet('scopeType','framework')"> Kerangka Kerja</label></div></div>
          ${PB.scopeType === 'entity' ? `<div class="field"><label>Entitas</label><select class="select" onchange="App.pbSet('entityId',this.value)">${D.ENTITIES.map((e) => `<option value="${esc(e.uuid)}" ${e.uuid === PB.entityId ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}</select></div>`
          : `<div class="field"><label>Kerangka Kerja</label><select class="select" onchange="App.pbSet('frameworkId',this.value)">${PB.frameworks.map((f) => `<option value="${f.id}" ${f.id === PB.frameworkId ? 'selected' : ''}>${esc(f.layananUtama)} (${esc(f.entityCode)})</option>`).join('') || '<option value="">— belum ada kerangka —</option>'}</select></div>`}
          <div class="field"><label>Format</label><div class="chips"><label class="chip"><input type="radio" name="pbf" ${PB.format === 'html' ? 'checked' : ''} onchange="App.pbSet('format','html')"> HTML (cetak ke PDF)</label><label class="chip"><input type="radio" name="pbf" ${PB.format === 'markdown' ? 'checked' : ''} onchange="App.pbSet('format','markdown')"> Markdown</label></div></div>
          <label class="small row" style="gap:6px"><input type="checkbox" ${PB.includeDraft ? 'checked' : ''} onchange="App.pbSet('includeDraft',this.checked)"> Pratinjau termasuk objek non-baseline (tidak dapat diterbitkan)</label>
          <div class="row"><button class="btn" onclick="App.pbPreview()">👁 Pratinjau</button>${A.lockBtn('eaw.document.approve', '⇧ Terbitkan resmi', 'App.pbPublish()', 'btn pri')}</div>
          ${pv ? `<div class="small">${pv.canPublish ? A.pill('siap terbit', 'b-ok') : A.pill('belum dapat terbit', 'b-err')} versi berikutnya: <b>v${pv.nextVersion}</b> · ${pv.counts.total} objek · ${pv.counts.relations} relasi · ${pv.counts.diagrams} diagram</div>${pv.blockers.length ? `<div class="stack small">${pv.blockers.map((b) => `<div class="callout ${b.startsWith('Pratinjau') ? 'info' : 'err'}" style="padding:8px"><span>${b.startsWith('Pratinjau') ? 'ℹ' : '✕'}</span><div>${esc(b)}</div></div>`).join('')}</div>` : ''}
            ${pv.warnings.length ? `<h3>Catatan kelengkapan (${pv.warnings.length})</h3><ul class="small" style="padding-left:18px;max-height:180px;overflow:auto">${pv.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}` : '<p class="tiny muted">Klik Pratinjau untuk melihat dokumen yang akan dihasilkan. Dokumen resmi hanya memuat objek berstatus Ditetapkan/Dipublikasi/Direviu dan disusun ulang di server saat terbit.</p>'}</div>`)}
          <div class="stack">${A.card('Pratinjau', pv ? (pv.format === 'html' ? `<iframe id="pb-frame" sandbox title="Pratinjau dokumen" style="width:100%;height:62vh;border:1px solid var(--border);border-radius:8px;background:#fff"></iframe>` : `<pre class="code" style="max-height:62vh">${esc(pv.content)}</pre>`) : '<div class="empty"><div class="big">📄</div>Belum ada pratinjau.</div>', { flush: !!pv })}
          ${A.card('Riwayat terbit (append-only)', hist.length ? A.table([{ h: 'Versi', v: (h) => `<b>v${h.versi}</b> ${esc(h.format)}` }, { h: 'Terbit', v: (h) => `<span class="small mono">${esc(String(h.createdAt).slice(0, 19).replace('T', ' '))}</span>` }, { h: 'Objek', num: 1, v: (h) => (h.counts || {}).total ?? '—' }, { h: 'SHA-256', v: (h) => `<code class="tiny">${esc(h.sha256.slice(0, 12))}…</code>` },
            { h: '', v: (h) => `<button class="btn sm" onclick="App.pbDl('${h.id}',${h.versi},'${h.format}')">⇩</button> ${h.format === 'html' ? `<button class="btn sm" onclick="App.pbPdf('${h.id}',${h.versi})">PDF</button> ` : ''}<button class="btn sm" onclick="App.pbVerify('${h.id}')">✓ Verifikasi</button>` }], hist) : '<div class="empty small">Belum ada dokumen terbit untuk cakupan ini.</div>', { flush: true })}</div></div>`;
      if (pv && pv.format === 'html') { const f = document.getElementById('pb-frame'); if (f) f.srcdoc = pv.content; }
    } catch (e) { box.innerHTML = errBox(e); }
  }
  const pbQuery = () => ({ scopeType: PB.scopeType, entityId: PB.scopeType === 'entity' ? PB.entityId : undefined, frameworkId: PB.scopeType === 'framework' ? PB.frameworkId : undefined, format: PB.format });

  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail;
    A.PAGES['eaw/kanvas'] = () => ({ html: A.pageHd('Kanvas ArchiMate 3.2', 'Diagram tersimpan per entitas; elemen terikat ke objek EAW, impor dari model, sinkron relasi gambar ke model, ekspor SVG dan Open Group Exchange XML (EAW-01, EAW-09).') + '<div id="cv-body"><div class="small muted">Memuat…</div></div>', mount: kanvasMount });
    A.PAGES['eaw/publisher'] = () => ({ html: A.pageHd('Penerbit Dokumen Arsitektur', 'Dokumen Arsitektur untuk Keputusan Direksi dihasilkan otomatis dari data EAW — bukan ditulis manual (AF-08). Dokumen resmi memuat objek baseline, berversi, ber-sha256, dan append-only.') + '<div id="pb-body"><div class="small muted">Memuat…</div></div>', mount: publisherMount });
    // ---- kanvas
    A.cvSwitch = async (id) => { if (CV.dirty && !confirm('Perubahan belum disimpan akan hilang. Lanjutkan?')) return A.route(); try { await openDiagram(id); A.route(); } catch (e) { fail(e); } };
    A.cvNew = () => { const ents = D.ENTITIES; A.openModal(`<div class="drawer-hd"><h2>Diagram Baru</h2><button class="x" onclick="App.closeAll()">×</button></div><form class="drawer-bd" id="cvn-form" onsubmit="App.cvNewSave(event)"><div class="form-grid"><div class="field full"><label>Nama <span class="req">*</span></label><input class="input" name="nama" required></div>
      <div class="field full"><label>Entitas</label><select class="select" name="entityId">${ents.map((e) => `<option value="${esc(e.uuid)}">${esc(e.nama)}</option>`).join('')}</select></div></div><div id="cvn-err" class="mt"></div></form><div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('cvn-form').requestSubmit()">Buat</button></div>`); };
    A.cvNewSave = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { const d = await API.post('/api/v1/eaw/diagrams', f); CV.dg = null; await openDiagram(d.id); A.closeAll(); A.route(); } catch (x) { document.getElementById('cvn-err').innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(x))}</div></div>`; } };
    A.cvAdd = (type) => { const l = layerOf(type); const col = CV.dg.content.nodes.filter((n) => Math.round(n.y / 140) === LANE[l]).length; const id = uid('n'); CV.dg.content.nodes.push({ id, type, label: elOf(type).label + ' baru', x: 30 + (col % 4) * 190, y: 30 + LANE[l] * 140 + Math.floor(col / 4) * 60 }); CV.sel = id; CV.selEdge = null; dirty(); refresh(); };
    A.cvLabel = (v) => { const n = nodeById(CV.sel); if (n) { n.label = v || ' '; dirty(); document.getElementById('cv').innerHTML = svgHtml(); bind(); document.getElementById('cv-state').textContent = '● belum disimpan'; } };
    A.cvType = (t) => { const n = nodeById(CV.sel); if (n) { n.type = t; if (n.objectType && !CV.meta.bindable[n.objectType].includes(t)) { delete n.objectType; delete n.objectId; } dirty(); refresh(); } };
    A.cvEdgeType = (t) => { const e = CV.dg.content.edges.find((x) => x.id === CV.selEdge); if (e) { e.type = t; delete e.relationId; dirty(); refresh(); } };
    A.cvEt = (v) => { CV.newEdgeType = v; };
    A.cvConnect = () => { if (!CV.sel) return A.toast('Pilih elemen sumber dulu', '', 'info'); CV.connect = CV.sel; A.toast('Mode hubungkan', 'Klik elemen target.', 'info'); refresh(); };
    A.cvDelNode = () => { const id = CV.sel; CV.dg.content.nodes = CV.dg.content.nodes.filter((n) => n.id !== id); CV.dg.content.edges = CV.dg.content.edges.filter((e) => e.source !== id && e.target !== id); CV.sel = null; dirty(); refresh(); };
    A.cvDelEdge = () => { CV.dg.content.edges = CV.dg.content.edges.filter((e) => e.id !== CV.selEdge); CV.selEdge = null; dirty(); refresh(); };
    A.cvUnbind = () => { const n = nodeById(CV.sel); delete n.objectType; delete n.objectId; CV.dg.content.edges.forEach((e) => { if ((e.source === n.id || e.target === n.id) && e.relationId) delete e.relationId; }); dirty(); refresh(); };
    A.cvBindLoad = async () => { const t = document.getElementById('cv-bt').value; try { const o = await loadObjs(t); document.getElementById('cv-bsel').innerHTML = `<select class="select" onchange="App.cvBind('${t}',this.value)"><option value="">— pilih objek —</option>${o.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('')}</select>`; } catch (e) { fail(e); } };
    A.cvBind = async (t, id) => { if (!id) return; const n = nodeById(CV.sel); if (!CV.meta.bindable[t].includes(n.type)) n.type = CV.meta.defaults[t]; const o = (CV.objs[t] || []).find((x) => x.id === id); n.objectType = t; n.objectId = id; if (o) n.label = o.label.includes(' · ') ? o.label.split(' · ')[1] : o.label; dirty(); refresh(); };
    A.cvSave = async () => { try { const r = await putDiagram(); CV.dg = r; CV.etag = `"${r.version}"`; CV.validation = r.validation; CV.dirty = false; A.toast('Diagram tersimpan', `${r.validation.warnings.length} peringatan metamodel`, r.validation.warnings.length ? 'info' : 'success'); A.route(); } catch (e) { fail(e); } };
    A.cvImport = async () => {
      const types = ['application', 'service', 'process', 'data_entity', 'infra_asset', 'control'];
      A.openModal(`<div class="drawer-hd"><h2>Impor dari Model EAW</h2><button class="x" onclick="App.closeAll()">×</button></div><div class="drawer-bd"><p class="small muted">Menambahkan objek beserta objek yang berelasi dan relasinya sebagai elemen terikat. Diagram disimpan.</p><div class="form-grid"><div class="field"><label>Jenis</label><select class="select" id="imp-t" onchange="App.cvImpLoad()">${types.map((t) => `<option>${t}</option>`).join('')}</select></div><div class="field"><label>Objek</label><select class="select" id="imp-o"></select></div></div></div><div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="App.cvImpRun()">Impor</button></div>`); await A.cvImpLoad();
    };
    A.cvImpLoad = async () => { const t = document.getElementById('imp-t').value; try { const o = await loadObjs(t); document.getElementById('imp-o').innerHTML = o.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('') || '<option value="">(kosong)</option>'; } catch (e) { fail(e); } };
    A.cvImpRun = async () => { const t = document.getElementById('imp-t').value, id = document.getElementById('imp-o').value; if (!id) return; try { if (CV.dirty) await putDiagram().then((r) => { CV.etag = `"${r.version}"`; }); const r = await API.post(`/api/v1/eaw/diagrams/${CV.dg.id}/import`, { objectType: t, objectId: id }, { ifMatch: CV.etag }); CV.dg = r; CV.etag = `"${r.version}"`; CV.validation = r.validation; CV.dirty = false; A.closeAll(); A.toast('Impor selesai', `${r.imported.nodes} elemen, ${r.imported.edges} relasi`, 'success'); A.route(); } catch (e) { fail(e); } };
    A.cvSync = async () => { try { if (CV.dirty) await putDiagram().then((r) => { CV.etag = `"${r.version}"`; }); const r = await API.post(`/api/v1/eaw/diagrams/${CV.dg.id}/sync-relations`, {}, { ifMatch: CV.etag }); CV.dg = r; CV.etag = `"${r.version}"`; CV.dirty = false; A.toast(`${r.sync.created} relasi disinkron ke model`, r.sync.skipped.length ? r.sync.skipped.length + ' dilewati: ' + esc(r.sync.skipped[0].reason) : '', r.sync.created ? 'success' : 'info'); A.route(); } catch (e) { fail(e); } };
    A.cvSvgDl = () => dl(`/api/v1/eaw/diagrams/${CV.dg.id}/svg`, 'diagram.svg'); A.cvXml = () => dl(`/api/v1/eaw/diagrams/${CV.dg.id}/exchange`, 'diagram.xml');
    A.cvDelDiagram = async () => { if (!confirm('Hapus diagram ini?')) return; try { await API.del(`/api/v1/eaw/diagrams/${CV.dg.id}`); CV.dg = null; A.route(); } catch (e) { fail(e); } };
    // ---- penerbit
    A.pbSet = (k, v) => { PB[k] = v; PB.preview = null; A.route(); };
    A.pbPreview = async () => { try { PB.preview = await API.get('/api/v1/eaw/publisher/preview', { ...pbQuery(), includeDraft: PB.includeDraft ? 'true' : undefined }); A.route(); } catch (e) { fail(e); } };
    A.pbPublish = async () => { if (!confirm('Terbitkan dokumen resmi? Dokumen disusun ulang di server, berversi, dan tidak dapat diubah.')) return; try { const r = await API.post('/api/v1/eaw/publications', pbQuery()); A.toast(`Dokumen v${r.versi} terbit`, `sha256 ${esc(r.sha256.slice(0, 12))}…`, 'success'); PB.preview = null; A.route(); } catch (e) { fail(e); } };
    A.pbDl = (id, v, f) => dl(`/api/v1/eaw/publications/${id}/content`, `dokumen-arsitektur-v${v}.${f === 'markdown' ? 'md' : 'html'}`);
    A.pbPdf = (id, v) => dl(`/api/v1/eaw/publications/${id}/pdf`, `dokumen-arsitektur-v${v}.pdf`);
    A.pbVerify = async (id) => { try { const r = await API.get(`/api/v1/eaw/publications/${id}/verify`); A.toast(r.ok ? 'Integritas terjaga' : 'HASH TIDAK COCOK', esc(r.actual.slice(0, 16)) + '…', r.ok ? 'success' : 'error'); } catch (e) { fail(e); } };
  }
  return { install };
})();
