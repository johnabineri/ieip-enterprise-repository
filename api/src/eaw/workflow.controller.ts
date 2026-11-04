import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { pageLimit, uuidOr400 } from '../common/http';
import { DbService } from '../db/db.service';

const TYPES = ['application', 'reference', 'framework', 'process', 'data_entity', 'service', 'infra_asset', 'control'];
const STATUS = ['Draf', 'Divalidasi', 'Ditetapkan', 'Dipublikasi', 'Direviu'];

export class TransitionDto {
  @IsIn(STATUS) to: string;
  @IsOptional() @IsString() catatan?: string;
}
export class GenericTransitionDto extends TransitionDto {
  @IsIn(TYPES) objekType: string;
  @IsUUID() objekId: string;
}

/**
 * Alur tata kelola AF-05 (EAW-07): Draf → Divalidasi → Ditetapkan → Dipublikasi → Direviu.
 * SELURUH aturan (izin per transisi, cakupan, empat mata, validasi KRA, catatan wajib) ditegakkan fungsi DB eaw.transition();
 * endpoint ini hanya menerjemahkan galat DB ke RFC 9457 (42501→403, 23514→422, P0002→404).
 */
@Controller('api/v1/eaw')
export class WorkflowController {
  constructor(private readonly db: DbService) {}

  @Post('applications/:id/transition') @HttpCode(200) @RequirePermission('eaw.catalog.read')
  app(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: TransitionDto) {
    return this.transition(p, 'application', uuidOr400(id), b);
  }

  @Post('references/:id/transition') @HttpCode(200) @RequirePermission('eaw.reference.read')
  ref(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: TransitionDto) {
    return this.transition(p, 'reference', uuidOr400(id), b);
  }

  /** Untuk objek domain lain (proses, layanan, entitas data, infrastruktur, kontrol, kerangka kerja). */
  @Post('transitions') @HttpCode(200) @RequirePermission('eaw.workflow.read')
  generic(@CurrentUser() p: Principal, @Body() b: GenericTransitionDto) {
    return this.transition(p, b.objekType, b.objekId, b);
  }

  private transition(p: Principal, type: string, id: string, b: TransitionDto) {
    return this.db.tx(p, async (c) => (await c.query('SELECT eaw.transition($1, $2, $3, $4) AS r', [type, id, b.to, b.catatan ?? null])).rows[0].r);
  }

  /** Jejak transisi append-only. Hanya peran lihat-semua atau pelaku transisi itu sendiri (RLS). */
  @Get('workflow') @RequirePermission('eaw.workflow.read')
  history(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit, 200, 50);
    return this.db.tx(p, async (c) => {
      const w = ['TRUE']; const a: unknown[] = [];
      if (q.objekType) { a.push(q.objekType); w.push(`objek_type = $${a.length}`); }
      if (q.objekId) { a.push(uuidOr400(q.objekId, 'objekId')); w.push(`objek_id = $${a.length}`); }
      a.push(limit);
      const rows = (await c.query(
        `SELECT id, objek_type, objek_id, status_dari, status_ke, pelaku, catatan, waktu FROM eaw.workflow WHERE ${w.join(' AND ')} ORDER BY waktu DESC, id LIMIT $${a.length}`, a)).rows;
      return { data: rows };
    });
  }
}
