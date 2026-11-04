import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, JWTPayload, JWTVerifyGetKey } from 'jose';
import { AppConfig } from '../config';
import { APP_CONFIG, DbService, SessionContext } from '../db/db.service';

export interface Principal extends SessionContext {
  username: string;
  roles: string[];
}

export const IS_PUBLIC = 'isPublic';
export const PERMISSION = 'permission';
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Pengguna harus memegang SEMUA izin yang disebut (format <workspace>.<modul>.<aksi>, SRS 5.2). */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSION, codes);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().principal);

/** Pemeriksaan izin dinamis. DB tetap menegakkan ulang lewat RLS/fungsi (set.has_perm). */
export function assertCan(p: Principal, code: string) {
  if (!p.perms.includes(code)) throw new ForbiddenException(`izin tidak mencukupi: ${code}`);
}

// D-13: masa berlaku token <= 1 jam; klaim wajib iss, aud, exp, iat, sub
const MAX_TOKEN_LIFETIME_S = 3600;

@Injectable()
export class AuthGuard implements CanActivate {
  private jwks?: JWTVerifyGetKey;
  private hsKey?: Uint8Array;

  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig, private readonly db: DbService, private readonly reflector: Reflector) {
    if (cfg.auth.jwksUri) this.jwks = createRemoteJWKSet(new URL(cfg.auth.jwksUri));
    else if (cfg.auth.hsSecret) this.hsKey = new TextEncoder().encode(cfg.auth.hsSecret);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('token Bearer diperlukan');

    let payload: JWTPayload;
    try {
      const opts = { issuer: this.cfg.auth.issuer, audience: this.cfg.auth.audience, requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub'] };
      // Asimetris saja untuk Keycloak (RS256/ES256); HS256/none ditolak. HS256 hanya aktif bila JWKS tidak dikonfigurasi (uji lokal).
      const r = this.jwks
        ? await jwtVerify(header.slice(7), this.jwks, { ...opts, algorithms: ['RS256', 'ES256'] })
        : await jwtVerify(header.slice(7), this.hsKey!, { ...opts, requiredClaims: ['exp', 'iat', 'sub'], algorithms: ['HS256'] });
      payload = r.payload;
      if (payload.exp! - payload.iat! > MAX_TOKEN_LIFETIME_S) throw new Error('masa berlaku token > 1 jam');
    } catch {
      throw new UnauthorizedException('token tidak valid atau kedaluwarsa');
    }

    const principal = await this.resolve(payload);
    req.principal = principal;
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSION, targets);
    const missing = (required ?? []).filter((c) => !principal.perms.includes(c));
    if (missing.length) throw new ForbiddenException(`izin tidak mencukupi: ${missing.join(', ')}`);
    return true;
  }

  /**
   * sub -> set.users (dibuat saat login pertama HANYA bila pengguna dikenal & aktif di CMP: set.provision_user);
   * izin + cakupan dihitung DB (set.session_claims). Pengguna baru tanpa peran tetap sah: ia hanya melihat objek Dipublikasi.
   */
  private async resolve(p: JWTPayload): Promise<Principal> {
    const username = typeof p.preferred_username === 'string' ? p.preferred_username : '';
    const out = await this.db.anon(async (c) => {
      const id = (await c.query('SELECT set.provision_user($1, $2) AS id', [p.sub, username || null])).rows[0].id as string | null;
      if (!id) return null;
      const claims = (await c.query('SELECT set.session_claims($1) AS j', [id])).rows[0].j;
      if (claims.active) await c.query('SELECT set.touch_login($1)', [id]);
      return { id, claims };
    });
    if (!out || !out.claims.active) throw new UnauthorizedException('pengguna tidak dikenal di CMP atau tidak aktif');
    const j = out.claims;
    return { userId: out.id, username, roles: j.roles, perms: j.permissions, viewAll: j.view_all, editAll: j.edit_all, viewIds: j.view_ids, editIds: j.edit_ids };
  }
}
