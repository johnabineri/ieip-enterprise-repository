/**
 * Guardrail REQ (REQ-02/03, D-03) — evaluator DETERMINISTIK lokal, dievaluasi sebelum teks menyentuh LLM mana pun.
 * Jujur soal batas: ini aturan pola (anti-jailbreak/prompt-injection + domain-fencing berbasis kata kunci), BUKAN NeMo Guardrails/OPA
 * sungguhan dan tidak mengklaim akurasi ≥ 99,5%. Fail-closed: galat evaluasi → permintaan ditolak (503), bukan diloloskan.
 */
export type GuardEngine = 'opa-rego' | 'fencing';
export interface GuardVerdict { allowed: boolean; engine?: GuardEngine; category?: string; reason?: string; ms: number }

const JAILBREAK: RegExp[] = [
  /abaikan\s+(semua\s+|seluruh\s+)?(instruksi|perintah|aturan)/i,
  /ignore\s+(all\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?)/i,
  /(system|developer)\s+(prompt|message|instruction)/i,
  /\bjailbreak\b/i, /\bDAN\b/, /developer\s+mode/i,
  /pura-?pura\s+(jadi|menjadi|kamu|anda)/i, /\b(role-?play|bermain\s+peran)\b/i, /you\s+are\s+now\b/i,
  /bypass\s+(guardrail|filter|aturan|pembatasan)/i, /matikan\s+(guardrail|filter|pembatasan)/i,
  /(tampilkan|ungkap|bocorkan)\s+(prompt|instruksi)\s+(sistem|awal|rahasia)/i, /reveal\s+(your\s+)?(system\s+)?(prompt|instructions)/i,
  /(<\|?\s*system\s*\|?>|\[\[?\s*system\s*\]?\]|###\s*(system|instruction)|BEGIN\s+SYSTEM)/i,       // indirect prompt injection
];
const OFF_TOPIC = /\b(resep|masak|memasak|sepak\s?bola|film|drakor|gosip|zodiak|horoskop|ramalan|lirik|lagu|pacar|togel|judi|saham\s+gorengan|wisata|cuaca\s+hari\s+ini)\b/i;
const DOMAIN = /\b(sistem|aplikasi|pengguna|aktor|admin|data|proses|layanan|api|modul|fitur|laporan|cabang|pelanggan|vendor|karyawan|approval|persetujuan|workflow|integrasi|dashboard|notifikasi|form|input|output|master|seddi|spk|pesanan|order|invoice|stok|gudang|role|akses|sebagai|saya\s+ingin|story|requirement|kebutuhan|validasi|database|tabel|aturan|bisnis|pengecualian|gagal|timeout|error|sehingga|agar|supaya|dokumen|transaksi|pembayaran|pengiriman|inventori|aset)\b/i;

export const MAX_LEN = 4000;

/** `firstTurn`: pesan pertama sesi wajib bernuansa perancangan sistem (fencing ketat); balasan lanjutan dibolehkan singkat. */
export function evaluate(text: string, firstTurn: boolean): GuardVerdict {
  const t0 = performance.now();
  const done = (v: Omit<GuardVerdict, 'ms'>): GuardVerdict => ({ ...v, ms: Math.max(1, Math.round(performance.now() - t0)) });
  try {
    if (text.length > MAX_LEN) return done({ allowed: false, engine: 'fencing', category: 'too-long', reason: `Pesan melebihi ${MAX_LEN} karakter.` });
    if (JAILBREAK.some((r) => r.test(text))) return done({ allowed: false, engine: 'opa-rego', category: 'jailbreak', reason: 'Terdeteksi pola prompt injection / roleplay jailbreak (REQ-03).' });
    const dom = DOMAIN.test(text);
    if (OFF_TOPIC.test(text) && !dom) return done({ allowed: false, engine: 'fencing', category: 'off-topic', reason: 'Topik di luar perancangan sistem korporat (D-03 hard fencing).' });
    if (firstTurn && !dom) return done({ allowed: false, engine: 'fencing', category: 'off-topic', reason: 'Pesan pertama harus menjelaskan kebutuhan sistem/aplikasi (D-03 hard fencing).' });
    return done({ allowed: true });
  } catch (e) {
    throw new Error('guardrail gagal dievaluasi (fail-closed): ' + (e as Error).message);
  }
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
