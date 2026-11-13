import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { findSecret } from './ai-scaffold';
import { unresolvedConflicts } from './merge';
import { GateResult, runGates } from './scaffold';

/**
 * Ruang kerja kode proyek GSE (GSE-05; 292_gse_workspace.sql). Keadaan = gse.workspace_file (revisi terakhir per path atau berkas asli).
 * "Perubahan belum di-commit" = path yang punya revisi dengan id > revision_upto commit/push terakhir; aksinya ditentukan dengan
 * membandingkan keadaan SEKARANG dengan keadaan pada baseline (bukan sekadar "pernah disunting"), sehingga suntingan yang dikembalikan
 * ke isi semula tidak menghasilkan commit kosong.
 */
export const WS_LIMITS = { maxFiles: 500, maxTotalBytes: 5_000_000, maxFileBytes: 200_000 };
export type ChangeAction = 'create' | 'update' | 'delete';
export interface WsFile { path: string; content: string | null; bytes: number; source: string; origin: string | null; revisionId: number | null; deleted: boolean; editedAt: string | null }
export interface WsChange { path: string; action: ChangeAction; content?: string }
export interface WsState {
  files: WsFile[];                 // termasuk yang terhapus (deleted=true)
  live: Array<{ path: string; content: string }>;
  maxRevision: number;
  baseline: { upto: number; kind: 'push' | 'commit' | 'legacy-push'; ref: string; provider: string; repoPath: string; commitSha: string; at: string } | null;
  changes: WsChange[];
}
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Muat keadaan ruang kerja + baseline (commit/push terakhir) + daftar perubahan. Dipanggil di dalam transaksi DbService (RLS berlaku). */
export async function loadWorkspace(c: PoolClient, projectId: string): Promise<WsState> {
  const files: WsFile[] = (await c.query(
    `SELECT path, content, bytes, source, origin, revision_id, deleted, edited_at FROM gse.workspace_file WHERE project_id = $1 ORDER BY path`, [projectId])).rows
    .map((r) => ({ path: r.path, content: r.content, bytes: r.bytes, source: r.source, origin: r.origin, revisionId: r.revision_id == null ? null : Number(r.revision_id), deleted: r.deleted, editedAt: r.edited_at }));
  const revs = (await c.query(`SELECT id, path, op, sha256 FROM gse.file_revision WHERE project_id = $1 ORDER BY id`, [projectId])).rows
    .map((r) => ({ id: Number(r.id), path: r.path as string, op: r.op as 'put' | 'delete', sha256: r.sha256 as string | null }));
  const originals = new Map<string, string>((await c.query(`SELECT path, content FROM gse.project_file WHERE project_id = $1`, [projectId])).rows.map((r) => [r.path, sha(r.content)]));
  const wc = (await c.query(`SELECT kind, provider, repo_path, ref, commit_sha, revision_upto, created_at FROM gse.workspace_commit WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [projectId])).rows[0];
  // proyek yang di-push SEBELUM fitur ini ada: baseline = berkas asli (revision_upto 0)
  const legacy = wc ? null : (await c.query(`SELECT provider, repo_path, ref, commit_sha, created_at FROM gse.git_event WHERE project_id = $1 AND kind = 'push' ORDER BY created_at DESC LIMIT 1`, [projectId])).rows[0];
  const baseline = wc ? { upto: Number(wc.revision_upto), kind: wc.kind, ref: wc.ref, provider: wc.provider, repoPath: wc.repo_path, commitSha: wc.commit_sha, at: wc.created_at }
    : legacy ? { upto: 0, kind: 'legacy-push' as const, ref: legacy.ref, provider: legacy.provider, repoPath: legacy.repo_path, commitSha: legacy.commit_sha, at: legacy.created_at } : null;
  const maxRevision = revs.length ? revs[revs.length - 1].id : 0;
  const live = files.filter((f) => !f.deleted && f.content != null).map((f) => ({ path: f.path, content: f.content as string }));

  // keadaan pada baseline (hash isi per path; null = tidak ada)
  const upto = baseline?.upto ?? 0;
  const atBase = new Map<string, string | null>(originals);
  for (const r of revs) if (r.id <= upto) atBase.set(r.path, r.op === 'put' ? r.sha256 : null);
  const touched = new Set(revs.filter((r) => r.id > upto).map((r) => r.path));
  const now = new Map(live.map((f) => [f.path, f]));
  const changes: WsChange[] = [];
  for (const p of [...touched].sort()) {
    const before = atBase.get(p) ?? null; const cur = now.get(p);
    if (cur && before == null) changes.push({ path: p, action: 'create', content: cur.content });
    else if (cur && before !== sha(cur.content)) changes.push({ path: p, action: 'update', content: cur.content });
    else if (!cur && before != null) changes.push({ path: p, action: 'delete' });
  }
  return { files, live, maxRevision, baseline, changes };
}

/** Gerbang lokal atas SELURUH ruang kerja hidup: gerbang scaffold (pii-guard, manifest, CI=skipped) + pemindai rahasia + batas ukuran. */
export function workspaceGates(live: Array<{ path: string; content: string }>): Record<string, GateResult> {
  const g = runGates(live);
  const secrets = live.map((f) => [f.path, findSecret(f.content)] as const).filter(([, k]) => k);
  g['secret-scan'] = secrets.length ? { status: 'err', detail: `rahasia terdeteksi: ${secrets.map(([p, k]) => `${p} (${k})`).join(', ')}` } : { status: 'ok', detail: `${live.length} berkas dipindai` };
  // penggabungan 3-arah yang belum diselesaikan (penanda <<<<<<< di awal baris) tidak boleh ikut commit
  const unresolved = live.map((f) => [f.path, unresolvedConflicts(f.content)] as const).filter(([, n]) => n > 0);
  g['conflict-markers'] = unresolved.length
    ? { status: 'err', detail: `konflik penggabungan belum diselesaikan: ${unresolved.map(([p, n]) => `${p} (${n})`).join(', ')}` }
    : { status: 'ok', detail: 'tidak ada penanda konflik' };
  const total = live.reduce((n, f) => n + Buffer.byteLength(f.content, 'utf8'), 0);
  g.size = live.length > WS_LIMITS.maxFiles || total > WS_LIMITS.maxTotalBytes
    ? { status: 'err', detail: `${live.length} berkas / ${total} byte (batas ${WS_LIMITS.maxFiles} berkas / ${WS_LIMITS.maxTotalBytes} byte)` }
    : { status: 'ok', detail: `${live.length} berkas / ${total} byte` };
  return g;
}
export const gatesFailed = (g: Record<string, GateResult>) => Object.entries(g).filter(([, v]) => v.status === 'err').map(([k]) => k);

/** Bahasa Monaco dari ekstensi (UI). */
export const languageOf = (path: string): string => {
  const ext = (path.split('/').pop() || '').toLowerCase();
  if (ext === 'dockerfile') return 'dockerfile';
  const m: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', json: 'json', sql: 'sql', md: 'markdown',
    yaml: 'yaml', yml: 'yaml', css: 'css', scss: 'scss', html: 'html', go: 'go', sh: 'shell', py: 'python', xml: 'xml', env: 'ini', toml: 'ini' };
  return m[ext.split('.').pop() || ''] ?? 'plaintext';
};
