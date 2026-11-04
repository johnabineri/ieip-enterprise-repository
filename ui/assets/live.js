/* =====================================================================
   SAORAJA EAP — Boot + mode live. Tanpa apiUrl: memuat shell prototipe (data MOCK di data.js) apa adanya.
   Dengan apiUrl (?api=http://localhost:3100) dan oidcIssuer (?oidc=http://localhost:8180/realms/keis):
   login Keycloak (PKCE) → /me → data nyata dipetakan ke bentuk data.js (diubah di tempat, karena halaman menangkap rujukan
   array) → shell dimuat → aksi tulis (daftar aplikasi, transisi AF-05, ARB, ADR) dialihkan ke API.
   Modul tanpa API (GSE, REQ, CONSOLE, relasi, kanvas…) tetap data contoh.
   ===================================================================== */
(function () {
  const D = window.DB, API = window.API, CFG = window.EAP_CONFIG;
  const SCRIPTS = ['assets/app.js?v=4', 'assets/pages-eaw.js?v=3', 'assets/pages-ops.js?v=3', 'assets/live-domains.js?v=1', 'assets/live-gov.js?v=2', 'assets/live-gse.js?v=4', 'assets/live-req.js?v=3', 'assets/live-console.js?v=1', 'assets/live-model.js?v=2', 'assets/live-lineage.js?v=1', 'assets/live-import.js?v=2'];
  const loadSeq = (list) => list.reduce((p, src) => p.then(() => new Promise((ok, err) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('Gagal memuat ' + src)); document.body.appendChild(s);
  })), Promise.resolve());
  const boot = (html) => { let b = document.getElementById('boot'); if (!b) { b = document.createElement('div'); b.id = 'boot'; b.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:var(--bg,#fff);color:var(--text,#222);font:15px system-ui;z-index:99;text-align:center;padding:24px'; document.body.appendChild(b); } b.innerHTML = html; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (arr, items) => { arr.length = 0; arr.push(...items); };
  const dt = (s) => (s ? new Date(s).toISOString().replace('T', ' ').slice(0, 19) : '');
  const fireReady = () => { if (document.readyState !== 'loading') document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true })); };

  // izin API → kode izin yang dipakai UI prototipe (lockBtn/can)
  const PERM_MAP = {
    'eaw.catalog.read': ['eaw.catalog.read'], 'eaw.catalog.write': ['eaw.catalog.write'], 'eaw.model.write': ['eaw.model.write'],
    'eaw.validation.approve': ['eaw.workflow.validate'], 'eaw.review.run': ['eaw.workflow.validate'],
    'eaw.baseline.approve': ['eaw.arb.approve', 'eaw.workflow.approve'], 'eaw.publication.approve': ['eaw.publish.run'],
    'gov.arb.write': ['eaw.arb.submit', 'eaw.arb.review'], 'gov.arb.approve': ['eaw.arb.approve'],
    'eaw.adr.write': ['eaw.adr.write'], 'gse.project.read': ['gse.project.read'], 'req.session.write': ['req.session.run'], 'eaw.document.approve': ['eaw.document.approve'], 'console.dashboard.read': ['console.dashboard.read'], 'console.dashboard.write': ['console.dashboard.write'], 'console.ai.admin': ['console.ai.admin'], 'console.finops.read': ['console.finops.read'], 'console.eio.write': ['console.eio.write'], 'console.security.admin': ['console.security.admin'], 'gse.project.run': ['gse.project.run'], 'eaw.org.write': ['eaw.org.write'], 'eaw.platform.write': ['eaw.platform.write'], 'eaw.workspace.assign': ['eaw.workspace.assign'], 'eaw.reference.write': ['eaw.kra.write'],
    'set.account.admin': ['set.users.admin'], 'set.audit.read': ['set.audit.read'],
  };
  const NONE = 'ROLE_EAP_NONE';
  const ARB_STEP = { SUBMITTED: 1, IN_REVIEW: 3, REVISION: 3, REJECTED: 4, APPROVED: 5 };
  const NEXT = { Draf: 'Divalidasi', Divalidasi: 'Ditetapkan', Ditetapkan: 'Dipublikasi', Dipublikasi: 'Direviu', Direviu: 'Ditetapkan' };

  const optional = async (fn) => { try { return await fn(); } catch (e) { if (e.status === 403) return null; throw e; } };

  async function load() {
    const me = await API.get('/api/v1/me');
    const [org, apps, adrs, arbs, refs, roles, users, audit] = await Promise.all([
      optional(() => API.all('/api/v1/eaw/entity-org')), optional(() => API.all('/api/v1/eaw/applications')),
      optional(() => API.all('/api/v1/eaw/adrs')), optional(() => API.all('/api/v1/gov/arb/clearances')),
      optional(() => API.all('/api/v1/eaw/references')), optional(() => API.get('/api/v1/set/roles')),
      optional(() => API.all('/api/v1/set/users')), optional(() => API.get('/api/v1/audit/logs', { limit: 100 })),
    ]);

    // entitas (eaw.entity_org): id UI = kode entitas
    const byId = new Map((org || []).map((o) => [o.id, o]));
    fill(D.ENTITIES, (org || []).map((o) => ({ id: o.code, uuid: o.id, nama: o.name, tingkat: o.kafLevel || 'unit', parent: byId.get(o.parentId)?.code || null, ika: o.ikaLevel || 0, target: 3,
      confirmed: o.kafLevelConfirmed, notes: o.notes, kind: o.groupKind, referenceId: o.referenceId })));
    D.ENTITIES.forEach((e) => { D.IKA_DOMAIN[e.id] = Array(6).fill(e.ika); });
    const codeOf = new Map((org || []).map((o) => [o.id, o.code]));

    // aplikasi
    fill(D.APPS, (apps || []).map((a) => ({
      id: a.id, version: a.version, kode: a.kode, nama: a.nama, platform: a.platform || '—', ws: a.workspace || '—', jenis: a.jenis, mode: a.workspaceMode,
      lifecycle: a.lifecycle, krit: a.kritikalitas, ai: a.risikoAi, status: a.status, entity: a.entityCode, ob: a.ownerBisnis, ot: a.timPengembang, slo: a.slo,
      repo: a.repoGit || '—', scope: a.federationScope || '—', db: '—', referensiId: a.referensiId,
      jenisNode: a.jenisNode, uiStandard: a.uiStandard, techStack: a.techStack, arbId: a.arbClearanceId, adopsi: a.adopsi,
      rel: { layanan: 0, proses: 0, data: 0, infra: 0, kontrol: 0, kra: !!a.referensiId },   // API relasi belum ada (EAW-05 hanya peringatan)
    })));

    // KRA
    fill(D.KRA, (refs || []).map((r) => ({ id: r.id, kode: r.kode, domain: r.domain, nama: r.nama, versi: r.versi, status: r.status, objek: 0 })));

    // ADR: keputusan SAF D-01..D-14 (mock, terkunci di Git) + ADR nyata dari API
    const real = (adrs || []).map((a) => ({ id: a.id, code: a.adrCode, aspek: 'ADR', title: a.title, why: a.decision, status: a.status, git: a.gitRef || '—', date: dt(a.createdAt).slice(0, 10), context: a.context }));
    const codes = new Set(real.map((r) => r.code));
    fill(D.ADR, [...D.ADR.filter((a) => !codes.has(a.code) && !a.id).filter((a) => /^D-\d+$/.test(a.code)), ...real]);

    // ARB
    fill(D.ARB, (arbs || []).map((t) => ({
      id: t.id, no: t.ticketNumber, name: t.initiativeName, entity: t.entityCode, cost: t.estimatedCost || 0, score: t.aiRiskScore ?? 0, status: t.status,
      step: ARB_STEP[t.status] ?? 1, by: t.proposedBy?.slice(0, 8) || '-', proposedBy: t.proposedBy, date: dt(t.createdAt).slice(0, 10), cert: t.certificateId || undefined,
      notes: t.arbNotes || t.businessCase || '', dup: null, violations: [], version: t.version,
    })));

    // peran, akun, audit
    if (roles) fill(D.ROLES, roles.data.map((r) => ({ code: r.roleCode, name: r.roleName, tier: r.tier })));
    const mine = me.roles[0] || NONE;
    if (!D.ROLES.some((r) => r.code === mine)) D.ROLES.push({ code: NONE, name: 'Belum ada peran (menunggu penugasan admin)', tier: 'T0' });
    const people = (users || []).map((u) => ({ sub: u.id, uname: u.username || u.id.slice(0, 8), role: u.assignments[0]?.roleCode || NONE, scope: u.assignments[0]?.entityScope || null, active: u.isActive, last: dt(u.lastLoginAt) }));
    const meUser = people.find((u) => u.uname === me.username) || { sub: me.userId, uname: me.username, role: mine, scope: null, active: true, last: dt(new Date()) };
    meUser.role = mine;
    fill(D.USERS, [meUser, ...people.filter((u) => u !== meUser)]);
    const name = new Map((users || []).map((u) => [u.id, u.username]));
    fill(D.AUDIT, ((audit && audit.data) || []).map((x) => ({
      id: Number(x.id), t: dt(x.changed_at), sch: x.table_schema, tbl: x.table_name, act: String(x.action).toLowerCase(), by: name.get(x.changed_by) || (x.changed_by ? String(x.changed_by).slice(0, 8) : 'sistem'),
      rec: String(x.record_id || '').slice(0, 8), ch: x.new_values && x.new_values.status ? 'status → ' + x.new_values.status : '' })));
    if (!D.AUDIT.length) D.AUDIT.push({ id: 0, t: dt(new Date()), sch: 'set', tbl: '-', act: 'select', by: me.username, rec: '-', ch: 'belum ada catatan / tanpa izin set.audit.read' });

    const perms = new Set(); me.permissions.forEach((p) => (PERM_MAP[p] || []).forEach((x) => perms.add(x)));
    if (roles) roles.data.forEach((r) => { const set = new Set(); r.permissions.forEach((p) => (PERM_MAP[p] || []).forEach((x) => set.add(x))); D.RP[r.roleCode] = [...set]; });
    D.RP[mine] = [...perms];
    D.USERS.forEach((u) => { const raw = (users || []).find((x) => x.id === u.sub); u.assignments = raw ? raw.assignments : []; });
    D.LIVE_USERS = !!users;
    return { me, mine };
  }

  async function reload() {
    const A = window.App; const keep = A.S.role;
    const r = await load(); A.S.role = r.mine; A.S.role = keep === r.mine ? keep : r.mine;
  }

  function wire(ctx) {
    const A = window.App, S = A.S;
    S.role = ctx.mine;
    if (!D.ENTITIES.some((e) => e.id === S.entity)) S.entity = (D.ENTITIES.find((e) => e.tingkat === 'holding') || D.ENTITIES[0] || {}).id;
    const fail = (e) => A.toast('Gagal', esc(API.explain(e)), 'error');
    const refresh = async (reopen) => { await reload(); A.route(); if (reopen) setTimeout(reopen, 30); };
    const entUuid = (code) => (D.ENTITIES.find((e) => e.id === code) || {}).uuid;

    A.deny = (perm) => A.toast('403 — Akses ditolak', `Peran Anda tidak memiliki izin <code>${esc(perm)}</code> (ditegakkan di server).`, 'error');
    A.setRole = () => A.toast('Peran ditentukan Keycloak/admin', 'Mode live: peran tidak dapat diganti dari UI. Penugasan lewat Pengaturan → Akun.', 'info');
    const userMenu = A.userMenu;
    A.userMenu = () => { userMenu(); const p = document.getElementById('pop-user'); if (p.classList.contains('on')) p.insertAdjacentHTML('beforeend', '<div class="card-bd"><button class="btn sm danger" onclick="App.logout()">Keluar (SSO)</button></div>'); };
    A.logout = () => { const u = Oidc.enabled() ? Oidc.logoutUrl() : null; Oidc.clear(); API.clear(); location.href = u || 'index.html'; };

    LiveDomains.install(A, { API, D, fail, entUuid });
    LiveGov.install(A, { API, D, fail, entUuid, refresh: () => refresh() });   // KRA Manager, Framework Builder, ARB, dashboard   // halaman domain D1/D2/D3/D5/D6 -> /eaw/objects
    LiveGse.install(A, { API, D, fail });   // GSE: proyek, template, flow, berkas, gerbang
    LiveReq.install(A, { API, D, fail });   // REQ: sesi elisitasi, user story, ekspor
    LiveConsole.install(A, { API, D, fail });   // CONSOLE: IKA, AI register, FinOps, EIO, observability, security
    LiveModel.install(A, { API, D, fail });   // kanvas ArchiMate + penerbit dokumen
    LiveLineage.install(A, { API, D, fail });   // lineage & impact
    LiveImport.install(A, { API, D, fail });   // impor CSV (di halaman penerbit)

    // --- aplikasi ---
    const appForm = A.appForm;
    A.appForm = () => {
      appForm();
      const sel = document.querySelector('#app-form select[name=platform]');
      if (sel) sel.innerHTML = '<option value="">— belum ditempatkan —</option>' + D.APPS.filter((a) => a.jenisNode === 'platform').map((a) => `<option>${esc(a.kode)}</option>`).join('');
      const canPlat = A.can('eaw.platform.write'), canAssign = A.can('eaw.workspace.assign');
      if (sel && !canAssign) sel.disabled = true;
      const tickets = D.ARB.filter((t) => t.status === 'APPROVED');
      document.getElementById('app-err').insertAdjacentHTML('beforebegin', `<div class="form-grid">
        <div class="field full"><label>Jenis node <span class="req">*</span></label><select class="select" name="jenisNode" onchange="App.nodeToggle(this.value)">
          <option value="workspace" ${canPlat ? '' : 'selected'}>Workspace (di bawah platform)</option>${canPlat ? '<option value="platform" selected>Platform (membawa profil UI/UX + tech stack)</option>' : ''}</select>
          <div class="tiny muted mt-s">Platform hanya dibentuk Enterprise Application Architect (eaw.platform.write). Workspace ditempatkan di platform oleh pemegang eaw.workspace.assign.</div></div>
        <div class="field full" id="grp-platform"><label>Standar UI/UX shell</label><input class="input" name="uiStandard" placeholder="mis. Shell Module Federation 2.0 + design system Kalla"></div>
        <div class="field full" id="grp-stack"><label>Tech stack</label><input class="input" name="techStack" placeholder="mis. NestJS 11, React 18, PostgreSQL 18, Keycloak"></div>
        <div class="field full" id="grp-arb" style="display:none"><label>Dasar pendaftaran: tiket ARB APPROVED</label><select class="select" name="arbClearanceId"><option value="">— tanpa tiket —</option>${tickets.map((t) => `<option value="${esc(t.id)}">${esc(t.no)} · ${esc(t.name)}</option>`).join('')}</select>
          ${canAssign ? '<label class="small row mt-s" style="gap:6px"><input type="checkbox" name="adopsi"> Workspace sudah ada sebelum EAP (adopsi, bebas tiket ARB)</label>' : ''}</div></div>`);
      A.nodeToggle(canPlat ? 'platform' : 'workspace');
    };
    A.nodeToggle = (v) => {
      const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
      show('grp-platform', v === 'platform'); show('grp-stack', v === 'platform'); show('grp-arb', v === 'workspace');
    };
    A.appSave = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const body = { kode: f.kode.trim().toUpperCase(), nama: f.nama, jenis: f.jenis, workspaceMode: f.mode, ownerBisnis: f.ob, timPengembang: f.ot, risikoAi: f.ai, slo: f.slo,
        entityId: entUuid(f.entity), repoGit: f.repo || undefined, platform: f.platform || undefined,
        jenisNode: f.jenisNode, uiStandard: f.uiStandard || undefined, techStack: f.techStack || undefined, arbClearanceId: f.arbClearanceId || undefined, adopsi: f.adopsi ? true : undefined };
      if (f.jenisNode === 'platform') delete body.platform;
      if (f.mode === 'FEDERATED_REMOTE') { body.federationScope = 'saoraja_' + body.kode.toLowerCase().replace(/[^a-z0-9]/g, '_'); body.remoteEntryUrl = `https://eap.kalla.id/${body.kode.toLowerCase()}/remoteEntry.js`; }
      Object.keys(body).forEach((k) => (body[k] === undefined || body[k] === '') && delete body[k]);
      try { await API.post('/api/v1/eaw/applications', body); A.closeAll(); A.toast('201 Created — aplikasi terdaftar', `${esc(body.kode)} berstatus Draf`, 'success'); await refresh(); }
      catch (err) { const el = document.getElementById('app-err'); if (el) el.innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(err))}</div></div>`; else fail(err); }
    };
    A.transition = async (k) => {
      const a = D.APPS.find((x) => x.kode === k); const to = NEXT[a.status];
      let catatan; if (['Ditetapkan', 'Direviu'].includes(to)) { catatan = prompt(`Catatan keputusan untuk ${a.status} → ${to} (min. 5 karakter, mis. nomor keputusan ARB):`); if (!catatan) return; }
      try { const r = await API.post(`/api/v1/eaw/applications/${a.id}/transition`, { to, catatan }); A.toast('Transisi tercatat', `${k}: ${a.status} → ${to}${r.warnings && r.warnings.length ? ' · ' + r.warnings.length + ' peringatan relasi' : ''}`, 'success'); await refresh(() => A.appDetail(k)); }
      catch (err) { fail(err); }
    };
    const appDetail = A.appDetail;
    A.appDetail = (k) => {
      appDetail(k); const a = D.APPS.find((x) => x.kode === k); const bd = document.querySelector('#drawer .drawer-bd');
      if (!a || !bd) return;
      if (a.jenisNode === 'platform') {
        bd.insertAdjacentHTML('beforeend', `<h3 class="mt">Profil platform</h3><dl class="dl mt-s"><dt>Standar UI/UX</dt><dd>${esc(a.uiStandard || '— (wajib sebelum Divalidasi)')}</dd><dt>Tech stack</dt><dd>${esc(a.techStack || '— (wajib sebelum Divalidasi)')}</dd><dt>Workspace</dt><dd>${D.APPS.filter((x) => x.platform === a.kode).map((x) => A.tag(x.kode)).join(' ') || '—'}</dd></dl>`);
      } else {
        bd.insertAdjacentHTML('beforeend', `<h3 class="mt">Penempatan workspace</h3><dl class="dl mt-s"><dt>Platform</dt><dd>${a.platform && a.platform !== '—' ? A.tag(a.platform) : '<span class="muted">belum ditempatkan</span>'}</dd><dt>Dasar</dt><dd>${a.adopsi ? 'adopsi (bebas tiket ARB)' : a.arbId ? 'tiket ARB ' + esc((D.ARB.find((t) => t.id === a.arbId) || {}).no || a.arbId.slice(0, 8)) : '<span class="muted">belum ada tiket ARB</span>'}</dd></dl>`);
        if (a.status === 'Draf' && A.can('eaw.workspace.assign')) {
          bd.insertAdjacentHTML('beforeend', `<div class="row mt-s"><select class="select" id="plat-sel"><option value="">— lepas penempatan —</option>${D.APPS.filter((x) => x.jenisNode === 'platform').map((x) => `<option ${x.kode === a.platform ? 'selected' : ''}>${esc(x.kode)}</option>`).join('')}</select><button class="btn sm" onclick="App.placeApp('${esc(k)}')">Tempatkan</button></div>`);
        }
      }
      if (a.status === 'Draf' && A.can('eaw.catalog.write')) {
        const pub = D.KRA.filter((r) => r.status === 'Dipublikasi');
        bd.insertAdjacentHTML('beforeend', `<h3 class="mt">Tautan KRA (syarat Divalidasi)</h3><div class="row mt-s"><select class="select" id="kra-sel"><option value="">— pilih referensi —</option>${pub.map((r) => `<option value="${r.id}" ${r.id === a.referensiId ? 'selected' : ''}>${esc(r.kode)} · ${esc(r.nama)}</option>`).join('')}</select><button class="btn sm" onclick="App.linkKra('${esc(k)}')">Tautkan</button></div>`);
      }
    };
    A.placeApp = async (k) => {
      const a = D.APPS.find((x) => x.kode === k); const v = document.getElementById('plat-sel').value;
      try { await API.post(`/api/v1/eaw/applications/${a.id}/platform`, { platform: v || null }, { ifMatch: `"${a.version}"` }); A.toast('Penempatan diperbarui', `${k} → ${v || 'belum ditempatkan'}`, 'success'); await refresh(() => A.appDetail(k)); } catch (err) { fail(err); }
    };
    A.linkKra = async (k) => {
      const a = D.APPS.find((x) => x.kode === k); const v = document.getElementById('kra-sel').value; if (!v) return;
      try { await API.patch(`/api/v1/eaw/applications/${a.id}`, { referensiId: v }, `"${a.version}"`); A.toast('KRA tertaut', k, 'success'); await refresh(() => A.appDetail(k)); } catch (err) { fail(err); }
    };
    A.modeEdit = async (k) => {
      const a = D.APPS.find((x) => x.kode === k); const mode = a.mode === 'FEDERATED_REMOTE' ? 'INTERNAL_ROUTED' : 'FEDERATED_REMOTE';
      const body = { workspaceMode: mode }; if (mode === 'FEDERATED_REMOTE') { body.federationScope = 'saoraja_' + a.kode.toLowerCase().replace(/[^a-z0-9]/g, '_'); body.remoteEntryUrl = `https://eap.kalla.id/${a.kode.toLowerCase()}/remoteEntry.js`; }
      try { await API.patch(`/api/v1/eaw/applications/${a.id}`, body, `"${a.version}"`); A.toast('workspace_mode diperbarui', `${k} → ${mode}`, 'success'); await refresh(); } catch (err) { fail(err); }
    };

    // --- ARB ---
    A.arbDecide = async (no, st) => {
      const t = D.ARB.find((x) => x.no === no); const n = document.getElementById('arb-note');
      try { const r = await API.post(`/api/v1/gov/arb/clearances/${t.id}/transition`, { to: st, notes: n && n.value ? n.value : undefined });
        A.toast('Putusan tercatat', `${no} → ${st}${r.certificate_id ? ' · sertifikat ' + esc(r.certificate_id) : ''}`, 'success'); A.closeAll(); await refresh(); }
      catch (err) { fail(err); }
    };


    // --- SET: Akun & penugasan peran ---
    const { pageHd, card, kpi, table, tag, pill } = A;
    const roleName = (c) => (D.ROLES.find((r) => r.code === c) || { name: c }).name;
    A.PAGES['set/users'] = () => {
      if (!D.LIVE_USERS) return { html: pageHd('Manajemen Akun Pengguna', 'Daftar akun memerlukan izin <code>set.account.read</code> (Auditor/SysAdmin).') + card('', '<div class="empty"><div class="big">🔒</div>Peran Anda tidak dapat melihat daftar akun (403 dari API).</div>') };
      const adm = A.can('set.users.admin');
      const rows = D.USERS;
      const assign = (u) => (u.assignments.length ? u.assignments.map((x) => `<div class="row small" style="gap:6px"><span>${esc(roleName(x.roleCode))}</span>${x.entityScope ? tag(x.entityScope) : '<span class="tiny muted">Holding-wide</span>'}${x.validUntil ? `<span class="tiny muted">s/d ${esc(String(x.validUntil).slice(0, 10))}</span>` : ''}${adm ? `<button class="btn sm ghost" title="Cabut" onclick="App.revokeRole('${esc(x.id)}')">✕</button>` : ''}</div>`).join('') : '<span class="small muted">Belum ada peran</span>');
      return { html: pageHd('Manajemen Akun Pengguna', 'Akun dibuat otomatis saat login pertama (JIT, tanpa peran). Hanya <code>idp_subject</code> + tautan CMP yang disimpan — 0 kolom PII (D-14); nama tampilan dari <code>ref.users</code>. Penugasan berlaku segera.',
        A.lockBtn('set.users.admin', '+ Tugaskan Peran', 'App.assignRole()', 'btn pri')) +
        `<div class="grid g4 mb">${kpi('Akun aktif', rows.filter((u) => u.active).length)}${kpi('Tanpa peran', rows.filter((u) => !u.assignments.length).length, { tgt: 'menunggu penugasan admin' })}${kpi('Kolom PII di set.users', '0', { tgt: 'NFR-09 · pii-guard' })}${kpi('Token', 'RS256', { tgt: 'exp ≤ 1 jam · D-13' })}</div>` +
        card('', `<div class="toolbar"><div class="search"><input class="input" placeholder="Cari username…" oninput="App.filterRows(this,'#tbl-users')"></div></div><div id="tbl-users">` + table([
          { h: 'Username ⓡ', v: (u) => `<b>${esc(u.uname)}</b><div class="tiny mono faint">${esc(u.sub.slice(0, 8))}…</div>` },
          { h: 'Peran & lingkup', v: assign },
          { h: 'Login terakhir', v: (u) => `<span class="small mono">${esc(u.last || '—')}</span>` },
          { h: 'Status', v: (u) => (u.active ? pill('aktif', 'b-ok') : pill('nonaktif', '')) },
          { h: '', v: (u) => A.lockBtn('set.users.admin', u.active ? 'Nonaktifkan' : 'Aktifkan', `App.toggleUser('${esc(u.uname)}')`, 'btn sm') }], rows) + '</div>', { flush: true }) };
    };
    A.toggleUser = async (name) => {
      const u = D.USERS.find((x) => x.uname === name);
      try { await API.patch(`/api/v1/set/users/${u.sub}`, { isActive: !u.active }); A.toast('Akun diperbarui', `${esc(name)} → ${u.active ? 'nonaktif' : 'aktif'}`, 'success'); await refresh(); } catch (err) { fail(err); }
    };
    A.assignRole = () => A.openModal(`<div class="drawer-hd"><h2>Tugaskan Peran (set.user_roles)</h2><button class="x" onclick="App.closeAll()">×</button></div>
      <form class="drawer-bd" id="role-form" onsubmit="App.roleSave(event)"><div class="form-grid">
      <div class="field full"><label>Pengguna</label><select class="select" name="userId">${D.USERS.map((u) => `<option value="${esc(u.sub)}">${esc(u.uname)}</option>`).join('')}</select></div>
      <div class="field"><label>Peran</label><select class="select" name="roleCode">${D.ROLES.filter((r) => r.code !== NONE).map((r) => `<option value="${esc(r.code)}">${esc(r.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Lingkup entitas (+ turunannya)</label><select class="select" name="entityScope"><option value="">Holding-wide (tanpa batas)</option>${D.ENTITIES.map((e) => `<option value="${esc(e.id)}">${esc(e.nama)}</option>`).join('')}</select></div>
      <div class="field"><label>Berlaku sampai (opsional)</label><input class="input" type="date" name="validUntil"></div></div><div id="role-err" class="mt"></div></form>
      <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('role-form').requestSubmit()">Tugaskan</button></div>`);
    A.roleSave = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const body = { userId: f.userId, roleCode: f.roleCode }; if (f.entityScope) body.entityScope = f.entityScope; if (f.validUntil) body.validUntil = new Date(f.validUntil + 'T23:59:59').toISOString();
      try { await API.post('/api/v1/set/user-roles', body); A.closeAll(); A.toast('Peran ditugaskan', `${esc(roleName(f.roleCode))}${f.entityScope ? ' · ' + esc(f.entityScope) : ' · holding-wide'}`, 'success'); await refresh(); }
      catch (err) { document.getElementById('role-err').innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(err))}</div></div>`; }
    };
    A.revokeRole = async (id) => {
      if (!confirm('Cabut penugasan peran ini? Jejak tetap tersimpan di audit trail.')) return;
      try { await API.del(`/api/v1/set/user-roles/${id}`); A.toast('Penugasan dicabut', '', 'success'); await refresh(); } catch (err) { fail(err); }
    };


    // --- Relasi antar-objek (EAW-05): kesiapan nyata + daftar/tambah/hapus relasi di detail aplikasi ---
    const RELMAP = { layanan: 'layanan', proses: 'proses', data: 'data', infra: 'infra', kontrol: 'kontrol' };
    const TT = { service: ['Layanan', 'services', ['serving', 'realization']], process: ['Proses', 'processes', ['serving', 'association']], data_entity: ['Entitas Data', 'data-entities', ['access']],
      infra_asset: ['Infrastruktur', 'infra-assets', ['assignment', 'association']], control: ['Kontrol Keamanan', 'controls', ['association']], application: ['Aplikasi lain', null, ['flow', 'serving', 'used-by']] };
    const QUICK = { service: (n) => ({ nama: n, tipe: 'internal', kategori: 'utama' }), process: (n) => ({ nama: n, level: 1 }), data_entity: (n) => ({ namaKanonikal: n, klasifikasi: 'internal' }),
      infra_asset: (n) => ({ nama: n, tipe: 'klaster-k8s' }), control: (n) => ({ aspek: n, statusPenerapan: 'belum' }) };
    const prevDetail = A.appDetail;
    A.appDetail = async (k) => {
      const a = D.APPS.find((x) => x.kode === k); if (!a) return;
      let rels = [];
      try {
        const [rd, rl] = await Promise.all([API.get(`/api/v1/eaw/readiness/application/${a.id}`), API.get('/api/v1/eaw/relations', { objekType: 'application', objekId: a.id })]);
        const rel = { layanan: 0, proses: 0, data: 0, infra: 0, kontrol: 0, kra: !!a.referensiId };
        rd.rules.forEach((r) => { if (RELMAP[r.rule]) rel[RELMAP[r.rule]] = r.n; });
        a.rel = rel; rels = rl.data;
      } catch (e) { /* tanpa izin eaw.model.read: tampilkan apa adanya */ }
      prevDetail(k);
      const bd = document.querySelector('#drawer .drawer-bd'); if (!bd) return;
      const editable = a.status === 'Draf' && A.can('eaw.model.write');
      bd.insertAdjacentHTML('beforeend', `<h3 class="mt">Relasi ArchiMate (${rels.length})</h3><div class="stack small mt-s">${rels.length ? rels.map((r) => {
        const out = r.sumberId === a.id; const other = out ? r.targetLabel || r.targetType : r.sumberLabel || r.sumberType;
        return `<div class="row"><span class="tag">${esc(r.tipe)}</span><span>${out ? '→' : '←'}</span><span style="flex:1">${esc(other)}</span><span class="tiny muted">${esc(out ? r.targetType : r.sumberType)}</span>${editable && out ? `<button class="btn sm ghost" title="Hapus relasi" onclick="App.relDel('${esc(r.id)}','${esc(k)}')">✕</button>` : ''}</div>`;
      }).join('') : '<span class="muted">Belum ada relasi.</span>'}</div>${editable ? `<div class="row mt-s">${Object.entries(TT).filter(([t]) => t !== 'application').map(([t, v]) => `<button class="btn sm" onclick="App.relForm('${esc(k)}','${t}')">+ ${v[0]}</button>`).join('')}</div>` : ''}`);
    };
    A.relDel = async (id, k) => { try { await API.del(`/api/v1/eaw/relations/${id}`); A.toast('Relasi dihapus', '', 'success'); await refresh(() => A.appDetail(k)); } catch (err) { fail(err); } };
    A.relForm = async (k, tt) => {
      const a = D.APPS.find((x) => x.kode === k); const [label, path, tipes] = TT[tt];
      let items = []; try { items = (await API.all(`/api/v1/eaw/objects/${path}`)).map((o) => ({ id: o.id, name: o.nama || o.namaKanonikal || o.aspek || o.layananUtama })); } catch (e) { /* tanpa izin baca */ }
      A.openModal(`<div class="drawer-hd"><h2>Hubungkan ${esc(a.kode)} → ${esc(label)}</h2><button class="x" onclick="App.closeAll()">×</button></div>
        <form class="drawer-bd" id="rel-form" onsubmit="App.relSave(event,'${esc(k)}','${tt}')"><div class="form-grid">
          <div class="field"><label>Tipe relasi</label><select class="select" name="tipe">${tipes.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
          <div class="field"><label>${esc(label)} yang ada</label><select class="select" name="targetId"><option value="">— pilih —</option>${items.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></div>
          <div class="field full"><label>…atau buat ${esc(label)} baru (isi nama; atribut lain dilengkapi di API/halaman domain)</label><input class="input" name="baru" placeholder="nama ${esc(label.toLowerCase())}"></div></div><div id="rel-err" class="mt"></div></form>
        <div class="drawer-ft"><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('rel-form').requestSubmit()">Hubungkan</button></div>`);
    };
    A.relSave = async (e, k, tt) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const a = D.APPS.find((x) => x.kode === k);
      try {
        let target = f.targetId;
        if (!target && f.baru) { const o = await API.post(`/api/v1/eaw/objects/${TT[tt][1]}`, { entityId: entUuid(a.entity), ...QUICK[tt](f.baru) }); target = o.id; }
        if (!target) { document.getElementById('rel-err').innerHTML = '<div class="callout err"><span class="ic">✕</span><div>Pilih objek yang ada atau isi nama objek baru.</div></div>'; return; }
        await API.post('/api/v1/eaw/relations', { sumberType: 'application', sumberId: a.id, targetType: tt, targetId: target, tipe: f.tipe });
        A.closeAll(); A.toast('Relasi dibuat', `${esc(k)} → ${esc(TT[tt][0])}`, 'success'); await refresh(() => A.appDetail(k));
      } catch (err) { document.getElementById('rel-err').innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(err))}</div></div>`; }
    };

    // --- ADR ---
    A.adrForm = () => A.openModal(`<div class="drawer-hd"><h2>ADR Baru</h2><button class="x" onclick="App.closeAll()">×</button></div><form class="drawer-bd" id="adr-form" onsubmit="App.adrSave(event)"><div class="form-grid">
      <div class="field"><label>Kode <span class="req">*</span></label><input class="input" name="adrCode" required placeholder="ADR-EAP-016"></div>
      <div class="field full"><label>Judul <span class="req">*</span></label><input class="input" name="title" required></div>
      <div class="field full"><label>Konteks <span class="req">*</span></label><textarea class="textarea" name="context" required></textarea></div>
      <div class="field full"><label>Keputusan <span class="req">*</span></label><textarea class="textarea" name="decision" required></textarea></div></div><div id="adr-err" class="mt"></div></form>
      <div class="drawer-ft"><span class="small muted" style="margin-right:auto">Status awal: <b>Proposed</b> — hanya ARB yang dapat menerima.</span><button class="btn" onclick="App.closeAll()">Batal</button><button class="btn pri" onclick="document.getElementById('adr-form').requestSubmit()">Simpan</button></div>`);
    A.adrSave = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try { await API.post('/api/v1/eaw/adrs', f); A.closeAll(); A.toast('ADR tersimpan', esc(f.adrCode), 'success'); await refresh(); }
      catch (err) { document.getElementById('adr-err').innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(err))}</div></div>`; }
    };
  }

  async function start() {
    const live = API.live();
    if (live) {
      try {
        boot('Memuat SAORAJA EAP…');
        if (Oidc.enabled()) await Oidc.handleCallback();
        if (!API.token()) {
          if (Oidc.enabled()) { boot('Mengalihkan ke login Keycloak…'); return Oidc.login(); }
          return boot('<div><b>Login diperlukan.</b><br>Buka dengan <code>?api=http://localhost:3100&amp;oidc=http://localhost:8180/realms/keis</code></div>');
        }
        var ctx = await load();
      } catch (e) {
        return boot(`<div><b>Gagal memuat mode live</b><br>${esc(API.explain(e))}<br><br><button onclick="Oidc.clear();location.href='index.html'">Coba lagi</button></div>`);
      }
    }
    await loadSeq(SCRIPTS);
    if (live) wire(ctx);
    document.getElementById('boot')?.remove();
    fireReady();
    if (live) setTimeout(() => window.App.toast('Mode live', `Terhubung ke ${esc(API.base())} sebagai ${esc(ctx.me.username)}`, 'success'), 400);
  }
  start();
})();
