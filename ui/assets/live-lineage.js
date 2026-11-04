/* =====================================================================
   SAORAJA EAP — Lineage & Impact (EAW-03), mode live: graf relasi EAW nyata + analisis dampak transitif (/api/v1/eaw/lineage, /eaw/impact).
   Arah ketergantungan diturunkan di DB (eaw.dependency_edge). Objek di luar cakupan dihitung tetapi isinya tidak dibuka. Dipasang oleh live.js.
   ===================================================================== */
window.LiveLineage = (function () {
  let A, API, D, fail;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errBox = (e) => (e.status === 403 ? '<div class="callout warn"><span class="ic">🔒</span><div>Peran Anda tidak memiliki izin <code>eaw.model.read</code>.</div></div>' : `<div class="callout err"><span class="ic">✕</span><div>${esc(API.explain(e))}</div></div>`);
  const COLS = [['process', 'Proses Bisnis'], ['service', 'Layanan'], ['application', 'Aplikasi'], ['data_entity', 'Data'], ['infra_asset', 'Infrastruktur'], ['control', 'Kontrol']];
  const TYPE_LABEL = Object.fromEntries(COLS);
  const S = { entityId: '', direction: 'impact', maxDepth: 10, sel: null, graph: null, impact: null };

  function svg() {
    const g = S.graph; const W = 1060, cw = W / COLS.length; const pos = {}; const hit = new Map();
    if (S.impact) S.impact.nodes.forEach((n) => hit.set(`${n.type}:${n.id}`, n.depth));
    const edgeHit = new Set(S.impact ? S.impact.edges.map((e) => e.from + '>' + e.to) : []);
    let rows = 1;
    COLS.forEach(([t], ci) => { const ns = g.nodes.filter((n) => n.type === t).sort((a, b) => a.label.localeCompare(b.label)); rows = Math.max(rows, ns.length); ns.forEach((n, ri) => { pos[n.key] = [ci * cw + 12, 44 + ri * 54]; }); });
    const H = 60 + rows * 54;
    const st = (k) => (!S.impact ? '' : hit.get(k) === 0 ? 'src' : hit.has(k) ? 'hit' : 'dim');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:900px"><defs><marker id="lar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)"/></marker></defs>
      ${COLS.map(([, l], ci) => `<text x="${ci * cw + 12}" y="24" class="lane-lbl">${l}</text>`).join('')}
      ${g.edges.map((e) => { const a = pos[e.from], b = pos[e.to]; if (!a || !b) return ''; const on = edgeHit.has(e.from + '>' + e.to); const cls = !S.impact ? '' : on ? 'hit' : 'dim'; const x1 = a[0] + cw - 40, y1 = a[1] + 18, x2 = b[0] - 6, y2 = b[1] + 18;
        const d = a[0] === b[0] ? `M${a[0] + cw - 40} ${a[1] + 18} C${a[0] + cw - 5} ${a[1] + 18}, ${a[0] + cw - 5} ${b[1] + 18}, ${b[0] + cw - 40} ${b[1] + 18}` : x1 < x2 ? `M${x1} ${y1} C${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}` : `M${a[0]} ${y1} C${a[0] - 30} ${y1}, ${b[0] + cw - 10} ${y2}, ${b[0] + cw - 40} ${y2}`;
        return `<path class="lin-edge ${cls}" d="${d}" marker-end="url(#lar)"><title>${esc(e.tipe)}</title></path>`; }).join('')}
      ${g.nodes.map((n) => { const [x, y] = pos[n.key]; return `<g class="lin-node ${st(n.key)}" onclick="App.linSel('${esc(n.type)}','${esc(n.id)}')"><rect x="${x}" y="${y}" width="${cw - 40}" height="36" rx="7"/><text x="${x + 10}" y="${y + 22}">${esc(n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label)}</text><title>${esc(n.label)} · ${esc(n.status)} · ${esc(n.entityCode)}</title></g>`; }).join('')}</svg>`;
  }
  function side() {
    const im = S.impact;
    if (!im) return A.card('Analisis Dampak', '<div class="empty"><div class="big">⚠</div>Klik sebuah node untuk melihat siapa yang terdampak bila objek itu berubah atau gagal (atau penyedia apa yang dibutuhkannya).</div>');
    const dir = im.direction === 'impact';
    const aff = im.nodes.filter((n) => n.depth > 0).sort((a, b) => a.depth - b.depth || String(a.label).localeCompare(String(b.label)));
    const st = { Draf: 'b-draf', Divalidasi: 'b-val', Ditetapkan: 'b-tet', Dipublikasi: 'b-pub', Direviu: 'b-rev' };
    return A.card(dir ? `Dampak perubahan: ${esc(im.root.label)}` : `Dependensi: ${esc(im.root.label)}`, `<div class="callout ${aff.length ? 'err' : 'ok'} mb"><span class="ic">${aff.length ? '⚠' : '✓'}</span><div><b>${im.summary.total} objek ${dir ? 'terdampak' : 'dibutuhkan'}</b> (${Object.entries(im.summary.byType).map(([t, n]) => `${n} ${esc(TYPE_LABEL[t] || t)}`).join(', ') || '—'})${im.summary.hidden ? ` · <b>${im.summary.hidden}</b> di luar cakupan akses Anda (isi tidak dibuka)` : ''}${im.truncated ? ' · <b>hasil terpotong</b> (batas 1000 node)' : ''}.</div></div>
      ${im.summary.baseline ? `<p class="small mb"><b>${im.summary.baseline}</b> di antaranya sudah berstatus baseline (Ditetapkan atau lebih) — perubahan memerlukan reviu AF-07.</p>` : ''}
      ${aff.length ? A.table([{ h: 'Objek', v: (n) => (n.hidden ? '<span class="muted small">(di luar cakupan)</span>' : esc(n.label)) }, { h: 'Jenis', v: (n) => esc(TYPE_LABEL[n.type] || n.type) }, { h: 'Jarak', num: 1, v: (n) => n.depth }, { h: 'Status', v: (n) => (n.status ? `<span class="badge ${st[n.status] || ''}">${esc(n.status)}</span>` : '—') }], aff) : ''}`,
      { acts: `<button class="btn sm" onclick="App.linClear()">Bersihkan</button>` });
  }
  async function mount() {
    const box = document.getElementById('lin-body'); if (!box) return;
    try {
      S.graph = await API.get('/api/v1/eaw/lineage', { entityId: S.entityId || undefined });
      box.innerHTML = `<div class="row mb" style="gap:8px;flex-wrap:wrap"><select class="select" onchange="App.linSet('entityId',this.value)"><option value="">Semua entitas</option>${D.ENTITIES.map((e) => `<option value="${esc(e.uuid)}" ${e.uuid === S.entityId ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}</select>
        <div class="chips"><label class="chip"><input type="radio" name="lind" ${S.direction === 'impact' ? 'checked' : ''} onchange="App.linSet('direction','impact')"> Dampak (siapa bergantung)</label><label class="chip"><input type="radio" name="lind" ${S.direction === 'dependencies' ? 'checked' : ''} onchange="App.linSet('direction','dependencies')"> Dependensi (apa yang dibutuhkan)</label></div>
        <label class="small row" style="gap:6px">Kedalaman <select class="select" onchange="App.linSet('maxDepth',this.value)">${[1, 2, 3, 5, 10].map((n) => `<option ${n === S.maxDepth ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="grid g-2-1">${A.card('Graf Lineage', S.graph.nodes.length ? `<div style="overflow-x:auto">${svg()}</div>` : '<div class="empty"><div class="big">∅</div>Belum ada relasi antar-objek. Buat relasi dari detail aplikasi/layanan/proses untuk membangun graf.</div>', { flush: true, meta: `${S.graph.nodes.length} node · ${S.graph.edges.length} relasi${S.graph.hiddenEndpoints ? ` · ${S.graph.hiddenEndpoints} relasi menuju objek di luar cakupan` : ''}${S.graph.truncated ? ' · terpotong' : ''}` })}
        <div id="lin-side">${side()}</div></div><p class="tiny muted mt">Arah ketergantungan: serving/realization/flow/triggering/used-by → target bergantung pada sumber; access/assignment/composition → sumber bergantung pada target; association dua arah. Lihat <code>eaw.dependency_edge</code>.</p>`;
    } catch (e) { box.innerHTML = errBox(e); }
  }
  async function pick(type, id) {
    if (S.sel === `${type}:${id}`) return clear();
    try { S.impact = await API.get('/api/v1/eaw/impact', { objectType: type, objectId: id, direction: S.direction, maxDepth: S.maxDepth }); S.sel = `${type}:${id}`; await mount(); } catch (e) { fail(e); }
  }
  const clear = () => { S.impact = null; S.sel = null; mount(); };

  function install(app, ctx) {
    A = app; API = ctx.API; D = ctx.D; fail = ctx.fail;
    A.PAGES['eaw/lineage'] = () => ({ html: A.pageHd('Dependency Lineage & Impact Analysis', 'Graf relasi EAW nyata (Proses → Layanan → Aplikasi → Data → Infrastruktur/Kontrol). Klik node untuk melihat seluruh objek yang terdampak secara transitif bila ia berubah atau gagal (EAW-03).') + '<div id="lin-body"><div class="small muted">Memuat…</div></div>', mount });
    A.linSel = pick; A.linClear = clear;
    A.linSet = (k, v) => { S[k] = k === 'maxDepth' ? Number(v) : v; if (k === 'entityId') { S.impact = null; S.sel = null; } if (S.sel && k !== 'entityId') { const [t, ...r] = S.sel.split(':'); S.sel = null; pick(t, r.join(':')); } else mount(); };
  }
  return { install };
})();
