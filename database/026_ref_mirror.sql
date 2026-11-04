-- =====================================================================
-- 026_ref_mirror.sql : jembatan replikasi logis NATIVE PostgreSQL -> skema ref
--
-- MASALAH: replikasi logis PostgreSQL memetakan tabel dengan nama BERKUALIFIKASI SKEMA yang sama (mdm.parties -> mdm.parties),
-- sedangkan konsumen membaca replika di skema `ref` (SRS 5.1). Pemetaan nama skema tidak didukung langsung.
-- SOLUSI (bentuk "sandbox/native" yang diantisipasi migrations/0001 [3]): tabel cermin bernama sama di skema sumber
-- (iam.users, mdm.*) yang menerima langganan pub_cmp_ref; trigger ENABLE ALWAYS menyalin tiap perubahan ke tabel `ref.*`
-- sungguhan. `ref.*` tetap TABEL (FK dari eaw.* ke ref.business_groups sah; gate cross_check_consumers.sh membaca `ref`).
-- Konsumen TIDAK membaca skema cermin. Bila produksi memakai Debezium/transformer ke `ref` langsung, berkas ini tidak diperlukan.
--
-- CATATAN IZIN: fungsi memakai SET session_replication_role = replica agar trigger tg_reject_write pada ref.* tidak menolak
-- penulisan dari jembatan; itu mensyaratkan pemilik fungsi superuser (dev/docker). Produksi tanpa superuser: pakai transformer.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS mdm;
CREATE SCHEMA IF NOT EXISTS iam;
COMMENT ON SCHEMA mdm IS 'CERMIN penerima langganan pub_cmp_ref (nama harus sama dengan sumber). JANGAN dibaca aplikasi — baca ref.*.';
COMMENT ON SCHEMA iam IS 'CERMIN penerima langganan pub_cmp_ref (iam.users). JANGAN dibaca aplikasi — baca ref.users.';

CREATE FUNCTION ref.tg_mirror_to_ref() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, ref SET session_replication_role = replica AS $$
DECLARE v_cols text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        EXECUTE format('DELETE FROM ref.%I WHERE id = $1', TG_TABLE_NAME) USING OLD.id;
        RETURN OLD;
    END IF;
    SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_cols
      FROM pg_attribute a
     WHERE a.attrelid = format('ref.%I', TG_TABLE_NAME)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'id';
    EXECUTE format('INSERT INTO ref.%1$I SELECT * FROM jsonb_populate_record(NULL::ref.%1$I, $1) ON CONFLICT (id) DO UPDATE SET %2$s', TG_TABLE_NAME, v_cols)
      USING to_jsonb(NEW);
    RETURN NEW;
END $$;

DO $$
DECLARE r record; v_schema text;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'ref' AND c.relkind = 'r' ORDER BY 1 LOOP
    v_schema := CASE WHEN r.relname = 'users' THEN 'iam' ELSE 'mdm' END;     -- pub_cmp_ref: iam.users + mdm.*
    EXECUTE format('CREATE TABLE %I.%I (LIKE ref.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)', v_schema, r.relname, r.relname);
    EXECUTE format('CREATE TRIGGER trg_mirror_to_ref AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION ref.tg_mirror_to_ref()', v_schema, r.relname);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER trg_mirror_to_ref', v_schema, r.relname);
  END LOOP;
END $$;
