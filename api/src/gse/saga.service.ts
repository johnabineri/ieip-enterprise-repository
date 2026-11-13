import { Injectable, NotFoundException } from '@nestjs/common';
import { Principal } from '../auth/auth';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { maskPii } from '../req/guardrails';
import {
  Attempt, backoffMs, checkInput, liveAttempt, mutates, planKeys, requireServices, retriesOf, SagaMode, SagaStepSpec, simulateAttempt,
  SimulateOpts, stepsOf, timeoutOf,
} from './saga';

export const sagaStepDto = (s: any) => ({ id: Number(s.id), seq: s.seq, step: s.step, phase: s.phase, action: s.action, service: s.service, idempotencyKey: s.idempotency_key,
  attempt: s.attempt, status: s.status, httpStatus: s.http_status, detail: s.detail, durationMs: s.duration_ms, createdAt: s.created_at });
export const sagaRunDto = (r: any, steps?: any[]) => ({ id: r.id, flowId: r.flow_id, flowNama: r.flow_nama, flowVersion: r.flow_version, mode: r.mode, input: r.input,
  runKey: r.run_key, status: r.status, failedStep: r.failed_step, error: r.error, startedBy: r.started_by, startedAt: r.started_at, finishedAt: r.finished_at,
  leaseUntil: r.lease_until, version: r.row_version, ...(steps ? { steps: steps.map(sagaStepDto) } : {}) });
export type SagaRunView = ReturnType<typeof sagaRunDto>;

const sortKeys = (v: any): any => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export interface StartOpts extends SimulateOpts { input?: unknown; mode?: SagaMode; runKey?: string | null }

/**
 * Mesin eksekutor saga ringan GSE-03 (lihat saga.ts dan 299_gse_saga.sql). Dipakai GseSagaController (/gse/flows/:id/runs) dan
 * mediasi EIO L5 (/console/eio/routes/:kode/mediate). Run dijalankan SINKRON; tiap percobaan langkah dicatat di transaksinya sendiri
 * dan HTTP ke layanan selalu DI LUAR transaksi DB. Hak menjalankan ditegakkan RLS (gse.project.run, atau console.eio.run untuk flow
 * yang menjadi target rute EIO aktif — 300_eio_mediation.sql).
 */
@Injectable()
export class GseSagaService {
  constructor(private readonly db: DbService) {}

  /** Memulai (atau memutar ulang, bila runKey sama) satu run. `replayed` = run lama dikembalikan tanpa dijalankan ulang. */
  async start(p: Principal, flowId: string, o: StartOpts): Promise<{ run: SagaRunView; replayed: boolean }> {
    const mode: SagaMode = o.mode ?? 'simulate';
    const input = checkInput(o.input);
    if (maskPii(JSON.stringify(input)).found.length)                                                   // D-14: EAP tidak menyimpan PII
      throw new ProblemException(422, 'validation-failed', 'Input saga mengandung PII', 'Kirim pengenal (mis. order_id), bukan email/NIK/NPWP/telepon.');
    const runKey = o.runKey?.trim() || null;
    if (runKey && (runKey.length > 200 || !/^[\x21-\x7e]+$/.test(runKey))) throw new ProblemException(400, 'bad-request', 'Idempotency-Key maksimum 200 karakter ASCII cetak');
    const f = await this.db.tx(p, async (c) => (await c.query('SELECT id, nama, kind, spec, status FROM gse.flow WHERE id = $1 AND deleted_at IS NULL', [flowId])).rows[0]);
    if (!f) throw new NotFoundException('flow tidak ditemukan');
    if (f.kind !== 'saga') throw new ProblemException(422, 'validation-failed', 'Hanya flow saga yang dapat dijalankan');
    const names = stepsOf(f.spec).map((s) => s.name);
    if (mode === 'live' && (o.failAt || o.failCompensation)) throw new ProblemException(400, 'bad-request', 'failAt/failCompensation hanya untuk mode simulate');
    for (const n of [o.failAt, o.failCompensation]) if (n && !names.includes(n)) throw new ProblemException(422, 'validation-failed', `Langkah ${n} tidak ada di flow`);

    // pengulangan dengan Idempotency-Key yang sama → run yang sama (tidak dijalankan dua kali)
    const replay = async () => {
      const r = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM gse.saga_run WHERE flow_id = $1 AND run_key = $2', [flowId, runKey])).rows[0]);
      if (!r) return null;
      if (r.mode !== mode || !sameJson(r.input, input)) throw new ProblemException(409, 'conflict', 'Idempotency-Key sudah dipakai dengan input/mode berbeda');
      return { run: await this.detail(p, r.id), replayed: true };
    };
    if (runKey) { const r = await replay(); if (r) return r; }

    planKeys(f.nama, f.spec, input);                                                                    // 422 sebelum run dibuat
    if (mode === 'live') { requireServices(f.spec); await this.requireSwitch(p); }
    let runId: string;
    try {
      runId = await this.db.tx(p, async (c) => (await c.query(
        'INSERT INTO gse.saga_run (flow_id, mode, input, run_key) VALUES ($1,$2,$3::jsonb,$4) RETURNING id', [flowId, mode, JSON.stringify(input), runKey])).rows[0].id);
    } catch (e: any) {
      if (e?.code === '23505' && runKey) { const r = await replay(); if (r) return r; }               // balapan dua permintaan berkunci sama
      throw e;
    }
    await this.execute(p, runId, { failAt: o.failAt, failCompensation: o.failCompensation });
    return { run: await this.detail(p, runId), replayed: false };
  }

  /** Pemulihan run yang terhenti (API mati di tengah run): lease harus sudah kedaluwarsa; langkah sukses dikompensasi. */
  async recover(p: Principal, runId: string): Promise<SagaRunView> {
    const r = await this.db.tx(p, async (c) => {
      const cur = (await c.query('SELECT *, lease_until < now() AS expired FROM gse.saga_run WHERE id = $1 FOR UPDATE', [runId])).rows[0];
      if (!cur) throw new NotFoundException('run saga tidak ditemukan');
      if (!['running', 'compensating'].includes(cur.status)) throw new ProblemException(409, 'conflict', `Run sudah selesai (${cur.status})`);
      if (!cur.expired) throw new ProblemException(409, 'conflict', 'Run masih dipegang eksekutor', `Lease berlaku sampai ${new Date(cur.lease_until).toISOString()}.`);
      if (cur.mode === 'live') requireServices(cur.spec);
      if (cur.status === 'running')
        await c.query(`UPDATE gse.saga_run SET status = 'compensating', error = 'dipulihkan: eksekutor terhenti sebelum run selesai', lease_until = now() + interval '2 minutes' WHERE id = $1`, [runId]);
      else await c.query(`UPDATE gse.saga_run SET lease_until = now() + interval '2 minutes' WHERE id = $1`, [runId]);
      return cur;
    });
    await this.execute(p, r.id, {});
    return this.detail(p, runId);
  }

  async detail(p: Principal, runId: string): Promise<SagaRunView> {
    return this.db.tx(p, async (c) => {
      const r = (await c.query('SELECT * FROM gse.saga_run WHERE id = $1', [runId])).rows[0];
      if (!r) throw new NotFoundException('run saga tidak ditemukan');
      return sagaRunDto(r, (await c.query('SELECT * FROM gse.saga_step WHERE run_id = $1 ORDER BY id', [runId])).rows);
    });
  }

  // ---------------- mesin ----------------
  private async switchOn(p: Principal): Promise<boolean> {
    return this.db.tx(p, async (c) => (await c.query(`SELECT console.agent_enabled('gse-saga') AS on`)).rows[0].on);
  }
  private async requireSwitch(p: Principal) {
    if (!(await this.switchOn(p))) throw new ProblemException(503, 'agent-disabled', 'Eksekutor saga (live) dinonaktifkan', 'Kill-switch gse-saga nonaktif di CONSOLE.');
  }

  private async setStatus(p: Principal, runId: string, status: string, failedStep?: string, error?: string) {
    await this.db.tx(p, (c) => c.query('UPDATE gse.saga_run SET status = $2, failed_step = COALESCE($3, failed_step), error = COALESCE($4, error) WHERE id = $1',
      [runId, status, failedStep ?? null, error ? error.slice(0, 1000) : null]));
  }

  private async execute(p: Principal, runId: string, sim: SimulateOpts) {
    const run = await this.db.tx(p, async (c) => (await c.query('SELECT * FROM gse.saga_run WHERE id = $1', [runId])).rows[0]);
    const steps = stepsOf(run.spec);
    const keys = planKeys(run.flow_nama, run.spec, run.input);
    const log = await this.db.tx(p, async (c) => (await c.query(`SELECT seq, phase, detail FROM gse.saga_step WHERE run_id = $1 AND status = 'ok'`, [runId])).rows);
    const okAction = new Map<number, unknown>(log.filter((x) => x.phase === 'action').map((x) => [x.seq, x.detail?.result ?? null]));
    const okComp = new Set<number>(log.filter((x) => x.phase === 'compensation').map((x) => x.seq));
    let status: string = run.status;

    if (status === 'running') {
      for (let i = 0; i < steps.length; i++) {
        if (okAction.has(i)) continue;
        const r = await this.attempts(p, run, i, steps[i], 'action', keys[i], sim);
        if (!r.ok) { await this.setStatus(p, runId, 'compensating', steps[i].name, `langkah ${steps[i].name} gagal: ${r.error}`); status = 'compensating'; break; }
        okAction.set(i, r.result ?? null);
      }
      if (status === 'running') { await this.setStatus(p, runId, 'completed'); return; }
    }
    // kompensasi: urutan terbalik, hanya langkah pemutasi yang aksinya sukses
    for (let i = steps.length - 1; i >= 0; i--) {
      if (!okAction.has(i) || !mutates(steps[i]) || okComp.has(i)) continue;
      const r = await this.attempts(p, run, i, steps[i], 'compensation', keys[i], sim, okAction.get(i));
      if (!r.ok) { await this.setStatus(p, runId, 'failed', undefined, `kompensasi ${steps[i].compensation} (langkah ${steps[i].name}) gagal: ${r.error} — butuh tindakan manual`); return; }
    }
    await this.setStatus(p, runId, 'compensated');
  }

  /** Semua percobaan satu fase satu langkah; tiap percobaan dicatat dalam transaksinya sendiri. */
  private async attempts(p: Principal, run: any, seq: number, step: SagaStepSpec, phase: 'action' | 'compensation', key: string | null, sim: SimulateOpts, result?: unknown)
    : Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const max = retriesOf(step, phase) + 1;
    const prior = await this.db.tx(p, async (c) => (await c.query('SELECT count(*)::int AS n FROM gse.saga_step WHERE run_id = $1 AND seq = $2 AND phase = $3', [run.id, seq, phase])).rows[0].n);
    const leaseMs = (timeoutOf(step) + 2_000) * max + 30_000;
    let last: Attempt | null = null;
    for (let a = 1; a <= max; a++) {
      // kill-switch menghentikan AKSI baru; kompensasi tetap berjalan agar data kembali konsisten
      if (run.mode === 'live' && phase === 'action' && !(await this.switchOn(p)))
        last = { ok: false, retryable: false, httpStatus: null, detail: { error: 'kill-switch gse-saga nonaktif' }, durationMs: 0 };
      else {
        await this.db.tx(p, (c) => c.query(`UPDATE gse.saga_run SET lease_until = now() + ($2::int * interval '1 millisecond') WHERE id = $1`, [run.id, leaseMs]));
        const ctx = { runId: run.id, flow: run.flow_nama, step, phase, key, input: run.input, result };
        last = run.mode === 'live' ? await liveAttempt(ctx) : simulateAttempt(ctx, sim);
      }
      const detail = last.ok ? { ...last.detail, result: last.result ?? null } : last.detail;
      const idem = key ? (phase === 'compensation' ? `${key}:compensate` : key) : null;
      await this.db.tx(p, (c) => c.query(
        `INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, idempotency_key, attempt, status, http_status, detail, duration_ms)
         VALUES ($1,$2,$3,$4,$11,$12,$5,$6,$7,$8,$9::jsonb,$10)`,          // action/service ditimpa trigger dari snapshot spec
        [run.id, seq, step.name, phase, idem, prior + a, last!.ok ? 'ok' : 'failed', last!.httpStatus, JSON.stringify(detail), last!.durationMs, (phase === 'action' ? step.name : step.compensation) ?? '', step.service ?? '']));
      if (last.ok) return { ok: true, result: last.result };
      if (!last.retryable) break;
      if (run.mode === 'live' && a < max) await sleep(backoffMs(a));
    }
    return { ok: false, error: String(last?.detail?.error ?? 'gagal') };
  }
}
