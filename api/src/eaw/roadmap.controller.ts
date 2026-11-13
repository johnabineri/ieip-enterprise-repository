import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Res } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, etagOf, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = ['direncanakan', 'berjalan', 'selesai', 'terhambat'] as const;
const OBJ_TYPES = ['application', 'process', 'data_entity', 'service', 'infra_asset', 'control', 'framework'];

class PhaseDto {
  @IsString() @MinLength(2) @MaxLength(120) nama: string;
  @IsOptional() @IsString() @MaxLength(2000) deskripsi?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) urutan?: number;
  @Matches(DATE, { message: 'mulai harus YYYY-MM-DD' }) mulai: string;
  @Matches(DATE, { message: 'selesai harus YYYY-MM-DD' }) selesai: string;
}
class PhasePatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nama?: string;
  @IsOptional() @IsString() @MaxLength(2000) deskripsi?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) urutan?: number;
  @IsOptional() @Matches(DATE) mulai?: string;
  @IsOptional() @Matches(DATE) selesai?: string;
}
class ItemDto {
  @IsUUID() phaseId: string;
  @IsIn(['deliverable', 'milestone']) jenis: string;
  @IsString() @MinLength(3) @MaxLength(300) judul: string;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
  @Matches(DATE, { message: 'target harus YYYY-MM-DD' }) target: string;
  @IsOptional() @IsIn(STATUS as unknown as string[]) status?: string;
  @IsOptional() @IsIn(OBJ_TYPES) objectType?: string;
  @IsOptional() @IsUUID() objectId?: string;
}
class ItemPatchDto {
  @IsOptional() @IsUUID() phaseId?: string;
  @IsOptional() @IsIn(['deliverable', 'milestone']) jenis?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) judul?: string;
  @IsOptional() @IsString() @MaxLength(2000) catatan?: string;
  @IsOptional() @Matches(DATE) target?: string;
  @IsOptional() @IsIn(STATUS as unknown as string[]) status?: string;
  @IsOptional() @IsIn(OBJ_TYPES) objectType?: string;
  @IsOptional() @IsUUID() objectId?: string;
}

const phaseDto = (r: any) => ({ id: r.id, nama: r.nama, deskripsi: r.deskripsi, urutan: r.urutan, mulai: r.mulai, selesai: r.selesai, version: r.row_version });
const itemDto = (r: any, today: string) => ({ id: r.id, phaseId: r.phase_id, jenis: r.jenis, judul: r.judul, catatan: r.catatan, target: r.target, status: r.status, selesaiPada: r.selesai_pada,
  terlambat: r.status !== 'selesai' && r.target < today, objectType: r.object_type, objectId: r.object_id, objectLabel: r.object_label ?? null, objectStatus: r.object_status ?? null, version: r.row_version });
const PHASE_SQL = 'SELECT id, nama, deskripsi, urutan, mulai::text AS mulai, selesai::text AS selesai, row_version FROM eaw.roadmap_phase';
const ITEM_SQL = `SELECT i.id, i.phase_id, i.jenis, i.judul, i.catatan, i.target::text AS target, i.status, i.selesai_pada::text AS selesai_pada, i.object_type, i.object_id, i.row_version,
  CASE WHEN i.object_id IS NULL THEN NULL ELSE eaw.object_label(i.object_type, i.object_id) END AS object_label,
  CASE WHEN i.object_id IS NULL THEN NULL ELSE eaw.object_status(i.object_type, i.object_id) END AS object_status FROM eaw.roadmap_item i`;

/**
 * Master IT Roadmap (FR-04.1): fase + deliverable/milestone bertanggal nyata (level grup). Dibaca semua pemegang eaw.catalog.read;
 * disusun hanya oleh pemegang eaw.roadmap.write (Holding EA Office). "Terlambat" dihitung (target < hari ini & belum selesai); bukti objek EAW opsional
 * menampilkan status objek saat ini tetapi TIDAK mengubah status butir otomatis (keputusan selesai tetap manusia).
 */
@Controller('api/v1/eaw/roadmap')
export class RoadmapController {
  constructor(private readonly db: DbService) {}

  @Get() @RequirePermission('eaw.catalog.read')
  get(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const today: string = (await c.query('SELECT current_date::text AS d')).rows[0].d;
      const phases = (await c.query(`${PHASE_SQL} WHERE deleted_at IS NULL ORDER BY mulai, urutan, nama`)).rows;
      const items = (await c.query(`${ITEM_SQL} WHERE i.deleted_at IS NULL ORDER BY i.target, i.judul`)).rows.map((r: any) => itemDto(r, today));
      const sum = { total: items.length, selesai: 0, berjalan: 0, terhambat: 0, direncanakan: 0, terlambat: 0, persenSelesai: 0 };
      for (const i of items) { (sum as any)[i.status]++; if (i.terlambat) sum.terlambat++; }
      sum.persenSelesai = sum.total ? Math.round((sum.selesai / sum.total) * 100) : 0;
      const current = phases.find((f: any) => f.mulai <= today && today <= f.selesai);
      return {
        today, summary: sum, currentPhaseId: current?.id ?? null,
        range: phases.length ? { mulai: phases[0].mulai, selesai: phases.reduce((m: string, f: any) => (f.selesai > m ? f.selesai : m), phases[0].selesai) } : null,
        phases: phases.map((f: any) => ({ ...phaseDto(f), items: items.filter((i: any) => i.phaseId === f.id) })),
      };
    });
  }

  @Post('phases') @HttpCode(201) @RequirePermission('eaw.roadmap.write')
  createPhase(@CurrentUser() p: Principal, @Body() b: PhaseDto) {
    return this.db.tx(p, async (c) => phaseDto((await c.query(
      `INSERT INTO eaw.roadmap_phase (nama, deskripsi, urutan, mulai, selesai) VALUES ($1,$2,COALESCE($3,0),$4::date,$5::date) RETURNING id, nama, deskripsi, urutan, mulai::text AS mulai, selesai::text AS selesai, row_version`,
      [b.nama.trim(), b.deskripsi ?? null, b.urutan ?? null, b.mulai, b.selesai])).rows[0]));
  }

  @Patch('phases/:id') @RequirePermission('eaw.roadmap.write')
  patchPhase(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PhasePatchDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM eaw.roadmap_phase WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('fase tidak ditemukan');
      assertVersion(v, cur.row_version);
      await c.query(`UPDATE eaw.roadmap_phase SET nama = COALESCE($2, nama), deskripsi = COALESCE($3, deskripsi), urutan = COALESCE($4, urutan), mulai = COALESCE($5::date, mulai), selesai = COALESCE($6::date, selesai) WHERE id = $1`,
        [id, b.nama?.trim() ?? null, b.deskripsi ?? null, b.urutan ?? null, b.mulai ?? null, b.selesai ?? null]);
      const r = (await c.query(`${PHASE_SQL} WHERE id = $1`, [id])).rows[0]; res.setHeader('ETag', etagOf(r.row_version)); return phaseDto(r);
    });
  }

  @Delete('phases/:id') @HttpCode(204) @RequirePermission('eaw.roadmap.write')
  removePhase(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE eaw.roadmap_phase SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('fase tidak ditemukan'); });
  }

  @Post('items') @HttpCode(201) @RequirePermission('eaw.roadmap.write')
  createItem(@CurrentUser() p: Principal, @Body() b: ItemDto) {
    if (!!b.objectType !== !!b.objectId) throw new ProblemException(400, 'bad-request', 'objectType dan objectId harus diisi bersamaan');
    return this.db.tx(p, async (c) => {
      const today: string = (await c.query('SELECT current_date::text AS d')).rows[0].d;
      const id = (await c.query(`INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, catatan, target, status, object_type, object_id) VALUES ($1,$2,$3,$4,$5::date,COALESCE($6,'direncanakan'),$7,$8) RETURNING id`,
        [b.phaseId, b.jenis, b.judul.trim(), b.catatan ?? null, b.target, b.status ?? null, b.objectType ?? null, b.objectId ?? null])).rows[0].id;
      return itemDto((await c.query(`${ITEM_SQL} WHERE i.id = $1`, [id])).rows[0], today);
    });
  }

  @Patch('items/:id') @RequirePermission('eaw.roadmap.write')
  patchItem(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: ItemPatchDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    if (!!b.objectType !== !!b.objectId) throw new ProblemException(400, 'bad-request', 'objectType dan objectId harus diisi bersamaan');
    return this.db.tx(p, async (c) => {
      const today: string = (await c.query('SELECT current_date::text AS d')).rows[0].d;
      const cur = (await c.query('SELECT row_version FROM eaw.roadmap_item WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('butir tidak ditemukan');
      assertVersion(v, cur.row_version);
      await c.query(`UPDATE eaw.roadmap_item SET phase_id = COALESCE($2, phase_id), jenis = COALESCE($3, jenis), judul = COALESCE($4, judul), catatan = COALESCE($5, catatan), target = COALESCE($6::date, target),
          status = COALESCE($7, status), object_type = COALESCE($8, object_type), object_id = COALESCE($9, object_id) WHERE id = $1`,
        [id, b.phaseId ?? null, b.jenis ?? null, b.judul?.trim() ?? null, b.catatan ?? null, b.target ?? null, b.status ?? null, b.objectType ?? null, b.objectId ?? null]);
      const r = (await c.query(`${ITEM_SQL} WHERE i.id = $1`, [id])).rows[0]; res.setHeader('ETag', etagOf(r.row_version)); return itemDto(r, today);
    });
  }

  @Delete('items/:id') @HttpCode(204) @RequirePermission('eaw.roadmap.write')
  removeItem(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE eaw.roadmap_item SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('butir tidak ditemukan'); });
  }
}
