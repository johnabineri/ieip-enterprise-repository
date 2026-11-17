import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ProblemException as _PE } from '../common/problem';
import { configuredProvider, requireProvider } from '../gse/git-provider';
import { adrFilePath, adrMarkdown, AdrDoc, sha256 as adrSha } from './adr-markdown';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { FastifyReply as Response } from 'fastify';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, etagOf, pageLimit, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

// ============================ struktur organisasi (view atas replika CMP) ============================
class EntityMetadataDto {
  @IsOptional() @IsIn(['holding', 'ecosystem', 'sbu', 'unit']) kafLevel?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) ikaLevel?: number;
  @IsOptional() @IsUUID() referenceId?: string;
  @IsOptional() @IsString() notes?: string;
}

/**
 * Struktur organisasi = VIEW eaw.entity_org atas ref.business_groups (CDC dari CMP, ADR-CMP-003). CMP = SSOT: nama/hierarki
 * diubah di SEDDI. Di sini hanya atribut arsitektur milik EAP (tingkat KAF, IKA, tautan KRA) yang dapat diubah.
 */
@Controller('api/v1/eaw/entity-org')
export class EntityOrgController {
  constructor(private readonly db: DbService) {}

  @Get() @RequirePermission('eaw.org.read')
  list(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const rows = (await c.query(
        `SELECT id, code, name, group_kind, parent_id, is_active, kaf_level, kaf_level_confirmed, ika_level, reference_id, notes
           FROM eaw.entity_org ORDER BY code`)).rows;
      return { data: rows.map(orgDto) };
    });
  }

  @Get(':id') @RequirePermission('eaw.org.read')
  async get(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.db.tx(p, async (c) => (await c.query(
      `SELECT id, code, name, group_kind, parent_id, is_active, kaf_level, kaf_level_confirmed, ika_level, reference_id, notes FROM eaw.entity_org WHERE id = $1`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('entitas tidak ditemukan');
    return orgDto(r);
  }

  /** Mengatur atribut arsitektur entitas (upsert). Hanya peran holding-wide (RLS: eap_edit_all) + izin eaw.org.write. */
  @Put(':id/metadata') @RequirePermission('eaw.org.write')
  put(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: EntityMetadataDto) {
    return this.db.tx(p, async (c) => {
      if (!(await c.query('SELECT 1 FROM ref.business_groups WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('entitas tidak ditemukan');
      const cur = (await c.query('SELECT id FROM eaw.entity_org_metadata WHERE entity_id = $1 AND deleted_at IS NULL', [id])).rows[0];
      if (cur) {
        await c.query(`UPDATE eaw.entity_org_metadata SET kaf_level = COALESCE($2, kaf_level), ika_level = COALESCE($3, ika_level),
                         reference_id = COALESCE($4, reference_id), notes = COALESCE($5, notes) WHERE id = $1`,
          [cur.id, b.kafLevel ?? null, b.ikaLevel ?? null, b.referenceId ?? null, b.notes ?? null]);
      } else {
        await c.query('INSERT INTO eaw.entity_org_metadata (entity_id, kaf_level, ika_level, reference_id, notes) VALUES ($1,$2,$3,$4,$5)',
          [id, b.kafLevel ?? null, b.ikaLevel ?? null, b.referenceId ?? null, b.notes ?? null]);
      }
      return orgDto((await c.query(
        `SELECT id, code, name, group_kind, parent_id, is_active, kaf_level, kaf_level_confirmed, ika_level, reference_id, notes FROM eaw.entity_org WHERE id = $1`, [id])).rows[0]);
    });
  }
}
const orgDto = (r: any) => ({ id: r.id, code: r.code, name: r.name, groupKind: r.group_kind, parentId: r.parent_id, isActive: r.is_active,
  kafLevel: r.kaf_level, kafLevelConfirmed: r.kaf_level_confirmed, ikaLevel: r.ika_level, referenceId: r.reference_id, notes: r.notes });

// ============================ KRA (referensi arsitektur korporat) ============================
class CreateReferenceDto {
  @IsIn(['proses_bisnis', 'layanan', 'data', 'aplikasi', 'infrastruktur', 'keamanan']) domain: string;
  @Matches(/^[A-Z0-9][A-Z0-9_.-]*$/) @MaxLength(50) kode: string;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsOptional() @IsString() @MaxLength(20) versi?: string;
  @IsOptional() @IsString() deskripsi?: string;
}
class PatchReferenceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsString() @MaxLength(20) versi?: string;
  @IsOptional() @IsString() deskripsi?: string;
}
const REF = 'id, domain, kode, nama, versi, deskripsi, status, created_by, created_at, row_version';
const refDto = (r: any) => ({ id: r.id, domain: r.domain, kode: r.kode, nama: r.nama, versi: r.versi, deskripsi: r.deskripsi, status: r.status, createdBy: r.created_by, createdAt: r.created_at, version: r.row_version });

/** KRA (EAW-06): hanya Holding EA Office yang menyusun (RLS eap_edit_all); semua pengguna membaca yang Dipublikasi. */
@Controller('api/v1/eaw/references')
export class ReferencesController {
  constructor(private readonly db: DbService) {}

  @Get() @RequirePermission('eaw.reference.read')
  list(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    return this.db.tx(p, async (c) => {
      const w = ['deleted_at IS NULL']; const a: unknown[] = [];
      if (q.domain) { a.push(q.domain); w.push(`domain = $${a.length}`); }
      if (q.status) { a.push(q.status); w.push(`status = $${a.length}`); }
      return { data: (await c.query(`SELECT ${REF} FROM eaw.reference WHERE ${w.join(' AND ')} ORDER BY kode`, a)).rows.map(refDto) };
    });
  }

  @Get(':id') @RequirePermission('eaw.reference.read')
  async get(@CurrentUser() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(`SELECT ${REF} FROM eaw.reference WHERE id = $1 AND deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('referensi tidak ditemukan atau di luar cakupan akses');
    res.header('ETag', etagOf(r.row_version));
    return refDto(r);
  }

  @Post() @HttpCode(201) @RequirePermission('eaw.reference.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateReferenceDto) {
    return this.db.tx(p, async (c) => refDto((await c.query(
      `INSERT INTO eaw.reference (domain, kode, nama, versi, deskripsi) VALUES ($1,$2,$3,COALESCE($4,'1.0'),$5) RETURNING ${REF}`,
      [b.domain, b.kode, b.nama, b.versi ?? null, b.deskripsi ?? null])).rows[0]));
  }

  @Patch(':id') @RequirePermission('eaw.reference.write')
  patch(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PatchReferenceDto) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM eaw.reference WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('referensi tidak ditemukan atau di luar cakupan akses');
      assertVersion(v, cur.row_version);
      if (b.nama === undefined && b.versi === undefined && b.deskripsi === undefined) throw new ProblemException(422, 'validation-failed', 'Tidak ada perubahan');
      await c.query(`SELECT set_config('eaw.af07_marked', '', true)`);                  // bersihkan sisa kaskade sebelumnya dalam transaksi ini
      const row = (await c.query(
        `UPDATE eaw.reference SET nama = COALESCE($2, nama), versi = COALESCE($3, versi), deskripsi = COALESCE($4, deskripsi) WHERE id = $1 RETURNING ${REF}`,
        [id, b.nama ?? null, b.versi ?? null, b.deskripsi ?? null])).rows[0];
      // AF-07: trigger DB menandai objek tertaut yang Dipublikasi menjadi Direviu bila versi berubah; ringkasannya dikembalikan agar pengguna tahu dampaknya
      const marked = (await c.query(`SELECT NULLIF(current_setting('eaw.af07_marked', true), '') AS m`)).rows[0].m;
      return { ...refDto(row), ...(marked ? { reviewCascade: JSON.parse(marked) } : {}) };
    });
  }

  /** Pratinjau AF-07: berapa objek tertaut per jenis/status; yang Dipublikasi akan masuk Direviu bila versi KRA dinaikkan. Hanya peran lintas-holding (diperiksa DB). */
  @Get(':id/impact') @RequirePermission('eaw.reference.read')
  async impact(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const kra = (await c.query('SELECT id, kode, versi, status FROM eaw.reference WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0];
      if (!kra) throw new NotFoundException('referensi tidak ditemukan atau di luar cakupan akses');
      const rows = (await c.query('SELECT objek_type, status, jumlah FROM eaw.kra_impact($1)', [id])).rows;
      const byType: Record<string, Record<string, number>> = {};
      for (const r of rows) (byType[r.objek_type] ??= {})[r.status] = r.jumlah;
      const total = rows.reduce((a: number, r: any) => a + r.jumlah, 0);
      const willReview = rows.filter((r: any) => r.status === 'Dipublikasi').reduce((a: number, r: any) => a + r.jumlah, 0);
      return { kra: { id: kra.id, kode: kra.kode, versi: kra.versi, status: kra.status }, total, willReview, unaffectedStatus: total - willReview, byType,
        catatan: 'Hanya objek berstatus Dipublikasi yang masuk Direviu (alur AF-05); status lain tidak berubah.' };
    });
  }

  @Delete(':id') @HttpCode(204) @RequirePermission('eaw.reference.write')
  remove(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const r = await c.query(`UPDATE eaw.reference SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL AND status = 'Draf'`, [uuidOr400(id)]);
      if (!r.rowCount) throw new ProblemException(409, 'invalid-state', 'Hanya KRA berstatus Draf yang dapat dihapus');
    });
  }
}

// ============================ ADR ============================
class CreateAdrDto {
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/) @MaxLength(20) adrCode: string;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsString() @MinLength(3) context: string;
  @IsString() @MinLength(3) decision: string;
  @IsOptional() @IsString() consequences?: string;
  @IsOptional() @IsString() @MaxLength(255) gitRef?: string;
}
class PatchAdrDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(3) context?: string;
  @IsOptional() @IsString() @MinLength(3) decision?: string;
  @IsOptional() @IsString() consequences?: string;
  @IsOptional() @IsString() @MaxLength(255) gitRef?: string;
}
class AdrStatusDto {
  @IsIn(['Accepted', 'Deprecated', 'Superseded']) status: string;
  @IsOptional() @IsUUID() supersededBy?: string;
}
class AdrLinkDto {
  @IsIn(['application', 'reference', 'framework', 'process', 'data_entity', 'service', 'infra_asset', 'control']) objekType: string;
  @IsUUID() objekId: string;
}
const ADR = 'id, adr_code, title, context, decision, consequences, status, superseded_by, git_ref, created_by, created_at, row_version';
const adrDto = (r: any) => ({ id: r.id, adrCode: r.adr_code, title: r.title, context: r.context, decision: r.decision, consequences: r.consequences, status: r.status,
  supersededBy: r.superseded_by, gitRef: r.git_ref, createdBy: r.created_by, createdAt: r.created_at, version: r.row_version });


class PublishAdrDto { @IsOptional() @IsString() @MaxLength(200) commitMessage?: string }
const adrDir = () => { const d = (process.env.ADR_GIT_DIR || 'docs/adr').replace(/^\/+|\/+$/g, ''); if (!/^[\w./-]+$/.test(d) || d.includes('..')) throw new _PE(500, 'internal', 'ADR_GIT_DIR tidak sah'); return d; };
const gitDto = (r: any) => ({ id: r.id, adrId: r.adr_id, adrCode: r.adr_code, adrStatus: r.adr_status, provider: r.provider, repoPath: r.repo_path, branch: r.ref, baseBranch: r.base_branch,
  filePath: r.file_path, contentSha256: r.content_sha256, commitSha: r.commit_sha, prNumber: r.pr_number, prUrl: r.pr_url, createdBy: r.created_by, createdAt: r.created_at });
/** Memuat ADR + tautan model yang TERLIHAT pemanggil + kode ADR pengganti + publikasi Git terakhir. */
async function loadDoc(c: any, id: string): Promise<{ doc: AdrDoc; last: any }> {
  const a = (await c.query(`SELECT a.*, s.adr_code AS superseded_code FROM eaw.adr a LEFT JOIN eaw.adr s ON s.id = a.superseded_by WHERE a.id = $1 AND a.deleted_at IS NULL`, [id])).rows[0];
  if (!a) throw new NotFoundException('ADR tidak ditemukan');
  const links = (await c.query(`SELECT objek_type AS type, CASE objek_type WHEN 'reference' THEN (SELECT r.kode || ' · ' || r.nama FROM eaw.reference r WHERE r.id = objek_id AND r.deleted_at IS NULL) ELSE eaw.object_label(objek_type, objek_id) END AS label
    FROM eaw.adr_link WHERE adr_id = $1 AND deleted_at IS NULL`, [id])).rows.filter((l: any) => l.label);
  const last = (await c.query('SELECT * FROM eaw.adr_git WHERE adr_id = $1 ORDER BY created_at DESC, id LIMIT 1', [id])).rows[0] ?? null;
  return { doc: { code: a.adr_code, title: a.title, status: a.status, context: a.context, decision: a.decision, consequences: a.consequences, createdAt: a.created_at, supersededByCode: a.superseded_code, links }, last };
}

/** ADR (EAW-04): status hanya oleh pemegang eaw.baseline.approve (keputusan ARB); isi terkunci setelah Proposed (trigger DB). */
@Controller('api/v1/eaw/adrs')
export class AdrsController {
  constructor(private readonly db: DbService) {}

  @Get() @RequirePermission('eaw.adr.read')
  list(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit, 200, 100);
    return this.db.tx(p, async (c) => {
      const w = ['deleted_at IS NULL']; const a: unknown[] = [];
      if (q.status) { a.push(q.status); w.push(`status = $${a.length}`); }
      a.push(limit);
      return { data: (await c.query(`SELECT ${ADR} FROM eaw.adr WHERE ${w.join(' AND ')} ORDER BY adr_code LIMIT $${a.length}`, a)).rows.map(adrDto) };
    });
  }

  @Get(':idOrCode') @RequirePermission('eaw.adr.read')
  async get(@CurrentUser() p: Principal, @Param('idOrCode') k: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(
      `SELECT ${ADR} FROM eaw.adr WHERE deleted_at IS NULL AND (${/^[0-9a-f-]{36}$/i.test(k) ? 'id = $1::uuid' : 'adr_code = $1'})`, [k])).rows[0]);
    if (!r) throw new NotFoundException('ADR tidak ditemukan');
    res.header('ETag', etagOf(r.row_version));
    return adrDto(r);
  }

  @Post() @HttpCode(201) @RequirePermission('eaw.adr.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateAdrDto) {
    return this.db.tx(p, async (c) => adrDto((await c.query(
      `INSERT INTO eaw.adr (adr_code, title, context, decision, consequences, git_ref) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${ADR}`,
      [b.adrCode, b.title, b.context, b.decision, b.consequences ?? null, b.gitRef ?? null])).rows[0]));
  }

  @Patch(':id') @RequirePermission('eaw.adr.write')
  patch(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PatchAdrDto) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM eaw.adr WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('ADR tidak ditemukan');
      assertVersion(v, cur.row_version);
      return adrDto((await c.query(
        `UPDATE eaw.adr SET title = COALESCE($2, title), context = COALESCE($3, context), decision = COALESCE($4, decision),
                consequences = COALESCE($5, consequences), git_ref = COALESCE($6, git_ref) WHERE id = $1 RETURNING ${ADR}`,
        [id, b.title ?? null, b.context ?? null, b.decision ?? null, b.consequences ?? null, b.gitRef ?? null])).rows[0]);
    });
  }

  /** Keputusan ARB atas ADR (Accepted/Deprecated/Superseded). Dijaga trigger DB: izin eaw.baseline.approve. */
  @Post(':id/status') @HttpCode(200) @RequirePermission('eaw.adr.read')
  status(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: AdrStatusDto) {
    return this.db.tx(p, async (c) => {
      const r = await c.query(`UPDATE eaw.adr SET status = $2, superseded_by = $3 WHERE id = $1 AND deleted_at IS NULL RETURNING ${ADR}`, [uuidOr400(id), b.status, b.supersededBy ?? null]);
      if (!r.rowCount) throw new NotFoundException('ADR tidak ditemukan');
      return adrDto(r.rows[0]);
    });
  }


  // ---------------- ADR -> Git (EAW-04): berkas Markdown di repositori lewat branch + PR/MR ----------------
  /** Konfigurasi repositori ADR (env). Token penyedia Git tidak pernah dikembalikan. */
  @Get('git/status') @RequirePermission('eaw.adr.read')
  gitStatus() {
    const pv = configuredProvider();
    return { configured: !!(pv && process.env.ADR_GIT_REPO), provider: pv?.name ?? null, repo: process.env.ADR_GIT_REPO ?? null, dir: adrDir(), baseBranch: process.env.ADR_GIT_BASE ?? null };
  }

  /** Pratinjau berkas Markdown yang akan di-commit (deterministik; sha256 stabil). */
  @Get(':id/markdown') @RequirePermission('eaw.adr.read')
  async markdown(@CurrentUser() p: Principal, @Param('id') id: string) {
    const { doc } = await this.db.tx(p, async (c) => loadDoc(c, uuidOr400(id)));
    const content = adrMarkdown(doc);
    return { path: adrFilePath(adrDir(), doc.code), sha256: adrSha(content), content };
  }

  @Get(':id/git') @RequirePermission('eaw.adr.read')
  async gitHistory(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const pid = uuidOr400(id);
      if (!(await c.query('SELECT 1 FROM eaw.adr WHERE id = $1 AND deleted_at IS NULL', [pid])).rowCount) throw new NotFoundException('ADR tidak ditemukan');
      return { configured: !!(configuredProvider() && process.env.ADR_GIT_REPO), data: (await c.query('SELECT * FROM eaw.adr_git WHERE adr_id = $1 ORDER BY created_at DESC, id', [pid])).rows.map(gitDto) };
    });
  }

  /**
   * Menerbitkan ADR ke Git: render Markdown -> branch baru adr/<kode>-<status>-<sha8> -> commit satu berkas -> PR/MR ke cabang dasar. Tidak pernah push/merge ke
   * cabang utama. Isi sama dengan publikasi terakhir -> 409. Berkas sudah ada di cabang dasar -> diperbarui (update), bukan dibuat. HTTP di luar transaksi DB.
   */
  @Post(':id/git') @HttpCode(201) @RequirePermission('eaw.adr.write')
  async publishGit(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: PublishAdrDto) {
    const prov = requireProvider(); const repoEnv = process.env.ADR_GIT_REPO;
    if (!repoEnv) throw new _PE(503, 'service-unavailable', 'Repositori ADR belum dikonfigurasi', 'Atur ADR_GIT_REPO (mis. pemilik/repo atau grup/proyek) pada API.');
    const pid = uuidOr400(id);
    const { doc, last } = await this.db.tx(p, async (c) => loadDoc(c, pid));
    const content = adrMarkdown(doc); const sha = adrSha(content);
    if (last && last.content_sha256 === sha) throw new _PE(409, 'conflict', 'Tidak ada perubahan sejak publikasi terakhir', `Isi ADR identik dengan PR #${last.pr_number} (${last.pr_url}).`);
    const path = prov.repoPath(repoEnv);
    const base = process.env.ADR_GIT_BASE || await prov.defaultBranch(path);
    if (!base) throw new _PE(422, 'validation-failed', 'Cabang dasar tidak diketahui', 'Set ADR_GIT_BASE atau pastikan repo punya default branch.');
    const file = adrFilePath(adrDir(), doc.code);
    const exists = await prov.fileExists(path, file, base);
    const branch = `adr/${doc.code.toLowerCase()}-${doc.status.toLowerCase()}-${sha.slice(0, 8)}`;
    const message = b.commitMessage?.trim() || `docs(adr): ${doc.code} ${exists ? 'perbarui' : 'tambah'} — ${doc.title}`.slice(0, 200);
    const { commitSha } = await prov.pushBranch(path, branch, base, message, [{ path: file, content, update: exists }]);
    let pr: { number: number; url: string };
    try {
      pr = await prov.openReview(path, branch, base, `ADR ${doc.code}: ${doc.title}`.slice(0, 200),
        `Publikasi otomatis ADR dari SAORAJA EAP (EAW-04).\n\n- Kode: ${doc.code}\n- Status: ${doc.status}\n- Berkas: \`${file}\` (${exists ? 'diperbarui' : 'baru'})\n- sha256 isi: \`${sha}\`\n\nReviu manusia diperlukan sebelum merge; tidak ada push langsung ke ${base}.`);
    } catch (e) { await prov.deleteBranch(path, branch).catch(() => undefined); throw e; }
    return this.db.tx(p, async (c) => {
      const r = (await c.query(`INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [pid, doc.code, doc.status, prov.name, path, branch, base, file, sha, commitSha, pr.number, pr.url])).rows[0];
      await c.query('UPDATE eaw.adr SET git_ref = $2 WHERE id = $1', [pid, `${path}:${file} @ ${commitSha.slice(0, 10)} (${prov.name === 'github' ? 'PR' : 'MR'} #${pr.number})`.slice(0, 255)]);
      return gitDto(r);
    });
  }

  @Post(':id/links') @HttpCode(201) @RequirePermission('eaw.adr.write')
  link(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: AdrLinkDto) {
    return this.db.tx(p, async (c) => (await c.query(
      `INSERT INTO eaw.adr_link (adr_id, objek_type, objek_id) VALUES ($1,$2,$3) RETURNING id, adr_id, objek_type, objek_id`, [uuidOr400(id), b.objekType, b.objekId])).rows[0]);
  }

  @Get(':id/links') @RequirePermission('eaw.adr.read')
  links(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => ({ data: (await c.query(
      `SELECT id, adr_id, objek_type, objek_id FROM eaw.adr_link WHERE adr_id = $1 AND deleted_at IS NULL ORDER BY objek_type, id`, [uuidOr400(id)])).rows }));
  }
}
