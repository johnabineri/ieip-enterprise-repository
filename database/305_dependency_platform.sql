-- =====================================================================
-- 305_dependency_platform.sql : graf ketergantungan (EAW-03) — workspace BERGANTUNG pada platform induknya
--
-- Keanggotaan workspace di platform disimpan di kolom eaw.application.platform (kode platform), BUKAN sebagai baris eaw.relation, sehingga
-- analisis dampak (Lineage & Impact, MIND Copilot) tidak melihatnya: "jika platform BASE gagal" dulu tidak berdampak apa pun. Ditambah satu cabang
-- ke eaw.dependency_edge: provider = platform, dependent = workspace (tipe 'hosting'). Dampak lalu BERANTAI lewat BFS yang sudah ada
-- (platform -> workspace -> proses/layanan yang dilayani workspace itu, dst.); arah 'dependensi' dari sebuah workspace kini menyebut platformnya.
-- Tetap security_invoker: baris tampil hanya bila platform DAN workspace terlihat bagi pemanggil (RLS eaw.application). relation_id edge sintetis
-- diisi id workspace (unik per workspace karena satu workspace punya satu platform) agar kolom tidak pernah NULL bagi pemakai view.
-- Kolom/tipe view identik dengan 270 (CREATE OR REPLACE).
-- =====================================================================
CREATE OR REPLACE VIEW eaw.dependency_edge WITH (security_invoker = true) AS
    SELECT id AS relation_id, tipe, sumber_type AS provider_type, sumber_id AS provider_id, target_type AS dependent_type, target_id AS dependent_id
      FROM eaw.relation WHERE deleted_at IS NULL AND tipe IN ('serving','realization','flow','triggering','used-by')
    UNION ALL
    SELECT id, tipe, target_type, target_id, sumber_type, sumber_id
      FROM eaw.relation WHERE deleted_at IS NULL AND tipe IN ('access','assignment','composition')
    UNION ALL
    SELECT id, tipe, sumber_type, sumber_id, target_type, target_id FROM eaw.relation WHERE deleted_at IS NULL AND tipe = 'association'
    UNION ALL
    SELECT id, tipe, target_type, target_id, sumber_type, sumber_id FROM eaw.relation WHERE deleted_at IS NULL AND tipe = 'association'
    UNION ALL
    SELECT w.id, 'hosting'::varchar(50), 'application'::varchar(20), p.id, 'application'::varchar(20), w.id
      FROM eaw.application w JOIN eaw.application p ON p.kode = w.platform AND p.jenis_node = 'platform' AND p.deleted_at IS NULL
     WHERE w.deleted_at IS NULL AND w.jenis_node = 'workspace';
COMMENT ON VIEW eaw.dependency_edge IS 'provider -> dependent: dependent terdampak bila provider berubah/gagal (EAW-03). Termasuk platform -> workspace (tipe hosting, 305).';
