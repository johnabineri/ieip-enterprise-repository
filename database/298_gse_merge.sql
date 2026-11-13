-- =====================================================================
-- 298_gse_merge.sql : GSE-05 — jejak penggabungan 3-arah suntingan yang bertabrakan (editor kode proyek)
--
-- Bila dua penyunting mengubah berkas yang sama, API (gse/merge.ts) menggabungkan DASAR (revisi tempat penyunting mulai) + MILIK SAYA +
-- TERBARU dan menyerahkan hasilnya ke pengguna untuk ditinjau; hasil yang disimpan dicatat sebagai revisi biasa dengan:
--   merged        = true  → isi revisi ini hasil penggabungan (bukan suntingan langsung di atas kepala)
--   merge_base_id = revisi dasar asal suntingan (NULL = berkas asli hasil generate / berkas baru)
-- Penjaga: dasar wajib revisi pada proyek & path yang SAMA dan lebih tua dari parent_id (kepala yang digabungi). Append-only tetap
-- dijaga gse.tg_workspace_guard (292). Idempoten.
-- =====================================================================
ALTER TABLE gse.file_revision ADD COLUMN IF NOT EXISTS merged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE gse.file_revision ADD COLUMN IF NOT EXISTS merge_base_id BIGINT REFERENCES gse.file_revision(id);
ALTER TABLE gse.file_revision DROP CONSTRAINT IF EXISTS ck_file_revision_merge;
ALTER TABLE gse.file_revision ADD CONSTRAINT ck_file_revision_merge
    CHECK ((merge_base_id IS NULL OR merged) AND (NOT merged OR (op = 'put' AND parent_id IS NOT NULL)));
COMMENT ON COLUMN gse.file_revision.merged IS 'GSE-05: isi revisi = hasil penggabungan 3-arah yang ditinjau pengguna (298).';
COMMENT ON COLUMN gse.file_revision.merge_base_id IS 'GSE-05: revisi dasar asal suntingan yang digabungkan; NULL = berkas asli/baru (298).';

CREATE OR REPLACE FUNCTION gse.tg_revision_merge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, gse AS $$
DECLARE b record;
BEGIN
    IF NEW.merge_base_id IS NOT NULL THEN
        SELECT project_id, path INTO b FROM gse.file_revision WHERE id = NEW.merge_base_id;
        IF b.project_id IS DISTINCT FROM NEW.project_id OR b.path IS DISTINCT FROM NEW.path THEN
            RAISE EXCEPTION 'dasar penggabungan % bukan revisi berkas % pada proyek yang sama', NEW.merge_base_id, NEW.path USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.merge_base_id >= NEW.parent_id THEN
            RAISE EXCEPTION 'dasar penggabungan % harus lebih tua dari revisi kepala %', NEW.merge_base_id, NEW.parent_id USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gse.tg_revision_merge() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_file_revision_merge ON gse.file_revision;
-- "trg_file_revision_merge" berjalan SETELAH "trg_file_revision_guard" (urutan alfabet trigger BEFORE): append-only/AF-06 dinilai lebih dulu
CREATE TRIGGER trg_file_revision_merge BEFORE INSERT ON gse.file_revision FOR EACH ROW EXECUTE FUNCTION gse.tg_revision_merge();
