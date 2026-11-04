import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Principal } from '../auth/auth';
import { DbService } from '../db/db.service';

@Controller('api/v1')
export class MeController {
  constructor(private readonly db: DbService) {}

  /**
   * Profil sesi. Nama tampilan dibaca dari ref.users (replika CMP) — EAP tidak menyimpan data pribadi (D-14).
   * Cakupan: viewAll/editAll = holding-wide; editEntityCodes = entitas (beserta turunan) yang boleh disusun.
   */
  @Get('me')
  me(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const u = (await c.query(
        `SELECT ru.username, ru.display_name FROM set.users su JOIN ref.users ru ON ru.id = su.cmp_user_id WHERE su.id = $1`, [p.userId])).rows[0];
      const codes = p.editIds.length
        ? (await c.query('SELECT code FROM ref.business_groups WHERE id = ANY($1::uuid[]) ORDER BY code', [p.editIds])).rows.map((r) => r.code)
        : [];
      return {
        userId: p.userId, username: u?.username ?? p.username, displayName: u?.display_name ?? null,
        roles: p.roles, permissions: p.perms,
        scope: { viewAll: p.viewAll, editAll: p.editAll, editEntityCodes: codes },
      };
    });
  }
}
