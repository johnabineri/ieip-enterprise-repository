-- =====================================================================
-- 287_kra_review.sql : AF-07 — KRA naik versi => objek tertaut yang sudah Dipublikasi masuk status Direviu
--   eaw.tg_reference_review() : trigger AFTER UPDATE OF versi pada eaw.reference (SECURITY DEFINER: aturan tata kelola berlaku untuk SELURUH grup,
--                               bukan hanya objek yang terlihat oleh pengubah KRA). Setiap perpindahan dicatat di eaw.workflow (pelaku = pengubah KRA).
--   eaw.kra_impact(kra)       : pratinjau dampak (jumlah objek tertaut per jenis & status) — hanya peran lintas-holding.
-- Cakupan: sesuai alur AF-05, Direviu hanya dicapai dari Dipublikasi. Objek tertaut berstatus Draf/Divalidasi/Ditetapkan TIDAK diubah statusnya
-- (belum baseline terbit) tetapi dilaporkan sebagai "terdampak" oleh pratinjau. Framework tidak memiliki tautan KRA (referensi_id) sehingga tidak ikut.
-- =====================================================================
CREATE FUNCTION eaw.tg_reference_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, eaw, set, ref, shared AS $$
DECLARE
    t RECORD; n INT; v_total INT := 0; v_by JSONB := '{}'::jsonb; v_user UUID := shared.current_user_id(); v_note TEXT;
BEGIN
    IF NEW.deleted_at IS NOT NULL OR NEW.versi IS NOT DISTINCT FROM OLD.versi THEN RETURN NEW; END IF;
    IF v_user IS NULL THEN RAISE EXCEPTION 'AF-07: perubahan versi KRA memerlukan sesi pengguna (jejak reviu)' USING ERRCODE = 'insufficient_privilege'; END IF;
    v_note := format('AF-07: KRA %s naik versi %s → %s; objek tertaut wajib direviu', NEW.kode, OLD.versi, NEW.versi);
    PERFORM set_config('eaw.in_transition', 'on', true);
    FOR t IN SELECT * FROM (VALUES ('application', 'eaw.application'), ('process', 'eaw.process'), ('data_entity', 'eaw.data_entity'),
                                   ('service', 'eaw.service'), ('infra_asset', 'eaw.infra_asset'), ('control', 'eaw.control')) AS x(tipe, tbl)
    LOOP
        EXECUTE format($q$WITH upd AS (UPDATE %s SET status = 'Direviu' WHERE referensi_id = $1 AND status = 'Dipublikasi' AND deleted_at IS NULL RETURNING id)
                          INSERT INTO eaw.workflow (objek_type, objek_id, status_dari, status_ke, pelaku, catatan) SELECT $2, id, 'Dipublikasi', 'Direviu', $3, $4 FROM upd$q$, t.tbl)
            USING NEW.id, t.tipe, v_user, v_note;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN v_total := v_total + n; v_by := v_by || jsonb_build_object(t.tipe, n); END IF;
    END LOOP;
    PERFORM set_config('eaw.in_transition', 'off', true);
    -- dibaca API untuk melaporkan hasil kaskade dalam transaksi yang sama
    PERFORM set_config('eaw.af07_marked', jsonb_build_object('total', v_total, 'byType', v_by, 'from', OLD.versi, 'to', NEW.versi)::text, true);
    RETURN NEW;
END $$;
CREATE TRIGGER trg_reference_review AFTER UPDATE OF versi ON eaw.reference FOR EACH ROW EXECUTE FUNCTION eaw.tg_reference_review();

CREATE FUNCTION eaw.kra_impact(p_kra UUID) RETURNS TABLE (objek_type TEXT, status TEXT, jumlah INT) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, eaw, set, ref, shared AS $$
DECLARE t RECORD;
BEGIN
    IF NOT (eaw.flag('app.eap_view_all') OR eaw.flag('app.eap_edit_all')) THEN
        RAISE EXCEPTION 'pratinjau dampak KRA hanya untuk peran lintas-holding (403)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM eaw.reference r WHERE r.id = p_kra AND r.deleted_at IS NULL) THEN RAISE EXCEPTION 'KRA tidak ditemukan' USING ERRCODE = 'no_data_found'; END IF;
    FOR t IN SELECT * FROM (VALUES ('application', 'eaw.application'), ('process', 'eaw.process'), ('data_entity', 'eaw.data_entity'),
                                   ('service', 'eaw.service'), ('infra_asset', 'eaw.infra_asset'), ('control', 'eaw.control')) AS x(tipe, tbl)
    LOOP
        RETURN QUERY EXECUTE format('SELECT %L::text, x.status::text, count(*)::int FROM %s x WHERE x.referensi_id = $1 AND x.deleted_at IS NULL GROUP BY x.status', t.tipe, t.tbl) USING p_kra;
    END LOOP;
END $$;
