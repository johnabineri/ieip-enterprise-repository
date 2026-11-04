-- =====================================================================
-- 270_lineage.sql : Lineage & Impact (EAW-03) — arah KETERGANTUNGAN turunan dari eaw.relation
--   eaw.relation menyimpan arah kanonik (objek "atas" → "bawah"); untuk analisis dampak yang dibutuhkan adalah siapa BERGANTUNG pada siapa:
--     serving/realization/flow/triggering/used-by : target bergantung pada sumber (yang dilayani/direalisasi/menerima aliran bergantung pada penyedia)
--     access/assignment/composition               : sumber bergantung pada target (pengguna data / yang berjalan di infra / komposit bergantung pada bagian)
--     association                                 : simetris (dua arah)
--   View ber-security_invoker: RLS relasi (mengikuti objek sumber) tetap berlaku bagi pemanggil.
-- =====================================================================
CREATE VIEW eaw.dependency_edge WITH (security_invoker = true) AS
    SELECT id AS relation_id, tipe, sumber_type AS provider_type, sumber_id AS provider_id, target_type AS dependent_type, target_id AS dependent_id
      FROM eaw.relation WHERE deleted_at IS NULL AND tipe IN ('serving','realization','flow','triggering','used-by')
    UNION ALL
    SELECT id, tipe, target_type, target_id, sumber_type, sumber_id
      FROM eaw.relation WHERE deleted_at IS NULL AND tipe IN ('access','assignment','composition')
    UNION ALL
    SELECT id, tipe, sumber_type, sumber_id, target_type, target_id FROM eaw.relation WHERE deleted_at IS NULL AND tipe = 'association'
    UNION ALL
    SELECT id, tipe, target_type, target_id, sumber_type, sumber_id FROM eaw.relation WHERE deleted_at IS NULL AND tipe = 'association';
COMMENT ON VIEW eaw.dependency_edge IS 'provider -> dependent: dependent terdampak bila provider berubah/gagal (EAW-03).';
GRANT SELECT ON eaw.dependency_edge TO eap_app, eap_ro;
