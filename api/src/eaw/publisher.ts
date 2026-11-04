import { computeIka } from '../console/ika';
import { ProblemException } from '../common/problem';
import { Content, toSvg, validate } from './archimate';

export const BASELINE = ['Ditetapkan', 'Dipublikasi', 'Direviu'];
export interface Scope { type: 'framework' | 'entity'; id: string }
export interface Built { title: string; entityId: string; frameworkId: string | null; markdown: string; html: string; counts: Record<string, number>; warnings: string[]; readiness: Array<{ rule: string; ok: boolean; pesan: string }> | null }

const e = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
const cell = (s: unknown) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
type Block = { k: 'h'; l: number; t: string } | { k: 'p'; t: string } | { k: 'table'; head: string[]; rows: unknown[][] } | { k: 'svg'; title: string; svg: string } | { k: 'ul'; items: string[] };

const DOMAIN_TABLES = [
  { key: 'process', label: 'Domain 1 — Proses Bisnis', table: 'eaw.process', cols: ['Proses', 'Level', 'Pemilik (jabatan)', 'Status', 'KRA'], pick: (r: any) => [r.nama, `L${r.level}`, r.pemilik_jabatan, r.status, r.kra] },
  { key: 'data_entity', label: 'Domain 2 — Data & Informasi', table: 'eaw.data_entity', cols: ['Entitas Data', 'Klasifikasi', 'PII', 'Steward', 'Sumber Otoritatif', 'Status', 'KRA'], pick: (r: any) => [r.nama_kanonikal, r.klasifikasi, r.pii ? 'Ya' : 'Tidak', r.steward, r.sumber_otoritatif, r.status, r.kra] },
  { key: 'service', label: 'Domain 3 — Layanan Enterprise', table: 'eaw.service', cols: ['Layanan', 'Tipe', 'Kategori', 'SLO', 'Status', 'KRA'], pick: (r: any) => [r.nama, r.tipe, r.kategori, r.slo, r.status, r.kra] },
  { key: 'application', label: 'Domain 4 — Aplikasi & Integrasi', table: 'eaw.application', cols: ['Kode', 'Nama', 'Jenis node', 'Platform', 'Mode', 'Pemilik bisnis', 'Risiko AI', 'Status', 'KRA'], pick: (r: any) => [r.kode, r.nama, r.jenis_node, r.platform, r.workspace_mode, r.owner_bisnis, r.risiko_ai, r.status, r.kra] },
  { key: 'infra_asset', label: 'Domain 5 — Infrastruktur & Teknologi', table: 'eaw.infra_asset', cols: ['Aset', 'Tipe', 'Lokasi', 'Kapasitas', 'DR Tier', 'Status', 'KRA'], pick: (r: any) => [r.nama, r.tipe, r.lokasi, r.kapasitas, r.dr_tier, r.status, r.kra] },
  { key: 'control', label: 'Domain 6 — Keamanan Informasi', table: 'eaw.control', cols: ['Aspek', 'Standar rujukan', 'Penerapan', 'Status', 'KRA'], pick: (r: any) => [r.aspek, r.standar_rujukan, r.status_penerapan, r.status, r.kra] },
];

function render(blocks: Block[]): { md: string; html: string } {
  const md: string[] = []; const html: string[] = [];
  for (const b of blocks) {
    if (b.k === 'h') { md.push(`${'#'.repeat(b.l)} ${b.t}\n`); html.push(`<h${b.l}>${e(b.t)}</h${b.l}>`); }
    else if (b.k === 'p') { md.push(`${b.t}\n`); html.push(`<p>${e(b.t)}</p>`); }
    else if (b.k === 'ul') { md.push(b.items.map((i) => `- ${i}`).join('\n') + '\n'); html.push(`<ul>${b.items.map((i) => `<li>${e(i)}</li>`).join('')}</ul>`); }
    else if (b.k === 'table') {
      md.push(`| ${b.head.join(' | ')} |\n|${b.head.map(() => '---').join('|')}|\n${b.rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')}\n`);
      html.push(`<table><thead><tr>${b.head.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((v) => `<td>${e(v ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (b.k === 'svg') { md.push(`_Diagram: ${b.title} — tersedia pada versi HTML dan ekspor SVG._\n`); html.push(`<figure>${b.svg}<figcaption>${e(b.title)}</figcaption></figure>`); }
  }
  return { md: md.join('\n'), html: html.join('\n') };
}

/**
 * Menyusun Dokumen Arsitektur (AF-08) SECARA OTOMATIS dari data EAW — bukan ditulis manual. Hanya objek berstatus baseline (>= Ditetapkan) yang masuk dokumen resmi;
 * includeDraft hanya untuk pratinjau. Data mengikuti RLS pemanggil (objek di luar cakupan tidak ikut).
 */
export async function buildDocument(c: any, scope: Scope, opts: { includeDraft: boolean }): Promise<Built> {
  let entityId: string; let frameworkId: string | null = null; let scopeName: string; let entityIds: string[]; let objIds: Map<string, string[]> | null = null;
  let readiness: Built['readiness'] = null;
  if (scope.type === 'framework') {
    const fw = (await c.query('SELECT f.id, f.entity_id, f.layanan_utama, f.status FROM eaw.framework f WHERE f.id = $1 AND f.deleted_at IS NULL', [scope.id])).rows[0];
    if (!fw) throw new ProblemException(404, 'not-found', 'Kerangka Kerja tidak ditemukan atau di luar cakupan akses');
    entityId = fw.entity_id; frameworkId = fw.id; scopeName = `Kerangka Kerja ${fw.layanan_utama}`; entityIds = [fw.entity_id];
    readiness = (await c.query("SELECT rule, ok, pesan FROM eaw.relation_check('framework', $1)", [fw.id])).rows;
    const rels = (await c.query('SELECT sumber_type, sumber_id, target_type, target_id FROM eaw.relation WHERE kerangka_id = $1 AND deleted_at IS NULL', [fw.id])).rows;
    objIds = new Map();
    for (const r of rels) for (const [t, i] of [[r.sumber_type, r.sumber_id], [r.target_type, r.target_id]]) { const a = objIds.get(t) ?? []; if (!a.includes(i)) a.push(i); objIds.set(t, a); }
  } else {
    const en = (await c.query('SELECT id, code, name FROM eaw.entity_org WHERE id = $1', [scope.id])).rows[0];
    if (!en) throw new ProblemException(404, 'not-found', 'Entitas tidak ditemukan');
    entityId = en.id; scopeName = `${en.name} (${en.code})`;
    entityIds = (await c.query('WITH RECURSIVE t AS (SELECT id FROM ref.business_groups WHERE id = $1 UNION ALL SELECT g.id FROM ref.business_groups g JOIN t ON g.parent_id = t.id) SELECT id FROM t', [scope.id])).rows.map((r: any) => r.id);
  }
  const statusSql = opts.includeDraft ? 'TRUE' : 'x.status = ANY($2::text[])';
  const counts: Record<string, number> = {}; const excluded: Record<string, number> = {}; const warnings: string[] = []; const blocks: Block[] = []; const allIds = new Set<string>(); const labels = new Map<string, string>(); const refIds = new Set<string>();
  const sections: Block[] = [];
  for (const d of DOMAIN_TABLES) {
    const filter = objIds ? 'x.id = ANY($1::uuid[])' : 'x.entity_id = ANY($1::uuid[])';
    const param = objIds ? (objIds.get(d.key) ?? []) : entityIds;
    const rows = (await c.query(`SELECT x.*, r.kode AS kra FROM ${d.table} x LEFT JOIN eaw.reference r ON r.id = x.referensi_id WHERE x.deleted_at IS NULL AND ${filter} AND ${statusSql} ORDER BY x.created_at, x.id`,
      opts.includeDraft ? [param] : [param, BASELINE])).rows;
    counts[d.key] = rows.length;
    if (!opts.includeDraft) {
      const ex = (await c.query(`SELECT count(*)::int AS n FROM ${d.table} x WHERE x.deleted_at IS NULL AND ${filter} AND NOT (x.status = ANY($2::text[]))`, [param, BASELINE])).rows[0].n;
      excluded[d.key] = ex; if (ex) warnings.push(`${ex} objek ${d.label.split('— ')[1]} belum baseline (Draf/Divalidasi) dan tidak dimuat.`);
    }
    if (!rows.length) warnings.push(`Domain ${d.label.split('— ')[1]} belum memiliki objek baseline.`);
    rows.forEach((r: any) => { allIds.add(r.id); labels.set(r.id, String(r.nama ?? r.nama_kanonikal ?? r.kode ?? r.aspek)); if (r.referensi_id) refIds.add(r.referensi_id); if (!r.referensi_id) warnings.push(`${d.label.split('— ')[1]}: "${r.nama ?? r.nama_kanonikal ?? r.kode ?? r.aspek}" belum tertaut KRA.`); });
    sections.push({ k: 'h', l: 2, t: d.label }, rows.length ? { k: 'table', head: d.cols, rows: rows.map(d.pick) } : { k: 'p', t: 'Belum ada objek baseline pada domain ini.' });
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // relasi antar objek yang dimuat
  const ids = [...allIds];
  const rel = ids.length ? (await c.query(`SELECT sumber_id, target_id, tipe, sumber_type, target_type FROM eaw.relation WHERE deleted_at IS NULL AND sumber_id = ANY($1::uuid[]) AND target_id = ANY($1::uuid[]) ORDER BY sumber_type, sumber_id`, [ids])).rows : [];
  const kra = refIds.size ? (await c.query('SELECT kode, nama, versi, domain, status FROM eaw.reference WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY kode', [[...refIds]])).rows : [];
  const adr = ids.length ? (await c.query(`SELECT DISTINCT a.adr_code, a.title, a.status FROM eaw.adr a JOIN eaw.adr_link l ON l.adr_id = a.id WHERE a.status = 'Accepted' AND l.objek_id = ANY($1::uuid[]) ORDER BY 1`, [ids])).rows : [];
  const dg = (await c.query(frameworkId ? 'SELECT nama, content FROM eaw.diagram WHERE framework_id = $1 AND deleted_at IS NULL ORDER BY nama' : 'SELECT nama, content FROM eaw.diagram WHERE entity_id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY nama', [frameworkId ?? entityIds])).rows;
  let ika: any = null; if (scope.type === 'entity') ika = (await computeIka(c)).entities.find((x) => x.id === scope.id) ?? null;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  blocks.push({ k: 'h', l: 1, t: `Dokumen Arsitektur — ${scopeName}` },
    { k: 'p', t: `Dihasilkan otomatis dari data EAW pada ${now} (AF-08). ${opts.includeDraft ? 'PRATINJAU: memuat objek non-baseline.' : 'Memuat hanya objek berstatus Ditetapkan/Dipublikasi/Direviu.'}` },
    { k: 'h', l: 2, t: 'Ringkasan Eksekutif' },
    { k: 'table', head: ['Domain', 'Objek dimuat'], rows: DOMAIN_TABLES.map((d) => [d.label, counts[d.key]]) },
    ...(ika ? [{ k: 'p', t: `Indeks Kematangan Arsitektur (terhitung): Level ${ika.level} dari 5 — ${ika.objects} objek terdata pada entitas ini.` } as Block] : []),
    ...sections,
    { k: 'h', l: 2, t: 'Matriks Relasi Antar-Objek' },
    rel.length ? { k: 'table', head: ['Sumber', 'Relasi', 'Target'], rows: rel.map((r: any) => [`${r.sumber_type}: ${labels.get(r.sumber_id)}`, r.tipe, `${r.target_type}: ${labels.get(r.target_id)}`]) } : { k: 'p', t: 'Belum ada relasi antar objek yang dimuat.' },
    { k: 'h', l: 2, t: 'Referensi Arsitektur Korporat (KRA) yang Dipakai' },
    kra.length ? { k: 'table', head: ['Kode', 'Nama', 'Domain', 'Versi', 'Status'], rows: kra.map((k: any) => [k.kode, k.nama, k.domain, k.versi, k.status]) } : { k: 'p', t: 'Tidak ada.' },
    { k: 'h', l: 2, t: 'Keputusan Arsitektur Terkait (ADR Accepted)' },
    adr.length ? { k: 'table', head: ['Kode', 'Judul'], rows: adr.map((a: any) => [a.adr_code, a.title]) } : { k: 'p', t: 'Tidak ada ADR tertaut.' },
    { k: 'h', l: 2, t: 'Diagram ArchiMate' });
  if (!dg.length) blocks.push({ k: 'p', t: 'Belum ada diagram.' });
  for (const d of dg) { const content = d.content as Content; const v = validate(content); if (v.warnings.length) warnings.push(`Diagram "${d.nama}": ${v.warnings.length} peringatan metamodel.`); blocks.push({ k: 'svg', title: d.nama, svg: toSvg(content, d.nama) }); }
  blocks.push({ k: 'h', l: 2, t: 'Kelengkapan & Catatan' }, warnings.length ? { k: 'ul', items: warnings } : { k: 'p', t: 'Tidak ada catatan kelengkapan.' });
  const { md, html } = render(blocks);
  const fullHtml = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${e(`Dokumen Arsitektur — ${scopeName}`)}</title>
<style>body{font:14px/1.55 system-ui,Segoe UI,Arial,sans-serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#1b1f24}h1{font-size:24px}h2{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f2f5f3}figure{margin:12px 0;overflow:auto}figcaption{font-size:12px;color:#555}@media print{h2{break-after:avoid}table{break-inside:auto}}</style></head><body>
${html}</body></html>`;
  return { title: `Dokumen Arsitektur — ${scopeName}`, entityId, frameworkId, markdown: md, html: fullHtml, counts: { ...counts, total, relations: rel.length, kra: kra.length, adr: adr.length, diagrams: dg.length }, warnings, readiness };
}
