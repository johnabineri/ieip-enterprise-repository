'use client';
/* GSE — Visual Agent & Distributed Saga Flow Builder (GSE-03) + eksekusi saga. Validasi SEBENARNYA di DB (trigger gse.flow: langkah pemutasi wajib kompensasi +
   idempotencyKey, agen ≤ L3 dan fail_mode closed; hanya flow valid yang dapat di-commit; mengubah flow committed mengembalikannya ke draft). Eksekutor saga
   ringan di API (bukan Temporal): berurutan, retry dengan Idempotency-Key tetap, gagal → kompensasi terbalik; jejak append-only. UI hanya menyunting spesifikasi. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDT } from '@/lib/format';
import { invalidateData } from '@/lib/query';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { act, confirmDialog } from '@/components/overlay';
import { Badge, Btn, Callout, Card, Field, Input, PageHd, Select, Textarea } from '@/components/ui';
import { t } from '@/lib/i18n';

interface Draft { id?: string; version?: number | string; nama: string; kind: 'saga' | 'agent'; status: string; valid: boolean; problems: string[]; spec: any }
const step0 = () => ({ name: '', service: '', mutates: true, compensation: '', idempotencyKey: '${order_id}' });
const blank = (kind: 'saga' | 'agent'): Draft => ({ nama: '', kind, status: 'draft', valid: false, problems: [], spec: kind === 'saga' ? { steps: [step0()] } : { autonomy: 'L2', tools: [], guardrails: { fail_mode: 'closed' } } });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const RST: Record<string, [string, string]> = { running: [t('Berjalan'), 'b-info'], completed: [t('Selesai'), 'b-ok'], compensating: [t('Mengompensasi'), 'b-warn'], compensated: [t('Dikompensasi'), 'b-warn'], failed: [t('Gagal — tindakan manual'), 'b-err'] };
const RunBadge = ({ s }: { s: string }) => <Badge cls={(RST[s] || ['', ''])[1]}>{(RST[s] || [s])[0]}</Badge>;
const varsOf = (spec: any): string[] => [...new Set<string>((spec.steps || []).flatMap((x: any) => [...String(x.idempotencyKey || '').matchAll(/\$\{([A-Za-z_][A-Za-z0-9_.]*)\}/g)].map((m) => m[1] as string)))];

/* ---------------------------------------------------------------- eksekusi saga ---------------------------------------------------------------- */
function SagaBox({ flow }: { flow: Draft }) {
  const id = flow.id!;
  const run = can('gse.project.run') && flow.status === 'committed';
  const [input, setInput] = React.useState(() => JSON.stringify(Object.fromEntries(varsOf(flow.spec).map((v) => [v, ''])), null, 2));
  const [mode, setMode] = React.useState<'simulate' | 'live'>('simulate'); const [failAt, setFailAt] = React.useState(''); const [failComp, setFailComp] = React.useState('');
  const [sel, setSel] = React.useState<string | null>(null); const [err, setErr] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setSel(null); setFailAt(''); setFailComp(''); setErr(null); setInput(JSON.stringify(Object.fromEntries(varsOf(flow.spec).map((v) => [v, ''])), null, 2)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const runs = useQuery({ queryKey: ['gse-runs', id], queryFn: async () => (await api.get<{ data: api.Row[] }>(`/api/v1/gse/flows/${id}/runs`, { limit: 20 })).data });
  const det = useQuery({ queryKey: ['gse-run', sel], enabled: !!sel, queryFn: () => api.get<api.Row>(`/api/v1/gse/saga-runs/${sel}`) });
  const names: string[] = (flow.spec.steps || []).map((x: any) => x.name);
  const start = async () => {
    setErr(null); let parsed: unknown;
    try { parsed = input.trim() ? JSON.parse(input) : {}; } catch { return setErr(t('Input bukan JSON yang sah')); }
    setBusy(true);
    try {
      const r = await api.post(`/api/v1/gse/flows/${id}/runs`, { input: parsed, mode, ...(mode === 'simulate' && failAt ? { failAt } : {}), ...(mode === 'simulate' && failComp ? { failCompensation: failComp } : {}) });
      setSel(r.id); await runs.refetch(); toast(t('Saga {0}', (RST[r.status] || [r.status])[0].toLowerCase()), r.flowNama, r.status === 'completed' ? 'success' : 'info');
    } catch (e) { setErr(api.explain(e)); } finally { setBusy(false); }
  };
  const d = det.data;
  const recover = () => confirmDialog({ title: t('Kompensasi langkah yang sudah sukses pada run yang terhenti ini?'), ok: t('Pulihkan'), onOk: async () => { await api.post(`/api/v1/gse/saga-runs/${sel}/recover`, {}); toast(t('Run dipulihkan'), undefined, 'success'); det.refetch(); runs.refetch(); } });
  return (
    <div className="mt"><Card title={t('Eksekusi saga')} acts={run ? <Btn sm variant="pri" disabled={busy} onClick={start}>▶ {t('Jalankan')}</Btn> : undefined}>
      <p className="small muted">{t('Eksekutor ringan di API (bukan Temporal): langkah berurutan, retry dengan Idempotency-Key yang sama, kegagalan → kompensasi terbalik atas langkah pemutasi yang sudah sukses. Jejak tersimpan append-only.')}</p>
      {run ? <div className="form-grid">
        <Field label={t('Input (JSON objek; tanpa PII — D-14)')} full><Textarea rows={4} style={{ fontFamily: 'var(--mono, monospace)' }} value={input} onChange={(e) => setInput(e.target.value)} /></Field>
        <Field label={t('Mode')}><Select value={mode} onChange={(e) => setMode(e.target.value as 'simulate' | 'live')}><option>simulate</option><option>live</option></Select></Field>
        {mode === 'simulate' ? <>
          <Field label={t('Paksa aksi gagal')}><Select value={failAt} onChange={(e) => setFailAt(e.target.value)}>{['', ...names].map((n) => <option key={n} value={n}>{n || `— ${t('tidak ada')} —`}</option>)}</Select></Field>
          <Field label={t('Paksa kompensasi gagal')}><Select value={failComp} onChange={(e) => setFailComp(e.target.value)}>{['', ...names].map((n) => <option key={n} value={n}>{n || `— ${t('tidak ada')} —`}</option>)}</Select></Field></>
          : <div className="field full tiny muted">{t('Mode live memanggil layanan lewat HTTP (alamat dari env API SAGA_SVC_<KODE>); belum dikonfigurasi → ditolak 503. Kill-switch gse-saga di CONSOLE.')}</div>}
      </div> : <div className="tiny muted">{flow.status !== 'committed' ? t('Commit flow terlebih dahulu untuk menjalankannya.') : t('Menjalankan saga butuh izin gse.project.run.')}</div>}
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
      {runs.data?.length ? (
        <table className="tbl mt"><thead><tr><th>{t('Mulai')}</th><th>{t('Mode')}</th><th>{t('Status')}</th><th>{t('Langkah gagal')}</th></tr></thead><tbody>
          {runs.data.map((r) => <tr key={r.id} style={{ cursor: 'pointer', ...(r.id === sel ? { background: 'var(--accent-soft)' } : {}) }} onClick={() => setSel(r.id)}><td className="tiny">{fmtDT(r.startedAt)}</td><td>{r.mode}</td><td><RunBadge s={r.status} /></td><td>{r.failedStep || '—'}</td></tr>)}</tbody></table>
      ) : <div className="empty small mt">{t('Belum pernah dijalankan.')}</div>}
      {d ? <>
        <h3 className="mt">{t('Jejak run')} <RunBadge s={d.status} /></h3>
        {d.error ? <div className="mt-s"><Callout tone={d.status === 'failed' ? 'err' : 'warn'} icon="!">{d.error}</Callout></div> : null}
        <table className="tbl mt-s"><thead><tr><th>#</th><th>{t('Fase')}</th><th>{t('Aksi')}</th><th>{t('Layanan')}</th><th>{t('Percobaan')}</th><th>{t('Hasil')}</th><th>{t('Kunci idempoten')}</th></tr></thead><tbody>
          {d.steps.map((x: any, i: number) => (
            <tr key={i}><td>{x.seq + 1}</td><td>{x.phase === 'action' ? t('aksi') : `↩ ${t('kompensasi')}`}</td><td><code>{x.action}</code></td><td>{x.service}</td><td>{x.attempt}</td>
              <td><Badge cls={x.status === 'ok' ? 'b-ok' : 'b-err'}>{x.status === 'ok' ? 'ok' : t('gagal')}</Badge>{x.httpStatus ? <> <span className="tiny muted">HTTP {x.httpStatus}</span></> : null}{x.detail?.error ? <div className="tiny muted">{x.detail.error}</div> : null}</td>
              <td className="tiny"><code>{x.idempotencyKey || '—'}</code></td></tr>))}</tbody></table>
        {['running', 'compensating'].includes(d.status) && can('gse.project.run') ? <div className="mt-s"><Btn sm onClick={recover}>{t('Pulihkan (kompensasi)')}</Btn> <span className="tiny muted">{t('hanya setelah lease {0} kedaluwarsa', new Date(d.leaseUntil).toLocaleTimeString())}</span></div> : null}
      </> : null}
    </Card></div>
  );
}

/* ---------------------------------------------------------------- editor ---------------------------------------------------------------- */
function Editor({ d, setD, editable }: { d: Draft; setD: (x: Draft) => void; editable: boolean }) {
  const setStep = (i: number, k: string, v: unknown) => { const n = clone(d); n.spec.steps[i][k] = v; setD(n); };
  if (d.kind === 'saga') {
    return (
      <>
        <div className="stack">{d.spec.steps.map((s: any, i: number) => (
          <div key={i} className="card" style={{ boxShadow: 'none', padding: '10px 12px' }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <b>{i + 1}</b><Input type="text" style={{ width: 130 }} value={s.name} disabled={!editable} placeholder={t('nama aksi')} onChange={(e) => setStep(i, 'name', e.target.value)} />
              <span className="tiny muted">service</span><Input type="text" style={{ width: 90 }} value={s.service} disabled={!editable} onChange={(e) => setStep(i, 'service', e.target.value)} />
              <label className="tiny row" style={{ gap: 4 }}><input type="checkbox" checked={s.mutates !== false} disabled={!editable} onChange={(e) => setStep(i, 'mutates', e.target.checked)} />{t('memutasi data')}</label>
              <span className="tiny muted">{t('kompensasi')}</span><Input type="text" style={{ width: 130 }} value={s.compensation || ''} disabled={!editable} onChange={(e) => setStep(i, 'compensation', e.target.value)} />
              <span className="tiny muted">idempotencyKey</span><Input type="text" style={{ width: 120 }} value={s.idempotencyKey || ''} disabled={!editable} onChange={(e) => setStep(i, 'idempotencyKey', e.target.value)} />
              {editable ? <Btn sm onClick={() => { const n = clone(d); n.spec.steps.splice(i, 1); setD(n); }}>✕</Btn> : null}
            </div>
          </div>))}</div>
        {editable ? <Btn sm className="mt-s" onClick={() => { const n = clone(d); n.spec.steps.push(step0()); setD(n); }}>+ {t('Langkah')}</Btn> : null}
      </>
    );
  }
  const set = (fn: (s: any) => void) => { const n = clone(d); fn(n.spec); setD(n); };
  return (
    <div className="form-grid">
      <Field label={t('Otonomi (maks. L3 — D-06)')}><Select value={d.spec.autonomy} disabled={!editable} onChange={(e) => set((s) => { s.autonomy = e.target.value; })}>{['L1', 'L2', 'L3', 'L4'].map((l) => <option key={l}>{l}</option>)}</Select></Field>
      <Field label={t('Guardrail fail_mode (wajib closed — D-03)')}><Select value={d.spec.guardrails?.fail_mode} disabled={!editable} onChange={(e) => set((s) => { s.guardrails = { ...(s.guardrails || {}), fail_mode: e.target.value }; })}>{['closed', 'open'].map((l) => <option key={l}>{l}</option>)}</Select></Field>
      <Field label={t('Tools (pisahkan koma)')} full><Input type="text" key={d.id || 'new'} defaultValue={(d.spec.tools || []).join(', ')} disabled={!editable} onBlur={(e) => set((s) => { s.tools = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); })} /></Field>
    </div>
  );
}

export default function FlowPage() {
  const canRun = can('gse.project.run');
  const fq = useQuery({ queryKey: ['gse-flows'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/gse/flows')).data });
  const [d, setD] = React.useState<Draft>(() => blank('saga'));
  const loaded = React.useRef(false);
  React.useEffect(() => { if (fq.data && !loaded.current) { loaded.current = true; if (fq.data[0]) setD(clone(fq.data[0]) as Draft); } }, [fq.data]);
  const yq = useQuery({ queryKey: ['gse-yaml', d.id, d.version], enabled: !!d.id, queryFn: () => api.get<{ yaml: string }>(`/api/v1/gse/flows/${d.id}/yaml`).catch(() => null) });
  const open = (f: api.Row) => setD(clone(f) as Draft);
  const refresh = async () => { await fq.refetch(); invalidateData(); };
  const save = async (): Promise<Draft | null> => {
    try {
      const spec = clone(d.spec); if (d.kind === 'agent') spec.tools = (spec.tools || []).filter(Boolean);
      const r = d.id ? await api.patch(`/api/v1/gse/flows/${d.id}`, { nama: d.nama, spec }, d.version) : await api.post('/api/v1/gse/flows', { nama: d.nama, kind: d.kind, spec });
      setD(clone(r) as Draft); await refresh(); return r;
    } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); return null; }
  };
  const onSave = async () => { const r = await save(); if (r) toast(r.valid ? t('Flow tersimpan (valid)') : t('Flow tersimpan — belum valid'), r.nama, r.valid ? 'success' : 'info'); };
  const onCommit = async () => { const r = await save(); if (!r) return; await act(async () => { const c = await api.post(`/api/v1/gse/flows/${r.id}/commit`, {}); setD(clone(c) as Draft); await fq.refetch(); return c; }, (c) => t('Flow di-commit: {0}', c.nama)); };
  const onRemove = () => confirmDialog({ title: t('Hapus flow ini?'), text: d.nama, danger: true, ok: t('Hapus'), onOk: async () => { await api.del(`/api/v1/gse/flows/${d.id}`); setD(blank('saga')); await refresh(); } });
  const head = <PageHd title={t('Visual Agent & Distributed Saga Flow Builder')} sub={t('Saga: tiap langkah pemutasi wajib kompensasi idempoten + idempotencyKey (D-07). Agent: otonomi maksimum L3 dan guardrail fail-closed (D-06, D-03). Divalidasi server.')} />;
  if (fq.isError) return <>{head}<Callout tone="err">{api.explain(fq.error)}</Callout></>;
  const flows = fq.data || [];
  return (
    <>
      {head}
      <div className="grid g-1-2">
        <div>
          <Card title={t('Flow tersimpan')} flush acts={canRun ? <><Btn sm onClick={() => setD(blank('saga'))}>+ Saga</Btn> <Btn sm onClick={() => setD(blank('agent'))}>+ Agent</Btn></> : undefined}>
            <div className="list">{flows.length ? flows.map((f) => (
              <div key={f.id} className="li" style={{ cursor: 'pointer', ...(f.id === d.id ? { background: 'var(--accent-soft)' } : {}) }} onClick={() => open(f)}>
                <span className="ic">{f.kind === 'saga' ? '⇆' : '✦'}</span><div className="bd"><div className="t">{f.nama}</div><div className="d">{f.kind} · {f.valid ? t('valid') : t('tidak valid')}</div></div>
                <Badge cls={f.status === 'committed' ? 'b-ok' : ''}>{f.status}</Badge></div>)) : <div className="empty small">{fq.isLoading ? t('Memuat…') : t('Belum ada flow.')}</div>}</div>
          </Card>
        </div>
        <div>
          <Card title={d.id ? d.nama : `${t('Flow baru')} (${d.kind})`}
            acts={canRun ? <><Btn sm onClick={onSave}>{t('Simpan draf')}</Btn>{d.id ? <><Btn sm variant="pri" onClick={onCommit}>Commit</Btn><Btn sm variant="danger" onClick={onRemove}>{t('Hapus')}</Btn></> : null}</> : undefined}>
            <Field label={t('Nama')}><Input type="text" value={d.nama} disabled={!canRun} onChange={(e) => setD({ ...d, nama: e.target.value })} /></Field>
            <div className="mt"><Editor d={d} setD={setD} editable={canRun} /></div>
            {d.problems?.length ? <div className="mt"><Callout tone="err" icon="✕"><b>{t('Tidak valid')}:</b><br />{d.problems.map((p, i) => <React.Fragment key={i}>{p}<br /></React.Fragment>)}</Callout></div>
              : d.id ? <div className="mt"><Callout tone="ok" icon="✓">{t('Lolos validasi (kompensasi idempoten / batas otonomi).')}</Callout></div> : <div className="tiny muted mt">{t('Validasi dilakukan server saat disimpan.')}</div>}
            {yq.data?.yaml ? <><h3 className="mt">{d.kind === 'saga' ? 'flow.yaml' : 'agent.yaml'}</h3><pre className="code mt-s">{yq.data.yaml}</pre></> : null}
          </Card>
        </div>
      </div>
      {d.id && d.kind === 'saga' ? <SagaBox flow={d} /> : null}
    </>
  );
}
