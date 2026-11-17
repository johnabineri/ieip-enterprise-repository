'use client';
/* GSE — Status Gerbang & PR (Multi-Git PR & Pipeline): per proyek, tahap pipeline (gerbang lokal di EAP + hasil CI NYATA dari penyedia Git bila sudah di-push),
   PR/MR, riwayat CI, riwayat commit ruang kerja. Status CI dibaca apa adanya dari GitHub/GitLab lewat konektor API (tanpa token → hanya gerbang lokal);
   merge ke main hanya lewat PR + reviu manusia (D-02) dan sinkron ArgoCD belum ada. Aksi (push, cek CI) butuh gse.project.run. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDT } from '@/lib/format';
import { downloadApi } from '@/lib/download';
import { invalidateData } from '@/lib/query';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { act, confirmDialog } from '@/components/overlay';
import { Btn, Callout, Card, Kpi, PageHd } from '@/components/ui';
import { t } from '@/lib/i18n';
import { GATES, GitBox, PROV, StatusBadge, secs } from './gse-project';

const LGATE: Record<string, string> = { 'pii-guard': 'pii-guard', manifest: 'Manifest', lint: 'Lint', build: 'Build', sca: 'SCA Grype & ORT', sbom: 'SBOM Syft' };
const GCLS: Record<string, string> = { ok: 'ok', err: 'err', skipped: '' };
const GTXT: Record<string, string> = { ok: `✓ ${t('lolos')}`, err: `✕ ${t('gagal')}`, skipped: `– ${t('dilewati')}` };

function Stage({ label, cls, text, title }: { label: string; cls?: string; text: string; title?: string }) {
  return <div className={`pstage ${cls || ''}`} title={title}><b>{label}</b>{text}</div>;
}

export default function PrPage() {
  const run = can('gse.project.run');
  const pq = useQuery({ queryKey: ['gse-pr-projects'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/gse/projects', { limit: 100 })).data });
  const [sel, setSel] = React.useState<string | null>(null);
  React.useEffect(() => { const l = pq.data; if (l?.length && (!sel || !l.some((x) => x.id === sel))) setSel(l[0].id); }, [pq.data, sel]);
  const proj = useQuery({ queryKey: ['gse-pr-project', sel], enabled: !!sel, queryFn: () => api.get<api.Row>(`/api/v1/gse/projects/${sel}`) });
  const git = useQuery({ queryKey: ['gse-pr-git', sel], enabled: !!sel, queryFn: () => api.get<api.Row>(`/api/v1/gse/projects/${sel}/git`).catch(() => ({ configured: false, push: null, ci: null, riwayatCi: [] }) as api.Row) });
  const commits = useQuery({ queryKey: ['gse-pr-commits', sel], enabled: !!sel, queryFn: async () => (await api.get<{ data: api.Row[] }>(`/api/v1/gse/projects/${sel}/workspace/commits`).catch(() => ({ data: [] }))).data });
  const head = <PageHd title={t('Multi-Git PR & Pipeline')} sub={t('Hasil gerbang per proyek. Push ke feature branch + PR/MR dan status CI lewat konektor Git (GitHub/GitLab) bila dikonfigurasi; tanpa konektor: unduh bundel lalu buka PR manual. Sinkron ArgoCD belum tersedia.')} />;
  if (pq.isError) return <>{head}<Callout tone="err">{api.explain(pq.error)}</Callout></>;
  if (!pq.data) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  if (!pq.data.length) return <>{head}<Card><div className="empty"><div className="big">∅</div>{t('Belum ada proyek.')}</div></Card></>;

  const list = pq.data; const r = proj.data; const g = git.data; const ci = g?.ci;
  const refetch = () => { proj.refetch(); git.refetch(); commits.refetch(); pq.refetch(); invalidateData(); };
  const push = () => confirmDialog({ title: t('Push ke repo Git?'), text: t('Dibuat branch fitur + PR/MR (tidak ada push ke main).'), ok: t('Push + buka PR/MR'),
    onOk: async () => { const x = await api.post(`/api/v1/gse/projects/${sel}/git/push`, {}); toast(t('Push berhasil'), `${(PROV[x.provider] || PROV.gitlab)[2]} #${x.mrIid} ${t('dibuka')}`, 'success'); refetch(); } });
  const checkCi = () => act(async () => { const x = await api.post(`/api/v1/gse/projects/${sel}/git/ci`, {}); refetch(); return x; }, (x) => x.pesan || `Pipeline: ${x.ringkasan}${x.changed ? ` (${t('baru')})` : ''}`);
  const ciCls = !ci ? '' : ci.ringkasan === 'lulus' ? 'ok' : ci.ringkasan === 'gagal' ? 'err' : 'run';
  const ciTxt = !ci ? (g?.push ? `– ${t('belum dicek')}` : `– ${t('belum di-push')}`) : ci.ringkasan === 'lulus' ? `✓ ${t('lulus')}` : ci.ringkasan === 'gagal' ? `✕ ${t('gagal')}` : `◐ ${t('berjalan')}`;
  const failed = r?.gates ? Object.entries(r.gates as Record<string, api.Row>).filter(([, x]) => x.status === 'err').map(([k, x]) => `${k}: ${x.detail}`).join(' · ') : '';

  return (
    <>
      {head}
      <div className="grid g-1-2">
        <Card title={t('Proyek / Branch')} flush>
          <div className="list">{list.map((x) => (
            <div key={x.id} className="li" style={{ cursor: 'pointer', ...(x.id === sel ? { background: 'var(--accent-soft)' } : {}) }} onClick={() => setSel(x.id)}>
              <span className="ic">⑂</span><div className="bd"><div className="t">{x.kode}</div><div className="d mono">{x.branch}</div></div><StatusBadge s={x.status} />
            </div>))}</div>
        </Card>
        <div className="stack">
          {r ? <>
            <Card title={`${r.repoGit || '—'} · ${r.branch}`} acts={r.fileCount ? <Btn sm onClick={() => downloadApi(`/api/v1/gse/projects/${sel}/bundle`, `${String(r.kode).toLowerCase()}-scaffold.tar`)}>⇩ {t('Bundel')}</Btn> : undefined}>
              <div className="pipeline">
                {GATES.map((k) => { const x = r.gates?.[k]; return <Stage key={k} label={LGATE[k]} cls={x ? GCLS[x.status] : ''} text={x ? GTXT[x.status] : '—'} title={x?.detail} />; })}
                <Stage label={g?.push ? `CI ${(PROV[g.push.provider] || PROV.gitlab)[0]}` : 'CI'} cls={ciCls} text={ciTxt} title={ci ? `${ci.status}` : undefined} />
                <Stage label="Merge → ArgoCD" text={`– ${t('belum ada konektor')}`} />
              </div>
              {r.reason ? <div className="mt"><Callout tone="err" icon="⛔">{r.reason}</Callout></div> : null}
              {r.status === 'checks-failed' ? <div className="mt"><Callout tone="err" icon="✕">{failed}</Callout></div> : null}
              <h3 className="mt">Git &amp; CI</h3>{g ? <GitBox r={r} g={g} /> : <div className="small muted">{t('Memuat…')}</div>}
              {run && r.files ? <div className="row mt">
                {r.status === 'generated' && g?.configured && !g.push ? <Btn variant="pri" onClick={push}>⇧ {t('Push + buka PR/MR')}</Btn> : null}
                {g?.push ? <Btn onClick={checkCi}>↻ {t('Cek status CI')}</Btn> : null}</div> : null}
            </Card>
            <Card title={t('Ringkasan')}>
              <div className="grid g3"><Kpi label={t('Berkas')} value={r.fileCount ?? '—'} /><Kpi label={t('Ukuran')} value={r.bytes ? (r.bytes / 1024).toFixed(1) : '—'} unit={r.bytes ? 'KB' : undefined} /><Kpi label={t('Durasi')} value={secs(r.durationMs)} /></div>
              <p className="small muted mt">{t('Merge ke {0} hanya lewat PR (reviewer: Domain Architect + Lead Software Engineer).', r.baseBranch)}</p>
            </Card>
            {g?.riwayatCi?.length ? <Card title={t('Riwayat status CI')} flush><table className="tbl"><thead><tr><th>{t('Waktu')}</th><th>{t('Ringkasan')}</th><th>{t('Status penyedia')}</th><th /></tr></thead><tbody>
              {g.riwayatCi.filter(Boolean).map((e: api.Row, i: number) => <tr key={i}><td className="tiny">{fmtDT(e.checkedAt)}</td><td><span className={`badge ${e.ringkasan === 'lulus' ? 'b-ok' : e.ringkasan === 'gagal' ? 'b-err' : ''}`}>{e.ringkasan}</span></td><td><code className="tiny">{e.status}</code></td><td>{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">#{e.pipelineId} ↗</a> : null}</td></tr>)}</tbody></table></Card> : null}
            {commits.data?.length ? <Card title={t('Riwayat commit ruang kerja')} flush><table className="tbl"><thead><tr><th>{t('Waktu')}</th><th>{t('Jenis')}</th><th>Commit</th><th>{t('Pesan')}</th><th>{t('Berkas')}</th></tr></thead><tbody>
              {commits.data.map((c) => <tr key={c.id}><td className="tiny">{fmtDT(c.createdAt)}</td><td>{c.kind}</td><td><code className="tiny">{String(c.commitSha).slice(0, 8)}</code></td><td className="small">{c.message}</td><td className="num">{(c.files || []).length}</td></tr>)}</tbody></table></Card> : null}
          </> : <div className="small muted">{proj.isError ? api.explain(proj.error) : t('Memuat…')}</div>}
        </div>
      </div>
    </>
  );
}
