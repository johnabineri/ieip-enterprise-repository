import { ProblemException } from '../common/problem';
import { Gitlab, gitlabCfg, repoPath as gitlabRepoPath } from './gitlab';
import { Github, githubCfg, githubRepoPath } from './github';

/**
 * Antarmuka penyedia Git untuk konektor GSE. Setiap adaptor: (1) membuat branch FITUR berisi seluruh berkas dalam satu commit, (2) membuka PR/MR ke base,
 * (3) membaca status CI terbaru branch. TIDAK ADA operasi merge/push ke cabang utama di antarmuka ini (D-02).
 */
export type GitProviderName = 'gitlab' | 'github';
export interface CiInfo { id: number; status: string; url: string; sha: string | null }
export interface GitProvider {
  name: GitProviderName;
  repoPath(repoGit: string | null | undefined): string;
  defaultBranch(path: string): Promise<string | null>;
  /** Buat branch + commit seluruh berkas. Bila gagal di tengah jalan, adaptor membersihkan cabang yang sempat dibuat. */
  pushBranch(path: string, branch: string, base: string, message: string, files: Array<{ path: string; content: string }>): Promise<{ commitSha: string }>;
  openReview(path: string, branch: string, base: string, title: string, body: string): Promise<{ number: number; url: string }>;
  deleteBranch(path: string, branch: string): Promise<void>;
  latestCi(path: string, branch: string): Promise<CiInfo | null>;
}

class GitlabProvider implements GitProvider {
  name = 'gitlab' as const;
  private gl: Gitlab;
  constructor(private readonly cfg: NonNullable<ReturnType<typeof gitlabCfg>>) { this.gl = new Gitlab(cfg); }
  repoPath = (r: string | null | undefined) => gitlabRepoPath(r, this.cfg);
  async defaultBranch(path: string) { return (await this.gl.project(path)).default_branch; }
  async pushBranch(path: string, branch: string, base: string, message: string, files: Array<{ path: string; content: string }>) {
    await this.gl.createBranch(path, branch, base);
    try { return { commitSha: (await this.gl.commit(path, branch, message, files)).id }; }
    catch (e) { await this.gl.deleteBranch(path, branch).catch(() => undefined); throw e; }
  }
  async openReview(path: string, branch: string, base: string, title: string, body: string) { const r = await this.gl.mergeRequest(path, branch, base, title, body); return { number: r.iid, url: r.web_url }; }
  deleteBranch = (path: string, branch: string) => this.gl.deleteBranch(path, branch);
  async latestCi(path: string, branch: string) { const p = await this.gl.latestPipeline(path, branch); return p ? { id: p.id, status: p.status, url: p.web_url, sha: p.sha ?? null } : null; }
}

class GithubProvider implements GitProvider {
  name = 'github' as const;
  private gh: Github;
  constructor(private readonly cfg: NonNullable<ReturnType<typeof githubCfg>>) { this.gh = new Github(cfg); }
  repoPath = (r: string | null | undefined) => githubRepoPath(r, this.cfg);
  defaultBranch = (path: string) => this.gh.defaultBranch(path);
  pushBranch = (path: string, branch: string, base: string, message: string, files: Array<{ path: string; content: string }>) => this.gh.pushBranch(path, branch, base, message, files);
  async openReview(path: string, branch: string, base: string, title: string, body: string) { const r = await this.gh.pullRequest(path, branch, base, title, body); return { number: r.number, url: r.html_url }; }
  deleteBranch = (path: string, branch: string) => this.gh.deleteBranch(path, branch);
  latestCi = (path: string, branch: string) => this.gh.latestRun(path, branch);
}

/** Penyedia yang dikonfigurasi. GIT_PROVIDER memilih bila keduanya terisi; bila tidak, GitLab didahulukan (kompatibel mundur). */
export function configuredProvider(): GitProvider | null {
  const pick = (process.env.GIT_PROVIDER || '').toLowerCase();
  const gl = gitlabCfg(); const gh = githubCfg();
  if (pick === 'github') return gh ? new GithubProvider(gh) : null;
  if (pick === 'gitlab') return gl ? new GitlabProvider(gl) : null;
  return gl ? new GitlabProvider(gl) : gh ? new GithubProvider(gh) : null;
}
export const requireProvider = (): GitProvider => {
  const p = configuredProvider();
  if (!p) throw new ProblemException(503, 'service-unavailable', 'Konektor Git belum dikonfigurasi', 'Atur GITHUB_TOKEN (GitHub) atau GITLAB_URL + GITLAB_TOKEN (GitLab) pada API. Sementara itu gunakan bundel .tar.');
  return p;
};
/** Penyedia untuk event yang sudah tercatat: harus sama dengan yang sedang dikonfigurasi (token penyedia lain tidak dipakai diam-diam). */
export function providerFor(name: string): GitProvider {
  const p = requireProvider();
  if (p.name !== name) throw new ProblemException(409, 'conflict', 'Penyedia Git berbeda', `Proyek di-push lewat ${name}, tetapi API kini dikonfigurasi untuk ${p.name}. Set GIT_PROVIDER=${name} dan kredensialnya.`);
  return p;
}
export const providerInfo = () => {
  const p = configuredProvider(); const gl = gitlabCfg(); const gh = githubCfg();
  if (!p) return { provider: (process.env.GIT_PROVIDER || 'gitlab').toLowerCase(), configured: false, url: null, allowedPrefix: [] as string[] };
  return p.name === 'github' ? { provider: 'github', configured: true, url: gh!.url, allowedPrefix: gh!.allowed } : { provider: 'gitlab', configured: true, url: gl!.url, allowedPrefix: gl!.allowed };
};
