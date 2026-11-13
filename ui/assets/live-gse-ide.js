/* =====================================================================
   SAORAJA EAP — GSE-05 (mode live): editor kode proyek scaffold (Monaco) + commit ke feature branch.
   Data: /api/v1/gse/projects/:id/workspace[/file|/commit|/commits]. Suntingan = revisi append-only di server (berkas hasil generate tidak
   berubah); konkurensi lewat baseRevision (409 bila didahului penyunting lain). Push pertama (Proyek → Push) membuat cabang + PR dari isi
   ruang kerja; commit berikutnya fast-forward ke cabang yang sama. Gerbang lokal (pii-guard, manifest, pemindai rahasia, ukuran) harus lulus;
   lint/build/SCA/SBOM dijalankan CI pada PR. Monaco dimuat dari cdnjs (0.52.0); bila gagal, editor jatuh ke <textarea> agar tetap bisa dipakai.
   Konflik (409): server mengirim USULAN penggabungan 3-arah (dasar · milik Anda · terbaru) — status clean/conflict/deleted/unavailable. Editor
   berganti ke tampilan diff (kiri = terbaru di server, kanan = hasil gabungan yang dapat disunting). Tidak ada yang tersimpan sebelum pengguna
   menekan "Simpan hasil gabungan" (baseRevision = revisi terbaru, merged=true, mergeBase = revisi dasar asal). Penanda konflik yang tersisa boleh
   disimpan tetapi gerbang `conflict-markers` memblokir commit.
   Dipasang oleh live.js SETELAH LiveGse.install (menimpa A.PAGES['gse/ide'] dan A.gseOpenIde).
   ===================================================================== */
window.LiveGseIde = (function () {
  let A, API, fail;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VS = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs';
  const S = { sel: null, path: null, ws: null, file: null, editor: null, fallback: false, saved: '', busy: false, merge: null };
  const MARK_RE = /^<<<<<<< /gm;
  const countMarks = (t) => (String(t).match(MARK_RE) || []).length;
  let monacoP = null;

  function loadMonaco() {
    if (window.monaco) return Promise.resolve(window.monaco);
    if (monacoP) return monacoP;
    monacoP = new Promise((ok, no) => {
      // worker lintas-asal: bungkus lewat blob same-origin yang importScripts dari CDN. baseUrl = folder INDUK "vs" (…/min/), bukan …/min/vs/
      // — salah satu tingkat membuat worker bahasa (tsWorker) dicari di …/vs/vs/… dan gagal (terjadi pada uji 2026-11-05).
      const MIN = VS.replace(/\/vs$/, '');
      window.MonacoEnvironment = { getWorkerUrl: () => URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${MIN}/'};importScripts('${VS}/base/worker/workerMain.js');`], { type: 'text/javascript' })) };
      const s = document.createElement('script'); s.src = `${VS}/loader.min.js`; s.crossOrigin = 'anonymous';
      s.onload = () => { window.require.config({ paths: { vs: VS } }); window.require(['vs/editor/editor.main'], () => ok(window.monaco), no); };
      s.onerror = () => no(new Error('Monaco tidak dapat dimuat dari CDN'));
      document.head.appendChild(s);
    }).catch((e) => { monacoP = null; throw e; });
    return monacoP;
  }

  const dirtyLocal = () => !!S.merge || (S.file && current() !== S.saved);
  const current = () => (S.editor ? (S.fallback ? S.editor.value : S.editor.getValue()) : S.saved);
  const confirmLeave = () => !dirtyLocal() || confirm(S.merge ? 'Penggabungan belum disimpan. Tinggalkan dan buang suntingan Anda?' : 'Ada perubahan yang belum disimpan pada berkas ini. Buang perubahan?');

  async function page() {
    const box = document.getElementById('gse-body'); if (!box) return;
    disposeMerge();
    try {
      const list = (await API.get('/api/v1/gse/projects', { limit: 100 })).data.filter((p) => p.fileCount > 0);
      if (!list.length) { box.innerHTML = A.card('', '<div class="empty"><div class="big">∅</div>Belum ada proyek dengan berkas.</div>'); return; }
      if (!S.sel || !list.some((p) => p.id === S.sel)) { S.sel = list[0].id; S.path = null; }
      S.ws = await API.get(`/api/v1/gse/projects/${S.sel}/workspace`);
      const live = S.ws.files.filter((f) => !f.deleted);
      if (!S.path || !live.some((f) => f.path === S.path)) S.path = live.length ? live[0].path : null;
      S.file = S.path ? await API.get(`/api/v1/gse/projects/${S.sel}/workspace/file`, { path: S.path }) : null;
      S.saved = S.file ? S.file.content : '';
      render(box, list);
      await mountEditor();
    } catch (e) { box.innerHTML = `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`; }
  }

  function render(box, list) {
    const ws = S.ws; const ed = ws.editable;
    const gates = Object.entries(ws.gates).map(([k, g]) => `<span class="badge ${g.status === 'ok' ? 'b-ok' : g.status === 'err' ? 'b-err' : ''}" title="${esc(g.detail)}">${esc(k)}: ${esc(g.status)}</span>`).join(' ');
    const gateErr = Object.values(ws.gates).some((g) => g.status === 'err');
    const shown = ws.files.filter((f) => !f.deleted || f.dirty);
    const base = ws.baseline ? `${A.pill(ws.baseline.kind === 'commit' ? 'commit terakhir' : 'sudah di-push', 'b-info')} <span class="tiny mono">${esc(ws.baseline.ref)} @ ${esc(String(ws.baseline.commitSha).slice(0, 8))}</span>` : A.pill('belum di-push', '');
    box.innerHTML = `<div class="row mb" style="flex-wrap:wrap;gap:8px">
        <select class="select" onchange="App.gseIdeSel(this.value)">${list.map((p) => `<option value="${esc(p.id)}" ${p.id === S.sel ? 'selected' : ''}>${esc(p.kode)} · ${esc(p.branch)}</option>`).join('')}</select>
        ${base}${ed ? '' : ' ' + A.pill(ws.status === 'blocked' ? 'diblokir AF-06 — baca saja' : 'baca saja (butuh gse.project.run)', 'b-warn')}
        <span style="margin-left:auto"></span>
        ${ed ? `<button class="btn sm" onclick="App.gseIdeNew()">+ Berkas</button><button class="btn sm" ${S.file ? '' : 'disabled'} onclick="App.gseIdeDelete()">Hapus</button><button class="btn sm pri" id="ide-save" ${S.file ? '' : 'disabled'} onclick="App.gseIdeSave()" title="Ctrl+S">Simpan</button>` : ''}
        <button class="btn sm" onclick="App.gseBundle(${window.jsArg(S.sel)},${window.jsArg(list.find((p) => p.id === S.sel).kode)})">⇩ Bundel</button>
        ${ed ? `<button class="btn sm ${ws.changes.length && !gateErr && ws.baseline ? 'pri' : ''}" onclick="App.gseIdeCommit()">⇧ Commit (${ws.changes.length})</button>` : ''}</div>
      <div class="ide"><div class="ft">${shown.map((x) => `<div class="${x.path === S.path ? 'on' : ''}" ${x.deleted ? 'style="opacity:.55;text-decoration:line-through"' : `onclick="App.gseIdeFile(${window.jsArg(x.path)})"`} title="${esc(x.path)}${x.origin === 'ai' ? ' — dihasilkan AI, wajib reviu' : ''}">${x.dirty ? '<span style="color:var(--warn)">●</span> ' : ''}${esc(x.path.split('/').pop())}${x.origin === 'ai' ? ' <span class="tiny" style="color:var(--info)">AI</span>' : ''}${x.source === 'edit' && !x.deleted ? ' <span class="tiny faint">✎</span>' : ''}<div class="tiny faint">${esc(x.path.split('/').slice(0, -1).join('/'))}</div></div>`).join('')}</div>
        <div class="ed"><div class="etabs"><div class="etab on" id="ide-tab">${esc(S.path ? S.path.split('/').pop() : '—')}</div></div>
          <div id="ide-editor" style="flex:1;min-height:0"></div>
          <div class="status"><span>${esc(S.file ? S.file.language : '')}</span><span>UTF-8</span><span>${ed ? 'dapat disunting' : 'baca saja'}</span><span id="ide-state"></span><span style="margin-left:auto">${S.file ? `${S.file.bytes} B · ${S.file.revisionId ? 'rev ' + S.file.revisionId : 'asli'}` : ''}</span></div></div></div>
      <div class="grid g2 mt">${A.card('Gerbang lokal ruang kerja', `<div class="row" style="flex-wrap:wrap;gap:6px">${gates}</div><div class="tiny muted mt-s">lint/build/SCA/SBOM dijalankan pipeline CI pada PR (bukan di EAP). Kode — terutama berkas AI — wajib direviu manusia sebelum merge.</div>`)}
        ${A.card(`Perubahan belum di-commit (${ws.changes.length})`, ws.changes.length ? `<div class="stack small">${ws.changes.map((c) => `<div class="row"><span class="badge ${c.action === 'delete' ? 'b-err' : c.action === 'create' ? 'b-ok' : 'b-info'}">${esc(c.action)}</span><code class="tiny">${esc(c.path)}</code></div>`).join('')}</div>` : '<span class="small muted">Ruang kerja sama dengan commit terakhir.</span>')}</div>`;
  }

  async function mountEditor() {
    const el = document.getElementById('ide-editor'); if (!el) return;
    if (S.editor && !S.fallback) S.editor.dispose(); S.editor = null;
    if (!S.file) { el.innerHTML = '<div class="empty small" style="color:#8A9AAD">Tidak ada berkas.</div>'; return; }
    const ro = !S.ws.editable;
    try {
      const monaco = await loadMonaco();
      if (!document.body.contains(el)) return;                                                     // halaman sudah berganti
      S.fallback = false;
      S.editor = monaco.editor.create(el, { value: S.file.content, language: S.file.language, theme: 'vs-dark', readOnly: ro, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, tabSize: 2 });
      S.editor.onDidChangeModelContent(markState);
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save());
    } catch (e) {
      S.fallback = true;
      el.innerHTML = '<textarea class="textarea mono" style="width:100%;height:100%;border:0;border-radius:0;background:#0E1621;color:#E6EDF3;resize:none"></textarea>';
      S.editor = el.firstChild; S.editor.value = S.file.content; S.editor.readOnly = ro; S.editor.oninput = markState;
      S.editor.onkeydown = (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); save(); } };
      A.toast('Editor sederhana', 'Monaco tidak dapat dimuat dari CDN — memakai editor teks biasa.', 'info');
    }
    markState();
  }
  function markState() { const st = document.getElementById('ide-state'); if (st) st.innerHTML = dirtyLocal() ? '<span style="color:var(--warn)">● belum disimpan</span>' : ''; }

  async function save() {
    if (!S.file || S.busy || !S.ws.editable) return;
    if (!dirtyLocal()) { A.toast('Tidak ada perubahan', S.path, 'info'); return; }
    S.busy = true;
    try {
      await API.put(`/api/v1/gse/projects/${S.sel}/workspace/file`, { path: S.path, content: current(), baseRevision: S.file.revisionId });
      A.toast('Tersimpan', `${S.path} (revisi baru)`, 'success'); S.busy = false; await page();
    } catch (e) {
      S.busy = false;
      if (e.status === 409 && e.body && e.body.merge) await openMerge(e.body, current());
      else if (e.status === 409) { if (confirm(`${API.explain(e)}\n\nMuat ulang versi terbaru dari server? Suntingan Anda di berkas ini akan hilang — salin dulu bila perlu.`)) await page(); }
      else fail(e);
    }
  }
  async function newFile() {
    const p = (prompt('Path berkas baru (relatif, mis. src/fitur/baru.ts):') || '').trim(); if (!p) return;
    if (!confirmLeave()) return;
    try { await API.put(`/api/v1/gse/projects/${S.sel}/workspace/file`, { path: p, content: '', baseRevision: null }); S.path = p; A.toast('Berkas dibuat', p, 'success'); await page(); }
    catch (e) { fail(e); }
  }
  async function del() {
    if (!S.file || !confirm(`Hapus ${S.path} dari ruang kerja? (tercatat sebagai revisi; ikut terhapus di cabang pada commit berikutnya)`)) return;
    const go = (base) => API.del(`/api/v1/gse/projects/${S.sel}/workspace/file?path=${encodeURIComponent(S.path)}&baseRevision=${base ?? ''}`);
    try { await go(S.file.revisionId); A.toast('Berkas dihapus', S.path, 'success'); S.path = null; await page(); }
    catch (e) {
      // berkas diubah penyunting lain sejak dibuka: tunjukkan bahwa isi TERBARU-lah yang akan terhapus, lalu minta konfirmasi ulang
      const m = e.status === 409 && e.body && e.body.merge;
      if (!m || m.status !== 'modified') return fail(e);
      const preview = String(m.theirs.content ?? '').split('\n').slice(0, 12).join('\n');
      if (!confirm(`${S.path} sudah diubah penyunting lain (rev ${m.theirs.revisionId}). Awal isi terbarunya:\n\n${preview}\n\nTetap hapus versi terbaru ini?`)) { await page(); return; }
      try { await go(e.body.currentRevision); A.toast('Berkas dihapus', S.path, 'success'); S.path = null; await page(); } catch (e2) { fail(e2); }
    }
  }
  async function commit() {
    if (dirtyLocal() && !confirm('Berkas yang sedang dibuka belum disimpan dan TIDAK akan ikut commit. Lanjutkan?')) return;
    const ws = S.ws;
    if (!ws.baseline) { A.toast('Belum di-push', 'Push pertama dari halaman Proyek Scaffolding (membuat cabang fitur + PR dari isi ruang kerja ini).', 'info'); return; }
    if (!ws.changes.length) { A.toast('Tidak ada perubahan', 'Ruang kerja sama dengan commit terakhir.', 'info'); return; }
    const msg = prompt(`Pesan commit untuk ${ws.changes.length} perubahan ke ${ws.baseline.ref}:`, `chore(gse): ubah ${ws.changes.length} berkas lewat editor EAP`);
    if (msg === null) return;
    try {
      const r = await API.post(`/api/v1/gse/projects/${S.sel}/workspace/commit`, { message: msg.trim() || undefined });
      A.toast('Commit terkirim', `${r.files.length} berkas → ${r.branch} @ ${String(r.commitSha).slice(0, 8)}`, 'success'); await page();
    } catch (e) { fail(e); }
  }

  /* ---------------- penggabungan 3-arah ---------------- */
  function disposeMerge() {
    if (S.merge && S.merge.diff) { try { const md = S.merge.diff.getModel(); S.merge.diff.dispose(); md && md.original.dispose(); md && md.modified.dispose(); } catch (e) { /* abaikan */ } }
    S.merge = null;
  }
  const mergedText = () => (!S.merge ? '' : S.merge.diff ? S.merge.diff.getModifiedEditor().getValue() : (document.getElementById('ide-merge-ta') || {}).value || '');

  /** body = problem 409 dari server; mine = isi editor saat simpan. */
  async function openMerge(body, mine) {
    const m = body.merge; const ed = document.querySelector('#gse-body .ed'); if (!ed) return;
    if (S.editor && !S.fallback) S.editor.dispose(); S.editor = null;
    disposeMerge();
    S.merge = { status: m.status, current: body.currentRevision, mergeBase: S.file ? S.file.revisionId : null, mine, theirs: m.theirs, diff: null };
    const tagCls = { clean: 'b-ok', conflict: 'b-err', deleted: 'b-warn', unavailable: 'b-warn' }[m.status] || '';
    const tagTxt = { clean: 'tergabung otomatis — tinjau', conflict: `${m.conflicts} konflik perlu diselesaikan`, deleted: 'berkas dihapus penyunting lain', unavailable: 'tidak dapat digabung otomatis' }[m.status] || m.status;
    const note = m.status === 'deleted'
      ? 'Penyunting lain menghapus berkas ini setelah Anda membukanya. Pulihkan dengan versi Anda, atau terima penghapusan.'
      : m.status === 'unavailable'
        ? `Penggabungan otomatis tidak dicoba (${esc(m.reason || 'alasan tidak diketahui')}). Kanan berisi versi Anda — samakan manual dengan versi terbaru di kiri.`
        : 'Kiri: versi terbaru di server (baca saja). Kanan: hasil gabungan suntingan Anda dengan versi terbaru — dapat disunting. Belum ada yang tersimpan.';
    const btns = m.status === 'deleted'
      ? `<button class="btn sm pri" onclick="App.gseMergeMine()">Pulihkan dengan versi saya</button><button class="btn sm" onclick="App.gseMergeTheirs()">Terima penghapusan</button>`
      : `<button class="btn sm pri" onclick="App.gseMergeSave()" title="Ctrl+S">Simpan hasil gabungan</button>${m.status === 'conflict' ? '<button class="btn sm" onclick="App.gseMergeNext()">Konflik berikutnya ↓</button>' : ''}
         <button class="btn sm" onclick="App.gseMergeMine()" title="Menimpa perubahan penyunting lain">Pakai versi saya</button><button class="btn sm" onclick="App.gseMergeTheirs()" title="Membuang suntingan Anda">Pakai versi terbaru</button>`;
    ed.innerHTML = `<div class="etabs"><div class="etab on">⇄ ${esc(S.path ? S.path.split('/').pop() : '')}</div></div>
      <div class="row" style="flex-wrap:wrap;gap:6px;padding:8px 10px;background:var(--surface-2);border-bottom:1px solid var(--line)">
        <span class="badge ${tagCls}">${esc(tagTxt)}</span><span class="tiny muted" style="flex:1;min-width:240px">${note}</span>${btns}</div>
      ${m.status === 'deleted' ? '' : `<div class="row tiny muted" style="padding:4px 10px"><span style="flex:1">Terbaru di server · rev ${esc(String(m.theirs.revisionId ?? 'asli'))}</span><span style="flex:1">Hasil gabungan · dapat disunting <span id="ide-merge-left"></span></span></div>`}
      <div id="ide-merge" style="flex:1;min-height:0"></div>
      <div class="status"><span>dasar: ${esc(String(S.merge.mergeBase ?? 'asli'))}</span><span>terbaru: ${esc(String(m.theirs.revisionId ?? 'asli'))}</span><span id="ide-state"><span style="color:var(--warn)">● penggabungan belum disimpan</span></span></div>`;
    const host = document.getElementById('ide-merge');
    if (m.status === 'deleted') { host.innerHTML = '<div class="empty small" style="color:#8A9AAD">Berkas tidak ada lagi di ruang kerja.</div>'; return; }
    const proposed = m.status === 'unavailable' ? mine : m.content;
    try {
      const monaco = await loadMonaco();
      if (!document.body.contains(host) || !S.merge) return;
      const lang = (S.file && S.file.language) || 'plaintext';
      S.merge.diff = monaco.editor.createDiffEditor(host, { theme: 'vs-dark', automaticLayout: true, readOnly: false, originalEditable: false, renderSideBySide: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false });
      S.merge.diff.setModel({ original: monaco.editor.createModel(m.theirs.content ?? '', lang), modified: monaco.editor.createModel(proposed, lang) });
      const mod = S.merge.diff.getModifiedEditor();
      mod.onDidChangeModelContent(markMerge); mod.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveMerge());
      if (m.status === 'conflict') setTimeout(() => nextConflict(), 50);
    } catch (e) {
      host.innerHTML = `<div class="grid g2" style="height:100%"><pre class="mono tiny" style="margin:0;overflow:auto;background:#0E1621;color:#9FB0C3;padding:8px">${esc(m.theirs.content ?? '')}</pre>
        <textarea id="ide-merge-ta" class="textarea mono" style="width:100%;height:100%;border:0;border-radius:0;background:#0E1621;color:#E6EDF3;resize:none"></textarea></div>`;
      const ta = document.getElementById('ide-merge-ta'); ta.value = proposed; ta.oninput = markMerge;
      ta.onkeydown = (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveMerge(); } };
    }
    markMerge();
  }
  function markMerge() { const el = document.getElementById('ide-merge-left'); if (el) { const n = countMarks(mergedText()); el.innerHTML = n ? `· <span style="color:var(--err)">${n} konflik tersisa</span>` : '· <span style="color:var(--ok)">tanpa penanda konflik</span>'; } }
  function nextConflict() {
    if (!S.merge || !S.merge.diff) return;
    const ed = S.merge.diff.getModifiedEditor(); const model = ed.getModel(); const from = ed.getPosition() ? ed.getPosition().lineNumber : 1;
    const n = model.getLineCount(); let hit = 0;
    for (let i = 1; i <= n && !hit; i++) { const ln = ((from + i - 1) % n) + 1; if (/^<<<<<<< /.test(model.getLineContent(ln))) hit = ln; }
    if (hit) { ed.revealLineInCenter(hit); ed.setPosition({ lineNumber: hit, column: 1 }); ed.focus(); } else A.toast('Tidak ada konflik tersisa', 'Semua penanda konflik sudah diselesaikan.', 'success');
  }
  async function putMerged(content, merged) {
    const body = { path: S.path, content, baseRevision: S.merge.current };
    if (merged) Object.assign(body, { merged: true, mergeBase: S.merge.mergeBase });
    try {
      await API.put(`/api/v1/gse/projects/${S.sel}/workspace/file`, body);
      A.toast(merged ? 'Hasil gabungan tersimpan' : 'Versi Anda tersimpan', S.path, 'success'); disposeMerge(); await page();
    } catch (e) {
      // didahului LAGI saat meninjau → usulan baru di atas revisi yang lebih baru (dasar tetap revisi asal)
      if (e.status === 409 && e.body && e.body.merge) { const base = S.merge.mergeBase; await openMerge(e.body, content); if (S.merge) S.merge.mergeBase = base; A.toast('Didahului lagi', 'Ada perubahan baru — usulan penggabungan diperbarui.', 'info'); }
      else fail(e);
    }
  }
  async function saveMerge() {
    if (!S.merge || S.busy || S.merge.status === 'deleted') return;
    const text = mergedText(); const n = countMarks(text);
    if (n && !confirm(`Masih ada ${n} konflik bertanda. Simpan apa adanya? (bisa diselesaikan nanti, tetapi commit diblokir gerbang conflict-markers sampai selesai)`)) return;
    S.busy = true; try { await putMerged(text, true); } finally { S.busy = false; }
  }
  async function useMine() {
    if (!S.merge) return;
    if (!confirm(S.merge.status === 'deleted' ? 'Pulihkan berkas dengan versi Anda?' : 'Timpa versi terbaru dengan versi Anda? Perubahan penyunting lain pada berkas ini akan hilang dari ruang kerja (tetap ada di riwayat revisi).')) return;
    S.busy = true; try { await putMerged(S.merge.mine, false); } finally { S.busy = false; }
  }
  async function useTheirs() {
    if (!S.merge || !confirm('Buang suntingan Anda dan pakai versi terbaru dari server?')) return;
    const gone = S.merge.status === 'deleted'; disposeMerge(); if (gone) S.path = null; await page();
  }

  function install(app, ctx) {
    A = app; API = ctx.API; fail = ctx.fail;
    const pg = () => ({ html: A.pageHd('Editor Kode Proyek (GSE-05)', 'Sunting berkas hasil scaffold, simpan sebagai revisi (berkas hasil generate tetap utuh), lalu commit ke feature branch proyek — tidak pernah ke main (D-02). Gerbang lokal wajib lulus; CI berjalan di PR.') + '<div id="gse-body"><div class="small muted">Memuat…</div></div>', mount: page });
    A.PAGES['gse/ide'] = pg;
    A.gseOpenIde = (id) => { if (!confirmLeave()) return; A.closeAll(); S.sel = id; S.path = null; location.hash = '#/gse/ide'; if (location.hash === '#/gse/ide') A.route(); };
    A.gseIdeSel = (v) => { if (!confirmLeave()) return; S.sel = v; S.path = null; A.route(); };
    A.gseIdeFile = (p) => { if (p === S.path || !confirmLeave()) return; S.path = p; page(); };
    A.gseIdeSave = save; A.gseIdeNew = newFile; A.gseIdeDelete = del; A.gseIdeCommit = commit;
    A.gseMergeSave = saveMerge; A.gseMergeNext = nextConflict; A.gseMergeMine = useMine; A.gseMergeTheirs = useTheirs;
  }
  return { install };
})();
