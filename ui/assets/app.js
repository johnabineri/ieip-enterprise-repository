/* SAORAJA EAP — Unified App Shell (prototype). Core: state, helpers, charts, shell, router. */
(function () {
  const D = window.DB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('saoraja.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('saoraja.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  const S = {
    role: store.get('role', 'ROLE_EAP_ARB_CHAIR'),
    entity: store.get('entity', 'KALLA'),
    theme: store.get('theme', 'auto'),
  };

  /* ---------- helpers ---------- */
  const STATUS_CLS = { Draf: 'b-draf', Divalidasi: 'b-val', Ditetapkan: 'b-tet', Dipublikasi: 'b-pub', Direviu: 'b-rev' };
  const badge = (s) => `<span class="badge ${STATUS_CLS[s] || ''}">${esc(s)}</span>`;
  const pill = (txt, cls = '') => `<span class="badge ${cls}">${esc(txt)}</span>`;
  const tag = (txt, cls = '') => `<span class="tag ${cls}">${esc(txt)}</span>`;
  const modeTag = (m) => m === 'FEDERATED_REMOTE' ? tag('MF 2.0', 'mf') : tag('INTERNAL', 'ir');
  const idr = (n) => 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
  const ent = (id) => D.ENTITIES.find((e) => e.id === id) || { nama: id };
  const dom = (id) => D.DOMAINS.find((d) => d.id === id);
  const ikaPill = (v) => { const l = Math.floor(v); return `<span class="ika" title="IKA ${v.toFixed(1)}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</span>`; };
  const lifecycle = (status) => {
    const i = D.STATUS.indexOf(status);
    return `<div class="lifecycle">${D.STATUS.map((s, k) => `${k ? '<span class="lc-line"></span>' : ''}<span class="lc-step ${k < i ? 'done' : k === i ? 'cur' : ''}"><span class="c">${k < i ? '✓' : k + 1}</span>${s}</span>`).join('')}</div>`;
  };
  const role = () => D.ROLES.find((r) => r.code === S.role);
  const can = (p) => (D.RP[S.role] || []).includes(p);
  const lockBtn = (perm, label, onclick, cls = 'btn') => can(perm)
    ? `<button class="${cls}" onclick="${onclick}">${label}</button>`
    : `<button class="${cls}" onclick="App.deny('${perm}')" title="Butuh izin ${perm}" aria-disabled="true" style="opacity:.55"><span class="lock">🔒</span>${label}</button>`;
  function deny(perm) {
    D.AUDIT.unshift({ id: D.AUDIT[0].id + 1, t: now(), sch: 'set', tbl: 'access_denied', act: 'insert', by: currentUser().uname, rec: perm, ch: '403 Forbidden — di luar lingkup peran ' + S.role });
    toast('403 — Akses ditolak', `Peran ${role().name} tidak memiliki izin <code>${perm}</code>. Percobaan dicatat di audit trail (EAW-07).`, 'error');
  }
  const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const currentUser = () => D.USERS.find((u) => u.role === S.role) || D.USERS[0];

  function toast(title, msg, type = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<b>${title}</b>${msg ? `<div class="small muted">${msg}</div>` : ''}`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4800);
  }

  /* ---------- overlays ---------- */
  function openDrawer(html) { $('#drawer').innerHTML = html; $('#drawer').classList.add('on'); $('#overlay').classList.add('on'); }
  function openModal(html) { $('#modal').innerHTML = html; $('#modal').classList.add('on'); $('#overlay').classList.add('on'); }
  function closeAll() {
    ['#drawer', '#modal', '#overlay', '#cmdk', '#pop-notif', '#pop-user'].forEach((s) => $(s).classList.remove('on'));
    $('#nav').classList.remove('on');
  }

  /* ---------- charts (inline SVG) ---------- */
  const Chart = {
    line(series, { w = 560, h = 200, max, min = 0, labels = [], color = 'var(--accent)', target, fmt = (v) => v } = {}) {
      const pad = { l: 36, r: 12, t: 12, b: 26 };
      const mx = max ?? Math.max(...series) * 1.15;
      const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, series.length - 1);
      const y = (v) => pad.t + (1 - (v - min) / (mx - min)) * (h - pad.t - pad.b);
      const ticks = 4; let g = '';
      for (let i = 0; i <= ticks; i++) { const v = min + ((mx - min) * i) / ticks; g += `<line class="grid-l" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(+v.toFixed(1))}</text>`; }
      const pts = series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      const area = `${pad.l},${y(min)} ${pts} ${x(series.length - 1)},${y(min)}`;
      const tl = target != null ? `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(target)}" y2="${y(target)}" stroke="var(--ok)" stroke-dasharray="4 4"/><text x="${w - pad.r}" y="${y(target) - 5}" text-anchor="end" style="fill:var(--ok)">target ${fmt(target)}</text>` : '';
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${g}${tl}<polygon points="${area}" fill="${color}" opacity=".12"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${series.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="var(--surface)" stroke="${color}" stroke-width="2"><title>${labels[i] || ''}: ${fmt(v)}</title></circle>`).join('')}${labels.map((l, i) => `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`).join('')}</svg>`;
    },
    bars(items, { w = 560, h = 210, max, color = 'var(--d2)', fmt = (v) => v } = {}) {
      const pad = { l: 8, r: 8, t: 18, b: 34 };
      const mx = max ?? Math.max(...items.map((i) => i.v)) * 1.15;
      const bw = (w - pad.l - pad.r) / items.length;
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${items.map((it, i) => {
        const bh = (it.v / mx) * (h - pad.t - pad.b); const x = pad.l + i * bw + bw * 0.18; const y = h - pad.b - bh;
        return `<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${bh}" rx="4" fill="${it.c || color}"><title>${esc(it.l)}: ${fmt(it.v)}</title></rect><text x="${x + bw * 0.32}" y="${y - 5}" text-anchor="middle" style="fill:var(--text);font-weight:700">${fmt(it.v)}</text><text x="${x + bw * 0.32}" y="${h - 14}" text-anchor="middle">${esc(it.l)}</text>`;
      }).join('')}<line class="grid-l" x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}"/></svg>`;
    },
    donut(parts, { size = 150, label = '', sub = '' } = {}) {
      const tot = parts.reduce((a, p) => a + p.v, 0); let acc = 0; const r = 52, c = 2 * Math.PI * r;
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${parts.filter((p) => p.v > 0).map((p) => { const len = (p.v / tot) * c; const s = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.c}" stroke-width="18" stroke-dasharray="${len - 1.5} ${c - len + 1.5}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(p.l)}: ${p.v}</title></circle>`; acc += len; return s; }).join('')}
        <text x="50%" y="48%" text-anchor="middle" style="font-size:24px;font-weight:800;fill:var(--text)">${label}</text><text x="50%" y="62%" text-anchor="middle" style="font-size:11px;fill:var(--muted)">${sub}</text></svg>`;
    },
    spark(vals, { w = 120, h = 32, color = 'var(--accent)' } = {}) {
      const mx = Math.max(...vals), mn = Math.min(...vals); const x = (i) => (i * w) / (vals.length - 1); const y = (v) => h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6);
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
    },
    hbar(label, v, max, { color = 'var(--accent)', target, fmt = (x) => x } = {}) {
      return `<div class="hbar"><span title="${esc(label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span><div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%;background:${color}"></i>${target != null ? `<span class="tgt" style="left:${(target / max) * 100}%" title="target ${target}"></span>` : ''}</div><span class="v">${fmt(v)}</span></div>`;
    },
  };
  const ikaColor = (v) => v >= 3.5 ? 'var(--ok)' : v >= 2.5 ? 'var(--d2)' : v >= 1.8 ? 'var(--warn)' : 'var(--err)';
  const heatBg = (v) => `color-mix(in srgb, ${ikaColor(v)} ${Math.round(18 + (v / 5) * 50)}%, var(--surface))`;

  /* ---------- workspaces & navigation (PRD §3.3) ---------- */
  const WS = [
    { id: 'eaw', code: 'EAW', name: 'Enterprise Architecture Workbench', mode: 'MF 2.0', port: 5171, desc: 'Pemodelan 6 domain, APM, KRA, ARB & ADR', groups: [
      ['Ringkasan', [['dashboard', '1.1', 'Dashboard Arsitektur']]],
      ['6 Domain SAORAJA', [['proses', '1.2', 'D1 · Proses Bisnis'], ['data', '1.3', 'D2 · Data & Informasi'], ['layanan', '1.4', 'D3 · Layanan Enterprise'], ['aplikasi', '1.5', 'D4 · Aplikasi & Integrasi'], ['infra', '1.6', 'D5 · Infrastruktur'], ['keamanan', '1.7', 'D6 · Keamanan Informasi']]],
      ['Pemodelan', [['kanvas', 'EAW-01', 'Kanvas ArchiMate 3.2'], ['lineage', 'EAW-03', 'Lineage & Impact'], ['kerangka', 'EAW-05', 'Framework Builder'], ['kra', 'EAW-06', 'KRA Manager']]],
      ['Tata Kelola', [['arb', '1.8', 'ARB Clearance'], ['roadmap', '1.9', 'Peta Rencana & Roadmap'], ['adr', '1.10', 'Architecture Decisions'], ['publisher', 'EAW-09', 'Penerbit Dokumen']]],
    ] },
    { id: 'gse', code: 'GSE', name: 'Generative Software Engineering', mode: 'MF 2.0', port: 5172, desc: 'Scaffold full-stack → branch + PR (≤ 45 dtk)', groups: [
      ['Engine', [['proyek', '2.1', 'Proyek Scaffolding'], ['template', '2.2', 'Template & Blueprint'], ['flow', '2.3', 'Agent & Saga Flow Builder'], ['ide', '2.4', 'Web IDE & Prompt'], ['pr', '2.5', 'Multi-Git PR & Pipeline']]],
    ] },
    { id: 'req', code: 'REQ', name: 'Requirement Elicitation Assistant', mode: 'MF 2.0', port: 5173, desc: 'Elisitasi AI ter-guardrail → User Story + Gherkin', groups: [
      ['Asisten', [['sesi', '3.1', 'Sesi Elisitasi'], ['story', '3.2', 'User Story & Gherkin'], ['ekspor', '3.3', 'Ekspor Spesifikasi']]],
    ] },
    { id: 'console', code: 'CONSOLE', name: 'Enterprise Control Console', mode: 'MF 2.0', port: 5174, desc: 'IKA, AI register, FinOps, EIO, observability', groups: [
      ['Governance', [['ika', '4.1', 'Skor Kematangan IKA'], ['ai', '4.2', 'AI Model & Risk Register'], ['finops', '4.3', 'FinOps Console']]],
      ['Operasi', [['eio', '4.4', 'EIO Control Center'], ['obs', '4.5', 'Observability & SLO'], ['security', '4.6', 'Security Center']]],
    ] },
    { id: 'set', code: 'SET', name: 'Settings & RBAC', mode: 'INTERNAL', port: 5170, desc: 'Organisasi, akun (idp_subject), 13 role, audit', groups: [
      ['Administrasi', [['org', '5.1', 'Struktur Organisasi'], ['users', '5.2', 'Akun Pengguna'], ['roles', '5.3', 'Roles & Permissions'], ['api', '5.4', 'API Client & Secrets'], ['audit', '5.5', 'Audit Trail']]],
    ] },
  ];
  const navLabel = (ws, page) => { for (const [, items] of ws.groups) for (const it of items) if (it[0] === page) return it; return null; };

  /* ---------- shell rendering ---------- */
  function renderHeader() {
    $('#ws-tabs').innerHTML = WS.map((w) => `<button class="ws-tab" data-ws="${w.id}" onclick="location.hash='#/${w.id}/${w.groups[0][1][0][0]}'">${w.code}<span class="mode">${w.mode}</span></button>`).join('');
    $('#entity-sel').innerHTML = D.ENTITIES.filter((e) => e.tingkat !== 'unit').map((e) => `<option value="${e.id}" ${e.id === S.entity ? 'selected' : ''}>${e.tingkat === 'holding' ? '' : e.tingkat === 'ecosystem' ? '— ' : '—— '}${esc(e.nama)}</option>`).join('');
    const u = currentUser();
    $('#avatar').textContent = u.uname.slice(0, 2).toUpperCase();
  }
  function renderNav(wsId, page) {
    const ws = WS.find((w) => w.id === wsId);
    $('#nav').innerHTML = `<div class="nav-ws"><span class="code">${ws.code} · ${ws.mode === 'MF 2.0' ? 'FEDERATED_REMOTE' : 'INTERNAL_ROUTED'} · :${ws.port}</span><h2>${ws.name}</h2><p>${ws.desc}</p></div>` +
      ws.groups.map(([g, items]) => `<div class="nav-group">${g}</div>` + items.map(([id, num, label]) => `<a href="#/${wsId}/${id}" class="${id === page ? 'on' : ''}" title="${num} · ${label}"><span class="num">${num}</span><span class="lbl">${label}</span>${id === 'arb' ? `<span class="cnt">${D.ARB.filter((a) => ['SUBMITTED', 'IN_REVIEW'].includes(a.status)).length}</span>` : ''}</a>`).join('')).join('') +
      `<div class="nav-foot"><b>Peran aktif</b><br>${esc(role().name)}<br><span class="tiny mono">${S.role}</span><br><a href="#" onclick="App.userMenu();return false">Ganti peran (demo RBAC) →</a></div>`;
    $$('.ws-tab').forEach((t) => t.classList.toggle('on', t.dataset.ws === wsId));
  }

  /* ---------- router ---------- */
  const PAGES = {};
  function route() {
    const [, wsId = 'eaw', page = 'dashboard'] = (location.hash || '#/eaw/dashboard').split('/');
    const ws = WS.find((w) => w.id === wsId) || WS[0];
    const key = `${ws.id}/${page}`;
    const P = PAGES[key] || PAGES['eaw/dashboard'];
    renderNav(ws.id, page);
    const lbl = navLabel(ws, page);
    const t0 = performance.now();
    const main = $('#main');
    const out = P();
    main.innerHTML = `<div class="page"><div class="crumb"><span>SAORAJA</span><span>${ws.code}</span><span>${lbl ? lbl[2] : ''}</span></div>${out.html}</div>`;
    main.scrollTop = 0;
    if (out.mount) out.mount(main);
    document.title = `${lbl ? lbl[2] : ws.code} · SAORAJA EAP`;
    $('#perf').textContent = `${(performance.now() - t0).toFixed(0)}ms`;
    closeAll();
  }
  const pageHd = (title, sub, acts = '') => `<div class="page-hd"><div class="ttl"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  const card = (title, body, { meta = '', acts = '', flush = false, cls = '' } = {}) => `<section class="card ${cls}">${title ? `<div class="card-hd"><h2>${title}</h2>${meta ? `<span class="meta">${meta}</span>` : ''}${acts}</div>` : ''}<div class="card-bd ${flush ? 'flush' : ''}">${body}</div></section>`;
  const kpi = (lbl, val, { delta, up = true, tgt } = {}) => `<div class="card kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div>${delta ? `<div class="delta ${up ? 'up' : 'dn'}">${delta}</div>` : ''}${tgt ? `<div class="tgt">${tgt}</div>` : ''}</div>`;
  const table = (cols, rows, { click } = {}) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${click ? 'click' : ''}" ${click ? `onclick="${click(r, i)}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.v(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const tabs = (id, items, active) => `<div class="tabs" role="tablist">${items.map(([k, l]) => `<button class="tab ${k === active ? 'on' : ''}" onclick="App.tab('${id}','${k}')">${l}</button>`).join('')}</div>`;
  const TABSTATE = {};
  function tab(id, k) { TABSTATE[id] = k; route(); }

  /* ---------- command palette (Ctrl+K) ---------- */
  let cmdSel = 0, cmdItems = [];
  function openCmdk() { closeAll(); $('#cmdk').classList.add('on'); $('#overlay').classList.add('on'); const i = $('#cmdk-in'); i.value = ''; renderCmdk(''); setTimeout(() => i.focus(), 20); }
  function renderCmdk(q) {
    q = q.toLowerCase().trim();
    const nav = []; WS.forEach((w) => w.groups.forEach(([, its]) => its.forEach(([id, num, l]) => nav.push({ sec: 'Navigasi', ty: w.code, label: l, sub: num, go: `#/${w.id}/${id}` }))));
    const apps = D.APPS.map((a) => ({ sec: 'Katalog Aplikasi (EAW)', ty: 'app', label: `${a.kode} · ${a.nama}`, sub: a.status, go: '#/eaw/aplikasi', act: () => window.App.appDetail(a.kode) }));
    const adrs = D.ADR.map((a) => ({ sec: 'ADR', ty: 'adr', label: `${a.code} · ${a.title}`, sub: a.status, go: '#/eaw/adr' }));
    const feed = D.SEARCH_FEED.map((f) => ({ sec: 'Master SEDDI · GET /api/v1/search/index-feed', ty: f.type, label: f.label, sub: f.sub, act: () => toast('Membuka ' + esc(f.label.split(' · ')[0]), 'Navigasi lintas platform PANRITA via SEDDI index-feed', 'info') }));
    const all = [...nav, ...apps, ...adrs, ...feed];
    cmdItems = (q ? all.filter((x) => (x.label + ' ' + x.ty + ' ' + x.sub).toLowerCase().includes(q)) : [...nav.slice(0, 8), ...feed.slice(0, 5)]).slice(0, 40);
    cmdSel = 0;
    let sec = '', html = '';
    cmdItems.forEach((x, i) => { if (x.sec !== sec) { sec = x.sec; html += `<div class="cmdk-sec">${esc(sec)}</div>`; } html += `<div class="cmdk-item ${i === 0 ? 'sel' : ''}" data-i="${i}" onmouseenter="App.cmdHover(${i})" onclick="App.cmdGo(${i})"><span class="ty">${esc(x.ty)}</span><span style="flex:1">${esc(x.label)}</span><span class="tiny faint">${esc(x.sub)}</span></div>`; });
    $('#cmdk-list').innerHTML = html || `<div class="empty"><div class="big">∅</div>Tidak ada hasil untuk “${esc(q)}”</div>`;
  }
  function cmdHover(i) { cmdSel = i; $$('.cmdk-item').forEach((e) => e.classList.toggle('sel', +e.dataset.i === i)); }
  function cmdGo(i) { const x = cmdItems[i]; if (!x) return; closeAll(); if (x.go) location.hash = x.go; if (x.act) setTimeout(x.act, 60); }

  /* ---------- popovers ---------- */
  function notifMenu() {
    const p = $('#pop-notif'); const on = p.classList.contains('on'); closeAll(); if (on) return;
    p.innerHTML = `<div class="card-hd"><h2>Notifikasi lintas modul</h2><button class="btn sm ghost" onclick="App.toast('Semua ditandai dibaca','', 'success');document.querySelector('#notif-dot').style.display='none'">Tandai dibaca</button></div><div class="list">${D.NOTIFS.map((n) => `<a class="li" href="#/${n.route}" style="color:inherit;text-decoration:none"><span class="ic">${n.ic}</span><span class="bd"><span class="t">${esc(n.t)}</span><span class="d" style="display:block">${esc(n.d)}</span></span><span class="tiny faint">${n.w}</span></a>`).join('')}</div>`;
    p.classList.add('on');
  }
  function userMenu() {
    const p = $('#pop-user'); const on = p.classList.contains('on'); closeAll(); if (on) return;
    const u = currentUser();
    p.innerHTML = `<div class="card-bd"><div class="row"><span class="avatar" style="width:40px;height:40px">${u.uname.slice(0, 2).toUpperCase()}</span><div><b>${u.uname}</b><div class="tiny muted">profil tampilan dari <code>ref.users</code> (CDC ← kalla_cmp.iam.users)</div></div></div>
      <dl class="dl mt" style="grid-template-columns:110px 1fr"><dt>idp_subject</dt><dd class="mono tiny">${u.sub}</dd><dt>Token</dt><dd><span class="tag">RS256</span> <span class="tag">exp ≤ 1 jam</span></dd><dt>Lingkup</dt><dd>${u.scope ? esc(ent(u.scope).nama) : 'Holding-wide'}</dd></dl>
      <div class="field mt"><label>Peran aktif (demo RBAC — 13 role resmi)</label><select class="select" onchange="App.setRole(this.value)">${D.ROLES.map((r) => `<option value="${r.code}" ${r.code === S.role ? 'selected' : ''}>${r.name}</option>`).join('')}</select><span class="hint">Tombol aksi akan terkunci/terbuka sesuai izin <code>&lt;workspace&gt;.&lt;modul&gt;.&lt;aksi&gt;</code>.</span></div>
      <div class="field mt"><label>Tema</label><div class="chips">${['auto', 'light', 'dark'].map((t) => `<button class="chip ${S.theme === t ? 'on' : ''}" onclick="App.setTheme('${t}')">${{ auto: 'Sistem', light: 'Terang', dark: 'Gelap' }[t]}</button>`).join('')}</div></div>
      <div class="row mt"><button class="btn sm" onclick="App.toast('Bahasa: English','UI dwibahasa ID/EN (EAW-01 AC-6)','info')">ID / EN</button><button class="btn sm right" onclick="App.toast('Keluar','Sesi SSO Keycloak diakhiri (OIDC logout)','info')">Keluar</button></div></div>`;
    p.classList.add('on');
  }
  function setRole(r) { S.role = r; store.set('role', r); renderHeader(); route(); toast('Peran diganti', role().name, 'success'); }
  function setTheme(t) { S.theme = t; store.set('theme', t); applyTheme(); userMenu(); userMenu(); }
  function applyTheme() { if (S.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', S.theme); }
  function setEntity(v) { S.entity = v; store.set('entity', v); toast('Konteks entitas', `setTenantContext() → ${ent(v).nama}`, 'info'); route(); }

  /* ---------- MIND copilot ---------- */
  const MIND = [
    [/downtime|makassar|on-?prem|server/i, 'Analisis dependensi (graf eaw.relation, 6 domain):\n\nJika **DC On-Prem Makassar — Klaster K8s Prod** down, terdampak:\n• Aplikasi: EAW, GSE, CONSOLE, SEDDI-CMP, PULSE, ASI (6)\n• Layanan: Penjualan Kendaraan Baru, Booking Servis Mobil, Cuti & Izin, Slip Gaji\n• Proses L1: Penjualan Mobil Baru, Hire-to-Retire\n• Failover: DR Site Jakarta (warm standby, RTO ≤ 4 jam)\n\nBuka Lineage & Impact untuk graf lengkap → #/eaw/lineage'],
    [/redundan|duplik|crm|mirip/i, 'Pre-ARB Screening terakhir:\n• ARB-2026-0027 Vendor Portal BK → 91% mirip VANTAGE ⛔\n• ARB-2026-0021 CRM Showroom HK → 86% mirip FORGE (ditolak)\n• ARB-2026-0028 Data Lake BSB → 77% mirip PANRITA-OLP ⚠\n\nAmbang rekomendasi duplikasi: ≥ 75% (K-03).'],
    [/drift|shadow|bayangan/i, 'Drift Detector (scan harian Git + APISIX):\n• DB "crm_local_hk" tidak terdaftar di EAW (shadow IT)\n• Endpoint /v1/legacy/vendors di gateway tanpa kontrak OpenAPI\n• Repo git.kalla/bsu-tools tanpa entri eaw.application\n\nRekomendasi: daftarkan atau dekomisi dalam 14 hari.'],
    [/ika|kematangan|matur/i, 'IKA grup saat ini 2,6 (naik dari 1,0 sejak Juni).\nTertinggi: Holding 3,4 · Kalla Automotive 3,1\nTerendah: Cahaya Bone PO 1,0 · PT Bumi Lintas Tama 1,2\nTarget Fase 3: L3 platform umum, L2 ERP vertikal (SAF §8.3).'],
    [/af-06|gate|scaffold/i, 'Gate AF-06: GSE hanya berjalan untuk aplikasi di katalog EAW berstatus minimal Divalidasi.\nSaat ini 7 aplikasi masih Draf → scaffolding diblokir: AEGIS, OPTIMA, CORE, VANGUARD, ASM, AV, AEPS.'],
  ];
  function copilot(prompt) {
    const c = $('#copilot'); c.classList.toggle('on', prompt !== undefined ? true : !c.classList.contains('on'));
    if (prompt) { $('#cp-in').value = prompt; askMind(); }
    if (c.classList.contains('on')) setTimeout(() => $('#cp-in').focus(), 30);
  }
  function addMsg(box, cls, text, meta) { const m = document.createElement('div'); m.className = 'msg ' + cls; m.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(#\/[a-z/]+)/g, '<a href="$1">$1</a>') + (meta ? `<span class="meta">${meta}</span>` : ''); box.appendChild(m); box.scrollTop = box.scrollHeight; return m; }
  function guardCheck(q) {
    if (/abaikan (semua )?instruksi|ignore (all )?previous|jailbreak|pura-pura|roleplay|system prompt/i.test(q)) return { eng: 'OPA/Rego', why: 'Terdeteksi pola prompt injection / roleplay jailbreak (REQ-03).' };
    if (/resep|masak|sepak ?bola|film|gosip|zodiak|lagu|pacar|saham gorengan/i.test(q)) return { eng: 'NeMo Guardrails', why: 'Topik di luar arsitektur & perancangan sistem korporat (D-03 hard fencing).' };
    return null;
  }
  function askMind() {
    const i = $('#cp-in'); const q = i.value.trim(); if (!q) return; i.value = '';
    const box = $('#cp-chat'); addMsg(box, 'u', q);
    const g = guardCheck(q);
    if (g) { D.GUARD_LOG.unshift({ t: now().slice(11), eng: g.eng.split(' ')[0], ms: 30 + Math.round(Math.random() * 60), user: currentUser().uname, ws: 'MIND', kat: g.eng.startsWith('OPA') ? 'jailbreak' : 'off-topic', ex: q.slice(0, 60) }); addMsg(box, 'sys', `⛔ Diblokir oleh ${g.eng}. ${g.why}`, `eval ${30 + Math.round(Math.random() * 60)}ms · tercatat di Security Center`); return; }
    const typing = addMsg(box, 'a', '…');
    setTimeout(() => { const hit = MIND.find(([re]) => re.test(q)); typing.remove(); addMsg(box, 'a', hit ? hit[1] : 'Saya MIND Architecture Copilot. Saya dapat menjawab dependensi teknis, redundansi aplikasi, drift arsitektur, skor IKA, dan status gate AF-06. Coba: “Aplikasi apa saja yang terdampak jika server On-Prem Makassar downtime?”', 'claude-sonnet-5-5 via LiteLLM · TTFT 612ms · guardrail ✓ 44ms'); }, 650);
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); return; }
    if (e.key === 'Escape') { closeAll(); $('#copilot').classList.remove('on'); }
    if ($('#cmdk').classList.contains('on')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdHover(Math.min(cmdItems.length - 1, cmdSel + 1)); $('.cmdk-item.sel')?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdHover(Math.max(0, cmdSel - 1)); $('.cmdk-item.sel')?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); cmdGo(cmdSel); }
    }
  });

  window.App = { D, S, $, $$, esc, badge, pill, tag, modeTag, idr, ent, dom, ikaPill, ikaColor, heatBg, lifecycle, can, lockBtn, deny, now, currentUser, role,
    toast, openDrawer, openModal, closeAll, Chart, PAGES, pageHd, card, kpi, table, tabs, tab, TABSTATE, route, store,
    openCmdk, renderCmdk, cmdHover, cmdGo, notifMenu, userMenu, setRole, setTheme, setEntity, copilot, askMind, guardCheck, addMsg, WS };

  window.addEventListener('DOMContentLoaded', () => {
    applyTheme(); renderHeader();
    $('#cp-chat').innerHTML = '';
    addMsg($('#cp-chat'), 'a', 'Halo, saya MIND — Architecture Copilot SAORAJA. Tanyakan dependensi, redundansi, drift, atau kematangan arsitektur.', 'Domain-fenced · NeMo + OPA fail-closed');
    window.addEventListener('hashchange', route);
    route();
  });
})();
