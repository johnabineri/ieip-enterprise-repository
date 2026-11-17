import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { decodeKeyset, encodeKeyset, pageLimit, uuidOr400 } from '../common/http';
import { DbService } from '../db/db.service';

class AssignRoleDto {
  @IsUUID() userId: string;
  @Matches(/^ROLE_EAP_[A-Z_]+$/) roleCode: string;
  /** kode entitas (ref.business_groups.code); kosong = holding-wide */
  @IsOptional() @IsString() entityScope?: string;
  @IsOptional() @IsISO8601() validUntil?: string;
}
class ActiveDto { @IsBoolean() isActive: boolean; }
class PreassignDto { @IsUUID() cmpUserId: string; }

/**
 * Administrasi otorisasi (set): akun, peran, izin, penugasan. Penulisan dijaga DB (trigger admin-only + fungsi definer):
 * hanya pemegang set.account.admin. Akun terbentuk dengan dua cara: (1) login pertama (set.provision_user, tanpa peran), atau (2) POLA YANG DISARANKAN —
 * admin memilih orang dari direktori CMP dan pra-tugaskan (set.preassign_user, 304): akun tertaut sejak awal, dapat diberi peran sebelum login.
 * Data pribadi tidak ada: nama tampilan dibaca dari ref.users (CMP).
 */
@Controller('api/v1/set')
export class SetController {
  constructor(private readonly db: DbService) {}

  @Get('roles') @RequirePermission('eaw.org.read')
  roles(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query(
      `SELECT r.id, r.role_code, r.role_name, r.tier, r.description, r.is_active, r.can_view_all, r.edit_scope,
              COALESCE((SELECT array_agg(pm.permission_code ORDER BY pm.permission_code) FROM set.role_permissions rp JOIN set.permissions pm ON pm.id = rp.permission_id
                         WHERE rp.role_id = r.id AND rp.deleted_at IS NULL), '{}') AS permissions
         FROM set.roles r WHERE r.deleted_at IS NULL ORDER BY r.tier, r.role_code`)).rows.map((r) => ({
      id: r.id, roleCode: r.role_code, roleName: r.role_name, tier: r.tier, description: r.description, isActive: r.is_active,
      canViewAll: r.can_view_all, editScope: r.edit_scope, permissions: r.permissions })) }));
  }

  @Get('permissions') @RequirePermission('eaw.org.read')
  permissions(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query(
      `SELECT permission_code, workspace, module, action, description FROM set.permissions WHERE deleted_at IS NULL ORDER BY permission_code`)).rows }));
  }

  @Get('users') @RequirePermission('set.account.read')
  users(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit);
    return this.db.tx(p, async (c) => {
      const a: unknown[] = []; const w = ['su.deleted_at IS NULL'];
      if (q.isActive !== undefined) { a.push(q.isActive === 'true'); w.push(`su.is_active = $${a.length}`); }
      const cur = decodeKeyset(q.cursor);
      if (cur) { a.push(cur[0], cur[1]); w.push(`(COALESCE(ru.username::text, ''), su.id) > ($${a.length - 1}, $${a.length}::uuid)`); }
      a.push(limit + 1);
      const rows = (await c.query(
        `SELECT su.id, su.is_active, su.last_login_at, su.created_at, ru.username, ru.display_name, su.cmp_user_id IS NOT NULL AS linked,
                su.idp_subject LIKE 'pending:%' AS pending, CASE WHEN su.cmp_user_id IS NULL THEN left(su.idp_subject, 18) END AS subject,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ur.id, 'roleCode', r.role_code, 'entityScope', ur.entity_scope, 'validUntil', ur.valid_until) ORDER BY r.role_code)
                            FROM set.user_roles ur JOIN set.roles r ON r.id = ur.role_id WHERE ur.user_id = su.id AND ur.deleted_at IS NULL), '[]') AS assignments
           FROM set.users su LEFT JOIN ref.users ru ON ru.id = su.cmp_user_id
          WHERE ${w.join(' AND ')} ORDER BY COALESCE(ru.username::text, ''), su.id LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const data = (more ? rows.slice(0, limit) : rows).map((r) => ({
        id: r.id, username: r.username, displayName: r.display_name, isActive: r.is_active, lastLoginAt: r.last_login_at, createdAt: r.created_at, linked: r.linked, pending: r.pending, subject: r.subject, assignments: r.assignments }));
      return { data, nextCursor: more ? encodeKeyset(data[data.length - 1].username ?? '', data[data.length - 1].id) : null };
    });
  }

  /** Direktori CMP (ref.users aktif) yang BELUM punya akun EAP — sumber pilihan untuk pra-tugas. `q` mencari username/nama; maks. 200. */
  @Get('directory') @RequirePermission('set.account.admin')
  directory(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = Math.min(200, Math.max(1, Number.parseInt(q.limit ?? '', 10) || 100));
    const term = (q.q ?? '').trim();
    return this.db.tx(p, async (c) => {
      const a: unknown[] = [limit]; let f = '';
      if (term) { a.push(`%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`); f = `AND (r.username ILIKE $2 OR r.display_name ILIKE $2)`; }   // %, _ dan \ dalam kata kunci tidak jadi pola
      const rows = (await c.query(
        `SELECT r.id, r.username, r.display_name FROM ref.users r
          WHERE r.is_active AND r.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM set.users s WHERE s.cmp_user_id = r.id AND s.deleted_at IS NULL) ${f}
          ORDER BY r.username LIMIT $1`, a)).rows;
      return { data: rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name })) };
    });
  }

  /** POLA YANG DISARANKAN: pra-tugaskan akun untuk orang di direktori CMP (tertaut sejak awal; pending sampai login pertama). Idempoten. */
  @Post('users') @HttpCode(201) @RequirePermission('set.account.admin')
  preassign(@CurrentUser() p: Principal, @Body() b: PreassignDto) {
    return this.db.tx(p, async (c) => {
      const id = (await c.query('SELECT set.preassign_user($1) AS id', [b.cmpUserId])).rows[0].id as string;
      const r = (await c.query(`SELECT su.id, ru.username, ru.display_name, su.idp_subject LIKE 'pending:%' AS pending FROM set.users su JOIN ref.users ru ON ru.id = su.cmp_user_id WHERE su.id = $1`, [id])).rows[0];
      return { id: r.id, username: r.username, displayName: r.display_name, pending: r.pending };
    });
  }

  @Patch('users/:id') @RequirePermission('set.account.admin')
  setActive(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: ActiveDto) {
    return this.db.tx(p, async (c) => {
      await c.query('SELECT set.set_user_active($1, $2)', [uuidOr400(id), b.isActive]);
      return { id, isActive: b.isActive };
    });
  }

  /** Menugaskan peran. entityScope menentukan cakupan (entitas + turunannya); kosong = holding-wide. */
  @Post('user-roles') @HttpCode(201) @RequirePermission('set.account.admin')
  assign(@CurrentUser() p: Principal, @Body() b: AssignRoleDto) {
    return this.db.tx(p, async (c) => {
      const role = (await c.query('SELECT id FROM set.roles WHERE role_code = $1 AND deleted_at IS NULL AND is_active', [b.roleCode])).rows[0];
      if (!role) throw new NotFoundException(`peran ${b.roleCode} tidak ditemukan`);
      const r = await c.query(
        `INSERT INTO set.user_roles (user_id, role_id, entity_scope, assigned_by, valid_until) VALUES ($1,$2,$3,$4,$5) RETURNING id, user_id, entity_scope, valid_from, valid_until`,
        [b.userId, role.id, b.entityScope ?? null, p.userId, b.validUntil ?? null]);
      return { ...r.rows[0], roleCode: b.roleCode };
    });
  }

  /**
   * Jejak sinkron mutasi pegawai CMP → RBAC EAP (CMP SRS §8.3; worker infra/services/rbac-sync, 291_rbac_sync.sql). Pencabutan otomatis
   * TIDAK diikuti pemberian otomatis: daftar ini yang dipakai admin untuk menugaskan ulang. Hanya pengenal + username (ref.users).
   */
  @Get('rbac-sync') @RequirePermission('set.account.read')
  rbacSync(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit);
    return this.db.tx(p, async (c) => {
      const a: unknown[] = []; const w: string[] = ['true'];
      if (q.action) { a.push(String(q.action).split(',').slice(0, 6)); w.push(`e.action = ANY ($${a.length}::text[])`); }
      if (q.cursor) { const id = Number(q.cursor); if (Number.isSafeInteger(id) && id > 0) { a.push(id); w.push(`e.id < $${a.length}`); } }
      a.push(limit + 1);
      const rows = (await c.query(
        `SELECT e.id, e.received_at, e.source_event_id, e.event_type, e.aggregate_type, e.aggregate_id, e.row_version, e.action,
                e.users_affected, e.roles_revoked, e.detail->>'reason' AS reason,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', x->>'user_id', 'username', ru.username, 'roleCode', x->>'role_code', 'entityScope', x->>'entity_scope')
                                           ORDER BY ru.username, x->>'role_code')
                            FROM jsonb_array_elements(COALESCE(e.detail->'revoked', '[]')) x
                            LEFT JOIN set.users su ON su.id = (x->>'user_id')::uuid
                            LEFT JOIN ref.users ru ON ru.id = su.cmp_user_id), '[]') AS revoked
           FROM set.rbac_sync_event e WHERE ${w.join(' AND ')} ORDER BY e.id DESC LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const page = more ? rows.slice(0, limit) : rows;
      return {
        data: page.map((r) => ({ id: Number(r.id), receivedAt: r.received_at, sourceEventId: r.source_event_id, eventType: r.event_type,
          aggregateType: r.aggregate_type, aggregateId: r.aggregate_id, rowVersion: r.row_version, action: r.action,
          usersAffected: r.users_affected, rolesRevoked: r.roles_revoked, reason: r.reason, revoked: r.revoked })),
        nextCursor: more ? String(page[page.length - 1].id) : null,
      };
    });
  }

  /** Mencabut penugasan (hapus lunak; jejak tetap di audit_logs). */
  @Delete('user-roles/:id') @HttpCode(204) @RequirePermission('set.account.admin')
  revoke(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const r = await c.query('UPDATE set.user_roles SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)]);
      if (!r.rowCount) throw new NotFoundException('penugasan tidak ditemukan');
    });
  }
}
