import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { providerFor } from './git-provider';
import { merge3, MergeResult } from './merge';
import { gatesFailed, languageOf, loadWorkspace, workspaceGates, WS_LIMITS } from './workspace';

class PutFileDto {
  @IsString() @MinLength(1) @MaxLength(300) path: string;
  @IsString() @MaxLength(WS_LIMITS.maxFileBytes) content: string;
  /** Revisi yang menjadi dasar suntingan (dari GET file). null = berkas asli yang belum pernah disunting, atau berkas baru. */
  @ValidateIf((o) => o.baseRevision !== null) @IsInt() @Min(1) baseRevision: number | null;
  /** true = isi adalah hasil penggabungan 3-arah yang sudah ditinjau pengguna (dari usulan 409); baseRevision = revisi terbaru saat itu. */
  @IsOptional() @IsBoolean() merged?: boolean;
  /** Revisi dasar ASAL suntingan yang digabungkan (null = berkas asli/baru). Hanya bersama merged=true. */
  @IsOptional() @ValidateIf((o) => o.mergeBase !== null) @IsInt() @Min(1) mergeBase?: number | null;
}
class CommitDto { @IsOptional() @IsString() @MinLength(3) @MaxLength(2000) message?: string }
const PROTECTED = ['main', 'master', 'develop'];

/**
 * GSE-05 — editor kode proyek scaffold + commit ke feature branch. Suntingan = revisi append-only (berkas hasil generate tidak diubah);
 * konkurensi: revisi dasar wajib sama dengan revisi terakhir path itu (409 bila didahului penyunting lain). Commit lanjutan hanya ke cabang
 * fitur yang SUDAH di-push (POST …/git/push), fast-forward tanpa paksa; gerbang lokal (pii-guard, manifest, pemindai rahasia, ukuran) harus
 * lulus. Lint/build/SCA/SBOM tetap `skipped` — hasil sebenarnya dari pipeline CI pada PR. HTTP ke penyedia Git di LUAR transaksi DB.
 */
@Controller('api/v1/gse')
export class GseWorkspaceController {
  constructor(private readonly db: DbService) {}

  @Get('projects/:id/workspace') @RequirePermission('gse.project.read')
  workspace(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const pid = uuidOr400(id); const proj = await project(c, pid);
      const ws = await loadWorkspace(c, pid);
      const dirty = new Set(ws.changes.map((x) => x.path));
      return {
        projectId: pid, status: proj.status, branch: proj.branch, editable: proj.status !== 'blocked' && p.perms.includes('gse.project.run'),
        baseline: ws.baseline, maxRevision: ws.maxRevision,
        files: ws.files.map((f) => ({ path: f.path, bytes: f.bytes, source: f.source, origin: f.origin, revisionId: f.revisionId, deleted: f.deleted, editedAt: f.editedAt, dirty: dirty.has(f.path), language: languageOf(f.path) })),
        changes: ws.changes.map(({ path, action }) => ({ path, action })),
        gates: workspaceGates(ws.live),
      };
    });
  }

  @Get('projects/:id/workspace/file') @RequirePermission('gse.project.read')
  file(@CurrentUser() p: Principal, @Param('id') id: string, @Query('path') path: string) {
    if (!path) throw new ProblemException(400, 'bad-request', 'query path wajib');
    return this.db.tx(p, async (c) => {
      const pid = uuidOr400(id); await project(c, pid);
      const r = (await c.query('SELECT path, content, bytes, source, origin, revision_id, deleted FROM gse.workspace_file WHERE project_id = $1 AND path = $2', [pid, path])).rows[0];
      if (!r || r.deleted) throw new NotFoundException('berkas tidak ditemukan di ruang kerja');
      return { path: r.path, content: r.content, bytes: r.bytes, source: r.source, origin: r.origin, revisionId: r.revision_id == null ? null : Number(r.revision_id), language: languageOf(r.path) };
    });
  }

  /** Simpan (buat/ubah) satu berkas → revisi baru. */
  @Put('projects/:id/workspace/file') @RequirePermission('gse.project.run')
  save(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: PutFileDto) {
    return this.db.tx(p, async (c) => {
      const pid = uuidOr400(id); await project(c, pid);
      const head = await lockHead(c, pid, b.path);
      if (head.revisionId !== b.baseRevision) throw await mergeConflict(c, pid, b.path, b.baseRevision, b.content, head);
      if (!head.exists && head.count >= WS_LIMITS.maxFiles) throw new ProblemException(422, 'validation-failed', 'Batas jumlah berkas', `Ruang kerja maksimal ${WS_LIMITS.maxFiles} berkas.`);
      if (!b.merged && b.mergeBase != null) throw new ProblemException(400, 'bad-request', 'mergeBase hanya bersama merged=true');
      if (b.merged && head.revisionId == null) throw new ProblemException(400, 'bad-request', 'merged=true hanya untuk menyimpan di atas revisi terbaru (baseRevision)');
      const r = (await c.query(`INSERT INTO gse.file_revision (project_id, path, op, content, parent_id, merged, merge_base_id) VALUES ($1,$2,'put',$3,$4,$5,$6) RETURNING id, bytes, sha256`,
        [pid, b.path, b.content, head.revisionId, !!b.merged, b.merged ? b.mergeBase ?? null : null])).rows[0];
      return { path: b.path, revisionId: Number(r.id), bytes: r.bytes, sha256: r.sha256, created: !head.exists, merged: !!b.merged };
    });
  }

  @Delete('projects/:id/workspace/file') @RequirePermission('gse.project.run')
  remove(@CurrentUser() p: Principal, @Param('id') id: string, @Query('path') path: string, @Query('baseRevision') base: string) {
    if (!path) throw new ProblemException(400, 'bad-request', 'query path wajib');
    const baseRevision = base === undefined || base === '' || base === 'null' ? null : Number(base);
    if (baseRevision !== null && !(Number.isSafeInteger(baseRevision) && baseRevision > 0)) throw new ProblemException(400, 'bad-request', 'baseRevision tidak valid');
    return this.db.tx(p, async (c) => {
      const pid = uuidOr400(id); await project(c, pid);
      const head = await lockHead(c, pid, path);
      if (!head.exists) throw new NotFoundException('berkas tidak ditemukan di ruang kerja');
      if (head.revisionId !== baseRevision) {
        throw new ProblemException(409, 'conflict', 'Berkas sudah diubah penyunting lain', `"${path}" diubah setelah Anda membukanya — tinjau isi terbarunya sebelum menghapus.`,
          { currentRevision: head.revisionId, baseRevision, merge: { status: 'modified', conflicts: 0, theirs: { revisionId: head.revisionId, content: head.content, editedAt: head.editedAt } } });
      }
      const r = (await c.query(`INSERT INTO gse.file_revision (project_id, path, op, parent_id) VALUES ($1,$2,'delete',$3) RETURNING id`, [pid, path, head.revisionId])).rows[0];
      return { path, revisionId: Number(r.id), deleted: true };
    });
  }

  /** Commit perubahan yang belum di-commit ke cabang fitur yang sudah di-push. */
  @Post('projects/:id/workspace/commit') @HttpCode(201) @RequirePermission('gse.project.run')
  async commit(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: CommitDto) {
    const pid = uuidOr400(id);
    const snap = await this.db.tx(p, async (c) => {
      const proj = await project(c, pid);
      if (proj.status === 'blocked') throw new ProblemException(422, 'invalid-state', 'Proyek diblokir AF-06');
      const ws = await loadWorkspace(c, pid);
      return { proj, ws, gates: workspaceGates(ws.live) };
    });
    const { ws, gates } = snap;
    if (!ws.baseline) throw new ProblemException(409, 'invalid-state', 'Cabang belum di-push', 'Push pertama (POST …/git/push) membuat cabang fitur + PR dari isi ruang kerja; commit lanjutan setelahnya.');
    if (PROTECTED.includes(ws.baseline.ref.toLowerCase())) throw new ProblemException(422, 'validation-failed', 'Cabang dilindungi', 'Commit langsung ke cabang utama dilarang (D-02).');
    if (!ws.changes.length) throw new ProblemException(409, 'invalid-state', 'Tidak ada perubahan', 'Ruang kerja sama dengan commit terakhir.');
    const failed = gatesFailed(gates);
    if (failed.length) throw new ProblemException(422, 'validation-failed', 'Gerbang lokal gagal', `Perbaiki dulu: ${failed.join(', ')}.`, { gates });
    const message = b.message?.trim() || `chore(gse): ubah ${ws.changes.length} berkas lewat editor EAP`;
    const { commitSha } = await providerFor(ws.baseline.provider).commitToBranch(ws.baseline.repoPath, ws.baseline.ref, message, ws.changes);
    return this.db.tx(p, async (c) => {
      const r = (await c.query(
        `INSERT INTO gse.workspace_commit (project_id, kind, provider, repo_path, ref, commit_sha, message, revision_upto, files, gates)
         VALUES ($1,'commit',$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING id, created_at`,
        [pid, ws.baseline!.provider, ws.baseline!.repoPath, ws.baseline!.ref, commitSha, message, ws.maxRevision,
          JSON.stringify(ws.changes.map(({ path, action }) => ({ path, action }))), JSON.stringify(gates)])).rows[0];
      return { id: Number(r.id), commitSha, branch: ws.baseline!.ref, provider: ws.baseline!.provider, files: ws.changes.map(({ path, action }) => ({ path, action })), createdAt: r.created_at };
    });
  }

  @Get('projects/:id/workspace/commits') @RequirePermission('gse.project.read')
  commits(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const pid = uuidOr400(id); await project(c, pid);
      return { data: (await c.query(`SELECT id, kind, provider, ref, commit_sha, message, revision_upto, files, author, created_at FROM gse.workspace_commit WHERE project_id = $1 ORDER BY id DESC LIMIT 50`, [pid])).rows
        .map((r) => ({ id: Number(r.id), kind: r.kind, provider: r.provider, branch: r.ref, commitSha: r.commit_sha, message: r.message, revisionUpto: Number(r.revision_upto), files: r.files, author: r.author, createdAt: r.created_at })) };
    });
  }
}

async function project(c: any, pid: string) {
  const proj = (await c.query('SELECT id, status, branch, base_branch FROM gse.project WHERE id = $1 AND deleted_at IS NULL', [pid])).rows[0];
  if (!proj) throw new NotFoundException('proyek tidak ditemukan');
  return proj;
}
interface Head { revisionId: number | null; exists: boolean; count: number; content: string | null; editedAt: string | null }
/** Kunci (proyek, path) sampai akhir transaksi, lalu baca revisi terakhir + keberadaan + isi berkas. */
async function lockHead(c: any, pid: string, path: string): Promise<Head> {
  await c.query(`SELECT pg_advisory_xact_lock(hashtextextended('gse-ws:' || $1 || ':' || $2, 0))`, [pid, path]);
  const r = (await c.query('SELECT revision_id, deleted, content, edited_at FROM gse.workspace_file WHERE project_id = $1 AND path = $2', [pid, path])).rows[0];
  const count = Number((await c.query('SELECT count(*) AS n FROM gse.workspace_file WHERE project_id = $1 AND NOT deleted', [pid])).rows[0].n);
  const exists = !!r && !r.deleted;
  return { revisionId: r?.revision_id == null ? null : Number(r.revision_id), exists, count, content: exists ? r.content : null, editedAt: r?.edited_at ?? null };
}

/**
 * 409 dengan USULAN penggabungan 3-arah (dasar = isi pada baseRevision, milik saya = isi yang dikirim, terbaru = kepala). Tidak ada yang disimpan:
 * pengguna meninjau usulan lalu menyimpan ulang dengan baseRevision = currentRevision (+ merged/mergeBase). status:
 *   clean       — tergabung tanpa konflik (content = hasil)
 *   conflict    — ada blok bertanda <<<<<<< / ||||||| / ======= / >>>>>>> (content = hasil bertanda; tidak dapat di-commit sebelum diselesaikan)
 *   deleted     — berkas dihapus penyunting lain (pilih: pulihkan versi Anda atau terima penghapusan)
 *   unavailable — dasar tidak dapat dibaca / berkas terlalu besar-berbeda untuk digabung otomatis (tinjau manual)
 */
async function mergeConflict(c: any, pid: string, path: string, baseRevision: number | null, mine: string, head: Head): Promise<ProblemException> {
  const theirs = { revisionId: head.revisionId, content: head.content, editedAt: head.editedAt };
  const extra = (merge: Record<string, unknown>) => new ProblemException(409, 'conflict', 'Berkas sudah diubah penyunting lain',
    `"${path}" diubah setelah Anda membukanya (revisi dasar ${baseRevision ?? 'asli'}, terbaru ${head.revisionId ?? 'asli'}). Tinjau usulan penggabungan lalu simpan ulang.`,
    { currentRevision: head.revisionId, baseRevision, merge: { conflicts: 0, ...merge, theirs } });
  if (!head.exists) return extra({ status: 'deleted' });
  let base: string | null;
  if (baseRevision == null) {
    base = (await c.query('SELECT content FROM gse.project_file WHERE project_id = $1 AND path = $2', [pid, path])).rows[0]?.content ?? '';
  } else {
    const r = (await c.query('SELECT project_id, path, op, content FROM gse.file_revision WHERE id = $1', [baseRevision])).rows[0];
    base = r && r.project_id === pid && r.path === path ? (r.op === 'put' ? r.content : '') : null;
  }
  if (base == null) return extra({ status: 'unavailable', reason: 'revisi dasar bukan milik berkas ini' });
  const m: MergeResult | null = merge3(base, mine, head.content as string, { base: `(rev ${baseRevision ?? 'asli'})`, theirs: `(rev ${head.revisionId ?? 'asli'})` });
  if (!m) return extra({ status: 'unavailable', reason: 'berkas terlalu besar/berbeda untuk digabung otomatis' });
  return extra({ status: m.clean ? 'clean' : 'conflict', content: m.content, conflicts: m.conflicts });
}
