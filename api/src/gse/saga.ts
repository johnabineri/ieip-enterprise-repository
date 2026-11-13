import { ProblemException } from '../common/problem';

/**
 * Eksekutor saga ringan GSE-03 (pengganti sementara Temporal). Murni — tanpa DB; pengendali (saga.controller.ts) yang menyimpan jejak.
 *
 * Model eksekusi (orkestrasi, berurutan):
 *   aksi langkah 0..n-1 satu per satu; tiap aksi boleh di-retry (`retries`, 0..3) — aman karena layanan menerima Idempotency-Key yang SAMA
 *   pada tiap percobaan. Bila satu aksi gagal permanen → kompensasi langkah pemutasi yang sudah sukses dengan urutan TERBALIK
 *   (retry default 3; kompensasi juga idempoten). Kompensasi gagal permanen → run `failed` (butuh tindakan manusia).
 *
 * Mode:
 *   simulate : tanpa jaringan. `failAt` = nama langkah yang aksinya dipaksa gagal; `failCompensation` = nama langkah yang kompensasinya
 *              dipaksa gagal. Dipakai untuk menguji desain flow (urutan kompensasi) sebelum layanan ada.
 *   live     : HTTP POST ke layanan. Alamat HANYA dari env (bukan dari klien/DB → bukan vektor SSRF):
 *              SAGA_SVC_<KODE>=https://host/base (KODE = `service` langkah, huruf besar, non-alfanumerik → _), opsional
 *              SAGA_SVC_<KODE>_TOKEN (Bearer). Permintaan: POST <base>/<aksi> dengan header Idempotency-Key, X-Saga-Run, X-Saga-Phase dan
 *              badan {runId, flow, step, phase, idempotencyKey, input, result?} — `result` = respons aksi, dikirim ke kompensasinya.
 *              2xx = sukses; 408/425/429/5xx/timeout/jaringan = dapat di-retry; 4xx lain = gagal permanen.
 *              SAGA_TIMEOUT_MS (default 10000) = batas per percobaan bila langkah tidak menyebut `timeoutMs` (maks 60000).
 *
 * Kunci idempoten langkah = `<flow>:<langkah>:<idempotencyKey ter-render>`; templat `${var}` diambil dari `input` (string/angka/boolean).
 * Variabel yang tidak ada → 422 SEBELUM run dibuat. Kompensasi memakai kunci yang sama + akhiran `:compensate`.
 */

export interface SagaStepSpec {
  name: string; service: string; compensation?: string; idempotencyKey?: string; mutates?: boolean; retries?: number; timeoutMs?: number;
}
export type SagaMode = 'simulate' | 'live';
export interface SimulateOpts { failAt?: string; failCompensation?: string }

export const SAGA_LIMITS = { inputBytes: 16_384, resultBytes: 8_192, maxRetries: 3, compensationRetries: 3, maxTimeoutMs: 60_000, maxSteps: 50 };

export const stepsOf = (spec: any): SagaStepSpec[] => (Array.isArray(spec?.steps) ? spec.steps : []);
export const mutates = (s: SagaStepSpec) => s.mutates !== false;

const VAR = /\$\{([A-Za-z_][A-Za-z0-9_.]*)\}/g;

/** Render templat `${var}` dari input; mengembalikan juga daftar variabel yang tidak ada / bukan primitif. */
export function render(tpl: string, input: Record<string, unknown>): { value: string; missing: string[] } {
  const missing: string[] = [];
  const value = tpl.replace(VAR, (_m, name: string) => {
    let v: any = input;
    for (const k of name.split('.')) v = v != null && typeof v === 'object' ? v[k] : undefined;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    missing.push(name); return '';
  });
  return { value, missing };
}

/** Kunci idempoten tiap langkah (hanya langkah pemutasi atau yang menyebut idempotencyKey). 422 bila ada variabel yang tidak ada. */
export function planKeys(flowNama: string, spec: any, input: Record<string, unknown>): Array<string | null> {
  const steps = stepsOf(spec);
  if (steps.length > SAGA_LIMITS.maxSteps) throw new ProblemException(422, 'validation-failed', `Saga maksimum ${SAGA_LIMITS.maxSteps} langkah`);
  const miss = new Set<string>();
  const keys = steps.map((s) => {
    if (!s.idempotencyKey) return null;
    const r = render(s.idempotencyKey, input); r.missing.forEach((m) => miss.add(m));
    if (!r.value.trim()) miss.add(`${s.name}.idempotencyKey (kosong)`);
    return `${flowNama}:${s.name}:${r.value}`.slice(0, 500);
  });
  if (miss.size) throw new ProblemException(422, 'validation-failed', 'Input saga tidak lengkap', `Variabel tidak ada di input: ${[...miss].join(', ')}`);
  return keys;
}

export function checkInput(input: unknown): Record<string, unknown> {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new ProblemException(400, 'bad-request', 'input harus berupa objek JSON');
  if (Buffer.byteLength(JSON.stringify(input)) > SAGA_LIMITS.inputBytes) throw new ProblemException(413, 'payload-too-large', `input saga maksimum ${SAGA_LIMITS.inputBytes} byte`);
  return input as Record<string, unknown>;
}

// ---------------- konfigurasi layanan (env saja) ----------------
export const svcEnvName = (code: string) => `SAGA_SVC_${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
export interface SvcCfg { url: string; token?: string }
export function svcCfg(code: string): SvcCfg | null {
  const raw = (process.env[svcEnvName(code)] || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;   // tanpa kredensial di URL
  return { url: raw, token: process.env[`${svcEnvName(code)}_TOKEN`] || undefined };
}
/** Mode live: SEMUA layanan langkah wajib terkonfigurasi sebelum run dibuat (fail-closed, 503). */
export function requireServices(spec: any): void {
  const missing = [...new Set(stepsOf(spec).map((s) => s.service))].filter((c) => !svcCfg(c));
  if (missing.length) throw new ProblemException(503, 'service-unavailable', 'Layanan saga belum dikonfigurasi',
    `Atur ${missing.map(svcEnvName).join(', ')} (URL http/https) pada API, atau jalankan dengan mode "simulate".`);
}
export const timeoutOf = (s: SagaStepSpec) => Math.min(Math.max(Number(s.timeoutMs) || Number(process.env.SAGA_TIMEOUT_MS) || 10_000, 100), SAGA_LIMITS.maxTimeoutMs);
export const retriesOf = (s: SagaStepSpec, phase: 'action' | 'compensation') =>
  phase === 'compensation' ? SAGA_LIMITS.compensationRetries : Math.min(Math.max(Math.trunc(Number(s.retries) || 0), 0), SAGA_LIMITS.maxRetries);

// ---------------- pemanggilan satu percobaan ----------------
export interface CallCtx { runId: string; flow: string; step: SagaStepSpec; phase: 'action' | 'compensation'; key: string | null; input: Record<string, unknown>; result?: unknown }
export interface Attempt { ok: boolean; retryable: boolean; httpStatus: number | null; detail: Record<string, unknown>; result?: unknown; durationMs: number }

const clip = (v: unknown): unknown => {
  if (v === undefined) return undefined;
  const s = JSON.stringify(v);
  return s && Buffer.byteLength(s) > SAGA_LIMITS.resultBytes ? { truncated: true, bytes: Buffer.byteLength(s) } : v;
};

export function simulateAttempt(ctx: CallCtx, sim: SimulateOpts): Attempt {
  const fail = ctx.phase === 'action' ? sim.failAt === ctx.step.name : sim.failCompensation === ctx.step.name;
  return fail
    ? { ok: false, retryable: true, httpStatus: null, detail: { simulated: true, error: 'kegagalan disimulasikan' }, durationMs: 0 }
    : { ok: true, retryable: false, httpStatus: null, detail: { simulated: true }, result: { simulated: true, step: ctx.step.name, phase: ctx.phase }, durationMs: 0 };
}

export async function liveAttempt(ctx: CallCtx): Promise<Attempt> {
  const cfg = svcCfg(ctx.step.service);
  const t0 = Date.now();
  if (!cfg) return { ok: false, retryable: false, httpStatus: null, detail: { error: `${svcEnvName(ctx.step.service)} tidak dikonfigurasi` }, durationMs: 0 };
  const action = ctx.phase === 'action' ? ctx.step.name : (ctx.step.compensation as string);
  const key = ctx.key ? (ctx.phase === 'compensation' ? `${ctx.key}:compensate` : ctx.key) : null;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutOf(ctx.step));
  try {
    const r = await fetch(`${cfg.url}/${encodeURIComponent(action)}`, {
      method: 'POST', signal: ctl.signal, redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Saga-Run': ctx.runId, 'X-Saga-Phase': ctx.phase, ...(key ? { 'Idempotency-Key': key } : {}),
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify({ runId: ctx.runId, flow: ctx.flow, step: ctx.step.name, phase: ctx.phase, idempotencyKey: key, input: ctx.input,
        ...(ctx.phase === 'compensation' ? { result: ctx.result ?? null } : {}) }),
    });
    const text = await r.text(); let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { text: text.slice(0, 200) }; }
    const ok = r.status >= 200 && r.status < 300;
    const retryable = !ok && (r.status >= 500 || [408, 425, 429].includes(r.status));
    return { ok, retryable, httpStatus: r.status, detail: ok ? {} : { error: `HTTP ${r.status}`, body: clip(data) }, result: ok ? clip(data) : undefined, durationMs: Date.now() - t0 };
  } catch (e: any) {
    const timeout = e?.name === 'AbortError';
    return { ok: false, retryable: true, httpStatus: null, detail: { error: timeout ? `timeout ${timeoutOf(ctx.step)} ms` : `jaringan: ${String(e?.cause?.code || e?.message || e).slice(0, 120)}` }, durationMs: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}

export const backoffMs = (attempt: number) => Math.min(200 * 2 ** (attempt - 1), 2_000);
