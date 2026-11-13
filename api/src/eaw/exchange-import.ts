import { Content, DEdge, DNode, ELEMENTS, normalize, NODE_H, NODE_W, RELATIONS, validate } from './archimate';
import { attr, kids, local, parseXml, XmlError, XNode } from './xml';

/**
 * Impor Open Group Exchange Format (ArchiMate 3.x) -> isi diagram EAP (EAW-09). Hanya isi SATU view yang diimpor (posisi + koneksi yang digambar);
 * elemen/relasi di luar view dan tipe di luar subset EAP DIPERINGATKAN (tidak diam-diam hilang), tidak memblokir. Galat struktural memblokir.
 * Validasi XSD ArchiMate 3.1 dijalankan pemanggil (eaw/xsd.ts) HANYA bila `parsed` (lolos parser aman). Pengenal asli diganti id pendek
 * (n1.., e1..) karena id diagram dibatasi; objek EAW tidak diikat otomatis.
 */
export interface ImportReport {
  valid: boolean; parsed: boolean; errors: Array<{ message: string; line?: number }>; warnings: string[];
  modelName: string | null; viewName: string | null; views: string[];
  counts: { elements: number; relationships: number; nodes: number; edges: number; skipped: number };
}
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const nameOf = (n: XNode) => (kids(n, 'name')[0]?.text ?? '').trim();
const typeOf = (n: XNode) => attr(n, 'type') ?? '';

export function importExchange(xml: string, opts: { view?: string } = {}): { report: ImportReport; content: Content | null } {
  const errors: ImportReport['errors'] = []; const warnings: string[] = [];
  const report: ImportReport = { valid: false, parsed: false, errors, warnings, modelName: null, viewName: null, views: [], counts: { elements: 0, relationships: 0, nodes: 0, edges: 0, skipped: 0 } };
  let root: XNode;
  try { root = parseXml(xml); } catch (e) { errors.push({ message: e instanceof XmlError ? e.message : 'XML tidak dapat dibaca', line: e instanceof XmlError ? e.line : undefined }); return { report, content: null }; }
  report.parsed = true;
  if (local(root.name) !== 'model') { errors.push({ message: `elemen akar harus <model> (Exchange Format), ditemukan <${root.name}>`, line: 1 }); return { report, content: null }; }
  report.modelName = nameOf(root) || null;

  // elemen
  type El = { id: string; type: string; label: string };
  const els = new Map<string, El>(); const unsupported = new Map<string, string>();
  for (const e of kids(kids(root, 'elements')[0] ?? { name: '', attrs: {}, children: [], text: '' }, 'element')) {
    const id = attr(e, 'identifier'); const type = typeOf(e);
    if (!id) { errors.push({ message: 'element tanpa atribut identifier' }); continue; }
    if (els.has(id) || unsupported.has(id)) { errors.push({ message: `identifier elemen ganda: ${id}` }); continue; }
    report.counts.elements++;
    if (!(type in ELEMENTS)) { unsupported.set(id, type || '(tanpa tipe)'); continue; }
    const label = nameOf(e);
    if (!label) warnings.push(`Elemen ${id} (${type}) tanpa nama — diberi label "(tanpa nama)".`);
    els.set(id, { id, type, label: (label || '(tanpa nama)').slice(0, 120) });
  }
  if (unsupported.size) { const kinds = [...new Set(unsupported.values())]; warnings.push(`${unsupported.size} elemen bertipe di luar subset EAP dilewati: ${kinds.slice(0, 8).join(', ')}${kinds.length > 8 ? ', …' : ''}.`); report.counts.skipped += unsupported.size; }

  // relasi
  type Rel = { id: string; type: string; source: string; target: string };
  const rels = new Map<string, Rel>(); let skippedRel = 0;
  for (const r of kids(kids(root, 'relationships')[0] ?? { name: '', attrs: {}, children: [], text: '' }, 'relationship')) {
    const id = attr(r, 'identifier'); const src = attr(r, 'source') ?? ''; const tgt = attr(r, 'target') ?? ''; const type = lowerFirst(typeOf(r));
    if (!id) { errors.push({ message: 'relationship tanpa atribut identifier' }); continue; }
    if (rels.has(id)) { errors.push({ message: `identifier relasi ganda: ${id}` }); continue; }
    report.counts.relationships++;
    if (!(RELATIONS as readonly string[]).includes(type) || !els.has(src) || !els.has(tgt) || src === tgt) { skippedRel++; continue; }
    rels.set(id, { id, type, source: src, target: tgt });
  }
  if (skippedRel) { warnings.push(`${skippedRel} relasi dilewati (tipe di luar subset, ujung bukan elemen yang diimpor, atau relasi ke diri sendiri).`); report.counts.skipped += skippedRel; }

  // view
  const views = kids(kids(kids(root, 'views')[0] ?? { name: '', attrs: {}, children: [], text: '' }, 'diagrams')[0] ?? { name: '', attrs: {}, children: [], text: '' }, 'view');
  report.views = views.map((v) => nameOf(v) || attr(v, 'identifier') || '(tanpa nama)');
  let view: XNode | undefined;
  if (opts.view) { view = views.find((v) => nameOf(v) === opts.view || attr(v, 'identifier') === opts.view); if (!view) errors.push({ message: `view "${opts.view}" tidak ditemukan (tersedia: ${report.views.join(', ') || 'tidak ada'})` }); }
  else view = views[0];
  if (errors.length) return { report, content: null };

  const nodes: DNode[] = []; const edges: DEdge[] = []; const nodeByEl = new Map<string, string>(); const viewNodeToDn = new Map<string, string>();
  if (view) {
    report.viewName = nameOf(view) || attr(view, 'identifier') || null;
    const walk = (n: XNode, ox: number, oy: number) => {
      for (const c of n.children) {
        if (local(c.name) !== 'node') continue;
        const x = ox + (parseFloat(attr(c, 'x') ?? '0') || 0), y = oy + (parseFloat(attr(c, 'y') ?? '0') || 0); const ref = attr(c, 'elementRef');
        if (ref) {
          const el = els.get(ref);
          if (el && !nodeByEl.has(ref)) { const id = `n${nodes.length + 1}`; nodes.push({ id, type: el.type, label: el.label, x: Math.round(x), y: Math.round(y) }); nodeByEl.set(ref, id); const vid = attr(c, 'identifier'); if (vid) viewNodeToDn.set(vid, id); }
          else if (el) warnings.push(`Elemen "${el.label}" muncul lebih dari sekali di view; hanya kemunculan pertama diimpor.`);
        }
        walk(c, x, y);                                                              // node bersarang: koordinat relatif terhadap induk
      }
    };
    walk(view, 0, 0);
    for (const c of kids(view, 'connection')) {
      const rid = attr(c, 'relationshipRef'); const r = rid ? rels.get(rid) : undefined;
      if (!r) { if (rid) report.counts.skipped++; continue; }
      const s = nodeByEl.get(r.source), t = nodeByEl.get(r.target);
      if (s && t && !edges.some((e) => e.source === s && e.target === t && e.type === r.type)) edges.push({ id: `e${edges.length + 1}`, source: s, target: t, type: r.type });
    }
    const notShown = [...els.keys()].filter((id) => !nodeByEl.has(id)).length;
    if (notShown) warnings.push(`${notShown} elemen model tidak ada di view "${report.viewName}" — tidak diimpor (hanya isi view yang diimpor).`);
  } else {
    warnings.push('Tidak ada view di berkas; semua elemen diimpor dengan tata letak otomatis dan relasi model.');
    const layer: Record<string, number> = { s: 0, m: 0, b: 1, a: 2, t: 3, p: 3, i: 4 }; const col: Record<number, number> = {};
    for (const el of els.values()) { const row = layer[ELEMENTS[el.type].layer] ?? 0; const c = (col[row] = (col[row] ?? -1) + 1); const id = `n${nodes.length + 1}`; nodes.push({ id, type: el.type, label: el.label, x: 30 + c * (NODE_W + 40), y: 30 + row * (NODE_H + 70) }); nodeByEl.set(el.id, id); }
    for (const r of rels.values()) edges.push({ id: `e${edges.length + 1}`, source: nodeByEl.get(r.source)!, target: nodeByEl.get(r.target)!, type: r.type });
  }
  report.counts.nodes = nodes.length; report.counts.edges = edges.length;
  if (!nodes.length) errors.push({ message: 'tidak ada elemen yang dapat diimpor (view kosong atau semua tipe di luar subset EAP)' });
  if (nodes.length > 500 || edges.length > 1000) errors.push({ message: `melebihi batas diagram (maks 500 node / 1000 relasi): ${nodes.length} node, ${edges.length} relasi` });
  if (errors.length) return { report, content: null };

  let content: Content;
  try { content = normalize({ nodes, edges }); } catch (e: any) { errors.push({ message: e?.response?.detail || e?.message || 'isi diagram tidak valid' }); return { report, content: null }; }
  warnings.push(...validate(content).warnings.slice(0, 30));
  report.valid = true;
  return { report, content };
}
