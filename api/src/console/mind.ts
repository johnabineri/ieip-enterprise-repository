/* MIND Architecture Copilot — mesin alat DETERMINISTIK atas data EAW nyata (RLS pemanggil). Tidak ada angka/nama karangan: setiap jawaban disusun dari
   hasil kueri. LLM (bila dikonfigurasi, lihat mind.controller.ts) HANYA merangkai ulang fakta hasil alat menjadi kalimat dan jawabannya diperiksa
   terhadap fakta; tanpa LLM jawaban deterministik inilah yang dikirim. */
import { ecosystemOf } from '../eaw/ecosystem';
import { impactOf, TABLE, TYPES } from '../eaw/impact';

export type Intent = 'impact' | 'dependencies' | 'status' | 'redundancy' | 'drift' | 'kpi' | 'ika' | 'summary' | 'help';
export interface Source { label: string; route: string }
export interface Reply { intent: Intent; answer: string; facts: unknown; sources: Source[]; notes: string[] }
export interface Target { type: string; id: string; label: string; status: string | null; score: number; hit: string }

const JENIS: Record<string, string> = { process: 'proses', service: 'layanan', application: 'aplikasi', data_entity: 'entitas data', infra_asset: 'infrastruktur', control: 'kontrol', workspace: 'workspace', platform: 'platform' };
const ROUTE: Record<string, string> = { process: '/eaw/proses/', service: '/eaw/layanan/', application: '/eaw/aplikasi/', data_entity: '/eaw/data/', infra_asset: '/eaw/infra/', control: '/eaw/keamanan/' };
const IMPACT_RE = /terdampak|dampak|downtime|\bmati\b|\bgagal\b|impact|terganggu|tumbang|\boff\b|offline/i;
const DEPEND_RE = /dependensi|bergantung\s+(pada|ke)|membutuhkan|memerlukan|depends?\s+on|dependency/i;

export const SUGGESTIONS = [
  'Aplikasi apa saja yang terdampak jika infrastruktur utama downtime?',
  'Apa saja redundansi aplikasi yang terdeteksi?',
  'Apakah ada drift arsitektur atau konektor bermasalah?',
  'Bagaimana capaian KPI ekosistem?',
  'Berapa jumlah objek arsitektur per status?',
];

/** Maksud pertanyaan berdasarkan kata kunci (deterministik, diuji). `hasTarget` = sebuah objek EAW disebut: dampak/dependensi/status didahulukan. */
export function detectIntent(q: string, hasTarget = false): Intent {
  const t = q.toLowerCase();
  if (hasTarget && DEPEND_RE.test(t)) return 'dependencies';
  if (hasTarget && IMPACT_RE.test(t)) return 'impact';
  if (/redundan|duplik|mirip|overlap|tumpang\s*tindih/.test(t)) return 'redundancy';
  if (/\bdrift\b|shadow|breaking|konektor|kontrak|openapi|menyimpang|bermasalah/.test(t)) return 'drift';
  if (/\bkpi\b|indikator\s+kinerja|capaian|target\s+fase/.test(t)) return 'kpi';
  if (/\bika\b|kematangan|maturity|\bkaf\b/.test(t)) return 'ika';
  if (hasTarget && /status|gate|af-?06|clearance|\barb\b|kesiapan|siap\b|readiness|lolos|tahap/.test(t)) return 'status';
  if (!hasTarget && /\barb\b|clearance|af-?06/.test(t)) return 'status';
  if (/berapa|jumlah|ringkas|rangkuman|summary|total|statistik|per\s+status/.test(t)) return 'summary';
  if (hasTarget) return 'status';
  if (DEPEND_RE.test(t)) return 'dependencies';
  if (IMPACT_RE.test(t)) return 'impact';
  return 'help';
}

/** Objek EAW yang disebut dalam pertanyaan: kemiripan trigram (kata) nama/kode terhadap teks, hanya yang terlihat pemanggil (RLS).
 *  `hit` = pengenal (kode/nama) TERPANJANG yang muncul HARFIAH di teks. Urutan: skor → hit terpanjang → label terpanjang, sehingga "BASE-AEGIS" mengalahkan
 *  platform "BASE" (kode "BASE" juga cocok sebagai kata pada teks "BASE-AEGIS" dan sama-sama skor 1). */
export async function findTargets(c: any, text: string): Promise<Target[]> {
  const q = `SELECT type, id, label, status, sc, names FROM (
      SELECT 'application'::text AS type, x.id, x.kode || ' · ' || x.nama AS label, x.status::text, GREATEST(word_similarity(x.nama, $1), word_similarity(x.kode, $1)) AS sc, ARRAY[x.kode::text, x.nama::text] AS names FROM eaw.application x WHERE x.deleted_at IS NULL
      UNION ALL SELECT 'process', x.id, x.nama, x.status::text, word_similarity(x.nama, $1), ARRAY[x.nama::text] FROM eaw.process x WHERE x.deleted_at IS NULL
      UNION ALL SELECT 'service', x.id, x.nama, x.status::text, word_similarity(x.nama, $1), ARRAY[x.nama::text] FROM eaw.service x WHERE x.deleted_at IS NULL
      UNION ALL SELECT 'data_entity', x.id, x.nama_kanonikal, x.status::text, word_similarity(x.nama_kanonikal, $1), ARRAY[x.nama_kanonikal::text] FROM eaw.data_entity x WHERE x.deleted_at IS NULL
      UNION ALL SELECT 'infra_asset', x.id, x.nama, x.status::text, GREATEST(word_similarity(x.nama, $1), word_similarity(COALESCE(x.lokasi, ''), $1)), ARRAY[x.nama::text] FROM eaw.infra_asset x WHERE x.deleted_at IS NULL
      UNION ALL SELECT 'control', x.id, x.aspek || COALESCE(' · ' || x.standar_rujukan, ''), x.status::text, word_similarity(x.aspek, $1), ARRAY[x.aspek::text] FROM eaw.control x WHERE x.deleted_at IS NULL
    ) m WHERE sc >= 0.6 AND length(label) >= 5 ORDER BY sc DESC, length(label) DESC LIMIT 30`;
  const low = text.toLowerCase();
  const rows: Target[] = (await c.query(q, [text])).rows.map((r: any) => ({
    type: r.type, id: r.id, label: r.label, status: r.status, score: Number(r.sc),
    hit: ((r.names as string[]).filter((n) => n && n.length >= 3 && low.includes(n.toLowerCase())).sort((a, b) => b.length - a.length)[0]) ?? '',
  }));
  return rows.sort((a, b) => b.score - a.score || b.hit.length - a.hit.length || b.label.length - a.label.length).slice(0, 6);
}

const list = (xs: string[], max = 8) => (xs.length > max ? [...xs.slice(0, max), `… dan ${xs.length - max} lainnya`] : xs);
const bullets = (xs: string[]) => xs.map((x) => `• ${x}`).join('\n');

async function safe<T>(c: any, name: string, fn: () => Promise<T>, fb: T): Promise<T> {
  await c.query(`SAVEPOINT mind_${name}`);
  try { const v = await fn(); await c.query(`RELEASE SAVEPOINT mind_${name}`); return v; } catch { await c.query(`ROLLBACK TO SAVEPOINT mind_${name}`); return fb; }
}

async function toolImpact(c: any, t: Target, direction: 'impact' | 'dependencies'): Promise<Reply> {
  const r = await impactOf(c, t.type, t.id, direction, 10);
  // keanggotaan workspace di platform = edge 'hosting' (305): sebutkan sebagai "workspace"/"platform", bukan "aplikasi"
  const hostTo = new Set(r.edges.filter((e) => e.tipe === 'hosting').map((e) => e.to));
  const hostFrom = new Set(r.edges.filter((e) => e.tipe === 'hosting').map((e) => e.from));
  const role = (type: string, id: string) => (hostTo.has(`${type}:${id}`) ? 'workspace' : hostFrom.has(`${type}:${id}`) ? 'platform' : type);
  const rootRole = t.type === 'application' && (hostFrom.has(`${t.type}:${t.id}`) || hostTo.has(`${t.type}:${t.id}`)) ? role(t.type, t.id) : t.type;
  const shown = r.nodes.filter((n) => n.depth > 0 && !n.hidden);
  const by = new Map<string, string[]>();
  shown.forEach((n) => { const k = role(n.type, n.id); by.set(k, [...(by.get(k) ?? []), `${n.label}${n.status ? ` (${n.status})` : ''}`]); });
  const head = direction === 'impact'
    ? `Jika ${t.label} (${JENIS[rootRole]}, ${t.status}) terganggu, terdampak ${r.summary.total} objek`
    : `${t.label} (${JENIS[rootRole]}, ${t.status}) bergantung pada ${r.summary.total} objek`;
  const lines = [...by.entries()].map(([ty, xs]) => `${JENIS[ty]} (${xs.length}): ${list(xs).join(', ')}`);
  const tail = [r.summary.hidden ? `${r.summary.hidden} objek berada di luar cakupan akses Anda sehingga tidak dirinci.` : '', r.truncated ? 'Hasil dipotong pada batas 1000 objek.' : '',
    r.summary.total ? `${r.summary.baseline} di antaranya berstatus baseline (Ditetapkan/Dipublikasi/Direviu).` : ''].filter(Boolean);
  const answer = r.summary.total === 0
    ? `${head.replace(/terdampak 0 objek|bergantung pada 0 objek/, direction === 'impact' ? 'tidak ada objek lain yang bergantung padanya' : 'tidak bergantung pada objek lain')} menurut relasi yang tercatat di EAW.`
    : `${head}:\n${bullets(lines)}${tail.length ? '\n' + tail.join(' ') : ''}`;
  return { intent: direction, answer, facts: { root: { ...r.root, jenis: JENIS[rootRole] }, direction, summary: r.summary, perJenis: Object.fromEntries([...by.entries()].map(([k, v]) => [JENIS[k], v.length])), contoh: Object.fromEntries([...by.entries()].map(([k, v]) => [JENIS[k], v.slice(0, 8)])) },
    sources: [{ label: 'Lineage & Impact', route: '/eaw/lineage/' }, { label: `Daftar ${JENIS[t.type]}`, route: ROUTE[t.type] }], notes: ['Berdasarkan relasi EAW yang tercatat (termasuk platform → workspace) — bukan pemindaian infrastruktur sungguhan.'] };
}

async function toolStatus(c: any, t: Target): Promise<Reply> {
  const lines = [`${t.label} (${JENIS[t.type]}): status ${t.status}.`];
  const facts: Record<string, unknown> = { objek: t.label, jenis: JENIS[t.type], status: t.status };
  if (t.type === 'application') {
    const a = (await c.query(`SELECT a.platform, a.jenis_node, a.adopsi, a.workspace_mode, k.ticket_number, k.status AS arb FROM eaw.application a LEFT JOIN eaw.arb_clearance k ON k.id = a.arb_clearance_id AND k.deleted_at IS NULL WHERE a.id = $1`, [t.id])).rows[0];
    if (a) {
      lines.push(a.jenis_node === 'workspace' ? `Workspace${a.platform ? ` di platform ${a.platform}` : ' belum ditempatkan di platform'}.` : 'Platform.');
      lines.push(a.adopsi ? 'Gate AF-06: ditandai adopsi (sudah ada sebelum EAP, bebas tiket ARB).' : a.ticket_number ? `Gate AF-06: tiket ARB ${a.ticket_number} berstatus ${a.arb}.` : 'Gate AF-06: belum ada tiket ARB tertaut.');
      Object.assign(facts, { platform: a.platform, adopsi: a.adopsi, tiketArb: a.ticket_number ?? null, statusArb: a.arb ?? null });
    }
  }
  const rules = await safe(c, 'ready', async () => (await c.query('SELECT rule, ok, n, pesan FROM eaw.relation_check($1, $2)', [t.type, t.id])).rows, [] as any[]);
  if (rules.length) {
    const kurang = rules.filter((r: any) => !r.ok);
    lines.push(kurang.length ? `Kesiapan Divalidasi: belum — ${kurang.map((r: any) => r.pesan).join('; ')}.` : 'Kesiapan Divalidasi: seluruh relasi wajib terpenuhi.');
    facts.kesiapan = { siap: kurang.length === 0, kurang: kurang.map((r: any) => r.pesan) };
  }
  return { intent: 'status', answer: lines.join('\n'), facts, sources: [{ label: `Daftar ${JENIS[t.type]}`, route: ROUTE[t.type] }, { label: 'ARB Clearance', route: '/eaw/arb/' }], notes: [] };
}

async function toolArbQueue(c: any): Promise<Reply> {
  const rows = (await c.query(`SELECT status, count(*)::int AS n FROM eaw.arb_clearance WHERE deleted_at IS NULL GROUP BY status ORDER BY status`)).rows;
  const total = rows.reduce((s: number, r: any) => s + r.n, 0);
  return { intent: 'status', answer: total ? `Tiket ARB yang terlihat oleh Anda: ${total}.\n${bullets(rows.map((r: any) => `${r.status}: ${r.n}`))}\nSebut nama aplikasi/objek untuk melihat status gate AF-06 dan kesiapannya.` : 'Belum ada tiket ARB yang terlihat oleh Anda. Sebut nama aplikasi/objek untuk melihat status gate AF-06 dan kesiapannya.',
    facts: { total, perStatus: Object.fromEntries(rows.map((r: any) => [r.status, r.n])) }, sources: [{ label: 'ARB Clearance', route: '/eaw/arb/' }], notes: [] };
}

async function toolEco(c: any, intent: 'redundancy' | 'drift' | 'kpi'): Promise<Reply> {
  const e = await ecosystemOf(c);
  if (intent === 'kpi') {
    const lines = e.kpis.map((k: any) => (k.value == null ? `${k.id} ${k.label}: belum dapat dihitung — ${k.reason}` : `${k.id} ${k.label}: ${k.value} (target ${k.target})`));
    return { intent, answer: `KPI Ekosistem:\n${bullets(lines)}`, facts: { kpi: e.kpis.map((k: any) => ({ id: k.id, label: k.label, nilai: k.value, target: k.target, alasan: k.reason ?? null })) }, sources: [{ label: 'Dashboard › KPI Ekosistem', route: '/eaw/dashboard/' }], notes: [e.notCovered.join(' · ')] };
  }
  const sig = (intent === 'redundancy' ? e.redundancy : e.drift) as Array<{ level: string; kind: string; title: string; detail: string; route?: string }>;
  const nama = intent === 'redundancy' ? 'redundansi' : 'drift arsitektur';
  const answer = sig.length ? `Terdeteksi ${sig.length} sinyal ${nama}:\n${bullets(list(sig.map((s) => `[${s.kind}] ${s.title} — ${s.detail}`)))}` : `Tidak ada sinyal ${nama} pada data yang terlihat oleh Anda.`;
  return { intent, answer, facts: { jumlah: sig.length, sinyal: sig.slice(0, 10).map((s) => ({ jenis: s.kind, judul: s.title, rincian: s.detail })) },
    sources: [{ label: 'Dashboard › Redundancy & Drift Monitor', route: '/eaw/dashboard/' }, ...(intent === 'drift' ? [{ label: 'CONSOLE › EIO', route: '/console/eio/' }] : [{ label: 'ARB Clearance', route: '/eaw/arb/' }])],
    notes: [`Batas deteksi: ${e.notCovered.join(' · ')}`] };
}

async function toolIka(c: any): Promise<Reply> {
  const rows = (await c.query(`SELECT code, name, kaf_level, ika_level FROM eaw.entity_org WHERE is_active ORDER BY code`)).rows;
  const rated = rows.filter((r: any) => r.ika_level != null);
  const avg = rated.length ? rated.reduce((s: number, r: any) => s + r.ika_level, 0) / rated.length : null;
  const answer = rated.length
    ? `Dari ${rows.length} entitas, ${rated.length} sudah memiliki IKA manual (rata-rata ${String(Math.round(avg! * 10) / 10).replace('.', ',')}).\n${bullets(list(rated.sort((a: any, b: any) => b.ika_level - a.ika_level).map((r: any) => `${r.code}: IKA ${r.ika_level}${r.kaf_level ? `, KAF ${r.kaf_level}` : ''}`)))}\nIKA terhitung otomatis dari data EAW ada di CONSOLE › Skor IKA.`
    : `Dari ${rows.length} entitas, belum ada yang memiliki IKA manual. IKA terhitung otomatis dari data EAW ada di CONSOLE › Skor IKA.`;
  return { intent: 'ika', answer, facts: { entitas: rows.length, berIka: rated.length, rataRata: avg }, sources: [{ label: 'CONSOLE › Skor IKA', route: '/console/ika/' }, { label: 'SET › Struktur Organisasi', route: '/set/org/' }], notes: [] };
}

async function toolSummary(c: any): Promise<Reply> {
  const per: Record<string, Record<string, number>> = {}; const lines: string[] = [];
  for (const ty of TYPES) {
    const rows = (await c.query(`SELECT status, count(*)::int AS n FROM ${TABLE[ty].t} WHERE deleted_at IS NULL GROUP BY status`)).rows;
    per[JENIS[ty]] = Object.fromEntries(rows.map((r: any) => [r.status, r.n]));
    const tot = rows.reduce((s: number, r: any) => s + r.n, 0);
    lines.push(`${JENIS[ty]}: ${tot}${tot ? ` (${rows.map((r: any) => `${r.n} ${r.status}`).join(', ')})` : ''}`);
  }
  return { intent: 'summary', answer: `Ringkasan katalog arsitektur (yang terlihat oleh Anda):\n${bullets(lines)}`, facts: { perJenis: per }, sources: [{ label: 'Dashboard Arsitektur', route: '/eaw/dashboard/' }, { label: 'Repository', route: '/eaw/repository/' }], notes: [] };
}

/** Pemandu pertanyaan: dipakai bila maksud tak dikenali atau objek yang dimaksud tidak ditemukan/ambigu. */
export const helpReply = (note?: string): Reply => ({ intent: 'help', facts: {}, sources: [], notes: [],
  answer: `${note ? note + '\n\n' : ''}Saya MIND, asisten arsitektur SAORAJA. Saya menjawab dari data EAW yang terlihat oleh Anda — dampak/dependensi sebuah objek, redundansi, drift arsitektur, KPI, IKA, status gate AF-06, dan ringkasan katalog. Coba:\n${bullets(SUGGESTIONS)}` });

/** Jalankan satu pertanyaan (sudah dimasking & lolos guardrail) terhadap data nyata. */
export async function answerQuestion(c: any, text: string): Promise<Reply> {
  const targets = await findTargets(c, text);
  const hasTarget = targets.length > 0;
  const intent = detectIntent(text, hasTarget);
  if (intent === 'help') return helpReply();
  if (intent === 'redundancy' || intent === 'drift' || intent === 'kpi') return toolEco(c, intent);
  if (intent === 'ika') return toolIka(c);
  if (intent === 'summary') return toolSummary(c);
  if (!hasTarget) {
    if (intent === 'status') return toolArbQueue(c);
    return helpReply(`Untuk ${intent === 'impact' ? 'analisis dampak' : 'dependensi'} saya perlu tahu objeknya. Sebut nama aplikasi, proses, layanan, entitas data, infrastruktur, atau kontrol sesuai penamaan di EAW.`);
  }
  const top = targets[0];
  // ambigu hanya bila ada kandidat lain yang sama kuat DAN namanya bukan bagian dari nama pilihan teratas (mis. "Klaster" di dalam "Klaster Zeta Kuantum"),
  // DAN pengenal harfiahnya bukan bagian dari pengenal pilihan teratas (mis. kode "BASE" di dalam "BASE-AEGIS")
  const inside = (x: Target) => !!top.hit && !!x.hit && top.hit.length > x.hit.length && top.hit.toLowerCase().includes(x.hit.toLowerCase());
  const close = targets.filter((x) => x.id !== top.id && x.score >= top.score - 0.05 && !top.label.toLowerCase().includes(x.label.toLowerCase()) && !inside(x));
  if (close.length) return helpReply(`Objek yang Anda maksud kurang jelas. Mana di antara ini?\n${bullets([top, ...close].slice(0, 5).map((x) => `${x.label} (${JENIS[x.type]})`))}`);
  return intent === 'status' ? toolStatus(c, top) : toolImpact(c, top, intent === 'dependencies' ? 'dependencies' : 'impact');
}

/** Angka pada jawaban LLM harus ada di fakta/pertanyaan — mencegah angka karangan. true = semua angka berdasar. */
export function numbersGrounded(answer: string, factsJson: string, question: string): boolean {
  const have = new Set((factsJson + ' ' + question).match(/\d+(?:[.,]\d+)?/g) ?? []);
  return (answer.match(/\d+(?:[.,]\d+)?/g) ?? []).every((n) => have.has(n) || have.has(n.replace(',', '.')) || have.has(n.replace('.', ',')));
}
