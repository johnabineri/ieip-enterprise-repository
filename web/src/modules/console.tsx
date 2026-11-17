'use client';
/* CONSOLE — Enterprise Control Console: Skor IKA (terhitung dari data EAW), AI Model & Risk Register (admin model/dataset, D-05 ditegakkan DB), FinOps (showback
   dari metering NYATA + rekonsiliasi faktur ≤ 2%), Observability (metrik nyata proses API, ping DB, replikasi), Security Center (kill-switch + log guardrail).
   Semua angka berasal dari API; keterbatasan dinyatakan di UI. EIO Control Center = console-eio.tsx.
   Izin: console.dashboard.read|write, console.ai.admin, console.finops.read, console.security.admin, console.eio.*. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDT, fmtNum } from '@/lib/format';
import { invalidateData } from '@/lib/query';
import { locale, t } from '@/lib/i18n';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { act, confirmDialog, formDialog } from '@/components/overlay';
import { Badge, Btn, Callout, Card, Hbar, Input, Kpi, MiniTable, PageHd, Tag } from '@/components/ui';
import { BarChart, LineChart, heatBg } from '@/components/charts';
import Eio from './console-eio';

const LV = ['var(--err)', 'var(--warn)', 'var(--d2)', 'var(--ok)', 'var(--violet)'];
const idr = (n: unknown) => `Rp ${Number(n || 0).toLocaleString(locale(), { maximumFractionDigits: 2 })}`;
const when = (s?: string | null) => (s ? fmtDT(s) : '—');
const KLAS = ['publik', 'internal', 'terbatas', 'rahasia'];
const denied = (e: unknown) => (e as api.ApiError)?.status === 403;
const Err = ({ e, perm }: { e: unknown; perm?: string }) => <Callout tone={denied(e) ? 'warn' : 'err'}>{denied(e) ? t('Peran Anda tidak memiliki izin untuk melihat halaman ini (403 dari API).') + (perm ? ` (${perm})` : '') : api.explain(e)}</Callout>;

/* ---------------------------------------------------------------- 4.1 IKA ---------------------------------------------------------------- */
const Chk = ({ ok, title }: { ok: boolean; title: string }) => <span className={`badge ${ok ? 'b-ok' : ''} nodot`} title={title}>{ok ? '✓' : '–'}</span>;
const TY: Record<string, string> = { process: t('Proses'), data_entity: t('Entitas Data'), service: t('Layanan'), application: t('Aplikasi'), infra_asset: t('Infrastruktur'), control: t('Kontrol') };

function Ika() {
  const q = useQuery({ queryKey: ['console-ika'], queryFn: () => api.get<api.Row>('/api/v1/console/ika') });
  const tq = useQuery({ queryKey: ['console-ika-trend'], queryFn: () => api.get<api.Row>('/api/v1/console/ika/trend') });
  const head = <PageHd title={t('Dashboard Skor Kematangan IKA')} sub={t('IKA SAORAJA Level 1–5 dihitung otomatis dari data EAW (SAF §6.3, EAW-08): per entitas × domain, dengan syarat Level 4–5 dan tren dari snapshot.')} />;
  if (q.isError) return <>{head}<Err e={q.error} /></>;
  const r = q.data, tr = tq.data;
  if (!r) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  const ents: api.Row[] = r.entities.filter((e: api.Row) => e.objects > 0);
  const per = [1, 2, 3, 4, 5].map((l) => ents.filter((e) => e.level === l).length);
  const snap = () => act(async () => { const x = await api.post('/api/v1/console/ika/snapshot', {}); tq.refetch(); return x; }, (x) => t('Snapshot IKA tersimpan: {0} entitas · rata-rata {1}', x.entities, x.groupAverage));
  const gapRows = ents.flatMap((e) => [...e.gaps.kra.sample.map((g: api.Row) => ({ e, g, chk: 'KRA (L3)', n: e.gaps.kra.count })), ...e.gaps.lineage.sample.map((g: api.Row) => ({ e, g, chk: 'Lineage (L4)', n: e.gaps.lineage.count }))]);
  return (
    <>
      {head}
      <div className="grid g5 mb">{r.criteria.map((c: string, i: number) => (
        <div key={i} className="card kpi"><div className="row"><span className="avatar" style={{ background: LV[i], color: '#fff' }}>L{i + 1}</span><span className="tiny muted" style={{ flex: 1 }}>{c.slice(4)}</span></div><div className="val">{per[i]}<small>{t('entitas')}</small></div></div>))}</div>
      <div className="grid g-2-1">
        <Card title={t('Heatmap IKA terhitung — Entitas × Domain')} meta={t('level domain 1–3 dari status objek')}>
          {ents.length ? <div style={{ overflowX: 'auto' }}><div className="heat" style={{ gridTemplateColumns: '200px repeat(6,minmax(64px,1fr)) 70px', minWidth: 700 }}>
            <div />{ents[0].domains.map((d: api.Row, i: number) => <div key={i} className="h" style={{ textAlign: 'center' }}>D{i + 1}<div className="tiny faint">{String(d.label).split(' ')[0]}</div></div>)}<div className="h" style={{ textAlign: 'center' }}>Level</div>
            {ents.map((e) => <React.Fragment key={e.id}><div className="h" style={{ textAlign: 'left' }}>{e.name}<div className="tiny faint">{e.code}</div></div>
              {e.domains.map((d: api.Row, i: number) => <div key={i} className="c" style={{ background: heatBg(d.level) }} title={`${d.objects} ${t('objek')}, ${d.baseline} ≥ Ditetapkan`}>{d.level}</div>)}
              <div className="c" style={{ background: 'var(--surface-3)', fontWeight: 800 }}>L{e.level}</div></React.Fragment>)}
          </div></div> : <div className="empty"><div className="big">∅</div>{t('Belum ada objek arsitektur — IKA terhitung muncul setelah Architect mengisi EAW.')}</div>}
        </Card>
        <Card title={t('Tren IKA Grup')} acts={can('console.dashboard.write') ? <Btn sm onClick={snap}>⟳ {t('Ambil snapshot')}</Btn> : <Btn sm aria-disabled="true" style={{ opacity: 0.55 }} title={t('Butuh izin {0}', 'console.dashboard.write')} onClick={() => toast(t('403 — Akses ditolak'), t('Peran Anda tidak memiliki izin {0}.', 'console.dashboard.write'), 'error')}>🔒 {t('Ambil snapshot')}</Btn>}>
          {tr?.data.length ? <><LineChart series={tr.data.map((x: api.Row) => x.avgLevel)} labels={tr.data.map((x: api.Row) => String(x.date).slice(5, 10))} max={5} target={3} fmt={(v) => String(v).replace('.', ',')} />
            <p className="small muted mt-s">{t('Rata-rata level entitas ber-objek per snapshot ({0} titik).', tr.data.length)}</p></> : <div className="empty small">{t('Belum ada snapshot. Ambil snapshot untuk memulai tren.')}</div>}
        </Card>
      </div>
      <div className="mt"><Card title={t('Peringkat & syarat Level 3–5')} flush meta={`${t('rata-rata grup')}: ${r.groupAverage ?? '—'}`}>
        <MiniTable rows={[...ents].sort((a, b) => b.level - a.level)} columns={[
          { label: t('Entitas'), render: (e: api.Row) => <b>{e.name}</b> },
          { label: t('Level terhitung'), render: (e: api.Row) => <span className="badge nodot" style={{ background: LV[e.level - 1], color: '#fff' }}>L{e.level}</span> },
          { label: t('Penilaian manual'), render: (e: api.Row) => (e.manualLevel ? <span className="ika" title={`IKA ${Number(e.manualLevel).toFixed(1)}`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= Math.floor(e.manualLevel) ? 'on' : ''} />)}</span> : <span className="muted small">—</span>) },
          { label: t('Objek'), num: true, render: (e: api.Row) => e.objects },
          { label: 'KRA', render: (e: api.Row) => <Chk ok={e.checks.kra} title={e.gaps.kra.count ? t('{0} objek belum patuh KRA berlaku se-domain (syarat L3)', e.gaps.kra.count) : t('semua objek patuh KRA berlaku se-domain (syarat L3)')} /> },
          { label: t('Relasi'), render: (e: api.Row) => <Chk ok={e.checks.relations} title={t('relasi wajib lengkap')} /> },
          { label: 'Lineage', render: (e: api.Row) => <Chk ok={e.checks.lineage} title={e.gaps.lineage.dataEntities ? t('{0}/{1} entitas data dengan lineage aktif (syarat L4)', e.gaps.lineage.dataEntities - e.gaps.lineage.count, e.gaps.lineage.dataEntities) : t('belum ada entitas data')} /> },
          { label: 'Git', render: (e: api.Row) => <Chk ok={e.checks.git} title={t('semua aplikasi bertaut repo_git')} /> },
          { label: 'EIO', render: (e: api.Row) => <Chk ok={e.checks.eio} title={t('≥ 1 konektor EIO')} /> },
          { label: 'Drift', render: (e: api.Row) => <Chk ok={e.checks.drift} title={t('konektor diperiksa ≤ 7 hari, tanpa breaking change')} /> },
          { label: t('Reviu'), render: (e: api.Row) => <Chk ok={e.checks.review} title={t('objek Dipublikasi diperbarui ≤ 365 hari')} /> },
        ]} />
      </Card></div>
      {gapRows.length ? <div className="mt"><Card title={t('Yang menahan level — kepatuhan KRA & lineage')} flush meta={t('maks. 5 contoh per syarat per entitas')}>
        <MiniTable rows={gapRows} columns={[{ label: t('Entitas'), render: (x) => x.e.code }, { label: t('Syarat'), render: (x) => x.chk },
          { label: t('Objek'), render: (x) => <><span className="tiny muted">{TY[x.g.type] || x.g.type}</span> {x.g.label ?? t('(di luar cakupan)')}</> },
          { label: t('Alasan'), render: (x) => (r.reasons && r.reasons[x.g.reason]) || x.g.reason }, { label: t('Total celah'), num: true, render: (x) => x.n }]} />
      </Card></div> : null}
      <div className="mt"><Card title={t('Cakupan per-KRA')} flush={!!r.kra?.length} meta={t('objek patuh = ≥ Ditetapkan, KRA berlaku se-domain, tidak Direviu')}>
        {r.kra?.length ? <MiniTable rows={r.kra} columns={[
          { label: 'KRA', render: (k: api.Row) => <><b>{k.kode}</b><div className="tiny muted">{k.nama} · v{k.versi}</div></> }, { label: t('Domain'), render: (k: api.Row) => k.domain },
          { label: t('Status'), render: (k: api.Row) => <>{k.status}{k.inForce ? '' : <span className="tiny muted"> ({t('belum berlaku')})</span>}</> }, { label: t('Entitas pengadopsi'), num: true, render: (k: api.Row) => k.entities },
          { label: t('Objek patuh / tertaut'), num: true, render: (k: api.Row) => `${k.conformant} / ${k.objects}` },
          { label: t('Beda domain'), num: true, render: (k: api.Row) => (k.otherDomain ? <span className="badge b-warn nodot">{k.otherDomain}</span> : 0) },
          { label: t('Direviu'), num: true, render: (k: api.Row) => (k.pendingReview ? <span className="badge b-warn nodot">{k.pendingReview}</span> : 0) }]} />
          : <div className="empty small">{t('Belum ada KRA. Holding EA Office menyusun KRA di KRA Manager.')}</div>}
      </Card></div>
      <p className="tiny muted mt">{r.criteria.join(' · ')}. {t('Lineage = jejak Proses → Entitas Data ← Aplikasi aktif di graf relasi EAW (bukan lineage tingkat kolom/pipeline). Angka mengikuti cakupan peran Anda.')}</p>
    </>
  );
}

/* ---------------------------------------------------------------- 4.2 AI register ---------------------------------------------------------------- */
const RISK: Record<string, string> = { low: 'b-ok', medium: 'b-warn', high: 'b-err' };
const opt = (a: string[]): [string, string][] => a.map((x) => [x, x]);
function modelForm(cur?: api.Row) {
  formDialog({
    title: cur ? `${t('Ubah')} ${cur.kode}` : t('Daftarkan Model AI'), sub: cur ? 'PATCH /api/v1/console/ai/models' : 'POST /api/v1/console/ai/models',
    initial: cur ? { nama: cur.nama, lokasi: cur.lokasi, klasifikasiMaks: cur.klasifikasiMaks, risiko: cur.risiko, status: cur.status, hargaInPer1k: cur.hargaInPer1k, hargaOutPer1k: cur.hargaOutPer1k } : { lokasi: 'on-prem', klasifikasiMaks: 'rahasia', risiko: 'medium', status: 'evaluasi', hargaInPer1k: 0, hargaOutPer1k: 0 },
    fields: [...(cur ? [] : [{ name: 'kode', label: t('Kode'), req: true, placeholder: 'llama-3.3-70b-instruct', max: 100 }]), { name: 'nama', label: t('Nama'), req: true, full: !cur },
      ...(cur ? [] : [{ name: 'penyedia', label: t('Penyedia') }]), { name: 'lokasi', label: t('Lokasi'), type: 'select' as const, options: opt(['on-prem', 'cloud']) },
      { name: 'klasifikasiMaks', label: t('Klasifikasi data maks.'), type: 'select' as const, options: opt([...KLAS].reverse()) }, { name: 'risiko', label: t('Risiko'), type: 'select' as const, options: opt(['medium', 'low', 'high']) },
      { name: 'status', label: t('Status'), type: 'select' as const, options: opt(['evaluasi', 'aktif', 'nonaktif']) },
      { name: 'hargaInPer1k', label: t('Harga masukan / 1k token (IDR)'), type: 'number', min: 0 }, { name: 'hargaOutPer1k', label: t('Harga keluaran / 1k token (IDR)'), type: 'number', min: 0 },
      ...(cur ? [] : [{ name: 'lisensi', label: t('Lisensi') }, { name: 'guna', label: t('Kegunaan'), full: true }])],
    onSubmit: async (v) => {
      if (cur) await api.patch(`/api/v1/console/ai/models/${cur.id}`, { nama: v.nama, lokasi: v.lokasi, klasifikasiMaks: v.klasifikasiMaks, risiko: v.risiko, status: v.status, hargaInPer1k: v.hargaInPer1k, hargaOutPer1k: v.hargaOutPer1k }, cur.version);
      else await api.post('/api/v1/console/ai/models', v);
      invalidateData(); toast(cur ? t('Model diperbarui') : t('Model terdaftar'), cur?.kode ?? v.kode, 'success');
    },
  });
}
function datasetForm(models: api.Row[]) {
  formDialog({
    title: t('Daftarkan Dataset RAG'), sub: 'POST /api/v1/console/ai/datasets', initial: { store: 'pgvector', klasifikasi: 'internal', modelId: '' },
    fields: [{ name: 'nama', label: t('Nama'), req: true, full: true }, { name: 'store', label: 'Store', type: 'select', options: opt(['pgvector', 'qdrant', 'lainnya']) }, { name: 'klasifikasi', label: t('Klasifikasi'), type: 'select', options: opt(['internal', 'publik', 'terbatas', 'rahasia']) },
      { name: 'pii', label: t('Mengandung PII'), type: 'checkbox' }, { name: 'modelId', label: t('Model pemroses'), type: 'select', full: true, options: [['', `— ${t('tidak ada')} —`], ...models.map((m) => [m.id, `${m.kode} (${m.lokasi})`] as [string, string])] }],
    onSubmit: async (v) => { await api.post('/api/v1/console/ai/datasets', { nama: v.nama, store: v.store, klasifikasi: v.klasifikasi, pii: !!v.pii, modelId: v.modelId || undefined }); invalidateData(); toast(t('Dataset terdaftar'), v.nama, 'success'); },
  });
}
function Ai() {
  const ms = useQuery({ queryKey: ['console-models'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/console/ai/models')).data });
  const ds = useQuery({ queryKey: ['console-datasets'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/console/ai/datasets')).data });
  const admin = can('console.ai.admin');
  const head = <PageHd title={t('AI Model & Risk Register')} sub={t('Inventaris model LLM dan dataset RAG. Model cloud tidak boleh memproses data terbatas/rahasia; dataset sensitif wajib model on-premises (GOV-02, D-05) — ditegakkan DB.')} />;
  if (ms.isError) return <>{head}<Err e={ms.error} /></>;
  if (!ms.data || !ds.data) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  const M = ms.data, D = ds.data;
  const reload = () => { ms.refetch(); ds.refetch(); };
  const del = (kind: 'models' | 'datasets', r: api.Row, label: string) => confirmDialog({ title: label, text: r.kode || r.nama, danger: true, ok: t('Hapus'), onOk: async () => { await api.del(`/api/v1/console/ai/${kind}/${r.id}`); reload(); invalidateData(); toast(t('Dihapus'), r.kode || r.nama, 'success'); } });
  const Add = (p: { label: string; onClick: () => void; pri?: boolean }) => (admin ? <Btn sm variant={p.pri ? 'pri' : undefined} onClick={p.onClick}>{p.label}</Btn> : <Btn sm aria-disabled="true" style={{ opacity: 0.55 }} title={t('Butuh izin {0}', 'console.ai.admin')} onClick={() => toast(t('403 — Akses ditolak'), t('Peran Anda tidak memiliki izin {0}.', 'console.ai.admin'), 'error')}>🔒 {p.label}</Btn>);
  return (
    <>
      {head}
      <div className="grid g4 mb"><Kpi label={t('Model aktif')} value={M.filter((m) => m.status === 'aktif').length} /><Kpi label="On-Prem GPU" value={M.filter((m) => m.lokasi === 'on-prem').length} tgt={t('data rahasia & PII')} />
        <Kpi label="Cloud" value={M.filter((m) => m.lokasi === 'cloud').length} tgt={t('maks. data internal (D-05)')} /><Kpi label={t('Dataset RAG')} value={D.length} /></div>
      <Card title={t('Register Model LLM (console.ai_model)')} flush={!!M.length} acts={<Add pri label={`+ ${t('Model')}`} onClick={() => modelForm()} />}>
        {M.length ? <MiniTable rows={M} columns={[
          { label: t('Model'), render: (m) => <><b>{m.nama}</b><div className="tiny mono muted">{m.kode}</div></> }, { label: t('Penyedia'), render: (m) => m.penyedia || '—' },
          { label: t('Lokasi'), render: (m) => <Badge cls={m.lokasi === 'on-prem' ? 'b-ok' : 'b-info'}>{m.lokasi}</Badge> }, { label: t('Klasifikasi maks.'), render: (m) => m.klasifikasiMaks },
          { label: t('Risiko'), render: (m) => <Badge cls={RISK[m.risiko]}>{m.risiko}</Badge> }, { label: t('Harga /1k token (in/out)'), render: (m) => <span className="mono tiny">{m.hargaInPer1k} / {m.hargaOutPer1k}</span> },
          { label: t('Status'), render: (m) => <Badge cls={m.status === 'aktif' ? 'b-ok' : ''}>{m.status}</Badge> },
          { label: '', render: (m) => (admin ? <><Btn sm onClick={() => modelForm(m)}>{t('Ubah')}</Btn> <Btn sm variant="danger" onClick={() => del('models', m, t('Hapus model ini dari register?'))}>{t('Hapus')}</Btn></> : null) }]} />
          : <div className="empty"><div className="big">∅</div>{t('Belum ada model terdaftar.')}</div>}
      </Card>
      <div className="mt"><Card title={t('Dataset RAG (console.rag_dataset)')} flush={!!D.length} acts={<Add label={`+ ${t('Dataset')}`} onClick={() => datasetForm(M)} />}>
        {D.length ? <MiniTable rows={D} columns={[{ label: 'Dataset', render: (d) => <b>{d.nama}</b> }, { label: 'Store', render: (d) => d.store }, { label: t('Klasifikasi'), render: (d) => d.klasifikasi },
          { label: 'PII', render: (d) => (d.pii ? <b style={{ color: 'var(--err)' }}>{t('Ya')}</b> : t('Tidak')) },
          { label: t('Model pemroses'), render: (d) => (d.modelKode ? <>{d.modelKode} <Badge cls={d.modelLokasi === 'on-prem' ? 'b-ok' : 'b-info'}>{d.modelLokasi}</Badge></> : '—') },
          { label: '', render: (d) => (admin ? <Btn sm variant="danger" onClick={() => del('datasets', d, t('Hapus dataset ini?'))}>{t('Hapus')}</Btn> : null) }]} />
          : <div className="empty small">{t('Belum ada dataset.')}</div>}
      </Card></div>
      <p className="tiny muted mt">{t('Aturan D-05 ditegakkan DB: model cloud tidak boleh memproses data terbatas/rahasia; dataset PII/terbatas/rahasia wajib memakai model on-prem terdaftar.')}</p>
    </>
  );
}

/* ---------------------------------------------------------------- 4.3 FinOps ---------------------------------------------------------------- */
function Finops() {
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const q = useQuery({ queryKey: ['console-finops', month], queryFn: () => api.get<api.Row>('/api/v1/console/finops/summary', { month }) });
  const head = <PageHd title={t('FinOps Console')} sub={t('Metering token nyata → showback per entitas, serta rekonsiliasi terhadap faktur penyedia (selisih ≤ 2%, FIN-01).')} />;
  if (q.isError) return <>{head}<Err e={q.error} /></>;
  const f = q.data;
  const invoice = () => formDialog({
    title: t('Faktur Penyedia'), sub: 'POST /api/v1/console/finops/invoices', initial: { periode: month },
    fields: [{ name: 'periode', label: t('Periode'), req: true, placeholder: 'YYYY-MM', hint: 'YYYY-MM' }, { name: 'modelName', label: t('Model (kode)'), req: true }, { name: 'billedTokens', label: t('Token tertagih'), type: 'number', req: true, min: 0 }, { name: 'billedIdr', label: t('Total tagihan (IDR)'), type: 'number', req: true, min: 0 }],
    onSubmit: async (v) => { await api.post('/api/v1/console/finops/invoices', v); setMonth(v.periode); q.refetch(); toast(t('Faktur tercatat'), undefined, 'success'); },
  });
  return (
    <>
      {head}
      <div className="row mb"><label className="small">{t('Bulan')}</label><Input type="month" value={month} style={{ maxWidth: 170 }} onChange={(e) => e.target.value && setMonth(e.target.value)} /></div>
      {!f ? <div className="small muted">{t('Memuat…')}</div> : <>
        <div className="grid g4 mb"><Kpi label={t('Token (masukan + keluaran)')} value={fmtNum(f.totals.promptTokens + f.totals.completionTokens)} tgt={`${fmtNum(f.totals.promptTokens)} in · ${fmtNum(f.totals.completionTokens)} out`} />
          <Kpi label={t('Biaya terukur')} value={idr(f.totals.costIdr)} tgt={t('dari harga model terdaftar')} /><Kpi label={t('Panggilan LLM')} value={fmtNum(f.totals.calls)} />
          <Kpi label={t('Faktur direkonsiliasi')} value={f.reconciliation.invoices.length} tgt={t('selisih ≤ {0}% (FIN-01)', f.reconciliation.targetPct)} /></div>
        <div className="grid g2">
          <Card title={t('Showback per Entitas')}>{f.byEntity.length ? f.byEntity.map((e: api.Row) => <Hbar key={e.code} label={e.name} segments={[{ v: e.costIdr, color: 'var(--accent)' }]} total={Math.max(1, ...f.byEntity.map((x: api.Row) => x.costIdr))} valueText={idr(e.costIdr)} />) : <div className="empty small">{t('Belum ada pemakaian pada bulan ini.')}</div>}</Card>
          <Card title={t('Per Model & Workspace')} flush>
            <MiniTable rows={f.byModel} columns={[{ label: t('Model'), render: (m: api.Row) => <span className="mono small">{m.modelName}</span> }, { label: 'Token', num: true, render: (m: api.Row) => fmtNum(m.tokens) }, { label: t('Biaya'), num: true, render: (m: api.Row) => idr(m.costIdr) }]} />
            <div className="chips mt-s" style={{ padding: '0 14px 12px' }}>{f.byWorkspace.map((w: api.Row) => <span key={w.workspace} className="badge b-info nodot">{w.workspace} · {fmtNum(w.tokens)} tok</span>)}</div>
          </Card>
        </div>
        <div className="mt"><Card title={t('Pemakaian Harian (token)')}>{f.daily.length ? <BarChart items={f.daily.map((d: api.Row) => ({ l: String(d.date).slice(8, 10), v: d.tokens }))} fmt={(v) => fmtNum(v)} /> : <div className="empty small">—</div>}</Card></div>
        <div className="mt"><Card title={t('Rekonsiliasi Metering vs Faktur Penyedia')} flush={!!f.reconciliation.invoices.length} acts={can('console.ai.admin') ? <Btn sm onClick={invoice}>+ {t('Faktur')}</Btn> : undefined}>
          {f.reconciliation.invoices.length ? <MiniTable rows={f.reconciliation.invoices} columns={[
            { label: t('Model'), render: (i: api.Row) => <span className="mono small">{i.modelName}</span> }, { label: t('Token faktur'), num: true, render: (i: api.Row) => fmtNum(i.billedTokens) }, { label: t('Token terukur'), num: true, render: (i: api.Row) => fmtNum(i.meteredTokens) },
            { label: t('Biaya faktur'), num: true, render: (i: api.Row) => idr(i.billedIdr) }, { label: t('Biaya terukur'), num: true, render: (i: api.Row) => idr(i.meteredIdr) }, { label: t('Selisih'), num: true, render: (i: api.Row) => <b>{String(i.diffPct).replace('.', ',')}%</b> },
            { label: t('Target ≤ 2%'), render: (i: api.Row) => <Badge cls={i.withinTarget ? 'b-ok' : 'b-err'}>{i.withinTarget ? t('lolos') : t('di luar target')}</Badge> }]} />
            : <div className="empty small">{t('Belum ada faktur untuk bulan ini.')}</div>}
        </Card></div>
        <p className="tiny muted mt">{f.note}</p></>}
    </>
  );
}

/* ---------------------------------------------------------------- 4.5 Observability ---------------------------------------------------------------- */
function Obs() {
  const q = useQuery({ queryKey: ['console-obs'], queryFn: () => api.get<api.Row>('/api/v1/console/obs'), refetchInterval: 30_000 });
  const head = <PageHd title={t('Observability & SLO')} sub={t('Metrik nyata proses API EAP, kesehatan DB dan replikasi logis (OPS-01 sebagian).')} acts={<Btn onClick={() => q.refetch()}>↻ {t('Segarkan')}</Btn>} />;
  if (q.isError) return <>{head}<Err e={q.error} /></>;
  const o = q.data; if (!o) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  const a = o.api; const up = a.uptimeS >= 3600 ? `${Math.floor(a.uptimeS / 3600)} ${t('j')} ${Math.floor((a.uptimeS % 3600) / 60)} ${t('m')}` : `${Math.floor(a.uptimeS / 60)} ${t('m')} ${a.uptimeS % 60} ${t('d')}`;
  return (
    <>
      {head}
      <div className="grid g5 mb"><Kpi label="Uptime API" value={up} tgt={`${t('sejak')} ${when(a.startedAt)}`} /><Kpi label={t('Permintaan')} value={fmtNum(a.requests)} /><Kpi label={t('Latensi p50 / p95')} value={`${a.p50Ms} / ${a.p95Ms}`} unit="ms" tgt={`p99 ${a.p99Ms} ms`} />
        <Kpi label={t('Galat 5xx')} value={String(a.errorRate).replace('.', ',')} unit="%" tgt={t('{0} dari {1}', a.errors5xx, a.requests)} /><Kpi label={t('Ping DB')} value={o.db.pingMs} unit="ms" /></div>
      <div className="grid g2">
        <Card title="SLO API EAP" flush><MiniTable rows={o.slo} columns={[{ label: 'SLO', render: (s: api.Row) => s.name }, { label: 'Target', render: (s: api.Row) => s.target }, { label: t('Aktual'), render: (s: api.Row) => (s.actual == null ? '—' : String(s.actual)) },
          { label: t('Status'), render: (s: api.Row) => (s.ok == null ? '—' : <Badge cls={s.ok ? 'b-ok' : 'b-err'}>{s.ok ? t('terpenuhi') : t('terlampaui')}</Badge>) }]} /></Card>
        <Card title={t('Replikasi Logis (pg_stat_subscription)')} flush={!!o.db.replication?.length}>
          {o.db.replication?.length ? <MiniTable rows={o.db.replication} columns={[{ label: t('Langganan'), render: (r: api.Row) => <span className="mono small">{r.name}</span> }, { label: t('Aktif'), render: (r: api.Row) => <Badge cls={r.active ? 'b-ok' : 'b-err'}>{r.active ? t('ya') : t('tidak')}</Badge> },
            { label: 'Lag', num: true, render: (r: api.Row) => (r.lagSeconds == null ? '—' : `${r.lagSeconds} ${t('dtk')}`) }, { label: t('Pesan terakhir'), render: (r: api.Row) => <span className="small mono">{when(r.lastMessageAt)}</span> }]} />
            : <div className="empty small">{t('Tidak ada langganan terdeteksi / tanpa izin membaca.')}</div>}
        </Card>
      </div>
      <div className="mt"><Card title={t('Rute Teratas')} flush={!!a.top.length}>{a.top.length ? <MiniTable rows={a.top} columns={[{ label: t('Rute'), render: (r: api.Row) => <span className="mono tiny">{r.route}</span> }, { label: t('Permintaan'), num: true, render: (r: api.Row) => fmtNum(r.count) }, { label: t('Galat 5xx'), num: true, render: (r: api.Row) => r.errors }, { label: 'p95', num: true, render: (r: api.Row) => `${r.p95Ms} ms` }]} /> : <div className="empty small">—</div>}</Card></div>
      {o.targets.length ? <div className="mt"><Card title="Dependensi (OBS_TARGETS)" flush><MiniTable rows={o.targets} columns={[{ label: 'Target', render: (x: api.Row) => <><b>{x.name}</b><div className="tiny mono muted">{x.url}</div></> }, { label: t('Status'), render: (x: api.Row) => <Badge cls={x.status === 'up' ? 'b-ok' : 'b-err'}>{x.status}</Badge> }, { label: t('Respon'), num: true, render: (x: api.Row) => (x.ms == null ? '—' : `${x.ms} ms`) }]} /></Card></div> : null}
      <p className="tiny muted mt">{o.note} {t('Atur OBS_TARGETS="Keycloak=http://…/health/ready,CMP=http://…" di server untuk memantau dependensi.')}</p>
    </>
  );
}

/* ---------------------------------------------------------------- 4.6 Security ---------------------------------------------------------------- */
function Security() {
  const sq = useQuery({ queryKey: ['console-switches'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/console/security/switches')).data });
  const gq = useQuery({ queryKey: ['console-guardlog'], queryFn: () => api.get<api.Row>('/api/v1/console/security/guard-log').catch(() => null) });
  const admin = can('console.security.admin');
  const head = <PageHd title={t('Security Center')} sub={t('AI kill-switch (efek segera pada mesin yang memeriksanya) dan log penolakan guardrail (SEC-01).')} />;
  if (sq.isError) return <>{head}<Err e={sq.error} /></>;
  if (!sq.data) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  const gl = gq.data;
  const set = (s: api.Row, enabled: boolean) => {
    const run = (reason?: string) => api.post(`/api/v1/console/security/switches/${encodeURIComponent(s.kode)}`, { enabled, reason }).then(() => { sq.refetch(); invalidateData(); toast(enabled ? t('Agen diaktifkan') : t('Agen dimatikan'), s.kode, enabled ? 'success' : 'error'); });
    if (enabled) return act(() => run());
    confirmDialog({ title: t('Matikan {0}?', s.nama), reason: t('Alasan mematikan agen (min. 5 karakter)'), min: 5, danger: true, ok: t('Matikan'), onOk: (r) => run(r) });
  };
  return (
    <>
      {head}
      <div className="grid g-1-2">
        <Card title="AI Kill-Switch" flush>{sq.data.map((s) => (
          <div key={s.kode} className="killrow"><div style={{ flex: 1 }}><b className="small">{s.nama}</b><div className="tiny muted">{s.deskripsi || ''}</div>
            <div className="tiny">{s.enforced ? <Badge cls="b-ok">{t('diperiksa mesin sebelum tiap panggilan')}</Badge> : <Badge>{t('belum terhubung ke mesin')}</Badge>} {s.reason ? <span className="muted">· {s.reason}</span> : null}</div></div>
            <div style={{ textAlign: 'right' }}><Badge cls={s.enabled ? 'b-ok' : 'b-err'}>{s.enabled ? t('AKTIF') : t('DIMATIKAN')}</Badge>
              <div className="mt-s">{admin ? <Btn sm variant={s.enabled ? 'danger' : 'pri'} onClick={() => set(s, !s.enabled)}>{s.enabled ? `■ ${t('Matikan')}` : `▶ ${t('Aktifkan')}`}</Btn> : null}</div></div></div>))}</Card>
        <div className="stack">
          <Card title={t('Kebijakan Guardrail REQ')}><div className="stack small"><div className="row">Engine<b className="right">{t('aturan deterministik lokal')}</b></div><div className="row">{t('Mode gagal')}<b className="right">fail-closed (503)</b></div><div className="row">PII masking<b className="right">email · NPWP · NIK · {t('telepon')}</b></div><div className="row">{t('Dapat dimatikan')}<b className="right">{t('tidak (D-03)')}</b></div><p className="tiny muted">{t('Bukan NeMo/OPA sungguhan; tanpa klaim akurasi.')}</p></div></Card>
          {gl ? <Card title={t('Log Penolakan Guardrail ({0}; hari ini {1}; rata-rata {2} ms)', gl.total, gl.today, gl.avgMs)} flush={!!gl.data.length}>
            {gl.data.length ? <MiniTable rows={gl.data} columns={[{ label: t('Waktu'), render: (g: api.Row) => <span className="mono tiny">{when(g.created_at)}</span> }, { label: 'Engine', render: (g: api.Row) => <Tag>{g.engine}</Tag> },
              { label: t('Kategori'), render: (g: api.Row) => <Badge cls={g.category === 'jailbreak' ? 'b-err' : 'b-warn'}>{g.category}</Badge> }, { label: t('Kutipan (termasking)'), render: (g: api.Row) => <span className="small">{g.excerpt}</span> }, { label: 'ms', num: true, render: (g: api.Row) => g.ms }]} />
              : <div className="empty small">{t('Belum ada penolakan.')}</div>}</Card> : null}
        </div>
      </div>
    </>
  );
}

export default { ika: Ika, ai: Ai, finops: Finops, eio: Eio, obs: Obs, security: Security };
