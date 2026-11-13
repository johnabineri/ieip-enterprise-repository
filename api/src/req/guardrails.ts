import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guardrail REQ & GSE-AI (REQ-02/03, D-03) — dievaluasi SEBELUM teks menyentuh LLM mana pun. Dua mesin, SATU sumber aturan
 * (./policy/data.json; korpus uji yang sama dijalankan `opa test` dan Jest):
 *   - `opa`     : Open Policy Agent sungguhan (OPA_URL) — kebijakan ./policy/guardrail.rego, POST /v1/data/keis/guardrail/decision.
 *   - `pattern` : evaluator lokal deterministik atas aturan yang sama (dipakai bila OPA_URL kosong, mis. dev/uji).
 * Fail-closed: OPA tidak terjangkau / timeout / jawaban tidak sah → Error (pemanggil menjawab 503), TIDAK PERNAH diloloskan diam-diam
 * dan tidak jatuh ke mesin lokal. Batas jujur: klasifikasi berbasis POLA (bukan model semantik/NeMo), tanpa klaim akurasi.
 */
export type GuardEngine = 'opa' | 'pattern';
export interface GuardVerdict { allowed: boolean; engine: GuardEngine; category?: string; reason?: string; ms: number }

interface Rules { max_len: number; jailbreak_ci: string[]; jailbreak_cs: string[]; off_topic_ci: string; domain_ci: string; reasons: Record<string, string> }
export const POLICY_DIR = join(__dirname, 'policy');
const POLICY = JSON.parse(readFileSync(join(POLICY_DIR, 'data.json'), 'utf8')).keis as { guardrail_rules: Rules; guardrail_cases: Array<{ text: string; first_turn: boolean; allowed: boolean; category?: string }> };
const R = POLICY.guardrail_rules;
export const GUARDRAIL_CASES = POLICY.guardrail_cases;
const JAILBREAK = [...R.jailbreak_ci.map((p) => new RegExp(p, 'i')), ...R.jailbreak_cs.map((p) => new RegExp(p))];
const OFF_TOPIC = new RegExp(R.off_topic_ci, 'i');
const DOMAIN = new RegExp(R.domain_ci, 'i');

export const MAX_LEN = R.max_len;

/** Mesin lokal (`pattern`). `firstTurn`: pesan pertama sesi wajib bernuansa perancangan sistem; balasan lanjutan boleh singkat. */
export function evaluate(text: string, firstTurn: boolean): GuardVerdict {
  const t0 = performance.now();
  const done = (v: Omit<GuardVerdict, 'ms' | 'engine'>): GuardVerdict => ({ ...v, engine: 'pattern', ms: Math.max(1, Math.round(performance.now() - t0)) });
  try {
    if (text.length > MAX_LEN) return done({ allowed: false, category: 'too-long', reason: R.reasons['too-long'] });
    if (JAILBREAK.some((r) => r.test(text))) return done({ allowed: false, category: 'jailbreak', reason: R.reasons.jailbreak });
    const dom = DOMAIN.test(text);
    if (OFF_TOPIC.test(text) && !dom) return done({ allowed: false, category: 'off-topic', reason: R.reasons['off-topic'] });
    if (firstTurn && !dom) return done({ allowed: false, category: 'off-topic', reason: R.reasons['first-turn'] });
    return done({ allowed: true });
  } catch (e) {
    throw new Error('guardrail gagal dievaluasi (fail-closed): ' + (e as Error).message);
  }
}

/** Konfigurasi mesin aktif (dibaca per panggilan, sehingga uji dapat mengubah env saat berjalan). */
export const guardEngine = (): { engine: GuardEngine; url: string | null; timeoutMs: number } => {
  const url = (process.env.OPA_URL || '').replace(/\/+$/, '') || null;
  return { engine: url ? 'opa' : 'pattern', url, timeoutMs: Number(process.env.OPA_TIMEOUT_MS || 1500) };
};

/** Evaluasi guardrail dengan mesin aktif. Melempar Error (→ 503) bila OPA dikonfigurasi tetapi tidak memberi keputusan sah. */
export async function guard(text: string, firstTurn: boolean): Promise<GuardVerdict> {
  const cfg = guardEngine();
  if (!cfg.url) return evaluate(text, firstTurn);
  const t0 = performance.now(); const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const r = await fetch(`${cfg.url}/v1/data/keis/guardrail/decision`, { method: 'POST', signal: ctl.signal, redirect: 'manual',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: { text, first_turn: firstTurn } }) });
    if (!r.ok) throw new Error(`OPA HTTP ${r.status}`);
    const d = (await r.json() as { result?: { allowed?: unknown; category?: unknown; reason?: unknown } }).result;
    // `result` hilang = kebijakan tidak termuat/path salah; tipe salah = kebijakan rusak → keduanya fail-closed
    if (!d || typeof d.allowed !== 'boolean' || (d.category !== undefined && typeof d.category !== 'string') || (d.reason !== undefined && typeof d.reason !== 'string')) throw new Error('keputusan OPA tidak sah');
    if (!d.allowed && d.category === 'internal') throw new Error(`OPA fail-closed: ${String(d.reason ?? '')}`.slice(0, 200));
    return { allowed: d.allowed, engine: 'opa', ...(d.allowed ? {} : { category: d.category as string, reason: d.reason as string }), ms: Math.max(1, Math.round(performance.now() - t0)) };
  } catch (e) {
    throw new Error('guardrail OPA tidak memberi keputusan (fail-closed): ' + ((e as Error).name === 'AbortError' ? `timeout ${cfg.timeoutMs} ms` : (e as Error).message));
  } finally { clearTimeout(timer); }
}

const MASKS: Array<[string, RegExp, string]> = [
  ['email', /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[EMAIL]'],
  ['npwp', /\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g, '[NPWP]'],
  ['nik', /\b\d{16}\b/g, '[NIK]'],
  ['telepon', /(\+62|\b0)8\d{8,12}\b/g, '[TELEPON]'],
];
/** Masking PII (setara Presidio untuk pola Indonesia) SEBELUM disimpan/dikirim ke LLM — D-14: PII tidak pernah masuk DB EAP. */
export function maskPii(text: string): { text: string; found: string[] } {
  const found: string[] = []; let out = text;
  for (const [name, re, rep] of MASKS) { if (re.test(out)) { found.push(name); out = out.replace(re, rep); } re.lastIndex = 0; }
  return { text: out, found };
}
