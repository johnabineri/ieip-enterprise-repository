import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';

import { TYPES, TABLE, MAX_NODES, describe, impactOf, type N } from './impact';

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
    return this.db.tx(p, (c) => impactOf(c, q.objectType, id, direction, maxDepth));
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
