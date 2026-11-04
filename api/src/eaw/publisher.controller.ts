import { createHash } from 'crypto';
import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { renderPdf } from './pdf';
import { buildDocument, Scope } from './publisher';

class PublishDto {
  @IsIn(['framework', 'entity']) scopeType: 'framework' | 'entity';
  @ValidateIf((o) => o.scopeType === 'framework') @IsUUID() frameworkId?: string;
  @ValidateIf((o) => o.scopeType === 'entity') @IsUUID() entityId?: string;
  @IsIn(['markdown', 'html']) format: 'markdown' | 'html';
}
const scopeOf = (t: string, fw?: string, en?: string): Scope => {
  if (t === 'framework' && fw) return { type: 'framework', id: uuidOr400(fw, 'frameworkId') };
  if (t === 'entity' && en) return { type: 'entity', id: uuidOr400(en, 'entityId') };
  throw new ProblemException(400, 'bad-request', 'scopeType + frameworkId/entityId wajib');
};
const meta = (r: any) => ({ id: r.id, scopeType: r.scope_type, frameworkId: r.framework_id, entityId: r.entity_id, entityCode: r.entity_code, format: r.format, versi: r.versi, title: r.title, sha256: r.sha256, counts: r.counts, warnings: r.warnings, bytes: r.bytes, createdBy: r.created_by, createdAt: r.created_at });
const COLS = 'p.id, p.scope_type, p.framework_id, p.entity_id, g.code AS entity_code, p.format, p.versi, p.title, p.sha256, p.counts, p.warnings, octet_length(p.content) AS bytes, p.created_by, p.created_at';

/**
 * Penerbit Dokumen Arsitektur (EAW-09, AF-08): dokumen DIHASILKAN dari data EAW. Pratinjau boleh memuat objek non-baseline; dokumen TERBIT hanya memuat baseline
 * (>= Ditetapkan), disusun ulang di server (isi tidak diterima dari klien), disimpan append-only dengan versi + sha256. Kerangka Kerja wajib memenuhi 6 domain.
 */
@Controller('api/v1/eaw')
export class PublisherController {
  constructor(private readonly db: DbService) {}

  @Get('publisher/preview') @RequirePermission('eaw.model.read')
  preview(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const scope = scopeOf(q.scopeType, q.frameworkId, q.entityId); const format = q.format === 'markdown' ? 'markdown' : 'html'; const includeDraft = q.includeDraft === 'true';
    return this.db.tx(p, async (c) => {
      const b = await buildDocument(c, scope, { includeDraft });
      const next = (await c.query('SELECT COALESCE(max(versi),0)+1 AS n FROM eaw.publication WHERE scope_key = $1 AND format = $2', [scope.id, format])).rows[0].n;
      const blockers: string[] = [];
      if (scope.type === 'framework' && b.readiness && b.readiness.some((r) => !r.ok)) blockers.push(...b.readiness.filter((r) => !r.ok).map((r) => `Kerangka belum memenuhi: ${r.pesan}`));
      if (b.counts.total === 0) blockers.push('Tidak ada objek baseline untuk dimuat');
      if (includeDraft) blockers.push('Pratinjau memuat objek non-baseline — tidak dapat diterbitkan apa adanya');
      return { title: b.title, format, content: format === 'markdown' ? b.markdown : b.html, counts: b.counts, warnings: b.warnings, nextVersion: next, canPublish: !blockers.filter((x) => !x.startsWith('Pratinjau')).length, blockers };
    });
  }

  @Post('publications') @HttpCode(201) @RequirePermission('eaw.document.approve')
  publish(@CurrentUser() p: Principal, @Body() b: PublishDto) {
    const scope = scopeOf(b.scopeType, b.frameworkId, b.entityId);
    return this.db.tx(p, async (c) => {
      const doc = await buildDocument(c, scope, { includeDraft: false });
      if (scope.type === 'framework' && doc.readiness && doc.readiness.some((r) => !r.ok)) throw new ProblemException(422, 'validation-failed', 'Kerangka Kerja belum lengkap', doc.readiness.filter((r) => !r.ok).map((r) => r.pesan).join('; '));
      if (doc.counts.total === 0) throw new ProblemException(422, 'validation-failed', 'Tidak ada objek baseline', 'Dokumen resmi hanya memuat objek berstatus Ditetapkan/Dipublikasi/Direviu.');
      const content = b.format === 'markdown' ? doc.markdown : doc.html; const sha = createHash('sha256').update(content, 'utf8').digest('hex');
      const id = (await c.query(`INSERT INTO eaw.publication (scope_type, framework_id, entity_id, scope_key, format, versi, title, content, sha256, counts, warnings) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id`,
        [scope.type, doc.frameworkId, doc.entityId, scope.id, b.format, doc.title, content, sha, JSON.stringify(doc.counts), JSON.stringify(doc.warnings)])).rows[0].id;
      return meta((await c.query(`SELECT ${COLS} FROM eaw.publication p JOIN ref.business_groups g ON g.id = p.entity_id WHERE p.id = $1`, [id])).rows[0]);
    });
  }

  @Get('publications') @RequirePermission('eaw.catalog.read')
  list(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    return this.db.tx(p, async (c) => {
      const w: string[] = []; const a: unknown[] = [];
      if (q.scopeKey) { a.push(uuidOr400(q.scopeKey, 'scopeKey')); w.push(`p.scope_key = $${a.length}`); }
      return { data: (await c.query(`SELECT ${COLS} FROM eaw.publication p JOIN ref.business_groups g ON g.id = p.entity_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.created_at DESC LIMIT 100`, a)).rows.map(meta) };
    });
  }

  @Get('publications/:id') @RequirePermission('eaw.catalog.read')
  async get(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.db.tx(p, async (c) => (await c.query(`SELECT ${COLS} FROM eaw.publication p JOIN ref.business_groups g ON g.id = p.entity_id WHERE p.id = $1`, [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('dokumen tidak ditemukan');
    return meta(r);
  }

  /** Unduh isi dokumen terbit (selalu sebagai lampiran; tidak dirender inline demi keamanan). Header X-Content-SHA256 = hash tersimpan. */
  @Get('publications/:id/content') @RequirePermission('eaw.catalog.read')
  async content(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query('SELECT scope_type, format, versi, title, content, sha256 FROM eaw.publication WHERE id = $1', [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('dokumen tidak ditemukan');
    res.setHeader('Content-Type', r.format === 'markdown' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dokumen-arsitektur-v${r.versi}.${r.format === 'markdown' ? 'md' : 'html'}"`);
    res.setHeader('X-Content-SHA256', r.sha256); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(r.content);
  }

  /** PDF dirender di server dari HTML TERSIMPAN (hash diverifikasi dulu; dokumen Markdown -> 422). */
  @Get('publications/:id/pdf') @RequirePermission('eaw.catalog.read')
  async pdf(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const r = await this.db.tx(p, async (c) => (await c.query('SELECT format, versi, content, sha256 FROM eaw.publication WHERE id = $1', [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('dokumen tidak ditemukan');
    if (r.format !== 'html') throw new ProblemException(422, 'unprocessable', 'PDF hanya untuk dokumen HTML', 'Terbitkan dokumen berformat HTML untuk mendapatkan PDF.');
    if (createHash('sha256').update(r.content, 'utf8').digest('hex') !== r.sha256) throw new ProblemException(409, 'conflict', 'Integritas dokumen gagal', 'Hash isi tersimpan tidak cocok; PDF tidak dibuat.');
    const pdf = await renderPdf(r.content);
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="dokumen-arsitektur-v${r.versi}.pdf"`);
    res.setHeader('X-Source-SHA256', r.sha256); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(pdf);
  }

  /** Verifikasi integritas: hash isi tersimpan vs hash saat terbit. */
  @Get('publications/:id/verify') @RequirePermission('eaw.catalog.read')
  async verify(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.db.tx(p, async (c) => (await c.query('SELECT content, sha256 FROM eaw.publication WHERE id = $1', [uuidOr400(id)])).rows[0]);
    if (!r) throw new NotFoundException('dokumen tidak ditemukan');
    const actual = createHash('sha256').update(r.content, 'utf8').digest('hex');
    return { sha256: r.sha256, actual, ok: actual === r.sha256 };
  }
}
