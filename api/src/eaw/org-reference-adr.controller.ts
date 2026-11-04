import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Response } from 'express';
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
    res.setHeader('ETag', etagOf(r.row_version));
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
      return refDto((await c.query(
        `UPDATE eaw.reference SET nama = COALESCE($2, nama), versi = COALESCE($3, versi), deskripsi = COALESCE($4, deskripsi) WHERE id = $1 RETURNING ${REF}`,
        [id, b.nama ?? null, b.versi ?? null, b.deskripsi ?? null])).rows[0]);
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
    res.setHeader('ETag', etagOf(r.row_version));
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
