'use client';
/* Framework Builder (EAW-05, AF-02): satu Kerangka Kerja per layanan utama; relasi objek ditandai ke dalamnya (`PATCH /eaw/relations/:id {kerangkaId}`), cakupan 6 domain
   dihitung server (`GET /eaw/readiness/framework/:id`) dan MEMBLOKIR Divalidasi di eaw.transition. Siklus status AF-05 (izin per langkah, empat mata) dan relasi mengikuti
   aturan DB; UI hanya meneruskan dan menampilkan galat. Hanya relasi dengan sumber Draf yang dapat ditandai. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { invalidateData } from '@/lib/query';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { Drawer, confirmDialog, formDialog, openDrawer } from '@/components/overlay';
import { Badge, Btn, Callout, Card, Lifecycle, PageHd, Progress, Section, Select, Tag } from '@/components/ui';
import { HistorySection, transitionActions } from './eaw-status';
import { editableEntities } from './eaw-forms';
import { t } from '@/lib/i18n';

const lbl = (r: api.Row) => <>{r.sumberLabel || r.sumberType} <span className="muted">—{r.tipe}→</span> {r.targetLabel || r.targetType}</>;
const TIPE: [string, string][] = [['utama', 'utama'], ['pendukung', 'pendukung']];

async function createFramework() {
  const ents = await editableEntities();
  if (ents.length < 2) return toast(t('Tidak ada entitas yang dapat Anda susun'), t('Minta admin menugaskan peran penyusun pada sebuah entitas.'), 'warning');
  formDialog({
    title: t('Kerangka Kerja Baru'), sub: 'POST /api/v1/eaw/objects/frameworks', submit: t('Simpan Draf'), initial: { tipe: 'utama' },
    fields: [{ name: 'layananUtama', label: t('Layanan utama'), req: true, full: true, max: 200, placeholder: t('mis. Penjualan Kendaraan') }, { name: 'tipe', label: t('Tipe'), type: 'select', options: TIPE },
      { name: 'entityId', label: t('Entitas'), type: 'select', req: true, options: ents }],
    onSubmit: async (v) => { await api.post('/api/v1/eaw/objects/frameworks', v); invalidateData(); toast(t('Kerangka Kerja dibuat (Draf)'), v.layananUtama, 'success'); },
  });
}

function FrameworkDrawer({ id, close }: { id: string; close: () => void }) {
  const fq = useQuery({ queryKey: ['eaw-fw', id], queryFn: () => api.get<api.Row>(`/api/v1/eaw/objects/frameworks/${id}`) });
  const rq = useQuery({ queryKey: ['eaw-fw-ready', id], queryFn: async () => (await api.get<{ rules: api.Row[] }>(`/api/v1/eaw/readiness/framework/${id}`).catch(() => null))?.rules ?? [] });
  const inq = useQuery({ queryKey: ['eaw-fw-rel', id], queryFn: () => api.all<api.Row>('/api/v1/eaw/relations', { kerangkaId: id }).catch(() => [] as api.Row[]) });
  const freeq = useQuery({ queryKey: ['eaw-fw-free', id], queryFn: async () => (await api.all<api.Row>('/api/v1/eaw/relations').catch(() => [] as api.Row[])).filter((r) => !r.kerangkaId) });
  const [pick, setPick] = React.useState('');
  const f = fq.data;
  if (!f) return <Drawer title={t('Kerangka Kerja')} close={close}>{fq.isError ? <Callout tone="err">{api.explain(fq.error)}</Callout> : <div className="small muted">{t('Memuat…')}</div>}</Drawer>;
  const editable = f.status === 'Draf' && can('eaw.model.write');
  const refresh = () => { fq.refetch(); rq.refetch(); inq.refetch(); freeq.refetch(); invalidateData(); };
  const tag = async (relId: string, kerangkaId: string | null) => { if (!relId) return; try { await api.patch(`/api/v1/eaw/relations/${relId}`, { kerangkaId }); setPick(''); refresh(); toast(kerangkaId ? t('Relasi ditandai ke kerangka') : t('Relasi dilepas dari kerangka'), undefined, 'success'); } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); } };
  const edit = () => formDialog({ title: `${t('Ubah')} ${f.layananUtama}`, sub: `PATCH /api/v1/eaw/objects/frameworks/${String(f.id).slice(0, 8)}…`, initial: { layananUtama: f.layananUtama, tipe: f.tipe },
    fields: [{ name: 'layananUtama', label: t('Layanan utama'), req: true, full: true, max: 200 }, { name: 'tipe', label: t('Tipe'), type: 'select', options: TIPE }],
    onSubmit: async (v) => { await api.patch(`/api/v1/eaw/objects/frameworks/${f.id}`, { layananUtama: v.layananUtama, tipe: v.tipe }, f.version); refresh(); toast(t('Kerangka Kerja diperbarui'), v.layananUtama, 'success'); } });
  const del = () => confirmDialog({ title: t('Hapus Kerangka Kerja Draf ini?'), text: f.layananUtama, danger: true, ok: t('Hapus'), onOk: async () => { await api.del(`/api/v1/eaw/objects/frameworks/${f.id}`); invalidateData(); close(); toast(t('Kerangka Kerja dihapus'), f.layananUtama, 'success'); } });
  const acts = transitionActions('framework')(f, close);
  const rules = rq.data || []; const inFw = inq.data || []; const free = freeq.data || [];
  return (
    <Drawer title={f.layananUtama} sub={`${f.entityCode} · ${t('Kerangka Kerja')}`} wide close={close}
      footer={<>
        {editable ? <><Btn variant="danger" onClick={del}>{t('Hapus')}</Btn><Btn onClick={edit}>{t('Ubah')}</Btn></> : null}
        {acts.map((a) => (can(a.perm!) ? <Btn key={a.label} variant={a.variant} onClick={() => a.run(f)}>{a.label}</Btn>
          : <Btn key={a.label} aria-disabled="true" style={{ opacity: 0.55 }} title={t('Butuh izin {0}', a.perm!)} onClick={() => toast(t('403 — Akses ditolak'), t('Peran Anda tidak memiliki izin {0}.', a.perm!), 'error')}>🔒 {a.label}</Btn>))}
      </>}>
      <div className="row mb"><Tag>{f.tipe}</Tag><Badge value={f.status} /></div>
      <section><h3>{t('Siklus status (AF-05)')}</h3><div className="mt-s"><Lifecycle status={f.status} /></div></section>
      <h3 className="mt">{t('Cakupan 6 domain (EAW-05)')}</h3>
      <div className="stack mt-s">{rules.length ? rules.map((r) => <div key={r.rule} className="row small"><span style={{ color: r.ok ? 'var(--ok)' : 'var(--err)', fontWeight: 800, width: 16 }}>{r.ok ? '✓' : '✕'}</span><span style={{ flex: 1 }}>{r.pesan}</span></div>) : <span className="muted small">—</span>}</div>
      <h3 className="mt">{t('Relasi dalam kerangka')} ({inFw.length})</h3>
      <div className="stack small mt-s">{inFw.length ? inFw.map((r) => <div key={r.id} className="row"><span style={{ flex: 1 }}>{lbl(r)}</span>{editable ? <Btn sm title={t('Lepas dari kerangka')} onClick={() => tag(r.id, null)}>✕</Btn> : null}</div>) : <span className="muted">{t('Belum ada relasi yang ditandai.')}</span>}</div>
      {editable ? <>
        <h3 className="mt">{t('Tandai relasi yang sudah ada')}</h3>
        <div className="row mt-s"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">— {t('pilih relasi')} ({free.length}) —</option>{free.map((r) => <option key={r.id} value={r.id}>{`${r.sumberLabel || r.sumberType} → ${r.targetLabel || r.targetType} (${r.tipe})`}</option>)}</Select><Btn sm disabled={!pick} onClick={() => tag(pick, id)}>{t('Tandai')}</Btn></div>
        <p className="tiny muted mt-s">{t('Relasi dibuat di detail objek (aplikasi, layanan, proses). Hanya relasi dengan sumber Draf yang dapat ditandai.')}</p></> : null}
      <HistorySection type="framework" row={f} />
    </Drawer>
  );
}

function FwCard({ f }: { f: api.Row }) {
  const q = useQuery({ queryKey: ['eaw-fw-ready', f.id], queryFn: async () => (await api.get<{ rules: api.Row[] }>(`/api/v1/eaw/readiness/framework/${f.id}`).catch(() => null))?.rules ?? [] });
  const rs = q.data || []; const ok = rs.filter((r) => r.ok).length;
  return (
    <Card title={f.layananUtama} acts={<Badge value={f.status} />}>
      <div className="row"><Tag>{f.tipe}</Tag><span className="small muted">{f.entityCode}</span></div>
      <div className="mt-s"><Progress pct={Math.round((ok / 6) * 100)} /></div><div className="tiny muted mt-s">{t('{0}/6 domain terpenuhi', ok)}</div>
      <div className="row mt-s" style={{ flexWrap: 'wrap', gap: 4 }}>{rs.map((r) => <span key={r.rule} className={`badge ${r.ok ? 'b-ok' : ''}`} title={r.pesan}>{String(r.rule).replace('_', ' ')}</span>)}</div>
      <div className="row mt-s"><Btn sm onClick={() => openDrawer((close) => <FrameworkDrawer id={f.id} close={close} />)}>{t('Kelola')}</Btn></div>
    </Card>
  );
}

export default function Framework() {
  const q = useQuery({ queryKey: ['eaw-frameworks'], queryFn: () => api.all<api.Row>('/api/v1/eaw/objects/frameworks') });
  const w = can('eaw.model.write');
  const head = <PageHd title={t('Framework Builder')} sub={t('Satu Kerangka Kerja per layanan utama (AF-02): tandai relasi objek ke dalamnya hingga cakupan 6 domain terpenuhi, lalu validasi sampai terbit.')}
    acts={w ? <Btn variant="pri" onClick={createFramework}>+ {t('Kerangka Kerja')}</Btn> : undefined} />;
  if (q.isError) return <>{head}<Callout tone={(q.error as api.ApiError).status === 403 ? 'warn' : 'err'}>{api.explain(q.error)}</Callout></>;
  if (!q.data) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  if (!q.data.length) return <>{head}<Card><div className="empty"><div className="big">∅</div>{t('Belum ada Kerangka Kerja. Buat satu per layanan utama (AF-02), lalu tandai relasi objek ke dalamnya.')}</div></Card></>;
  return <>{head}<div className="grid g3">{q.data.map((f) => <FwCard key={f.id} f={f} />)}</div></>;
}
