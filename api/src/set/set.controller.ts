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

/**
 * Administrasi otorisasi (set): akun, peran, izin, penugasan. Penulisan dijaga DB (trigger admin-only + fungsi definer):
 * hanya pemegang set.account.admin. Pengguna muncul di sini setelah login pertama (dibuat set.provision_user, tanpa peran).
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
        `SELECT su.id, su.is_active, su.last_login_at, su.created_at, ru.username, ru.display_name,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ur.id, 'roleCode', r.role_code, 'entityScope', ur.entity_scope, 'validUntil', ur.valid_until) ORDER BY r.role_code)
                            FROM set.user_roles ur JOIN set.roles r ON r.id = ur.role_id WHERE ur.user_id = su.id AND ur.deleted_at IS NULL), '[]') AS assignments
           FROM set.users su LEFT JOIN ref.users ru ON ru.id = su.cmp_user_id
          WHERE ${w.join(' AND ')} ORDER BY COALESCE(ru.username::text, ''), su.id LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const data = (more ? rows.slice(0, limit) : rows).map((r) => ({
        id: r.id, username: r.username, displayName: r.display_name, isActive: r.is_active, lastLoginAt: r.last_login_at, createdAt: r.created_at, assignments: r.assignments }));
      return { data, nextCursor: more ? encodeKeyset(data[data.length - 1].username ?? '', data[data.length - 1].id) : null };
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

  /** Mencabut penugasan (hapus lunak; jejak tetap di audit_logs). */
  @Delete('user-roles/:id') @HttpCode(204) @RequirePermission('set.account.admin')
  revoke(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const r = await c.query('UPDATE set.user_roles SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)]);
      if (!r.rowCount) throw new NotFoundException('penugasan tidak ditemukan');
    });
  }
}
