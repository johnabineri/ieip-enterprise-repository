import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, IsInt, Min, Max } from 'class-validator';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, etagOf, pageLimit, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { planKeys } from '../gse/saga';
import { GseSagaService } from '../gse/saga.service';
import {
  applyMap, callTarget, CallResult, CanonField, EIO_LIMITS, eioEnvName, eioTarget, evalRules, normalizeBody, outbound, renderPath, Rule, unsafeRegexReason, validateCanonical,
} from './eio';

const KODE = /^[A-Z0-9][A-Z0-9_.-]*$/;

/** Tolak pola regex berisiko ReDoS saat rute disimpan (evalRules tetap memeriksa ulang, fail-closed). */
function assertSafeRules(rules?: Rule[]) {
  if ((rules ?? []).filter((r) => r?.op === 'regex').length > EIO_LIMITS.regexMaxRules)
    throw new ProblemException(422, 'unsafe-regex', `rules: maksimum ${EIO_LIMITS.regexMaxRules} aturan regex per rute`);
  for (const r of rules ?? []) {
    if (r?.op !== 'regex' || typeof r.value !== 'string') continue;
    const why = unsafeRegexReason(r.value);
    if (why) throw new ProblemException(422, 'unsafe-regex', `rules: ${r.field}: ${why}`);
  }
}

class CanonicalDto {
  @Matches(KODE) @MaxLength(50) kode: string;
  @IsOptional() @IsInt() @Min(1) @Max(999) versi?: number;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsOptional() @IsString() @MaxLength(2000) deskripsi?: string;
  @IsArray() fields: CanonField[];
}
class CanonicalPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsString() @MaxLength(2000) deskripsi?: string;
  @IsOptional() @IsArray() fields?: CanonField[];
}
class RouteDto {
  @Matches(KODE) @MaxLength(50) kode: string;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsOptional() @IsString() @MaxLength(2000) deskripsi?: string;
  @IsUUID() canonicalId: string;
  @IsIn(['connector', 'saga']) targetKind: 'connector' | 'saga';
  @IsOptional() @IsUUID() connectorId?: string;
  @IsOptional() @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method?: string;
  @IsOptional() @IsString() @MaxLength(300) path?: string;
  @IsOptional() @IsUUID() sagaFlowId?: string;
  @IsOptional() @IsObject() requestMap?: Record<string, unknown>;
  @IsOptional() @IsObject() responseMap?: Record<string, unknown>;
  @IsOptional() @IsArray() rules?: Rule[];
  @IsOptional() @IsUUID() entityId?: string;
}
class RoutePatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsString() @MaxLength(2000) deskripsi?: string;
  @IsOptional() @IsUUID() canonicalId?: string;
  @IsOptional() @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method?: string;
  @IsOptional() @IsString() @MaxLength(300) path?: string;
  @IsOptional() @IsObject() requestMap?: Record<string, unknown>;
  @IsOptional() @IsObject() responseMap?: Record<string, unknown>;
  @IsOptional() @IsArray() rules?: Rule[];
}
class MediateDto {
  /** data dalam bentuk model kanonikal rute */
  @IsOptional() data?: unknown;
  @IsOptional() @IsIn(['live', 'simulate']) mode?: 'live' | 'simulate';
}

const canonDto = (r: any) => ({ id: r.id, kode: r.kode, versi: r.versi, nama: r.nama, deskripsi: r.deskripsi, fields: r.fields, status: r.status,
  activatedAt: r.activated_at, inUse: r.in_use ?? undefined, version: r.row_version });
const routeDto = (r: any) => ({ id: r.id, kode: r.kode, nama: r.nama, deskripsi: r.deskripsi, canonicalId: r.canonical_id, canonicalKode: r.canonical_kode, canonicalVersi: r.canonical_versi,
  targetKind: r.target_kind, connectorId: r.connector_id, connectorKode: r.connector_kode ?? null, method: r.method, path: r.path, sagaFlowId: r.saga_flow_id, sagaFlowNama: r.saga_flow_nama ?? null,
  requestMap: r.request_map, responseMap: r.response_map, rules: r.rules, status: r.status, entityId: r.entity_id, activatedAt: r.activated_at,
  ...(r.target_kind === 'connector' && r.connector_kode ? { targetEnv: eioEnvName(r.connector_kode), targetConfigured: !!eioTarget(r.connector_kode) } : {}),
  version: r.row_version });
const exDto = (x: any) => ({ id: x.id, routeId: x.route_id, routeKode: x.route_kode, canonicalKode: x.canonical_kode, canonicalVersi: x.canonical_versi, targetKind: x.target_kind,
  mode: x.mode, callerId: x.caller_id, corporateId: x.corporate_id, correlationId: x.correlation_id, status: x.status, layer: x.layer, httpStatus: x.http_status, error: x.error,
  durationMs: x.duration_ms, sagaRunId: x.saga_run_id, createdAt: x.created_at });

const ROUTE_SQL = `SELECT r.*, c.kode AS canonical_kode, c.versi AS canonical_versi, k.kode AS connector_kode, f.nama AS saga_flow_nama
  FROM console.eio_route r JOIN console.eio_canonical c ON c.id = r.canonical_id
  LEFT JOIN console.eio_connector k ON k.id = r.connector_id LEFT JOIN gse.flow f ON f.id = r.saga_flow_id`;
/** "POST /orders/{order_id}" — sama dengan console.eio_route_operation() di DB (kunci spec_snapshot konektor). */
const operationOf = (method: string, path: string) => `${method} ${path.replace(/\$\{([^}]*)\}/g, '{$1}')}`;
const READ_PERMS = ['console.dashboard.read', 'console.eio.write', 'console.eio.run'];
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

interface ExLog { status: 'ok' | 'rejected' | 'failed'; layer: number; httpStatus?: number | null; error?: string; sagaRunId?: string | null }

/**
 * EIO-01..03: mediasi integrasi ringan (lihat eio.ts dan 300_eio_mediation.sql).
 *   Definisi  : /console/eio/canonical-models, /console/eio/routes          (console.eio.write; baca: dashboard/eio.write/eio.run)
 *   Data plane: POST /console/eio/routes/:kode/mediate {data, mode}          (live: console.eio.run; simulate: eio.run atau eio.write)
 *   Jejak     : GET /console/eio/exchanges                                    (pemegang run tanpa dashboard: hanya miliknya — RLS)
 * Batas jujur: sinkron di dalam permintaan (tanpa antrean/DLQ/penjadwalan ulang), REST/JSON saja, aturan L4 lokal (bukan OPA),
 * saga = eksekutor ringan GSE (bukan Temporal); tidak ada layanan KEIS nyata yang sudah terdaftar sebagai target — diuji dengan server palsu.
 */
@Controller('api/v1/console')
export class EioController {
  constructor(private readonly db: DbService, private readonly saga: GseSagaService) {}

  private canRead(p: Principal) { if (!READ_PERMS.some((x) => p.perms.includes(x))) throw new ForbiddenException(`izin tidak mencukupi: salah satu dari ${READ_PERMS.join(', ')}`); }

  // ================= model kanonikal =================
  @Get('eio/canonical-models')
  canonicals(@CurrentUser() p: Principal) {
    this.canRead(p);
    return this.db.tx(p, async (c) => ({ data: (await c.query(`SELECT m.*, EXISTS (SELECT 1 FROM console.eio_route r WHERE r.canonical_id = m.id AND r.status = 'active' AND r.deleted_at IS NULL) AS in_use
      FROM console.eio_canonical m WHERE m.deleted_at IS NULL ORDER BY m.kode, m.versi DESC`)).rows.map(canonDto) }));
  }

  @Post('eio/canonical-models') @HttpCode(201) @RequirePermission('console.eio.write')
  createCanonical(@CurrentUser() p: Principal, @Body() b: CanonicalDto) {
    return this.db.tx(p, async (c) => canonDto((await c.query(`INSERT INTO console.eio_canonical (kode, versi, nama, deskripsi, fields) VALUES ($1,COALESCE($2,1),$3,$4,$5::jsonb) RETURNING *`,
      [b.kode, b.versi ?? null, b.nama.trim(), b.deskripsi ?? null, JSON.stringify(b.fields)])).rows[0]));
  }

  @Patch('eio/canonical-models/:id') @RequirePermission('console.eio.write')
  patchCanonical(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: CanonicalPatchDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM console.eio_canonical WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('model kanonikal tidak ditemukan');
      assertVersion(v, cur.row_version);
      const r = (await c.query('UPDATE console.eio_canonical SET nama = COALESCE($2, nama), deskripsi = COALESCE($3, deskripsi), fields = COALESCE($4::jsonb, fields) WHERE id = $1 RETURNING *',
        [id, b.nama?.trim() ?? null, b.deskripsi ?? null, b.fields ? JSON.stringify(b.fields) : null])).rows[0];
      res.setHeader('ETag', etagOf(r.row_version)); return canonDto(r);
    });
  }

  @Post('eio/canonical-models/:id/activate') @HttpCode(200) @RequirePermission('console.eio.write')
  activateCanonical(@CurrentUser() p: Principal, @Param('id') id: string) { return this.canonicalStatus(p, id, 'active'); }
  @Post('eio/canonical-models/:id/retire') @HttpCode(200) @RequirePermission('console.eio.write')
  retireCanonical(@CurrentUser() p: Principal, @Param('id') id: string) { return this.canonicalStatus(p, id, 'retired'); }
  private canonicalStatus(p: Principal, id: string, to: string) {
    return this.db.tx(p, async (c) => {
      const r = (await c.query('UPDATE console.eio_canonical SET status = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *', [uuidOr400(id), to])).rows[0];
      if (!r) throw new NotFoundException('model kanonikal tidak ditemukan'); return canonDto(r);
    });
  }

  @Delete('eio/canonical-models/:id') @HttpCode(204) @RequirePermission('console.eio.write')
  removeCanonical(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE console.eio_canonical SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('model kanonikal tidak ditemukan'); });
  }

  // ================= rute =================
  @Get('eio/routes')
  routes(@CurrentUser() p: Principal) {
    this.canRead(p);
    return this.db.tx(p, async (c) => ({ data: (await c.query(`${ROUTE_SQL} WHERE r.deleted_at IS NULL ORDER BY r.kode`)).rows.map(routeDto) }));
  }

  @Get('eio/routes/:id')
  async route(@CurrentUser() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    this.canRead(p);
    const r = await this.db.tx(p, async (c) => (await c.query(`${ROUTE_SQL} WHERE r.id = $1 AND r.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('rute tidak ditemukan');
    res.setHeader('ETag', etagOf(r.row_version)); return routeDto(r);
  }

  @Post('eio/routes') @HttpCode(201) @RequirePermission('console.eio.write')
  createRoute(@CurrentUser() p: Principal, @Body() b: RouteDto) {
    assertSafeRules(b.rules);
    return this.db.tx(p, async (c) => {
      const id = (await c.query(`INSERT INTO console.eio_route (kode, nama, deskripsi, canonical_id, target_kind, connector_id, method, path, saga_flow_id, request_map, response_map, rules, entity_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::jsonb,'{}'),COALESCE($11::jsonb,'{}'),COALESCE($12::jsonb,'[]'),$13) RETURNING id`,
        [b.kode, b.nama.trim(), b.deskripsi ?? null, b.canonicalId, b.targetKind, b.connectorId ?? null, b.method ?? null, b.path ?? null, b.sagaFlowId ?? null,
          b.requestMap ? JSON.stringify(b.requestMap) : null, b.responseMap ? JSON.stringify(b.responseMap) : null, b.rules ? JSON.stringify(b.rules) : null, b.entityId ?? null])).rows[0].id;
      return routeDto((await c.query(`${ROUTE_SQL} WHERE r.id = $1`, [id])).rows[0]);
    });
  }

  @Patch('eio/routes/:id') @RequirePermission('console.eio.write')
  patchRoute(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: RoutePatchDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    assertSafeRules(b.rules);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM console.eio_route WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('rute tidak ditemukan');
      assertVersion(v, cur.row_version);
      await c.query(`UPDATE console.eio_route SET nama = COALESCE($2, nama), deskripsi = COALESCE($3, deskripsi), canonical_id = COALESCE($4, canonical_id), method = COALESCE($5, method),
          path = COALESCE($6, path), request_map = COALESCE($7::jsonb, request_map), response_map = COALESCE($8::jsonb, response_map), rules = COALESCE($9::jsonb, rules) WHERE id = $1`,
        [id, b.nama?.trim() ?? null, b.deskripsi ?? null, b.canonicalId ?? null, b.method ?? null, b.path ?? null,
          b.requestMap ? JSON.stringify(b.requestMap) : null, b.responseMap ? JSON.stringify(b.responseMap) : null, b.rules ? JSON.stringify(b.rules) : null]);
      const r = (await c.query(`${ROUTE_SQL} WHERE r.id = $1`, [id])).rows[0]; res.setHeader('ETag', etagOf(r.row_version)); return routeDto(r);
    });
  }

  @Post('eio/routes/:id/activate') @HttpCode(200) @RequirePermission('console.eio.write')
  activateRoute(@CurrentUser() p: Principal, @Param('id') id: string) { return this.routeStatus(p, id, 'active'); }
  @Post('eio/routes/:id/disable') @HttpCode(200) @RequirePermission('console.eio.write')
  disableRoute(@CurrentUser() p: Principal, @Param('id') id: string) { return this.routeStatus(p, id, 'disabled'); }
  private routeStatus(p: Principal, id: string, to: string) {
    return this.db.tx(p, async (c) => {
      if (!(await c.query('UPDATE console.eio_route SET status = $2 WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id), to])).rowCount) throw new NotFoundException('rute tidak ditemukan');
      return routeDto((await c.query(`${ROUTE_SQL} WHERE r.id = $1`, [id])).rows[0]);
    });
  }

  @Delete('eio/routes/:id') @HttpCode(204) @RequirePermission('console.eio.write')
  removeRoute(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE console.eio_route SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('rute tidak ditemukan'); });
  }

  // ================= jejak =================
  @Get('eio/exchanges')
  exchanges(@CurrentUser() p: Principal, @Query('routeId') routeId?: string, @Query('limit') limit?: string) {
    this.canRead(p);
    const rid = routeId ? uuidOr400(routeId, 'routeId') : null;
    return this.db.tx(p, async (c) => {
      const data = (await c.query('SELECT * FROM console.eio_exchange WHERE ($1::uuid IS NULL OR route_id = $1) ORDER BY created_at DESC LIMIT $2', [rid, pageLimit(limit, 200, 50)])).rows.map(exDto);
      const s = (await c.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'ok')::int AS ok, count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
          count(*) FILTER (WHERE status = 'failed')::int AS failed, (percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_ms
        FROM console.eio_exchange WHERE mode = 'live' AND created_at > now() - interval '24 hours' AND ($1::uuid IS NULL OR route_id = $1)`, [rid])).rows[0];
      return { data, stats24h: { total: s.total, ok: s.ok, rejected: s.rejected, failed: s.failed, p95Ms: s.p95_ms } };
    });
  }

  // ================= data plane =================
  @Post('eio/routes/:kode/mediate') @HttpCode(200)
  async mediate(@CurrentUser() p: Principal, @Param('kode') kode: string, @Body() b: MediateDto,
                @Headers('idempotency-key') idemKey: string | undefined, @Headers('x-correlation-id') corrHdr: string | undefined, @Res({ passthrough: true }) res: Response) {
    const mode = b.mode ?? 'live';
    if (mode === 'live' && !p.perms.includes('console.eio.run')) throw new ForbiddenException('izin tidak mencukupi: console.eio.run');
    if (mode === 'simulate' && !p.perms.includes('console.eio.run') && !p.perms.includes('console.eio.write')) throw new ForbiddenException('izin tidak mencukupi: console.eio.run atau console.eio.write');
    if (!KODE.test(kode) || kode.length > 50) throw new NotFoundException('rute tidak ditemukan');
    for (const [n, h] of [['X-Correlation-Id', corrHdr], ['Idempotency-Key', idemKey]] as const)
      if (h !== undefined && (h.length > 100 || !/^[\x21-\x7e]+$/.test(h))) throw new ProblemException(400, 'bad-request', `${n} maksimum 100 karakter ASCII cetak`);
    const t0 = Date.now();
    const exchangeId = randomUUID();
    const correlationId = corrHdr || randomUUID();
    res.setHeader('X-EIO-Exchange', exchangeId); res.setHeader('X-Correlation-Id', correlationId);

    const r = await this.db.tx(p, async (c) => (await c.query(`SELECT r.*, c.kode AS canonical_kode, c.versi AS canonical_versi, c.fields, c.status AS canonical_status,
        k.kode AS connector_kode, k.breaking_changes, f.nama AS saga_flow_nama, f.spec AS saga_spec
      FROM console.eio_route r JOIN console.eio_canonical c ON c.id = r.canonical_id
      LEFT JOIN console.eio_connector k ON k.id = r.connector_id AND k.deleted_at IS NULL LEFT JOIN gse.flow f ON f.id = r.saga_flow_id
      WHERE r.kode = $1 AND r.deleted_at IS NULL`, [kode])).rows[0]);
    if (!r) throw new NotFoundException('rute tidak ditemukan');
    if (mode === 'live' && r.status !== 'active') throw new ProblemException(409, 'route-inactive', `Rute ${r.kode} tidak aktif (${r.status})`, 'Hanya rute aktif yang dapat dipanggil live; gunakan mode "simulate" untuk menguji.');

    let corporateId: string | null = null;
    const log = async (x: ExLog) => {
      await this.db.tx(p, (c) => c.query(`INSERT INTO console.eio_exchange (id, route_id, mode, corporate_id, correlation_id, status, layer, http_status, error, duration_ms, saga_run_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [exchangeId, r.id, mode, corporateId, correlationId, x.status, x.layer, x.httpStatus ?? null, x.error ? x.error.slice(0, 500) : null, Date.now() - t0, x.sagaRunId ?? null]));
    };
    /** Catat penolakan/kegagalan lalu lempar ProblemException yang sama ke pemanggil. */
    const stop = async (x: ExLog, status: number, slug: string, title: string, detail?: string, extra: Record<string, unknown> = {}): Promise<never> => {
      await log({ ...x, httpStatus: x.httpStatus ?? status, error: x.error ?? detail ?? title });
      throw new ProblemException(status, slug, title, detail, { exchangeId, correlationId, layer: x.layer, ...extra });
    };
    const layers: Array<{ layer: number; name: string; note?: string }> = [];

    // L1 — normalisasi protokol
    let data: Record<string, unknown>;
    try { data = normalizeBody(b.data); } catch (e: any) { return stop({ status: 'rejected', layer: 1 }, e.getStatus?.() ?? 400, 'bad-request', 'Badan mediasi tidak sah', e.response?.title ?? String(e.message)); }
    layers.push({ layer: 1, name: 'Normalisasi protokol', note: 'REST/JSON' });

    // L2 — propagasi identitas
    const id = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM console.eio_identity()')).rows[0]);
    if (!id || !id.active) return stop({ status: 'rejected', layer: 2 }, 403, 'identity-unresolved', 'Identitas korporat pemanggil tidak ditemukan atau nonaktif', 'Akun EAP harus tertaut ke akun CMP aktif (ref.users).');
    corporateId = id.corporate_id;
    layers.push({ layer: 2, name: 'Propagasi identitas', note: 'X-Corporate-Id' });

    // L3 — model kanonikal + pemetaan
    const errs = validateCanonical(data, r.fields as CanonField[]);
    if (errs.length) return stop({ status: 'rejected', layer: 3 }, 422, 'canonical-invalid', `Data tidak sesuai model kanonikal ${r.canonical_kode} v${r.canonical_versi}`, errs.slice(0, 5).join('; '), { errors: errs });
    const mapped = applyMap(r.request_map, data);
    let path: string | null = null;
    if (r.target_kind === 'connector') {
      const rp = renderPath(r.path, data);
      if (rp.missing.length) return stop({ status: 'rejected', layer: 3 }, 422, 'canonical-invalid', 'Variabel path rute kosong', `Isi field: ${rp.missing.join(', ')}`);
      path = rp.path;
    }
    layers.push({ layer: 3, name: 'Pemetaan kanonikal', note: `${r.canonical_kode} v${r.canonical_versi}` });

    // L4 — aturan bisnis
    const v = evalRules(r.rules as Rule[], data);
    if (v) return stop({ status: 'rejected', layer: 4 }, 422, 'business-rule', 'Aturan bisnis rute dilanggar', v.message, { rule: { field: v.rule.field, op: v.rule.op } });
    layers.push({ layer: 4, name: 'Aturan bisnis', note: `${(r.rules as Rule[]).length} aturan` });

    // L5 — orkestrasi
    const headers: Record<string, string> = { 'X-Corporate-Id': corporateId!, 'X-Correlation-Id': correlationId, 'X-EIO-Route': r.kode, 'X-EIO-Exchange': exchangeId,
      ...(id.employee_id ? { 'X-Employee-Id': id.employee_id } : {}), ...(idemKey ? { 'Idempotency-Key': idemKey } : {}) };
    const base = { exchangeId, correlationId, route: r.kode, mode, canonical: { kode: r.canonical_kode, versi: r.canonical_versi }, targetKind: r.target_kind };

    if (mode === 'simulate') {                                                   // tanpa efek samping: tidak memanggil target, tidak membuat run saga
      let plan: Record<string, unknown>;
      if (r.target_kind === 'connector') {
        const o = outbound(r.method, mapped);
        plan = { connector: r.connector_kode, method: r.method, path: path! + o.query, ...(o.body !== undefined ? { body: mapped } : {}),
          headers: Object.keys(headers), targetEnv: eioEnvName(r.connector_kode ?? ''), targetConfigured: !!(r.connector_kode && eioTarget(r.connector_kode)) };
      } else {
        try { planKeys(r.saga_flow_nama, r.saga_spec, mapped); } catch (e: any) { return stop({ status: 'rejected', layer: 5 }, 422, 'validation-failed', 'Input saga dari pemetaan tidak lengkap', e.response?.detail ?? String(e.message)); }
        plan = { sagaFlow: r.saga_flow_nama, sagaFlowId: r.saga_flow_id, input: mapped };
      }
      layers.push({ layer: 5, name: 'Orkestrasi', note: 'simulasi — target tidak dipanggil' });
      await log({ status: 'ok', layer: 6 });
      layers.push({ layer: 6, name: 'Publikasi peristiwa', note: 'simulasi — tidak diterbitkan' });
      return { ...base, status: 'ok', layers, plan };
    }

    const on = await this.db.tx(p, async (c) => (await c.query(`SELECT console.agent_enabled('eio-mediation') AS on`)).rows[0].on);
    if (!on) return stop({ status: 'rejected', layer: 5 }, 503, 'agent-disabled', 'Mediasi EIO (live) dinonaktifkan', 'Kill-switch eio-mediation nonaktif di CONSOLE.');

    let out: unknown; let sagaRunId: string | null = null; let targetInfo: Record<string, unknown>;
    if (r.target_kind === 'connector') {
      if (!r.connector_kode) return stop({ status: 'failed', layer: 5 }, 503, 'service-unavailable', 'Konektor target rute sudah dihapus');
      const op = operationOf(r.method, r.path);
      const broken = ((r.breaking_changes ?? []) as string[]).filter((x) => x.endsWith(`: ${op}`) || x.includes(` ${op}:`));
      if (broken.length) return stop({ status: 'rejected', layer: 5 }, 409, 'contract-broken', `Kontrak konektor ${r.connector_kode} berubah (breaking change) pada ${op}`,
        'Tinjau perubahan kontrak di EIO Control Center lalu terima baseline baru, atau perbarui rute.', { breakingChanges: broken });
      const t = eioTarget(r.connector_kode);
      if (!t) return stop({ status: 'failed', layer: 5 }, 503, 'service-unavailable', `Target konektor ${r.connector_kode} belum dikonfigurasi`, `Atur ${eioEnvName(r.connector_kode)} (URL http/https) pada API.`);
      const retryOk = ['GET', 'PUT', 'DELETE'].includes(r.method) || !!idemKey;    // POST/PATCH tanpa Idempotency-Key tidak diulang
      let call: CallResult = await callTarget(t, r.method, path!, mapped, headers); let attempts = 1;
      while (!call.ok && call.retryable && retryOk && attempts <= EIO_LIMITS.maxRetries) { await sleep(200 * 2 ** (attempts - 1)); call = await callTarget(t, r.method, path!, mapped, headers); attempts++; }
      if (!call.ok) return stop({ status: 'failed', layer: 5, httpStatus: call.status, error: `${call.error} (percobaan ${attempts})` }, 502, 'upstream-error',
        `Target ${r.connector_kode} gagal`, `${call.error} (percobaan ${attempts})`, { upstream: { status: call.status, body: call.data } });
      out = Object.keys(r.response_map ?? {}).length ? applyMap(r.response_map, call.data) : call.data;
      targetInfo = { connector: r.connector_kode, method: r.method, path, httpStatus: call.status, attempts, durationMs: call.ms };
      await log({ status: 'ok', layer: 6, httpStatus: call.status });
    } else {
      let run;
      try {
        ({ run } = await this.saga.start(p, r.saga_flow_id, { input: mapped, mode: 'live', runKey: idemKey ? `eio:${r.kode}:${idemKey}` : null }));
      } catch (e: any) {
        const st = e?.getStatus?.() ?? (e?.code === '42501' ? 403 : 500);
        return stop({ status: st >= 500 ? 'failed' : 'rejected', layer: 5 }, st, 'saga-unavailable', 'Saga target rute tidak dapat dijalankan', e?.response?.title ?? e?.response?.detail ?? String(e?.message ?? e));
      }
      sagaRunId = run.id;
      if (run.status !== 'completed')
        return stop({ status: 'failed', layer: 5, sagaRunId, error: `saga ${run.status}: ${run.error ?? ''}` }, 502, 'saga-failed', `Saga ${r.saga_flow_nama} berakhir ${run.status}`, run.error ?? undefined,
          { sagaRun: { id: run.id, status: run.status, failedStep: run.failedStep } });
      out = { sagaRunId: run.id, status: run.status, steps: (run.steps ?? []).filter((s) => s.status === 'ok' && s.phase === 'action').map((s) => ({ step: s.step, result: s.detail?.result ?? null })) };
      targetInfo = { sagaFlow: r.saga_flow_nama, sagaRunId: run.id, status: run.status };
      await log({ status: 'ok', layer: 6, sagaRunId });
    }
    layers.push({ layer: 5, name: 'Orkestrasi', note: r.target_kind === 'connector' ? `konektor ${r.connector_kode}` : `saga ${r.saga_flow_nama}` });
    layers.push({ layer: 6, name: 'Publikasi peristiwa', note: 'eap.console.eio_exchange_completed' });
    return { ...base, status: 'ok', layers, target: targetInfo, sagaRunId, data: out };
  }
}
