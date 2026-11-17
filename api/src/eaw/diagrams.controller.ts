import { createHash, randomUUID } from 'crypto';
import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { FastifyReply as Response } from 'fastify';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, etagOf, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { importExchange, ImportReport } from './exchange-import';
import { validateExchangeXsd, XsdResult, XsdUnavailable } from './xsd';
import { ARCHI_TO_EAW, BINDABLE, Content, DEFAULT_ELEMENT, EAW_TO_ARCHI, ELEMENTS, NODE_H, NODE_W, normalize, RELATIONS, toExchangeXml, toSvg, validate } from './archimate';

const OBJ_TYPES = Object.keys(BINDABLE);
class CreateDiagramDto {
  @IsUUID() entityId: string;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  @IsOptional() @IsUUID() frameworkId?: string;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
}
class PutDiagramDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsUUID() frameworkId?: string;
  @IsObject() content: Record<string, unknown>;
}
class ImportXmlDto {
  @IsUUID() entityId: string;
  @IsString() @MinLength(10) @MaxLength(2_000_000) xml: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsString() @MaxLength(200) view?: string;
  @IsOptional() @IsString() @MaxLength(200) filename?: string;
  @IsOptional() @IsBoolean() dryRun?: boolean;
  /** 'strict' (bawaan): galat XSD memblokir impor. 'warn': galat XSD dilaporkan sebagai peringatan dan impor tetap boleh di-commit. */
  @IsOptional() @IsIn(['strict', 'warn']) xsd?: 'strict' | 'warn';
}
class Rollback extends Error { constructor(public body: unknown) { super('rollback'); } }
class ImportDto {
  @IsIn(OBJ_TYPES) objectType: string;
  @IsUUID() objectId: string;
}

const dto = (r: any, withContent = true) => {
  const c = r.content as Content;
  return { id: r.id, nama: r.nama, entityId: r.entity_id, entityCode: r.entity_code, frameworkId: r.framework_id, nodeCount: c.nodes.length, edgeCount: c.edges.length, version: r.row_version, updatedAt: r.updated_at ?? r.created_at,
    ...(withContent ? { content: c, validation: validate(c) } : {}) };
};
const SEL = 'SELECT d.*, g.code AS entity_code FROM eaw.diagram d JOIN ref.business_groups g ON g.id = d.entity_id';
const TABLE: Record<string, string> = { application: 'eaw.application', service: 'eaw.service', process: 'eaw.process', data_entity: 'eaw.data_entity', infra_asset: 'eaw.infra_asset', control: 'eaw.control' };

/** Pengikatan node ke objek EAW harus menunjuk objek yang ADA dan TERLIHAT pemanggil (RLS); label tidak dipercaya dari klien. */
async function checkBindings(c: any, content: Content) {
  for (const n of content.nodes) {
    if (!n.objectType) continue;
    const r = (await c.query('SELECT eaw.object_label($1, $2) AS l', [n.objectType, n.objectId])).rows[0];
    if (!r.l) throw new ProblemException(422, 'validation-failed', 'Pengikatan objek tidak valid', `node ${n.id}: objek ${n.objectType} ${n.objectId} tidak ditemukan atau di luar cakupan akses`);
  }
  for (const e of content.edges) {
    if (!e.relationId) continue;
    const r = (await c.query('SELECT sumber_id, target_id FROM eaw.relation WHERE id = $1 AND deleted_at IS NULL', [e.relationId])).rows[0];
    const s = content.nodes.find((n) => n.id === e.source)!, t = content.nodes.find((n) => n.id === e.target)!;
    const ok = r && ((r.sumber_id === s.objectId && r.target_id === t.objectId) || (r.sumber_id === t.objectId && r.target_id === s.objectId));
    if (!ok) throw new ProblemException(422, 'validation-failed', 'relationId tidak cocok', `relasi ${e.id}: relationId bukan relasi EAW antara kedua objek yang terikat`);
  }
}

/**
 * Kanvas ArchiMate (EAW-01): diagram tersimpan per entitas, node dapat TERIKAT ke objek EAW nyata, "impor dari model" menarik objek + relasinya,
 * "sinkron ke model" menulis relasi gambar menjadi eaw.relation (sesuai matriks relasi & kunci status), ekspor SVG dan Open Group Exchange XML.
 */
@Controller('api/v1/eaw/diagrams')
export class DiagramsController {
  constructor(private readonly db: DbService) {}

  @Get('meta') @RequirePermission('eaw.model.read')
  meta() {
    return { elements: Object.entries(ELEMENTS).map(([type, e]) => ({ type, layer: e.layer, label: e.label })), relations: RELATIONS, bindable: BINDABLE, defaults: DEFAULT_ELEMENT, node: { w: NODE_W, h: NODE_H } };
  }

  /**
   * Impor Open Group Exchange XML -> diagram baru (EAW-09). dryRun (default true) memvalidasi + mencoba menyimpan di dalam transaksi yang dibatalkan
   * (RLS entitas, nama unik) sehingga laporan sama dengan hasil commit; commit membuat diagram dan mencatat eaw.import_log (sha256). Satu view per impor.
   */
  @Post('import-xml') @HttpCode(200) @RequirePermission('eaw.model.write')
  async importXml(@CurrentUser() p: Principal, @Body() b: ImportXmlDto) {
    const dryRun = b.dryRun !== false; const { report, content } = importExchange(b.xml, { view: b.view });
    const sha = createHash('sha256').update(b.xml, 'utf8').digest('hex');
    const nama = (b.nama ?? report.modelName ?? b.filename?.replace(/\.[^.]+$/, '') ?? '').trim();
    const xsd = await this.checkXsd(b.xml, report.parsed, b.xsd ?? 'strict', report);
    const out = { ...report, xsd, sha256: sha, nama, dryRun, committed: false, diagramId: null as string | null };
    // galat struktural ATAU galat XSD (mode strict) memblokir dry-run maupun commit
    if (!content || report.errors.length) throw new ProblemException(422, 'validation-failed', 'Impor Exchange XML tidak valid', `${report.errors.length} galat`, { report: { ...out, valid: false } });
    if (nama.length < 2) { report.valid = false; report.errors.push({ message: 'nama diagram wajib (isi "nama" atau beri <name> pada model)' }); throw new ProblemException(422, 'validation-failed', 'Impor Exchange XML tidak valid', '1 galat', { report: { ...out, valid: false } }); }
    try {
      return await this.db.tx(p, async (c) => {
        await c.query('SAVEPOINT xml_sp');
        let id: string;
        try { id = (await c.query('INSERT INTO eaw.diagram (entity_id, nama, content) VALUES ($1,$2,$3::jsonb) RETURNING id', [b.entityId, nama, JSON.stringify(content)])).rows[0].id; }
        catch (e: any) {
          await c.query('ROLLBACK TO SAVEPOINT xml_sp');
          const msg = e?.code === '23505' ? `nama diagram "${nama}" sudah dipakai di entitas ini` : e?.code === '42501' ? 'tidak berhak menyusun diagram di entitas ini' : e?.code === '23503' ? 'entitas tidak ditemukan' : null;
          if (!msg) throw e;
          out.valid = false; out.errors.push({ message: msg }); throw new Rollback(out);
        }
        if (dryRun) throw new Rollback(out);
        await c.query('INSERT INTO eaw.import_log (jenis, sha256, baris, dibuat, nama_berkas) VALUES ($1,$2,$3,$4,$5)', ['diagram-xml', sha, report.counts.elements + report.counts.relationships, report.counts.nodes + report.counts.edges, b.filename ?? null]);
        return { ...out, committed: true, diagramId: id };
      });
    } catch (e) {
      if (e instanceof Rollback) { const r = e.body as typeof out; if (r.errors.length) throw new ProblemException(422, 'validation-failed', 'Impor Exchange XML tidak valid', `${r.errors.length} galat`, { report: r }); return r; }
      throw e;
    }
  }

  /**
   * Validasi XSD ArchiMate 3.1 (DI LUAR transaksi DB). Hanya dijalankan bila dokumen lolos parser aman (tanpa DOCTYPE/entitas).
   * strict: galat XSD dan validator tidak tersedia = galat yang memblokir (fail-closed). warn: diturunkan menjadi peringatan.
   */
  private async checkXsd(xml: string, parsed: boolean, mode: 'strict' | 'warn', report: ImportReport) {
    if (!parsed) return { checked: false, mode, reason: 'XML tidak lolos parser aman — XSD tidak dijalankan' };
    let r: XsdResult;
    try { r = await validateExchangeXsd(xml); }
    catch (e) {
      const msg = e instanceof XsdUnavailable ? e.message : 'validator XSD gagal';
      if (mode === 'strict') { report.valid = false; report.errors.push({ message: `XSD: ${msg} (gunakan xsd="warn" untuk melanjutkan tanpa validasi skema)` }); }
      else report.warnings.push(`XSD tidak diperiksa: ${msg}.`);
      return { checked: false, mode, reason: msg };
    }
    if (!r.valid) {
      if (mode === 'strict') { report.valid = false; for (const e of r.errors) report.errors.push({ message: `XSD: ${e.message}`, line: e.line }); }
      else report.warnings.push(`XSD: ${r.errors.length}${r.truncated ? '+' : ''} galat skema diterima karena xsd="warn" — contoh: ${r.errors.slice(0, 3).map((e) => `${e.line ? `baris ${e.line}: ` : ''}${e.message}`).join(' | ')}`);
    }
    return { checked: true, mode, valid: r.valid, schema: r.schema, errorCount: r.errors.length, ...(r.truncated ? { truncated: true } : {}), ...(mode === 'warn' && !r.valid ? { errors: r.errors } : {}) };
  }

  @Get() @RequirePermission('eaw.model.read')
  list(@CurrentUser() p: Principal, @Query('entityId') entityId?: string) {
    return this.db.tx(p, async (c) => ({ data: (await c.query(`${SEL} WHERE d.deleted_at IS NULL ${entityId ? 'AND d.entity_id = $1' : ''} ORDER BY d.nama`, entityId ? [uuidOr400(entityId, 'entityId')] : [])).rows.map((r) => dto(r, false)) }));
  }

  @Get(':id') @RequirePermission('eaw.model.read')
  async get(@CurrentUser() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(`${SEL} WHERE d.id = $1 AND d.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
    res.header('ETag', etagOf(r.row_version));
    return dto(r);
  }

  @Post() @HttpCode(201) @RequirePermission('eaw.model.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateDiagramDto, @Res({ passthrough: true }) res: Response) {
    const content = normalize(b.content ?? { nodes: [], edges: [] });
    return this.db.tx(p, async (c) => {
      await checkBindings(c, content);
      const id = (await c.query('INSERT INTO eaw.diagram (entity_id, framework_id, nama, content) VALUES ($1,$2,$3,$4::jsonb) RETURNING id', [b.entityId, b.frameworkId ?? null, b.nama, JSON.stringify(content)])).rows[0].id;
      const r = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.header('ETag', etagOf(r.row_version)); return dto(r);
    });
  }

  /** Menyimpan seluruh isi diagram (If-Match). Galat struktural → 400; peringatan metamodel dikembalikan di `validation`. */
  @Put(':id') @RequirePermission('eaw.model.write')
  put(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PutDiagramDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch); const content = normalize(b.content);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM eaw.diagram WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
      assertVersion(v, cur.row_version);
      await checkBindings(c, content);
      await c.query('UPDATE eaw.diagram SET nama = COALESCE($2, nama), framework_id = COALESCE($3, framework_id), content = $4::jsonb WHERE id = $1', [id, b.nama ?? null, b.frameworkId ?? null, JSON.stringify(content)]);
      const r = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.header('ETag', etagOf(r.row_version)); return dto(r);
    });
  }

  @Delete(':id') @HttpCode(204) @RequirePermission('eaw.model.write')
  remove(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => { if (!(await c.query('UPDATE eaw.diagram SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rowCount) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses'); });
  }

  /** Impor dari model: menambahkan objek + semua objek yang berelasi dengannya (dan relasinya) sebagai node/edge terikat. Idempoten per objek/relasi. */
  @Post(':id/import') @HttpCode(200) @RequirePermission('eaw.model.write')
  importModel(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: ImportDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version, content FROM eaw.diagram WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
      assertVersion(v, cur.row_version);
      const content: Content = cur.content;
      if (!(await c.query('SELECT eaw.object_label($1, $2) AS l', [b.objectType, b.objectId])).rows[0].l) throw new ProblemException(404, 'not-found', 'Objek tidak ditemukan atau di luar cakupan akses');
      const rels = (await c.query(`SELECT id, sumber_type, sumber_id, target_type, target_id, tipe FROM eaw.relation WHERE deleted_at IS NULL AND ((sumber_type = $1 AND sumber_id = $2) OR (target_type = $1 AND target_id = $2))`, [b.objectType, b.objectId])).rows;
      const want = new Map<string, { type: string; id: string }>([[`${b.objectType}:${b.objectId}`, { type: b.objectType, id: b.objectId }]]);
      rels.forEach((r: any) => { want.set(`${r.sumber_type}:${r.sumber_id}`, { type: r.sumber_type, id: r.sumber_id }); want.set(`${r.target_type}:${r.target_id}`, { type: r.target_type, id: r.target_id }); });
      const nodeOf = (t: string, oid: string) => content.nodes.find((n) => n.objectType === t && n.objectId === oid);
      const colCount: Record<string, number> = {}; const lane: Record<string, number> = { s: 0, b: 1, a: 2, t: 3, p: 3, m: 0, i: 3 };
      content.nodes.forEach((n) => { const k = String(Math.round(n.y / 140)); colCount[k] = Math.max(colCount[k] ?? 0, Math.round(n.x / 190) + 1); });
      let added = 0;
      for (const o of want.values()) {
        if (nodeOf(o.type, o.id)) continue;
        const label = (await c.query('SELECT eaw.object_label($1, $2) AS l', [o.type, o.id])).rows[0].l; if (!label) continue;          // di luar cakupan: dilewati
        const type = DEFAULT_ELEMENT[o.type]; const row = lane[ELEMENTS[type].layer]; const k = String(row); const col = colCount[k] ?? 0; colCount[k] = col + 1;
        content.nodes.push({ id: 'n' + randomUUID().slice(0, 8), type, label: label.length > 120 ? label.slice(0, 119) + '…' : label, x: 30 + col * 190, y: 30 + row * 140, objectType: o.type, objectId: o.id }); added++;
      }
      let edges = 0;
      for (const r of rels) {
        const s = nodeOf(r.sumber_type, r.sumber_id), t = nodeOf(r.target_type, r.target_id); if (!s || !t) continue;
        if (content.edges.some((e) => e.relationId === r.id)) continue;
        content.edges.push({ id: 'e' + randomUUID().slice(0, 8), source: s.id, target: t.id, type: EAW_TO_ARCHI[r.tipe] ?? 'association', relationId: r.id }); edges++;
      }
      const norm = normalize(content);
      await c.query('UPDATE eaw.diagram SET content = $2::jsonb WHERE id = $1', [id, JSON.stringify(norm)]);
      const row = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.header('ETag', etagOf(row.row_version));
      return { ...dto(row), imported: { nodes: added, edges } };
    });
  }

  /** Sinkron ke model: relasi antar node terikat yang belum punya relationId dibuat menjadi eaw.relation bila sah (matriks relasi, sumber Draf, cakupan). */
  @Post(':id/sync-relations') @HttpCode(200) @RequirePermission('eaw.model.write')
  sync(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version, content FROM eaw.diagram WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
      assertVersion(v, cur.row_version);
      const content: Content = cur.content; const created: string[] = []; const skipped: Array<{ edge: string; reason: string }> = [];
      for (const e of content.edges) {
        if (e.relationId) continue;
        const s = content.nodes.find((n) => n.id === e.source)!, t = content.nodes.find((n) => n.id === e.target)!;
        if (!s.objectType || !t.objectType) { skipped.push({ edge: e.id, reason: 'salah satu ujung belum terikat ke objek EAW' }); continue; }
        const tipe = ARCHI_TO_EAW[e.type]; if (!tipe) { skipped.push({ edge: e.id, reason: `relasi ${e.type} tidak ada padanannya di model EAW` }); continue; }
        // arah kanonik: coba sumber→target, lalu kebalikannya
        const dirs: Array<[DN, DN]> = [[s, t], [t, s]]; let done = false; let why = '';
        for (const [a, b2] of dirs) {
          if (!(await c.query('SELECT eaw.relation_allowed($1,$2,$3) AS ok', [a.objectType, b2.objectType, tipe])).rows[0].ok) { why = `pasangan ${a.objectType}→${b2.objectType} (${tipe}) tidak sah menurut matriks relasi EAW`; continue; }
          await c.query('SAVEPOINT s1');
          try {
            const ex = (await c.query(`SELECT id FROM eaw.relation WHERE deleted_at IS NULL AND sumber_type=$1 AND sumber_id=$2 AND target_type=$3 AND target_id=$4 AND tipe=$5`, [a.objectType, a.objectId, b2.objectType, b2.objectId, tipe])).rows[0];
            const rid = ex ? ex.id : (await c.query('INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ($1,$2,$3,$4,$5) RETURNING id', [a.objectType, a.objectId, b2.objectType, b2.objectId, tipe])).rows[0].id;
            e.relationId = rid; created.push(e.id); done = true; await c.query('RELEASE SAVEPOINT s1'); break;
          } catch (err) { await c.query('ROLLBACK TO SAVEPOINT s1'); why = (err as Error).message; }
        }
        if (!done) skipped.push({ edge: e.id, reason: why });
      }
      await c.query('UPDATE eaw.diagram SET content = $2::jsonb WHERE id = $1', [id, JSON.stringify(content)]);
      const row = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.header('ETag', etagOf(row.row_version));
      return { ...dto(row), sync: { created: created.length, skipped } };
    });
  }

  @Get(':id/svg') @RequirePermission('eaw.model.read')
  async svg(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(`${SEL} WHERE d.id = $1 AND d.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
    res.header('Content-Type', 'image/svg+xml; charset=utf-8'); res.header('Content-Disposition', `attachment; filename="${slug(r.nama)}.svg"`); res.send(toSvg(r.content, r.nama));
  }
  @Get(':id/exchange') @RequirePermission('eaw.model.read')
  async xml(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(`${SEL} WHERE d.id = $1 AND d.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
    const xml = toExchangeXml(r.content, r.nama);
    // keluaran sendiri WAJIB sah terhadap XSD resmi: bila tidak, itu bug ekspor → 500 (bukan berkas rusak yang diam-diam terunduh)
    let status = 'valid';
    try {
      const v = await validateExchangeXsd(xml);
      if (!v.valid) throw new ProblemException(500, 'internal', 'Ekspor Exchange XML tidak sah terhadap XSD', v.errors.slice(0, 5).map((e) => `${e.line ? `baris ${e.line}: ` : ''}${e.message}`).join(' | '));
    } catch (e) { if (e instanceof XsdUnavailable) status = 'not-validated'; else throw e; }
    res.header('X-ArchiMate-XSD', `${status}; schema="archimate3_Diagram.xsd 3.1"`);
    res.header('Content-Type', 'application/xml; charset=utf-8'); res.header('Content-Disposition', `attachment; filename="${slug(r.nama)}.xml"`); res.send(xml);
  }
}
type DN = { objectType?: string; objectId?: string };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';
void TABLE; void Patch;
