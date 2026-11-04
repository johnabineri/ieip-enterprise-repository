/**
 * Skor IKA TERHITUNG (SAF 6.3, EAW-08) — dihitung dari data eaw yang terlihat pemanggil (RLS), bukan angka masukan.
 * Level domain (per entitas): 1 = tidak ada objek; 2 = ada objek tetapi belum seluruhnya >= Ditetapkan; 3 = ada objek dan seluruhnya >= Ditetapkan.
 * Level entitas: 1 = tanpa objek; 2 = ada objek; 3 = keenam domain level 3;
 *   4 = level 3 + relasi wajib lengkap (eaw.relation_check) untuk semua Aplikasi/Layanan/Entitas Data + semua Aplikasi bertaut Git (repo_git) + >= 1 konektor EIO aktif;
 *   5 = level 4 + semua konektor diperiksa <= 7 hari tanpa breaking change terbuka + objek Dipublikasi diperbarui <= 365 hari (reviu rutin). Gate GSE (AF-06) selalu aktif di DB.
 * Batasan jujur: "lineage aktif" dan "keenam domain untuk seluruh referensi (KRA)" belum dimodelkan sehingga tidak ikut dihitung.
 */
export const DOMAINS = [
  { key: 'proses_bisnis', table: 'eaw.process', label: 'Proses Bisnis' }, { key: 'data', table: 'eaw.data_entity', label: 'Data & Informasi' },
  { key: 'layanan', table: 'eaw.service', label: 'Layanan' }, { key: 'aplikasi', table: 'eaw.application', label: 'Aplikasi' },
  { key: 'infrastruktur', table: 'eaw.infra_asset', label: 'Infrastruktur' }, { key: 'keamanan', table: 'eaw.control', label: 'Keamanan' },
];
export const CRITERIA = [
  'L1: belum ada objek', 'L2: ada objek, belum seluruhnya Ditetapkan', 'L3: keenam domain terisi dan seluruh objek >= Ditetapkan',
  'L4: L3 + relasi wajib lengkap + semua aplikasi bertaut Git + >= 1 konektor EIO', 'L5: L4 + konektor diperiksa <= 7 hari tanpa breaking change + objek Dipublikasi diperbarui <= 365 hari',
];

export interface IkaEntity {
  id: string; code: string; name: string; kafLevel: string | null; manualLevel: number | null; level: number; objects: number;
  domains: Array<{ domain: string; label: string; objects: number; baseline: number; level: number }>;
  checks: { relations: boolean; git: boolean; eio: boolean; drift: boolean; review: boolean };
}

export async function computeIka(c: any): Promise<{ entities: IkaEntity[]; criteria: string[]; groupAverage: number | null; scored: number }> {
  const ents = (await c.query('SELECT id, code, name, kaf_level, ika_level FROM eaw.entity_org WHERE is_active ORDER BY code')).rows;
  const counts = (await c.query(DOMAINS.map((d) => `SELECT entity_id, '${d.key}' AS d, count(*)::int AS n, count(*) FILTER (WHERE status IN ('Ditetapkan','Dipublikasi','Direviu'))::int AS b FROM ${d.table} WHERE deleted_at IS NULL GROUP BY entity_id`).join(' UNION ALL '))).rows;
  const rel = (await c.query(`SELECT entity_id, bool_and(ok) AS ok FROM (
      SELECT a.entity_id, c.ok FROM eaw.application a, LATERAL eaw.relation_check('application', a.id) c WHERE a.deleted_at IS NULL
      UNION ALL SELECT s.entity_id, c.ok FROM eaw.service s, LATERAL eaw.relation_check('service', s.id) c WHERE s.deleted_at IS NULL
      UNION ALL SELECT d.entity_id, c.ok FROM eaw.data_entity d, LATERAL eaw.relation_check('data_entity', d.id) c WHERE d.deleted_at IS NULL) x GROUP BY entity_id`)).rows;
  const git = (await c.query(`SELECT entity_id, bool_and(COALESCE(btrim(repo_git), '') <> '') AS ok FROM eaw.application WHERE deleted_at IS NULL GROUP BY entity_id`)).rows;
  const eio = (await c.query(`SELECT entity_id, count(*)::int AS n,
      bool_and(last_check_at IS NOT NULL AND last_check_at >= now() - interval '7 days' AND jsonb_array_length(breaking_changes) = 0) AS fresh
      FROM console.eio_connector WHERE deleted_at IS NULL AND entity_id IS NOT NULL GROUP BY entity_id`)).rows;
  const stale = (await c.query(DOMAINS.map((d) => `SELECT DISTINCT entity_id FROM ${d.table} WHERE deleted_at IS NULL AND status = 'Dipublikasi' AND updated_at < now() - interval '365 days'`).join(' UNION '))).rows;
  const idx = (rows: any[]) => new Map<string, any>(rows.map((r) => [r.entity_id, r]));
  const relM = idx(rel), gitM = idx(git), eioM = idx(eio); const staleS = new Set(stale.map((r: any) => r.entity_id));
  const out: IkaEntity[] = [];
  for (const e of ents) {
    const domains = DOMAINS.map((d) => {
      const r = counts.find((x: any) => x.entity_id === e.id && x.d === d.key); const n = r ? r.n : 0; const b = r ? r.b : 0;
      return { domain: d.key, label: d.label, objects: n, baseline: b, level: n === 0 ? 1 : b === n ? 3 : 2 };
    });
    const objects = domains.reduce((s, d) => s + d.objects, 0);
    const checks = {
      relations: !relM.has(e.id) || relM.get(e.id).ok === true, git: !gitM.has(e.id) || gitM.get(e.id)!.ok === true,
      eio: (eioM.get(e.id)?.n ?? 0) >= 1, drift: (eioM.get(e.id)?.n ?? 0) >= 1 && eioM.get(e.id).fresh === true, review: !staleS.has(e.id),
    };
    let level = objects === 0 ? 1 : 2;
    if (objects > 0 && domains.every((d) => d.level === 3)) {
      level = 3;
      if (checks.relations && checks.git && checks.eio) { level = 4; if (checks.drift && checks.review) level = 5; }
    }
    if (objects > 0 || e.ika_level) out.push({ id: e.id, code: e.code, name: e.name, kafLevel: e.kaf_level, manualLevel: e.ika_level, level, objects, domains, checks });
  }
  const scored = out.filter((e) => e.objects > 0);
  return { entities: out, criteria: CRITERIA, groupAverage: scored.length ? Math.round((scored.reduce((s, e) => s + e.level, 0) / scored.length) * 10) / 10 : null, scored: scored.length };
}
