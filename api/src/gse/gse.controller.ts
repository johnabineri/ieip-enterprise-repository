import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, etagOf, pageLimit, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { renderFiles, runGates, tar, toYaml, varsFor, TplFile } from './scaffold';

class ScaffoldDto {
  @IsUUID() applicationId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsUUID(undefined, { each: true }) templateIds: string[];
  @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9._/-]{2,80}$/) branch?: string;
}
class TemplateDto {
  @Matches(/^[a-z0-9][a-z0-9-]*$/) @MaxLength(50) kode: string;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsIn(['shell', 'frontend', 'backend', 'ddl', 'ci']) kategori: string;
  @IsOptional() @IsString() @MaxLength(300) stack?: string;
  @IsOptional() @Matches(/^\d+\.\d+\.\d+$/) versi?: string;
  @IsOptional() @IsString() deskripsi?: string;
  @IsArray() files: Array<{ path: string; content: string }>;
}
class PatchTemplateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsString() @MaxLength(300) stack?: string;
  @IsOptional() @Matches(/^\d+\.\d+\.\d+$/) versi?: string;
  @IsOptional() @IsString() deskripsi?: string;
  @IsOptional() @IsArray() files?: Array<{ path: string; content: string }>;
}
class FlowDto {
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsIn(['saga', 'agent']) kind: string;
  @IsObject() spec: Record<string, unknown>;
}
class PatchFlowDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsObject() spec?: Record<string, unknown>;
}

function checkFiles(files: Array<{ path: string; content: string }>) {
  for (const f of files) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string' || !f.path || f.path.length > 300 || f.path.includes('..') || f.path.startsWith('/'))
      throw new ProblemException(400, 'bad-request', 'files harus berupa [{path, content}] dengan path relatif yang sah');
  }
  if (new Set(files.map((f) => f.path)).size !== files.length) throw new ProblemException(400, 'bad-request', 'path berkas ganda dalam template');
}
const tplDto = (r: any, withFiles = false) => ({ id: r.id, kode: r.kode, nama: r.nama, kategori: r.kategori, stack: r.stack, versi: r.versi, deskripsi: r.deskripsi,
  fileCount: Array.isArray(r.files) ? r.files.length : 0, ...(withFiles ? { files: r.files } : {}), createdAt: r.created_at, version: r.row_version });
const projDto = (r: any) => ({ id: r.id, applicationId: r.application_id, kode: r.kode, templateIds: r.template_ids, backend: r.backend, repoGit: r.repo_git, branch: r.branch,
  baseBranch: r.base_branch, status: r.status, reason: r.reason, gates: r.gates, fileCount: r.file_count, bytes: r.bytes, durationMs: r.duration_ms, prompt: r.prompt, createdBy: r.created_by, createdAt: r.created_at });
const flowDto = (r: any) => ({ id: r.id, nama: r.nama, kind: r.kind, spec: r.spec, status: r.status, valid: r.valid, problems: r.problems, createdAt: r.created_at, version: r.row_version });

/**
 * GSE (GSE-01..03). Gerbang AF-06 ditegakkan di DB (gse.app_gate + trigger). Scaffolding deterministik: templat {{variabel}} dirender
 * lokal; hasilnya disimpan sebagai berkas proyek + bundel tar yang dapat di-commit ke feature branch (0 push ke main, CHECK DB).
 * Belum ada konektor Git/CI: PR tidak dibuat otomatis; lint/build/SCA/SBOM dicatat 'skipped'. Prompt AI (D-04) disimpan tetapi TIDAK diproses.
 */
@Controller('api/v1/gse')
export class GseController {
  constructor(private readonly db: DbService) {}

  @Get('summary') @RequirePermission('gse.project.read')
  summary(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const s = (await c.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'generated')::int AS generated, count(*) FILTER (WHERE status = 'checks-failed')::int AS failed,
        count(*) FILTER (WHERE status = 'blocked')::int AS blocked, COALESCE(round(avg(duration_ms) FILTER (WHERE status <> 'blocked'))::int, 0) AS avg_ms,
        COALESCE(max(duration_ms), 0)::int AS max_ms FROM gse.project WHERE deleted_at IS NULL`)).rows[0];
      const t = (await c.query('SELECT count(*)::int AS n FROM gse.template WHERE deleted_at IS NULL')).rows[0].n;
      const f = (await c.query('SELECT count(*)::int AS n, count(*) FILTER (WHERE valid)::int AS valid, count(*) FILTER (WHERE status = \'committed\')::int AS committed FROM gse.flow WHERE deleted_at IS NULL')).rows[0];
      return { projects: { total: s.total, generated: s.generated, checksFailed: s.failed, blocked: s.blocked, avgDurationMs: s.avg_ms, maxDurationMs: s.max_ms }, templates: t, flows: { total: f.n, valid: f.valid, committed: f.committed }, targetMs: 45000 };
    });
  }

  /** Katalog aplikasi untuk pemilih (definer minimal): ok = lolos gerbang AF-06. */
  @Get('apps') @RequirePermission('gse.project.read')
  apps(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM gse.app_catalog()')).rows.map((r: any) => ({
      id: r.id, kode: r.kode, nama: r.nama, status: r.status, eligible: r.ok, jenisNode: r.jenis_node, platform: r.platform, workspaceMode: r.workspace_mode, entityCode: r.entity_code })) }));
  }

  // ---------------- template ----------------
  @Get('templates') @RequirePermission('gse.project.read')
  templates(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM gse.template WHERE deleted_at IS NULL ORDER BY kategori, kode')).rows.map((r) => tplDto(r)) }));
  }
  @Get('templates/:id') @RequirePermission('gse.project.read')
  async template(@CurrentUser() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM gse.template WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('template tidak ditemukan');
    res.setHeader('ETag', etagOf(r.row_version));
    return tplDto(r, true);
  }
  @Post('templates') @HttpCode(201) @RequirePermission('gse.project.run')
  createTemplate(@CurrentUser() p: Principal, @Body() b: TemplateDto) {
    checkFiles(b.files);
    return this.db.tx(p, async (c) => tplDto((await c.query(
      `INSERT INTO gse.template (kode, nama, kategori, stack, versi, deskripsi, files) VALUES ($1,$2,$3,$4,COALESCE($5,'1.0.0'),$6,$7::jsonb) RETURNING *`,
      [b.kode, b.nama, b.kategori, b.stack ?? null, b.versi ?? null, b.deskripsi ?? null, JSON.stringify(b.files)])).rows[0], true));
  }
  @Patch('templates/:id') @RequirePermission('gse.project.run')
  patchTemplate(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PatchTemplateDto) {
    const v = requireIfMatch(ifMatch); if (b.files) checkFiles(b.files);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM gse.template WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('template tidak ditemukan');
      assertVersion(v, cur.row_version);
      if (!Object.values(b).some((x) => x !== undefined)) throw new ProblemException(422, 'validation-failed', 'Tidak ada perubahan');
      return tplDto((await c.query(`UPDATE gse.template SET nama = COALESCE($2, nama), stack = COALESCE($3, stack), versi = COALESCE($4, versi), deskripsi = COALESCE($5, deskripsi),
        files = COALESCE($6::jsonb, files) WHERE id = $1 RETURNING *`, [id, b.nama ?? null, b.stack ?? null, b.versi ?? null, b.deskripsi ?? null, b.files ? JSON.stringify(b.files) : null])).rows[0], true);
    });
  }
  @Delete('templates/:id') @HttpCode(204) @RequirePermission('gse.project.run')
  removeTemplate(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE gse.template SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('template tidak ditemukan'); });
  }

  // ---------------- proyek scaffolding ----------------
  @Get('projects') @RequirePermission('gse.project.read')
  projects(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit);
    return this.db.tx(p, async (c) => {
      const w = ['deleted_at IS NULL']; const a: unknown[] = [];
      if (q.status) { a.push(q.status); w.push(`status = $${a.length}`); }
      if (q.applicationId) { a.push(uuidOr400(q.applicationId, 'applicationId')); w.push(`application_id = $${a.length}`); }
      a.push(limit);
      return { data: (await c.query(`SELECT * FROM gse.project WHERE ${w.join(' AND ')} ORDER BY created_at DESC, id LIMIT $${a.length}`, a)).rows.map(projDto) };
    });
  }
  @Get('projects/:id') @RequirePermission('gse.project.read')
  async project(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const r = (await c.query('SELECT * FROM gse.project WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0];
      if (!r) throw new NotFoundException('proyek tidak ditemukan');
      const files = (await c.query('SELECT path, bytes FROM gse.project_file WHERE project_id = $1 ORDER BY path', [id])).rows;
      return { ...projDto(r), files };
    });
  }
  @Get('projects/:id/file') @RequirePermission('gse.project.read')
  file(@CurrentUser() p: Principal, @Param('id') id: string, @Query('path') path: string) {
    if (!path) throw new ProblemException(400, 'bad-request', 'query path wajib');
    return this.db.tx(p, async (c) => {
      const r = (await c.query('SELECT path, content, bytes FROM gse.project_file WHERE project_id = $1 AND path = $2', [uuidOr400(id), path])).rows[0];
      if (!r) throw new NotFoundException('berkas tidak ditemukan');
      return r;
    });
  }
  /** Bundel tar berisi seluruh berkas hasil generate (untuk di-commit ke feature branch). */
  @Get('projects/:id/bundle') @RequirePermission('gse.project.read')
  async bundle(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const { proj, files } = await this.db.tx(p, async (c) => {
      const proj = (await c.query('SELECT kode, branch, status FROM gse.project WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0];
      if (!proj) throw new NotFoundException('proyek tidak ditemukan');
      return { proj, files: (await c.query('SELECT path, content FROM gse.project_file WHERE project_id = $1 ORDER BY path', [id])).rows as TplFile[] };
    });
    if (!files.length) throw new ProblemException(409, 'invalid-state', 'Proyek tanpa berkas (diblokir)');
    res.setHeader('Content-Type', 'application/x-tar');
    res.setHeader('Content-Disposition', `attachment; filename="${String(proj.kode).toLowerCase()}-scaffold.tar"`);
    res.send(tar(files));
  }

  /**
   * Meminta scaffolding (GSE-01). Aplikasi harus >= Divalidasi (AF-06): bila tidak, percobaan dicatat sebagai proyek 'blocked' dan dijawab 422.
   */
  @Post('projects') @HttpCode(201) @RequirePermission('gse.project.run')
  async scaffold(@CurrentUser() p: Principal, @Body() b: ScaffoldDto) {
    const t0 = Date.now();
    const gate = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM gse.app_gate($1)', [b.applicationId])).rows[0]);
    if (!gate || !gate.found) throw new ProblemException(422, 'af-06-blocked', 'Gerbang AF-06', gate?.reason ?? 'AF-06: aplikasi tidak terdaftar di katalog EAW');
    const branch = b.branch ?? `feat/gse-${String(gate.kode).toLowerCase()}-scaffold`;
    if (!gate.ok) {
      const id = await this.db.tx(p, async (c) => (await c.query(
        `INSERT INTO gse.project (application_id, kode, template_ids, branch, status, reason, repo_git, prompt) VALUES ($1,$2,$3,$4,'blocked',$5,$6,$7) RETURNING id`,
        [b.applicationId, gate.kode, b.templateIds, branch, gate.reason, gate.repo_git ?? null, b.prompt ?? null])).rows[0].id);
      throw new ProblemException(422, 'af-06-blocked', 'Gerbang AF-06', gate.reason, { projectId: id });
    }
    return this.db.tx(p, async (c) => {
      const tpls = (await c.query('SELECT id, kode, files FROM gse.template WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL', [b.templateIds])).rows;
      if (tpls.length !== new Set(b.templateIds).size) throw new ProblemException(422, 'validation-failed', 'Template tidak ditemukan', 'Satu atau lebih templateIds tidak ada / sudah dihapus');
      const vars = varsFor(gate);
      const files = renderFiles(tpls, vars);
      const gates = runGates(files);
      const failed = Object.values(gates).some((g) => g.status === 'err');
      const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
      const backend = tpls.some((t: any) => t.kode === 'tpl-nest-clean') ? 'nestjs' : tpls.some((t: any) => t.kode === 'tpl-go-fiber') ? 'gofiber' : 'none';
      const ins = await c.query(
        `INSERT INTO gse.project (application_id, kode, template_ids, backend, repo_git, branch, status, gates, file_count, bytes, duration_ms, prompt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12) RETURNING *`,
        [b.applicationId, gate.kode, b.templateIds, backend, vars.repo_git, branch, failed ? 'checks-failed' : 'generated', JSON.stringify(gates), files.length, bytes, Date.now() - t0, b.prompt ?? null]);
      await c.query('INSERT INTO gse.project_file (project_id, path, content, bytes) SELECT $1, * FROM unnest($2::text[], $3::text[], $4::int[])',
        [ins.rows[0].id, files.map((f) => f.path), files.map((f) => f.content), files.map((f) => Buffer.byteLength(f.content))]);
      return { ...projDto(ins.rows[0]), files: files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.content) })) };
    });
  }

  // ---------------- flow (Saga / Agent) ----------------
  @Get('flows') @RequirePermission('gse.project.read')
  flows(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM gse.flow WHERE deleted_at IS NULL ORDER BY nama')).rows.map(flowDto) }));
  }
  @Get('flows/:id') @RequirePermission('gse.project.read')
  async flow(@CurrentUser() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM gse.flow WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('flow tidak ditemukan');
    res.setHeader('ETag', etagOf(r.row_version));
    return flowDto(r);
  }
  @Get('flows/:id/yaml') @RequirePermission('gse.project.read')
  async yaml(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM gse.flow WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('flow tidak ditemukan');
    return { yaml: toYaml(r.kind, r.nama, r.spec), valid: r.valid, problems: r.problems };
  }
  @Post('flows') @HttpCode(201) @RequirePermission('gse.project.run')
  createFlow(@CurrentUser() p: Principal, @Body() b: FlowDto, @Res({ passthrough: true }) res: Response) {
    return this.db.tx(p, async (c) => {
      const r = (await c.query('INSERT INTO gse.flow (nama, kind, spec) VALUES ($1,$2,$3::jsonb) RETURNING *', [b.nama, b.kind, JSON.stringify(b.spec)])).rows[0];
      res.setHeader('ETag', etagOf(r.row_version));
      return flowDto(r);
    });
  }
  @Patch('flows/:id') @RequirePermission('gse.project.run')
  patchFlow(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PatchFlowDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version, status FROM gse.flow WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('flow tidak ditemukan');
      assertVersion(v, cur.row_version);
      if (b.nama === undefined && b.spec === undefined) throw new ProblemException(422, 'validation-failed', 'Tidak ada perubahan');
      // perubahan atas flow committed mengembalikannya ke draft (harus di-commit ulang setelah validasi)
      const r = (await c.query(`UPDATE gse.flow SET nama = COALESCE($2, nama), spec = COALESCE($3::jsonb, spec), status = 'draft' WHERE id = $1 RETURNING *`,
        [id, b.nama ?? null, b.spec ? JSON.stringify(b.spec) : null])).rows[0];
      res.setHeader('ETag', etagOf(r.row_version));
      return flowDto(r);
    });
  }
  /** Commit: hanya flow valid (kompensasi idempoten untuk tiap langkah pemutasi / otonomi <= L3 + fail-closed). */
  @Post('flows/:id/commit') @HttpCode(200) @RequirePermission('gse.project.run')
  commit(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      if (!(await c.query('SELECT 1 FROM gse.flow WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('flow tidak ditemukan');
      return flowDto((await c.query(`UPDATE gse.flow SET status = 'committed' WHERE id = $1 RETURNING *`, [id])).rows[0]);
    });
  }
  @Delete('flows/:id') @HttpCode(204) @RequirePermission('gse.project.run')
  removeFlow(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE gse.flow SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('flow tidak ditemukan'); });
  }
}
