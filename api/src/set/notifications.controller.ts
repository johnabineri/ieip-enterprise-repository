import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, Principal } from '../auth/auth';
import { DbService } from '../db/db.service';

class ReadDto {
  /** Kosong/tanpa `ids` = tandai SEMUA notifikasi milik pengguna sebagai dibaca. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids?: string[];
}

const dto = (r: any) => ({
  id: r.id, kind: r.kind, severity: r.severity, title: r.title, body: r.body, route: r.route, objekType: r.objek_type, objekId: r.objek_id,
  createdAt: r.created_at, readAt: r.read_at,
});

/**
 * Lonceng notifikasi per pengguna (303). Hanya membaca/menandai MILIK SENDIRI — RLS `set.notification` (user_id = pengguna sesi) dan hak kolom
 * (eap_app hanya boleh UPDATE read_at; tanpa INSERT/DELETE) menegakkannya di DB. Notifikasi dibuat pemicu DB, bukan API. Tanpa izin khusus:
 * setiap pengguna terautentikasi memiliki kotaknya sendiri.
 */
@Controller('api/v1/set/notifications')
export class NotificationsController {
  constructor(private readonly db: DbService) {}

  /** `?limit` (1..100, bawaan 30), `?unread=1` hanya yang belum dibaca. `unread` = jumlah belum dibaca SELURUHNYA (bukan hanya halaman ini). */
  @Get()
  list(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? '', 10) || 30));
    const onlyUnread = q.unread === '1' || q.unread === 'true';
    return this.db.tx(p, async (c) => {
      const rows = (await c.query(
        `SELECT id, kind, severity, title, body, route, objek_type, objek_id, created_at, read_at FROM set.notification
          ${onlyUnread ? 'WHERE read_at IS NULL' : ''} ORDER BY created_at DESC, id DESC LIMIT $1`, [limit])).rows;
      const unread = (await c.query('SELECT count(*)::int AS n FROM set.notification WHERE read_at IS NULL')).rows[0].n;
      return { data: rows.map(dto), unread };
    });
  }

  @Post('read') @HttpCode(200)
  read(@CurrentUser() p: Principal, @Body() b: ReadDto) {
    return this.db.tx(p, async (c) => {
      const r = b.ids?.length
        ? await c.query('UPDATE set.notification SET read_at = now() WHERE read_at IS NULL AND id = ANY($1::uuid[])', [b.ids])
        : await c.query('UPDATE set.notification SET read_at = now() WHERE read_at IS NULL');
      const unread = (await c.query('SELECT count(*)::int AS n FROM set.notification WHERE read_at IS NULL')).rows[0].n;
      return { updated: r.rowCount ?? 0, unread };
    });
  }
}
