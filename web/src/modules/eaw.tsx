'use client';
/* EAW — Enterprise Architecture Workbench, tampilan = mockup (pages-eaw.js): .page-hd + kartu .card/.kpi/.onb/.hbar/.tbl. Tahap ini: dashboard + daftar
   baca-saja (drawer Detail) untuk 6 domain, aplikasi, KRA, ARB, ADR dan dokumen terbit. Penyusunan/transisi status (eaw.transition), relasi, kanvas,
   lineage dan roadmap masih di eap/ui. Data mengikuti RLS pemanggil (angka = yang boleh dilihat pengguna); bagian mockup tanpa data nyata
   (topologi, redundansi/drift, KPI) = eaw-topology.tsx & eaw-monitor.tsx dari data nyata; tidak dibuat sebagai data contoh. */
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtNum } from '@/lib/format';
import { GridPage, type GridSpec } from '@/components/grid/grid-page';
import { col } from '@/components/grid/cols';
import { Badge, Callout, Card, Hbar, Kpi, MiniTable, ModeTag, PageHd, PageSkeleton, Progress } from '@/components/ui';
import { StatusPanel, StatusTop, transitionActions, type ObjType } from './eaw-status';
import { objectExtra } from './eaw-relations';
import { ArbExtra, KraExtra, adrActions, arbActions, createAdr, createArb, createKra, deleteKra, editAdr, editArb, editKra } from './eaw-gov';
import Kanvas from './eaw-canvas';
import Topology from './eaw-topology';
import Repository from './eaw-repository';
import { EcosystemKpi, RedundancyDrift } from './eaw-monitor';
import Lineage from './eaw-lineage';
import Roadmap from './eaw-roadmap';
import Framework from './eaw-framework';
import Publisher from './eaw-publisher';
import { OBJ, createApplication, createObject, deleteApplication, deleteObject, editApplication, editObject, type ObjSpec } from './eaw-forms';
import { t } from '@/lib/i18n';

/* ---------- dashboard ---------- */
interface Dash {
  objects: Record<string, { total: number; byStatus: Record<string, number> }>;
  apps: { platforms: number; workspaces: number; unplaced: number; federated: number; ai_high: number };
  arb: Record<string, number>;
  relations: number;
  entities: { id: string; code: string; name: string; kafLevel: number | null; ikaLevel: number | null; objects: number; validated: number }[];
  bootstrap: { step: number; label: string; done: boolean; detail: string }[];
}
const STATUSES = ['Draf', 'Divalidasi', 'Ditetapkan', 'Dipublikasi', 'Direviu'] as const;
const SEG: Record<(typeof STATUSES)[number], string> = {
  Draf: 'var(--border-strong)', Divalidasi: 'var(--info)', Ditetapkan: 'var(--ok)', Dipublikasi: 'var(--violet)', Direviu: 'var(--warn)',
};
const TYPE_ROWS: [string, string, string][] = [
  ['process', t('Proses (D1)'), 'var(--d1)'], ['data_entity', t('Entitas data (D2)'), 'var(--d2)'], ['service', t('Layanan (D3)'), 'var(--d3)'], ['application', t('Aplikasi (D4)'), 'var(--d4)'],
  ['infra_asset', t('Infrastruktur (D5)'), 'var(--d5)'], ['control', t('Kontrol (D6)'), 'var(--d6)'], ['framework', t('Kerangka kerja'), 'var(--accent)'], ['reference', t('KRA'), 'var(--violet)'],
];
const IkaPill = ({ v }: { v: number | null }) => (v == null ? <span className="faint">—</span> : <span className="ika" title={`IKA ${v}`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= Math.floor(v) ? 'on' : ''} />)}</span>);

function Dashboard() {
  const q = useQuery({ queryKey: ['eaw', 'dashboard'], queryFn: () => api.get<Dash>('/api/v1/eaw/dashboard') });
  const d = q.data;
  const head = <PageHd title={t('Dashboard Arsitektur')} sub={t('Ringkasan objek arsitektur menurut status AF-05, dihitung dari data nyata dalam cakupan akses Anda.')}
    acts={<><button type="button" className="btn" onClick={() => q.refetch()}>{q.isFetching ? '…' : '↻'} {t('Muat ulang')}</button><Link className="btn pri" href="/eaw/publisher/">⇩ {t('Penerbit Dokumen')}</Link></>} />;
  if (q.isError) return <>{head}<Callout tone="err">{api.explain(q.error)}</Callout></>;
  if (!d) return <PageSkeleton />;
  const total = (s: string) => Object.values(d.objects).reduce((a, o) => a + (o.byStatus[s] || 0), 0);
  const all = Object.values(d.objects).reduce((a, o) => a + o.total, 0);
  const done = d.bootstrap.filter((b) => b.done).length;
  const cur = d.bootstrap.findIndex((b) => !b.done);
  const arbOpen = (d.arb.SUBMITTED || 0) + (d.arb.IN_REVIEW || 0) + (d.arb.REVISION || 0);
  return (
    <>
      {head}
      <Card title={t('Prinsip Bootstrap — EAP dimulai kosong, diisi Architect (SAF §8.2)')} meta={t('{0}/{1} langkah selesai', done, d.bootstrap.length)}>
        <div className="onb">
          {d.bootstrap.map((b, i) => (
            <div key={b.step} className={`s ${b.done ? 'done' : i === cur ? 'cur' : ''}`}><b>{t('LANGKAH')} {b.step}</b>{b.label}<div className="tiny faint mono">{b.detail}</div></div>
          ))}
        </div>
      </Card>
      <div className="grid g5 mt">
        <Kpi label={t('Aplikasi terdaftar')} value={fmtNum(d.objects.application?.total ?? 0)} unit={t('entri')} delta={t('{0} Dipublikasi', d.objects.application?.byStatus.Dipublikasi ?? 0)} tgt={t('APM · Zero Pre-Seed')} />
        <Kpi label={t('Platform · Workspace')} value={`${d.apps.platforms} · ${d.apps.workspaces}`} delta={t('{0} belum ditempatkan', d.apps.unplaced)} tgt={`${d.apps.federated} FEDERATED_REMOTE`} />
        <Kpi label={t('Tiket ARB aktif')} value={arbOpen} tgt="FR-01.4" />
        <Kpi label={t('Relasi antar-objek')} value={fmtNum(d.relations)} tgt="eaw.relation" />
        <Kpi label={t('Risiko AI tinggi')} value={d.apps.ai_high} tgt="EAW-02" />
      </div>
      <div className="mt"><Topology /></div>
      <div className="grid g2 mt" style={{ alignItems: 'start' }}><RedundancyDrift /><EcosystemKpi /></div>
      <div className="grid g-2-1 mt">
        <Card title={t('Objek per domain')} meta={`${fmtNum(all)} ${t('objek')}`}>
          {TYPE_ROWS.map(([k, label, color]) => {
            const o = d.objects[k] || { total: 0, byStatus: {} };
            return <Hbar key={k} label={<span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><i className="dom-dot" style={{ background: color }} />{label}</span>} total={o.total}
              segments={STATUSES.map((s) => ({ v: o.byStatus[s] || 0, color: SEG[s], title: `${s}: ${o.byStatus[s] || 0}` }))} />;
          })}
          <div className="legend mt-s">{STATUSES.map((s) => <span key={s}><i className="dom-dot" style={{ background: SEG[s] }} />{s}</span>)}</div>
        </Card>
        <Card title={t('Status Objek (AF-05)')}>
          <div className="stack">
            {STATUSES.map((s) => <div key={s} className="row small"><i className="dom-dot" style={{ background: SEG[s] }} />{s}<b className="right">{total(s)}</b></div>)}
          </div>
          <div className="row mt small" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><b>{t('Total')}</b><b className="right">{all}</b></div>
          <div className="chips mt-s">{Object.entries(d.arb).map(([k, v]) => <span key={k} className="tag">{k} · {v}</span>)}</div>
        </Card>
      </div>
      <div className="mt">
        <Card title={t('Kelengkapan per entitas')} meta={t('objek ≥ Divalidasi / total objek')} flush>
          <MiniTable rows={d.entities} columns={[
            { label: t('Kode'), mono: true, render: (e) => e.code }, { label: t('Entitas'), render: (e) => e.name },
            { label: 'KAF', num: true, render: (e) => e.kafLevel ?? '—' }, { label: 'IKA', render: (e) => <IkaPill v={e.ikaLevel} /> },
            { label: t('Objek'), num: true, render: (e) => fmtNum(e.objects) },
            { label: t('Tervalidasi'), render: (e) => (e.objects ? <span className="row" style={{ flexWrap: 'nowrap' }}><span style={{ width: 110 }}><Progress pct={(e.validated / e.objects) * 100} /></span><span className="small">{Math.round((e.validated / e.objects) * 100)}%</span></span> : '—') },
          ]} />
        </Card>
      </div>
    </>
  );
}

/** Sel kolom "Induk": nama proses induk dari daftar proses (cache TanStack, satu permintaan untuk semua baris). */
function ParentCell({ value }: { value?: string | null }) {
  const q = useQuery({ queryKey: ['eaw', 'proc-names'], queryFn: () => api.all('/api/v1/eaw/objects/processes'), staleTime: 30_000 });
  if (!value) return <span className="faint">—</span>;
  return <span>{(q.data || []).find((r) => r.id === value)?.nama ?? '…'}</span>;
}

/* ---------- 6 domain (objek generik: /eaw/objects/<path>) ---------- */
const statusCol = col.badge('status', t('Status'), { maxWidth: 150 });
const entityCol = col.tag('entityCode', t('Entitas'));
const versionCol = col.num('version', t('Versi'), 0, { maxWidth: 100 });
const STATUS_FILTER = { name: 'status', label: t('Semua status'), options: [...STATUSES] as string[] };
const W = 'eaw.model.write';

/** Halaman objek domain: kolom + aksi tulis (buat di kepala halaman; ubah/hapus di drawer Detail). Teks judul/subjudul = mockup pages-eaw.js. */
function objectPage(o: ObjSpec, type: ObjType, title: string, sub: string, createLabel: string, exportName: string, columns: GridSpec['columns'], titleKey: string) {
  return function ObjectPage() {
    return <GridPage title={title} description={sub} path={`/api/v1/eaw/objects/${o.path}`} exportName={exportName} entityParam titleOf={(r) => r[titleKey]}
      columns={[...columns, statusCol]} filters={[STATUS_FILTER]}
      create={{ label: createLabel, perm: W, run: () => createObject(o) }} edit={{ perm: W, run: (r) => editObject(o, r) }} remove={{ perm: W, run: (r) => deleteObject(o, r) }}
      DetailTop={StatusTop} DetailExtra={objectExtra(type)} rowActions={transitionActions(type)}
      detail={(r) => [...o.fields.map((f) => [f.label, r[f.name] === true ? t('ya') : r[f.name] === false ? t('tidak') : r[f.name]] as const), [t('Entitas'), r.entityCode], [t('Status'), <Badge key="s" value={r.status} />], [t('Versi'), r.version]]} />;
  };
}
const Proses = objectPage(OBJ.processes, 'process', t('Domain 1 · Proses Bisnis'), t('Peta rantai nilai Holding (L0), Core Industry (L1), dan rincian SOP (L2–L3). Setiap proses wajib menghasilkan Layanan, memakai Entitas Data, dan dilayani Aplikasi (SAF §5).'), `+ ${t('Proses')}`, 'proses',
  [col.strong('nama', t('Proses')), col.num('level', t('Level'), 0, { maxWidth: 90 }), { headerName: t('Induk'), minWidth: 170, valueGetter: (p) => p.data?.parentId, cellRenderer: ParentCell }, col.text('pemilikJabatan', t('Pemilik')), col.text('input', t('Input')), col.text('output', t('Output')), entityCol], 'nama');
const Data = objectPage(OBJ['data-entities'], 'data_entity', t('Domain 2 · Data & Informasi'), t('Kamus data kanonikal, pemetaan master SEDDI (7 domain data master), dan silsilah data. Setiap entitas data wajib memiliki steward dan sumber otoritatif.'), `+ ${t('Entitas Data')}`, 'entitas-data',
  [col.twoLine('namaKanonikal', t('Entitas data'), (r) => r.sumberOtoritatif || ''), col.badge('klasifikasi', t('Klasifikasi')), col.bool('pii', 'PII'), col.text('steward', t('Steward')), col.num('retensiHari', t('Retensi (hari)'), 0), entityCol], 'namaKanonikal');
const Infra = objectPage(OBJ['infra-assets'], 'infra_asset', t('Domain 5 · Infrastruktur & Teknologi'), t('Topologi Hybrid Multi-Cloud (DC On-Prem Makassar + cloud), SD-WAN antar-cabang, dan IdP terpusat. Setiap aset wajib menjalankan ≥ 1 aplikasi.'), `+ ${t('Aset Infrastruktur')}`, 'infrastruktur',
  [col.twoLine('nama', t('Aset'), (r) => r.lokasi || ''), col.tag('tipe', t('Tipe')), col.text('kapasitas', t('Kapasitas')), col.text('drTier', 'DR tier'), entityCol], 'nama');
const Keamanan = objectPage(OBJ.controls, 'control', t('Domain 6 · Keamanan Informasi'), t('Matriks kepatuhan UU PDP No. 27/2022, PP 71/2019, dan ISO/IEC 27001 per 5 aspek keamanan; profil risiko sistem. Zero Trust & least privilege.'), `+ ${t('Kontrol')}`, 'kontrol',
  [col.tag('aspek', t('Aspek')), col.strong('standarRujukan', t('Standar rujukan')), col.badge('statusPenerapan', t('Penerapan')), entityCol], 'aspek');

/* ---------- layanan (toolbar chips Tipe seperti mockup) ---------- */
function Layanan() {
  const [tipe, setTipe] = React.useState('');
  const chips: [string, string][] = [['', t('Semua')], ['internal', t('Internal Korporat')], ['pelanggan-mitra', t('Pelanggan & Mitra')]];
  const o = OBJ.services;
  return <GridPage title={t('Domain 3 · Layanan Enterprise')} description={t('Katalog layanan Internal Korporat (H2E, antar-entitas) dan Layanan Pelanggan & Mitra (B2B/B2C), beserta SLO. Setiap layanan wajib punya ≥ 1 proses.')}
    path="/api/v1/eaw/objects/services" exportName="layanan" entityParam titleOf={(r) => r.nama} rowFilter={React.useCallback((r: api.Row) => !tipe || r.tipe === tipe, [tipe])}
    toolbarLead={<div className="chips">{chips.map(([k, l]) => <button key={k} type="button" className={`chip ${tipe === k ? 'on' : ''}`} onClick={() => setTipe(k)}>{l}</button>)}</div>}
    columns={[col.twoLine('nama', t('Layanan'), (r) => r.pemilik || ''), col.badge('tipe', t('Tipe'), { label: (r) => (r.tipe === 'internal' ? 'Internal' : t('Pelanggan & Mitra')) }), col.text('kategori', t('Kategori')), col.text('kanal', t('Kanal')), col.text('slo', 'SLO'), entityCol, statusCol]}
    filters={[STATUS_FILTER]}
    create={{ label: `+ ${t('Layanan')}`, perm: W, run: () => createObject(o) }} edit={{ perm: W, run: (r) => editObject(o, r) }} remove={{ perm: W, run: (r) => deleteObject(o, r) }}
    DetailTop={StatusTop} DetailExtra={objectExtra('service')} rowActions={transitionActions('service')}
    detail={(r) => [...o.fields.map((f) => [f.label, r[f.name]] as const), [t('Entitas'), r.entityCode], [t('Status'), <Badge key="s" value={r.status} />], [t('Versi'), r.version]]} />;
}

/* ---------- aplikasi (kolom & sub-teks = mockup appTable) ---------- */
const KRIT: Record<string, string> = { critical: 'b-err', high: 'b-warn', medium: 'b-info', low: '' };
function Aplikasi() {
  return (
    <GridPage title={t('Domain 4 · Aplikasi & Integrasi')} description={t('Katalog portofolio APM (dimulai kosong — Zero Pre-Seed), konfigurasi mode workspace, dan registri API. Entri baru wajib 4 metadata: Pemilik Bisnis, Tim Pengembang, Risiko AI, SLO (EAW-02).')}
      path="/api/v1/eaw/applications" exportName="aplikasi" search={t('Cari kode, nama, platform…')} entityParam titleOf={(r) => r.nama}
      columns={[col.mono('kode', t('Kode'), { cellStyle: { fontWeight: 700 }, minWidth: 100, maxWidth: 120 }), col.twoLine('nama', t('Nama'), (r) => (r.platform ? t('workspace di {0}', r.platform) : 'platform')),
        { headerName: t('Jenis'), maxWidth: 120, valueGetter: (p) => (p.data?.jenis === 'umum' ? t('Umum') : t('Khusus')), cellRenderer: (p: { value: string; data?: api.Row }) => <Badge cls={`${p.data?.jenis === 'umum' ? 'b-info' : 'b-gold'} nodot`}>{p.value}</Badge> },
        col.mode('workspaceMode', t('Mode')), col.text('lifecycle', 'Lifecycle', { minWidth: 90, maxWidth: 110 }),
        { headerName: t('Kritikalitas'), minWidth: 130, maxWidth: 140, valueGetter: (p) => p.data?.kritikalitas, cellRenderer: (p: { value: string }) => (p.value ? <Badge cls={KRIT[p.value] ?? ''}>{p.value}</Badge> : <span className="faint">—</span>) },
        col.text('risikoAi', t('Risiko AI'), { minWidth: 100, maxWidth: 110 }), col.text('ownerBisnis', t('Owner Bisnis'), { minWidth: 150 }), col.badge('status', t('Status'), { minWidth: 120, maxWidth: 130 })]}
      filters={[{ name: 'jenis', label: t('Semua jenis'), options: [['umum', t('Aplikasi Umum (Holding)')], ['khusus', t('Aplikasi Khusus (STRIDE)')]] }, STATUS_FILTER]}
      create={{ label: `+ ${t('Daftarkan Aplikasi')}`, perm: 'eaw.catalog.write', run: () => createApplication() }}
      edit={{ perm: 'eaw.catalog.write', run: (r) => editApplication(r) }} remove={{ perm: 'eaw.catalog.write', run: (r) => deleteApplication(r) }}
      DetailTop={StatusTop} DetailExtra={objectExtra('application')} rowActions={transitionActions('application')}
      detail={(r) => [[t('Kode'), r.kode], [t('Nama'), r.nama], [t('Jenis node'), r.jenisNode], [t('Platform'), r.platform], [t('Jenis'), r.jenis], [t('Mode'), <ModeTag key="m" mode={r.workspaceMode} />], ['Lifecycle', r.lifecycle], [t('Kritikalitas'), r.kritikalitas],
        [t('Risiko AI'), r.risikoAi], [t('Pemilik Bisnis'), r.ownerBisnis], [t('Tim Pengembang'), r.timPengembang], ['SLO', r.slo], ['Git', r.repoGit], [t('Entitas'), r.entityCode], [t('Status'), <Badge key="s" value={r.status} />], [t('Versi'), r.version]]} />
  );
}

/* ---------- tata kelola ---------- */
function Kra() {
  return <GridPage title={t('KRA Manager — Referensi Arsitektur Korporat')} description={t('Referensi baku per domain, berversi; hanya Holding EA Office yang dapat mengubah (AF-04). Objek entitas wajib tertaut ke KRA; perubahan versi menandai objek terdampak untuk direviu (EAW-06).')}
    path="/api/v1/eaw/references" exportName="kra" titleOf={(r) => r.nama}
    DetailTop={StatusTop} DetailExtra={KraExtra} rowActions={transitionActions('reference')}
    create={{ label: `+ ${t('KRA baru')}`, perm: 'eaw.reference.write', run: () => createKra() }} edit={{ perm: 'eaw.reference.write', run: (r) => editKra(r) }} remove={{ perm: 'eaw.reference.write', run: (r) => deleteKra(r) }}
    columns={[col.mono('kode', t('Kode'), { cellStyle: { fontWeight: 700 } }), col.strong('nama', t('Nama')), col.tag('domain', t('Domain')), col.text('versi', t('Versi KRA'), { maxWidth: 110 }), statusCol]} />;
}
function Arb() {
  return <GridPage title={t('Tata Kelola & ARB Clearance')} description={t('Setiap pengadaan/pembuatan aplikasi baru wajib clearance ARB (anti-redundansi). Alur: Pengajuan SBU → Pre-screening MIND AI → Evaluasi Domain Architects → Putusan ARB Chair → Sertifikat → Gate AF-06 terbuka.')}
    path="/api/v1/gov/arb/clearances" exportName="arb" entityParam titleOf={(r) => r.initiativeName}
    create={{ label: `+ ${t('Ajukan Tiket ARB')}`, perm: 'gov.arb.write', run: () => createArb() }} edit={{ perm: 'gov.arb.write', run: (r) => editArb(r) }}
    DetailExtra={ArbExtra} rowActions={arbActions}
    columns={[col.mono('ticketNumber', t('Tiket')), col.strong('initiativeName', t('Inisiatif')), entityCol, col.badge('status', t('Status')),
      col.num('aiRiskScore', t('Skor risiko'), 2, { maxWidth: 120 }), col.num('estimatedCost', t('Estimasi biaya'), 0), col.dateTime('createdAt', t('Dibuat'))]}
    filters={[{ name: 'status', label: t('Semua status'), options: ['SUBMITTED', 'IN_REVIEW', 'REVISION', 'APPROVED', 'REJECTED'] }]} />;
}
function Adr() {
  return <GridPage title={t('Architecture Decision Records')} description={t('Register keputusan berversi Git (D-01 s/d D-14 sejak Fase 0, plus ADR-CMP & ADR-EAP). Status: Proposed, Accepted, Deprecated, Superseded (EAW-04). Disimpan sebagai Markdown di repo eap.')}
    path="/api/v1/eaw/adrs" exportName="adr" titleOf={(r) => r.title}
    create={{ label: `+ ${t('ADR Baru')}`, perm: 'eaw.adr.write', run: () => createAdr() }} edit={{ perm: 'eaw.adr.write', run: (r) => editAdr(r) }} rowActions={adrActions}
    columns={[col.mono('adrCode', t('Kode'), { cellStyle: { fontWeight: 700 } }), col.strong('title', t('Judul')), col.badge('status', t('Status')), col.text('gitRef', 'Git'), col.dateTime('createdAt', t('Dibuat'))]}
    detail={(r) => [[t('Konteks'), r.context], [t('Keputusan'), r.decision], [t('Konsekuensi'), r.consequences], [t('Status'), r.status], [t('Diganti oleh'), r.supersededBy]]} />;
}
export default { dashboard: Dashboard, repository: Repository, proses: Proses, data: Data, layanan: Layanan, aplikasi: Aplikasi, infra: Infra, keamanan: Keamanan, kra: Kra, arb: Arb, adr: Adr, publisher: Publisher, kerangka: Framework, kanvas: Kanvas, lineage: Lineage, roadmap: Roadmap };
