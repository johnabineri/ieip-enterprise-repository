-- =====================================================================
-- 302_ref_parties_merged_into.sql : kontrak replikasi 2026-11-12 — ref.parties menerima merged_into_party_id dari pub_cmp_ref (CMP 214_party_merge_contract.sql)
-- Untuk DB yang SUDAH berjalan (DB baru sudah dari 020_ref_cmp.sql). Terapkan SEBELUM CMP 214 (pelanggan harus punya kolom sebelum penerbit mengirimnya).
-- Idempoten: tabel replika ref.parties (bila ada) dan tabel cermin/penampung langganan mdm.parties (bila ada).
-- =====================================================================
DO $$
BEGIN
    IF to_regclass('ref.parties') IS NOT NULL THEN
        ALTER TABLE ref.parties ADD COLUMN IF NOT EXISTS merged_into_party_id uuid;
    END IF;
    IF to_regclass('mdm.parties') IS NOT NULL THEN
        ALTER TABLE mdm.parties ADD COLUMN IF NOT EXISTS merged_into_party_id uuid;
    END IF;
END $$;
