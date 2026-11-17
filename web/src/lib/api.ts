/* Klien EAP API: REST /api/v1, galat RFC 9457, ETag/If-Match, Idempotency-Key, kursor keyset.
   Token Bearer di sessionStorage per tab; diperbarui lewat OIDC sebelum habis dan sekali setelah 401. Port dari cmp/admin/assets/js/lib/api.js. */
import { apiBase, ss } from './config';
import { oidcEnabled, oidcEnsureFresh, oidcRefresh } from './oidc';
import { t } from '@/lib/i18n';

export type Row = Record<string, any>;
export interface Page<T = Row> { data: T[]; next_cursor?: string | null; nextCursor?: string | null }
export type Query = Record<string, string | number | boolean | undefined | null>;

export const token = () => ss.get('eap.token');
export const setToken = (t: string) => ss.set('eap.token', t);
export const clearToken = () => ss.del('eap.token');

export class ApiError extends Error {
  status: number; body: Row; title?: string; detail?: string; code?: string;
  constructor(status: number, body?: Row | null) {
    super((body && (body.detail || body.title)) || `HTTP ${status}`);
    this.status = status; this.body = body || {}; this.title = this.body.title; this.detail = this.body.detail; this.code = this.body.code || this.body.type;
  }
}
/** Pesan galat ramah (judul — rincian). */
export function explain(e: unknown): string {
  if (!(e instanceof ApiError)) return String((e as Error)?.message || e);
  if (e.status === 403) return t('Akses ditolak') + (e.detail ? ` — ${e.detail}` : t(' — peran Anda tidak mengizinkan tindakan ini.'));
  if (e.status === 412) return t('Data sudah diubah pengguna lain. Muat ulang lalu coba lagi.');
  return [e.title, e.detail].filter(Boolean).join(' — ') || `HTTP ${e.status}`;
}

let onExpired: () => void = () => {};
export const onSessionExpired = (fn: () => void) => { onExpired = fn; };
export const uuid = () => crypto.randomUUID();

interface ReqOpts { query?: Query; body?: unknown; headers?: Record<string, string>; auth?: boolean; quiet?: boolean; signal?: AbortSignal }

async function request(method: string, path: string, o: ReqOpts = {}, retried = false): Promise<{ data: any; etag: string | null }> {
  const { query, body, headers, auth = true, quiet = false, signal } = o;
  if (auth && oidcEnabled()) await oidcEnsureFresh();
  const url = new URL(apiBase() + path);
  Object.entries(query || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  const h: Record<string, string> = { Accept: 'application/json', ...(headers || {}) };
  const used = auth ? token() : null; // 401 dari permintaan sesi lama tidak boleh mengakhiri sesi baru
  if (used) h.Authorization = `Bearer ${used}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, { title: t('API tidak dapat dihubungi'), detail: t('Periksa bahwa EAP API berjalan di {0} dan CORS mengizinkan asal halaman ini.', apiBase()) });
  }
  const text = await res.text();
  let data: any = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { detail: text }; } }
  if (!res.ok) {
    if (res.status === 401 && auth && !quiet && used === token()) {
      if (!retried && oidcEnabled() && await oidcRefresh()) return request(method, path, o, true);
      clearToken(); onExpired();
    }
    throw new ApiError(res.status, data);
  }
  return { data, etag: res.headers.get('ETag') };
}

export const get = async <T = any>(path: string, query?: Query, opts?: Omit<ReqOpts, 'query'>): Promise<T> =>
  (await request('GET', path, { ...opts, query })).data;
export const getWithEtag = <T = any>(path: string, query?: Query) => request('GET', path, { query }) as Promise<{ data: T; etag: string | null }>;
/** EAP API memakai `next_cursor` pada sebagian daftar dan `nextCursor` pada yang lain; array polos = satu halaman. */
const normalize = (r: Page | Row[]): Page => (Array.isArray(r) ? { data: r, next_cursor: null } : { data: r.data || [], next_cursor: r.next_cursor ?? r.nextCursor ?? null });
/** Satu halaman daftar keyset: { data, next_cursor }. */
export const page = async (path: string, query?: Query, cursor?: string | null, limit = 100, signal?: AbortSignal): Promise<Page> =>
  normalize(await get<Page | Row[]>(path, { limit, ...query, ...(cursor ? { cursor } : {}) }, { signal }));
/** Mengikuti next_cursor sampai habis (maks `pages` × 100) — hanya untuk daftar referensi kecil. */
export async function all<T = Row>(path: string, query?: Query, pages = 30): Promise<T[]> {
  const out: T[] = []; let cursor: string | null | undefined;
  for (let i = 0; i < pages; i++) {
    const r = await get<Page<T> | T[]>(path, { limit: 100, ...query, ...(cursor ? { cursor } : {}) });
    if (Array.isArray(r)) { out.push(...r); break; }
    out.push(...(r.data || []));
    cursor = r.next_cursor ?? r.nextCursor;
    if (!cursor) break;
  }
  return out;
}
/** POST. Idempotency-Key hanya dipakai EAP API pada mediasi EIO (`/console/eio/…/mediate`); selain itu cukup tanpa `key`. */
const im = (v?: string | number | null): Record<string, string> => (v == null ? {} : { 'If-Match': /^"/.test(String(v)) ? String(v) : `"${v}"` });
/** `ifMatch` = row_version untuk POST aksi atas dokumen berversi (mis. /diagrams/:id/import). */
export const post = async <T = any>(path: string, body?: unknown, { key, ifMatch }: { key?: string; ifMatch?: string | number | null } = {}): Promise<T> =>
  (await request('POST', path, { body: body === undefined ? {} : body, headers: { ...(key ? { 'Idempotency-Key': key } : {}), ...im(ifMatch) } })).data;
export const patch = async <T = any>(path: string, body: unknown, rowVersion?: string | number | null): Promise<T> =>
  (await request('PATCH', path, { body, headers: im(rowVersion) })).data;
export const put = async <T = any>(path: string, body: unknown, rowVersion?: string | number | null): Promise<T> =>
  (await request('PUT', path, { body, headers: im(rowVersion) })).data;
export const del = async <T = any>(path: string, rowVersion?: string | number | null): Promise<T> =>
  (await request('DELETE', path, { headers: im(rowVersion) })).data;

/** GET /api/v1/me (EAP): identitas + peran + izin (daftar kode izin) + cakupan entitas. */
export interface Me {
  userId: string; username: string; displayName?: string; roles: string[]; permissions: string[];
  scope: { viewAll: boolean; editAll: boolean; editEntityCodes: string[] };
}
export const fetchMe = (quiet?: boolean) => get<Me>('/api/v1/me', undefined, { quiet });
