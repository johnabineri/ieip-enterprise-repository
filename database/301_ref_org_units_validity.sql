-- =====================================================================
-- 301_ref_org_units_validity.sql : kontrak replikasi 2026-11-06 — ref.org_units menerima valid_from/valid_to dari pub_cmp_ref (CMP 208_org_restructure.sql)
-- Untuk DB yang SUDAH berjalan (DB baru sudah dari 020_*). Terapkan SEBELUM CMP 208 (pelanggan harus punya kolom sebelum penerbit mengirimnya).
-- Idempoten: tabel replika ref.* dan tabel cermin langganan mdm.* (bila ada).
-- =====================================================================
ALTER TABLE ref.org_units ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE ref.org_units ADD COLUMN IF NOT EXISTS valid_to date;
DO $$
BEGIN
    IF to_regclass('mdm.org_units') IS NOT NULL THEN
        ALTER TABLE mdm.org_units ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE;
        ALTER TABLE mdm.org_units ADD COLUMN IF NOT EXISTS valid_to date;
    END IF;
END $$;
