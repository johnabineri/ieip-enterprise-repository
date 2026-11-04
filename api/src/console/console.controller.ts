import { createHash } from 'crypto';
import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { computeIka, CRITERIA } from './ika';
import { snapshot } from './metrics';

const KLAS = ['publik', 'internal', 'terbatas', 'rahasia'];
class ModelDto {
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/) @MaxLength(100) kode: string;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsOptional() @IsString() @MaxLength(100) penyedia?: string;
  @IsIn(['cloud', 'on-prem']) lokasi: string;
  @IsOptional() @IsString() @MaxLength(100) lisensi?: string;
  @IsOptional() @IsString() @MaxLength(300) guna?: string;
  @IsIn(KLAS) klasifikasiMaks: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) risiko?: string;
  @IsOptional() @IsIn(['aktif', 'evaluasi', 'nonaktif']) status?: string;
  @IsOptional() @IsNumber() @Min(0) hargaInPer1k?: number;
  @IsOptional() @IsNumber() @Min(0) hargaOutPer1k?: number;
}
class PatchModelDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsIn(['cloud', 'on-prem']) lokasi?: string;
  @IsOptional() @IsIn(KLAS) klasifikasiMaks?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) risiko?: string;
  @IsOptional() @IsIn(['aktif', 'evaluasi', 'nonaktif']) status?: string;
  @IsOptional() @IsNumber() @Min(0) hargaInPer1k?: number;
  @IsOptional() @IsNumber() @Min(0) hargaOutPer1k?: number;
}
class DatasetDto {
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsIn(['pgvector', 'qdrant', 'lainnya']) store: string;
  @IsIn(KLAS) klasifikasi: string;
  @IsOptional() @IsBoolean() pii?: boolean;
  @IsOptional() @IsUUID() modelId?: string;
}
class InvoiceDto {
  @Matches(/^\d{4}-\d{2}$/) periode: string;
  @IsString() @MaxLength(100) modelName: string;
  @IsNumber() @Min(0) billedTokens: number;
  @IsNumber() @Min(0) billedIdr: number;
}
class ConnectorDto {
  @Matches(/^[A-Z0-9][A-Z0-9_.-]*$/) @MaxLength(50) kode: string;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsOptional() @IsIn(['openapi', 'event']) tipe?: string;
  @IsString() @MaxLength(100) sumber: string;
  @IsString() @MaxLength(100) target: string;
  @IsOptional() @Matches(/^https?:\/\//) @MaxLength(500) healthUrl?: string;
  @IsOptional() @Matches(/^https?:\/\//) @MaxLength(500) specUrl?: string;
  @IsOptional() @IsUUID() entityId?: string;
}
class SwitchDto {
  @IsBoolean() enabled: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

const modelDto = (r: any) => ({ id: r.id, kode: r.kode, nama: r.nama, penyedia: r.penyedia, lokasi: r.lokasi, lisensi: r.lisensi, guna: r.guna, klasifikasiMaks: r.klasifikasi_maks, risiko: r.risiko,
  status: r.status, hargaInPer1k: Number(r.harga_in_per_1k), hargaOutPer1k: Number(r.harga_out_per_1k), version: r.row_version });
const dsDto = (r: any) => ({ id: r.id, nama: r.nama, store: r.store, klasifikasi: r.klasifikasi, pii: r.pii, modelId: r.model_id, modelKode: r.model_kode ?? null, modelLokasi: r.model_lokasi ?? null });
const conDto = (r: any) => ({ id: r.id, kode: r.kode, nama: r.nama, tipe: r.tipe, sumber: r.sumber, target: r.target, healthUrl: r.health_url, specUrl: r.spec_url, entityId: r.entity_id,
  status: r.status, lastCheckAt: r.last_check_at, lastLatencyMs: r.last_latency_ms, lastError: r.last_error, specHash: r.spec_hash, baseline: r.spec_snapshot ? Object.keys(r.spec_snapshot).length : 0,
  breakingChanges: r.breaking_changes, version: r.row_version });

// ---------- EIO: health check + deteksi breaking change kontrak OpenAPI ----------
const BLOCKED_HOSTS = /^(169\.254\.|metadata\.google\.internal$|fd00:ec2::254)/i;
async function httpGet(url: string, timeoutMs = 5000): Promise<{ status: number; ms: number; body: string }> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || BLOCKED_HOSTS.test(u.hostname)) throw new Error('URL tidak diizinkan (hanya http/https, bukan metadata cloud)');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs); const t0 = performance.now();
  try { const r = await fetch(url, { signal: ctl.signal, redirect: 'manual' }); const body = (await r.text()).slice(0, 2_000_000); return { status: r.status, ms: Math.round(performance.now() - t0), body }; }
  finally { clearTimeout(timer); }
}
/** Ringkasan kontrak: {"METODE /path": [parameter wajib…]} — dasar diff breaking change. */
export function summarizeSpec(spec: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [path, item] of Object.entries<any>(spec?.paths ?? {})) {
    for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = item?.[m]; if (!op) continue;
      const req = [...(item.parameters ?? []), ...(op.parameters ?? [])].filter((p: any) => p?.required).map((p: any) => `${p.in}:${p.name}`);
      if (op.requestBody?.required) req.push('body');
      out[`${m.toUpperCase()} ${path}`] = [...new Set(req)].sort();
    }
  }
  return out;
}
export function diffSpec(base: Record<string, string[]>, cur: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [k, req] of Object.entries(base)) {
    if (!(k in cur)) { out.push(`operasi dihapus: ${k}`); continue; }
    const added = cur[k].filter((x) => !req.includes(x)); if (added.length) out.push(`parameter wajib baru pada ${k}: ${added.join(', ')}`);
  }
  return out;
}

/**
 * CONSOLE: IKA terhitung (EAW-08), register model AI (GOV-02/D-05), FinOps (FIN-01), konektor EIO (EIO-04), observabilitas (OPS-01), kill-switch (SEC-01).
 * Setiap angka berasal dari data/metrik nyata; modul yang butuh infrastruktur yang belum ada dinyatakan di respons (`note`).
 */
@Controller('api/v1/console')
export class ConsoleController {
  constructor(private readonly db: DbService) {}

  // ================= IKA =================
  @Get('ika') @RequirePermission('console.dashboard.read')
  ika(@CurrentUser() p: Principal) { return this.db.tx(p, (c) => computeIka(c)); }

  @Get('ika/trend') @RequirePermission('console.dashboard.read')
  trend(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query(`SELECT snapshot_date AS date, round(avg(level)::numeric, 2)::float AS avg_level, count(*)::int AS entities
      FROM console.ika_snapshot GROUP BY 1 ORDER BY 1 DESC LIMIT 24`)).rows.reverse().map((r) => ({ date: r.date, avgLevel: r.avg_level, entities: r.entities })), criteria: CRITERIA }));
  }

  /** Menyimpan skor IKA terhitung hari ini (upsert). Hanya peran lihat-semua (snapshot sebagian akan menyesatkan tren). */
  @Post('ika/snapshot') @HttpCode(200) @RequirePermission('console.dashboard.write')
  snap(@CurrentUser() p: Principal) {
    if (!p.viewAll && !p.editAll) throw new ProblemException(403, 'forbidden', 'Snapshot IKA memerlukan peran lihat-semua', 'Snapshot dari cakupan sebagian akan menyesatkan tren.');
    return this.db.tx(p, async (c) => {
      const r = await computeIka(c); const scored = r.entities.filter((e) => e.objects > 0);
      for (const e of scored) {
        await c.query(`INSERT INTO console.ika_snapshot (entity_id, level, domain_levels, objects, taken_by) VALUES ($1,$2,$3::jsonb,$4,$5)
          ON CONFLICT (snapshot_date, entity_id) DO UPDATE SET level = EXCLUDED.level, domain_levels = EXCLUDED.domain_levels, objects = EXCLUDED.objects, taken_by = EXCLUDED.taken_by, taken_at = clock_timestamp()`,
          [e.id, e.level, JSON.stringify(Object.fromEntries(e.domains.map((d) => [d.domain, d.level]))), e.objects, p.userId]);
      }
      return { entities: scored.length, groupAverage: r.groupAverage };
    });
  }

  // ================= register model AI & dataset =================
  @Get('ai/models') @RequirePermission('console.dashboard.read')
  models(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM console.ai_model WHERE deleted_at IS NULL ORDER BY lokasi, kode')).rows.map(modelDto) }));
  }
  @Post('ai/models') @HttpCode(201) @RequirePermission('console.ai.admin')
  createModel(@CurrentUser() p: Principal, @Body() b: ModelDto) {
    return this.db.tx(p, async (c) => modelDto((await c.query(
      `INSERT INTO console.ai_model (kode, nama, penyedia, lokasi, lisensi, guna, klasifikasi_maks, risiko, status, harga_in_per_1k, harga_out_per_1k)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'medium'),COALESCE($9,'evaluasi'),COALESCE($10,0),COALESCE($11,0)) RETURNING *`,
      [b.kode, b.nama, b.penyedia ?? null, b.lokasi, b.lisensi ?? null, b.guna ?? null, b.klasifikasiMaks, b.risiko ?? null, b.status ?? null, b.hargaInPer1k ?? null, b.hargaOutPer1k ?? null])).rows[0]));
  }
  @Patch('ai/models/:id') @RequirePermission('console.ai.admin')
  patchModel(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PatchModelDto) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM console.ai_model WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('model tidak ditemukan');
      assertVersion(v, cur.row_version);
      return modelDto((await c.query(`UPDATE console.ai_model SET nama = COALESCE($2, nama), lokasi = COALESCE($3, lokasi), klasifikasi_maks = COALESCE($4, klasifikasi_maks), risiko = COALESCE($5, risiko),
        status = COALESCE($6, status), harga_in_per_1k = COALESCE($7, harga_in_per_1k), harga_out_per_1k = COALESCE($8, harga_out_per_1k) WHERE id = $1 RETURNING *`,
        [id, b.nama ?? null, b.lokasi ?? null, b.klasifikasiMaks ?? null, b.risiko ?? null, b.status ?? null, b.hargaInPer1k ?? null, b.hargaOutPer1k ?? null])).rows[0]);
    });
  }
  @Delete('ai/models/:id') @HttpCode(204) @RequirePermission('console.ai.admin')
  removeModel(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      if ((await c.query('SELECT 1 FROM console.rag_dataset WHERE model_id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new ProblemException(409, 'invalid-state', 'Model masih dipakai dataset RAG');
      if (!(await c.query('UPDATE console.ai_model SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id])).rowCount) throw new NotFoundException('model tidak ditemukan');
    });
  }
  @Get('ai/datasets') @RequirePermission('console.dashboard.read')
  datasets(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query(`SELECT d.*, m.kode AS model_kode, m.lokasi AS model_lokasi FROM console.rag_dataset d LEFT JOIN console.ai_model m ON m.id = d.model_id
       WHERE d.deleted_at IS NULL ORDER BY d.nama`)).rows.map(dsDto) }));
  }
  @Post('ai/datasets') @HttpCode(201) @RequirePermission('console.ai.admin')
  createDataset(@CurrentUser() p: Principal, @Body() b: DatasetDto) {
    return this.db.tx(p, async (c) => {
      const id = (await c.query('INSERT INTO console.rag_dataset (nama, store, klasifikasi, pii, model_id) VALUES ($1,$2,$3,COALESCE($4,false),$5) RETURNING id',
        [b.nama, b.store, b.klasifikasi, b.pii ?? null, b.modelId ?? null])).rows[0].id;
      return dsDto((await c.query('SELECT d.*, m.kode AS model_kode, m.lokasi AS model_lokasi FROM console.rag_dataset d LEFT JOIN console.ai_model m ON m.id = d.model_id WHERE d.id = $1', [id])).rows[0]);
    });
  }
  @Delete('ai/datasets/:id') @HttpCode(204) @RequirePermission('console.ai.admin')
  removeDataset(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE console.rag_dataset SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('dataset tidak ditemukan'); });
  }

  // ================= FinOps =================
  /** Showback bulanan dari metering NYATA + rekonsiliasi terhadap faktur penyedia (FIN-01: selisih <= 2%). */
  @Get('finops/summary') @RequirePermission('console.finops.read')
  finops(@CurrentUser() p: Principal, @Query('month') month?: string) {
    const m = month ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) throw new ProblemException(400, 'bad-request', 'month harus YYYY-MM');
    return this.db.tx(p, async (c) => {
      const w = `occurred_at >= $1::date AND occurred_at < ($1::date + interval '1 month')`; const a = [`${m}-01`];
      const tot = (await c.query(`SELECT COALESCE(sum(prompt_tokens),0)::bigint AS pin, COALESCE(sum(completion_tokens),0)::bigint AS pout, COALESCE(sum(cost_idr),0) AS cost, count(*)::int AS calls FROM console.token_usage WHERE ${w}`, a)).rows[0];
      const byEntity = (await c.query(`SELECT COALESCE(g.code, '(tidak teralokasi)') AS code, COALESCE(g.name, '(tidak teralokasi)') AS name, sum(u.prompt_tokens + u.completion_tokens)::bigint AS tokens, sum(u.cost_idr) AS cost
        FROM console.token_usage u LEFT JOIN ref.business_groups g ON g.id = u.entity_id WHERE ${w.replace(/occurred_at/g, 'u.occurred_at')} GROUP BY 1,2 ORDER BY 4 DESC`, a)).rows;
      const byModel = (await c.query(`SELECT model_name, sum(prompt_tokens + completion_tokens)::bigint AS tokens, sum(cost_idr) AS cost, count(*)::int AS calls FROM console.token_usage WHERE ${w} GROUP BY 1 ORDER BY 3 DESC`, a)).rows;
      const byWs = (await c.query(`SELECT workspace, sum(prompt_tokens + completion_tokens)::bigint AS tokens, sum(cost_idr) AS cost FROM console.token_usage WHERE ${w} GROUP BY 1 ORDER BY 3 DESC`, a)).rows;
      const daily = (await c.query(`SELECT occurred_at::date AS d, sum(prompt_tokens + completion_tokens)::bigint AS tokens FROM console.token_usage WHERE ${w} GROUP BY 1 ORDER BY 1`, a)).rows;
      const inv = (await c.query(`SELECT i.model_name, i.billed_tokens, i.billed_idr,
          COALESCE((SELECT sum(prompt_tokens + completion_tokens) FROM console.token_usage u WHERE u.model_name = i.model_name AND ${w.replace(/occurred_at/g, 'u.occurred_at')}), 0)::bigint AS metered_tokens,
          COALESCE((SELECT sum(cost_idr) FROM console.token_usage u WHERE u.model_name = i.model_name AND ${w.replace(/occurred_at/g, 'u.occurred_at')}), 0) AS metered_idr
        FROM console.provider_invoice i WHERE i.periode = $1::date AND i.deleted_at IS NULL ORDER BY i.model_name`, a)).rows
        .map((r: any) => { const diff = Number(r.billed_tokens) ? Math.abs(Number(r.billed_tokens) - Number(r.metered_tokens)) / Number(r.billed_tokens) * 100 : (Number(r.metered_tokens) ? 100 : 0);
          return { modelName: r.model_name, billedTokens: Number(r.billed_tokens), meteredTokens: Number(r.metered_tokens), billedIdr: Number(r.billed_idr), meteredIdr: Number(r.metered_idr), diffPct: Math.round(diff * 100) / 100, withinTarget: diff <= 2 }; });
      return { month: m, totals: { promptTokens: Number(tot.pin), completionTokens: Number(tot.pout), costIdr: Number(tot.cost), calls: tot.calls },
        byEntity: byEntity.map((r: any) => ({ code: r.code, name: r.name, tokens: Number(r.tokens), costIdr: Number(r.cost) })), byModel: byModel.map((r: any) => ({ modelName: r.model_name, tokens: Number(r.tokens), costIdr: Number(r.cost), calls: r.calls })),
        byWorkspace: byWs.map((r: any) => ({ workspace: r.workspace, tokens: Number(r.tokens), costIdr: Number(r.cost) })), daily: daily.map((r: any) => ({ date: r.d, tokens: Number(r.tokens) })),
        reconciliation: { targetPct: 2, invoices: inv }, note: 'Metering mencatat panggilan LLM yang dilakukan EAP sendiri (saat ini: REQ mode LLM). Pemakaian di luar EAP tidak terukur.' };
    });
  }
  @Get('finops/invoices') @RequirePermission('console.finops.read')
  invoices(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM console.provider_invoice WHERE deleted_at IS NULL ORDER BY periode DESC, model_name LIMIT 100')).rows.map((r) => ({ id: r.id, periode: r.periode, modelName: r.model_name, billedTokens: Number(r.billed_tokens), billedIdr: Number(r.billed_idr) })) }));
  }
  @Post('finops/invoices') @HttpCode(201) @RequirePermission('console.ai.admin')
  createInvoice(@CurrentUser() p: Principal, @Body() b: InvoiceDto) {
    return this.db.tx(p, async (c) => { const r = (await c.query('INSERT INTO console.provider_invoice (periode, model_name, billed_tokens, billed_idr) VALUES ($1,$2,$3,$4) RETURNING *', [`${b.periode}-01`, b.modelName, b.billedTokens, b.billedIdr])).rows[0];
      return { id: r.id, periode: r.periode, modelName: r.model_name, billedTokens: Number(r.billed_tokens), billedIdr: Number(r.billed_idr) }; });
  }

  // ================= EIO =================
  @Get('eio/connectors') @RequirePermission('console.dashboard.read')
  connectors(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM console.eio_connector WHERE deleted_at IS NULL ORDER BY kode')).rows.map(conDto) }));
  }
  @Post('eio/connectors') @HttpCode(201) @RequirePermission('console.eio.write')
  createConnector(@CurrentUser() p: Principal, @Body() b: ConnectorDto) {
    return this.db.tx(p, async (c) => conDto((await c.query(`INSERT INTO console.eio_connector (kode, nama, tipe, sumber, target, health_url, spec_url, entity_id) VALUES ($1,$2,COALESCE($3,'openapi'),$4,$5,$6,$7,$8) RETURNING *`,
      [b.kode, b.nama, b.tipe ?? null, b.sumber, b.target, b.healthUrl ?? null, b.specUrl ?? null, b.entityId ?? null])).rows[0]));
  }
  @Delete('eio/connectors/:id') @HttpCode(204) @RequirePermission('console.eio.write')
  removeConnector(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE console.eio_connector SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('konektor tidak ditemukan'); });
  }
  /** Health check HTTP + (bila specUrl) diff kontrak OpenAPI terhadap baseline; pemeriksaan pertama menetapkan baseline. */
  @Post('eio/connectors/:id/check') @HttpCode(200) @RequirePermission('console.eio.write')
  async check(@CurrentUser() p: Principal, @Param('id') id: string) { return this.runCheck(p, uuidOr400(id), false); }
  /** Menerima kontrak terkini sebagai baseline baru (setelah breaking change ditinjau). */
  @Post('eio/connectors/:id/baseline') @HttpCode(200) @RequirePermission('console.eio.write')
  async baseline(@CurrentUser() p: Principal, @Param('id') id: string) { return this.runCheck(p, uuidOr400(id), true); }

  private async runCheck(p: Principal, id: string, reset: boolean) {
    const con = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM console.eio_connector WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0]);
    if (!con) throw new NotFoundException('konektor tidak ditemukan');
    let status = 'unknown'; let latency: number | null = null; let error: string | null = null; let hash = con.spec_hash; let snap = con.spec_snapshot; let breaking: string[] = [];
    if (con.health_url) {
      try { const r = await httpGet(con.health_url); latency = r.ms; status = r.status >= 200 && r.status < 300 ? (r.ms > 1000 ? 'degraded' : 'up') : 'down'; if (status === 'down') error = `HTTP ${r.status}`; }
      catch (e) { status = 'down'; error = (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message; }
    }
    if (con.spec_url) {
      try {
        const r = await httpGet(con.spec_url); if (r.status < 200 || r.status >= 300) throw new Error(`spec HTTP ${r.status}`);
        const cur = summarizeSpec(JSON.parse(r.body)); hash = createHash('sha256').update(JSON.stringify(cur)).digest('hex');
        if (!snap || reset) { snap = cur; breaking = []; } else breaking = diffSpec(snap, cur);
      } catch (e) { error = [error, `spec: ${(e as Error).message}`].filter(Boolean).join('; '); if (status === 'up') status = 'degraded'; }
    }
    return this.db.tx(p, async (c) => conDto((await c.query(`UPDATE console.eio_connector SET status = $2, last_check_at = now(), last_latency_ms = $3, last_error = $4, spec_hash = $5, spec_snapshot = $6::jsonb, breaking_changes = $7::jsonb
      WHERE id = $1 RETURNING *`, [id, status, latency, error, hash, snap ? JSON.stringify(snap) : null, JSON.stringify(breaking)])).rows[0]));
  }

  // ================= observabilitas =================
  @Get('obs') @RequirePermission('console.dashboard.read')
  async obs(@CurrentUser() p: Principal) {
    const t0 = performance.now();
    const db = await this.db.tx(p, async (c) => {
      await c.query('SELECT 1'); const ms = Math.round((performance.now() - t0) * 10) / 10;
      let repl: any[] | null = null;
      try { repl = (await c.query(`SELECT subname, pid IS NOT NULL AS active, received_lsn::text AS received_lsn, latest_end_time, EXTRACT(EPOCH FROM (now() - latest_end_time))::int AS lag_s FROM pg_stat_subscription WHERE subname IS NOT NULL`)).rows; } catch { repl = null; }
      return { ms, replication: repl && repl.map((r: any) => ({ name: r.subname, active: r.active, lagSeconds: r.lag_s, lastMessageAt: r.latest_end_time })) };
    });
    const targets: Array<{ name: string; url: string; status: string; ms: number | null; error?: string }> = [];
    for (const t of (process.env.OBS_TARGETS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
      const [name, ...u] = t.split('='); const url = u.join('=');
      try { const r = await httpGet(url, 3000); targets.push({ name, url, status: r.status >= 200 && r.status < 300 ? 'up' : 'down', ms: r.ms }); }
      catch (e) { targets.push({ name, url, status: 'down', ms: null, error: (e as Error).message }); }
    }
    const m = snapshot();
    return { api: m, db: { pingMs: db.ms, replication: db.replication }, targets,
      slo: [{ name: 'Ketersediaan API (non-5xx)', target: '99,9%', actual: m.requests ? Math.round((100 - m.errorRate) * 1000) / 1000 : null, ok: m.requests ? m.errorRate <= 0.1 : null },
            { name: 'Latensi p95', target: '≤ 400 ms', actual: m.requests ? m.p95Ms : null, ok: m.requests ? m.p95Ms <= 400 : null }],
      note: 'Metrik in-memory proses API ini sejak start (bukan agregat lintas replika). Trace OpenTelemetry dan SLO per workspace belum tersedia.' };
  }

  // ================= kill-switch & log guardrail =================
  @Get('security/switches') @RequirePermission('console.dashboard.read')
  switches(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT s.*, u.idp_subject AS by_sub FROM console.agent_switch s LEFT JOIN set.users u ON u.id = s.updated_by WHERE s.deleted_at IS NULL ORDER BY s.kode')).rows
      .map((r: any) => ({ kode: r.kode, nama: r.nama, deskripsi: r.deskripsi, enforced: r.enforced, enabled: r.enabled, reason: r.reason, changedAt: r.updated_at ?? r.created_at, version: r.row_version })) }));
  }
  /** Menonaktifkan/mengaktifkan agen. `enforced=true` berarti kode mesin memeriksa saklar ini SEBELUM tiap pemanggilan (efek segera, < 1 dtk). */
  @Post('security/switches/:kode') @HttpCode(200) @RequirePermission('console.security.admin')
  setSwitch(@CurrentUser() p: Principal, @Param('kode') kode: string, @Body() b: SwitchDto) {
    if (!b.enabled && !(b.reason && b.reason.trim().length >= 5)) throw new ProblemException(422, 'validation-failed', 'Alasan wajib (min. 5 karakter) saat menonaktifkan agen');
    return this.db.tx(p, async (c) => {
      const r = (await c.query('UPDATE console.agent_switch SET enabled = $2, reason = $3 WHERE kode = $1 AND deleted_at IS NULL RETURNING *', [kode, b.enabled, b.reason ?? null])).rows[0];
      if (!r) throw new NotFoundException('saklar tidak ditemukan atau tanpa izin');
      return { kode: r.kode, enabled: r.enabled, enforced: r.enforced, reason: r.reason, changedAt: r.updated_at };
    });
  }
  @Get('security/guard-log') @RequirePermission('console.security.admin')
  guardLog(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const t = (await c.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today, COALESCE(round(avg(ms))::int,0) AS avg_ms FROM req.guard_log`)).rows[0];
      const rows = (await c.query('SELECT id, engine, category, excerpt, ms, created_at FROM req.guard_log ORDER BY id DESC LIMIT 50')).rows;
      return { total: t.total, today: t.today, avgMs: t.avg_ms, data: rows };
    });
  }
}
