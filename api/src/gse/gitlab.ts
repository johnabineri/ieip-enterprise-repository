import { ProblemException } from '../common/problem';

/**
 * Klien GitLab minimal untuk konektor Git/CI GSE. Konfigurasi HANYA dari env (tidak pernah dari klien/DB, sehingga bukan vektor SSRF):
 *   GITLAB_URL (mis. https://git.kalla.co.id), GITLAB_TOKEN (PAT/project token, scope api), GITLAB_ALLOWED_PREFIX (opsional, daftar awalan path dipisah koma),
 *   GITLAB_TIMEOUT_MS (default 15000). Token tidak pernah dikembalikan ke klien atau dicatat.
 */
export interface GitlabCfg { url: string; token: string; allowed: string[]; timeout: number }
export const gitlabCfg = (): GitlabCfg | null => {
  const url = (process.env.GITLAB_URL || '').replace(/\/+$/, ''); const token = process.env.GITLAB_TOKEN || '';
  if (!url || !token) return null;
  return { url, token, allowed: (process.env.GITLAB_ALLOWED_PREFIX || '').split(',').map((s) => s.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean), timeout: Number(process.env.GITLAB_TIMEOUT_MS || 15000) };
};
export const requireGitlab = (): GitlabCfg => {
  const c = gitlabCfg();
  if (!c) throw new ProblemException(503, 'service-unavailable', 'Konektor Git belum dikonfigurasi', 'Atur GITLAB_URL dan GITLAB_TOKEN pada API. Sementara itu gunakan bundel .tar.');
  return c;
};

/** repo_git aplikasi -> path_with_namespace GitLab. Mengikis skema, host (bila sama dengan GITLAB_URL), dan akhiran .git. */
export function repoPath(repoGit: string | null | undefined, cfg: GitlabCfg): string {
  if (!repoGit) throw new ProblemException(422, 'validation-failed', 'Repo Git belum diisi', 'Isi repoGit pada aplikasi (mis. grup/proyek) sebelum push.');
  let p = repoGit.trim().replace(/^[a-z]+:\/\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  const host = new URL(cfg.url).host.toLowerCase();
  if (p.toLowerCase().startsWith(host + '/')) p = p.slice(host.length + 1);
  if (!/^[\w.-]+(\/[\w.-]+)+$/.test(p) || p.includes('..')) throw new ProblemException(422, 'validation-failed', 'Format repoGit tidak sah', 'Gunakan path GitLab "grup/proyek" (boleh bersubgrup).');
  if (cfg.allowed.length && !cfg.allowed.some((a) => p === a || p.startsWith(a + '/'))) throw new ProblemException(403, 'forbidden', 'Repo di luar daftar yang diizinkan', `Path ${p} tidak berawalan salah satu GITLAB_ALLOWED_PREFIX.`);
  return p;
}

export class Gitlab {
  constructor(private readonly cfg: GitlabCfg) {}
  private async call<T>(method: string, path: string, body?: unknown, okStatus: number[] = [200, 201]): Promise<{ status: number; data: T }> {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), this.cfg.timeout);
    try {
      const r = await fetch(`${this.cfg.url}/api/v4${path}`, { method, headers: { 'PRIVATE-TOKEN': this.cfg.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      const text = await r.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 200) }; }
      if (okStatus.includes(r.status)) return { status: r.status, data };
      const msg = typeof data?.message === 'string' ? data.message : data?.message ? JSON.stringify(data.message) : data?.error || `HTTP ${r.status}`;
      if (r.status === 401 || r.status === 403) throw new ProblemException(502, 'bad-gateway', 'GitLab menolak kredensial', 'Token GitLab tidak sah / tidak punya hak pada repo ini.');
      if (r.status === 404) throw new ProblemException(422, 'validation-failed', 'Repo tidak ditemukan di GitLab', String(msg).slice(0, 200));
      if (r.status === 409 || r.status === 400) throw new ProblemException(409, 'conflict', 'GitLab menolak operasi', String(msg).slice(0, 300));
      throw new ProblemException(502, 'bad-gateway', 'Galat dari GitLab', `HTTP ${r.status}: ${String(msg).slice(0, 200)}`);
    } catch (e: any) {
      if (e instanceof ProblemException) throw e;
      throw new ProblemException(502, 'bad-gateway', 'GitLab tidak dapat dihubungi', e?.name === 'AbortError' ? 'Batas waktu terlampaui.' : String(e?.message || e).slice(0, 150));
    } finally { clearTimeout(t); }
  }
  private pid = (path: string) => encodeURIComponent(path);

  async project(path: string) { return (await this.call<{ id: number; default_branch: string | null; web_url: string }>('GET', `/projects/${this.pid(path)}`)).data; }
  async createBranch(path: string, branch: string, ref: string) {
    return (await this.call<{ name: string }>('POST', `/projects/${this.pid(path)}/repository/branches?branch=${encodeURIComponent(branch)}&ref=${encodeURIComponent(ref)}`)).data;
  }
  async commit(path: string, branch: string, message: string, files: Array<{ path: string; content: string }>) {
    return (await this.call<{ id: string; web_url?: string }>('POST', `/projects/${this.pid(path)}/repository/commits`,
      { branch, commit_message: message, actions: files.map((f) => ({ action: 'create', file_path: f.path, content: f.content })) })).data;
  }
  async mergeRequest(path: string, source: string, target: string, title: string, description: string) {
    return (await this.call<{ iid: number; web_url: string }>('POST', `/projects/${this.pid(path)}/merge_requests`,
      { source_branch: source, target_branch: target, title, description, remove_source_branch: true })).data;
  }
  async deleteBranch(path: string, branch: string) { await this.call('DELETE', `/projects/${this.pid(path)}/repository/branches/${encodeURIComponent(branch)}`, undefined, [200, 204, 404]); }
  async latestPipeline(path: string, ref: string) {
    const r = (await this.call<Array<{ id: number; status: string; web_url: string; sha: string }>>('GET', `/projects/${this.pid(path)}/pipelines?ref=${encodeURIComponent(ref)}&per_page=1&order_by=id&sort=desc`)).data;
    return r && r[0] ? r[0] : null;
  }
}
