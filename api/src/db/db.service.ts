import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';
import { AppConfig } from '../config';

export const APP_CONFIG = 'APP_CONFIG';

// DATE -> 'YYYY-MM-DD' (bukan Date lokal) agar tidak bergeser zona waktu
types.setTypeParser(1082, (v) => v);

/**
 * Konteks sesi RLS per transaksi (SET LOCAL). Diturunkan dari set.session_claims — DB yang menegakkan izin & cakupan
 * (eaw.can_view/can_edit, set.has_perm, eaw.transition), API hanya memuat klaimnya.
 */
export interface SessionContext {
  userId: string;
  perms: string[];
  viewAll: boolean;
  editAll: boolean;
  viewIds: string[];
  editIds: string[];
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {
    for (const r of [cfg.appRole, cfg.auditRole]) if (!IDENT.test(r)) throw new Error(`nama peran DB tidak valid: ${r}`);
    this.pool = new Pool({ connectionString: cfg.databaseUrl, max: 10 });
  }
  async onModuleDestroy() { await this.pool.end(); }

  private async run<T>(role: string, ctx: SessionContext | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL ROLE ${role}`);
      if (ctx) {
        const set = (k: string, v: string) => c.query('SELECT set_config($1, $2, true)', [k, v]);
        await set('app.user_id', ctx.userId);
        await set('app.eap_perms', ctx.perms.join(','));
        await set('app.eap_view_all', ctx.viewAll ? '1' : '0');
        await set('app.eap_edit_all', ctx.editAll ? '1' : '0');
        await set('app.eap_view_ids', ctx.viewIds.join(','));
        await set('app.eap_edit_ids', ctx.editIds.join(','));
      }
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch { /* koneksi sudah putus */ }
      throw e;
    } finally {
      c.release();
    }
  }

  /** Transaksi permintaan: peran eap_app + konteks sesi → RLS berlaku. */
  tx<T>(ctx: SessionContext, fn: (c: PoolClient) => Promise<T>): Promise<T> { return this.run(this.cfg.appRole, ctx, fn); }
  /** Tanpa konteks (provisioning & klaim sesi lewat fungsi SECURITY DEFINER, sebelum identitas dikenal). */
  anon<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> { return this.run(this.cfg.appRole, null, fn); }
  /** Pembaca log audit (peran DB eap_audit). Pemanggil wajib memeriksa izin set.audit.read. */
  audit<T>(ctx: SessionContext, fn: (c: PoolClient) => Promise<T>): Promise<T> { return this.run(this.cfg.auditRole, ctx, fn); }
}
