/* =====================================================================
   SAORAJA EAP — GSE (mode live): Proyek Scaffolding, Template, Flow Builder, penampil berkas, status PR/gerbang.
   Terhubung ke /api/v1/gse/*. Jujur soal batas: scaffolding deterministik (templat {{variabel}}), TANPA AI (prompt hanya disimpan),
   TANPA konektor Git/CI (PR tidak dibuat otomatis; lint/build/SCA/SBOM berstatus "dilewati"). Dipasang oleh live.js (LiveGse.install).
   ===================================================================== */
window.LiveGse = (function () {
  let A, API, D, fail;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errBox = (e) => (e.status === 403 ? '<div class="callout warn"><span class="ic">🔒</span><div>Peran Anda tidak memiliki izin <code>gse.project.read</code>.</div></div>' : `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`);
  const inErr = (id, e) => { const el = document.getElementById(id); const h = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`; if (el) el.innerHTML = h; else fail(e); };
  const ST = { generated: ['Dihasilkan', 'b-ok'], 'checks-failed': ['Gerbang gagal', 'b-err'], blocked: ['Diblokir AF-06', 'b-warn'] };
  const stBadge = (s) => A.pill(ST[s][0], ST[s][1]);
  const GATES = ['pii-guard', 'manifest', 'lint', 'build', 'sca', 'sbom'];
  const gateChip = (g) => (g ? `<span class="badge ${{ ok: 'b-ok', err: 'b-err', skipped: '' }[g.status]} nodot" title="${esc(g.detail)}">${{ ok: '✓', err: '✕', skipped: '–' }[g.status]}</span>` : '<span class="muted">—</span>');
  const ms = (n) => (n == null ? '—' : (n / 1000).toFixed(2).replace('.', ',') + ' dtk');
  const tplNames = {};                                           // id -> nama
  const loadTpl = async () => { const r = (await API.get('/api/v1/gse/templates')).data; r.forEach((t) => { tplNames[t.id] = t.nama; }); return r; };

  async function download(id, kode) {
    try {
      if (window.Oidc && Oidc.enabled()) await Oidc.ensureFresh();
      const r = await fetch(`${API.base()}/api/v1/gse/projects/${id}/bundle`, { headers: { Authorization: 'Bearer ' + API.token() } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `${String(kode).toLowerCase()}-scaffold.tar`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } catch (e) { fail(e); }
  }

  /* ================= 2.1 Proyek ================= */
  async function proyekPage() {
    const box = document.getElementById('gse-body'); if (!box) return;
    try {
      const [sum, list] = await Promise.all([API.get('/api/v1/gse/summary'), API.get('/api/v1/gse/projects', { limit: 100 }), loadTpl()]);
      const s = sum.projects;
      box.innerHTML = `<div class="grid g4 mb">${A.kpi('Rata-rata durasi', s.total - s.blocked ? ms(s.avgDurationMs).replace(' dtk', '<small>dtk</small>') : '—', { tgt: `target ≤ ${sum.targetMs / 1000} dtk (NFR-03)` })}
        ${A.kpi('Dihasilkan', s.generated, { tgt: 'siap di-commit ke feature branch' })}${A.kpi('Gerbang gagal', s.checksFailed, { tgt: 'pii-guard / manifest', up: !s.checksFailed })}${A.kpi('Diblokir AF-06', s.blocked, { tgt: 'aplikasi belum Divalidasi', up: !s.blocked })}</div>` +
        A.card(`Registri Proyek (gse.project) — ${list.data.length}`, list.data.length ? A.table([
          { h: 'Aplikasi', v: (r) => A.tag(r.kode) }, { h: 'Template', v: (r) => `<span class="small">${esc((r.templateIds || []).map((i) => tplNames[i] || '?').join(' + ') || '—')}</span>` },
          { h: 'Branch', v: (r) => `<code class="tiny">${esc(r.branch)}</code> <span class="tiny muted">→ ${esc(r.baseBranch)} (via PR)</span>` },
          { h: 'Gerbang', v: (r) => GATES.map((g) => gateChip(r.gates && r.gates[g])).join(' ') }, { h: 'Berkas', num: 1, v: (r) => r.fileCount || '—' },
          { h: 'Durasi', num: 1, v: (r) => ms(r.durationMs) }, { h: 'Status', v: (r) => stBadge(r.status) }], list.data, { click: (r) => `App.gseProject('${r.id}')` })
          : '<div class="empty"><div class="big">∅</div>Belum ada proyek. Pilih aplikasi berstatus minimal Divalidasi lalu jalankan “Scaffold Baru”.</div>', { flush: true });
    } catch (e) { box.innerHTML = errBox(e); }
  }
  const CI_BADGE = { lulus: ['ok', 'Pipeline lulus'], gagal: ['err', 'Pipeline gagal'], berjalan: ['warn', 'Pipeline berjalan'], belum: ['info', 'Belum ada pipeline'] };
  const PROV = { gitlab: ['GitLab', 'merge request', 'MR', 'pipeline'], github: ['GitHub', 'pull request', 'PR', 'run Actions'] };
  function gitBox(r, g) {
    if (g.push) {
      const c = g.ci; const [k, l] = CI_BADGE[c ? c.ringkasan : 'belum'];
      return `<div class="stack small mt-s"><div class="row"><b style="width:90px">Cabang</b><code>${esc(g.push.branch)}</code></div>
        <div class="row"><b style="width:90px">Commit</b><code>${esc(String(g.push.commitSha).slice(0, 10))}</code></div>
        <div class="row"><b style="width:90px">${(PROV[g.push.provider] || PROV.gitlab)[1].replace(/^./, (x) => x.toUpperCase())}</b><a href="${esc(g.push.mrUrl)}" target="_blank" rel="noopener noreferrer">!${g.push.mrIid} ↗</a></div></div>
        <div class="callout ${k} mt"><span class="ic">${k === 'ok' ? '✓' : k === 'err' ? '✕' : 'ℹ'}</span><div><b>${l}</b>${c ? ` · status ${(PROV[g.push.provider] || PROV.gitlab)[0]} <code>${esc(c.status)}</code> · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${(PROV[g.push.provider] || PROV.gitlab)[3]} #${c.pipelineId} ↗</a>` : ' — klik “Cek status CI” setelah runner memulainya.'}<div class="tiny muted mt-s">Status dibaca apa adanya dari penyedia Git; merge tetap lewat reviu manusia di MR (0 push ke main — D-02).</div></div></div>`;
    }
    if (!g.configured) return `<div class="callout info"><span class="ic">ℹ</span><div>Konektor Git belum dikonfigurasi di API (GitHub: <code>GITHUB_TOKEN</code>; GitLab: <code>GITLAB_URL</code> + <code>GITLAB_TOKEN</code>). Unduh bundel, commit ke branch <code>${esc(r.branch)}</code>, lalu buka PR (0 push langsung ke main — D-02).</div></div>`;
    return r.status === 'generated' ? `<div class="callout info"><span class="ic">ℹ</span><div>Push membuat branch <code>${esc(r.branch)}</code> dari <code>${esc(r.baseBranch)}</code>, meng-commit ${r.files.length} berkas, dan membuka PR/MR. Tidak pernah push/merge ke ${esc(r.baseBranch)}.</div></div>`
      : `<div class="callout warn"><span class="ic">⚠</span><div>Hanya proyek berstatus <b>generated</b> (gerbang lokal lulus) yang boleh di-push.</div></div>`;
  }
  async function project(id) {
    let r; try { r = await API.get(`/api/v1/gse/projects/${id}`); } catch (e) { return fail(e); }
    let g = { configured: false, push: null, ci: null }; try { g = await API.get(`/api/v1/gse/projects/${id}/git`); } catch (e) { /* tanpa izin / konektor mati */ }
    A.openDrawer(`<div class="drawer-hd"><div><div class="row">${A.tag(r.kode)}${stBadge(r.status)}</div><h2 class="mt-s">${esc(r.branch)}</h2><p class="small muted">${esc(r.repoGit || '—')} · base ${esc(r.baseBranch)} · ${ms(r.durationMs)}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd">${r.reason ? `<div class="callout err"><span class="ic">⛔</span><div>${esc(r.reason)}</div></div>` : ''}
        <h3>Gerbang</h3><div class="stack small mt-s">${GATES.map((g) => { const x = r.gates && r.gates[g]; return `<div class="row"><span style="width:26px">${gateChip(x)}</span><b style="width:90px">${g}</b><span class="muted" style="flex:1">${esc(x ? x.detail : '—')}</span></div>`; }).join('')}</div>
        <h3 class="mt">Berkas (${r.files.length})</h3><div class="stack small mt-s">${r.files.map((f) => `<div class="row"><code class="tiny" style="flex:1">${esc(f.path)}</code><span class="tiny muted">${f.bytes} B</span></div>`).join('') || '<span class="muted">Tidak ada (diblokir).</span>'}</div>
        ${r.prompt ? `<h3 class="mt">Prompt tambahan</h3><p class="small mt-s">${esc(r.prompt)}</p><div class="tiny muted">Disimpan sebagai prompt-as-code; belum diproses AI (model on-prem belum terhubung, D-04/D-05).</div>` : ''}
        <h3 class="mt">Git &amp; CI</h3>${gitBox(r, g)}</div>
      <div class="drawer-ft">${r.files.length ? `<button class="btn" onclick="App.gseOpenIde('${r.id}')">Lihat berkas</button>${r.status === 'generated' && g.configured && !g.push && A.can('gse.project.run') ? `<button class="btn pri" onclick="App.gsePush('${r.id}')">⇧ Push + buka PR/MR</button>` : ''}${g.push && A.can('gse.project.run') ? `<button class="btn" onclick="App.gseCi('${r.id}')">↻ Cek status CI</button>` : ''}<button class="btn" onclick="App.gseBundle('${r.id}','${esc(r.kode)}')">⇩ Bundel (.tar)</button>` : ''}</div>`);
  }

  const W = { step: 1, app: null, tpls: [], branch: '', prompt: '', apps: [], templates: [] };
  async function wizard() {
    if (!A.can('gse.project.run')) return A.deny('gse.project.run');
    try { [W.apps, W.templates] = await Promise.all([API.get('/api/v1/gse/apps').then((r) => r.data), loadTpl()]); } catch (e) { return fail(e); }
    W.step = 1; W.app = null; W.tpls = []; W.branch = ''; W.prompt = ''; renderWizard();
  }
  function defaults(a) {
    const k = (c) => (W.templates.find((t) => t.kode === c) || {}).id; const base = a.workspaceMode === 'FEDERATED_REMOTE' ? 'tpl-remote-spa' : 'tpl-internal-sub';
    return [base, 'tpl-nest-clean', 'tpl-ddl-set', 'tpl-ci'].map(k).filter(Boolean);
  }
  function renderWizard() {
    const a = W.apps.find((x) => x.id === W.app);
    const steps = ['Pilih Aplikasi (Gate AF-06)', 'Template & Konfigurasi', 'Hasil'];
    let body = '', foot = '';
    if (W.step === 1) {
      body = `<p class="small muted mb">Hanya aplikasi di katalog EAW berstatus minimal <b>Divalidasi</b> yang dapat di-scaffold (AF-06). Aplikasi Draf dinonaktifkan.</p><div class="list" style="border:1px solid var(--border);border-radius:10px;max-height:340px;overflow:auto">${W.apps.length ? W.apps.map((x) => `<label class="li" style="cursor:${x.eligible ? 'pointer' : 'not-allowed'};opacity:${x.eligible ? 1 : 0.6}"><input type="radio" name="gapp" ${x.eligible ? '' : 'disabled'} ${x.id === W.app ? 'checked' : ''} onchange="App.gseSet('app','${x.id}')"><div class="bd"><div class="t">${esc(x.kode)} · ${esc(x.nama)}</div><div class="d">${esc(x.jenisNode)}${x.platform ? ' di ' + esc(x.platform) : ''} · ${esc(x.workspaceMode)} · ${esc(x.entityCode)}</div></div>${A.badge(x.status)}</label>`).join('') : '<div class="empty">Katalog EAW masih kosong.</div>'}</div>`;
      foot = `<button class="btn pri" ${W.app ? '' : 'disabled'} onclick="App.gseSet('step',2)">Lanjut →</button>`;
    } else if (W.step === 2) {
      const cats = ['shell', 'frontend', 'backend', 'ddl', 'ci'];
      body = `<div class="callout ok mb"><span class="ic">✓</span>Gate AF-06 lolos — <b>${esc(a.kode)}</b> berstatus ${esc(a.status)}.</div>
        ${cats.map((c) => { const ts = W.templates.filter((t) => t.kategori === c); return ts.length ? `<div class="field"><label style="text-transform:capitalize">${c}</label>${ts.map((t) => `<label class="small row" style="gap:6px"><input type="checkbox" ${W.tpls.includes(t.id) ? 'checked' : ''} onchange="App.gseTpl('${t.id}',this.checked)"> <b>${esc(t.nama)}</b> <span class="tiny muted">v${esc(t.versi)} · ${t.fileCount} berkas</span></label>`).join('')}</div>` : ''; }).join('')}
        <div class="form-grid mt"><div class="field full"><label>Feature branch (bukan main — D-02)</label><input class="input mono" value="${esc(W.branch || 'feat/gse-' + a.kode.toLowerCase() + '-scaffold')}" onchange="App.gseSet('branch',this.value)"></div>
        <div class="field full"><label>Prompt tambahan (opsional)</label><textarea class="textarea" onchange="App.gseSet('prompt',this.value)" placeholder="mis. Tambahkan modul laporan bulanan…">${esc(W.prompt)}</textarea><span class="hint">Disimpan sebagai prompt-as-code; AI scaffolding belum terhubung — hasil murni dari template deterministik.</span></div></div><div id="gse-err" class="mt"></div>`;
      foot = `<button class="btn" onclick="App.gseSet('step',1)">← Kembali</button><button class="btn gold" ${W.tpls.length ? '' : 'disabled'} onclick="App.gseRun()">⚙ Generate</button>`;
    } else {
      const r = W.result;
      body = r.error ? `<div class="callout err"><span class="ic">✕</span><div>${esc(r.error)}</div></div>` : `<div class="grid g3 mb">${A.kpi('Status', r.status === 'generated' ? 'Dihasilkan' : 'Gerbang gagal')}${A.kpi('Berkas', r.fileCount)}${A.kpi('Durasi', ms(r.durationMs))}</div>
        <div class="stack small">${GATES.map((g) => { const x = r.gates[g]; return `<div class="row"><span style="width:26px">${gateChip(x)}</span><b style="width:90px">${g}</b><span class="muted" style="flex:1">${esc(x.detail)}</span></div>`; }).join('')}</div>
        <div class="callout info mt"><span class="ic">ℹ</span>Branch <code>${esc(r.branch)}</code> belum di-push (konektor Git belum ada). Unduh bundel lalu commit & buka PR.</div>`;
      foot = `<button class="btn" onclick="App.closeAll()">Tutup</button>${r.error ? '' : `<button class="btn pri" onclick="App.gseBundle('${r.id}','${esc(r.kode)}')">⇩ Unduh bundel</button>`}`;
    }
    A.openModal(`<div class="drawer-hd"><div><h2>Scaffold Baru — GSE Engine</h2><p class="small muted">Template deterministik (D-04) · gerbang AF-06</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><div class="steps">${steps.map((s, i) => `<div class="step ${i + 1 < W.step ? 'done' : i + 1 === W.step ? 'on' : ''}"><b>Langkah ${i + 1}</b>${s}</div>`).join('')}</div>${body}</div><div class="drawer-ft">${foot}</div>`);
  }
  async function run() {
    const a = W.apps.find((x) => x.id === W.app);
    try {
      W.result = await API.post('/api/v1/gse/projects', { applicationId: W.app, templateIds: W.tpls, branch: W.branch || undefined, prompt: W.prompt || undefined });
    } catch (e) { if (e.status === 422 && !/AF-06/.test(e.detail || '')) { inErr('gse-err', e); return; } W.result = { error: API.explain(e) }; }
    W.step = 3; renderWizard(); A.route();
  }

  /* ================= 2.2 Template ================= */
  async function templatePage() {
    const box = document.getElementById('gse-body'); if (!box) return;
    try {
      const ts = await loadTpl();
      box.innerHTML = `<div class="grid g3">${ts.map((t) => A.card(esc(t.nama), `<p class="small">${esc(t.deskripsi || '')}</p><div class="mt-s small"><code>${esc(t.stack || '')}</code></div><div class="row mt"><span class="tag">${esc(t.kode)}</span><span class="tag">v${esc(t.versi)}</span><span class="right tiny muted">${t.fileCount} berkas</span></div>`,
        { acts: `<button class="btn sm" onclick="App.gseTemplate('${t.id}')">Buka</button>` })).join('')}</div>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }
  async function template(id) {
    let t; try { t = await API.get(`/api/v1/gse/templates/${id}`); } catch (e) { return fail(e); }
    window.__gseTpl = t; const first = t.files[0];
    A.openDrawer(`<div class="drawer-hd"><div><div class="row"><span class="tag">${esc(t.kode)}</span><span class="tag">v${esc(t.versi)}</span></div><h2 class="mt-s">${esc(t.nama)}</h2><p class="small muted">${esc(t.stack || '')}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><p class="small">${esc(t.deskripsi || '')}</p><h3 class="mt">Berkas templat (${t.files.length})</h3><div class="small mt-s">Variabel: <code>{{app_kode}}</code> <code>{{app_kode_lower}}</code> <code>{{app_nama}}</code> <code>{{platform}}</code> <code>{{workspace_mode}}</code> <code>{{federation_scope}}</code> <code>{{iam_schema}}</code> <code>{{repo_git}}</code></div>
        <div class="stack mt-s">${t.files.map((f, i) => `<div><a href="#" onclick="App.gseTplFile(${i});return false"><code class="tiny">${esc(f.path)}</code></a></div>`).join('')}</div><pre class="code mt" id="gse-tplview">${esc(first ? first.content : '')}</pre></div>
      <div class="drawer-ft">${A.can('gse.project.run') ? `<button class="btn danger" onclick="App.gseTplDel('${t.id}')">Hapus</button>` : ''}</div>`);
  }
  function tplForm() {
    A.openModal(`<div class="drawer-hd"><h2>Template Baru</h2><button class="x" onclick="App.closeAll()">×</button></div><form class="drawer-bd" id="tpl-form" onsubmit="App.gseTplSave(event)"><div class="form-grid">
      <div class="field"><label>Kode <span class="req">*</span></label><input class="input" name="kode" required pattern="[a-z0-9][a-z0-9\\-]*" placeholder="tpl-saya"></div>
      <div class="field"><label>Kategori</label><select class="select" name="kategori">${['shell', 'frontend', 'backend', 'ddl', 'ci'].map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div class="field full"><label>Nama <span class="req">*</span></label><input class="input" name="nama" required></div><div class="field full"><label>Stack</label><input class="input" name="stack"></div>
      <div class="field full"><label>Berkas (JSON: [{"path","content"}] dengan {{variabel}})</label><textarea class="textarea mono" name="files" rows="8">[{"path":"README.md","content":"# {{app_nama}}\\n"}]</textarea></div></div><div id="tpl-err" class="mt"></div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('tpl-form').requestSubmit()">Simpan</button></div>`);
  }
  async function tplSave(e) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); let files;
    try { files = JSON.parse(f.files); } catch { return inErr('tpl-err', new Error('Berkas harus JSON valid')); }
    try { await API.post('/api/v1/gse/templates', { kode: f.kode, nama: f.nama, kategori: f.kategori, stack: f.stack || undefined, files }); A.closeAll(); A.toast('Template tersimpan', esc(f.kode), 'success'); A.route(); } catch (x) { inErr('tpl-err', x); }
  }

  /* ================= 2.3 Flow ================= */
  const F = { sel: null, flows: [], draft: null };
  const blank = (kind) => ({ id: null, version: null, nama: '', kind, status: 'draft', valid: false, problems: [], spec: kind === 'saga' ? { steps: [{ name: '', service: '', mutates: true, compensation: '', idempotencyKey: '${order_id}' }] } : { autonomy: 'L2', tools: [], guardrails: { fail_mode: 'closed' } } });
  async function flowPage() {
    const box = document.getElementById('gse-body'); if (!box) return;
    try { F.flows = (await API.get('/api/v1/gse/flows')).data; } catch (e) { box.innerHTML = errBox(e); return; }
    if (!F.draft) F.draft = F.sel ? JSON.parse(JSON.stringify(F.flows.find((x) => x.id === F.sel) || blank('saga'))) : blank('saga');
    const d = F.draft; const can = A.can('gse.project.run');
    let yaml = ''; if (d.id) { try { yaml = (await API.get(`/api/v1/gse/flows/${d.id}/yaml`)).yaml; } catch (e) { /* tanpa izin */ } }
    const inp = (v, on, w) => `<input class="input" style="${w || ''}" value="${esc(v)}" ${can ? '' : 'disabled'} onchange="${on}">`;
    const editor = d.kind === 'saga' ? `<div class="stack">${d.spec.steps.map((s, i) => `<div class="card" style="box-shadow:none;padding:10px 12px"><div class="row" style="gap:8px;flex-wrap:wrap"><b>${i + 1}</b>${inp(s.name, `App.gseFlowSet(${i},'name',this.value)`, 'width:130px')}<span class="tiny muted">service</span>${inp(s.service, `App.gseFlowSet(${i},'service',this.value)`, 'width:90px')}
        <label class="tiny row" style="gap:4px"><input type="checkbox" ${s.mutates === false ? '' : 'checked'} ${can ? '' : 'disabled'} onchange="App.gseFlowSet(${i},'mutates',this.checked)">memutasi data</label>
        <span class="tiny muted">kompensasi</span>${inp(s.compensation || '', `App.gseFlowSet(${i},'compensation',this.value)`, 'width:130px')}<span class="tiny muted">idempotencyKey</span>${inp(s.idempotencyKey || '', `App.gseFlowSet(${i},'idempotencyKey',this.value)`, 'width:120px')}
        ${can ? `<button class="btn sm ghost" onclick="App.gseFlowDel(${i})">✕</button>` : ''}</div></div>`).join('')}</div>${can ? '<button class="btn sm mt-s" onclick="App.gseFlowAdd()">+ Langkah</button>' : ''}`
      : `<div class="form-grid"><div class="field"><label>Otonomi (maks. L3 — D-06)</label><select class="select" ${can ? '' : 'disabled'} onchange="App.gseAgent('autonomy',this.value)">${['L1', 'L2', 'L3', 'L4'].map((l) => `<option ${l === d.spec.autonomy ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Guardrail fail_mode (wajib closed — D-03)</label><select class="select" ${can ? '' : 'disabled'} onchange="App.gseAgent('fail_mode',this.value)">${['closed', 'open'].map((l) => `<option ${l === d.spec.guardrails.fail_mode ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field full"><label>Tools (pisahkan koma)</label>${inp((d.spec.tools || []).join(', '), "App.gseAgent('tools',this.value)")}</div></div>`;
    box.innerHTML = `<div class="grid g-1-2"><div>${A.card('Flow tersimpan', `<div class="list">${F.flows.map((f) => `<div class="li" style="cursor:pointer;${f.id === d.id ? 'background:var(--accent-soft)' : ''}" onclick="App.gseFlowOpen('${f.id}')"><span class="ic">${f.kind === 'saga' ? '⇆' : '✦'}</span><div class="bd"><div class="t">${esc(f.nama)}</div><div class="d">${f.kind} · ${f.valid ? 'valid' : 'tidak valid'}</div></div>${A.pill(f.status, f.status === 'committed' ? 'b-ok' : '')}</div>`).join('') || '<div class="empty small">Belum ada flow.</div>'}</div>`, { flush: true, acts: can ? '<button class="btn sm" onclick="App.gseFlowNew(\'saga\')">+ Saga</button> <button class="btn sm" onclick="App.gseFlowNew(\'agent\')">+ Agent</button>' : '' })}</div>
      <div>${A.card(d.id ? esc(d.nama) : 'Flow baru (' + d.kind + ')', `<div class="field"><label>Nama</label>${inp(d.nama, "App.gseFlowName(this.value)")}</div><div class="mt">${editor}</div>
        ${d.problems && d.problems.length ? `<div class="callout err mt"><span class="ic">✕</span><div><b>Tidak valid:</b><br>${d.problems.map((p) => esc(p)).join('<br>')}</div></div>` : d.id ? '<div class="callout ok mt"><span class="ic">✓</span>Lolos validasi (kompensasi idempoten / batas otonomi).</div>' : '<div class="tiny muted mt">Validasi dilakukan server saat disimpan.</div>'}
        ${yaml ? `<h3 class="mt">${d.kind === 'saga' ? 'flow.yaml' : 'agent.yaml'}</h3><pre class="code mt-s">${esc(yaml)}</pre>` : ''}`, { acts: can ? `<button class="btn sm" onclick="App.gseFlowSave()">Simpan draf</button>${d.id ? `<button class="btn sm pri" onclick="App.gseFlowCommit()">Commit</button><button class="btn sm danger" onclick="App.gseFlowRemove()">Hapus</button>` : ''}` : '' })}</div></div>`;
  }
  async function flowSave() {
    const d = F.draft;
    if (d.kind === 'agent') d.spec.tools = (d.spec.tools || []).filter(Boolean);
    try {
      const r = d.id ? await API.patch(`/api/v1/gse/flows/${d.id}`, { nama: d.nama, spec: d.spec }, `"${d.version}"`) : await API.post('/api/v1/gse/flows', { nama: d.nama, kind: d.kind, spec: d.spec });
      F.sel = r.id; F.draft = null; A.toast(r.valid ? 'Flow tersimpan (valid)' : 'Flow tersimpan — belum valid', esc(r.nama), r.valid ? 'success' : 'info'); A.route();
    } catch (e) { fail(e); }
  }

  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail;
    const page = (title, sub, acts, mount) => () => ({ html: A.pageHd(title, sub, acts) + '<div id="gse-body"><div class="small muted">Memuat…</div></div>', mount });
    A.PAGES['gse/proyek'] = page('Proyek Scaffolding', 'Satu permintaan → bundel kode + feature branch (0 push ke main, D-02). Hanya aplikasi EAW berstatus minimal Divalidasi (AF-06). Template deterministik; lint/build/SCA butuh CI runner (dilewati).', A.lockBtn('gse.project.run', '⚙ Scaffold Baru', 'App.gseWizard()', 'btn pri'), proyekPage);
    A.PAGES['gse/template'] = page('Template & Blueprint Generator', 'Blueprint kode deterministik berversi (gse.template) dengan variabel {{...}} dari katalog EAW.', A.lockBtn('gse.project.run', '+ Template', 'App.gseTplForm()', 'btn pri'), templatePage);
    A.PAGES['gse/flow'] = page('Visual Agent & Distributed Saga Flow Builder', 'Saga: tiap langkah pemutasi wajib kompensasi idempoten + idempotencyKey (D-07). Agent: otonomi maksimum L3 dan guardrail fail-closed (D-06, D-03). Divalidasi server.', '', flowPage);
    A.PAGES['gse/ide'] = page('Penampil Berkas Hasil Scaffold', 'Pratinjau read-only berkas proyek (editor Monaco & commit ke Git belum tersedia — GSE-05 belum dibangun).', '', idePage);
    A.PAGES['gse/pr'] = page('Status Gerbang & PR', 'Hasil gerbang per proyek. Pembuatan PR otomatis & sinkron ArgoCD butuh konektor Git/CI (belum ada): unduh bundel lalu buka PR dari feature branch.', '', prPage);
    A.gseWizard = wizard; A.gseSet = (k, v) => { W[k] = v; if (k === 'app') W.tpls = defaults(W.apps.find((x) => x.id === v)); if (k === 'step' && v === 2 && !W.tpls.length) W.tpls = defaults(W.apps.find((x) => x.id === W.app)); renderWizard(); };
    A.gseTpl = (id, on) => { W.tpls = on ? [...new Set([...W.tpls, id])] : W.tpls.filter((x) => x !== id); renderWizard(); };
    A.gseSetPrompt = (t) => { W.prompt = t; if (W.step === 2) renderWizard(); else { W.step = 1; } };
    A.gseRun = run; A.gseProject = project; A.gseBundle = download;
    A.gsePush = async (id) => {
      if (!confirm('Push ke repo Git? Dibuat branch fitur + PR/MR (tidak ada push ke main).')) return;
      try { const r = await API.post(`/api/v1/gse/projects/${id}/git/push`, {}); A.toast('Push berhasil', `${(PROV[r.provider] || PROV.gitlab)[2]} #${r.mrIid} dibuka`, 'success'); project(id); } catch (e) { fail(e); }
    };
    A.gseCi = async (id) => {
      try { const r = await API.post(`/api/v1/gse/projects/${id}/git/ci`, {}); A.toast('Status CI', r.pesan || `Pipeline: ${r.ringkasan}${r.changed ? ' (baru)' : ''}`, r.ringkasan === 'gagal' ? 'error' : 'success'); project(id); } catch (e) { fail(e); }
    };
    A.gseTemplate = template; A.gseTplFile = (i) => { const el = document.getElementById('gse-tplview'); if (el) el.textContent = window.__gseTpl.files[i].content; };
    A.gseTplForm = tplForm; A.gseTplSave = tplSave;
    A.gseTplDel = async (id) => { if (!confirm('Hapus template ini?')) return; try { await API.del(`/api/v1/gse/templates/${id}`); A.closeAll(); A.toast('Template dihapus', '', 'success'); A.route(); } catch (e) { fail(e); } };
    A.gseOpenIde = (id) => { A.closeAll(); ide.sel = id; ide.file = null; location.hash = '#/gse/ide'; if (location.hash === '#/gse/ide') A.route(); };
    // flow
    A.gseFlowOpen = (id) => { F.sel = id; F.draft = null; A.route(); };
    A.gseFlowNew = (k) => { F.sel = null; F.draft = blank(k); A.route(); };
    A.gseFlowName = (v) => { F.draft.nama = v; };
    A.gseFlowSet = (i, k, v) => { F.draft.spec.steps[i][k] = v; };
    A.gseFlowAdd = () => { F.draft.spec.steps.push({ name: '', service: '', mutates: true, compensation: '', idempotencyKey: '${order_id}' }); A.route(); };
    A.gseFlowDel = (i) => { F.draft.spec.steps.splice(i, 1); A.route(); };
    A.gseAgent = (k, v) => { if (k === 'autonomy') F.draft.spec.autonomy = v; else if (k === 'fail_mode') F.draft.spec.guardrails.fail_mode = v; else F.draft.spec.tools = v.split(',').map((x) => x.trim()).filter(Boolean); };
    A.gseFlowSave = flowSave;
    A.gseFlowCommit = async () => { const d = F.draft; try { await flowSave(); const r = await API.post(`/api/v1/gse/flows/${F.sel}/commit`, {}); F.draft = null; A.toast('Flow di-commit', esc(r.nama), 'success'); A.route(); } catch (e) { fail(e); } };
    A.gseFlowRemove = async () => { if (!confirm('Hapus flow ini?')) return; try { await API.del(`/api/v1/gse/flows/${F.draft.id}`); F.sel = null; F.draft = null; A.route(); } catch (e) { fail(e); } };
    A.gseIdeSel = (v) => { ide.sel = v; ide.file = null; A.route(); };
    A.gseIdeFile = (p) => { ide.file = p; A.route(); };
  }

  /* ================= 2.4 penampil berkas ================= */
  const ide = { sel: null, file: null };
  async function idePage() {
    const box = document.getElementById('gse-body'); if (!box) return;
    try {
      const list = (await API.get('/api/v1/gse/projects', { limit: 100 })).data.filter((p) => p.fileCount > 0);
      if (!list.length) { box.innerHTML = A.card('', '<div class="empty"><div class="big">∅</div>Belum ada proyek dengan berkas.</div>'); return; }
      if (!ide.sel || !list.some((p) => p.id === ide.sel)) ide.sel = list[0].id;
      const proj = await API.get(`/api/v1/gse/projects/${ide.sel}`);
      if (!ide.file || !proj.files.some((f) => f.path === ide.file)) ide.file = proj.files[0].path;
      const f = await API.get(`/api/v1/gse/projects/${ide.sel}/file`, { path: ide.file });
      box.innerHTML = `<div class="row mb"><select class="select" onchange="App.gseIdeSel(this.value)">${list.map((p) => `<option value="${p.id}" ${p.id === ide.sel ? 'selected' : ''}>${esc(p.kode)} · ${esc(p.branch)}</option>`).join('')}</select><button class="btn sm" onclick="App.gseBundle('${proj.id}','${esc(proj.kode)}')">⇩ Unduh bundel</button></div>
        <div class="ide"><div class="ft">${proj.files.map((x) => `<div class="${x.path === ide.file ? 'on' : ''}" onclick="App.gseIdeFile('${esc(x.path)}')" title="${esc(x.path)}">${esc(x.path.split('/').pop())}<div class="tiny faint">${esc(x.path.split('/').slice(0, -1).join('/'))}</div></div>`).join('')}</div>
        <div class="ed"><div class="etabs"><div class="etab on">${esc(ide.file.split('/').pop())}</div></div><pre class="code">${f.content.split('\n').map((l, i) => `<span style="color:#4A5A6C;display:inline-block;width:32px;user-select:none">${i + 1}</span>${esc(l)}`).join('\n')}</pre><div class="status"><span>${esc(ide.file.split('.').pop())}</span><span>UTF-8</span><span>read-only</span><span style="margin-left:auto">${f.bytes} B</span></div></div></div>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }

  /* ================= 2.5 status gerbang & PR ================= */
  const pr = { sel: null };
  async function prPage() {
    const box = document.getElementById('gse-body'); if (!box) return;
    try {
      const list = (await API.get('/api/v1/gse/projects', { limit: 100 })).data;
      if (!list.length) { box.innerHTML = A.card('', '<div class="empty"><div class="big">∅</div>Belum ada proyek.</div>'); return; }
      const sel = list.find((p) => p.id === pr.sel) || list[0]; pr.sel = sel.id;
      const stage = (g, label) => { const x = sel.gates && sel.gates[g]; return `<div class="pstage ${x ? { ok: 'ok', err: 'err', skipped: '' }[x.status] : ''}" title="${esc(x ? x.detail : '')}"><b>${label}</b>${x ? { ok: '✓ lolos', err: '✕ gagal', skipped: '– dilewati' }[x.status] : '—'}</div>`; };
      A.pr_select = (id) => { pr.sel = id; A.route(); };
      box.innerHTML = `<div class="grid g-1-2">${A.card('Proyek / Branch', `<div class="list">${list.map((x) => `<div class="li" style="cursor:pointer;${x.id === sel.id ? 'background:var(--accent-soft)' : ''}" onclick="App.pr_select('${x.id}')"><span class="ic">⑂</span><div class="bd"><div class="t">${esc(x.kode)}</div><div class="d mono">${esc(x.branch)}</div></div>${stBadge(x.status)}</div>`).join('')}</div>`, { flush: true })}
        <div class="stack">${A.card(`${esc(sel.repoGit || '—')} · ${esc(sel.branch)}`, `<div class="pipeline">${stage('pii-guard', 'pii-guard')}${stage('manifest', 'Manifest')}${stage('lint', 'Lint')}${stage('build', 'Build')}${stage('sca', 'SCA Grype & ORT')}${stage('sbom', 'SBOM Syft')}<div class="pstage"><b>Merge → ArgoCD</b>– belum ada konektor</div></div>
          ${sel.reason ? `<div class="callout err mt"><span class="ic">⛔</span><div>${esc(sel.reason)}</div></div>` : ''}${sel.status === 'checks-failed' ? `<div class="callout err mt"><span class="ic">✕</span><div>${esc(Object.entries(sel.gates).filter(([, g]) => g.status === 'err').map(([k, g]) => k + ': ' + g.detail).join(' · '))}</div></div>` : ''}`, { acts: sel.fileCount ? `<button class="btn sm" onclick="App.gseBundle('${sel.id}','${esc(sel.kode)}')">⇩ Bundel</button>` : '' })}
          ${A.card('Ringkasan', `<div class="grid g3">${A.kpi('Berkas', sel.fileCount)}${A.kpi('Ukuran', sel.bytes ? (sel.bytes / 1024).toFixed(1) + '<small>KB</small>' : '—')}${A.kpi('Durasi', ms(sel.durationMs))}</div><p class="small muted mt">Merge ke <code>${esc(sel.baseBranch)}</code> hanya lewat PR (reviewer: Domain Architect + Lead Software Engineer). PR otomatis belum tersedia.</p>`)}</div></div>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }
  return { install };
})();
