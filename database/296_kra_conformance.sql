-- =====================================================================
-- 296_kra_conformance.sql : tautan KRA harus SE-DOMAIN dan BERLAKU (EAW-05, AF-05; selaras syarat L3 IKA di console/ika.ts)
--
-- Sebelumnya eaw.transition() hanya mensyaratkan referensi_id TERISI saat Divalidasi — kontrol keamanan dapat menautkan KRA aplikasi,
-- dan objek dapat divalidasi terhadap KRA yang masih Draf. Trigger ini menutup celah itu tanpa menyalin ulang eaw.transition():
--   (1) saat TULIS (INSERT / UPDATE referensi_id): KRA yang ditautkan wajib ada dan domainnya = domain objek;
--   (2) saat NAIK ke Divalidasi/Ditetapkan/Dipublikasi: KRA wajib se-domain DAN berlaku (Ditetapkan/Dipublikasi). Karena dicek di
--       setiap langkah naik, KRA yang sedang direvisi (Direviu/Draf) menahan objek tertaut sampai KRA terbit lagi.
-- Turun status (→ Direviu oleh AF-07, → Draf) tidak diperiksa. Baris LAMA yang tidak patuh TIDAK diubah/ditolak sampai tautannya
-- disunting atau statusnya dinaikkan — dilaporkan IKA (gaps.kra) dan view eaw.kra_nonconformance di bawah.
-- SECURITY DEFINER: KRA Draf tidak terlihat peran SBU lewat RLS, tetapi aturan ini harus menilai KRA yang SEBENARNYA ditautkan.
-- Idempoten.
-- =====================================================================
CREATE OR REPLACE FUNCTION eaw.tg_kra_conformance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, eaw, set, ref, shared AS $$
DECLARE v_dom text := TG_ARGV[0]; v_label text := TG_ARGV[1]; r record;
BEGIN
    IF NEW.referensi_id IS NULL THEN RETURN NEW; END IF;          -- KRA kosong ditolak eaw.transition() saat Divalidasi
    SELECT domain, status, kode INTO r FROM eaw.reference WHERE id = NEW.referensi_id AND deleted_at IS NULL;
    IF TG_OP = 'INSERT' OR NEW.referensi_id IS DISTINCT FROM OLD.referensi_id THEN
        IF r.domain IS NULL THEN
            RAISE EXCEPTION 'KRA yang ditautkan ke % tidak ada atau sudah dihapus', v_label USING ERRCODE = 'check_violation';
        ELSIF r.domain <> v_dom THEN
            RAISE EXCEPTION 'KRA % berdomain "%" sedangkan % berdomain "%" — tautkan KRA dari domain yang sama', r.kode, r.domain, v_label, v_dom
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Divalidasi', 'Ditetapkan', 'Dipublikasi') THEN
        IF r.domain IS NULL THEN
            RAISE EXCEPTION 'transisi ke % ditolak: KRA % tidak ada atau sudah dihapus', NEW.status, v_label USING ERRCODE = 'check_violation';
        ELSIF r.domain <> v_dom THEN
            RAISE EXCEPTION 'transisi ke % ditolak: KRA % berdomain "%", bukan "%" — kembalikan ke Draf dan tautkan KRA se-domain', NEW.status, r.kode, r.domain, v_dom
                USING ERRCODE = 'check_violation';
        ELSIF r.status NOT IN ('Ditetapkan', 'Dipublikasi') THEN
            RAISE EXCEPTION 'transisi ke % ditolak: KRA % berstatus %, belum berlaku (wajib Ditetapkan/Dipublikasi)', NEW.status, r.kode, r.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION eaw.tg_kra_conformance() FROM PUBLIC;

DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT * FROM (VALUES ('process', 'proses_bisnis', 'proses bisnis'), ('data_entity', 'data', 'entitas data'), ('service', 'layanan', 'layanan'),
                                   ('application', 'aplikasi', 'aplikasi'), ('infra_asset', 'infrastruktur', 'aset infrastruktur'), ('control', 'keamanan', 'kontrol keamanan')) v(tbl, dom, label) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_b_kra ON eaw.%1$I', t.tbl);
        -- nama "_b_" → berjalan SETELAH penjaga status trg_*_a_status (urutan alfabet trigger BEFORE)
        EXECUTE format('CREATE TRIGGER trg_%1$s_b_kra BEFORE INSERT OR UPDATE OF referensi_id, status ON eaw.%1$I FOR EACH ROW EXECUTE FUNCTION eaw.tg_kra_conformance(%2$L, %3$L)',
                       t.tbl, t.dom, t.label);
    END LOOP;
END $$;

-- objek yang (masih) tidak patuh — data lama sebelum 296 atau KRA yang kemudian direvisi. security_invoker: mengikuti RLS pemanggil.
CREATE OR REPLACE VIEW eaw.kra_nonconformance WITH (security_invoker = true) AS
SELECT o.object_type, o.id, o.entity_id, o.status, o.referensi_id, o.domain, r.kode AS kra_kode, r.domain AS kra_domain, r.status AS kra_status,
       CASE WHEN o.referensi_id IS NULL THEN 'tanpa-kra' WHEN r.id IS NULL THEN 'kra-tidak-ada' WHEN r.domain <> o.domain THEN 'kra-beda-domain'
            WHEN r.status NOT IN ('Ditetapkan', 'Dipublikasi') THEN 'kra-belum-berlaku' END AS alasan
FROM (SELECT 'process'::text AS object_type, id, entity_id, status, referensi_id, 'proses_bisnis'::text AS domain FROM eaw.process WHERE deleted_at IS NULL
      UNION ALL SELECT 'data_entity', id, entity_id, status, referensi_id, 'data' FROM eaw.data_entity WHERE deleted_at IS NULL
      UNION ALL SELECT 'service', id, entity_id, status, referensi_id, 'layanan' FROM eaw.service WHERE deleted_at IS NULL
      UNION ALL SELECT 'application', id, entity_id, status, referensi_id, 'aplikasi' FROM eaw.application WHERE deleted_at IS NULL
      UNION ALL SELECT 'infra_asset', id, entity_id, status, referensi_id, 'infrastruktur' FROM eaw.infra_asset WHERE deleted_at IS NULL
      UNION ALL SELECT 'control', id, entity_id, status, referensi_id, 'keamanan' FROM eaw.control WHERE deleted_at IS NULL) o
LEFT JOIN eaw.reference r ON r.id = o.referensi_id AND r.deleted_at IS NULL
WHERE o.status <> 'Draf'
  AND (o.referensi_id IS NULL OR r.id IS NULL OR r.domain <> o.domain OR r.status NOT IN ('Ditetapkan', 'Dipublikasi'));
COMMENT ON VIEW eaw.kra_nonconformance IS 'Objek non-Draf yang tautan KRA-nya tidak patuh (296). Kosong = seluruh baseline patuh. Mengikuti RLS pemanggil.';
GRANT SELECT ON eaw.kra_nonconformance TO eap_app, eap_ro;
