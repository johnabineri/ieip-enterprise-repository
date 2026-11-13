-- =====================================================================
-- 297_outbox_claim_fix.sql : perbaikan shared.outbox_claim untuk database yang SUDAH berjalan (010_shared.sql memakai CREATE FUNCTION
-- sehingga tidak menimpa definisi lama). Isi fungsi IDENTIK dengan 010_shared.sql (wajib sama di CMP & EAP; dibandingkan
-- oleh eap/scripts/cross_check_shared.sh). Bug: klaim bisa melebihi p_batch — lihat komentar di 010_shared.sql.
-- CREATE OR REPLACE mempertahankan pemilik & hak EXECUTE (cmp_outbox / eap_outbox). Idempoten.
-- =====================================================================
CREATE OR REPLACE FUNCTION shared.outbox_claim(p_worker TEXT, p_batch INT DEFAULT 20, p_lock_seconds INT DEFAULT 60)
RETURNS SETOF shared.outbox LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, shared AS $$
    WITH picked AS MATERIALIZED (
        SELECT id FROM shared.outbox
         WHERE processed_at IS NULL AND available_at <= now() AND (locked_until IS NULL OR locked_until < now())
         ORDER BY id LIMIT p_batch FOR UPDATE SKIP LOCKED)
    UPDATE shared.outbox o
       SET locked_by = p_worker, locked_until = now() + make_interval(secs => p_lock_seconds), attempts = o.attempts + 1
      FROM picked
     WHERE o.id = picked.id
    RETURNING o.*
$$;
