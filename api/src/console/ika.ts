/**
 * Skor IKA TERHITUNG (SAF 6.3, EAW-08) — dihitung dari data eaw yang terlihat pemanggil (RLS), bukan angka masukan.
 * Level domain (per entitas): 1 = tidak ada objek; 2 = ada objek tetapi belum seluruhnya >= Ditetapkan; 3 = ada objek dan seluruhnya >= Ditetapkan.
 * Level entitas: 1 = tanpa objek; 2 = ada objek;
 *   3 = keenam domain level 3 + KEPATUHAN KRA: setiap objek menautkan KRA yang BERLAKU (Ditetapkan/Dipublikasi) dari domain yang SAMA
 *       dan tidak sedang Direviu (menunggu reviu terhadap versi KRA baru, AF-07);
 *   4 = level 3 + relasi wajib lengkap (eaw.relation_check) untuk semua Aplikasi/Layanan/Entitas Data + semua Aplikasi bertaut Git (repo_git)
 *       + >= 1 konektor EIO aktif + LINEAGE AKTIF: setiap Entitas Data diakses >= 1 Aplikasi ber-lifecycle `active` DAN >= 1 Proses Bisnis;
 *   5 = level 4 + semua konektor diperiksa <= 7 hari tanpa breaking change terbuka + objek Dipublikasi diperbarui <= 365 hari (reviu rutin). Gate GSE (AF-06) selalu aktif di DB.
 * Tafsiran (SAF tidak menjabarkan rumus mesin): "keenam domain untuk seluruh referensi" = kepatuhan objek terhadap KRA berlaku se-domain;
 * "lineage aktif" = jejak Proses → Entitas Data ← Aplikasi aktif di graf eaw.relation (bukan lineage tingkat kolom/pipeline — tidak dimodelkan di EAP).
 * Semua angka mengikuti RLS pemanggil: relasi dari aplikasi di luar cakupan tidak terlihat, sehingga snapshot diambil peran lihat-semua.
 */
export const DOMAINS = [
  { key: 'proses_bisnis', type: 'process', table: 'eaw.process', label: 'Proses Bisnis' }, { key: 'data', type: 'data_entity', table: 'eaw.data_entity', label: 'Data & Informasi' },
  { key: 'layanan', type: 'service', table: 'eaw.service', label: 'Layanan' }, { key: 'aplikasi', type: 'application', table: 'eaw.application', label: 'Aplikasi' },
  { key: 'infrastruktur', type: 'infra_asset', table: 'eaw.infra_asset', label: 'Infrastruktur' }, { key: 'keamanan', type: 'control', table: 'eaw.control', label: 'Keamanan' },
];
export const CRITERIA = [
  'L1: belum ada objek', 'L2: ada objek, belum seluruhnya Ditetapkan',
  'L3: keenam domain terisi, seluruh objek >= Ditetapkan dan patuh KRA berlaku se-domain (tanpa objek Direviu)',
  'L4: L3 + relasi wajib lengkap + lineage aktif (tiap entitas data diakses aplikasi aktif & proses) + semua aplikasi bertaut Git + >= 1 konektor EIO',
  'L5: L4 + konektor diperiksa <= 7 hari tanpa breaking change + objek Dipublikasi diperbarui <= 365 hari',
];
const BASELINE = ['Ditetapkan', 'Dipublikasi', 'Direviu'];
const IN_FORCE = ['Ditetapkan', 'Dipublikasi'];
export const KRA_REASONS: Record<string, string> = {
  'tanpa-kra': 'belum menautkan KRA', 'kra-tidak-ada': 'KRA terhapus/tidak terlihat', 'kra-beda-domain': 'KRA dari domain lain',
  'kra-belum-berlaku': 'KRA belum berlaku (bukan Ditetapkan/Dipublikasi)', 'menunggu-reviu': 'objek Direviu (menunggu reviu versi KRA baru, AF-07)',
};
export const LINEAGE_REASONS: Record<string, string> = {
  'tanpa-aplikasi': 'tidak diakses aplikasi mana pun', 'aplikasi-tidak-aktif': 'hanya diakses aplikasi non-aktif (planned/deprecated/retired)', 'tanpa-proses': 'tidak dipakai proses bisnis mana pun',
};
const SAMPLE = 5;

export interface Gap { type: string; id: string; label: string | null; reason: string }
export interface IkaEntity {
  id: string; code: string; name: string; kafLevel: string | null; manualLevel: number | null; level: number; objects: number;
  domains: Array<{ domain: string; label: string; objects: number; baseline: number; level: number }>;
  checks: { kra: boolean; relations: boolean; lineage: boolean; git: boolean; eio: boolean; drift: boolean; review: boolean };
  gaps: { kra: { count: number; sample: Gap[] }; lineage: { count: number; dataEntities: number; sample: Gap[] } };
}
export interface KraCoverage {
  id: string; kode: string; nama: string; domain: string; versi: string; status: string; inForce: boolean;
  entities: number; objects: number; conformant: number; otherDomain: number; pendingReview: number;
}

/** Keputusan level dari hasil per domain + pemeriksaan (fungsi murni; urutan syarat = CRITERIA). */
export function scoreLevel(objects: number, domains: Array<{ level: number }>, k: IkaEntity['checks']): number {
  if (objects === 0) return 1;
  if (!domains.every((d) => d.level === 3) || !k.kra) return 2;
  if (!(k.relations && k.lineage && k.git && k.eio)) return 3;
  return k.drift && k.review ? 5 : 4;
}

/** Alasan objek TIDAK patuh KRA (null = patuh). */
export function kraReason(o: { domain: string; status: string; referensi_id: string | null; r_domain: string | null; r_status: string | null }): string | null {
  if (!o.referensi_id) return 'tanpa-kra';
  if (!o.r_domain) return 'kra-tidak-ada';
  if (o.r_domain !== o.domain) return 'kra-beda-domain';
  if (!IN_FORCE.includes(o.r_status as string)) return 'kra-belum-berlaku';
  if (o.status === 'Direviu') return 'menunggu-reviu';
  return null;
}

export async function computeIka(c: any): Promise<{ entities: IkaEntity[]; criteria: string[]; groupAverage: number | null; scored: number; kra: KraCoverage[]; reasons: Record<string, string> }> {
  const ents = (await c.query('SELECT id, code, name, kaf_level, ika_level FROM eaw.entity_org WHERE is_active ORDER BY code')).rows;
  // satu baris per objek + KRA tautannya (LEFT JOIN: KRA terhapus/tidak terlihat → kolom r_* NULL)
  const objs = (await c.query(DOMAINS.map((d) => `SELECT '${d.key}' AS domain, '${d.type}' AS type, o.id, o.entity_id, o.status, o.referensi_id,
      eaw.object_label('${d.type}', o.id) AS label, r.domain AS r_domain, r.status AS r_status
      FROM ${d.table} o LEFT JOIN eaw.reference r ON r.id = o.referensi_id AND r.deleted_at IS NULL WHERE o.deleted_at IS NULL`).join(' UNION ALL '))).rows;
  const rel = (await c.query(`SELECT entity_id, bool_and(ok) AS ok FROM (
      SELECT a.entity_id, c.ok FROM eaw.application a, LATERAL eaw.relation_check('application', a.id) c WHERE a.deleted_at IS NULL
      UNION ALL SELECT s.entity_id, c.ok FROM eaw.service s, LATERAL eaw.relation_check('service', s.id) c WHERE s.deleted_at IS NULL
      UNION ALL SELECT d.entity_id, c.ok FROM eaw.data_entity d, LATERAL eaw.relation_check('data_entity', d.id) c WHERE d.deleted_at IS NULL) x GROUP BY entity_id`)).rows;
  // lineage: Proses → Entitas Data ← Aplikasi (arah kanonik relasi: sumber = aplikasi/proses, target = entitas data)
  const lin = (await c.query(`SELECT d.id, d.entity_id, d.nama_kanonikal AS label,
      EXISTS (SELECT 1 FROM eaw.relation r JOIN eaw.application a ON a.id = r.sumber_id AND a.deleted_at IS NULL
              WHERE r.deleted_at IS NULL AND r.sumber_type = 'application' AND r.target_type = 'data_entity' AND r.target_id = d.id) AS has_app,
      EXISTS (SELECT 1 FROM eaw.relation r JOIN eaw.application a ON a.id = r.sumber_id AND a.deleted_at IS NULL AND a.lifecycle = 'active'
              WHERE r.deleted_at IS NULL AND r.sumber_type = 'application' AND r.target_type = 'data_entity' AND r.target_id = d.id) AS has_active_app,
      EXISTS (SELECT 1 FROM eaw.relation r JOIN eaw.process p ON p.id = r.sumber_id AND p.deleted_at IS NULL
              WHERE r.deleted_at IS NULL AND r.sumber_type = 'process' AND r.target_type = 'data_entity' AND r.target_id = d.id) AS has_proc
      FROM eaw.data_entity d WHERE d.deleted_at IS NULL ORDER BY d.nama_kanonikal`)).rows;
  const git = (await c.query(`SELECT entity_id, bool_and(COALESCE(btrim(repo_git), '') <> '') AS ok FROM eaw.application WHERE deleted_at IS NULL GROUP BY entity_id`)).rows;
  const eio = (await c.query(`SELECT entity_id, count(*)::int AS n,
      bool_and(last_check_at IS NOT NULL AND last_check_at >= now() - interval '7 days' AND jsonb_array_length(breaking_changes) = 0) AS fresh
      FROM console.eio_connector WHERE deleted_at IS NULL AND entity_id IS NOT NULL GROUP BY entity_id`)).rows;
  const stale = (await c.query(DOMAINS.map((d) => `SELECT DISTINCT entity_id FROM ${d.table} WHERE deleted_at IS NULL AND status = 'Dipublikasi' AND updated_at < now() - interval '365 days'`).join(' UNION '))).rows;
  const refs = (await c.query(`SELECT id, kode, nama, domain, versi, status FROM eaw.reference WHERE deleted_at IS NULL ORDER BY domain, kode`)).rows;

  const idx = (rows: any[]) => new Map<string, any>(rows.map((r) => [r.entity_id, r]));
  const relM = idx(rel), gitM = idx(git), eioM = idx(eio); const staleS = new Set(stale.map((r: any) => r.entity_id));
  const byEnt = <T extends { entity_id: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) (m.get(r.entity_id) ?? m.set(r.entity_id, []).get(r.entity_id)!).push(r); return m; };
  const objM = byEnt(objs), linM = byEnt(lin);

  const out: IkaEntity[] = [];
  for (const e of ents) {
    const mine = objM.get(e.id) ?? [];
    const domains = DOMAINS.map((d) => {
      const os = mine.filter((o: any) => o.domain === d.key); const n = os.length; const b = os.filter((o: any) => BASELINE.includes(o.status)).length;
      return { domain: d.key, label: d.label, objects: n, baseline: b, level: n === 0 ? 1 : b === n ? 3 : 2 };
    });
    const objects = mine.length;
    const kraGaps: Gap[] = mine.map((o: any) => ({ o, why: kraReason(o) })).filter((x) => x.why).map(({ o, why }) => ({ type: o.type, id: o.id, label: o.label, reason: why as string }));
    const des = linM.get(e.id) ?? [];
    const linGaps: Gap[] = des.flatMap((d: any) => {
      const why = !d.has_app ? 'tanpa-aplikasi' : !d.has_active_app ? 'aplikasi-tidak-aktif' : !d.has_proc ? 'tanpa-proses' : null;
      return why ? [{ type: 'data_entity', id: d.id, label: d.label, reason: why }] : [];
    });
    const checks = {
      kra: objects > 0 && kraGaps.length === 0,
      relations: !relM.has(e.id) || relM.get(e.id).ok === true,
      lineage: des.length > 0 && linGaps.length === 0,
      git: !gitM.has(e.id) || gitM.get(e.id)!.ok === true,
      eio: (eioM.get(e.id)?.n ?? 0) >= 1, drift: (eioM.get(e.id)?.n ?? 0) >= 1 && eioM.get(e.id).fresh === true, review: !staleS.has(e.id),
    };
    const level = scoreLevel(objects, domains, checks);
    if (objects > 0 || e.ika_level) out.push({ id: e.id, code: e.code, name: e.name, kafLevel: e.kaf_level, manualLevel: e.ika_level, level, objects, domains, checks,
      gaps: { kra: { count: kraGaps.length, sample: kraGaps.slice(0, SAMPLE) }, lineage: { count: linGaps.length, dataEntities: des.length, sample: linGaps.slice(0, SAMPLE) } } });
  }

  // cakupan per-KRA (objek yang terlihat pemanggil)
  const kra: KraCoverage[] = refs.map((r: any) => {
    const os = objs.filter((o: any) => o.referensi_id === r.id);
    const ok = os.filter((o: any) => BASELINE.includes(o.status) && kraReason(o) === null);
    return { id: r.id, kode: r.kode, nama: r.nama, domain: r.domain, versi: r.versi, status: r.status, inForce: IN_FORCE.includes(r.status),
      entities: new Set(ok.map((o: any) => o.entity_id)).size, objects: os.length, conformant: ok.length,
      otherDomain: os.filter((o: any) => o.domain !== r.domain).length, pendingReview: os.filter((o: any) => o.status === 'Direviu').length };
  });

  const scored = out.filter((e) => e.objects > 0);
  return { entities: out, criteria: CRITERIA, groupAverage: scored.length ? Math.round((scored.reduce((s, e) => s + e.level, 0) / scored.length) * 10) / 10 : null, scored: scored.length, kra, reasons: { ...KRA_REASONS, ...LINEAGE_REASONS } };
}
