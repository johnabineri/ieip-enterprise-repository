import { ProblemException } from '../common/problem';

/**
 * Klien GitHub minimal untuk konektor Git/CI GSE. Konfigurasi HANYA dari env (bukan dari klien/DB):
 *   GITHUB_TOKEN (fine-grained PAT: Contents RW, Pull requests RW, Actions R, Metadata R), GITHUB_API_URL (default https://api.github.com; GHES/uji),
 *   GITHUB_ALLOWED_PREFIX (opsional, mis. "johnabineri" membatasi pemilik/repo), GITHUB_TIMEOUT_MS. Token tidak pernah dikembalikan atau dicatat.
 * Commit multi-berkas memakai Git Data API (tree + commit + ref) sehingga SATU commit atomik; branch dibuat terakhir, jadi kegagalan tidak meninggalkan cabang yatim.
 */
export interface GithubCfg { url: string; token: string; allowed: string[]; timeout: number }
export const githubCfg = (): GithubCfg | null => {
  const token = process.env.GITHUB_TOKEN || ''; if (!token) return null;
  return { url: (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, ''), token,
    allowed: (process.env.GITHUB_ALLOWED_PREFIX || '').split(',').map((s) => s.trim().replace(/^\/+|\/+$/g, '').toLowerCase()).filter(Boolean), timeout: Number(process.env.GITHUB_TIMEOUT_MS || 15000) };
};

/** repoGit aplikasi -> "pemilik/repo". Menerima URL github.com, "github.com/o/r", atau "o/r". */
export function githubRepoPath(repoGit: string | null | undefined, cfg: GithubCfg): string {
  if (!repoGit) throw new ProblemException(422, 'validation-failed', 'Repo Git belum diisi', 'Isi repoGit pada aplikasi (mis. pemilik/repo) sebelum push.');
  const p = repoGit.trim().replace(/^[a-z]+:\/\//i, '').replace(/^git@github\.com:/i, '').replace(/^(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[\w.-]+$/.test(p) || p.endsWith('..')) throw new ProblemException(422, 'validation-failed', 'Format repoGit tidak sah', 'Gunakan "pemilik/repo" GitHub (mis. johnabineri/ieip-enterprise-repository).');
  if (cfg.allowed.length && !cfg.allowed.some((a) => p.toLowerCase() === a || p.toLowerCase().startsWith(a + '/'))) throw new ProblemException(403, 'forbidden', 'Repo di luar daftar yang diizinkan', `Repo ${p} tidak berawalan salah satu GITHUB_ALLOWED_PREFIX.`);
  return p;
}

const enc = (b: string) => b.split('/').map(encodeURIComponent).join('/');
export class Github {
  constructor(private readonly cfg: GithubCfg) {}
  private async call<T>(method: string, path: string, body?: unknown, okStatus: number[] = [200, 201]): Promise<{ status: number; data: T }> {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), this.cfg.timeout);
    try {
      const r = await fetch(`${this.cfg.url}${path}`, { method, signal: ctl.signal, body: body ? JSON.stringify(body) : undefined,
        headers: { Authorization: `Bearer ${this.cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'saoraja-eap-gse', ...(body ? { 'Content-Type': 'application/json' } : {}) } });
      const text = await r.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 200) }; }
      if (okStatus.includes(r.status)) return { status: r.status, data };
      const msg = String(data?.message || `HTTP ${r.status}`) + (Array.isArray(data?.errors) ? ' ' + JSON.stringify(data.errors).slice(0, 150) : '');
      if (r.status === 401) throw new ProblemException(502, 'bad-gateway', 'GitHub menolak kredensial', 'Token GitHub tidak sah atau kedaluwarsa.');
      if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') throw new ProblemException(503, 'service-unavailable', 'Batas laju GitHub tercapai', 'Coba lagi setelah jendela laju direset.');
      if (r.status === 403) throw new ProblemException(502, 'bad-gateway', 'GitHub menolak akses', `Token tidak punya hak pada repo ini: ${msg.slice(0, 150)}`);
      if (r.status === 404) throw new ProblemException(422, 'validation-failed', 'Repo/ref tidak ditemukan di GitHub', msg.slice(0, 200));
      if (r.status === 409 || r.status === 422) throw new ProblemException(409, 'conflict', 'GitHub menolak operasi', msg.slice(0, 300));
      throw new ProblemException(502, 'bad-gateway', 'Galat dari GitHub', `HTTP ${r.status}: ${msg.slice(0, 200)}`);
    } catch (e: any) {
      if (e instanceof ProblemException) throw e;
      throw new ProblemException(502, 'bad-gateway', 'GitHub tidak dapat dihubungi', e?.name === 'AbortError' ? 'Batas waktu terlampaui.' : String(e?.message || e).slice(0, 150));
    } finally { clearTimeout(t); }
  }

  async defaultBranch(repo: string): Promise<string | null> { return (await this.call<{ default_branch: string | null }>('GET', `/repos/${repo}`)).data.default_branch; }

  async pushBranch(repo: string, branch: string, base: string, message: string, files: Array<{ path: string; content: string }>): Promise<{ commitSha: string }> {
    const ref = await this.call<{ object: { sha: string } }>('GET', `/repos/${repo}/git/ref/heads/${enc(base)}`, undefined, [200, 404, 409]);   // repo kosong = 409 "Git Repository is empty" (diverifikasi ke api.github.com)
    if (ref.status === 404 || ref.status === 409) throw new ProblemException(422, 'validation-failed', 'Repo kosong atau cabang dasar tidak ada', `Cabang "${base}" belum punya commit. Buat commit awal (mis. README) di ${base} lebih dulu; GSE tidak pernah menulis langsung ke cabang utama.`);
    const baseSha = ref.data.object.sha;
    const baseCommit = (await this.call<{ tree: { sha: string } }>('GET', `/repos/${repo}/git/commits/${baseSha}`)).data;
    const tree = (await this.call<{ sha: string }>('POST', `/repos/${repo}/git/trees`, { base_tree: baseCommit.tree.sha, tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) })).data;
    const commit = (await this.call<{ sha: string }>('POST', `/repos/${repo}/git/commits`, { message, tree: tree.sha, parents: [baseSha] })).data;
    await this.call('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });            // 422 bila cabang sudah ada -> 409, tidak menimpa
    return { commitSha: commit.sha };
  }
  async pullRequest(repo: string, head: string, base: string, title: string, body: string) {
    return (await this.call<{ number: number; html_url: string }>('POST', `/repos/${repo}/pulls`, { title, head, base, body })).data;
  }
  async deleteBranch(repo: string, branch: string) { await this.call('DELETE', `/repos/${repo}/git/refs/heads/${enc(branch)}`, undefined, [200, 204, 404, 422]); }

  /** Jalankan Actions terbaru untuk branch -> dinormalkan ke kosakata status pipeline (success/failed/canceled/skipped/pending/running). */
  async latestRun(repo: string, branch: string): Promise<{ id: number; status: string; url: string; sha: string | null } | null> {
    const r = (await this.call<{ workflow_runs: Array<{ id: number; status: string; conclusion: string | null; html_url: string; head_sha: string }> }>('GET', `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`)).data;
    const w = r.workflow_runs?.[0]; if (!w) return null;
    let status: string;
    if (w.status === 'completed') status = w.conclusion === 'success' ? 'success' : w.conclusion === 'cancelled' ? 'canceled' : ['skipped', 'neutral'].includes(w.conclusion || '') ? 'skipped' : 'failed';
    else status = w.status === 'in_progress' ? 'running' : 'pending';
    return { id: w.id, status, url: w.html_url, sha: w.head_sha ?? null };
  }
}
