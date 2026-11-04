import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { DbService } from '../db/db.service';

const TABLES: Array<[string, string]> = [
  ['application', 'eaw.application'], ['process', 'eaw.process'], ['data_entity', 'eaw.data_entity'], ['service', 'eaw.service'],
  ['infra_asset', 'eaw.infra_asset'], ['control', 'eaw.control'], ['framework', 'eaw.framework'], ['reference', 'eaw.reference'],
];
const STATUS = ['Draf', 'Divalidasi', 'Ditetapkan', 'Dipublikasi', 'Direviu'];

/**
 * Ringkasan dashboard arsitektur (EAW-08) dihitung dari data nyata dan MENGIKUTI RLS pemanggil (angka = yang boleh dilihat pengguna).
 * Tidak ada angka karangan: IKA hanya dari eaw.entity_org_metadata (penilaian manual); kelengkapan = objek >= Divalidasi / total objek per entitas.
 */
@Controller('api/v1/eaw')
export class DashboardController {
  constructor(private readonly db: DbService) {}

  @Get('dashboard') @RequirePermission('eaw.catalog.read')
  dashboard(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const objects: Record<string, { total: number; byStatus: Record<string, number> }> = {};
      for (const [type, table] of TABLES) {
        const rows = (await c.query(`SELECT status, count(*)::int AS n FROM ${table} WHERE deleted_at IS NULL GROUP BY status`)).rows;
        const byStatus = Object.fromEntries(STATUS.map((s) => [s, 0]));
        rows.forEach((r: any) => { byStatus[r.status] = r.n; });
        objects[type] = { total: rows.reduce((s: number, r: any) => s + r.n, 0), byStatus };
      }
      const apps = (await c.query(
        `SELECT count(*) FILTER (WHERE jenis_node = 'platform')::int AS platforms, count(*) FILTER (WHERE jenis_node = 'workspace')::int AS workspaces,
                count(*) FILTER (WHERE jenis_node = 'workspace' AND platform IS NULL)::int AS unplaced,
                count(*) FILTER (WHERE workspace_mode = 'FEDERATED_REMOTE')::int AS federated,
                count(*) FILTER (WHERE risiko_ai = 'high')::int AS ai_high
           FROM eaw.application WHERE deleted_at IS NULL`)).rows[0];
      const arbRows = (await c.query(`SELECT status, count(*)::int AS n FROM eaw.arb_clearance WHERE deleted_at IS NULL GROUP BY status`)).rows;
      const arb = Object.fromEntries(['SUBMITTED', 'IN_REVIEW', 'REVISION', 'APPROVED', 'REJECTED'].map((s) => [s, 0]));
      arbRows.forEach((r: any) => { arb[r.status] = r.n; });
      const relations = (await c.query('SELECT count(*)::int AS n FROM eaw.relation WHERE deleted_at IS NULL')).rows[0].n;
      const entities = (await c.query(
        `SELECT o.id, o.code, o.name, o.kaf_level, o.ika_level,
                COALESCE(x.total, 0) AS total, COALESCE(x.validated, 0) AS validated
           FROM eaw.entity_org o
           LEFT JOIN (SELECT entity_id, count(*)::int AS total, count(*) FILTER (WHERE status <> 'Draf')::int AS validated FROM (
                        SELECT entity_id, status FROM eaw.application WHERE deleted_at IS NULL UNION ALL SELECT entity_id, status FROM eaw.process WHERE deleted_at IS NULL
                        UNION ALL SELECT entity_id, status FROM eaw.data_entity WHERE deleted_at IS NULL UNION ALL SELECT entity_id, status FROM eaw.service WHERE deleted_at IS NULL
                        UNION ALL SELECT entity_id, status FROM eaw.infra_asset WHERE deleted_at IS NULL UNION ALL SELECT entity_id, status FROM eaw.control WHERE deleted_at IS NULL) u
                       GROUP BY entity_id) x ON x.entity_id = o.id
          WHERE o.is_active ORDER BY o.code`)).rows
        .map((r: any) => ({ id: r.id, code: r.code, name: r.name, kafLevel: r.kaf_level, ikaLevel: r.ika_level, objects: r.total, validated: r.validated }));
      const ent = (await c.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE kaf_level_confirmed)::int AS confirmed FROM eaw.entity_org`)).rows[0];
      // Prinsip Bootstrap (SAF Bab 8): langkah selesai bila datanya ada
      const published = Object.values(objects).reduce((s, o) => s + o.byStatus.Dipublikasi, 0);
      const domains = ['process', 'data_entity', 'service', 'application', 'infra_asset', 'control'].filter((t) => objects[t].total > 0).length;
      const bootstrap = [
        { step: 1, label: 'Struktur Entitas', table: 'eaw.entity_org', done: ent.confirmed > 0, detail: `${ent.confirmed}/${ent.total} tingkat KAF dikonfirmasi` },
        { step: 2, label: 'KRA 6 Domain', table: 'eaw.reference', done: objects.reference.total > 0, detail: `${objects.reference.total} referensi` },
        { step: 3, label: 'Platform & Workspace', table: 'eaw.application', done: objects.application.total > 0, detail: `${apps.platforms} platform · ${apps.workspaces} workspace` },
        { step: 4, label: 'Kerangka Kerja', table: 'eaw.framework', done: objects.framework.total > 0, detail: `${objects.framework.total} kerangka` },
        { step: 5, label: 'Isi 6 Domain', table: 'eaw.*', done: domains === 6, detail: `${domains}/6 domain terisi` },
        { step: 6, label: 'Relasi Antar-Domain', table: 'eaw.relation', done: relations > 0, detail: `${relations} relasi` },
        { step: 7, label: 'Validasi → Publikasi', table: 'AF-05', done: published > 0, detail: `${published} objek Dipublikasi` },
      ];
      return { objects, apps, arb, relations, entities, bootstrap };
    });
  }
}
