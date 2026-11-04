import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { configuredProvider, providerFor, providerInfo, requireProvider } from './git-provider';

class PushDto { @IsOptional() @IsString() @MaxLength(300) commitMessage?: string }

const PROTECTED = ['main', 'master', 'develop'];
/** Ringkasan status CI yang dipahami UI. Status mentah GitLab tetap dikembalikan. */
export const ciSummary = (s: string | null | undefined): 'belum' | 'berjalan' | 'lulus' | 'gagal' =>
  !s || s === 'skipped' ? 'belum' : s === 'success' ? 'lulus' : ['failed', 'canceled', 'canceling'].includes(s) ? 'gagal' : 'berjalan';
const pushDto = (r: any) => r && ({ id: r.id, provider: r.provider, repoPath: r.repo_path, branch: r.ref, commitSha: r.commit_sha, mrIid: r.mr_iid, mrUrl: r.mr_url, createdBy: r.created_by, createdAt: r.created_at });
const ciDto = (r: any) => r && ({ id: r.id, pipelineId: r.pipeline_id == null ? null : Number(r.pipeline_id), status: r.ci_status, ringkasan: ciSummary(r.ci_status), url: r.ci_url, commitSha: r.commit_sha, checkedAt: r.created_at });

/**
 * Konektor Git/CI GSE (GitLab atau GitHub lewat antarmuka GitProvider). Push selalu ke FEATURE BRANCH baru + PR/MR (tidak pernah merge/push ke cabang utama; CHECK DB + guard kode).
 * Koneksi HTTP dilakukan DI LUAR transaksi DB. Token hanya dari env. Hasil CI dibaca dari pipeline/Actions penyedia apa adanya — GSE tidak mengklaim lulus tanpa pipeline.
 */
@Controller('api/v1/gse')
export class GseGitController {
  constructor(private readonly db: DbService) {}

  @Get('git/status') @RequirePermission('gse.project.read')
  status() { return providerInfo(); }

  @Get('projects/:id/git') @RequirePermission('gse.project.read')
  async info(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const pid = uuidOr400(id);
      if (!(await c.query('SELECT 1 FROM gse.project WHERE id = $1 AND deleted_at IS NULL', [pid])).rowCount) throw new NotFoundException('proyek tidak ditemukan');
      const ev = (await c.query('SELECT * FROM gse.git_event WHERE project_id = $1 ORDER BY created_at DESC, id', [pid])).rows;
      const cis = ev.filter((e) => e.kind === 'ci');
      return { configured: !!configuredProvider(), provider: configuredProvider()?.name ?? null, push: pushDto(ev.find((e) => e.kind === 'push')), ci: ciDto(cis[0]), riwayatCi: cis.slice(0, 10).map(ciDto) };
    });
  }

  /** Buat cabang fitur, commit seluruh berkas scaffold, buka merge request ke base_branch. Hanya proyek 'generated' (gerbang lokal lulus). */
  @Post('projects/:id/git/push') @HttpCode(201) @RequirePermission('gse.project.run')
  async push(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: PushDto) {
    const prov = requireProvider(); const pid = uuidOr400(id);
    const { proj, files, pushed } = await this.db.tx(p, async (c) => {
      const proj = (await c.query('SELECT * FROM gse.project WHERE id = $1 AND deleted_at IS NULL', [pid])).rows[0];
      if (!proj) throw new NotFoundException('proyek tidak ditemukan');
      return { proj, files: (await c.query('SELECT path, content FROM gse.project_file WHERE project_id = $1 ORDER BY path', [pid])).rows as Array<{ path: string; content: string }>,
        pushed: (await c.query(`SELECT 1 FROM gse.git_event WHERE project_id = $1 AND kind = 'push'`, [pid])).rowCount };
    });
    if (proj.status !== 'generated') throw new ProblemException(422, 'invalid-state', 'Proyek belum layak di-push', `Status proyek "${proj.status}"; hanya "generated" (gerbang lokal lulus) yang boleh.`);
    if (pushed) throw new ProblemException(409, 'conflict', 'Proyek sudah pernah di-push', 'Satu proyek = satu cabang + satu merge request. Buat proyek scaffold baru untuk push ulang.');
    if (!files.length) throw new ProblemException(409, 'invalid-state', 'Proyek tanpa berkas');
    const branch: string = proj.branch;
    if (PROTECTED.includes(branch.toLowerCase()) || branch === proj.base_branch) throw new ProblemException(422, 'validation-failed', 'Cabang dilindungi', 'Push langsung ke cabang utama dilarang (D-02).');
    const path = prov.repoPath(proj.repo_git);

    const def = await prov.defaultBranch(path);
    const base = proj.base_branch || def;
    if (!base) throw new ProblemException(422, 'validation-failed', 'Cabang dasar tidak diketahui', 'Repo kosong atau tanpa default branch.');
    const { commitSha } = await prov.pushBranch(path, branch, base, b.commitMessage?.trim() || `feat(gse): scaffold ${proj.kode} dari ${files.length} berkas template`, files);
    let mr: { number: number; url: string };
    try {
      mr = await prov.openReview(path, branch, base, `GSE scaffold: ${proj.kode}`,
        `Dihasilkan otomatis oleh SAORAJA GSE (proyek ${proj.id}).

Gerbang lokal: ${Object.entries(proj.gates || {}).map(([k, v]: any) => `${k}=${v.status}`).join(', ') || '—'}.
Reviu manusia + pipeline CI wajib sebelum merge (AF-06/D-02).`);
    } catch (e) {
      await prov.deleteBranch(path, branch).catch(() => undefined);                  // jangan tinggalkan cabang yatim
      throw e;
    }
    const commit = { id: commitSha };
    return this.db.tx(p, async (c) => {
      const r = (await c.query(`INSERT INTO gse.git_event (project_id, kind, provider, repo_path, ref, commit_sha, mr_iid, mr_url, detail) VALUES ($1,'push',$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
        [pid, prov.name, path, branch, commit.id, mr.number, mr.url, JSON.stringify({ base, files: files.length })])).rows[0];
      return pushDto(r);
    });
  }

  /** Baca pipeline terbaru untuk cabang proyek dari GitLab; simpan sebagai event bila status berubah. */
  @Post('projects/:id/git/ci') @HttpCode(200) @RequirePermission('gse.project.run')
  async ci(@CurrentUser() p: Principal, @Param('id') id: string) {
    const pid = uuidOr400(id);
    const last = await this.db.tx(p, async (c) => {
      const ev = (await c.query('SELECT * FROM gse.git_event WHERE project_id = $1 ORDER BY created_at DESC, id', [pid])).rows;
      return { push: ev.find((e) => e.kind === 'push'), ci: ev.find((e) => e.kind === 'ci') };
    });
    if (!last.push) throw new ProblemException(409, 'invalid-state', 'Belum ada push', 'Push proyek ke GitLab dulu sebelum membaca status CI.');
    const pl = await providerFor(last.push.provider).latestCi(last.push.repo_path, last.push.ref);
    if (!pl) return { changed: false, ci: null, ringkasan: 'belum', pesan: 'Belum ada pipeline untuk cabang ini (runner/CI belum memulainya).' };
    const prev = last.ci;
    if (prev && Number(prev.pipeline_id) === pl.id && prev.ci_status === pl.status) return { changed: false, ci: ciDto(prev), ringkasan: ciSummary(pl.status) };
    const row = await this.db.tx(p, async (c) => (await c.query(
      `INSERT INTO gse.git_event (project_id, kind, provider, repo_path, ref, commit_sha, pipeline_id, ci_status, ci_url) VALUES ($1,'ci',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [pid, last.push.provider, last.push.repo_path, last.push.ref, pl.sha ?? null, pl.id, pl.status, pl.url])).rows[0]);
    return { changed: true, ci: ciDto(row), ringkasan: ciSummary(pl.status) };
  }
}
