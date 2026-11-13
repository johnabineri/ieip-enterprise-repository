-- =====================================================================
-- 294_ika_checks.sql : snapshot IKA menyimpan hasil pemeriksaan per entitas (EAW-08, SAF 6.3)
-- Sejak kepatuhan KRA (syarat L3) dan lineage aktif (syarat L4) ikut dihitung (eap/api/src/console/ika.ts), tren perlu menjelaskan
-- MENGAPA level berubah: checks = {kra, relations, lineage, git, eio, drift, review} (boolean) + jumlah celah {kraGaps, lineageGaps}.
-- Snapshot lama (sebelum 294) = NULL (tidak direkonstruksi). Idempoten.
-- =====================================================================
ALTER TABLE console.ika_snapshot ADD COLUMN IF NOT EXISTS checks JSONB;
ALTER TABLE console.ika_snapshot DROP CONSTRAINT IF EXISTS ck_ika_snapshot_checks;
ALTER TABLE console.ika_snapshot ADD CONSTRAINT ck_ika_snapshot_checks
    CHECK (checks IS NULL OR (jsonb_typeof(checks) = 'object' AND checks ?& ARRAY['kra','relations','lineage','git','eio','drift','review']));
COMMENT ON COLUMN console.ika_snapshot.checks IS 'Hasil pemeriksaan IKA saat snapshot (ika.ts): kra/relations/lineage/git/eio/drift/review + kraGaps/lineageGaps. NULL = snapshot sebelum 294.';
