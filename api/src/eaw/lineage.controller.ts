import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

const TYPES = ['process', 'service', 'application', 'data_entity', 'infra_asset', 'control'];
const TABLE: Record<string, { t: string; label: string }> = {
  process: { t: 'eaw.process', label: 'x.nama' }, service: { t: 'eaw.service', label: 'x.nama' }, application: { t: 'eaw.application', label: "x.kode || ' · ' || x.nama" },
  data_entity: { t: 'eaw.data_entity', label: 'x.nama_kanonikal' }, infra_asset: { t: 'eaw.infra_asset', label: 'x.nama' }, control: { t: 'eaw.control', label: "x.aspek || COALESCE(' · ' || x.standar_rujukan, '')" },
};
const MAX_NODES = 1000;

interface N { type: string; id: string; label: string | null; status: string | null; entityCode: string | null; depth: number; hidden: boolean }

/** Memuat label/status/entitas node yang TERLIHAT pemanggil (RLS); yang tidak muncul ditandai hidden (ada dalam graf, isinya tidak dibuka). */
async function describe(c: any, nodes: Array<{ type: string; id: string }>): Promise<Map<string, { label: string; status: string; entityCode: string }>> {
  const out = new Map<string, { label: string; status: string; entityCode: string }>();
  for (const type of TYPES) {
    const ids = nodes.filter((n) => n.type === type).map((n) => n.id); if (!ids.length) continue;
    const tb = TABLE[type];
    const rows = (await c.query(`SELECT x.id, ${tb.label} AS label, x.status, g.code AS entity_code FROM ${tb.t} x JOIN ref.business_groups g ON g.id = x.entity_id WHERE x.id = ANY($1::uuid[]) AND x.deleted_at IS NULL`, [ids])).rows;
    rows.forEach((r: any) => out.set(`${type}:${r.id}`, { label: r.label, status: r.status, entityCode: r.entity_code }));
  }
  return out;
}

/**
 * Lineage & Impact (EAW-03) dari relasi EAW NYATA. Arah ketergantungan diturunkan di DB (eaw.dependency_edge): "terdampak" = objek yang bergantung (transitif)
 * pada objek sumber; "dependensi" = penyedia yang dibutuhkan objek sumber. Graf mengikuti RLS: objek di luar cakupan tetap dihitung tetapi isinya tidak dibuka (hidden).
 */
@Controller('api/v1/eaw')
export class LineageController {
  constructor(private readonly db: DbService) {}

  /** Analisis dampak: BFS bertingkat (maks. kedalaman 10, maks. 1000 node; `truncated` bila terpotong). */
  @Get('impact') @RequirePermission('eaw.model.read')
  impact(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    if (!TYPES.includes(q.objectType)) throw new ProblemException(400, 'bad-request', 'objectType wajib: ' + TYPES.join(', '));
    const id = uuidOr400(q.objectId, 'objectId'); const direction = q.direction === 'dependencies' ? 'dependencies' : 'impact';
    const maxDepth = Math.min(Math.max(Number(q.maxDepth ?? 10) || 10, 1), 10);
    return this.db.tx(p, async (c) => {
      const root = (await describe(c, [{ type: q.objectType, id }])).get(`${q.objectType}:${id}`);
      if (!root) throw new ProblemException(404, 'not-found', 'Objek tidak ditemukan atau di luar cakupan akses');
      const seen = new Map<string, { type: string; id: string; depth: number }>([[`${q.objectType}:${id}`, { type: q.objectType, id, depth: 0 }]]);
      const edges: Array<{ from: string; to: string; tipe: string }> = []; let frontier = [{ type: q.objectType, id }]; let truncated = false;
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
      return { root: { type: q.objectType, id, label: root.label, status: root.status }, direction, maxDepth, nodes, edges, truncated, summary: { total: affected.length, hidden: affected.filter((n) => n.hidden).length, byType,
        baseline: affected.filter((n) => n.status && ['Ditetapkan', 'Dipublikasi', 'Direviu'].includes(n.status)).length } };
    });
  }

  /** Graf lineage keseluruhan (objek terlihat yang punya relasi; opsional per entitas): kolom Proses → Layanan → Aplikasi → Data → Infrastruktur/Kontrol. */
  @Get('lineage') @RequirePermission('eaw.model.read')
  lineage(@CurrentUser() p: Principal, @Query('entityId') entityId?: string) {
    return this.db.tx(p, async (c) => {
      const rels = (await c.query(`SELECT relation_id, tipe, provider_type, provider_id, dependent_type, dependent_id FROM eaw.dependency_edge WHERE tipe <> 'association' OR provider_id < dependent_id`)).rows;
      const ids = new Map<string, { type: string; id: string }>();
      rels.forEach((r: any) => { ids.set(`${r.provider_type}:${r.provider_id}`, { type: r.provider_type, id: r.provider_id }); ids.set(`${r.dependent_type}:${r.dependent_id}`, { type: r.dependent_type, id: r.dependent_id }); });
      const info = await describe(c, [...ids.values()]);
      const keep = new Set([...ids.keys()].filter((k) => { const d = info.get(k); return d && (!entityId || true); }));
      let nodes = [...ids.entries()].filter(([k]) => keep.has(k)).map(([k, v]) => ({ key: k, type: v.type, id: v.id, ...info.get(k)! }));
      if (entityId) {
        const codes = (await c.query('WITH RECURSIVE t AS (SELECT id, code FROM ref.business_groups WHERE id = $1 UNION ALL SELECT g.id, g.code FROM ref.business_groups g JOIN t ON g.parent_id = t.id) SELECT code FROM t', [uuidOr400(entityId, 'entityId')])).rows.map((r: any) => r.code);
        nodes = nodes.filter((n) => codes.includes(n.entityCode));
      }
      const truncated = nodes.length > MAX_NODES; nodes = nodes.slice(0, MAX_NODES); const ok = new Set(nodes.map((n) => n.key));
      const edges = rels.map((r: any) => ({ from: `${r.provider_type}:${r.provider_id}`, to: `${r.dependent_type}:${r.dependent_id}`, tipe: r.tipe })).filter((e: any) => ok.has(e.from) && ok.has(e.to));
      return { nodes, edges, truncated, hiddenEndpoints: rels.length - edges.length };
    });
  }
}
