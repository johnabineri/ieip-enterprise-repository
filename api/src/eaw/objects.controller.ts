import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, etagOf, pageLimit, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

type Kind = 's' | 'i' | 'b' | 'u';
interface Field { api: string; col: string; kind: Kind; req?: boolean; enum?: string[]; max?: number; min?: number }
interface Spec { type: string; table: string; fields: Field[]; label: string }
const F = (api: string, col: string, kind: Kind, o: Partial<Field> = {}): Field => ({ api, col, kind, ...o });
const COMMON: Field[] = [F('entityId', 'entity_id', 'u', { req: true })];
const KRA = F('referensiId', 'referensi_id', 'u');

/**
 * Objek domain arsitektur (Domain 1,2,3,5,6 + Kerangka Kerja). Pola seragam: Draf dapat disusun dalam cakupan entitas (RLS + eaw.can_edit),
 * status hanya lewat eaw.transition (POST /api/v1/eaw/transitions), objek non-Draf terkunci oleh DB. Validasi nilai = CHECK constraint DB (422).
 */
export const OBJECTS: Record<string, Spec> = {
  processes: { type: 'process', table: 'eaw.process', label: 'proses', fields: [
    F('nama', 'nama', 's', { req: true, max: 200 }), F('level', 'level', 'i', { req: true, min: 1 }), F('parentId', 'parent_id', 'u'),
    F('pemilikJabatan', 'pemilik_jabatan', 's', { max: 100 }), F('input', 'input', 's', { max: 2000 }), F('output', 'output', 's', { max: 2000 }), KRA, ...COMMON] },
  'data-entities': { type: 'data_entity', table: 'eaw.data_entity', label: 'entitas data', fields: [
    F('namaKanonikal', 'nama_kanonikal', 's', { req: true, max: 200 }), F('klasifikasi', 'klasifikasi', 's', { req: true, enum: ['publik', 'internal', 'terbatas', 'rahasia'] }),
    F('pii', 'pii', 'b'), F('steward', 'steward', 's', { max: 100 }), F('sumberOtoritatif', 'sumber_otoritatif', 's', { max: 100 }), F('retensiHari', 'retensi_hari', 'i', { min: 0 }), KRA, ...COMMON] },
  services: { type: 'service', table: 'eaw.service', label: 'layanan', fields: [
    F('nama', 'nama', 's', { req: true, max: 200 }), F('tipe', 'tipe', 's', { req: true, enum: ['internal', 'pelanggan-mitra'] }), F('kategori', 'kategori', 's', { req: true, enum: ['utama', 'pendukung'] }),
    F('pemilik', 'pemilik', 's', { max: 100 }), F('slo', 'slo', 's', { max: 200 }), F('kanal', 'kanal', 's', { max: 100 }), KRA, ...COMMON] },
  'infra-assets': { type: 'infra_asset', table: 'eaw.infra_asset', label: 'aset infrastruktur', fields: [
    F('nama', 'nama', 's', { req: true, max: 200 }), F('tipe', 'tipe', 's', { req: true, enum: ['klaster-k8s', 'klaster-db', 'gpu', 'jaringan', 'cloud', 'dc-fisik'] }),
    F('lokasi', 'lokasi', 's', { max: 100 }), F('kapasitas', 'kapasitas', 's', { max: 100 }), F('drTier', 'dr_tier', 's', { max: 20 }), KRA, ...COMMON] },
  controls: { type: 'control', table: 'eaw.control', label: 'kontrol keamanan', fields: [
    F('aspek', 'aspek', 's', { req: true, enum: ['kerahasiaan', 'keutuhan', 'ketersediaan', 'keaslian', 'kenirsangkalan'] }), F('standarRujukan', 'standar_rujukan', 's', { max: 100 }),
    F('statusPenerapan', 'status_penerapan', 's', { req: true, enum: ['belum', 'sebagian', 'penuh'] }), KRA, ...COMMON] },
  frameworks: { type: 'framework', table: 'eaw.framework', label: 'kerangka kerja', fields: [
    F('layananUtama', 'layanan_utama', 's', { req: true, max: 200 }), F('tipe', 'tipe', 's', { req: true, enum: ['utama', 'pendukung'] }), ...COMMON] },
};
const BY_TYPE = Object.fromEntries(Object.entries(OBJECTS).map(([k, v]) => [v.type, { ...v, path: k }]));
const READINESS_TABLE: Record<string, string> = { ...Object.fromEntries(Object.values(OBJECTS).map((o) => [o.type, o.table])), application: 'eaw.application' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parse(spec: Spec, body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProblemException(400, 'bad-request', 'Body harus objek JSON');
  const known = new Map(spec.fields.map((f) => [f.api, f]));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    const f = known.get(k);
    if (!f || (partial && f.api === 'entityId')) throw new ProblemException(400, 'bad-request', `Properti ${k} tidak dikenal${partial && k === 'entityId' ? ' / tidak dapat diubah' : ''}`);
    const v = body[k];
    if (v === null || v === undefined) { if (f.req) throw new ProblemException(400, 'bad-request', `${k} wajib diisi`); out[f.col] = null; continue; }
    if (f.kind === 's' && typeof v !== 'string') throw new ProblemException(400, 'bad-request', `${k} harus string`);
    if (f.kind === 'i' && !Number.isInteger(v)) throw new ProblemException(400, 'bad-request', `${k} harus bilangan bulat`);
    if (f.kind === 'b' && typeof v !== 'boolean') throw new ProblemException(400, 'bad-request', `${k} harus boolean`);
    if (f.kind === 'u' && (typeof v !== 'string' || !UUID.test(v))) throw new ProblemException(400, 'bad-request', `${k} harus UUID`);
    if (f.enum && !f.enum.includes(v as string)) throw new ProblemException(400, 'bad-request', `${k} harus salah satu: ${f.enum.join(', ')}`);
    if (f.max && (v as string).length > f.max) throw new ProblemException(400, 'bad-request', `${k} maksimal ${f.max} karakter`);
    if (f.min !== undefined && (v as number) < f.min) throw new ProblemException(400, 'bad-request', `${k} minimal ${f.min}`);
    out[f.col] = v;
  }
  if (!partial) for (const f of spec.fields) if (f.req && out[f.col] === undefined) throw new ProblemException(400, 'bad-request', `${f.api} wajib diisi`);
  if (partial && !Object.keys(out).length) throw new ProblemException(422, 'validation-failed', 'Tidak ada perubahan');
  return out;
}
const dto = (spec: Spec, r: any) => {
  const o: Record<string, unknown> = { id: r.id, status: r.status, entityCode: r.entity_code };
  for (const f of spec.fields) o[f.api] = r[f.col] ?? null;
  return { ...o, createdBy: r.created_by, createdAt: r.created_at, version: r.row_version };
};
const select = (spec: Spec) => `SELECT x.*, g.code AS entity_code FROM ${spec.table} x JOIN ref.business_groups g ON g.id = x.entity_id`;

/** Kesiapan relasi wajib (EAW-05) untuk objek apa pun yang punya aturan; dasar tombol "Ajukan Validasi" di UI. */
@Controller('api/v1/eaw')
export class ReadinessController {
  constructor(private readonly db: DbService) {}

  @Get('readiness/:type/:id') @RequirePermission('eaw.model.read')
  async readiness(@CurrentUser() p: Principal, @Param('type') type: string, @Param('id') id: string) {
    const table = READINESS_TABLE[type];
    if (!table) throw new ProblemException(400, 'bad-request', `jenis objek tidak dikenal: ${type}`);
    return this.db.tx(p, async (c) => {
      const row = (await c.query(`SELECT status FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [uuidOr400(id)])).rows[0];
      if (!row) throw new NotFoundException('objek tidak ditemukan atau di luar cakupan akses');
      const rules = (await c.query('SELECT rule, ok, n, pesan FROM eaw.relation_check($1, $2)', [type, id])).rows;
      return { type, id, status: row.status, ready: rules.every((r: any) => r.ok), rules };
    });
  }
}

@Controller('api/v1/eaw/objects')
export class ObjectsController {
  constructor(private readonly db: DbService) {}
  private spec(path: string): Spec {
    const s = OBJECTS[path];
    if (!s) throw new NotFoundException(`jenis objek tidak dikenal: ${path} (${Object.keys(OBJECTS).join(', ')})`);
    return s;
  }

  @Get(':path') @RequirePermission('eaw.model.read')
  list(@CurrentUser() p: Principal, @Param('path') path: string, @Query() q: Record<string, string>) {
    const spec = this.spec(path); const limit = pageLimit(q.limit);
    return this.db.tx(p, async (c) => {
      const w = ['x.deleted_at IS NULL']; const a: unknown[] = [];
      if (q.status) { a.push(q.status); w.push(`x.status = $${a.length}`); }
      if (q.entityId) { a.push(uuidOr400(q.entityId, 'entityId')); w.push(`x.entity_id = $${a.length}`); }
      if (q.cursor) { a.push(uuidOr400(q.cursor, 'cursor')); w.push(`x.id > $${a.length}`); }
      a.push(limit + 1);
      const rows = (await c.query(`${select(spec)} WHERE ${w.join(' AND ')} ORDER BY x.id LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const data = (more ? rows.slice(0, limit) : rows).map((r) => dto(spec, r));
      return { data, nextCursor: more ? (data[data.length - 1] as any).id : null };
    });
  }

  @Get(':path/:id') @RequirePermission('eaw.model.read')
  async get(@CurrentUser() p: Principal, @Param('path') path: string, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const spec = this.spec(path);
    const row = await this.db.tx(p, async (c) => (await c.query(`${select(spec)} WHERE x.id = $1 AND x.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!row) throw new NotFoundException(`${spec.label} tidak ditemukan atau di luar cakupan akses`);
    res.setHeader('ETag', etagOf(row.row_version));
    return dto(spec, row);
  }

  @Post(':path') @HttpCode(201) @RequirePermission('eaw.model.write')
  create(@CurrentUser() p: Principal, @Param('path') path: string, @Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const spec = this.spec(path); const v = parse(spec, body, false); const cols = Object.keys(v);
    return this.db.tx(p, async (c) => {
      const ins = await c.query(`INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, cols.map((k) => v[k]));
      const row = (await c.query(`${select(spec)} WHERE x.id = $1`, [ins.rows[0].id])).rows[0];
      res.setHeader('ETag', etagOf(row.row_version));
      return dto(spec, row);
    });
  }

  @Patch(':path/:id') @RequirePermission('eaw.model.write')
  patch(@CurrentUser() p: Principal, @Param('path') path: string, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const spec = this.spec(path); const ver = requireIfMatch(ifMatch); const v = parse(spec, body, true); const cols = Object.keys(v);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query(`SELECT row_version FROM ${spec.table} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException(`${spec.label} tidak ditemukan atau di luar cakupan akses`);
      assertVersion(ver, cur.row_version);
      await c.query(`UPDATE ${spec.table} SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...cols.map((k) => v[k])]);
      const row = (await c.query(`${select(spec)} WHERE x.id = $1`, [id])).rows[0];
      res.setHeader('ETag', etagOf(row.row_version));
      return dto(spec, row);
    });
  }

  /** Hapus lunak: hanya Draf dalam cakupan Anda. */
  @Delete(':path/:id') @HttpCode(204) @RequirePermission('eaw.model.write')
  remove(@CurrentUser() p: Principal, @Param('path') path: string, @Param('id') id: string) {
    const spec = this.spec(path);
    return this.db.tx(p, async (c) => {
      const r = await c.query(`UPDATE ${spec.table} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL AND status = 'Draf'`, [uuidOr400(id)]);
      if (!r.rowCount) throw new ProblemException(409, 'invalid-state', `Hanya ${spec.label} berstatus Draf (dan dalam cakupan Anda) yang dapat dihapus`);
    });
  }
}

export const objectTypes = Object.keys(BY_TYPE);
