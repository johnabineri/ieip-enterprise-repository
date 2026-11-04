import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { pageLimit, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

const TYPES = ['application', 'service', 'process', 'data_entity', 'infra_asset', 'control'];
const TIPE = ['serving', 'used-by', 'association', 'composition', 'realization', 'access', 'assignment', 'flow', 'triggering'];

export class CreateRelationDto {
  @IsIn(TYPES) sumberType: string;
  @IsUUID() sumberId: string;
  @IsIn(TYPES) targetType: string;
  @IsUUID() targetId: string;
  @IsIn(TIPE) tipe: string;
  /** menandai relasi sebagai bagian Kerangka Kerja (validasi 6 domain) */
  @IsOptional() @IsUUID() kerangkaId?: string;
}

export class TagFrameworkDto {
  /** Kerangka Kerja pemuat relasi ini; null = lepas dari kerangka */
  @ValidateIf((o) => o.kerangkaId !== null) @IsUUID() kerangkaId: string | null;
}

const dto = (r: any) => ({
  id: r.id, sumberType: r.sumber_type, sumberId: r.sumber_id, sumberLabel: r.sumber_label, targetType: r.target_type, targetId: r.target_id, targetLabel: r.target_label,
  tipe: r.tipe, kerangkaId: r.kerangka_id, createdBy: r.created_by, createdAt: r.created_at,
});
const COLS = `r.id, r.sumber_type, r.sumber_id, eaw.object_label(r.sumber_type, r.sumber_id) AS sumber_label, r.target_type, r.target_id,
  eaw.object_label(r.target_type, r.target_id) AS target_label, r.tipe, r.kerangka_id, r.created_by, r.created_at`;

/**
 * Relasi antar-objek (ArchiMate 3.2, EAW-05). Arah kanonik: sumber = objek "atas" (Aplikasi → Layanan/Proses/Entitas Data/Infrastruktur/Kontrol,
 * Layanan → Proses, Proses → Entitas Data). Pasangan/tipe sah, objek ada, dan kunci status (hanya sumber Draf yang dapat diubah relasinya)
 * ditegakkan trigger DB; RLS mengikuti objek sumber.
 */
@Controller('api/v1/eaw/relations')
export class RelationsController {
  constructor(private readonly db: DbService) {}

  /** objekType+objekId: semua relasi objek itu (sebagai sumber maupun target). */
  @Get() @RequirePermission('eaw.model.read')
  list(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit, 200, 100);
    return this.db.tx(p, async (c) => {
      const w = ['r.deleted_at IS NULL']; const a: unknown[] = [];
      if (q.objekId) {
        if (!TYPES.includes(q.objekType)) throw new ProblemException(400, 'bad-request', 'objekType wajib dan harus salah satu: ' + TYPES.join(', '));
        a.push(q.objekType, uuidOr400(q.objekId, 'objekId'));
        w.push(`((r.sumber_type = $1 AND r.sumber_id = $2) OR (r.target_type = $1 AND r.target_id = $2))`);
      }
      if (q.kerangkaId) { a.push(uuidOr400(q.kerangkaId, 'kerangkaId')); w.push(`r.kerangka_id = $${a.length}`); }
      if (q.cursor) { a.push(uuidOr400(q.cursor, 'cursor')); w.push(`r.id > $${a.length}`); }
      a.push(limit + 1);
      const rows = (await c.query(`SELECT ${COLS} FROM eaw.relation r WHERE ${w.join(' AND ')} ORDER BY r.id LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const data = (more ? rows.slice(0, limit) : rows).map(dto);
      return { data, nextCursor: more ? data[data.length - 1].id : null };
    });
  }

  @Post() @HttpCode(201) @RequirePermission('eaw.model.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateRelationDto) {
    return this.db.tx(p, async (c) => {
      const ins = await c.query(
        `INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe, kerangka_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [b.sumberType, b.sumberId, b.targetType, b.targetId, b.tipe, b.kerangkaId ?? null]);
      return dto((await c.query(`SELECT ${COLS} FROM eaw.relation r WHERE r.id = $1`, [ins.rows[0].id])).rows[0]);
    });
  }

  /** Menandai/melepas relasi sebagai bagian Kerangka Kerja (EAW-05, validasi 6 domain). Sumber relasi harus Draf. */
  @Patch(':id') @RequirePermission('eaw.model.write')
  tag(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: TagFrameworkDto) {
    return this.db.tx(p, async (c) => {
      const r = await c.query('UPDATE eaw.relation SET kerangka_id = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id', [uuidOr400(id), b.kerangkaId]);
      if (!r.rowCount) throw new NotFoundException('relasi tidak ditemukan atau di luar cakupan akses');
      return dto((await c.query(`SELECT ${COLS} FROM eaw.relation r WHERE r.id = $1`, [id])).rows[0]);
    });
  }

  /** Hapus lunak; hanya bila objek sumber masih Draf. */
  @Delete(':id') @HttpCode(204) @RequirePermission('eaw.model.write')
  remove(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const r = await c.query('UPDATE eaw.relation SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)]);
      if (!r.rowCount) throw new NotFoundException('relasi tidak ditemukan atau di luar cakupan akses');
    });
  }
}
