import { RE2JS, RE2JSException } from 're2js';
import { ProblemException } from '../common/problem';

/**
 * Mediasi EIO ringan (EIO-01..03) — fungsi MURNI per lapisan; pengendali (eio.controller.ts) yang merangkai, mencatat jejak dan
 * memanggil target. Definisi & aturan yang tidak boleh dilanggar ada di 300_eio_mediation.sql.
 *
 *   L1 Normalisasi protokol : masuk = REST/JSON (badan objek ≤ 64 KB); keluar = REST/JSON (GET/DELETE: field primitif tingkat atas
 *                             → query string). gRPC/GraphQL/webhook/SOAP BELUM didukung.
 *   L2 Propagasi identitas  : JWT pemanggil TIDAK pernah diteruskan. Target menerima X-Corporate-Id (= ref.users.id CMP), opsional
 *                             X-Employee-Id, X-Correlation-Id, X-EIO-Route, X-EIO-Exchange; kredensial ke target dari env.
 *   L3 Pemetaan kanonikal   : masukan divalidasi KETAT terhadap model kanonikal (field tak dikenal ditolak), lalu request_map
 *                             {target.path: "kanonikal.path" | {const}}; response_map memetakan respons target kembali.
 *   L4 Aturan bisnis        : aturan deklaratif rute (required|eq|ne|in|notIn|gt|gte|lt|lte|regex|maxLength) atas data kanonikal.
 *                             Lokal & deterministik — BUKAN OPA/Rego (guardrail OPA hanya untuk REQ/GSE-AI).
 *   L5 Orkestrasi           : konektor (satu panggilan HTTP) atau flow saga GSE (eksekutor ringan 299, bukan Temporal).
 *   L6 Publikasi peristiwa  : DB (trigger outbox pada console.eio_exchange) — CloudEvents dibentuk relay NATS, bukan di sini.
 *
 * Alamat target HANYA dari env (bukan dari klien/DB → bukan vektor SSRF): EIO_SVC_<KODE_KONEKTOR>=https://host/base
 * (+ opsional EIO_SVC_<KODE>_TOKEN = Bearer). EIO_TIMEOUT_MS (default 10000, maks 60000).
 */

export const EIO_LIMITS = { bodyBytes: 65_536, responseBytes: 1_048_576, regexInput: 1_024, regexMaxRepeat: 100, regexMaxRules: 10, maxRetries: 2, maxTimeoutMs: 60_000 };

export interface CanonField { name: string; type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'; required?: boolean; maxLength?: number; enum?: unknown[] }
export interface Rule { field: string; op: string; value?: unknown; message?: string }

const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** L1: badan masuk wajib objek JSON ≤ 64 KB. */
export function normalizeBody(data: unknown): Record<string, unknown> {
  if (data == null || typeOf(data) !== 'object') throw new ProblemException(400, 'bad-request', 'data wajib berupa objek JSON');
  if (Buffer.byteLength(JSON.stringify(data)) > EIO_LIMITS.bodyBytes) throw new ProblemException(413, 'payload-too-large', `data mediasi maksimum ${EIO_LIMITS.bodyBytes} byte`);
  return data as Record<string, unknown>;
}

/** L3: validasi ketat terhadap model kanonikal. Pesan hanya menyebut nama field (nilai tidak pernah dikutip). */
export function validateCanonical(data: Record<string, unknown>, fields: CanonField[]): string[] {
  const errs: string[] = [];
  const known = new Set(fields.map((f) => f.name));
  for (const k of Object.keys(data)) if (!known.has(k)) errs.push(`${k}: field tidak dikenal di model kanonikal`);
  for (const f of fields) {
    const v = data[f.name];
    if (v === undefined || v === null) { if (f.required) errs.push(`${f.name}: wajib diisi`); continue; }
    const t = typeOf(v);
    const ok = f.type === 'integer' ? t === 'number' && Number.isInteger(v) : f.type === 'number' ? t === 'number' && Number.isFinite(v as number) : t === f.type;
    if (!ok) { errs.push(`${f.name}: wajib bertipe ${f.type}`); continue; }
    if (f.type === 'string' && f.maxLength && (v as string).length > f.maxLength) errs.push(`${f.name}: maksimum ${f.maxLength} karakter`);
    if (f.enum && !f.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) errs.push(`${f.name}: nilai di luar daftar yang diizinkan`);
  }
  return errs;
}

/** Segmen yang dapat mencemari prototipe objek (prototype pollution) — ditolak di sini DAN di DB (300: console.eio_route_problems). */
const UNSAFE_SEGMENT = new Set(['__proto__', 'prototype', 'constructor']);
export const unsafePath = (path: string) => path.split('.').some((k) => UNSAFE_SEGMENT.has(k));

export function getPath(obj: unknown, path: string): unknown {
  if (unsafePath(path)) return undefined;
  let v: any = obj;
  for (const k of path.split('.')) { if (v == null || typeof v !== 'object' || Array.isArray(v) || !Object.prototype.hasOwnProperty.call(v, k)) return undefined; v = v[k]; }
  return v;
}
function setPath(obj: Record<string, any>, path: string, value: unknown) {
  if (unsafePath(path)) throw new ProblemException(422, 'validation-failed', `Path pemetaan tidak sah: ${path}`);
  const ks = path.split('.'); let o = obj;
  for (const k of ks.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(o, k) || o[k] == null || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
    o = o[k];
  }
  o[ks[ks.length - 1]] = value;
}

/** L3: map kosong = data diteruskan apa adanya; sumber yang tidak ada dilewati (bukan diisi null). */
export function applyMap(map: Record<string, unknown>, src: unknown): Record<string, unknown> {
  const entries = Object.entries(map ?? {});
  if (!entries.length) return src && typeOf(src) === 'object' ? { ...(src as object) } as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const [target, s] of entries) {
    const v = typeof s === 'string' ? getPath(src, s) : (s as { const: unknown }).const;
    if (v !== undefined) setPath(out, target, v);
  }
  return out;
}

/**
 * Aturan `regex` dievaluasi dengan RE2JS (port JS murni RE2): waktu LINEAR terhadap panjang input, tanpa
 * backtracking — ReDoS tidak mungkin terlepas dari bentuk pola. Sintaks RE2 tidak mendukung backreference
 * dan lookaround; pola itu (dan pola tidak sah lain) ditolak saat rute disimpan (422) dan lagi saat
 * dievaluasi (fail-closed). Semantik = `RegExp.test` (cari di mana saja; pakai ^…$ untuk seluruh nilai).
 */
const RE2_CACHE = new Map<string, RE2JS>();
function compileRe2(src: string): RE2JS {
  let re = RE2_CACHE.get(src);
  if (!re) {
    re = RE2JS.compile(src);
    if (RE2_CACHE.size >= 500) RE2_CACHE.delete(RE2_CACHE.keys().next().value as string);
    RE2_CACHE.set(src, re);
  }
  return re;
}

/** Alasan pola regex aturan ditolak (atau null bila sah). */
export function unsafeRegexReason(src: string): string | null {
  if (src.length > 200) return 'regex maksimum 200 karakter';
  // Biaya RE2 = O(input × ukuran program); pengulangan berhitung besar ({999}) mengembangkan program.
  // Batasi agar satu aturan ≤ beberapa ms pada input maksimum (diukur: {999} × 10.000 karakter ≈ 300 ms).
  for (const m of src.matchAll(/\{(\d+)(?:,(\d*))?\}/g))
    if (Number(m[1]) > EIO_LIMITS.regexMaxRepeat || Number(m[2] || 0) > EIO_LIMITS.regexMaxRepeat) return `pengulangan maksimum {${EIO_LIMITS.regexMaxRepeat}}`;
  try { compileRe2(src); return null; } catch (e) {
    const msg = e instanceof RE2JSException ? e.message.replace(/^error parsing regexp:\s*/, '') : 'pola tidak sah';
    return `pola tidak didukung RE2 (${msg.slice(0, 120)})`;
  }
}

/** Cocokkan nilai dengan pola RE2 (dipanggil hanya setelah unsafeRegexReason = null). */
export function regexTest(src: string, value: string): boolean {
  return compileRe2(src).matcher(value).find();
}

/** L4: aturan pertama yang dilanggar (atau null). Field kosong hanya dilanggar oleh `required`. */
export function evalRules(rules: Rule[], data: Record<string, unknown>): { rule: Rule; message: string } | null {
  const regexRules = (rules ?? []).filter((r) => r?.op === 'regex');
  if (regexRules.length > EIO_LIMITS.regexMaxRules)   // fail-closed (rute lama sebelum batas ini)
    return { rule: regexRules[0], message: `rute memuat lebih dari ${EIO_LIMITS.regexMaxRules} aturan regex` };
  for (const r of rules ?? []) {
    const v = getPath(data, r.field);
    const fail = (why: string) => ({ rule: r, message: r.message || `${r.field}: ${why}` });
    if (r.op === 'required') { if (v === undefined || v === null || v === '') return fail('wajib diisi'); continue; }
    if (v === undefined || v === null) continue;
    const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    switch (r.op) {
      case 'eq': if (!eq(v, r.value)) return fail('nilai tidak sesuai'); break;
      case 'ne': if (eq(v, r.value)) return fail('nilai tidak diizinkan'); break;
      case 'in': if (!(r.value as unknown[]).some((x) => eq(x, v))) return fail('nilai di luar daftar'); break;
      case 'notIn': if ((r.value as unknown[]).some((x) => eq(x, v))) return fail('nilai diblokir'); break;
      case 'gt': if (!(typeof v === 'number' && v > (r.value as number))) return fail(`harus > ${r.value}`); break;
      case 'gte': if (!(typeof v === 'number' && v >= (r.value as number))) return fail(`harus ≥ ${r.value}`); break;
      case 'lt': if (!(typeof v === 'number' && v < (r.value as number))) return fail(`harus < ${r.value}`); break;
      case 'lte': if (!(typeof v === 'number' && v <= (r.value as number))) return fail(`harus ≤ ${r.value}`); break;
      case 'maxLength': if (!(typeof v === 'string' && v.length <= (r.value as number))) return fail(`maksimum ${r.value} karakter`); break;
      case 'regex': {
        if (typeof r.value !== 'string' || unsafeRegexReason(r.value)) return fail('pola aturan tidak sah');
        if (typeof v !== 'string' || v.length > EIO_LIMITS.regexInput || !regexTest(r.value, v)) return fail('format tidak sesuai');
        break;
      }
      default: return fail(`operator ${r.op} tidak dikenal`);
    }
  }
  return null;
}

/** Path templat `${field}` dirender dari data kanonikal (encodeURIComponent); variabel kosong/non-primitif dilaporkan. */
export function renderPath(tpl: string, data: Record<string, unknown>): { path: string; missing: string[] } {
  const missing: string[] = [];
  const path = tpl.replace(/\$\{([^}]*)\}/g, (_m, name: string) => {
    const v = getPath(data, name);
    if ((typeof v === 'string' && v !== '') || typeof v === 'number' || typeof v === 'boolean') return encodeURIComponent(String(v));
    missing.push(name); return '';
  });
  return { path, missing };
}

/** L1 keluar: GET/DELETE → query string dari field primitif tingkat atas; lainnya → badan JSON. */
export function outbound(method: string, body: Record<string, unknown>): { query: string; body?: string } {
  if (method === 'GET' || method === 'DELETE') {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) if (['string', 'number', 'boolean'].includes(typeof v)) q.append(k, String(v));
    const s = q.toString();
    return { query: s ? `?${s}` : '' };
  }
  return { query: '', body: JSON.stringify(body) };
}

// ---------------- konfigurasi target (env saja) ----------------
export const eioEnvName = (code: string) => `EIO_SVC_${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
export interface EioTarget { url: string; token?: string }
export function eioTarget(code: string): EioTarget | null {
  const raw = (process.env[eioEnvName(code)] || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) return null;
  return { url: raw, token: process.env[`${eioEnvName(code)}_TOKEN`] || undefined };
}
export const eioTimeout = () => Math.min(Math.max(Number(process.env.EIO_TIMEOUT_MS) || 10_000, 100), EIO_LIMITS.maxTimeoutMs);

export interface CallResult { ok: boolean; retryable: boolean; status: number | null; data: unknown; error?: string; ms: number }

export async function callTarget(t: EioTarget, method: string, path: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<CallResult> {
  const t0 = Date.now(); const out = outbound(method, body);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), eioTimeout());
  try {
    const r = await fetch(`${t.url}${path}${out.query}`, {
      method, signal: ctl.signal, redirect: 'error',
      headers: { Accept: 'application/json', ...(out.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers, ...(t.token ? { Authorization: `Bearer ${t.token}` } : {}) },
      ...(out.body !== undefined ? { body: out.body } : {}),
    });
    const text = await r.text();
    let data: unknown = null;
    if (Buffer.byteLength(text) > EIO_LIMITS.responseBytes) data = { truncated: true, bytes: Buffer.byteLength(text) };
    else { try { data = text ? JSON.parse(text) : null; } catch { data = { text: text.slice(0, 500) }; } }
    const ok = r.status >= 200 && r.status < 300;
    return { ok, retryable: !ok && (r.status >= 500 || [408, 425, 429].includes(r.status)), status: r.status, data, ...(ok ? {} : { error: `target HTTP ${r.status}` }), ms: Date.now() - t0 };
  } catch (e: any) {
    const timeout = e?.name === 'AbortError';
    return { ok: false, retryable: true, status: null, data: null, error: timeout ? `timeout ${eioTimeout()} ms` : `jaringan: ${String(e?.cause?.code || e?.message || e).slice(0, 120)}`, ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}
