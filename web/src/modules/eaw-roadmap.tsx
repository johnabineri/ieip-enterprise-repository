'use client';
/* Master IT Roadmap (FR-04.1) — tampilan = mockup: KPI, Gantt fase, kartu fase berisi butir (deliverable ◆ / milestone ▪), Pelacak Milestone.
   Data NYATA (Zero Pre-Seed: mulai kosong) dari `/eaw/roadmap`; tulis hanya pemegang `eaw.roadmap.write` (Holding EA Office). Aturan di DB/API:
   target butir dalam rentang fase, fase berbutir aktif tidak dapat dihapus/disempitkan, `terhambat` wajib catatan ≥5, "terlambat" dihitung server,
   bukti objek EAW opsional hanya menampilkan status objek (tidak mengubah status butir). PATCH memakai If-Match (row_version). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { invalidateData } from '@/lib/query';
import { locale, t } from '@/lib/i18n';
import { can } from '@/store/session';
import { openLayer, toast } from '@/store/ui';
import { Modal, act, confirmDialog, formDialog } from '@/components/overlay';
import { Btn, Callout, Card, Field, Input, Kpi, PageHd, Select, Textarea } from '@/components/ui';

interface Item { id: string; phaseId: string; jenis: 'deliverable' | 'milestone'; judul: string; catatan: string | null; target: string; status: string; selesaiPada: string | null; terlambat: boolean; objectType: string | null; objectId: string | null; objectLabel: string | null; objectStatus: string | null; version: number }
interface Phase { id: string; nama: string; deskripsi: string | null; urutan: number; mulai: string; selesai: string; version: number; items: Item[] }
interface Road { today: string; summary: { total: number; selesai: number; berjalan: number; terhambat: number; direncanakan: number; terlambat: number; persenSelesai: number }; currentPhaseId: string | null; range: { mulai: string; selesai: string } | null; phases: Phase[] }

const COLORS = ['#0A8F4F', '#2E6FD8', '#B7791F', '#7B4FD0', '#C2410C', '#0E7490'];
const ST: Record<string, [string, string]> = { direncanakan: [t('Direncanakan'), ''], berjalan: [t('Berjalan'), 'b-info'], selesai: [t('Selesai'), 'b-ok'], terhambat: [t('Terhambat'), 'b-warn'] };
const OBJ: Record<string, [string, string]> = {
  application: [t('Aplikasi'), '/api/v1/eaw/applications'], process: [t('Proses (D1)'), '/api/v1/eaw/objects/processes'], data_entity: [t('Entitas Data (D2)'), '/api/v1/eaw/objects/data-entities'],
  service: [t('Layanan (D3)'), '/api/v1/eaw/objects/services'], infra_asset: [t('Infrastruktur (D5)'), '/api/v1/eaw/objects/infra-assets'], control: [t('Kontrol (D6)'), '/api/v1/eaw/objects/controls'], framework: [t('Kerangka Kerja'), '/api/v1/eaw/objects/frameworks'],
};
const idx = (d: string) => { const [y, m] = d.split('-').map(Number); return y * 12 + (m - 1); };
const monthName = (m: number) => new Date(2000, m, 1).toLocaleDateString(locale(), { month: 'short' });
const optLabel = (ty: string, o: api.Row) => (ty === 'application' ? `${o.kode} · ${o.nama}` : o.nama || o.namaKanonikal || (o.aspek ? o.aspek + (o.standarRujukan ? ` · ${o.standarRujukan}` : '') : '') || o.layananUtama || o.kode || o.id);
const apiOp = (fn: () => Promise<unknown>, msg: string) => act(fn, msg);

/* ---------------------------------------------------------------- Gantt ---------------------------------------------------------------- */
function Gantt({ d }: { d: Road }) {
  if (!d.range || !d.phases.length) return <div className="empty"><div className="big">🗓</div>{t('Belum ada fase. Tambahkan fase pertama (mis. “Fase 1 — Fondasi”) lalu isi deliverable dan milestone-nya.')}</div>;
  const base = idx(d.range.mulai); let n = idx(d.range.selesai) - base + 1; const cut = n > 36; if (cut) n = 36; const cur = idx(d.today) - base + 1;
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <div className="gantt" style={{ gridTemplateColumns: `230px repeat(${n},minmax(42px,1fr))`, minWidth: 230 + n * 46 }}>
          <div className="gh" style={{ textAlign: 'left' }}>{t('Fase')}</div>
          {Array.from({ length: n }, (_, i) => { const m = (base + i) % 12; return <div key={i} className="gh" style={i + 1 === cur ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' } : undefined}>{monthName(m)}{m === 0 || i === 0 ? <><br /><span className="tiny">{Math.floor((base + i) / 12)}</span></> : null}</div>; })}
          {d.phases.map((f, k) => {
            const s = Math.max(1, idx(f.mulai) - base + 1), e = Math.min(n, idx(f.selesai) - base + 1); const done = f.items.filter((i) => i.status === 'selesai').length; const pct = f.items.length ? Math.round((done / f.items.length) * 100) : 0;
            return (
              <React.Fragment key={f.id}>
                <div className="gl">{f.nama}<div className="tiny muted">{pct}% · {f.items.length} {t('butir')}</div></div>
                {Array.from({ length: n }, (_, i) => i + 1 === s
                  ? <div key={i} className="gb" style={{ gridColumn: `span ${Math.max(1, e - s + 1)}`, padding: '0 4px' }} title={`${f.nama} · ${fmtDate(f.mulai)} – ${fmtDate(f.selesai)}`}><div className="gbar" style={{ background: COLORS[k % COLORS.length] }}>{f.items[0] ? f.items[0].judul : f.nama}{f.items.length > 1 ? ' …' : ''}</div></div>
                  : i + 1 > s && i + 1 <= e ? null : <div key={i} style={i + 1 === cur ? { background: 'var(--accent-soft)' } : undefined} />)}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {cut ? <div className="tiny muted mt-s">{t('Rentang melebihi 36 bulan; hanya 36 bulan pertama digambar.')}</div> : null}
    </>
  );
}

/* ---------------------------------------------------------------- formulir ---------------------------------------------------------------- */
function phaseForm(cur?: Phase) {
  formDialog({
    title: cur ? t('Ubah Fase') : t('Tambah Fase'), sub: cur ? `PATCH /eaw/roadmap/phases/${cur.id.slice(0, 8)}` : 'POST /eaw/roadmap/phases',
    initial: cur ? { nama: cur.nama, mulai: cur.mulai, selesai: cur.selesai, urutan: cur.urutan, deskripsi: cur.deskripsi || '' } : { urutan: 0 },
    fields: [
      { name: 'nama', label: t('Nama fase'), req: true, full: true, max: 120, placeholder: t('mis. Fase 1 — Fondasi') },
      { name: 'mulai', label: t('Mulai'), type: 'date', req: true }, { name: 'selesai', label: t('Selesai'), type: 'date', req: true },
      { name: 'urutan', label: t('Urutan'), type: 'number', min: 0 }, { name: 'deskripsi', label: t('Deskripsi'), type: 'textarea', max: 2000 },
    ],
    onSubmit: async (v) => {
      const body = { nama: v.nama, mulai: v.mulai, selesai: v.selesai, urutan: v.urutan ?? 0, deskripsi: v.deskripsi || undefined };
      await (cur ? api.patch(`/api/v1/eaw/roadmap/phases/${cur.id}`, body, cur.version) : api.post('/api/v1/eaw/roadmap/phases', body));
      invalidateData(); toast(t('Fase tersimpan'), v.nama, 'success');
    },
  });
}

function ItemModal({ phases, phaseId, cur, close }: { phases: Phase[]; phaseId: string; cur?: Item; close: () => void }) {
  const [v, setV] = React.useState({ phaseId: cur?.phaseId ?? phaseId, jenis: cur?.jenis ?? 'deliverable', judul: cur?.judul ?? '', target: cur?.target ?? '', status: cur?.status ?? 'direncanakan', catatan: cur?.catatan ?? '', objectType: '', objectId: '' });
  const [err, setErr] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const objs = useQuery({ queryKey: ['rm-objs', v.objectType], enabled: !!v.objectType, staleTime: 60_000, queryFn: async () => (await api.page(OBJ[v.objectType][1], undefined, null, 100)).data });
  const save = async () => {
    setErr(null);
    if (v.judul.trim().length < 3) return setErr(t('Judul minimal 3 karakter.'));
    if (!v.target) return setErr(t('Target wajib diisi.'));
    if (!cur && v.objectType && !v.objectId) return setErr(t('Pilih objek bukti atau kosongkan jenisnya.'));
    setBusy(true);
    try {
      const body: Record<string, unknown> = { phaseId: v.phaseId, jenis: v.jenis, judul: v.judul, target: v.target, status: v.status, catatan: v.catatan || undefined };
      if (!cur && v.objectType && v.objectId) { body.objectType = v.objectType; body.objectId = v.objectId; }
      await (cur ? api.patch(`/api/v1/eaw/roadmap/items/${cur.id}`, body, cur.version) : api.post('/api/v1/eaw/roadmap/items', body));
      invalidateData(); toast(t('Butir tersimpan'), v.judul, 'success'); close();
    } catch (e) { setErr(api.explain(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={cur ? t('Ubah Butir Roadmap') : t('Tambah Butir Roadmap')} close={close} onSubmit={(e) => { e.preventDefault(); save(); }}
      footer={<><span className="right" /><Btn onClick={close}>{t('Batal')}</Btn><Btn variant="pri" type="submit" disabled={busy} onClick={() => save()}>{busy ? '…' : t('Simpan')}</Btn></>}>
      <div className="form-grid">
        <Field label={t('Fase')} req><Select value={v.phaseId} onChange={(e) => set('phaseId', e.target.value)}>{phases.map((f) => <option key={f.id} value={f.id}>{f.nama} ({fmtDate(f.mulai)} – {fmtDate(f.selesai)})</option>)}</Select></Field>
        <Field label={t('Jenis')} req><Select value={v.jenis} onChange={(e) => set('jenis', e.target.value)}><option value="deliverable">Deliverable</option><option value="milestone">Milestone</option></Select></Field>
        <Field label={t('Judul')} req full><Input type="text" value={v.judul} maxLength={300} onChange={(e) => set('judul', e.target.value)} /></Field>
        <Field label={t('Target')} req><Input type="date" value={v.target} onChange={(e) => set('target', e.target.value)} /></Field>
        <Field label={t('Status')}><Select value={v.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(ST).map(([k, s]) => <option key={k} value={k}>{s[0]}</option>)}</Select></Field>
        <Field label={t('Catatan')} hint={t('wajib bila Terhambat')} full><Textarea value={v.catatan} maxLength={2000} onChange={(e) => set('catatan', e.target.value)} /></Field>
        {cur?.objectType ? <div className="field full"><div className="tiny muted">🔗 {t('Bukti')}: {OBJ[cur.objectType][0]} — {cur.objectLabel || t('(di luar cakupan)')} ({t('tautan tidak diubah di sini')})</div></div> : <>
          <Field label={t('Bukti objek EAW (opsional)')}><Select value={v.objectType} onChange={(e) => setV((s) => ({ ...s, objectType: e.target.value, objectId: '' }))}><option value="">— {t('tanpa bukti')} —</option>{Object.entries(OBJ).map(([k, o]) => <option key={k} value={k}>{o[0]}</option>)}</Select></Field>
          <Field label={t('Objek')}><Select value={v.objectId} disabled={!v.objectType} onChange={(e) => set('objectId', e.target.value)}><option value="">{objs.isLoading ? '…' : `— ${t('pilih objek')} —`}</option>{(objs.data || []).map((o) => <option key={o.id} value={o.id}>{optLabel(v.objectType, o)}</option>)}</Select></Field>
        </>}
      </div>
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
    </Modal>
  );
}
const itemModal = (phases: Phase[], phaseId: string, cur?: Item) => openLayer((close) => <ItemModal phases={phases} phaseId={phaseId} cur={cur} close={close} />);

function setStatus(it: Item, status: string) {
  const run = (catatan?: string) => apiOp(() => api.patch(`/api/v1/eaw/roadmap/items/${it.id}`, { status, ...(catatan ? { catatan } : {}) }, it.version), t('{0} → {1}', it.judul, ST[status][0]));
  if (status === 'terhambat' && !(it.catatan && it.catatan.trim().length >= 5)) { confirmDialog({ title: t('Alasan terhambat'), reason: t('Alasan terhambat (min. 5 karakter)'), min: 5, ok: t('Simpan'), onOk: (r) => run(r) }); return; }
  run();
}

/* ---------------------------------------------------------------- halaman ---------------------------------------------------------------- */
function ItemRow({ i, canWrite, phases }: { i: Item; canWrite: boolean; phases: Phase[] }) {
  return (
    <tr>
      <td>{i.jenis === 'milestone' ? '◆' : '▪'} <b>{i.judul}</b>{i.catatan ? <div className="tiny muted">{i.catatan}</div> : null}
        {i.objectType ? <div className="tiny muted">🔗 {OBJ[i.objectType][0]}: {i.objectLabel || t('(di luar cakupan)')}{i.objectStatus ? <> · <b>{i.objectStatus}</b></> : null}</div> : null}</td>
      <td className="mono tiny">{fmtDate(i.target)}</td>
      <td>
        {canWrite ? <Select style={{ minWidth: 128 }} value={i.status} onChange={(e) => setStatus(i, e.target.value)}>{Object.entries(ST).map(([k, s]) => <option key={k} value={k}>{s[0]}</option>)}</Select> : null}{' '}
        <span className={`badge ${ST[i.status][1]}`}>{ST[i.status][0]}</span>{i.terlambat ? <> <span className="badge b-err">{t('terlambat')}</span></> : null}
        {i.selesaiPada ? <div className="tiny muted">{t('selesai')} {fmtDate(i.selesaiPada)}</div> : null}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>{canWrite ? <><Btn sm onClick={() => itemModal(phases, i.phaseId, i)}>{t('Ubah')}</Btn> <Btn sm variant="danger" onClick={() => confirmDialog({ title: t('Hapus butir ini dari roadmap?'), text: i.judul, danger: true, ok: t('Hapus'), onOk: () => apiOp(() => api.del(`/api/v1/eaw/roadmap/items/${i.id}`), t('Butir dihapus')) })}>{t('Hapus')}</Btn></> : null}</td>
    </tr>
  );
}

export default function Roadmap() {
  const canWrite = can('eaw.roadmap.write');
  const q = useQuery({ queryKey: ['roadmap'], queryFn: () => api.get<Road>('/api/v1/eaw/roadmap') });
  const d = q.data;
  const acts = canWrite ? <><Btn onClick={() => phaseForm()}>+ {t('Fase')}</Btn><Btn variant="pri" onClick={() => { if (!d?.phases.length) return toast(t('Belum ada fase'), t('Tambahkan fase dulu.'), 'info'); itemModal(d.phases, d.phases[0].id); }}>+ {t('Butir')}</Btn></> : undefined;
  const head = <PageHd title={t('Peta Rencana & Roadmap')} sub={t('Master IT Roadmap transformasi digital dan pelacak milestone (FR-04.1). Fase dan butir bertanggal nyata; tidak ada data contoh — diisi Holding EA Office.')} acts={acts} />;
  if (q.isError) return <>{head}<Callout tone={(q.error as any)?.status === 403 ? 'warn' : 'err'}>{(q.error as any)?.status === 403 ? t('Peran Anda tidak memiliki izin eaw.catalog.read.') : api.explain(q.error)}</Callout></>;
  if (!d) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  const s = d.summary; const cur = d.phases.find((f) => f.id === d.currentPhaseId);
  const ms = d.phases.flatMap((f) => f.items).filter((i) => i.jenis === 'milestone').sort((a, b) => a.target.localeCompare(b.target));
  return (
    <>
      {head}
      <div className="grid g4 mb">
        <Kpi label={t('Butir roadmap')} value={s.total} tgt={t('{0} fase', d.phases.length)} />
        <Kpi label={t('Selesai')} value={s.persenSelesai} unit="%" tgt={t('{0} dari {1} butir', s.selesai, s.total)} />
        <Kpi label={t('Terhambat')} value={s.terhambat} tgt={t('wajib beralasan')} />
        <Kpi label={t('Terlambat')} value={s.terlambat} tgt={t('target lewat, belum selesai')} />
      </div>
      <Card title={`${t('Gantt Fase')}${cur ? ` — ${t('fase berjalan')}: ${cur.nama}` : ''}`} meta={`${t('hari ini')} ${fmtDate(d.today)}`}><Gantt d={d} /></Card>
      <div className="grid g-2-1 mt">
        <div className="stack">
          {d.phases.map((f, k) => {
            const done = f.items.filter((i) => i.status === 'selesai').length;
            return (
              <Card key={f.id} title={<><i className="dom-dot" style={{ background: COLORS[k % COLORS.length] }} /> {f.nama}</>} flush={!!f.items.length} meta={`${fmtDate(f.mulai)} – ${fmtDate(f.selesai)} · ${t('{0}/{1} selesai', done, f.items.length)}`}
                acts={canWrite ? <><Btn sm onClick={() => itemModal(d.phases, f.id)}>+ {t('Butir')}</Btn><Btn sm onClick={() => phaseForm(f)}>{t('Ubah')}</Btn>
                  <Btn sm variant="danger" onClick={() => confirmDialog({ title: t('Hapus fase ini? (hanya bila tidak punya butir aktif)'), text: f.nama, danger: true, ok: t('Hapus'), onOk: () => apiOp(() => api.del(`/api/v1/eaw/roadmap/phases/${f.id}`), t('Fase dihapus')) })}>{t('Hapus')}</Btn></> : undefined}>
                {f.deskripsi ? <p className="small muted mb">{f.deskripsi}</p> : null}
                {f.items.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('Butir')}</th><th>{t('Target')}</th><th>{t('Status')}</th><th /></tr></thead><tbody>{f.items.map((i) => <ItemRow key={i.id} i={i} canWrite={canWrite} phases={d.phases} />)}</tbody></table></div>
                  : <div className="empty small">{t('Belum ada deliverable/milestone di fase ini.')}</div>}
              </Card>
            );
          })}
        </div>
        <Card title={t('Pelacak Milestone')} flush={!!ms.length}>
          {ms.length ? <div className="list">{ms.map((m) => (
            <div key={m.id} className="li">
              <span className="ic" style={{ background: m.status === 'selesai' ? 'var(--ok-soft)' : m.status === 'berjalan' ? 'var(--accent-soft)' : 'var(--surface-3)' }}>{m.status === 'selesai' ? '✓' : m.status === 'berjalan' ? '◐' : m.status === 'terhambat' ? '⚠' : '○'}</span>
              <div className="bd"><div className="t">{m.judul}</div><div className="tiny muted">{fmtDate(m.target)}{m.terlambat ? <> · <b style={{ color: 'var(--err)' }}>{t('terlambat')}</b></> : null}</div></div>
            </div>))}</div> : <div className="empty small">{t('Belum ada milestone.')}</div>}
        </Card>
      </div>
      <p className="tiny muted mt">{t('Roadmap level grup; disusun Holding EA Office (eaw.roadmap.write). Bukti objek (🔗) menampilkan status objek EAW saat ini tetapi tidak mengubah status butir otomatis.')}</p>
    </>
  );
}
