import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { SignJWT } from 'jose';

export const TEST_DB = process.env.API_TEST_DB ?? 'kalla_eap_api_test';
export const HS_SECRET = 'test-secret-test-secret-test-secret-123';
export const DB_URL = `postgresql://${process.env.PGUSER ?? ''}${process.env.PGUSER ? '@' : ''}${process.env.PGHOST ?? 'localhost'}:${process.env.PGPORT ?? 5432}/${TEST_DB}`;

const ROOT = join(__dirname, '..', '..');
const psql = (db: string, file: string) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] });

/** Membangun DB uji bersih dari DDL + seed + migrasi EAP. Nama wajib berakhiran _test (menghapus DB!). */
export async function buildDatabase() {
  if (!TEST_DB.endsWith('_test')) throw new Error('API_TEST_DB harus berakhiran _test');
  const admin = new Client({ connectionString: DB_URL.replace(`/${TEST_DB}`, '/postgres') });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [TEST_DB]);
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  for (const f of readdirSync(join(ROOT, 'database')).filter((x) => /^\d{3}_.*\.sql$/.test(x)).sort()) psql(TEST_DB, join(ROOT, 'database', f));
  for (const f of readdirSync(join(ROOT, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) psql(TEST_DB, join(ROOT, 'migrations', f));
}

export const db = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(sql, params)).rows as T[]; } finally { await c.end(); }
};

/** Menulis replika ref.* seperti worker langganan (trigger read-only dinonaktifkan). */
export async function refExec(sql: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { await c.query('SET session_replication_role = replica'); await c.query(sql, params); } finally { await c.end(); }
}

export interface World { ids: Record<string, string>; users: Record<string, string> }

/**
 * Dunia uji: hierarki ref.business_groups (holding > 2 ecosystem > SBU > unit) dan pengguna per peran.
 * Pengguna: akun CMP (ref.users) + akun EAP (set.users, idp_subject = 'sub-<nama>') + penugasan peran.
 */
export async function seedWorld(): Promise<World> {
  const ids: Record<string, string> = {};
  const g = async (key: string, code: string, name: string, kind: string, parent?: string) => {
    const r = await db(`SELECT gen_random_uuid() AS id`); ids[key] = r[0].id;
    await refExec(`INSERT INTO ref.business_groups (id, code, name, group_kind, parent_id, is_active, row_version) VALUES ($1,$2,$3,$4,$5,true,1)`, [ids[key], code, name, kind, parent ? ids[parent] : null]);
  };
  await g('hold', 'T-KALLA', 'Kalla', 'holding');
  await g('eco_con', 'T-ECO-CON', 'Eco Konstruksi', 'ecosystem', 'hold');
  await g('eco_auto', 'T-ECO-AUTO', 'Eco Otomotif', 'ecosystem', 'hold');
  await g('aspal', 'T-ASPAL', 'Kalla Aspal', 'sbu', 'eco_con');
  await g('toyota', 'T-TOYOTA', 'Kalla Toyota', 'sbu', 'eco_auto');
  await g('unit_aspal', 'T-ASPAL-BU', 'Unit Aspal Curah', 'business_unit', 'aspal');

  const users: Record<string, string> = {};
  const u = async (name: string, roles: [string, string | null][] = []) => {
    const cmp = (await db(`SELECT gen_random_uuid() AS id`))[0].id;
    await refExec(`INSERT INTO ref.users (id, username, display_name, is_active, row_version) VALUES ($1,$2,$3,true,1)`, [cmp, name, `Nama ${name}`]);
    const su = (await db(`INSERT INTO set.users (idp_subject, cmp_user_id) VALUES ($1,$2) RETURNING id`, [`sub-${name}`, cmp]))[0].id;
    for (const [role, scope] of roles) {
      await db(`INSERT INTO set.user_roles (user_id, role_id, entity_scope) SELECT $1, id, $2 FROM set.roles WHERE role_code = $3`, [su, scope, role]);
    }
    users[name] = su;
  };
  await u('arb', [['ROLE_EAP_ARB_CHAIR', null]]);
  await u('app', [['ROLE_EAP_APP_ARCHITECT', null]]);
  await u('sbu_a', [['ROLE_EAP_SBU_ARCHITECT', 'T-ASPAL']]);
  await u('sbu_t', [['ROLE_EAP_SBU_ARCHITECT', 'T-TOYOTA']]);
  await u('aud', [['ROLE_EAP_AUDITOR', null]]);
  await u('sys', [['ROLE_EAP_SYSADMIN', null]]);
  await u('dev', [['ROLE_EAP_GSE_DEVELOPER', null]]);
  await u('emp');
  return { ids, users };
}

/** Token uji (HS256 hanya aktif di NODE_ENV!=production dan tanpa JWKS). `preferred_username` dipakai provisioning. */
export async function tokenFor(name: string, o: { lifetimeS?: number; username?: string | null; sub?: string; secret?: string } = {}) {
  const claims: Record<string, unknown> = {};
  if (o.username !== null) claims.preferred_username = o.username ?? name;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject(o.sub ?? `sub-${name}`).setIssuedAt(now)
    .setExpirationTime(now + (o.lifetimeS ?? 600)).sign(new TextEncoder().encode(o.secret ?? HS_SECRET));
}
