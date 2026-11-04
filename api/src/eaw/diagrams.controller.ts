import { randomUUID } from 'crypto';
import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, etagOf, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
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

  @Get() @RequirePermission('eaw.model.read')
  list(@CurrentUser() p: Principal, @Query('entityId') entityId?: string) {
    return this.db.tx(p, async (c) => ({ data: (await c.query(`${SEL} WHERE d.deleted_at IS NULL ${entityId ? 'AND d.entity_id = $1' : ''} ORDER BY d.nama`, entityId ? [uuidOr400(entityId, 'entityId')] : [])).rows.map((r) => dto(r, false)) }));
  }

  @Get(':id') @RequirePermission('eaw.model.read')
  async get(@CurrentUser() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(`${SEL} WHERE d.id = $1 AND d.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
    res.setHeader('ETag', etagOf(r.row_version));
    return dto(r);
  }

  @Post() @HttpCode(201) @RequirePermission('eaw.model.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateDiagramDto, @Res({ passthrough: true }) res: Response) {
    const content = normalize(b.content ?? { nodes: [], edges: [] });
    return this.db.tx(p, async (c) => {
      await checkBindings(c, content);
      const id = (await c.query('INSERT INTO eaw.diagram (entity_id, framework_id, nama, content) VALUES ($1,$2,$3,$4::jsonb) RETURNING id', [b.entityId, b.frameworkId ?? null, b.nama, JSON.stringify(content)])).rows[0].id;
      const r = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.setHeader('ETag', etagOf(r.row_version)); return dto(r);
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
      const r = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.setHeader('ETag', etagOf(r.row_version)); return dto(r);
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
      const row = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.setHeader('ETag', etagOf(row.row_version));
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
      const row = (await c.query(`${SEL} WHERE d.id = $1`, [id])).rows[0]; res.setHeader('ETag', etagOf(row.row_version));
      return { ...dto(row), sync: { created: created.length, skipped } };
    });
  }

  @Get(':id/svg') @RequirePermission('eaw.model.read')
  async svg(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(`${SEL} WHERE d.id = $1 AND d.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${slug(r.nama)}.svg"`); res.send(toSvg(r.content, r.nama));
  }
  @Get(':id/exchange') @RequirePermission('eaw.model.read')
  async xml(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query(`${SEL} WHERE d.id = $1 AND d.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('diagram tidak ditemukan atau di luar cakupan akses');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${slug(r.nama)}.xml"`); res.send(toExchangeXml(r.content, r.nama));
  }
}
type DN = { objectType?: string; objectId?: string };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';
void TABLE; void Patch;
