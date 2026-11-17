'use client';
/* GSE — Proyek Scaffolding interaktif: wizard "Scaffold Baru" (GSE-01) + drawer detail (gerbang, berkas, prompt, ringkasan AI, Git & CI, bundel).
   Aturan SEBENARNYA di server/DB: gerbang AF-06 (aplikasi ≥ Divalidasi, percobaan yang diblokir tetap tercatat sebagai proyek 'blocked'), prompt dimasking PII,
   AI hanya mengusulkan berkas BARU yang divalidasi, push/PR hanya untuk status 'generated', tidak pernah ke main. UI hanya mengumpulkan input dan meneruskan galat. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { downloadApi } from '@/lib/download';
import { invalidateData } from '@/lib/query';
import { can } from '@/store/session';
import { openLayer, toast } from '@/store/ui';
import { Drawer, Modal, act, confirmDialog, openDrawer } from '@/components/overlay';
import { Badge, Btn, Callout, Field, Input, Kpi, Tag, Textarea } from '@/components/ui';
import { t } from '@/lib/i18n';

export const GATES = ['pii-guard', 'manifest', 'lint', 'build', 'sca', 'sbom'];
export const secs = (n?: number | null) => (n == null ? '—' : `${(n / 1000).toFixed(2).replace('.', ',')} ${t('dtk')}`);
const ST: Record<string, [string, string]> = { generated: [t('Dihasilkan'), 'b-ok'], 'checks-failed': [t('Gerbang gagal'), 'b-err'], blocked: [t('Diblokir AF-06'), 'b-warn'] };
export const StatusBadge = ({ s }: { s: string }) => <Badge cls={(ST[s] || ['', ''])[1]}>{(ST[s] || [s])[0]}</Badge>;
const GCLS: Record<string, string> = { ok: 'b-ok', err: 'b-err', skipped: '' }; const GICON: Record<string, string> = { ok: '✓', err: '✕', skipped: '–' };
export const GateChip = ({ g }: { g?: { status: string; detail?: string } }) => (g ? <span className={`badge ${GCLS[g.status]} nodot`} title={g.detail}>{GICON[g.status]}</span> : <span className="muted">—</span>);
export const PROV: Record<string, [string, string, string, string]> = { gitlab: ['GitLab', 'merge request', 'MR', 'pipeline'], github: ['GitHub', 'pull request', 'PR', 'run Actions'] };
const CI: Record<string, ['ok' | 'err' | 'warn' | 'info', string]> = { lulus: ['ok', t('Pipeline lulus')], gagal: ['err', t('Pipeline gagal')], berjalan: ['warn', t('Pipeline berjalan')], belum: ['info', t('Belum ada pipeline')] };

export function Gates({ gates }: { gates?: Record<string, { status: string; detail?: string }> }) {
  return <div className="stack small mt-s">{GATES.map((g) => { const x = gates?.[g]; return <div key={g} className="row"><span style={{ width: 26 }}><GateChip g={x} /></span><b style={{ width: 90 }}>{g}</b><span className="muted" style={{ flex: 1 }}>{x ? x.detail : '—'}</span></div>; })}</div>;
}

function AiSummary({ ai }: { ai: any }) {
  if (!ai) return null;
  const acc: any[] = ai.accepted || [], rej: any[] = ai.rejected || [];
  return (
    <div className="mt"><Callout tone={acc.length ? 'warn' : 'info'} icon="🤖">
      <b>{t('{0} berkas dihasilkan AI', acc.length)}</b> ({t('model')} {ai.model} · {ai.promptTokens + ai.completionTokens} token{ai.attempts > 1 ? ` · ${t('1× perbaikan format')}` : ''}) — <b>{t('wajib reviu manusia')}</b>.
      {acc.length ? <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{acc.map((f) => <li key={f.path}><code>{f.path}</code>{f.alasan ? ` — ${f.alasan}` : ''}</li>)}</ul> : null}
      {rej.length ? <div className="tiny muted mt-s"><b>{t('{0} usulan ditolak validator', rej.length)}:</b> {rej.slice(0, 6).map((x, i) => <span key={i}><code>{x.path || '?'}</code> ({x.alasan}){i < Math.min(rej.length, 6) - 1 ? '; ' : ''}</span>)}{rej.length > 6 ? ' …' : ''}</div> : null}
    </Callout></div>
  );
}

/* ---------------------------------------------------------------- drawer detail ---------------------------------------------------------------- */
export function GitBox({ r, g }: { r: api.Row; g: api.Row }) {
  if (g.push) {
    const c = g.ci; const [k, l] = CI[c ? c.ringkasan : 'belum'] || CI.belum; const pv = PROV[g.push.provider] || PROV.gitlab;
    return (
      <>
        <div className="stack small mt-s">
          <div className="row"><b style={{ width: 90 }}>{t('Cabang')}</b><code>{g.push.branch}</code></div>
          <div className="row"><b style={{ width: 90 }}>Commit</b><code>{String(g.push.commitSha).slice(0, 10)}</code></div>
          <div className="row"><b style={{ width: 90 }}>{pv[2]}</b><a href={g.push.mrUrl} target="_blank" rel="noopener noreferrer">!{g.push.mrIid} ↗</a></div>
        </div>
        <div className="mt"><Callout tone={k} icon={k === 'ok' ? '✓' : k === 'err' ? '✕' : 'ℹ'}>
          <b>{l}</b>{c ? <> · {t('status')} {pv[0]} <code>{c.status}</code> · <a href={c.url} target="_blank" rel="noopener noreferrer">{pv[3]} #{c.pipelineId} ↗</a></> : ` — ${t('klik “Cek status CI” setelah runner memulainya.')}`}
          <div className="tiny muted mt-s">{t('Status dibaca apa adanya dari penyedia Git; merge tetap lewat reviu manusia (0 push ke main — D-02).')}</div>
        </Callout></div>
      </>
    );
  }
  if (!g.configured) return <Callout tone="info">{t('Konektor Git belum dikonfigurasi di API (GitHub: GITHUB_TOKEN; GitLab: GITLAB_URL + GITLAB_TOKEN). Unduh bundel, commit ke branch {0}, lalu buka PR (0 push langsung ke main — D-02).', r.branch)}</Callout>;
  return r.status === 'generated'
    ? <Callout tone="info">{t('Push membuat branch {0} dari {1}, meng-commit {2} berkas, dan membuka PR/MR. Tidak pernah push/merge ke {1}.', r.branch, r.baseBranch, r.files.length)}</Callout>
    : <Callout tone="warn">{t('Hanya proyek berstatus generated (gerbang lokal lulus) yang boleh di-push.')}</Callout>;
}

function ProjectDrawer({ id, close }: { id: string; close: () => void }) {
  const pq = useQuery({ queryKey: ['gse-project', id], queryFn: () => api.get<api.Row>(`/api/v1/gse/projects/${id}`) });
  const gq = useQuery({ queryKey: ['gse-git', id], queryFn: () => api.get<api.Row>(`/api/v1/gse/projects/${id}/git`).catch(() => ({ configured: false, push: null, ci: null }) as api.Row) });
  const r = pq.data, g = gq.data;
  if (!r) return <Drawer title={t('Proyek')} close={close}>{pq.isError ? <Callout tone="err">{api.explain(pq.error)}</Callout> : <div className="small muted">{t('Memuat…')}</div>}</Drawer>;
  const run = can('gse.project.run');
  const refetch = () => { pq.refetch(); gq.refetch(); invalidateData(); };
  const push = () => confirmDialog({ title: t('Push ke repo Git?'), text: t('Dibuat branch fitur + PR/MR (tidak ada push ke main).'), ok: t('Push + buka PR/MR'),
    onOk: async () => { const x = await api.post(`/api/v1/gse/projects/${id}/git/push`, {}); toast(t('Push berhasil'), `${(PROV[x.provider] || PROV.gitlab)[2]} #${x.mrIid} ${t('dibuka')}`, 'success'); refetch(); } });
  const ci = () => act(async () => { const x = await api.post(`/api/v1/gse/projects/${id}/git/ci`, {}); refetch(); return x; }, (x) => x.pesan || `Pipeline: ${x.ringkasan}${x.changed ? ` (${t('baru')})` : ''}`);
  return (
    <Drawer title={<>{r.branch}</>} sub={`${r.repoGit || '—'} · base ${r.baseBranch} · ${secs(r.durationMs)}`} wide close={close}
      footer={r.files.length ? <>
        {r.status === 'generated' && g?.configured && !g.push && run ? <Btn variant="pri" onClick={push}>⇧ {t('Push + buka PR/MR')}</Btn> : null}
        {g?.push && run ? <Btn onClick={ci}>↻ {t('Cek status CI')}</Btn> : null}
        <Btn onClick={() => downloadApi(`/api/v1/gse/projects/${id}/bundle`, `${String(r.kode).toLowerCase()}-scaffold.tar`)}>⇩ {t('Bundel (.tar)')}</Btn></> : undefined}>
      <div className="row mb"><Tag>{r.kode}</Tag><StatusBadge s={r.status} /></div>
      {r.reason ? <div className="mb"><Callout tone="err" icon="⛔">{r.reason}</Callout></div> : null}
      <h3>{t('Gerbang')}</h3><Gates gates={r.gates} />
      <h3 className="mt">{t('Berkas')} ({r.files.length})</h3>
      <div className="stack small mt-s">{r.files.length ? r.files.map((f: any) => <div key={f.path} className="row"><code className="tiny" style={{ flex: 1 }}>{f.path}</code>{f.source === 'ai' ? <span className="badge b-warn" title={t('Diusulkan model — wajib reviu manusia')}>AI</span> : null}<span className="tiny muted">{f.bytes} B</span></div>) : <span className="muted">{t('Tidak ada (diblokir).')}</span>}</div>
      {r.prompt ? <><h3 className="mt">{t('Prompt tambahan')}</h3><p className="small mt-s">{r.prompt}</p><div className="tiny muted">{t('Disimpan sebagai prompt-as-code setelah masking PII (D-14).')}{r.ai ? '' : ` ${t('Tidak diproses AI (scaffold deterministik).')}`}</div></> : null}
      {r.ai ? <><h3 className="mt">{t('Scaffolding AI')}</h3><AiSummary ai={r.ai} /></> : null}
      <h3 className="mt">Git &amp; CI</h3>{g ? <GitBox r={r} g={g} /> : <div className="small muted">{t('Memuat…')}</div>}
    </Drawer>
  );
}
export const openProject = (id: string) => openDrawer((close) => <ProjectDrawer id={id} close={close} />);

/* ---------------------------------------------------------------- wizard ---------------------------------------------------------------- */
function defaults(a: api.Row | undefined, tpls: api.Row[]) {
  if (!a) return [];
  const k = (c: string) => tpls.find((x) => x.kode === c)?.id as string | undefined;
  return [a.workspaceMode === 'FEDERATED_REMOTE' ? 'tpl-remote-spa' : 'tpl-internal-sub', 'tpl-nest-clean', 'tpl-ddl-set', 'tpl-ci'].map(k).filter(Boolean) as string[];
}

function Wizard({ close, initialPrompt = '' }: { close: () => void; initialPrompt?: string }) {
  const apps = useQuery({ queryKey: ['gse-apps'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/gse/apps')).data });
  const tpls = useQuery({ queryKey: ['gse-tpls'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/gse/templates')).data });
  const ai = useQuery({ queryKey: ['gse-ai'], queryFn: () => api.get<api.Row>('/api/v1/gse/ai/status').catch(() => null) });
  const [step, setStep] = React.useState(1);
  const [app, setApp] = React.useState<string>(''); const [sel, setSel] = React.useState<string[]>([]);
  const [branch, setBranch] = React.useState(''); const [prompt, setPrompt] = React.useState(initialPrompt); const [useAi, setUseAi] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false); const [res, setRes] = React.useState<api.Row | null>(null);
  const a = apps.data?.find((x) => x.id === app);
  const st = ai.data;
  const run = async () => {
    setErr(null); setBusy(true);
    try { setRes(await api.post('/api/v1/gse/projects', { applicationId: app, templateIds: sel, branch: branch || undefined, prompt: prompt || undefined, aiAssist: useAi || undefined })); setStep(3); invalidateData(); }
    catch (e) { if ((e as api.ApiError).status === 422 && !/AF-06/.test(api.explain(e))) setErr(api.explain(e)); else { setRes({ error: api.explain(e) }); setStep(3); invalidateData(); } }
    finally { setBusy(false); }
  };
  const steps = [t('Pilih Aplikasi (Gate AF-06)'), t('Template & Konfigurasi'), t('Hasil')];
  let body: React.ReactNode, foot: React.ReactNode;
  if (step === 1) {
    body = <>
      <p className="small muted mb">{t('Hanya aplikasi di katalog EAW berstatus minimal Divalidasi yang dapat di-scaffold (AF-06). Aplikasi Draf dinonaktifkan.')}</p>
      <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 340, overflow: 'auto' }}>
        {apps.data?.length ? apps.data.map((x) => (
          <label key={x.id} className="li" style={{ cursor: x.eligible ? 'pointer' : 'not-allowed', opacity: x.eligible ? 1 : 0.6 }}>
            <input type="radio" name="gapp" disabled={!x.eligible} checked={x.id === app} onChange={() => { setApp(x.id); setSel(defaults(x, tpls.data || [])); }} />
            <div className="bd"><div className="t">{x.kode} · {x.nama}</div><div className="d">{x.jenisNode}{x.platform ? ` ${t('di')} ${x.platform}` : ''} · {x.workspaceMode} · {x.entityCode}</div></div><Badge value={x.status} />
          </label>)) : <div className="empty">{apps.isLoading ? t('Memuat…') : t('Katalog EAW masih kosong.')}</div>}
      </div></>;
    foot = <Btn variant="pri" disabled={!app} onClick={() => setStep(2)}>{t('Lanjut')} →</Btn>;
  } else if (step === 2) {
    const cats = ['shell', 'frontend', 'backend', 'ddl', 'ci'];
    body = <>
      <div className="mb"><Callout tone="ok" icon="✓">{t('Gate AF-06 lolos')} — <b>{a?.kode}</b> {t('berstatus')} {a?.status}.</Callout></div>
      {cats.map((c) => { const ts = (tpls.data || []).filter((x) => x.kategori === c); return ts.length ? (
        <div className="field" key={c}><label style={{ textTransform: 'capitalize' }}>{c}</label>{ts.map((x) => (
          <label key={x.id} className="small row" style={{ gap: 6 }}><input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...new Set([...s, x.id])] : s.filter((i) => i !== x.id)))} /> <b>{x.nama}</b> <span className="tiny muted">v{x.versi} · {x.fileCount} {t('berkas')}</span></label>))}</div>) : null; })}
      <div className="form-grid mt">
        <Field label={t('Feature branch (bukan main — D-02)')} full><Input type="text" className="mono" value={branch} placeholder={`feat/gse-${String(a?.kode || '').toLowerCase()}-scaffold`} onChange={(e) => setBranch(e.target.value)} /></Field>
        <Field label={t('Prompt tambahan (opsional)')} hint={t('Disimpan sebagai prompt-as-code setelah masking PII (D-14).')} full><Textarea value={prompt} maxLength={2000} placeholder={t('mis. Tambahkan modul laporan bulanan…')} onChange={(e) => setPrompt(e.target.value)} /></Field>
        <div className="field full">
          {!st || !st.configured ? <Callout tone="info"><b>{t('Bantu AI')}</b> {t('belum tersedia: LLM belum dikonfigurasi di API (LLM_BASE_URL). Scaffold tetap deterministik dari templat.')}</Callout>
            : !st.enabled ? <Callout tone="warn" icon="⛔"><b>{t('Bantu AI')}</b> {t('dinonaktifkan kill-switch (CONSOLE → Security Center).')}</Callout>
            : <>
              <label className="small row" style={{ gap: 8 }}><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> <b>{t('Bantu AI')}</b> — {t('model')} <code>{st.model}</code> {t('menambah berkas BARU berdasarkan prompt (maks. {0} berkas)', st.limits.maxFiles)}</label>
              <div className="tiny muted mt-s">{t('Prompt dimasking PII & melewati guardrail lokal sebelum dikirim. Keluaran divalidasi (path, rahasia, tabel master lokal) dan gerbang pii-guard; lint/build tetap tidak dijalankan — kode AI wajib direviu manusia lewat PR.')}{useAi && prompt.trim().length < 15 ? <b style={{ color: 'var(--err)' }}> {t('Isi prompt min. 15 karakter.')}</b> : null}</div></>}
        </div>
      </div>
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}</>;
    foot = <><Btn onClick={() => setStep(1)}>← {t('Kembali')}</Btn><Btn variant="pri" disabled={!sel.length || busy} onClick={run}>{busy ? '…' : `⚙ ${t('Generate')}`}</Btn></>;
  } else {
    const r = res!;
    body = r.error ? <Callout tone="err">{r.error}</Callout> : <>
      <div className="grid g3 mb"><Kpi label={t('Status')} value={r.status === 'generated' ? t('Dihasilkan') : t('Gerbang gagal')} /><Kpi label={t('Berkas')} value={r.fileCount} /><Kpi label={t('Durasi')} value={secs(r.durationMs)} /></div>
      <Gates gates={r.gates} /><AiSummary ai={r.ai} />
      <div className="mt"><Callout tone="info">{t('Branch {0} belum di-push. Push ke Git dari detail proyek (bila konektor aktif) atau unduh bundel lalu commit & buka PR.', r.branch)}</Callout></div></>;
    foot = <>{!res?.error ? <Btn variant="pri" onClick={() => downloadApi(`/api/v1/gse/projects/${r.id}/bundle`, `${String(r.kode).toLowerCase()}-scaffold.tar`)}>⇩ {t('Unduh bundel')}</Btn> : null}<Btn onClick={() => { close(); if (r.id) openProject(r.id); }}>{r.id ? t('Buka detail') : t('Tutup')}</Btn></>;
  }
  return (
    <Modal title={t('Scaffold Baru — GSE Engine')} sub={t('Template deterministik (D-04) · gerbang AF-06')} close={close} footer={<><span className="right" />{step < 3 ? <Btn onClick={close}>{t('Batal')}</Btn> : null}{foot}</>}>
      <div className="steps">{steps.map((s, i) => <div key={i} className={`step ${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}`}><b>{t('Langkah')} {i + 1}</b>{s}</div>)}</div>
      {body}
    </Modal>
  );
}
export const openWizard = (initialPrompt?: string) => openLayer((close) => <Wizard close={close} initialPrompt={initialPrompt} />);

/* ---------------------------------------------------------------- ringkasan (KPI) ---------------------------------------------------------------- */
export function ProjectSummary() {
  const q = useQuery({ queryKey: ['gse-summary'], queryFn: () => api.get<api.Row>('/api/v1/gse/summary') });
  if (!q.data) return null;
  const s = q.data.projects; const live = s.total - s.blocked;
  return (
    <div className="grid g4 mb">
      <Kpi label={t('Rata-rata durasi')} value={live ? (s.avgDurationMs / 1000).toFixed(2).replace('.', ',') : '—'} unit={live ? t('dtk') : undefined} tgt={t('target ≤ {0} dtk (NFR-03)', q.data.targetMs / 1000)} />
      <Kpi label={t('Dihasilkan')} value={s.generated} tgt={t('siap di-commit ke feature branch')} />
      <Kpi label={t('Gerbang gagal')} value={s.checksFailed} tgt="pii-guard / manifest" />
      <Kpi label={t('Diblokir AF-06')} value={s.blocked} tgt={t('aplikasi belum Divalidasi')} />
    </div>
  );
}
