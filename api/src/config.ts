export interface AppConfig {
  port: number;
  databaseUrl: string;
  /** Peran DB untuk transaksi permintaan (RLS berlaku). Login DB harus anggota peran ini. */
  appRole: string;
  /** Peran DB pembaca audit_logs (satu-satunya dengan SELECT). Login DB harus anggota peran ini. */
  auditRole: string;
  auth: {
    issuer?: string;
    audience?: string;
    jwksUri?: string;
    /** HS256 — hanya uji/dev lokal; D-13 melarang algoritma simetris, jadi DITOLAK saat NODE_ENV=production. */
    hsSecret?: string;
  };
  corsOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const cfg: AppConfig = {
    port: Number(env.PORT ?? 3100),
    databaseUrl: env.DATABASE_URL ?? 'postgresql://localhost:5432/kalla_eap',
    appRole: env.DB_APP_ROLE ?? 'eap_app',
    auditRole: env.DB_AUDIT_ROLE ?? 'eap_audit',
    auth: { issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, jwksUri: env.OIDC_JWKS_URI, hsSecret: env.JWT_HS_SECRET },
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  };
  if (env.NODE_ENV === 'production') {
    if (cfg.auth.hsSecret) throw new Error('JWT_HS_SECRET dilarang di produksi (D-13: hanya RS256/ES256 via JWKS Keycloak)');
    if (!cfg.auth.jwksUri || !cfg.auth.issuer || !cfg.auth.audience) throw new Error('OIDC_JWKS_URI, OIDC_ISSUER, dan OIDC_AUDIENCE wajib di produksi');
  } else if (!cfg.auth.hsSecret && !cfg.auth.jwksUri) {
    throw new Error('Tetapkan OIDC_JWKS_URI (disarankan) atau JWT_HS_SECRET (hanya dev/uji)');
  }
  return cfg;
}
