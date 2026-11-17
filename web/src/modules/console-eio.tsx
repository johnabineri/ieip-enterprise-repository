'use client';
/* CONSOLE — EIO Control Center (EIO-01..04): mediasi integrasi 6-layer ringan. Konektor (health check HTTP nyata + diff OpenAPI vs baseline), model kanonikal berversi
   (draft → active → retired; active/retired BEKU), rute (konektor REST atau flow saga GSE; aktivasi diperiksa DB), uji mediasi (simulate/live) dan jejak pertukaran
   (tanpa payload). Aturan SEBENARNYA di server/DB: validasi ketat model, aturan L4 lokal (bukan OPA), kill-switch eio-mediation, breaking change → 409, retry hanya bila
   idempoten, alamat target hanya dari env EIO_SVC_<KODE>. Mediasi SINKRON di dalam permintaan (tanpa antrean/DLQ). Izin: console.eio.write / console.eio.run. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDT, fmtNum } from '@/lib/format';
import { invalidateData, lookup } from '@/lib/query';
import { t } from '@/lib/i18n';
import { can } from '@/store/session';
import { openLayer, toast } from '@/store/ui';
import { Drawer, Modal, act, confirmDialog, formDialog, openDrawer } from '@/components/overlay';
import { Badge, Btn, Callout, Card, DL, Field, Input, Kpi, MiniTable, PageHd, Select, Tag, Textarea } from '@/components/ui';

const RST: Record<string, string> = { active: 'b-ok', draft: '', disabled: 'b-warn', retired: 'b-warn' };
const XST: Record<string, string> = { ok: 'b-ok', rejected: 'b-warn', failed: 'b-err' };
const CST: Record<string, string> = { up: 'b-ok', degraded: 'b-warn', down: 'b-err', unknown: '' };
const LAYERS: [string, string, string][] = [
  ['L1', t('Normalisasi protokol'), t('REST/JSON masuk & keluar (GET/DELETE → query). gRPC/GraphQL/webhook belum.')],
  ['L2', t('Propagasi identitas'), t('JWT pemanggil tidak diteruskan; target menerima X-Corporate-Id (ref.users CMP).')],
  ['L3', t('Pemetaan kanonikal'), t('Validasi ketat model kanonikal berversi + request/response map.')],
  ['L4', t('Aturan bisnis'), t('Aturan deklaratif per rute (lokal, deterministik — bukan OPA).')],
  ['L5', t('Orkestrasi'), t('Konektor REST (retry hanya bila idempoten) atau saga GSE (eksekutor ringan, bukan Temporal).')],
  ['L6', t('Publikasi peristiwa'), t('Outbox → NATS: eap.console.eio_exchange_completed (tanpa data/identitas).')],
];
const KODE_RE = /^[A-Z0-9][A-Z0-9_.-]*$/;
const parseJson = (txt: unknown, label: string, def?: unknown) => {
  if (!String(txt ?? '').trim()) return def;
  try { return JSON.parse(String(txt)); } catch (e) { throw new Error(`${label}: ${t('JSON tidak sah')} (${(e as Error).message})`); }
};
const J = (x: unknown) => JSON.stringify(x, null, 2);

/* ---------------------------------------------------------------- konektor ---------------------------------------------------------------- */
async function createConnector() {
  const ents = (await lookup('entities')).rows;
  formDialog({
    title: t('Daftarkan Konektor EIO'), sub: 'POST /api/v1/console/eio/connectors',
    fields: [{ name: 'kode', label: t('Kode'), req: true, placeholder: 'SEDDI-PARTY', hint: 'A-Z 0-9 _ . -', max: 50 }, { name: 'nama', label: t('Nama'), req: true }, { name: 'sumber', label: t('Sumber (produsen)'), req: true }, { name: 'target', label: t('Target (konsumen)'), req: true },
      { name: 'healthUrl', label: 'Health URL', placeholder: 'https://…/health', full: true }, { name: 'specUrl', label: t('OpenAPI URL (JSON)'), placeholder: 'https://…/openapi.json', full: true },
      { name: 'entityId', label: t('Entitas pemilik'), type: 'select', full: true, options: [['', '—'], ...ents.map((e) => [e.id, `${e.code} · ${e.name}`] as [string, string])] }],
    onSubmit: async (v) => { if (!KODE_RE.test(String(v.kode))) throw new Error(t('Kode: huruf besar, angka, _ . - (diawali huruf/angka).')); await api.post('/api/v1/console/eio/connectors', v); invalidateData(); toast(t('Konektor terdaftar'), v.kode, 'success'); },
  });
}
function ConnectorDrawer({ id, close }: { id: string; close: () => void }) {
  const q = useQuery({ queryKey: ['eio-connectors'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/console/eio/connectors')).data });
  const c = q.data?.find((x) => x.id === id); const w = can('console.eio.write');
  if (!c) return <Drawer title={t('Konektor')} close={close}><div className="small muted">{t('Memuat…')}</div></Drawer>;
  const check = () => act(async () => { const r = await api.post(`/api/v1/console/eio/connectors/${id}/check`, {}); q.refetch(); return r; }, (r) => `${t('Konektor')} ${r.status}${r.breakingChanges.length ? ` · ${r.breakingChanges.length} breaking change` : r.lastError ? ` · ${r.lastError}` : ''}`);
  const base = () => confirmDialog({ title: t('Terima kontrak terkini sebagai baseline?'), text: t('Breaking change dianggap sudah ditinjau.'), ok: t('Terima baseline'), onOk: async () => { await api.post(`/api/v1/console/eio/connectors/${id}/baseline`, {}); q.refetch(); invalidateData(); toast(t('Baseline diperbarui'), undefined, 'success'); } });
  const del = () => confirmDialog({ title: t('Hapus konektor ini?'), text: c.kode, danger: true, ok: t('Hapus'), onOk: async () => { await api.del(`/api/v1/console/eio/connectors/${id}`); invalidateData(); close(); toast(t('Konektor dihapus'), c.kode, 'success'); } });
  return (
    <Drawer title={c.nama} sub={`${c.sumber} → ${c.target}`} close={close}
      footer={w ? <><Btn variant="danger" onClick={del}>{t('Hapus')}</Btn>{c.breakingChanges.length ? <Btn onClick={base}>{t('Terima sebagai baseline baru')}</Btn> : null}<Btn variant="pri" onClick={check}>⟳ {t('Periksa sekarang')}</Btn></> : undefined}>
      <div className="row mb"><Tag>{c.kode}</Tag><Badge cls={CST[c.status]}>{c.status}</Badge></div>
      <DL pairs={[['Health URL', <span key="h" className="mono tiny">{c.healthUrl || '—'}</span>], ['Spec URL', <span key="s" className="mono tiny">{c.specUrl || '—'}</span>], [t('Latensi'), c.lastLatencyMs == null ? '—' : `${c.lastLatencyMs} ms`],
        [t('Diperiksa'), fmtDT(c.lastCheckAt)], [t('Galat'), c.lastError || '—'], [t('Hash kontrak'), <span key="x" className="mono tiny">{c.specHash || '—'}</span>]]} />
      <h3 className="mt">{t('Breaking change vs baseline')} ({c.breakingChanges.length})</h3>
      {c.breakingChanges.length ? <div className="stack small mt-s">{c.breakingChanges.map((b: string, i: number) => <Callout key={i} tone="err" icon="✕">{b}</Callout>)}</div> : <p className="small muted mt-s">{t('Tidak ada.')}</p>}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- model kanonikal ---------------------------------------------------------------- */
const FIELD_SAMPLE = J([{ name: 'order_id', type: 'string', required: true, maxLength: 40 }, { name: 'amount', type: 'number', required: true }]);
function createCanonical() {
  formDialog({
    title: t('Model Kanonikal Baru'), sub: 'POST /api/v1/console/eio/canonical-models', initial: { versi: 1, fields: FIELD_SAMPLE },
    intro: <p className="tiny muted mb">{t('Tipe: string|number|integer|boolean|object|array; opsional required, maxLength (string), enum. Model baru berstatus draft; setelah aktif BEKU.')}</p>,
    fields: [{ name: 'kode', label: t('Kode'), req: true, placeholder: 'SALES-ORDER', max: 50 }, { name: 'versi', label: t('Versi'), type: 'number', min: 1 }, { name: 'nama', label: t('Nama'), req: true, full: true },
      { name: 'fields', label: t('Field (JSON)'), type: 'textarea', req: true, full: true }],
    onSubmit: async (v) => { if (!KODE_RE.test(String(v.kode))) throw new Error(t('Kode: huruf besar, angka, _ . - (diawali huruf/angka).')); await api.post('/api/v1/console/eio/canonical-models', { kode: v.kode, versi: v.versi ?? 1, nama: v.nama, fields: parseJson(v.fields, t('Field'), []) }); invalidateData(); toast(t('Model kanonikal dibuat'), v.kode, 'success'); },
  });
}

/* ---------------------------------------------------------------- rute ---------------------------------------------------------------- */
function RouteModal({ models, connectors, close }: { models: api.Row[]; connectors: api.Row[]; close: () => void }) {
  const flows = useQuery({ queryKey: ['eio-flows'], queryFn: async () => ((await api.get<{ data: api.Row[] }>('/api/v1/gse/flows').catch(() => ({ data: [] }))).data).filter((f) => f.kind === 'saga' && f.status === 'committed') });
  const usable = models.filter((m) => m.status !== 'retired');
  const [v, setV] = React.useState({ kode: '', nama: '', canonicalId: usable[0]?.id ?? '', targetKind: 'connector', connectorId: '', method: 'POST', path: '', sagaFlowId: '', requestMap: '', responseMap: '', rules: '' });
  const [err, setErr] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const save = async () => {
    setErr(null);
    if (!KODE_RE.test(v.kode)) return setErr(t('Kode: huruf besar, angka, _ . - (diawali huruf/angka).'));
    if (v.nama.trim().length < 2 || !v.canonicalId) return setErr(t('Nama dan model kanonikal wajib.'));
    setBusy(true);
    try {
      const b: Record<string, unknown> = { kode: v.kode, nama: v.nama, canonicalId: v.canonicalId, targetKind: v.targetKind, requestMap: parseJson(v.requestMap, 'request_map'), rules: parseJson(v.rules, 'rules') };
      if (v.targetKind === 'connector') Object.assign(b, { connectorId: v.connectorId || undefined, method: v.method, path: v.path || undefined, responseMap: parseJson(v.responseMap, 'response_map') }); else b.sagaFlowId = v.sagaFlowId || undefined;
      Object.keys(b).forEach((k) => b[k] === undefined && delete b[k]);
      await api.post('/api/v1/console/eio/routes', b); invalidateData(); toast(t('Rute dibuat (draft)'), v.kode, 'success'); close();
    } catch (e) { setErr(api.explain(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('Rute Mediasi Baru')} close={close} onSubmit={(e) => { e.preventDefault(); save(); }} footer={<><span className="right" /><Btn onClick={close}>{t('Batal')}</Btn><Btn variant="pri" type="submit" disabled={busy} onClick={() => save()}>{busy ? '…' : t('Simpan')}</Btn></>}>
      <div className="form-grid">
        <Field label={t('Kode')} req><Input type="text" value={v.kode} placeholder="SO-INVOICE" onChange={(e) => set('kode', e.target.value)} /></Field>
        <Field label={t('Nama')} req><Input type="text" value={v.nama} onChange={(e) => set('nama', e.target.value)} /></Field>
        <Field label={t('Model kanonikal')} req full><Select value={v.canonicalId} onChange={(e) => set('canonicalId', e.target.value)}>{usable.map((m) => <option key={m.id} value={m.id}>{m.kode} v{m.versi} ({m.status})</option>)}</Select></Field>
        <Field label={t('Jenis target')}><Select value={v.targetKind} onChange={(e) => set('targetKind', e.target.value)}><option value="connector">{t('konektor (REST)')}</option><option value="saga">{t('flow saga GSE')}</option></Select></Field>
        {v.targetKind === 'connector' ? <>
          <Field label={t('Konektor')}><Select value={v.connectorId} onChange={(e) => set('connectorId', e.target.value)}><option value="">—</option>{connectors.map((c) => <option key={c.id} value={c.id}>{c.kode}</option>)}</Select></Field>
          <Field label="Method"><Select value={v.method} onChange={(e) => set('method', e.target.value)}>{['POST', 'GET', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Path"><Input type="text" value={v.path} placeholder="/orders/${order_id}/invoice" onChange={(e) => set('path', e.target.value)} /></Field></>
          : <Field label={t('Flow saga (committed)')} full><Select value={v.sagaFlowId} onChange={(e) => set('sagaFlowId', e.target.value)}><option value="">—</option>{(flows.data || []).map((f) => <option key={f.id} value={f.id}>{f.nama}</option>)}</Select></Field>}
        <Field label="request_map (JSON)" hint={t('kosong = data diteruskan apa adanya')} full><Textarea rows={3} className="mono" value={v.requestMap} placeholder='{"invoice.ref": "order_id", "source": {"const": "EIO"}}' onChange={(e) => set('requestMap', e.target.value)} /></Field>
        {v.targetKind === 'connector' ? <Field label={t('response_map (JSON, konektor)')} full><Textarea rows={3} className="mono" value={v.responseMap} placeholder='{"invoiceNo": "data.number"}' onChange={(e) => set('responseMap', e.target.value)} /></Field> : null}
        <Field label="rules (JSON)" full><Textarea rows={3} className="mono" value={v.rules} placeholder='[{"field":"amount","op":"gt","value":0,"message":"amount harus positif"}]' onChange={(e) => set('rules', e.target.value)} /></Field>
        <p className="tiny muted full">{t('Aktivasi diperiksa DB: model aktif, field yang dirujuk ada, operasi ada di baseline kontrak konektor, flow saga committed. Rute aktif beku.')}</p>
      </div>
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
    </Modal>
  );
}

function MediateModal({ route, model, close }: { route: api.Row; model?: api.Row; close: () => void }) {
  const sample = Object.fromEntries(((model?.fields || []) as api.Row[]).map((f) => [f.name, f.enum ? f.enum[0] : ({ string: '', number: 0, integer: 0, boolean: false, object: {}, array: [] } as Record<string, unknown>)[f.type]]));
  const modes = can('console.eio.run') && route.status === 'active' ? ['simulate', 'live'] : ['simulate'];
  const [mode, setMode] = React.useState('simulate'); const [idem, setIdem] = React.useState(''); const [data, setData] = React.useState(J(sample));
  const [out, setOut] = React.useState<{ ok: boolean; body: api.Row } | null>(null); const [busy, setBusy] = React.useState(false); const [perr, setPerr] = React.useState<string | null>(null);
  const run = async () => {
    setPerr(null); setOut(null); let parsed: unknown;
    try { parsed = parseJson(data, t('Data'), {}); } catch (e) { return setPerr((e as Error).message); }
    setBusy(true);
    try { const r = await api.post(`/api/v1/console/eio/routes/${encodeURIComponent(route.kode)}/mediate`, { mode, data: parsed }, idem ? { key: idem } : {}); setOut({ ok: true, body: r }); invalidateData(); }
    catch (e) { setOut({ ok: false, body: { error: api.explain(e), ...((e as api.ApiError).body || {}) } }); invalidateData(); }
    finally { setBusy(false); }
  };
  const b = out?.body;
  return (
    <Modal title={`${t('Uji Rute')} ${route.kode}`} close={close} footer={<><span className="right" /><Btn onClick={close}>{t('Tutup')}</Btn><Btn variant="pri" disabled={busy} onClick={run}>{busy ? '…' : `▶ ${t('Jalankan')}`}</Btn></>}>
      <div className="form-grid">
        <Field label={t('Mode')}><Select value={mode} onChange={(e) => setMode(e.target.value)}>{modes.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label={t('Idempotency-Key (opsional)')}><Input type="text" value={idem} maxLength={100} onChange={(e) => setIdem(e.target.value)} /></Field>
        <Field label={`${t('Data')} (${t('model')} ${route.canonicalKode} v${route.canonicalVersi})`} full><Textarea rows={7} className="mono" value={data} onChange={(e) => setData(e.target.value)} /></Field>
        <p className="tiny muted full">{t('simulate = L1–L4 + rencana L5 tanpa memanggil target/membuat run saga dan tanpa peristiwa. live = memanggil target sungguhan (butuh console.eio.run & rute aktif).')}</p>
      </div>
      {perr ? <div className="mt"><Callout tone="err">{perr}</Callout></div> : null}
      {b && out!.ok ? <div className="mt"><Callout tone="ok" icon="✓">{b.mode} {t('sukses')} · {(b.layers || []).map((l: api.Row) => `L${l.layer}`).join(' → ')}</Callout><pre className="mono tiny" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{J(b.plan || b.data)}</pre></div> : null}
      {b && !out!.ok ? <div className="mt"><Callout tone="err" icon="✕">{b.layer ? <b>{t('Berhenti di L{0}', b.layer)} · </b> : null}{b.error}
        {(b.errors || b.breakingChanges || b.upstream) ? <div className="tiny mt-s">{b.errors ? b.errors.join('; ') : b.breakingChanges ? b.breakingChanges.join('; ') : `${t('target HTTP')} ${b.upstream.status}`}</div> : null}</Callout></div> : null}
    </Modal>
  );
}

/* ---------------------------------------------------------------- halaman ---------------------------------------------------------------- */
export default function Eio() {
  const cq = useQuery({ queryKey: ['eio-connectors'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/console/eio/connectors')).data });
  const mq = useQuery({ queryKey: ['eio-models'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/console/eio/canonical-models')).data });
  const rq = useQuery({ queryKey: ['eio-routes'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/console/eio/routes')).data });
  const xq = useQuery({ queryKey: ['eio-exchanges'], queryFn: () => api.get<api.Row>('/api/v1/console/eio/exchanges', { limit: 30 }) });
  const w = can('console.eio.write'), run = can('console.eio.run');
  const head = <PageHd title={t('EIO Control Center')} sub={t('Mediasi integrasi 6-layer ringan (EIO-01..03): model kanonikal, rute ke konektor atau saga GSE, jejak pertukaran; plus registri konektor dengan health check & deteksi breaking change kontrak (EIO-04).')} />;
  const bad = cq.error || mq.error || rq.error || xq.error;
  if (bad) return <>{head}<Callout tone={(bad as api.ApiError).status === 403 ? 'warn' : 'err'}>{(bad as api.ApiError).status === 403 ? t('Peran Anda tidak memiliki izin untuk melihat halaman ini (403 dari API).') : api.explain(bad)}</Callout></>;
  if (!cq.data || !mq.data || !rq.data || !xq.data) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  const C = cq.data, M = mq.data, R = rq.data, X = xq.data; const s24 = X.stats24h;
  const Gate = ({ label, onClick, pri, perm }: { label: string; onClick: () => void; pri?: boolean; perm: string }) => (can(perm) ? <Btn sm variant={pri ? 'pri' : undefined} onClick={onClick}>{label}</Btn>
    : <Btn sm aria-disabled="true" style={{ opacity: 0.55 }} title={t('Butuh izin {0}', perm)} onClick={() => toast(t('403 — Akses ditolak'), t('Peran Anda tidak memiliki izin {0}.', perm), 'error')}>🔒 {label}</Btn>);
  const routeSt = (r: api.Row, to: 'activate' | 'disable') => act(() => api.post(`/api/v1/console/eio/routes/${r.id}/${to}`, {}), to === 'disable' ? t('Rute dinonaktifkan') : t('Rute diaktifkan'));
  const routeDel = (r: api.Row) => confirmDialog({ title: t('Hapus rute ini?'), text: r.kode, danger: true, ok: t('Hapus'), onOk: async () => { await api.del(`/api/v1/console/eio/routes/${r.id}`); invalidateData(); toast(t('Rute dihapus'), r.kode, 'success'); } });
  const modelSt = (m: api.Row, to: 'activate' | 'retire') => act(() => api.post(`/api/v1/console/eio/canonical-models/${m.id}/${to}`, {}), to === 'retire' ? t('Model dipensiunkan') : t('Model diaktifkan'));
  const modelDel = (m: api.Row) => confirmDialog({ title: t('Hapus model kanonikal draft ini?'), text: m.kode, danger: true, ok: t('Hapus'), onOk: async () => { await api.del(`/api/v1/console/eio/canonical-models/${m.id}`); invalidateData(); toast(t('Model dihapus'), m.kode, 'success'); } });
  const check = (c: api.Row) => act(() => api.post(`/api/v1/console/eio/connectors/${c.id}/check`, {}), (r) => `${t('Konektor')} ${r.status}${r.breakingChanges.length ? ` · ${r.breakingChanges.length} breaking change` : r.lastError ? ` · ${r.lastError}` : ''}`);
  return (
    <>
      {head}
      <div className="grid g4 mb"><Kpi label={t('Rute aktif')} value={R.filter((r) => r.status === 'active').length} tgt={`${R.length} ${t('rute')} · ${M.filter((m) => m.status === 'active').length} ${t('model aktif')}`} />
        <Kpi label={t('Pertukaran live 24 jam')} value={fmtNum(s24.total)} tgt={`${s24.ok} ${t('sukses')}`} /><Kpi label={t('p95 mediasi (24 jam)')} value={s24.p95Ms == null ? '—' : s24.p95Ms} unit={s24.p95Ms == null ? undefined : 'ms'} tgt="NFR-06 ≤ 500 ms" />
        <Kpi label={t('Ditolak / gagal 24 jam')} value={`${s24.rejected} / ${s24.failed}`} /></div>
      <div className="grid g-1-2">
        <Card title={t('6-Layer Mediation (eksekutor ringan)')}><div className="stack">{LAYERS.map(([n, ti, d], i) => (
          <div key={n} className="row" style={{ padding: '8px 10px', borderRadius: 8, flexWrap: 'nowrap', alignItems: 'flex-start', background: `color-mix(in srgb, var(--d4) ${8 + (i + 1) * 4}%, var(--surface))` }}>
            <b className="mono" style={{ minWidth: 24 }}>{n}</b><div><b className="small">{ti}</b><div className="tiny muted">{d}</div></div></div>))}</div></Card>
        <Card title={t('Rute Mediasi (console.eio_route)')} flush={!!R.length} acts={<Gate pri perm="console.eio.write" label={`+ ${t('Rute')}`} onClick={() => openLayer((close) => <RouteModal models={M} connectors={C} close={close} />)} />}>
          {R.length ? <MiniTable rows={R} columns={[
            { label: t('Rute'), render: (r) => <><b className="mono small">{r.kode}</b><div className="tiny muted">{r.nama}</div></> }, { label: t('Model'), render: (r) => <span className="mono tiny">{r.canonicalKode} v{r.canonicalVersi}</span> },
            { label: 'Target', render: (r) => (r.targetKind === 'connector' ? <><span className="tiny mono">{r.connectorKode || '?'} · {r.method} {r.path}</span>{r.targetConfigured ? null : <div className="tiny" style={{ color: 'var(--warn)' }}>env {r.targetEnv || ''} {t('belum diatur')}</div>}</> : <span className="tiny">saga <b>{r.sagaFlowNama || '?'}</b></span>) },
            { label: t('Aturan'), num: true, render: (r) => r.rules.length }, { label: t('Status'), render: (r) => <Badge cls={RST[r.status]}>{r.status}</Badge> },
            { label: '', render: (r) => <>{w || run ? <Btn sm onClick={() => openLayer((close) => <MediateModal route={r} model={M.find((m) => m.id === r.canonicalId)} close={close} />)}>▶ {t('Uji')}</Btn> : null}
              {w ? (r.status === 'active' ? <> <Btn sm onClick={() => routeSt(r, 'disable')}>{t('Nonaktifkan')}</Btn></> : <> <Btn sm onClick={() => routeSt(r, 'activate')}>{t('Aktifkan')}</Btn> <Btn sm variant="danger" onClick={() => routeDel(r)}>{t('Hapus')}</Btn></>) : null}</> }]} />
            : <div className="empty"><div className="big">∅</div>{t('Belum ada rute. Buat model kanonikal (aktifkan), lalu rute yang menargetkan konektor atau flow saga GSE.')}</div>}
        </Card>
      </div>
      <div className="mt"><Card title={t('Model Kanonikal (console.eio_canonical)')} flush={!!M.length} meta={t('active/retired beku — ubah = versi baru')} acts={<Gate pri perm="console.eio.write" label={`+ ${t('Model')}`} onClick={createCanonical} />}>
        {M.length ? <MiniTable rows={M} columns={[
          { label: t('Model'), render: (m) => <><b className="mono small">{m.kode}</b> <span className="tag">v{m.versi}</span><div className="tiny muted">{m.nama}</div></> },
          { label: t('Field'), render: (m) => <span className="tiny mono">{(m.fields as api.Row[]).map((f) => `${f.name}${f.required ? '*' : ''}:${f.type}`).join(', ')}</span> },
          { label: t('Status'), render: (m) => <><Badge cls={RST[m.status]}>{m.status}</Badge>{m.inUse ? <> <span className="tag">{t('dipakai rute aktif')}</span></> : null}</> },
          { label: '', render: (m) => (w ? (m.status === 'draft' ? <><Btn sm onClick={() => modelSt(m, 'activate')}>{t('Aktifkan')}</Btn> <Btn sm variant="danger" onClick={() => modelDel(m)}>{t('Hapus')}</Btn></> : m.status === 'active' && !m.inUse ? <Btn sm onClick={() => modelSt(m, 'retire')}>{t('Pensiunkan')}</Btn> : null) : null) }]} />
          : <div className="empty small">{t('Belum ada model kanonikal.')}</div>}
      </Card></div>
      <div className="mt"><Card title={t('Pertukaran Terbaru (console.eio_exchange — tanpa payload)')} flush={!!X.data.length} meta={t('pemegang console.eio.run tanpa dashboard hanya melihat miliknya')}>
        {X.data.length ? <MiniTable rows={X.data} columns={[{ label: t('Waktu'), render: (x) => <span className="mono tiny">{fmtDT(x.createdAt)}</span> }, { label: t('Rute'), render: (x) => <span className="mono small">{x.routeKode}</span> }, { label: t('Mode'), render: (x) => <Tag>{x.mode}</Tag> },
          { label: t('Status'), render: (x) => <Badge cls={XST[x.status]}>{x.status}</Badge> }, { label: t('Lapisan'), render: (x) => <span className="mono">L{x.layer}</span> }, { label: 'HTTP', num: true, render: (x) => x.httpStatus ?? '—' },
          { label: t('Durasi'), num: true, render: (x) => `${x.durationMs} ms` }, { label: t('Keterangan'), render: (x) => <span className="small">{x.error || (x.sagaRunId ? `saga ${String(x.sagaRunId).slice(0, 8)}` : '—')}</span> }]} />
          : <div className="empty small">{t('Belum ada pertukaran.')}</div>}
      </Card></div>
      <div className="mt"><Card title={t('Registri Konektor (console.eio_connector)')} flush={!!C.length} acts={<Gate pri perm="console.eio.write" label={`+ ${t('Konektor')}`} onClick={createConnector} />}>
        {C.length ? <MiniTable rows={C} columns={[
          { label: t('Konektor'), render: (c) => <><b>{c.nama}</b><div className="tiny mono muted">{c.kode} · {c.sumber} → {c.target}</div></> }, { label: t('Status'), render: (c) => <Badge cls={CST[c.status]}>{c.status}</Badge> },
          { label: t('Latensi'), num: true, render: (c) => (c.lastLatencyMs == null ? '—' : `${c.lastLatencyMs} ms`) }, { label: t('Diperiksa'), render: (c) => <span className="small mono">{fmtDT(c.lastCheckAt)}</span> },
          { label: t('Kontrak'), render: (c) => (c.baseline ? <>{c.baseline} {t('operasi')} {c.breakingChanges.length ? <Badge cls="b-err">{c.breakingChanges.length} breaking</Badge> : <Badge cls="b-ok">{t('stabil')}</Badge>}</> : <span className="muted small">{t('tanpa baseline')}</span>) },
          { label: '', render: (c) => <><Btn sm onClick={() => openDrawer((close) => <ConnectorDrawer id={c.id} close={close} />)}>{t('Detail')}</Btn>{w ? <> <Btn sm onClick={() => check(c)}>⟳ {t('Periksa')}</Btn></> : null}</> }]} />
          : <div className="empty"><div className="big">∅</div>{t('Belum ada konektor. Daftarkan konektor beserta URL health dan OpenAPI untuk memantau kesehatan & breaking change.')}</div>}
      </Card></div>
      <p className="tiny muted mt">{t('Health check = HTTP GET sungguhan (timeout 5 dtk). Breaking change = operasi dihapus / parameter wajib baru dibanding baseline OpenAPI; rute ke operasi yang berubah ditolak (409). Mediasi berjalan SINKRON di dalam permintaan (tanpa antrean/DLQ); alamat target hanya dari env EIO_SVC_<KODE>. Belum ada layanan KEIS nyata yang terdaftar sebagai target; broker Kafka & Temporal belum dibangun.')}</p>
    </>
  );
}
