'use client';
/* Peta Topologi Makro — Dual-Core & Lini PANRITA (mockup pages-eaw.js topology()), kini dari DATA NYATA (Zero Pre-Seed: tanpa platform contoh).
   Platform = eaw.application jenis_node 'platform'; workspace = jenis_node 'workspace' (kolom `platform` = kode platform induk).
   Klik platform → daftar workspace-nya; klik workspace → 6 Domain SAORAJA (D1–D6) dihitung dari eaw.relation (workspace = sumber/target
   relasi): jumlah objek terkait per domain + tautan ke halaman domain. Aturan relasi wajib (≥ 1 per domain D1–D3, D5, D6) = eaw.relation_check. */
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { Badge, Callout, Card, ModeTag } from '@/components/ui';
import { t } from '@/lib/i18n';

const DOMAINS: { id: string; label: string; type: string | null; href: string; color: string; hint: string }[] = [
  { id: 'D1', label: t('Proses Bisnis'), type: 'process', href: '/eaw/proses/', color: 'var(--d1)', hint: t('proses yang dilayani') },
  { id: 'D2', label: t('Data & Informasi'), type: 'data_entity', href: '/eaw/data/', color: 'var(--d2)', hint: t('entitas data diakses') },
  { id: 'D3', label: t('Layanan Enterprise'), type: 'service', href: '/eaw/layanan/', color: 'var(--d3)', hint: t('layanan disediakan') },
  { id: 'D4', label: t('Aplikasi & Integrasi'), type: 'application', href: '/eaw/aplikasi/', color: 'var(--d4)', hint: t('integrasi aplikasi lain') },
  { id: 'D5', label: t('Infrastruktur & Teknologi'), type: 'infra_asset', href: '/eaw/infra/', color: 'var(--d5)', hint: t('aset infrastruktur') },
  { id: 'D6', label: t('Keamanan Informasi'), type: 'control', href: '/eaw/keamanan/', color: 'var(--d6)', hint: t('kontrol keamanan') },
];
/** Domain yang wajib ≥ 1 relasi sebelum workspace Divalidasi (eaw.relation_check 'application'); D4 tidak wajib. */
const REQUIRED = new Set(['process', 'data_entity', 'service', 'infra_asset', 'control']);

interface Rel { id: string; sumberType: string; sumberId: string; targetType: string; targetId: string; tipe: string }

export function countByDomain(wsId: string, rels: Rel[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rels) {
    if (r.sumberType === 'application' && r.sumberId === wsId) out[r.targetType] = (out[r.targetType] || 0) + 1;
    else if (r.targetType === 'application' && r.targetId === wsId && r.sumberType === 'application') out.application = (out.application || 0) + 1;
  }
  return out;
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function TopoMap({ platforms, count, sel, onSel }: { platforms: api.Row[]; count: (p: api.Row) => number; sel: string | null; onSel: (k: string) => void }) {
  const left = platforms.filter((_, i) => i % 2 === 0), right = platforms.filter((_, i) => i % 2 === 1);
  const rows = Math.max(left.length, right.length, 2);
  const H = 70 + rows * 100 + 30;
  const cy = (i: number, n: number) => 70 + (i + 0.5) * ((H - 110) / n);
  const coreY1 = 40, coreH = H - 80;
  const node = (p: api.Row, x: number, y: number, w = 190) => {
    const on = sel === p.kode;
    return (
      <g key={p.id} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => onSel(p.kode)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSel(p.kode); }}>
        <rect x={x - w / 2} y={y - 22} width={w} height={44} rx={9} fill={on ? 'var(--accent-soft)' : 'var(--surface)'} stroke={on ? 'var(--accent)' : 'var(--border-strong)'} strokeWidth={on ? 2.5 : 1.5} />
        <text x={x} y={y - 3} textAnchor="middle" style={{ fontWeight: 700, fill: 'var(--text)', fontSize: 12 }}>{short(p.kode, 24)}</text>
        <text x={x} y={y + 13} textAnchor="middle" style={{ fontSize: 10 }}>{count(p)} workspace · {p.status}</text>
      </g>
    );
  };
  const core = (y: number, title: string, sub: string, stroke: string) => (
    <g>
      <rect x={250} y={y - 22} width={200} height={44} rx={9} fill="var(--surface)" stroke={stroke} strokeWidth={1.5} />
      <text x={350} y={y - 3} textAnchor="middle" style={{ fontWeight: 700, fill: 'var(--text)', fontSize: 12 }}>{title}</text>
      <text x={350} y={y + 13} textAnchor="middle" style={{ fontSize: 10 }}>{sub}</text>
    </g>
  );
  const mid = coreY1 + coreH / 2;
  return (
    <svg className="chart" style={{ display: 'block', width: '100%', maxWidth: 760, margin: '0 auto' }} viewBox={`0 0 700 ${H}`} role="img" aria-label={t('Topologi ekosistem')}>
      <defs><marker id="topo-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)" /></marker></defs>
      <rect x={230} y={coreY1} width={240} height={coreH} rx={16} fill="var(--accent-soft)" opacity={0.55} />
      <text x={350} y={coreY1 + 22} textAnchor="middle" style={{ fontWeight: 800, fill: 'var(--accent-text)', letterSpacing: '.1em', fontSize: 10.5 }}>DUAL-CORE FOUNDATION</text>
      {left.map((p, i) => <path key={'l' + p.id} d={`M185 ${cy(i, left.length)} L250 ${mid}`} stroke="var(--border-strong)" strokeDasharray="4 3" fill="none" markerEnd="url(#topo-ar)" />)}
      {right.map((p, i) => <path key={'r' + p.id} d={`M515 ${cy(i, right.length)} L450 ${mid}`} stroke="var(--border-strong)" strokeDasharray="4 3" fill="none" markerEnd="url(#topo-ar)" />)}
      {core(mid - 55, 'SAORAJA · EAP', t('Arsitektur · ARB · GSE'), 'var(--accent)')}
      {core(mid + 55, 'SEDDI · CMP', 'Golden Record · CDC pub_cmp_ref', 'var(--d2)')}
      <path d={`M340 ${mid - 33} L340 ${mid + 33}`} stroke="var(--d2)" strokeWidth={2} markerEnd="url(#topo-ar)" />
      <path d={`M360 ${mid + 33} L360 ${mid - 33}`} stroke="var(--accent)" strokeWidth={2} markerEnd="url(#topo-ar)" />
      <text x={368} y={mid + 3} style={{ fontSize: 9.5 }}>ref.applications</text>
      {left.map((p, i) => node(p, 95, cy(i, left.length)))}
      {right.map((p, i) => node(p, 605, cy(i, right.length)))}
    </svg>
  );
}

export default function Topology() {
  const apps = useQuery({ queryKey: ['eaw', 'topology', 'apps'], queryFn: () => api.all('/api/v1/eaw/applications') });
  const rels = useQuery({ queryKey: ['eaw', 'topology', 'rels'], queryFn: () => api.all<Rel>('/api/v1/eaw/relations'), retry: false });
  const [plat, setPlat] = React.useState<string | null>(null);
  const [wsId, setWsId] = React.useState<string | null>(null);

  const all = apps.data || [];
  const platforms = all.filter((a) => a.jenisNode === 'platform');
  const workspacesOf = (kode: string) => all.filter((a) => a.jenisNode === 'workspace' && a.platform === kode);
  const unplaced = all.filter((a) => a.jenisNode === 'workspace' && !a.platform);
  const selPlat = platforms.find((p) => p.kode === plat) || null;
  const wsList = selPlat ? workspacesOf(selPlat.kode) : [];
  const ws = wsList.find((w) => w.id === wsId) || null;
  const counts = ws && rels.data ? countByDomain(ws.id, rels.data) : null;

  const meta = apps.data ? t('{0} platform · klik node untuk membuka workspace', platforms.length) : undefined;
  return (
    <>
      <Card title={t('Peta Topologi Makro — Dual-Core & Lini PANRITA')} meta={meta}>
        {apps.isError ? <Callout tone="err">{api.explain(apps.error)}</Callout>
          : !apps.data ? <span className="muted small">{t('Memuat…')}</span>
          : platforms.length === 0 ? <Callout tone="info">{t('Belum ada platform terdaftar. EAP dimulai kosong (Zero Pre-Seed): Enterprise Application Architect mendaftarkan platform lewat D4 · Aplikasi & Integrasi.')}</Callout>
          : <TopoMap platforms={platforms} count={(p) => workspacesOf(p.kode).length} sel={plat} onSel={(k) => { setPlat(k); setWsId(null); }} />}
        {unplaced.length ? <div className="mt-s small muted">{t('{0} workspace belum ditempatkan di platform', unplaced.length)}</div> : null}
      </Card>

      {selPlat ? (
        <div className="mt">
          <Card title={`${t('Platform')} · ${selPlat.kode}`} meta={`${wsList.length} workspace`} acts={<Badge value={selPlat.status} />}>
            <div className="small muted mb">{selPlat.nama}</div>
            {wsList.length === 0 ? <Callout tone="info">{t('Platform ini belum memiliki workspace.')}</Callout> : (
              <div className="grid g3">
                {wsList.map((w) => (
                  <button key={w.id} type="button" className="card kpi" onClick={() => setWsId(w.id)}
                    style={{ textAlign: 'left', cursor: 'pointer', boxShadow: 'none', borderLeft: `4px solid ${w.id === wsId ? 'var(--accent)' : 'var(--border-strong)'}`, background: w.id === wsId ? 'var(--accent-soft)' : undefined }}>
                    <div className="lbl">{w.kode}</div>
                    <div style={{ fontWeight: 600, margin: '2px 0 6px' }}>{w.nama}</div>
                    <div className="row" style={{ gap: 6 }}><Badge value={w.status} /><ModeTag mode={w.workspaceMode} /></div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {ws ? (
        <div className="mt">
          <Card title={`${t('Workspace')} · ${ws.kode}`} meta={t('6 Domain SAORAJA')} acts={<Badge value={ws.status} />}>
            {rels.isError ? <div className="mb"><Callout tone="warn">{t('Relasi tidak tersedia untuk peran Anda; jumlah per domain tidak dapat dihitung.')}</Callout></div> : null}
            <div className="grid g3">
              {DOMAINS.map((d) => {
                const n = counts && d.type ? counts[d.type] || 0 : null;
                const missing = n === 0 && !!d.type && REQUIRED.has(d.type);
                return (
                  <Link key={d.id} href={d.href} className="card kpi" style={{ boxShadow: 'none', borderLeft: `4px solid ${d.color}`, textDecoration: 'none', color: 'inherit' }}>
                    <div className="lbl">{d.id} · {d.label}</div>
                    <div className="val">{n ?? '—'}</div>
                    <div className={`delta ${missing ? 'dn' : 'up'}`}>{n == null ? '' : missing ? `✕ ${t('relasi wajib kurang')}` : n ? `✓ ${d.hint}` : t('tidak wajib')}</div>
                  </Link>
                );
              })}
            </div>
            <div className="tiny muted mt-s">{t('Dihitung dari relasi workspace ini (eaw.relation); relasi wajib ≥ 1 per domain D1–D3, D5, D6 sebelum Divalidasi.')}</div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
