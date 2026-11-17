'use client';
/* Repository per platform (fokus satu platform): pohon Platform → Workspace → 6 Domain di kiri, daftar objek untuk node terpilih di kanan.
   Data = GET /api/v1/eaw/repository (objek berelasi LANGSUNG dengan workspace; RLS pemanggil). Tanpa data contoh (Zero Pre-Seed). */
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { Badge, Callout, Card, DL, MiniTable, PageHd, PageSkeleton, Tag } from '@/components/ui';
import { Drawer, openDrawer } from '@/components/overlay';
import { downloadText, toCsv } from '@/lib/format';
import { toast } from '@/store/ui';
import { OBJ } from './eaw-forms';
import { StatusTop } from './eaw-status';
import { objectExtra } from './eaw-relations';
import { t } from '@/lib/i18n';

type DomainType = 'process' | 'data_entity' | 'service' | 'application' | 'infra_asset' | 'control';
interface Item { id: string; label: string; status: string | null; tipe: string }
interface Workspace { id: string; kode: string; nama: string; status: string; mode: string | null; objects: Record<DomainType, Item[]> }
interface Platform { id: string; kode: string; nama: string; status: string; workspaces: Workspace[] }
interface Repo { domains: DomainType[]; platforms: Platform[]; unplaced: Workspace[]; truncated: boolean }

const DOM: Record<DomainType, { id: string; label: string; color: string; href: string }> = {
  process: { id: 'D1', label: t('Proses Bisnis'), color: 'var(--d1)', href: '/eaw/proses/' },
  data_entity: { id: 'D2', label: t('Data & Informasi'), color: 'var(--d2)', href: '/eaw/data/' },
  service: { id: 'D3', label: t('Layanan Enterprise'), color: 'var(--d3)', href: '/eaw/layanan/' },
  application: { id: 'D4', label: t('Aplikasi & Integrasi'), color: 'var(--d4)', href: '/eaw/aplikasi/' },
  infra_asset: { id: 'D5', label: t('Infrastruktur & Teknologi'), color: 'var(--d5)', href: '/eaw/infra/' },
  control: { id: 'D6', label: t('Keamanan Informasi'), color: 'var(--d6)', href: '/eaw/keamanan/' },
};

/** Jenis objek → spesifikasi form (path API + label kolom) untuk drawer detail; aplikasi punya endpoint sendiri. */
const SPEC_OF: Partial<Record<DomainType, (typeof OBJ)[string]>> = {
  process: OBJ.processes, data_entity: OBJ['data-entities'], service: OBJ.services, infra_asset: OBJ['infra-assets'], control: OBJ.controls,
};
const APP_FIELDS: [string, string][] = [['kode', t('Kode')], ['nama', t('Nama')], ['jenisNode', t('Jenis node')], ['platform', t('Platform')], ['jenis', t('Jenis')], ['workspaceMode', t('Mode')],
  ['kritikalitas', t('Kritikalitas')], ['risikoAi', t('Risiko AI')], ['ownerBisnis', t('Pemilik Bisnis')], ['timPengembang', t('Tim Pengembang')], ['slo', 'SLO'], ['entityCode', t('Entitas')]];

/** Buka drawer detail objek (baca objek penuh dari API → siklus status, atribut, relasi + kesiapan + riwayat; transisi/relasi tetap dibatasi izin & DB). */
async function openObject(type: DomainType, item: Item) {
  try {
    const spec = SPEC_OF[type];
    const row = await api.get<api.Row>(type === 'application' ? `/api/v1/eaw/applications/${item.id}` : `/api/v1/eaw/objects/${spec!.path}/${item.id}`);
    const pairs: (readonly [React.ReactNode, React.ReactNode])[] = type === 'application'
      ? APP_FIELDS.map(([k, l]) => [l, row[k]] as const)
      : [...spec!.fields.map((f) => [f.label, row[f.name] === true ? t('ya') : row[f.name] === false ? t('tidak') : row[f.name]] as const), [t('Entitas'), row.entityCode]];
    const Extra = objectExtra(type);
    openDrawer((close) => (
      <Drawer close={close} title={item.label} sub={`${DOM[type].id} · ${DOM[type].label}`}
        footer={<Link className="btn" href={DOM[type].href} onClick={close}>{t('Buka halaman domain')} →</Link>}>
        <div className="mb"><StatusTop row={row} /></div>
        <DL pairs={[...pairs, [t('Status'), <Badge key="s" value={row.status} />], [t('Versi'), row.version]]} />
        <div className="mt"><Extra row={row} /></div>
      </Drawer>
    ));
  } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); }
}

/** CSV rata (satu baris per objek per workspace) untuk sebagian workspace: Platform, Workspace, Domain, Objek, Relasi, Status. */
function exportCsv(d: Repo, label: string, picks: { platform: string; ws: Workspace }[]) {
  const rows: unknown[][] = [];
  for (const { platform, ws } of picks) for (const k of d.domains) for (const o of ws.objects[k]) rows.push([platform, ws.kode, `${DOM[k].id} ${DOM[k].label}`, o.label, o.tipe, o.status ?? '']);
  if (!rows.length) return toast(t('Tidak ada data untuk diekspor'), undefined, 'info');
  downloadText(`repository-${label.replace(/[^A-Za-z0-9_.-]+/g, '_')}.csv`, toCsv(['Platform', 'Workspace', 'Domain', t('Objek'), t('Relasi'), 'Status'], rows), 'text/csv');
  toast(t('CSV diekspor'), `${rows.length} ${t('baris')}`, 'success');
}

/** Pilihan pohon: platform (w = null) atau workspace; `unplaced` = kelompok workspace tanpa platform. */
interface Sel { p: string; w: string | null }

const uniq = (ws: Workspace[], d: DomainType) => new Set(ws.flatMap((w) => w.objects[d].map((o) => o.id))).size;

export default function Repository() {
  const q = useQuery({ queryKey: ['eaw', 'repository'], queryFn: () => api.get<Repo>('/api/v1/eaw/repository') });
  const [sel, setSel] = React.useState<Sel | null>(null);
  const [dom, setDom] = React.useState<DomainType>('process');
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState('');
  const d = q.data;

  const groups = React.useMemo(() => {
    if (!d) return [] as { key: string; kode: string; nama: string; status: string | null; workspaces: Workspace[] }[];
    const g = d.platforms.map((p) => ({ key: p.kode, kode: p.kode, nama: p.nama, status: p.status as string | null, workspaces: p.workspaces }));
    if (d.unplaced.length) g.push({ key: '__unplaced', kode: t('Belum ditempatkan'), nama: '', status: null, workspaces: d.unplaced });
    return g;
  }, [d]);

  // pilihan awal: platform pertama (terbuka), supaya halaman langsung berisi
  React.useEffect(() => {
    if (!sel && groups.length) { setSel({ p: groups[0].key, w: null }); setOpen(new Set([groups[0].key])); }
  }, [groups, sel]);

  const head = <PageHd title={t('Repository')} sub={t('Telusuri objek arsitektur per platform: pilih platform, workspace, lalu domain (D1–D6). Objek = yang berelasi langsung dengan workspace.')}
    acts={<button type="button" className="btn" onClick={() => q.refetch()}>{q.isFetching ? '…' : '↻'} {t('Muat ulang')}</button>} />;
  if (q.isError) return <>{head}<Callout tone="err">{api.explain(q.error)}</Callout></>;
  if (!d) return <PageSkeleton />;
  if (!groups.length) return <>{head}<Callout tone="info">{t('Belum ada platform atau workspace terdaftar. EAP dimulai kosong (Zero Pre-Seed): Architect mendaftarkannya lewat D4 · Aplikasi & Integrasi.')}</Callout></>;

  const grp = groups.find((g) => g.key === sel?.p) || groups[0];
  const wsSel = sel?.w ? grp.workspaces.find((w) => w.id === sel.w) || null : null;
  const scope = wsSel ? [wsSel] : grp.workspaces;
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pick = (p: string, w: string | null, dd?: DomainType) => { setSel({ p, w }); if (dd) setDom(dd); setOpen((o) => new Set(o).add(p).add(w ?? p)); };

  // baris tabel: gabungkan objek yang sama lintas workspace (mode platform)
  const merged = new Map<string, { item: Item; ws: string[] }>();
  for (const w of scope) for (const it of w.objects[dom]) {
    const m = merged.get(it.id);
    if (m) m.ws.push(w.kode); else merged.set(it.id, { item: it, ws: [w.kode] });
  }
  const f = filter.trim().toLowerCase();
  const rows = [...merged.values()].filter((r) => !f || r.item.label.toLowerCase().includes(f));
  const path = [grp.kode, wsSel?.kode].filter(Boolean).join(' › ');

  return (
    <>
      {head}
      <div className="grid g-1-2">
        <Card title={t('Platform & Workspace')} meta={`${groups.length} ${t('kelompok')}`} flush>
          <div className="tree" style={{ padding: 10 }}>
            <ul>
              {groups.map((g) => {
                const isOpen = open.has(g.key);
                return (
                  <li key={g.key}>
                    <div className={`node ${sel?.p === g.key && !sel.w ? 'on' : ''}`} onClick={() => pick(g.key, null)}>
                      <span role="button" tabIndex={0} style={{ cursor: 'pointer', width: 14, display: 'inline-block' }} aria-label={isOpen ? t('Tutup') : t('Buka')} onClick={(e) => { e.stopPropagation(); toggle(g.key); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(g.key); } }}>{isOpen ? '▾' : '▸'}</span>
                      <span className="lvl">P</span><span style={{ flex: 1 }}><b>{g.kode}</b>{g.nama ? <span className="tiny muted"> · {g.nama}</span> : null}</span>
                      <span className="tiny muted">{g.workspaces.length} ws</span>
                    </div>
                    {isOpen ? (
                      <ul>
                        {g.workspaces.map((w) => {
                          const wOpen = open.has(w.id);
                          return (
                            <li key={w.id}>
                              <div className={`node ${sel?.w === w.id ? 'on' : ''}`} onClick={() => pick(g.key, w.id)}>
                                <span role="button" tabIndex={0} style={{ cursor: 'pointer', width: 14, display: 'inline-block' }} aria-label={wOpen ? t('Tutup') : t('Buka')} onClick={(e) => { e.stopPropagation(); toggle(w.id); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(w.id); } }}>{wOpen ? '▾' : '▸'}</span>
                                <span className="lvl">W</span><span style={{ flex: 1 }}>{w.kode}</span><Badge value={w.status} />
                              </div>
                              {wOpen ? (
                                <ul>
                                  {d.domains.map((k) => (
                                    <li key={k}>
                                      <div className={`node ${sel?.w === w.id && dom === k ? 'on' : ''}`} onClick={() => pick(g.key, w.id, k)}>
                                        <i className="dom-dot" style={{ background: DOM[k].color }} />
                                        <span style={{ flex: 1 }}>{DOM[k].id} · {DOM[k].label}</span><b className="small">{w.objects[k].length}</b>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          );
                        })}
                        {g.workspaces.length === 0 ? <li><div className="node"><span className="muted small">{t('Belum ada workspace.')}</span></div></li> : null}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>

        <div className="stack">
          <Card title={path} meta={wsSel ? t('workspace') : `${grp.workspaces.length} workspace`} acts={<>{grp.status ? <Badge value={grp.status} /> : null}<button type="button" className="btn sm" title={t('Ekspor seluruh platform dan workspace')} onClick={() => exportCsv(d, 'semua', groups.flatMap((g) => g.workspaces.map((ws) => ({ platform: g.kode, ws }))))}>⇩ CSV {t('semua platform')}</button></>}>
            <div className="chips">
              {d.domains.map((k) => (
                <button key={k} type="button" className={`chip ${dom === k ? 'on' : ''}`} onClick={() => setDom(k)}>
                  <i className="dom-dot" style={{ background: DOM[k].color }} /> {DOM[k].id} · {DOM[k].label} <b>{uniq(scope, k)}</b>
                </button>
              ))}
            </div>
          </Card>

          <Card title={`${DOM[dom].id} · ${DOM[dom].label}`} meta={`${rows.length} ${t('objek')}`} flush
            acts={<><input className="input" style={{ maxWidth: 200 }} placeholder={t('Saring nama…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
              <button type="button" className="btn sm" title={t('Ekspor seluruh domain untuk pilihan ini')} onClick={() => exportCsv(d, path.replace(/ › /g, '-'), scope.map((ws) => ({ platform: grp.kode, ws })))}>⇩ CSV</button><Link className="btn sm" href={DOM[dom].href}>{t('Buka halaman domain')} →</Link></>}>
            <MiniTable rows={rows} onRow={(r) => openObject(dom, r.item)} empty={t('Tidak ada objek di domain ini untuk pilihan Anda.')} columns={[
              { label: t('Nama'), render: (r) => r.item.label },
              { label: t('Relasi'), render: (r) => <Tag>{r.item.tipe}</Tag> },
              { label: t('Status'), render: (r) => (r.item.status ? <Badge value={r.item.status} /> : <span className="faint">—</span>) },
              ...(wsSel ? [] : [{ label: 'Workspace', render: (r: { ws: string[] }) => <span className="small">{r.ws.join(', ')}</span> }]),
            ]} />
          </Card>
          {d.truncated ? <Callout tone="warn">{t('Data dipotong pada batas relasi; sebagian objek tidak tampil.')}</Callout> : null}
        </div>
      </div>
    </>
  );
}
