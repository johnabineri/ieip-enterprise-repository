import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, decodeKeyset, encodeKeyset, pageLimit, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

class CreateClearanceDto {
  @IsUUID() entityId: string;
  @IsString() @MinLength(3) initiativeName: string;
  @IsString() @MinLength(10) businessCase: string;
  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number;
  /** entitas data yang akan disimpan aplikasi (untuk pemeriksaan Prinsip Satu Data Korporasi, aturan M1) */
  @IsOptional() @IsArray() @IsString({ each: true }) dataEntities?: string[];
}
class ScreenDto {
  @IsString() @MinLength(3) initiativeName: string;
  @IsOptional() @IsString() businessCase?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dataEntities?: string[];
}
class PatchClearanceDto {
  @IsOptional() @IsString() @MinLength(3) initiativeName?: string;
  @IsOptional() @IsString() @MinLength(10) businessCase?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number;
}
class ClearanceTransitionDto {
  @IsIn(['IN_REVIEW', 'REVISION', 'SUBMITTED', 'APPROVED', 'REJECTED']) to: string;
  @IsOptional() @IsString() notes?: string;
}

/** Master data yang dikelola kanonikal di SEDDI/CMP: aplikasi dilarang membuat master lokal (Prinsip Satu Data Korporasi, M1). */
const MASTERS = ['customer', 'vendor', 'supplier', 'employee', 'party', 'product', 'coa', 'branch'];
/**
 * Pre-screening redundansi: kemiripan leksikal (pg_trgm) nama/uraian inisiatif terhadap katalog aplikasi yang terlihat pengguna
 * (Draf entitas lain tidak terlihat — RLS). Ini heuristik deterministik, BUKAN model MIND AI. Skor 0–100; >= 75 = berpotensi duplikasi.
 */
async function screen(c: any, name: string, businessCase: string | undefined, dataEntities: string[] | undefined) {
  const matches = (await c.query(
    `SELECT a.kode, a.nama, a.status, LEAST(100, round(100 * greatest(similarity(a.nama, $1), word_similarity(a.nama, $1 || ' ' || $2))))::int AS similarity
       FROM eaw.application a WHERE a.deleted_at IS NULL ORDER BY 4 DESC, a.kode LIMIT 3`, [name, businessCase ?? ''])).rows;
  const violations = (dataEntities ?? []).map((e) => e.trim().toLowerCase()).filter((e) => MASTERS.includes(e))
    .map((e) => ({ entity: e, rule: 'M1', message: `Master ${e} sudah dikelola kanonikal di SEDDI. Dilarang membuat tabel lokal; konsumsi lewat replika ref.* / API SEDDI.` }));
  return { score: matches.length ? matches[0].similarity : 0, threshold: 75, matches, violations };
}

const COLS = `c.id, c.ticket_number, c.proposed_by, c.entity_id, g.code AS entity_code, c.initiative_name, c.business_case, c.estimated_cost,
  c.ai_risk_score, c.status, c.arb_notes, c.decided_by, c.decided_at, c.certificate_id, c.created_at, c.row_version`;
const FROM = 'FROM eaw.arb_clearance c JOIN ref.business_groups g ON g.id = c.entity_id';
const dto = (r: any) => ({ id: r.id, ticketNumber: r.ticket_number, proposedBy: r.proposed_by, entityId: r.entity_id, entityCode: r.entity_code,
  initiativeName: r.initiative_name, businessCase: r.business_case, estimatedCost: r.estimated_cost === null ? null : Number(r.estimated_cost),
  aiRiskScore: r.ai_risk_score === null ? null : Number(r.ai_risk_score), status: r.status, arbNotes: r.arb_notes, decidedBy: r.decided_by,
  decidedAt: r.decided_at, certificateId: r.certificate_id, createdAt: r.created_at, version: r.row_version });

/**
 * ARB Clearance (SRS 5.3): SUBMITTED → IN_REVIEW → REVISION ↔ SUBMITTED | APPROVED | REJECTED.
 * Empat mata (pengaju ≠ peninjau/pemutus), sertifikat terbit saat APPROVED — seluruhnya ditegakkan eaw.arb_transition() + RLS.
 * Skor redundansi MIND AI (ai_risk_score) dan screening ke CMP belum otomatis.
 */
@Controller('api/v1/gov/arb/clearances')
export class ArbController {
  constructor(private readonly db: DbService) {}

  @Get() @RequirePermission('gov.arb.read')
  list(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit);
    return this.db.tx(p, async (c) => {
      const w = ['c.deleted_at IS NULL']; const a: unknown[] = [];
      if (q.status) { a.push(q.status); w.push(`c.status = $${a.length}`); }
      if (q.entityId) { a.push(uuidOr400(q.entityId, 'entityId')); w.push(`c.entity_id = $${a.length}`); }
      if (q.mine === 'true') { a.push(p.userId); w.push(`c.proposed_by = $${a.length}`); }
      const cur = decodeKeyset(q.cursor);
      if (cur) { a.push(cur[0]); w.push(`c.ticket_number > $${a.length}`); }
      a.push(limit + 1);
      const rows = (await c.query(`SELECT ${COLS} ${FROM} WHERE ${w.join(' AND ')} ORDER BY c.ticket_number LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const data = (more ? rows.slice(0, limit) : rows).map(dto);
      return { data, nextCursor: more ? encodeKeyset(data[data.length - 1].ticketNumber, '') : null };
    });
  }

  @Get(':id') @RequirePermission('gov.arb.read')
  async get(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.db.tx(p, async (c) => (await c.query(`SELECT ${COLS} ${FROM} WHERE c.id = $1 AND c.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('tiket tidak ditemukan atau di luar cakupan akses');
    return dto(r);
  }

  /** Pre-screening tanpa menyimpan: skor kemiripan, kandidat duplikasi, dan pelanggaran Satu Data Korporasi. */
  @Post('screen') @HttpCode(200) @RequirePermission('gov.arb.write')
  screen(@CurrentUser() p: Principal, @Body() b: ScreenDto) {
    return this.db.tx(p, (c) => screen(c, b.initiativeName, b.businessCase, b.dataEntities));
  }

  /** Mengajukan tiket: pengaju = pengguna sesi (tidak dapat memalsukan), entitas harus dalam cakupan sunting. Skor dihitung server; pelanggaran M1 ditolak otomatis (422). */
  @Post() @HttpCode(201) @RequirePermission('gov.arb.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateClearanceDto) {
    return this.db.tx(p, async (c) => {
      const sc = await screen(c, b.initiativeName, b.businessCase, b.dataEntities);
      if (sc.violations.length) throw new ProblemException(422, 'validation-failed', 'Melanggar Prinsip Satu Data Korporasi', sc.violations.map((v) => v.message).join(' '), { violations: sc.violations });
      const ins = await c.query(
        `INSERT INTO eaw.arb_clearance (proposed_by, entity_id, initiative_name, business_case, estimated_cost, ai_risk_score) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [p.userId, b.entityId, b.initiativeName, b.businessCase, b.estimatedCost ?? null, sc.score]);
      return dto((await c.query(`SELECT ${COLS} ${FROM} WHERE c.id = $1`, [ins.rows[0].id])).rows[0]);
    });
  }

  /** Pengaju menyunting tiketnya selagi SUBMITTED/REVISION. */
  @Patch(':id') @RequirePermission('gov.arb.write')
  patch(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PatchClearanceDto) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM eaw.arb_clearance WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('tiket tidak ditemukan atau bukan milik Anda');
      assertVersion(v, cur.row_version);
      if (b.initiativeName === undefined && b.businessCase === undefined && b.estimatedCost === undefined) throw new ProblemException(422, 'validation-failed', 'Tidak ada perubahan');
      await c.query(`UPDATE eaw.arb_clearance SET initiative_name = COALESCE($2, initiative_name), business_case = COALESCE($3, business_case),
                       estimated_cost = COALESCE($4, estimated_cost) WHERE id = $1`, [id, b.initiativeName ?? null, b.businessCase ?? null, b.estimatedCost ?? null]);
      return dto((await c.query(`SELECT ${COLS} ${FROM} WHERE c.id = $1`, [id])).rows[0]);
    });
  }

  @Post(':id/transition') @HttpCode(200) @RequirePermission('gov.arb.read')
  transition(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: ClearanceTransitionDto) {
    return this.db.tx(p, async (c) => {
      const r = (await c.query('SELECT eaw.arb_transition($1, $2, $3) AS r', [uuidOr400(id), b.to, b.notes ?? null])).rows[0].r;
      return { ...r, ticket: dto((await c.query(`SELECT ${COLS} ${FROM} WHERE c.id = $1`, [id])).rows[0]) };
    });
  }
}
