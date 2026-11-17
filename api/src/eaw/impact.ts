import { ProblemException } from '../common/problem';

export const TYPES = ['process', 'service', 'application', 'data_entity', 'infra_asset', 'control'];
export const TABLE: Record<string, { t: string; label: string }> = {
  process: { t: 'eaw.process', label: 'x.nama' }, service: { t: 'eaw.service', label: 'x.nama' }, application: { t: 'eaw.application', label: "x.kode || ' · ' || x.nama" },
  data_entity: { t: 'eaw.data_entity', label: 'x.nama_kanonikal' }, infra_asset: { t: 'eaw.infra_asset', label: 'x.nama' }, control: { t: 'eaw.control', label: "x.aspek || COALESCE(' · ' || x.standar_rujukan, '')" },
};
export const MAX_NODES = 1000;

export interface N { type: string; id: string; label: string | null; status: string | null; entityCode: string | null; depth: number; hidden: boolean }

/** Memuat label/status/entitas node yang TERLIHAT pemanggil (RLS); yang tidak muncul ditandai hidden (ada dalam graf, isinya tidak dibuka). */
export async function describe(c: any, nodes: Array<{ type: string; id: string }>): Promise<Map<string, { label: string; status: string; entityCode: string }>> {
  const out = new Map<string, { label: string; status: string; entityCode: string }>();
  for (const type of TYPES) {
    const ids = nodes.filter((n) => n.type === type).map((n) => n.id); if (!ids.length) continue;
    const tb = TABLE[type];
    const rows = (await c.query(`SELECT x.id, ${tb.label} AS label, x.status, g.code AS entity_code FROM ${tb.t} x JOIN ref.business_groups g ON g.id = x.entity_id WHERE x.id = ANY($1::uuid[]) AND x.deleted_at IS NULL`, [ids])).rows;
    rows.forEach((r: any) => out.set(`${type}:${r.id}`, { label: r.label, status: r.status, entityCode: r.entity_code }));
  }
  return out;
}


/** Analisis dampak/dependensi (BFS bertingkat; maks. kedalaman 10, maks. 1000 node; `truncated` bila terpotong). Mengikuti RLS pemanggil. Dipakai /eaw/impact dan MIND Copilot. */
export async function impactOf(c: any, objectType: string, id: string, direction: 'impact' | 'dependencies', maxDepth: number) {
  const root = (await describe(c, [{ type: objectType, id }])).get(`${objectType}:${id}`);
  if (!root) throw new ProblemException(404, 'not-found', 'Objek tidak ditemukan atau di luar cakupan akses');
  const seen = new Map<string, { type: string; id: string; depth: number }>([[`${objectType}:${id}`, { type: objectType, id, depth: 0 }]]);
  const edges: Array<{ from: string; to: string; tipe: string }> = []; let frontier = [{ type: objectType, id }]; let truncated = false;
  for (let depth = 1; depth <= maxDepth && frontier.length && !truncated; depth++) {
    const [fromCol, toCol] = direction === 'impact' ? ['provider', 'dependent'] : ['dependent', 'provider'];
    const rows = (await c.query(`SELECT ${toCol}_type AS t, ${toCol}_id AS i, ${fromCol}_type AS ft, ${fromCol}_id AS fi, tipe FROM eaw.dependency_edge
      WHERE (${fromCol}_type, ${fromCol}_id) IN (SELECT * FROM unnest($1::text[], $2::uuid[]))`, [frontier.map((f) => f.type), frontier.map((f) => f.id)])).rows;
    const next: Array<{ type: string; id: string }> = [];
    for (const r of rows) {
      const key = `${r.t}:${r.i}`; const fk = `${r.ft}:${r.fi}`;
      edges.push(direction === 'impact' ? { from: fk, to: key, tipe: r.tipe } : { from: key, to: fk, tipe: r.tipe });
      if (!seen.has(key)) { if (seen.size >= MAX_NODES) { truncated = true; break; } seen.set(key, { type: r.t, id: r.i, depth }); next.push({ type: r.t, id: r.i }); }
    }
    frontier = next;
  }
  const info = await describe(c, [...seen.values()]);
  const nodes: N[] = [...seen.entries()].map(([k, v]) => { const d = info.get(k); return { type: v.type, id: v.id, label: d ? d.label : null, status: d ? d.status : null, entityCode: d ? d.entityCode : null, depth: v.depth, hidden: !d }; });
  const affected = nodes.filter((n) => n.depth > 0);
  const byType: Record<string, number> = {}; affected.forEach((n) => { byType[n.type] = (byType[n.type] ?? 0) + 1; });
  return { root: { type: objectType, id, label: root.label, status: root.status }, direction, maxDepth, nodes, edges, truncated, summary: { total: affected.length, hidden: affected.filter((n) => n.hidden).length, byType,
    baseline: affected.filter((n) => n.status && ['Ditetapkan', 'Dipublikasi', 'Direviu'].includes(n.status)).length } };

}
