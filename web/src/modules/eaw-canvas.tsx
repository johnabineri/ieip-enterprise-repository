'use client';
/* Kanvas ArchiMate 3.2 (EAW-01) — tampilan = mockup (.canvas-wrap/.palette/.cv/.inspector, SVG bergaris lajur layer), tanpa pustaka diagram:
   seret elemen, "Hubungkan" (pilih tipe → klik sumber → klik target), inspector, ikatan node ↔ objek EAW, impor dari model, sinkron relasi gambar
   → eaw.relation, ekspor SVG / Open Group Exchange XML. Aturan SEBENARNYA di server (`archimate.ts`: validasi struktural 400, metamodel = peringatan,
   ikatan harus objek terlihat, sinkron mengikuti `eaw.relation_allowed` + kunci status Draf). Simpan = PUT seluruh isi dengan If-Match (konflik 412). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { downloadApi as download } from '@/lib/download';
import { can } from '@/store/session';
import { openLayer, toast } from '@/store/ui';
import { Modal, confirmDialog, formDialog } from '@/components/overlay';
import { Btn, Callout, Field, Input, PageHd, Select, Tag } from '@/components/ui';
import { editableEntities } from './eaw-forms';
import { t } from '@/lib/i18n';

interface DNode { id: string; type: string; label: string; x: number; y: number; objectType?: string; objectId?: string }
interface DEdge { id: string; source: string; target: string; type: string; relationId?: string }
interface Content { nodes: DNode[]; edges: DEdge[] }
interface Meta { elements: { type: string; layer: string; label: string }[]; relations: string[]; bindable: Record<string, string[]>; defaults: Record<string, string>; node: { w: number; h: number } }
interface Dg { id: string; nama: string; entityId: string; entityCode: string; version: number | string; content: Content; validation?: { warnings: string[] } }

const LAYER: Record<string, [string, string]> = { s: ['Strategy', '#F5DEAA'], b: ['Business', '#FFFFB5'], a: ['Application', '#B5FFFF'], t: ['Technology', '#C9E7B7'], p: ['Physical', '#C9E7B7'], m: ['Motivation', '#CCCCFF'], i: ['Implementation', '#FFE0E0'] };
const LANE: Record<string, number> = { s: 0, m: 0, b: 1, a: 2, t: 3, p: 3, i: 3 };
const NW = 150, NH = 50;
const DASHED = ['access', 'flow', 'influence'];
const OBJ_PATH: Record<string, string> = { application: 'applications', service: 'objects/services', process: 'objects/processes', data_entity: 'objects/data-entities', infra_asset: 'objects/infra-assets', control: 'objects/controls' };
const rnd = (p: string) => p + Math.random().toString(36).slice(2, 8);

const objLabel = (o: api.Row) => (o.kode ? `${o.kode} · ${o.nama}` : o.nama || o.namaKanonikal || o.aspek || String(o.id).slice(0, 8));
const useObjs = (type?: string) => useQuery({ queryKey: ['dg-objs', type], enabled: !!type, staleTime: 60_000, queryFn: async () => (await api.all(`/api/v1/eaw/${OBJ_PATH[type!]}`)).map((o) => ({ id: o.id as string, label: objLabel(o), name: String(o.nama || o.namaKanonikal || o.aspek || '') })) });

/* ---------------------------------------------------------------- inspector ---------------------------------------------------------------- */
function Inspector({ meta, c, node, edge, canWrite, warnings, onNode, onEdge, onDelNode, onDelEdge }: {
  meta: Meta; c: Content; node?: DNode; edge?: DEdge; canWrite: boolean; warnings: string[];
  onNode: (patch: Partial<DNode> & { unbind?: boolean }) => void; onEdge: (type: string) => void; onDelNode: () => void; onDelEdge: () => void;
}) {
  const bindTypes = node ? Object.entries(meta.bindable).filter(([, ts]) => ts.includes(node.type)).map(([k]) => k) : [];
  const [bt, setBt] = React.useState('');
  React.useEffect(() => setBt(''), [node?.id]);
  const objs = useObjs(node?.objectType || bt || undefined);
  const nodeById = (id: string) => c.nodes.find((n) => n.id === id);
  return (
    <>
      <h3>{t('Inspector')}</h3>
      {node ? (
        <>
          <div className="field mt-s"><label>{t('Nama')}</label><Input value={node.label} disabled={!canWrite} onChange={(e) => onNode({ label: e.target.value })} /></div>
          <div className="field"><label>{t('Tipe elemen')}</label>
            <Select value={node.type} disabled={!canWrite} onChange={(e) => onNode({ type: e.target.value })}>{meta.elements.map((x) => <option key={x.type} value={x.type}>{LAYER[x.layer][0]} · {x.label}</option>)}</Select></div>
          <h3 className="mt">{t('Ikatan ke objek EAW')}</h3>
          {node.objectId ? (
            <>
              <div className="small mt-s"><span className="badge b-ok">{t('terikat')}</span> {(objs.data || []).find((o) => o.id === node.objectId)?.label || node.objectId.slice(0, 8)} <Tag>{node.objectType}</Tag></div>
              {canWrite ? <Btn sm className="mt-s" onClick={() => onNode({ unbind: true })}>{t('Lepas ikatan')}</Btn> : null}
            </>
          ) : bindTypes.length && canWrite ? (
            <>
              <div className="row mt-s"><Select value={bt} onChange={(e) => setBt(e.target.value)}><option value="">— {t('jenis objek')} —</option>{bindTypes.map((x) => <option key={x}>{x}</option>)}</Select></div>
              {bt ? <div className="mt-s"><Select value="" onChange={(e) => {
                const o = (objs.data || []).find((x) => x.id === e.target.value); if (!o) return;
                onNode({ objectType: bt, objectId: o.id, label: o.name || o.label, ...(meta.bindable[bt].includes(node.type) ? {} : { type: meta.defaults[bt] }) });
              }}><option value="">{objs.isLoading ? '…' : `— ${t('pilih objek')} —`}</option>{(objs.data || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></div> : null}
            </>
          ) : <p className="tiny muted mt-s">{bindTypes.length ? t('Hanya-baca.') : t('Tipe ini tidak mewakili objek EAW.')}</p>}
          {canWrite ? <Btn sm variant="danger" className="mt" onClick={onDelNode}>{t('Hapus elemen')}</Btn> : null}
        </>
      ) : edge ? (
        <>
          <div className="small mt-s"><b>{nodeById(edge.source)?.label}</b> → <b>{nodeById(edge.target)?.label}</b></div>
          <div className="field mt-s"><label>{t('Tipe relasi')}</label><Select value={edge.type} disabled={!canWrite} onChange={(e) => onEdge(e.target.value)}>{meta.relations.map((r) => <option key={r}>{r}</option>)}</Select></div>
          <div className="small mt-s">{edge.relationId ? <span className="badge b-ok">{t('tersinkron ke eaw.relation')}</span> : <span className="badge">{t('hanya di gambar')}</span>}</div>
          {canWrite ? <Btn sm variant="danger" className="mt" onClick={onDelEdge}>{t('Hapus relasi')}</Btn> : null}
        </>
      ) : <p className="small muted">{t('Pilih elemen atau relasi di kanvas.')}</p>}
      <h3 className="mt">{t('Validasi metamodel')}</h3>
      <div className="stack small mt-s">
        {warnings.length ? <>{warnings.slice(0, 8).map((w, i) => <div key={i} className="callout warn" style={{ padding: 8 }}><span>⚠</span><div>{w}</div></div>)}{warnings.length > 8 ? <div className="tiny muted">+{warnings.length - 8} {t('lainnya')}</div> : null}</>
          : <div className="callout ok" style={{ padding: 8 }}><span>✓</span><div>{t('Tidak ada peringatan.')}</div></div>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- impor dari model ---------------------------------------------------------------- */
function ImportModal({ close, onRun }: { close: () => void; onRun: (type: string, id: string) => Promise<void> }) {
  const types = Object.keys(OBJ_PATH);
  const [type, setType] = React.useState(types[0]); const [id, setId] = React.useState(''); const [err, setErr] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  const objs = useObjs(type);
  const run = async () => { if (!id) return setErr(t('Pilih objek.')); setBusy(true); setErr(null); try { await onRun(type, id); close(); } catch (e) { setErr(api.explain(e)); } finally { setBusy(false); } };
  return (
    <Modal title={t('Impor dari Model EAW')} close={close} footer={<><span className="right" /><Btn onClick={close}>{t('Batal')}</Btn><Btn variant="pri" disabled={busy} onClick={run}>{busy ? '…' : t('Impor')}</Btn></>}>
      <p className="small muted">{t('Menambahkan objek beserta objek yang berelasi dan relasinya sebagai elemen terikat. Diagram disimpan.')}</p>
      <div className="form-grid">
        <Field label={t('Jenis')}><Select value={type} onChange={(e) => { setType(e.target.value); setId(''); }}>{types.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label={t('Objek')}><Select value={id} onChange={(e) => setId(e.target.value)}><option value="">{objs.isLoading ? '…' : `— ${t('pilih objek')} —`}</option>{(objs.data || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></Field>
      </div>
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
    </Modal>
  );
}

/* ---------------------------------------------------------------- halaman ---------------------------------------------------------------- */
export default function Kanvas() {
  const canWrite = can('eaw.model.write');
  const metaQ = useQuery({ queryKey: ['dg-meta'], staleTime: Infinity, queryFn: () => api.get<Meta>('/api/v1/eaw/diagrams/meta') });
  const listQ = useQuery({ queryKey: ['dg-list'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/eaw/diagrams')).data });
  const meta = metaQ.data; const list = listQ.data;

  const [dg, setDg] = React.useState<Dg | null>(null);
  const [c, setC] = React.useState<Content>({ nodes: [], edges: [] });
  const [warnings, setWarnings] = React.useState<string[] | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [sel, setSel] = React.useState<string | null>(null);
  const [selEdge, setSelEdge] = React.useState<string | null>(null);
  const [connect, setConnect] = React.useState<string | null>(null);
  const [edgeType, setEdgeType] = React.useState('association');
  const [loadErr, setLoadErr] = React.useState<string | null>(null);

  const adopt = (d: Dg) => { setDg(d); setC(d.content); setWarnings(d.validation?.warnings ?? null); setDirty(false); };
  const open = React.useCallback(async (id: string) => {
    try { setLoadErr(null); const r = await api.get<Dg>(`/api/v1/eaw/diagrams/${id}`); adopt(r); setSel(null); setSelEdge(null); setConnect(null); } catch (e) { setLoadErr(api.explain(e)); }
  }, []);
  React.useEffect(() => { if (list && !dg && list.length) open(list[0].id); if (list && dg && !list.some((d) => d.id === dg.id)) { setDg(null); } }, [list, dg, open]);
  React.useEffect(() => {
    if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const mut = (fn: (x: Content) => Content) => { setC((x) => fn(x)); setDirty(true); };
  const nodeById = (id: string | null) => (id ? c.nodes.find((n) => n.id === id) : undefined);
  const elOf = (type: string) => meta!.elements.find((e) => e.type === type);
  const layerOf = (type: string) => elOf(type)?.layer || 'a';
  const patchNode = (id: string, p: Partial<DNode>) => mut((x) => ({ ...x, nodes: x.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) }));

  const save = async (): Promise<Dg | null> => {
    if (!dg) return null;
    try {
      const r = await api.put<Dg>(`/api/v1/eaw/diagrams/${dg.id}`, { content: c }, dg.version);
      adopt(r); api.get('/api/v1/eaw/diagrams').then(() => listQ.refetch());
      const n = r.validation?.warnings.length ?? 0; toast(t('Diagram tersimpan'), t('{0} peringatan metamodel', n), n ? 'info' : 'success'); return r;
    } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); return null; }
  };
  const ensureSaved = async (): Promise<Dg | null> => (dirty ? save() : dg);

  /* ---- aksi ---- */
  const addNode = (type: string) => {
    const lane = LANE[layerOf(type)]; const col = c.nodes.filter((n) => Math.round(n.y / 140) === lane).length; const id = rnd('n');
    mut((x) => ({ ...x, nodes: [...x.nodes, { id, type, label: `${elOf(type)!.label} ${t('baru')}`, x: 30 + (col % 4) * 190, y: 30 + lane * 140 + Math.floor(col / 4) * 60 }] })); setSel(id); setSelEdge(null);
  };
  const delNode = () => { const id = sel; if (!id) return; mut((x) => ({ nodes: x.nodes.filter((n) => n.id !== id), edges: x.edges.filter((e) => e.source !== id && e.target !== id) })); setSel(null); };
  const delEdge = () => { const id = selEdge; if (!id) return; mut((x) => ({ ...x, edges: x.edges.filter((e) => e.id !== id) })); setSelEdge(null); };
  const switchTo = (id: string) => { if (dirty && !confirm(t('Perubahan belum disimpan akan hilang. Lanjutkan?'))) return; open(id); };
  const startConnect = () => { if (!sel) return toast(t('Pilih elemen sumber dulu'), undefined, 'info'); setConnect(sel); toast(t('Mode hubungkan'), t('Klik elemen target.'), 'info'); };

  const newDiagram = async () => {
    const ents = await editableEntities();
    formDialog({
      title: t('Diagram Baru'), submit: t('Buat'),
      fields: [{ name: 'nama', label: t('Nama'), req: true, full: true, max: 200 }, { name: 'entityId', label: t('Entitas'), type: 'select', req: true, options: ents, full: true }],
      onSubmit: async (v) => { const d = await api.post<Dg>('/api/v1/eaw/diagrams', v); await listQ.refetch(); adopt(d); setSel(null); setSelEdge(null); },
    });
  };
  const removeDiagram = () => dg && confirmDialog({
    title: t('Hapus diagram ini?'), text: dg.nama, danger: true, ok: t('Hapus'),
    onOk: async () => { await api.del(`/api/v1/eaw/diagrams/${dg.id}`); setDg(null); await listQ.refetch(); },
  });
  const runImport = async (type: string, id: string) => {
    const cur = await ensureSaved(); if (!cur) throw new Error(t('Simpan diagram gagal.'));
    const r = await api.post<Dg & { imported: { nodes: number; edges: number } }>(`/api/v1/eaw/diagrams/${cur.id}/import`, { objectType: type, objectId: id }, { ifMatch: cur.version });
    adopt(r); toast(t('Impor selesai'), t('{0} elemen, {1} relasi', r.imported.nodes, r.imported.edges), 'success');
  };
  const runSync = async () => {
    const cur = await ensureSaved(); if (!cur) return;
    try {
      const r = await api.post<Dg & { sync: { created: number; skipped: { edge: string; reason: string }[] } }>(`/api/v1/eaw/diagrams/${cur.id}/sync-relations`, {}, { ifMatch: cur.version });
      adopt(r); const sk = r.sync.skipped;
      toast(t('{0} relasi disinkron ke model', r.sync.created), sk.length ? t('{0} dilewati — lihat rincian', sk.length) : undefined, r.sync.created ? 'success' : 'info');
      if (sk.length) openLayer((close) => (
        <Modal title={t('Relasi yang dilewati')} close={close} footer={<><span className="right" /><Btn onClick={close}>{t('Tutup')}</Btn></>}>
          <ul className="small" style={{ paddingLeft: 18 }}>{sk.map((s) => { const e = r.content.edges.find((x) => x.id === s.edge); const a = e && r.content.nodes.find((n) => n.id === e.source), b = e && r.content.nodes.find((n) => n.id === e.target); return <li key={s.edge}><b>{a?.label} → {b?.label}</b> ({e?.type}): {s.reason}</li>; })}</ul>
        </Modal>));
    } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); }
  };

  /* ---- seret ---- */
  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const pt = (e: React.PointerEvent) => { const s = svgRef.current!; const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(s.getScreenCTM()!.inverse()); };
  const onNodeDown = (e: React.PointerEvent, n: DNode) => {
    e.stopPropagation();
    if (connect && connect !== n.id) {
      const src = connect; setConnect(null);
      if (canWrite && !c.edges.some((x) => x.source === src && x.target === n.id && x.type === edgeType)) mut((x) => ({ ...x, edges: [...x.edges, { id: rnd('e'), source: src, target: n.id, type: edgeType }] }));
      setSel(n.id); setSelEdge(null); return;
    }
    setSel(n.id); setSelEdge(null);
    if (!canWrite) return;
    const p = pt(e); drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const p = pt(e); d.moved = true; setC((x) => ({ ...x, nodes: x.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.max(8, Math.round(p.x - d.dx)), y: Math.max(8, Math.round(p.y - d.dy)) } : n)) })); };
  const onUp = () => { const d = drag.current; drag.current = null; if (d?.moved) setDirty(true); };
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,select,textarea')) return;
    if (e.key === 'Escape') setConnect(null);
    if (canWrite && (e.key === 'Delete' || e.key === 'Backspace')) { if (sel) delNode(); else if (selEdge) delEdge(); }
  };

  /* ---- render ---- */
  const head = <PageHd title={t('Kanvas ArchiMate 3.2')} sub={t('Diagram tersimpan per entitas; elemen terikat ke objek EAW, impor dari model, sinkron relasi gambar ke model, ekspor SVG dan Open Group Exchange XML (EAW-01, EAW-09).')} />;
  if (metaQ.isError || listQ.isError) return <>{head}<Callout tone={(metaQ.error as any)?.status === 403 || (listQ.error as any)?.status === 403 ? 'warn' : 'err'}>{api.explain(metaQ.error || listQ.error)}</Callout></>;
  if (!meta || !list) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  if (!list.length || !dg) {
    return <>{head}<div className="card"><div className="empty"><div className="big">▣</div>{loadErr ? loadErr : list.length ? t('Memuat…') : t('Belum ada diagram.')}{canWrite && !list.length ? <><br /><Btn variant="pri" className="mt-s" onClick={newDiagram}>+ {t('Diagram baru')}</Btn></> : null}</div></div></>;
  }

  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const maxX = Math.max(820, ...c.nodes.map((n) => n.x + NW + 40)); const maxY = Math.max(580, ...c.nodes.map((n) => n.y + NH + 40));
  const local = c.nodes.filter((x) => !c.edges.some((ed) => ed.source === x.id || ed.target === x.id)).map((x) => t('Elemen "{0}" tidak memiliki relasi (AC-3).', x.label));
  const warn = dirty || !warnings ? local : warnings;
  const node = nodeById(sel); const edge = selEdge ? c.edges.find((x) => x.id === selEdge) : undefined;
  const lanes: [string, number, string][] = [['s', 0, 'Strategy / Motivation'], ['b', 1, 'Business'], ['a', 2, 'Application'], ['t', 3, 'Technology / Physical']];

  return (
    <>
      {head}
      <div className="row mb" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Select value={dg.id} onChange={(e) => switchTo(e.target.value)} style={{ maxWidth: 360 }}>{list.map((d) => <option key={d.id} value={d.id}>{d.nama} ({d.entityCode})</option>)}</Select>
        <span className="small muted">{dirty ? `● ${t('belum disimpan')}` : `✓ ${t('tersimpan')}`}</span>
        {canWrite ? <>
          <Btn onClick={newDiagram}>+ {t('Baru')}</Btn>
          <Btn variant="pri" onClick={() => { save(); }}>💾 {t('Simpan')}</Btn>
          <Btn onClick={() => openLayer((close) => <ImportModal close={close} onRun={runImport} />)}>⇩ {t('Impor dari model')}</Btn>
          <Btn onClick={runSync}>⇄ {t('Sinkron ke model')}</Btn>
          <Select value={edgeType} onChange={(e) => setEdgeType(e.target.value)} style={{ maxWidth: 130 }}>{meta.relations.map((r) => <option key={r}>{r}</option>)}</Select>
          <Btn onClick={startConnect}>{connect ? `⤳ ${t('Pilih target…')}` : `⤳ ${t('Hubungkan')}`}</Btn>
        </> : null}
        <Btn onClick={() => download(`/api/v1/eaw/diagrams/${dg.id}/svg`, 'diagram.svg')}>⇩ SVG</Btn>
        <Btn onClick={() => download(`/api/v1/eaw/diagrams/${dg.id}/exchange`, 'diagram.xml')}>⇩ Exchange XML</Btn>
        {canWrite ? <Btn variant="danger" onClick={removeDiagram}>{t('Hapus diagram')}</Btn> : null}
      </div>
      {dirty ? <div className="mb"><Callout tone="gold">{t('Ekspor SVG/XML dan impor memakai versi tersimpan — simpan dulu agar perubahan ikut.')}</Callout></div> : null}
      <div className="card canvas-wrap">
        <div className="palette">
          {canWrite ? Object.entries(LAYER).map(([k, [nm, color]]) => (
            <React.Fragment key={k}>
              <div className="nav-group" style={{ paddingLeft: 2 }}>{nm}</div>
              {meta.elements.filter((e) => e.layer === k).map((e) => <div key={e.type} className="pi" onClick={() => addNode(e.type)}><span className="sw" style={{ background: color }} />{e.label}</div>)}
            </React.Fragment>
          )) : <p className="small muted">Read-only</p>}
        </div>
        <div className="cv" style={{ overflow: 'auto' }} tabIndex={0} onKeyDown={onKey} onPointerDown={() => { setSel(null); setSelEdge(null); setConnect(null); }}>
          <svg ref={svgRef} viewBox={`0 0 ${maxX} ${maxY}`} width={maxX} height={maxY} onPointerMove={onMove} onPointerUp={onUp}>
            <defs><marker id="am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" /></marker></defs>
            {lanes.map(([k, r, nm]) => <g key={k}><rect x={6} y={r * 140 + 6} width={maxX - 12} height={130} rx={8} fill={LAYER[k][1]} opacity={0.16} /><text className="lane-lbl" x={14} y={r * 140 + 20}>{nm}</text></g>)}
            {c.edges.map((e) => {
              const a = byId.get(e.source)!, b = byId.get(e.target)!; const on = e.id === selEdge; const mx = (a.x + b.x + NW) / 2, my = (a.y + b.y + NH) / 2;
              const x1 = a.x + NW / 2, y1 = a.y + NH / 2, x2 = b.x + NW / 2, y2 = b.y + NH / 2;
              return (
                <g key={e.id} onPointerDown={(ev) => { ev.stopPropagation(); setSelEdge(e.id); setSel(null); }} style={{ cursor: 'pointer' }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? 'var(--accent)' : 'var(--muted)'} strokeWidth={on ? 2.4 : 1.4} strokeDasharray={DASHED.includes(e.type) ? '4 3' : undefined} markerEnd="url(#am)" />
                  <text x={mx} y={my - 4} fontSize={9} textAnchor="middle" style={{ fill: 'var(--text)' }}>{e.type}{e.relationId ? ' ●' : ''}</text>
                </g>
              );
            })}
            {c.nodes.map((n) => {
              const on = n.id === sel || n.id === connect; const lbl = elOf(n.type)?.label || n.type;
              return (
                <g key={n.id} className={`anode${n.id === sel ? ' sel' : ''}`} transform={`translate(${n.x},${n.y})`} onPointerDown={(ev) => onNodeDown(ev, n)}>
                  <rect width={NW} height={NH} rx={/Process|Service|Function|Capability/.test(n.type) ? 14 : 4} fill={LAYER[layerOf(n.type)][1]} stroke={n.id === connect ? 'var(--accent)' : '#555'} strokeWidth={on ? 2.4 : 1} />
                  <text x={8} y={14} style={{ fontSize: 9, fill: '#555' }}>«{lbl}»{n.objectId ? ' ●' : ''}</text>
                  <text x={NW / 2} y={34} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: '#111' }}>{n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="inspector">
          <Inspector meta={meta} c={c} node={node} edge={edge} canWrite={canWrite} warnings={warn}
            onNode={(p) => { if (!sel) return; if (p.unbind) { mut((x) => ({ nodes: x.nodes.map((n) => { if (n.id !== sel) return n; const { objectType, objectId, ...rest } = n; void objectType; void objectId; return rest; }), edges: x.edges.map((e) => { if ((e.source === sel || e.target === sel) && e.relationId) { const { relationId, ...rest } = e; void relationId; return rest; } return e; }) })); return; }
              if (p.type) { const n = nodeById(sel)!; if (n.objectType && !meta.bindable[n.objectType].includes(p.type)) { mut((x) => ({ ...x, nodes: x.nodes.map((m) => { if (m.id !== sel) return m; const { objectType, objectId, ...rest } = m; void objectType; void objectId; return { ...rest, type: p.type! }; }) })); return; } }
              patchNode(sel, p); }}
            onEdge={(type) => selEdge && mut((x) => ({ ...x, edges: x.edges.map((e) => { if (e.id !== selEdge) return e; const { relationId, ...rest } = e; void relationId; return { ...rest, type }; }) }))}
            onDelNode={delNode} onDelEdge={delEdge} />
        </div>
      </div>
      <p className="tiny muted mt-s">{t('Seret elemen · klik palet untuk menambah · “Hubungkan”: pilih tipe, klik elemen sumber lalu target · Delete menghapus pilihan · ● = terikat ke objek/relasi EAW.')} {t('Entitas')}: {dg.entityCode} · {c.nodes.length} {t('elemen')}, {c.edges.length} {t('relasi')}.</p>
    </>
  );
}
