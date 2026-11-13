import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { AppConfig } from '../config';
import { APP_CONFIG, DbService } from '../db/db.service';
import { configuredProvider, providerInfo } from '../gse/git-provider';
import { llmCfg } from '../req/elicit';

/** Origin saja (skema+host+port): userinfo/path/query dari URL konfigurasi TIDAK pernah dikembalikan (bisa memuat kredensial). */
export const originOf = (u?: string | null): string | null => {
  if (!u) return null;
  try { return new URL(u).origin; } catch { return '(URL tidak valid)'; }
};
/** Pengguna login dari DATABASE_URL tanpa kata sandi. */
const dbUser = (u?: string): string | null => { try { return u ? decodeURIComponent(new URL(u).username) || null : null; } catch { return null; } };

/** Rahasia yang dibaca API dari env. Hanya ada/tidak — nilai, panjang, dan awalan TIDAK pernah dikembalikan. */
const SECRETS: { name: string; consumer: string; note?: string }[] = [
  { name: 'DATABASE_URL', consumer: 'semua layanan (login DB per layanan)' },
  { name: 'JWT_HS_SECRET', consumer: 'AuthGuard', note: 'HANYA dev/uji; ditolak saat NODE_ENV=production (D-13)' },
  { name: 'GITHUB_TOKEN', consumer: 'GSE push/CI, ADR → Git' },
  { name: 'GITLAB_TOKEN', consumer: 'GSE push/CI, ADR → Git' },
  { name: 'LLM_API_KEY', consumer: 'REQ elicitation, GSE AI scaffolding' },
];

interface JwkView { kid: string | null; kty: string | null; alg: string | null; use: string | null }

/**
 * Settings → API Client, Secrets & Service Tokens (SET). Laporan BACA-SAJA dari konfigurasi nyata proses ini. Konfigurasi EAP dibagikan
 * ke kelima layanan (Compose x-eap-env; K8s ConfigMap eap-config + Secret keis-optional), jadi layanan set mewakili semuanya — kecuali
 * peramban PDF (hanya image eap-api-pdf di layanan eaw) yang sengaja tidak dilaporkan di sini.
 * Yang TIDAK ada di platform ini dilaporkan apa adanya: penyimpanan rahasia = env (Vault belum diintegrasikan), tanpa SPIFFE/SPIRE.
 * Klien OIDC tidak dibaca dari Keycloak (API tidak memegang kredensial admin Keycloak): yang dilaporkan adalah audiens yang diterima API.
 */
@Controller('api/v1/set')
export class IntegrationsController {
  constructor(private readonly db: DbService, @Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  @Get('integrations') @RequirePermission('set.account.read')
  async integrations(@CurrentUser() p: Principal) {
    const env = process.env;
    const jwks = await this.jwks();
    const git = providerInfo(); const llm = llmCfg(env);
    const adrRepo = env.ADR_GIT_REPO || null;
    const db = await this.db.tx(p, async (c) => ({
      session: (await c.query('SELECT session_user AS u')).rows[0].u as string,
      logins: (await c.query(
        // ::text — tipe `name`/`name[]` tidak diurai node-pg menjadi string/array JS (tiba sebagai "{a,b}")
        `SELECT r.rolname::text AS rolname, r.rolconnlimit, COALESCE(array_agg(g.rolname::text ORDER BY g.rolname) FILTER (WHERE g.rolname IS NOT NULL), '{}'::text[]) AS member_of
           FROM pg_roles r
           LEFT JOIN pg_auth_members m ON m.member = r.oid LEFT JOIN pg_roles g ON g.oid = m.roleid
          WHERE r.rolcanlogin AND (r.rolname LIKE 'eap\\_%' OR r.rolname IN ('cmp_relay'))
          GROUP BY r.rolname, r.rolconnlimit ORDER BY r.rolname`)).rows.map((r) => ({ login: r.rolname, connectionLimit: r.rolconnlimit, memberOf: r.member_of })),
    }));
    return {
      service: env.SERVICE ?? 'all',
      production: env.NODE_ENV === 'production',
      auth: {
        mode: this.cfg.auth.jwksUri ? 'jwks' : 'hs256-dev',
        issuer: this.cfg.auth.issuer ?? null,
        audience: this.cfg.auth.audience ?? null,
        jwksUri: this.cfg.auth.jwksUri ?? null,
        algorithms: this.cfg.auth.jwksUri ? ['RS256', 'ES256'] : ['HS256'],
        requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub'],
        maxTokenLifetimeSeconds: 3600,
        jwks,
      },
      clients: [
        ...(this.cfg.auth.audience ? [{ clientId: this.cfg.auth.audience, kind: 'resource-server', source: 'OIDC_AUDIENCE', note: 'token wajib memuat aud ini' }] : []),
      ],
      corsOrigins: this.cfg.corsOrigins,
      connectors: [
        { code: 'git', name: 'Konektor Git (GSE push/CI)', configured: git.configured,
          detail: { provider: git.provider, url: originOf(git.url), allowedPrefix: git.allowedPrefix } },
        { code: 'adr-git', name: 'ADR → Git', configured: !!adrRepo && !!configuredProvider(),
          detail: { repo: adrRepo, dir: env.ADR_GIT_DIR || 'docs/adr', base: env.ADR_GIT_BASE || '(cabang default)', needsGit: !configuredProvider() } },
        { code: 'llm', name: 'LLM OpenAI-compatible (REQ, GSE AI)', configured: !!llm,
          detail: llm ? { origin: originOf(llm.baseUrl), model: llm.model, timeoutMs: llm.timeoutMs, apiKey: !!llm.apiKey } : { origin: null } },
        { code: 'otel', name: 'Trace OpenTelemetry', configured: !!env.OTEL_EXPORTER_OTLP_ENDPOINT,
          detail: { endpoint: originOf(env.OTEL_EXPORTER_OTLP_ENDPOINT) } },
      ],
      secrets: {
        store: 'env',
        vault: false,
        items: SECRETS.map((s) => ({ ...s, set: !!env[s.name] })),
        databaseLogin: dbUser(env.DATABASE_URL),
      },
      workloadIdentity: {
        spiffe: false,
        model: 'login DB per layanan (eap_svc_<layanan>) + NetworkPolicy/segmentasi jaringan; token pengguna diteruskan, tanpa token layanan-ke-layanan',
        session: db.session,
        logins: db.logins,
      },
    };
  }

  /** Ambil JWKS yang dipakai AuthGuard (URL dari konfigurasi operator, bukan masukan pengguna). Hanya metadata kunci publik. */
  private async jwks(): Promise<{ reachable: boolean; ms?: number; keys: JwkView[]; error?: string }> {
    const url = this.cfg.auth.jwksUri;
    if (!url) return { reachable: false, keys: [], error: 'tanpa JWKS (mode HS256 dev)' };
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000); const t0 = performance.now();
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: 'manual' });
      if (!r.ok) return { reachable: false, keys: [], error: `HTTP ${r.status}` };
      const body = await r.json() as { keys?: Record<string, unknown>[] };
      const keys = (Array.isArray(body.keys) ? body.keys : []).slice(0, 20).map((k) => ({
        kid: typeof k.kid === 'string' ? k.kid : null, kty: typeof k.kty === 'string' ? k.kty : null,
        alg: typeof k.alg === 'string' ? k.alg : null, use: typeof k.use === 'string' ? k.use : null }));
      return { reachable: true, ms: Math.round(performance.now() - t0), keys };
    } catch (e) {
      return { reachable: false, keys: [], error: (e as Error).name === 'AbortError' ? 'timeout 3 dtk' : 'tidak terjangkau' };
    } finally { clearTimeout(t); }
  }
}
