import { createHash } from 'crypto';
import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { assertCan, CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { parseCsv, toCsvLine } from './csv';

type K = 's' | 'i' | 'b';
interface Col { name: string; col: string; kind: K; req?: boolean; enum?: string[]; max?: number; min?: number; example: string }
interface Cfg { table: string; perm: 'eaw.model.write' | 'eaw.catalog.write'; cols: Col[]; natural?: string[]; hasEntity: boolean; hasParent?: boolean }

const C = (name: string, col: string, kind: K, example: string, o: Partial<Col> = {}): Col => ({ name, col, kind, example, ...o });
const KLAS = ['publik', 'internal', 'terbatas', 'rahasia'];
const CONFIGS: Record<string, Cfg> = {
  processes: { table: 'eaw.process', perm: 'eaw.model.write', hasEntity: true, hasParent: true, natural: ['nama'], cols: [C('nama', 'nama', 's', 'Penjualan Mobil Baru', { req: true, max: 200 }), C('level', 'level', 'i', '1', { req: true, min: 1 }),
    C('pemilikJabatan', 'pemilik_jabatan', 's', 'Direktur Penjualan', { max: 100 }), C('input', 'input', 's', 'Permintaan pelanggan', { max: 2000 }), C('output', 'output', 's', 'SPK', { max: 2000 })] },
  'data-entities': { table: 'eaw.data_entity', perm: 'eaw.model.write', hasEntity: true, natural: ['nama_kanonikal'], cols: [C('namaKanonikal', 'nama_kanonikal', 's', 'Party', { req: true, max: 200 }), C('klasifikasi', 'klasifikasi', 's', 'rahasia', { req: true, enum: KLAS }),
    C('pii', 'pii', 'b', 'ya'), C('steward', 'steward', 's', 'Petugas PDP', { max: 100 }), C('sumberOtoritatif', 'sumber_otoritatif', 's', 'kalla_cmp.mdm.parties', { max: 100 }), C('retensiHari', 'retensi_hari', 'i', '3650', { min: 0 })] },
  services: { table: 'eaw.service', perm: 'eaw.model.write', hasEntity: true, natural: ['nama'], cols: [C('nama', 'nama', 's', 'Slip Gaji Digital', { req: true, max: 200 }), C('tipe', 'tipe', 's', 'internal', { req: true, enum: ['internal', 'pelanggan-mitra'] }),
    C('kategori', 'kategori', 's', 'pendukung', { req: true, enum: ['utama', 'pendukung'] }), C('pemilik', 'pemilik', 's', 'Direktur SDM', { max: 100 }), C('slo', 'slo', 's', '99,5%', { max: 200 }), C('kanal', 'kanal', 's', 'Web, Mobile', { max: 100 })] },
  'infra-assets': { table: 'eaw.infra_asset', perm: 'eaw.model.write', hasEntity: true, natural: ['nama'], cols: [C('nama', 'nama', 's', 'Klaster K8s Prod', { req: true, max: 200 }), C('tipe', 'tipe', 's', 'klaster-k8s', { req: true, enum: ['klaster-k8s', 'klaster-db', 'gpu', 'jaringan', 'cloud', 'dc-fisik'] }),
    C('lokasi', 'lokasi', 's', 'Makassar (DC-1)', { max: 100 }), C('kapasitas', 'kapasitas', 's', '24 node', { max: 100 }), C('drTier', 'dr_tier', 's', 'Tier 1', { max: 20 })] },
  controls: { table: 'eaw.control', perm: 'eaw.model.write', hasEntity: true, natural: ['aspek', 'standar_rujukan'], cols: [C('aspek', 'aspek', 's', 'kerahasiaan', { req: true, enum: ['kerahasiaan', 'keutuhan', 'ketersediaan', 'keaslian', 'kenirsangkalan'] }),
    C('standarRujukan', 'standar_rujukan', 's', 'UU PDP Pasal 35', { max: 100 }), C('statusPenerapan', 'status_penerapan', 's', 'sebagian', { req: true, enum: ['belum', 'sebagian', 'penuh'] })] },
  applications: { table: 'eaw.application', perm: 'eaw.catalog.write', hasEntity: true, natural: ['kode'], cols: [C('kode', 'kode', 's', 'AEGIS', { req: true, max: 50 }), C('nama', 'nama', 's', 'Enterprise Risk Management', { req: true, max: 200 }),
    C('jenis', 'jenis', 's', 'umum', { req: true, enum: ['umum', 'khusus'] }), C('jenisNode', 'jenis_node', 's', 'workspace', { enum: ['platform', 'workspace'] }), C('platform', 'platform', 's', 'BASE', { max: 50 }), C('workspace', 'workspace', 's', 'aegis', { max: 50 }),
    C('workspaceMode', 'workspace_mode', 's', 'INTERNAL_ROUTED', { enum: ['FEDERATED_REMOTE', 'INTERNAL_ROUTED'] }), C('federationScope', 'federation_scope', 's', '', { max: 100 }), C('remoteEntryUrl', 'remote_entry_url', 's', '', { max: 255 }), C('repoGit', 'repo_git', 's', 'git.kalla/base', { max: 255 }),
    C('ownerBisnis', 'owner_bisnis', 's', 'Kepala Divisi Risiko', { req: true, max: 100 }), C('timPengembang', 'owner_teknis', 's', 'Tim GRC Tech', { req: true, max: 100 }), C('risikoAi', 'risiko_ai', 's', 'low', { req: true, enum: ['none', 'low', 'medium', 'high'] }),
    C('slo', 'slo', 's', '99,5% / bulan', { req: true, max: 200 }), C('lifecycle', 'lifecycle', 's', 'planned', { enum: ['planned', 'active', 'deprecated', 'retired'] }), C('kritikalitas', 'kritikalitas', 's', 'medium', { enum: ['low', 'medium', 'high', 'critical'] }),
    C('uiStandard', 'ui_standard', 's', '', { max: 300 }), C('techStack', 'tech_stack', 's', '', { max: 2000 }), C('adopsi', 'adopsi', 'b', 'tidak')] },
};
const REL_TYPES = ['application', 'service', 'process', 'data_entity', 'infra_asset', 'control'];
const REL_TIPE = ['serving', 'used-by', 'association', 'composition', 'realization', 'access', 'assignment', 'flow', 'triggering'];
const REF_NAME: Record<string, { table: string; col: string }> = { application: { table: 'eaw.application', col: 'kode' }, service: { table: 'eaw.service', col: 'nama' }, process: { table: 'eaw.process', col: 'nama' },
  data_entity: { table: 'eaw.data_entity', col: 'nama_kanonikal' }, infra_asset: { table: 'eaw.infra_asset', col: 'nama' }, control: { table: 'eaw.control', col: 'aspek' } };
const TYPES = [...Object.keys(CONFIGS), 'relations'];
export const MAX_ROWS = 2000; const MAX_BYTES = 2_000_000;

class ImportDto {
  @IsIn(TYPES) type: string;
  @IsString() @MaxLength(MAX_BYTES) csv: string;
  /** true (bawaan) = hanya memvalidasi terhadap SELURUH constraint/trigger/RLS DB lalu membatalkan; false = commit bila 0 galat (semua-atau-tidak-sama-sekali). */
  @IsOptional() @IsBoolean() dryRun?: boolean;
  @IsOptional() @IsString() @MaxLength(200) filename?: string;
}
interface RowErr { line: number; field?: string; message: string }
class Rollback extends Error { constructor(public report: any) { super('rollback'); } }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const BOOL_T = ['ya', 'y', 'true', '1', 'yes'], BOOL_F = ['tidak', 'n', 'false', '0', 'no'];

function coerce(col: Col, raw: string): { v?: unknown; err?: string } {
  const t = raw.trim(); if (t === '') return {};
  if (col.kind === 'b') { const l = t.toLowerCase(); return BOOL_T.includes(l) ? { v: true } : BOOL_F.includes(l) ? { v: false } : { err: 'harus ya/tidak (true/false)' }; }
  if (col.kind === 'i') { const n = Number(t.replace(/^L/i, '')); if (!Number.isInteger(n)) return { err: 'harus bilangan bulat' }; if (col.min !== undefined && n < col.min) return { err: `minimal ${col.min}` }; return { v: n }; }
  if (col.enum) { const m = col.enum.find((e) => e.toLowerCase() === t.toLowerCase()); return m ? { v: m } : { err: `harus salah satu: ${col.enum.join(', ')}` }; }
  if (col.max && t.length > col.max) return { err: `maksimal ${col.max} karakter` };
  return { v: col.name === 'kode' || col.name === 'platform' ? t.toUpperCase() : t };
}
const friendly = (e: any): string => {
  const m = String(e.message ?? e);
  if (e.code === '42501' && /row-level security/i.test(m)) return 'tidak berhak menyusun objek ini (di luar cakupan entitas / izin)';
  if (e.code === '23505') return 'duplikat dengan data yang sudah ada';
  if (e.code === '23502') return `kolom wajib kosong (${e.column ?? ''})`;
  return m;
};

/**
 * Impor CSV (EAW-09): setiap baris dijalankan sebagai INSERT sungguhan di dalam transaksi (savepoint per baris) sehingga SELURUH constraint, trigger, dan RLS DB menjadi validator;
 * hasilnya dilaporkan per baris. dryRun membatalkan transaksi; commit hanya bila 0 galat dan bersifat semua-atau-tidak-sama-sekali. Entitas/KRA/induk dirujuk lewat KODE/NAMA, bukan UUID.
 */
@Controller('api/v1/eaw/import')
export class ImportController {
  constructor(private readonly db: DbService) {}

  @Get('template') @RequirePermission('eaw.model.read')
  template(@Query('type') type: string, @Res() res: Response) {
    if (!TYPES.includes(type)) throw new ProblemException(400, 'bad-request', 'type harus salah satu: ' + TYPES.join(', '));
    let head: string[], ex: string[];
    if (type === 'relations') { head = ['sumberType', 'sumberRef', 'targetType', 'targetRef', 'tipe']; ex = ['application', 'ASI', 'service', 'Penjualan Kendaraan', 'serving']; }
    else { const cfg = CONFIGS[type]; head = ['entityCode', ...cfg.cols.map((c) => c.name), 'referensiKode', ...(cfg.hasParent ? ['parentNama'] : [])]; ex = ['KALLA', ...cfg.cols.map((c) => c.example), '', ...(cfg.hasParent ? [''] : [])]; }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="template-${type}.csv"`);
    res.send(toCsvLine(head) + '\n' + toCsvLine(ex) + '\n');
  }

  @Get('log') @RequirePermission('eaw.model.read')
  log(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT id, jenis, sha256, baris, dibuat, nama_berkas, created_at FROM eaw.import_log ORDER BY created_at DESC LIMIT 50')).rows
      .map((r) => ({ id: r.id, type: r.jenis, sha256: r.sha256, rows: r.baris, created: r.dibuat, filename: r.nama_berkas, createdAt: r.created_at })) }));
  }

  @Post() @HttpCode(200) @RequirePermission('eaw.catalog.read')
  async run(@CurrentUser() p: Principal, @Body() b: ImportDto) {
    const dryRun = b.dryRun !== false;
    assertCan(p, b.type === 'relations' ? 'eaw.model.write' : CONFIGS[b.type].perm);
    if (Buffer.byteLength(b.csv) > MAX_BYTES) throw new ProblemException(413, 'payload-too-large', 'CSV terlalu besar');
    let csv; try { csv = parseCsv(b.csv, MAX_ROWS); } catch (e) { throw new ProblemException(422, 'validation-failed', 'CSV tidak dapat dibaca', (e as Error).message); }
    const sha = createHash('sha256').update(b.csv, 'utf8').digest('hex');
    try {
      return await this.db.tx(p, async (c) => {
        const errors: RowErr[] = []; let created = 0;
        const fatal = (m: string) => { errors.push({ line: 1, message: m }); };
        const hmap = new Map<string, number>(); csv.header.forEach((h, i) => hmap.set(norm(h), i));
        if (b.type === 'relations') created = await this.relations(c, csv, hmap, errors, fatal);
        else created = await this.objects(c, b.type, CONFIGS[b.type], csv, hmap, errors, fatal);
        const report = { type: b.type, sha256: sha, delimiter: csv.delimiter, header: csv.header, rows: csv.rows.length, errorCount: errors.length, errors: errors.slice(0, 200), valid: errors.length === 0, wouldCreate: created, committed: false, dryRun };
        if (dryRun || errors.length) throw new Rollback(report);
        await c.query('INSERT INTO eaw.import_log (jenis, sha256, baris, dibuat, nama_berkas) VALUES ($1,$2,$3,$4,$5)', [b.type, sha, csv.rows.length, created, b.filename ?? null]);
        return { ...report, committed: true, created };
      });
    } catch (e) {
      if (e instanceof Rollback) {
        if (!dryRun) throw new ProblemException(422, 'validation-failed', 'Impor dibatalkan: ada baris tidak valid', `${e.report.errorCount} galat; tidak ada data yang di-commit (semua-atau-tidak-sama-sekali).`, { report: e.report });
        return e.report;
      }
      throw e;
    }
  }

  private async objects(c: any, key: string, cfg: Cfg, csv: ReturnType<typeof parseCsv>, hmap: Map<string, number>, errors: RowErr[], fatal: (m: string) => void): Promise<number> {
    const allowed = new Map<string, Col | 'entityCode' | 'referensiKode' | 'parentNama'>([['entitycode', 'entityCode'], ['referensikode', 'referensiKode'], ...(cfg.hasParent ? [['parentnama', 'parentNama'] as const] : []), ...cfg.cols.map((col) => [norm(col.name), col] as const)]);
    const unknown = csv.header.filter((h) => !allowed.has(norm(h)));
    if (unknown.length) fatal(`kolom tidak dikenal: ${unknown.join(', ')}. Kolom sah: entityCode, ${cfg.cols.map((x) => x.name).join(', ')}, referensiKode${cfg.hasParent ? ', parentNama' : ''}`);
    const missing = ['entitycode', ...cfg.cols.filter((x) => x.req).map((x) => norm(x.name))].filter((h) => !hmap.has(h));
    if (missing.length) fatal(`kolom wajib tidak ada: ${missing.join(', ')}`);
    if (errors.length) return 0;
    const ents = new Map<string, string>((await c.query('SELECT id, code FROM eaw.entity_org WHERE is_active')).rows.map((r: any) => [String(r.code).toUpperCase(), r.id]));
    const kras = new Map<string, string>((await c.query('SELECT id, kode FROM eaw.reference WHERE deleted_at IS NULL')).rows.map((r: any) => [String(r.kode).toUpperCase(), r.id]));
    const canEdit = new Map<string, boolean>();
    const cell = (cells: string[], name: string) => { const i = hmap.get(norm(name)); return i === undefined ? '' : (cells[i] ?? ''); };
    let created = 0;
    for (const r of csv.rows) {
      const rowErr: RowErr[] = [];
      if (r.cells.length > csv.header.length) rowErr.push({ line: r.line, message: `jumlah kolom (${r.cells.length}) melebihi header (${csv.header.length}); periksa tanda kutip/delimiter` });
      const vals: Record<string, unknown> = {};
      for (const col of cfg.cols) {
        const raw = cell(r.cells, col.name);
        if (col.req && raw.trim() === '') { rowErr.push({ line: r.line, field: col.name, message: 'wajib diisi' }); continue; }
        const { v, err } = coerce(col, raw); if (err) rowErr.push({ line: r.line, field: col.name, message: err }); else if (v !== undefined) vals[col.col] = v;
      }
      const code = cell(r.cells, 'entityCode').trim().toUpperCase(); let entityId = ents.get(code);
      if (!code) rowErr.push({ line: r.line, field: 'entityCode', message: 'wajib diisi' });
      else if (!entityId) rowErr.push({ line: r.line, field: 'entityCode', message: `entitas "${code}" tidak ditemukan` });
      else { if (!canEdit.has(entityId)) canEdit.set(entityId, (await c.query('SELECT eaw.can_edit($1) AS ok', [entityId])).rows[0].ok); if (!canEdit.get(entityId)) rowErr.push({ line: r.line, field: 'entityCode', message: `tidak berhak menyusun di entitas ${code} (di luar cakupan)` }); }
      const kode = cell(r.cells, 'referensiKode').trim().toUpperCase(); if (kode) { const id = kras.get(kode); if (!id) rowErr.push({ line: r.line, field: 'referensiKode', message: `KRA "${kode}" tidak ditemukan` }); else vals.referensi_id = id; }
      if (cfg.hasParent) { const pn = cell(r.cells, 'parentNama').trim(); if (pn) { const ids = (await c.query('SELECT id FROM eaw.process WHERE nama = $1 AND deleted_at IS NULL', [pn])).rows; if (ids.length !== 1) rowErr.push({ line: r.line, field: 'parentNama', message: ids.length ? `induk "${pn}" ambigu (${ids.length} proses bernama sama)` : `induk "${pn}" tidak ditemukan (urutkan induk lebih dulu di berkas)` }); else vals.parent_id = ids[0].id; } }
      if (rowErr.length) { errors.push(...rowErr); continue; }
      vals.entity_id = entityId;
      // duplikat terhadap data yang sudah ada / baris sebelumnya (kunci alami)
      if (cfg.natural) {
        const w = cfg.natural.map((n, i) => `${n} IS NOT DISTINCT FROM $${i + 1}`); const ps = cfg.natural.map((n) => vals[n] ?? null);
        const scope = key === 'applications' ? '' : ` AND entity_id = $${ps.length + 1}`; if (scope) ps.push(entityId ?? null);
        if ((await c.query(`SELECT 1 FROM ${cfg.table} WHERE deleted_at IS NULL AND ${w.join(' AND ')}${scope} LIMIT 1`, ps)).rowCount) { errors.push({ line: r.line, message: `duplikat: ${cfg.natural.map((n) => `${n}="${vals[n] ?? ''}"`).join(', ')} sudah ada` }); continue; }
      }
      const cols = Object.keys(vals);
      await c.query('SAVEPOINT row_sp');
      try { await c.query(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((k) => vals[k])); await c.query('RELEASE SAVEPOINT row_sp'); created++; }
      catch (e) { await c.query('ROLLBACK TO SAVEPOINT row_sp'); errors.push({ line: r.line, message: friendly(e) }); }
    }
    return created;
  }

  private async relations(c: any, csv: ReturnType<typeof parseCsv>, hmap: Map<string, number>, errors: RowErr[], fatal: (m: string) => void): Promise<number> {
    const heads = ['sumbertype', 'sumberref', 'targettype', 'targetref', 'tipe'];
    const unknown = csv.header.filter((h) => !heads.includes(norm(h))); if (unknown.length) fatal(`kolom tidak dikenal: ${unknown.join(', ')}. Kolom sah: sumberType, sumberRef, targetType, targetRef, tipe`);
    const missing = heads.filter((h) => !hmap.has(h)); if (missing.length) fatal(`kolom wajib tidak ada: ${missing.join(', ')}`);
    if (errors.length) return 0;
    const cell = (cells: string[], n: string) => (cells[hmap.get(n)!] ?? '').trim();
    const cache = new Map<string, string | null | 'ambigu'>();
    const resolve = async (type: string, ref: string) => {
      const k = `${type}:${ref}`; if (cache.has(k)) return cache.get(k)!;
      const m = REF_NAME[type]; const rows = (await c.query(`SELECT id FROM ${m.table} WHERE ${m.col} = $1 AND deleted_at IS NULL`, [type === 'application' ? ref.toUpperCase() : ref])).rows;
      const v = rows.length === 1 ? rows[0].id : rows.length ? 'ambigu' : null; cache.set(k, v); return v;
    };
    let created = 0;
    for (const r of csv.rows) {
      const rowErr: RowErr[] = []; const st = cell(r.cells, 'sumbertype'), tt = cell(r.cells, 'targettype'), tipe = cell(r.cells, 'tipe').toLowerCase();
      if (!REL_TYPES.includes(st)) rowErr.push({ line: r.line, field: 'sumberType', message: `harus salah satu: ${REL_TYPES.join(', ')}` });
      if (!REL_TYPES.includes(tt)) rowErr.push({ line: r.line, field: 'targetType', message: `harus salah satu: ${REL_TYPES.join(', ')}` });
      if (!REL_TIPE.includes(tipe)) rowErr.push({ line: r.line, field: 'tipe', message: `harus salah satu: ${REL_TIPE.join(', ')}` });
      let sid: any, tid: any;
      if (!rowErr.length) {
        sid = await resolve(st, cell(r.cells, 'sumberref')); tid = await resolve(tt, cell(r.cells, 'targetref'));
        if (!sid) rowErr.push({ line: r.line, field: 'sumberRef', message: `${st} "${cell(r.cells, 'sumberref')}" tidak ditemukan` }); else if (sid === 'ambigu') rowErr.push({ line: r.line, field: 'sumberRef', message: `${st} "${cell(r.cells, 'sumberref')}" ambigu (nama ganda)` });
        if (!tid) rowErr.push({ line: r.line, field: 'targetRef', message: `${tt} "${cell(r.cells, 'targetref')}" tidak ditemukan` }); else if (tid === 'ambigu') rowErr.push({ line: r.line, field: 'targetRef', message: `${tt} "${cell(r.cells, 'targetref')}" ambigu (nama ganda)` });
      }
      if (rowErr.length) { errors.push(...rowErr); continue; }
      await c.query('SAVEPOINT row_sp');
      try { await c.query('INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ($1,$2,$3,$4,$5)', [st, sid, tt, tid, tipe]); await c.query('RELEASE SAVEPOINT row_sp'); created++; }
      catch (e) { await c.query('ROLLBACK TO SAVEPOINT row_sp'); errors.push({ line: r.line, message: friendly(e) }); }
    }
    return created;
  }
}
