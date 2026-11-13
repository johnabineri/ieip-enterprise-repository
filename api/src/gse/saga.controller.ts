import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { pageLimit, uuidOr400 } from '../common/http';
import { DbService } from '../db/db.service';
import { SagaMode } from './saga';
import { GseSagaService, sagaRunDto } from './saga.service';

class RunDto {
  @IsOptional() @IsObject() input?: Record<string, unknown>;
  @IsOptional() @IsIn(['simulate', 'live']) mode?: SagaMode;
  /** hanya mode simulate: nama langkah yang aksinya dipaksa gagal */
  @IsOptional() @IsString() @MaxLength(200) failAt?: string;
  /** hanya mode simulate: nama langkah yang kompensasinya dipaksa gagal */
  @IsOptional() @IsString() @MaxLength(200) failCompensation?: string;
}

/**
 * GSE-03 eksekutor saga ringan — HTTP. Mesin ada di GseSagaService (saga.service.ts; juga dipakai mediasi EIO L5).
 * Batas jujur: bukan runtime terdistribusi (tanpa timer/sinyal/penjadwalan ulang otomatis) — run yang terhenti dipulihkan manual
 * lewat POST /saga-runs/:id/recover setelah lease-nya kedaluwarsa.
 */
@Controller('api/v1/gse')
export class GseSagaController {
  constructor(private readonly db: DbService, private readonly saga: GseSagaService) {}

  @Post('flows/:id/runs') @HttpCode(201) @RequirePermission('gse.project.run')
  async start(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: RunDto, @Headers('idempotency-key') idemKey: string | undefined,
              @Res({ passthrough: true }) res: Response) {
    const r = await this.saga.start(p, uuidOr400(id), { input: b.input, mode: b.mode, failAt: b.failAt, failCompensation: b.failCompensation, runKey: idemKey });
    if (r.replayed) { res.status(200); res.setHeader('Idempotent-Replayed', 'true'); }
    return r.run;
  }

  @Get('flows/:id/runs') @RequirePermission('gse.project.read')
  runs(@CurrentUser() p: Principal, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.db.tx(p, async (c) => ({
      data: (await c.query('SELECT * FROM gse.saga_run WHERE flow_id = $1 ORDER BY started_at DESC LIMIT $2', [uuidOr400(id), pageLimit(limit, 100, 25)])).rows.map((r) => sagaRunDto(r)),
    }));
  }

  @Get('saga-runs/:id') @RequirePermission('gse.project.read')
  run(@CurrentUser() p: Principal, @Param('id') id: string) { return this.saga.detail(p, uuidOr400(id)); }

  /** Pemulihan run yang terhenti (API mati di tengah run): lease harus sudah kedaluwarsa; langkah sukses dikompensasi. */
  @Post('saga-runs/:id/recover') @HttpCode(200) @RequirePermission('gse.project.run')
  recover(@CurrentUser() p: Principal, @Param('id') id: string) { return this.saga.recover(p, uuidOr400(id)); }
}
