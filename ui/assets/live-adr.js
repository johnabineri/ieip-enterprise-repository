/* =====================================================================
   SAORAJA EAP — ADR → Git (EAW-04), mode live: drawer ADR nyata dengan pratinjau Markdown, publikasi ke Git (branch + PR/MR), riwayat PR, dan keputusan ARB.
   ADR bawaan SAF (D-01..D-14, tanpa id) tetap memakai drawer contoh. Dipasang oleh live.js setelah semua halaman; menggantikan A.adrView.
   ===================================================================== */
window.LiveAdr = (function () {
  let A, API, D, fail;
  let CUR = null;                                   // ADR yang sedang dibuka di drawer: handler tidak menerima data lewat string JS di atribut HTML (anti-XSS)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLS = { Proposed: 'b-info', Accepted: 'b-ok', Deprecated: 'b-warn', Superseded: '' };
  const PR = { github: 'PR', gitlab: 'MR' };
  const fmt = (d) => String(d || '').slice(0, 10);

  async function view(code) {
    const a = (D.ADR || []).find((x) => x.code === code);
    if (!a || !a.id) return origView(code);
    let r, g = { configured: false, data: [] }, st = { configured: false };
    try { r = await API.get(`/api/v1/eaw/adrs/${a.id}`); } catch (e) { return fail(e); }
    try { g = await API.get(`/api/v1/eaw/adrs/${a.id}/git`); } catch (e) { /* tanpa izin baca */ }
    try { st = await API.get('/api/v1/eaw/adrs/git/status'); } catch (e) { /* idem */ }
    CUR = { id: r.id, code: r.adrCode };
    const last = g.data[0];
    const canPub = A.can('eaw.adr.write') && st.configured;
    const hist = g.data.length ? g.data.map((h) => `<div class="row small" style="gap:8px"><span class="badge ${CLS[h.adrStatus] || ''}">${esc(h.adrStatus)}</span><a href="${esc(h.prUrl)}" target="_blank" rel="noopener noreferrer">${PR[h.provider] || 'PR'} #${h.prNumber} ↗</a><code class="tiny">${esc(h.branch)}</code><span class="muted" style="margin-left:auto">${esc(fmt(h.createdAt))}</span></div>`).join('') : '<span class="muted small">Belum pernah diterbitkan ke Git.</span>';
    A.openDrawer(`<div class="drawer-hd"><div><div class="row"><span class="tag">${esc(r.adrCode)}</span>${A.pill(r.status, CLS[r.status])}</div><h2 class="mt-s">${esc(r.title)}</h2><p class="small muted">${esc(fmt(r.createdAt))}${r.gitRef ? ' · ' + esc(r.gitRef) : ''}</p></div><button class="x" onclick="App.closeAll()">×</button></div>
      <div class="drawer-bd"><h3>Konteks</h3><p class="small mt-s" style="white-space:pre-wrap">${esc(r.context)}</p><h3 class="mt">Keputusan</h3><p class="small mt-s" style="white-space:pre-wrap">${esc(r.decision)}</p>
        ${r.consequences ? `<h3 class="mt">Konsekuensi</h3><p class="small mt-s" style="white-space:pre-wrap">${esc(r.consequences)}</p>` : ''}
        <h3 class="mt">Berkas Git (EAW-04)</h3>
        ${st.configured ? `<div class="tiny muted mb">Repositori <code>${esc(st.repo)}</code> · ${esc(st.provider)} · folder <code>${esc(st.dir)}</code></div>` : '<div class="callout info"><span class="ic">ℹ</span><div>Repositori ADR belum dikonfigurasi di API (<code>ADR_GIT_REPO</code> + <code>GITHUB_TOKEN</code> atau <code>GITLAB_URL</code>/<code>GITLAB_TOKEN</code>).</div></div>'}
        <div class="stack mt-s">${hist}</div>
        ${last && last.contentSha256 ? `<div class="tiny muted mt-s">sha256 terakhir: <code>${esc(last.contentSha256.slice(0, 16))}…</code></div>` : ''}
        <div id="adr-md" class="mt"></div>
        <div class="callout info mt"><span class="ic">ℹ</span><div>Setiap penerbitan membuat <b>branch baru + PR/MR</b> (tanpa push/merge ke cabang utama). Isi yang sama dengan penerbitan terakhir ditolak. Berkas dihasilkan dari EAP — ubah ADR di EAP, bukan di Git.</div></div></div>
      <div class="drawer-ft"><button class="btn" onclick="App.adrMd()">Pratinjau Markdown</button>
        ${r.status === 'Proposed' ? A.lockBtn('eaw.arb.approve', 'Terima (Accepted)', "App.adrStatus('Accepted')", 'btn') : ''}${r.status === 'Accepted' ? A.lockBtn('eaw.arb.approve', 'Deprecate', "App.adrStatus('Deprecated')", 'btn') : ''}
        <button class="btn pri" ${canPub ? '' : 'disabled'} title="${canPub ? '' : 'Butuh izin eaw.adr.write dan konfigurasi repositori ADR'}" onclick="App.adrPublish()">⇧ Terbitkan ke Git (PR/MR)</button></div>`);
  }
  let origView = () => {};
  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail; origView = A.adrView || origView;
    A.adrView = view;
    A.adrMd = async () => { if (!CUR) return; const id = CUR.id; try { const m = await API.get(`/api/v1/eaw/adrs/${id}/markdown`); const b = document.getElementById('adr-md'); if (b) b.innerHTML = `<div class="tiny muted mb"><code>${esc(m.path)}</code> · sha256 <code>${esc(m.sha256.slice(0, 16))}…</code></div><pre class="code" style="max-height:260px;overflow:auto">${esc(m.content)}</pre>`; } catch (e) { fail(e); } };
    A.adrPublish = async () => {
      if (!CUR) return; const { id, code } = CUR;
      if (!confirm(`Terbitkan ${code} ke Git? Dibuat branch baru + PR/MR (tidak ada push ke cabang utama).`)) return;
      try { const r = await API.post(`/api/v1/eaw/adrs/${id}/git`, {}); A.toast('ADR diterbitkan ke Git', `${PR[r.provider] || 'PR'} #${r.prNumber} dibuka`, 'success'); await A.route(); A.adrView(code); }
      catch (e) { fail(e); }
    };
    A.adrStatus = async (status) => {
      if (!CUR || !['Accepted', 'Deprecated'].includes(status)) return; const { id, code } = CUR;
      if (!confirm(`Ubah status ${code} menjadi ${status}? (keputusan ARB)`)) return;
      try { await API.post(`/api/v1/eaw/adrs/${id}/status`, { status }); A.toast('Status ADR diperbarui', `${esc(code)} → ${status}`, 'success'); await A.route(); A.adrView(code); } catch (e) { fail(e); }
    };
  }
  return { install };
})();
