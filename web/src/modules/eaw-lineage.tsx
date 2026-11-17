'use client';
/* Lineage & Impact (EAW-03) — tampilan = mockup: graf kolom Proses → Layanan → Aplikasi → Data → Infrastruktur → Kontrol dari relasi EAW nyata
   (`GET /eaw/lineage`), klik node = analisis dampak transitif (`GET /eaw/impact`, BFS ≤10 tingkat/≤1000 node). Arah ketergantungan diturunkan di DB
   (view eaw.dependency_edge, RLS pemanggil); objek di luar cakupan dihitung tetapi isinya tidak dibuka (hidden). Baca-saja. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { badgeClass } from '@/lib/badge';
import { useLookup } from '@/lib/query';
import { Btn, Callout, Card, MiniTable, PageHd, Select } from '@/components/ui';
import { t } from '@/lib/i18n';

interface GNode { key: string; type: string; id: string; label: string; status: string; entityCode: string }
interface Graph { nodes: GNode[]; edges: { from: string; to: string; tipe: string }[]; truncated: boolean; hiddenEndpoints: number }
interface INode { type: string; id: string; label: string | null; status: string | null; entityCode: string | null; depth: number; hidden: boolean }
interface Impact { root: { label: string }; direction: 'impact' | 'dependencies'; nodes: INode[]; edges: { from: string; to: string; tipe: string }[]; truncated: boolean; summary: { total: number; hidden: number; byType: Record<string, number>; baseline: number } }

const COLS: [string, string][] = [['process', t('Proses Bisnis')], ['service', t('Layanan')], ['application', t('Aplikasi')], ['data_entity', t('Data')], ['infra_asset', t('Infrastruktur')], ['control', t('Kontrol')]];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(COLS);
const W = 1060, CW = W / COLS.length;

function GraphSvg({ g, impact, onPick }: { g: Graph; impact?: Impact; onPick: (n: GNode) => void }) {
  const pos: Record<string, [number, number]> = {}; let rows = 1;
  COLS.forEach(([ty], ci) => { const ns = g.nodes.filter((n) => n.type === ty).sort((a, b) => a.label.localeCompare(b.label)); rows = Math.max(rows, ns.length); ns.forEach((n, ri) => { pos[n.key] = [ci * CW + 12, 44 + ri * 54]; }); });
  const H = 60 + rows * 54;
  const hit = new Map((impact?.nodes || []).map((n) => [`${n.type}:${n.id}`, n.depth]));
  const edgeHit = new Set((impact?.edges || []).map((e) => `${e.from}>${e.to}`));
  const st = (k: string) => (!impact ? '' : hit.get(k) === 0 ? 'src' : hit.has(k) ? 'hit' : 'dim');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 900 }}>
      <defs><marker id="lar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)" /></marker></defs>
      {COLS.map(([, l], ci) => <text key={ci} x={ci * CW + 12} y={24} className="lane-lbl">{l}</text>)}
      {g.edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to]; if (!a || !b) return null;
        const cls = !impact ? '' : edgeHit.has(`${e.from}>${e.to}`) ? 'hit' : 'dim';
        const x1 = a[0] + CW - 40, y1 = a[1] + 18, x2 = b[0] - 6, y2 = b[1] + 18;
        const d = a[0] === b[0] ? `M${a[0] + CW - 40} ${a[1] + 18} C${a[0] + CW - 5} ${a[1] + 18}, ${a[0] + CW - 5} ${b[1] + 18}, ${b[0] + CW - 40} ${b[1] + 18}`
          : x1 < x2 ? `M${x1} ${y1} C${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}` : `M${a[0]} ${y1} C${a[0] - 30} ${y1}, ${b[0] + CW - 10} ${y2}, ${b[0] + CW - 40} ${y2}`;
        return <path key={i} className={`lin-edge ${cls}`} d={d} markerEnd="url(#lar)"><title>{e.tipe}</title></path>;
      })}
      {g.nodes.map((n) => {
        const [x, y] = pos[n.key];
        return (
          <g key={n.key} className={`lin-node ${st(n.key)}`} onClick={() => onPick(n)}>
            <rect x={x} y={y} width={CW - 40} height={36} rx={7} />
            <text x={x + 10} y={y + 22}>{n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}</text>
            <title>{`${n.label} · ${n.status} · ${n.entityCode}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

function Side({ im, onClear }: { im?: Impact; onClear: () => void }) {
  if (!im) return <Card title={t('Analisis Dampak')}><div className="empty"><div className="big">⚠</div>{t('Klik sebuah node untuk melihat siapa yang terdampak bila objek itu berubah atau gagal (atau penyedia apa yang dibutuhkannya).')}</div></Card>;
  const dir = im.direction === 'impact';
  const aff = im.nodes.filter((n) => n.depth > 0).sort((a, b) => a.depth - b.depth || String(a.label).localeCompare(String(b.label)));
  const by = Object.entries(im.summary.byType).map(([ty, n]) => `${n} ${TYPE_LABEL[ty] || ty}`).join(', ') || '—';
  return (
    <Card title={`${dir ? t('Dampak perubahan') : t('Dependensi')}: ${im.root.label}`} acts={<Btn sm onClick={onClear}>{t('Bersihkan')}</Btn>}>
      <div className="mb"><Callout tone={aff.length ? 'err' : 'ok'} icon={aff.length ? '⚠' : '✓'}>
        <b>{dir ? t('{0} objek terdampak', im.summary.total) : t('{0} objek dibutuhkan', im.summary.total)}</b> ({by}){im.summary.hidden ? <> · {t('{0} di luar cakupan akses Anda (isi tidak dibuka)', im.summary.hidden)}</> : null}{im.truncated ? <> · <b>{t('hasil terpotong')}</b> {t('(batas 1000 node)')}</> : null}.
      </Callout></div>
      {im.summary.baseline ? <p className="small mb">{t('{0} di antaranya sudah berstatus baseline (Ditetapkan atau lebih) — perubahan memerlukan reviu AF-07.', im.summary.baseline)}</p> : null}
      {aff.length ? <MiniTable rows={aff} columns={[
        { label: t('Objek'), render: (n: INode) => (n.hidden ? <span className="muted small">{t('(di luar cakupan)')}</span> : n.label) },
        { label: t('Jenis'), render: (n: INode) => TYPE_LABEL[n.type] || n.type },
        { label: t('Jarak'), num: true, render: (n: INode) => n.depth },
        { label: t('Status'), render: (n: INode) => (n.status ? <span className={`badge ${badgeClass(n.status)}`}>{n.status}</span> : '—') },
      ]} /> : null}
    </Card>
  );
}

export default function Lineage() {
  const entities = useLookup('entities');
  const [entityId, setEntityId] = React.useState('');
  const [direction, setDirection] = React.useState<'impact' | 'dependencies'>('impact');
  const [maxDepth, setMaxDepth] = React.useState(10);
  const [sel, setSel] = React.useState<GNode | null>(null);
  const gq = useQuery({ queryKey: ['lineage', entityId], queryFn: () => api.get<Graph>('/api/v1/eaw/lineage', { entityId: entityId || undefined }) });
  const iq = useQuery({ queryKey: ['impact', sel?.type, sel?.id, direction, maxDepth], enabled: !!sel, queryFn: () => api.get<Impact>('/api/v1/eaw/impact', { objectType: sel!.type, objectId: sel!.id, direction, maxDepth }) });
  const head = <PageHd title={t('Dependency Lineage & Impact Analysis')} sub={t('Graf relasi EAW nyata (Proses → Layanan → Aplikasi → Data → Infrastruktur/Kontrol). Klik node untuk melihat seluruh objek yang terdampak secara transitif bila ia berubah atau gagal (EAW-03).')} />;
  if (gq.isError) return <>{head}<Callout tone={(gq.error as any)?.status === 403 ? 'warn' : 'err'}>{(gq.error as any)?.status === 403 ? t('Peran Anda tidak memiliki izin eaw.model.read.') : api.explain(gq.error)}</Callout></>;
  const g = gq.data;
  const pick = (n: GNode) => setSel((s) => (s?.key === n.key ? null : n));
  return (
    <>
      {head}
      <div className="row mb" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Select value={entityId} onChange={(e) => { setEntityId(e.target.value); setSel(null); }} style={{ maxWidth: 320 }}>
          <option value="">{t('Semua entitas')}</option>{entities.rows.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
        </Select>
        <div className="chips">
          <label className="chip"><input type="radio" name="lind" checked={direction === 'impact'} onChange={() => setDirection('impact')} /> {t('Dampak (siapa bergantung)')}</label>
          <label className="chip"><input type="radio" name="lind" checked={direction === 'dependencies'} onChange={() => setDirection('dependencies')} /> {t('Dependensi (apa yang dibutuhkan)')}</label>
        </div>
        <label className="small row" style={{ gap: 6 }}>{t('Kedalaman')} <Select value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value))}>{[1, 2, 3, 5, 10].map((n) => <option key={n}>{n}</option>)}</Select></label>
      </div>
      <div className="grid g-2-1">
        <Card title={t('Graf Lineage')} flush meta={g ? `${g.nodes.length} ${t('node')} · ${g.edges.length} ${t('relasi')}${g.hiddenEndpoints ? ` · ${t('{0} relasi menuju objek di luar cakupan', g.hiddenEndpoints)}` : ''}${g.truncated ? ` · ${t('terpotong')}` : ''}` : undefined}>
          {!g ? <div className="small muted" style={{ padding: 16 }}>{t('Memuat…')}</div>
            : g.nodes.length ? <div style={{ overflowX: 'auto' }}><GraphSvg g={g} impact={sel ? iq.data : undefined} onPick={pick} /></div>
            : <div className="empty"><div className="big">∅</div>{t('Belum ada relasi antar-objek. Buat relasi dari detail aplikasi/layanan/proses untuk membangun graf.')}</div>}
        </Card>
        <div>{iq.isError ? <Callout tone="err">{api.explain(iq.error)}</Callout> : <Side im={sel ? iq.data : undefined} onClear={() => setSel(null)} />}</div>
      </div>
      <p className="tiny muted mt">{t('Arah ketergantungan: serving/realization/flow/triggering/used-by → target bergantung pada sumber; access/assignment/composition → sumber bergantung pada target; association dua arah. Lihat eaw.dependency_edge.')}</p>
    </>
  );
}
