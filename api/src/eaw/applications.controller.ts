import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { assertVersion, decodeKeyset, encodeKeyset, etagOf, pageLimit, requireIfMatch, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

const KODE = /^[A-Z0-9][A-Z0-9_.-]*$/;

export class CreateApplicationDto {
  @Matches(KODE) @MaxLength(50) kode: string;
  @IsString() @MinLength(2) @MaxLength(200) nama: string;
  /** kode platform induk bila ini workspace; kosong = ini platform */
  @IsOptional() @Matches(KODE) platform?: string;
  @IsOptional() @IsString() @MaxLength(50) workspace?: string;
  @IsIn(['umum', 'khusus']) jenis: string;
  @IsOptional() @IsIn(['FEDERATED_REMOTE', 'INTERNAL_ROUTED']) workspaceMode?: string;
  @IsOptional() @IsString() @MaxLength(100) federationScope?: string;
  @IsOptional() @IsString() @MaxLength(255) remoteEntryUrl?: string;
  @IsOptional() @IsString() @MaxLength(255) repoGit?: string;
  // 4 metadata wajib (EAW-02): Pemilik Bisnis, Tim Pengembang, Risiko AI, SLO — penyimpanan ditolak bila kosong
  @IsString() @MinLength(1) @MaxLength(100) ownerBisnis: string;
  @IsString() @MinLength(1) @MaxLength(100) timPengembang: string;
  @IsIn(['none', 'low', 'medium', 'high']) risikoAi: string;
  @IsString() @MinLength(1) @MaxLength(200) slo: string;
  @IsOptional() @IsIn(['planned', 'active', 'deprecated', 'retired']) lifecycle?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'critical']) kritikalitas?: string;
  @IsOptional() @IsUUID() referensiId?: string;
  /** 'workspace' tanpa platform = workspace yang belum ditempatkan (hanya Draf). Bila kosong: platform kosong -> platform, terisi -> workspace. */
  @IsOptional() @IsIn(['platform', 'workspace']) jenisNode?: string;
  /** profil platform: wajib terisi sebelum platform Divalidasi */
  @IsOptional() @IsString() @MaxLength(300) uiStandard?: string;
  @IsOptional() @IsString() @MaxLength(2000) techStack?: string;
  /** dasar pendaftaran workspace baru: tiket ARB APPROVED di entitas yang sama */
  @IsOptional() @IsUUID() arbClearanceId?: string;
  /** workspace yang sudah ada sebelum EAP (bebas tiket ARB); hanya pemegang eaw.workspace.assign */
  @IsOptional() @IsBoolean() adopsi?: boolean;
  @IsUUID() entityId: string;
}

export class PatchApplicationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nama?: string;
  @IsOptional() @IsString() @MaxLength(50) workspace?: string;
  @IsOptional() @IsIn(['umum', 'khusus']) jenis?: string;
  @IsOptional() @IsIn(['FEDERATED_REMOTE', 'INTERNAL_ROUTED']) workspaceMode?: string;
  @IsOptional() @IsString() @MaxLength(100) federationScope?: string;
  @IsOptional() @IsString() @MaxLength(255) remoteEntryUrl?: string;
  @IsOptional() @IsString() @MaxLength(255) repoGit?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) ownerBisnis?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) timPengembang?: string;
  @IsOptional() @IsIn(['none', 'low', 'medium', 'high']) risikoAi?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) slo?: string;
  @IsOptional() @IsIn(['planned', 'active', 'deprecated', 'retired']) lifecycle?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'critical']) kritikalitas?: string;
  @IsOptional() @IsUUID() referensiId?: string;
  @IsOptional() @IsString() @MaxLength(300) uiStandard?: string;
  @IsOptional() @IsString() @MaxLength(2000) techStack?: string;
  @IsOptional() @IsUUID() arbClearanceId?: string;
  @IsOptional() @IsBoolean() adopsi?: boolean;
}

export class PlacePlatformDto {
  /** kode platform tujuan; null = lepas penempatan (hanya Draf) */
  @ValidateIf((o) => o.platform !== null) @Matches(KODE) platform: string | null;
}

const COLS = `a.id, a.kode, a.nama, a.platform, a.workspace, a.jenis, a.workspace_mode, a.federation_scope, a.remote_entry_url, a.repo_git,
  a.owner_bisnis, a.owner_teknis, a.risiko_ai, a.slo, a.lifecycle, a.kritikalitas, a.referensi_id, a.entity_id, g.code AS entity_code, a.status,
  a.jenis_node, a.ui_standard, a.tech_stack, a.arb_clearance_id, a.adopsi, a.created_by, a.created_at, a.updated_at, a.row_version`;
const FROM = `FROM eaw.application a JOIN ref.business_groups g ON g.id = a.entity_id`;

/** Kontrak OpenAPI SRS 6.2: ApplicationDto camelCase (+ atribut katalog lain). */
export function applicationDto(r: any) {
  return {
    id: r.id, kode: r.kode, nama: r.nama, platform: r.platform, workspace: r.workspace, jenis: r.jenis,
    workspaceMode: r.workspace_mode, federationScope: r.federation_scope, remoteEntryUrl: r.remote_entry_url, repoGit: r.repo_git,
    ownerBisnis: r.owner_bisnis, timPengembang: r.owner_teknis, risikoAi: r.risiko_ai, slo: r.slo, lifecycle: r.lifecycle, kritikalitas: r.kritikalitas,
    referensiId: r.referensi_id, entityId: r.entity_id, entityCode: r.entity_code, status: r.status,
    jenisNode: r.jenis_node, uiStandard: r.ui_standard, techStack: r.tech_stack, arbClearanceId: r.arb_clearance_id, adopsi: r.adopsi,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, version: r.row_version,
  };
}

const COLUMN_OF: Record<string, string> = {
  nama: 'nama', workspace: 'workspace', jenis: 'jenis', workspaceMode: 'workspace_mode', federationScope: 'federation_scope', remoteEntryUrl: 'remote_entry_url',
  repoGit: 'repo_git', ownerBisnis: 'owner_bisnis', timPengembang: 'owner_teknis', risikoAi: 'risiko_ai', slo: 'slo', lifecycle: 'lifecycle',
  kritikalitas: 'kritikalitas', referensiId: 'referensi_id', uiStandard: 'ui_standard', techStack: 'tech_stack', arbClearanceId: 'arb_clearance_id', adopsi: 'adopsi',
};

/** Katalog portofolio aplikasi (Domain 4, EAW-02). Zero Pre-Seed: katalog kosong sampai Architect mengisinya lewat alur AF-05. */
@Controller('api/v1/eaw/applications')
export class ApplicationsController {
  constructor(private readonly db: DbService) {}

  @Get() @RequirePermission('eaw.catalog.read')
  list(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit);
    return this.db.tx(p, async (c) => {
      const w = ['a.deleted_at IS NULL']; const a: unknown[] = [];
      const add = (sql: string, v: unknown) => { a.push(v); w.push(sql.replace(/\?/g, `$${a.length}`)); };
      if (q.platform) add('a.platform = ?', q.platform);
      if (q.jenisNode) {
        if (!['platform', 'workspace'].includes(q.jenisNode)) throw new ProblemException(400, 'bad-request', 'jenisNode tidak valid');
        add('a.jenis_node = ?', q.jenisNode);
      }
      if (q.workspaceMode) {
        if (!['FEDERATED_REMOTE', 'INTERNAL_ROUTED'].includes(q.workspaceMode)) throw new ProblemException(400, 'bad-request', 'workspaceMode tidak valid');
        add('a.workspace_mode = ?', q.workspaceMode);
      }
      if (q.status) add('a.status = ?', q.status);
      if (q.lifecycle) add('a.lifecycle = ?', q.lifecycle);
      if (q.entityId) add('a.entity_id = ?', uuidOr400(q.entityId, 'entityId'));
      if (q.q) add(`(a.nama ILIKE '%' || ? || '%' OR a.kode ILIKE '%' || ? || '%')`, q.q.replace(/[\\%_]/g, (m) => '\\' + m));
      const cur = decodeKeyset(q.cursor);
      if (cur) { a.push(cur[0]); w.push(`a.kode > $${a.length}`); }
      a.push(limit + 1);
      const rows = (await c.query(`SELECT ${COLS} ${FROM} WHERE ${w.join(' AND ')} ORDER BY a.kode LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const data = (more ? rows.slice(0, limit) : rows).map(applicationDto);
      return { data, nextCursor: more ? encodeKeyset(data[data.length - 1].kode, '') : null };
    });
  }

  @Get(':id') @RequirePermission('eaw.catalog.read')
  async get(@CurrentUser() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const row = await this.db.tx(p, async (c) => (await c.query(`SELECT ${COLS} ${FROM} WHERE a.id = $1 AND a.deleted_at IS NULL`, [uuidOr400(id)])).rows[0]);
    if (!row) throw new NotFoundException('aplikasi tidak ditemukan atau di luar cakupan akses');
    res.setHeader('ETag', etagOf(row.row_version));
    return applicationDto(row);
  }

  /** Mendaftarkan aplikasi/workspace: selalu berstatus Draf (AF-05). Metadata wajib dijaga constraint DB. */
  @Post() @HttpCode(201) @RequirePermission('eaw.catalog.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateApplicationDto, @Res({ passthrough: true }) res: Response) {
    return this.db.tx(p, async (c) => {
      const ins = await c.query(
        `INSERT INTO eaw.application (kode, nama, platform, workspace, jenis, workspace_mode, federation_scope, remote_entry_url, repo_git,
                owner_bisnis, owner_teknis, risiko_ai, slo, lifecycle, kritikalitas, referensi_id, entity_id, jenis_node, ui_standard, tech_stack, arb_clearance_id, adopsi)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6,'INTERNAL_ROUTED'),$7,$8,$9,$10,$11,$12,$13,COALESCE($14,'planned'),COALESCE($15,'medium'),$16,$17,$18,$19,$20,$21,COALESCE($22,false)) RETURNING id`,
        [b.kode, b.nama, b.platform ?? null, b.workspace ?? null, b.jenis, b.workspaceMode ?? null, b.federationScope ?? null, b.remoteEntryUrl ?? null, b.repoGit ?? null,
          b.ownerBisnis, b.timPengembang, b.risikoAi, b.slo, b.lifecycle ?? null, b.kritikalitas ?? null, b.referensiId ?? null, b.entityId,
          b.jenisNode ?? (b.platform ? 'workspace' : 'platform'), b.uiStandard ?? null, b.techStack ?? null, b.arbClearanceId ?? null, b.adopsi ?? null]);
      const row = (await c.query(`SELECT ${COLS} ${FROM} WHERE a.id = $1`, [ins.rows[0].id])).rows[0];
      res.setHeader('ETag', etagOf(row.row_version));
      return applicationDto(row);
    });
  }

  /** Mengubah aplikasi berstatus Draf (If-Match = version). Objek non-Draf ditolak DB: kembalikan ke Draf lewat alur dulu. */
  @Patch(':id') @RequirePermission('eaw.catalog.write')
  patch(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PatchApplicationDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version FROM eaw.application WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('aplikasi tidak ditemukan atau di luar cakupan akses');
      assertVersion(v, cur.row_version);
      const keys = Object.keys(b).filter((k) => (b as any)[k] !== undefined && COLUMN_OF[k]);
      if (!keys.length) throw new ProblemException(422, 'validation-failed', 'Tidak ada perubahan');
      await c.query(`UPDATE eaw.application SET ${keys.map((k, i) => `${COLUMN_OF[k]} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...keys.map((k) => (b as any)[k])]);
      const row = (await c.query(`SELECT ${COLS} ${FROM} WHERE a.id = $1`, [id])).rows[0];
      res.setHeader('ETag', etagOf(row.row_version));
      return applicationDto(row);
    });
  }

  /**
   * Menempatkan/memindahkan workspace ke platform (mis. AEGIS -> BASE) atau melepasnya. Hanya pemegang eaw.workspace.assign
   * (Enterprise Application Architect). Objek harus Draf; aplikasi Dipublikasi dikembalikan ke Draf dulu lewat alur AF-05 (dengan catatan).
   */
  @Post(':id/platform') @HttpCode(200) @RequirePermission('eaw.workspace.assign')
  place(@CurrentUser() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string, @Body() b: PlacePlatformDto, @Res({ passthrough: true }) res: Response) {
    const v = requireIfMatch(ifMatch);
    return this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT row_version, jenis_node FROM eaw.application WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uuidOr400(id)])).rows[0];
      if (!cur) throw new NotFoundException('aplikasi tidak ditemukan atau di luar cakupan akses');
      assertVersion(v, cur.row_version);
      if (cur.jenis_node !== 'workspace') throw new ProblemException(422, 'validation-failed', 'Hanya workspace yang dapat ditempatkan di platform');
      await c.query('UPDATE eaw.application SET platform = $2 WHERE id = $1', [id, b.platform]);
      const row = (await c.query(`SELECT ${COLS} ${FROM} WHERE a.id = $1`, [id])).rows[0];
      res.setHeader('ETag', etagOf(row.row_version));
      return applicationDto(row);
    });
  }

  /** Hapus lunak: hanya objek Draf (jejak tetap ada di audit_logs). */
  @Delete(':id') @HttpCode(204) @RequirePermission('eaw.catalog.write')
  remove(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const r = await c.query(`UPDATE eaw.application SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL AND status = 'Draf'`, [uuidOr400(id)]);
      if (!r.rowCount) throw new ProblemException(409, 'invalid-state', 'Hanya aplikasi berstatus Draf (dan dalam cakupan Anda) yang dapat dihapus');
    });
  }
}
