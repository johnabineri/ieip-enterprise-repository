-- =====================================================================
-- 293_req_guard_engine.sql : label mesin guardrail yang JUJUR (REQ-02/03, D-03)
-- Sebelumnya penolakan pola jailbreak dicatat sebagai 'opa-rego' padahal tidak ada OPA. Kini:
--   'opa'     = keputusan Open Policy Agent sungguhan (eap/api/src/req/policy/guardrail.rego)
--   'pattern' = mesin pola lokal atas aturan yang SAMA (policy/data.json) bila OPA_URL tidak diisi
-- Nilai lama ('opa-rego','fencing') tetap diizinkan karena req.guard_log append-only (riwayat tidak ditulis ulang).
-- Idempoten.
-- =====================================================================
DO $$
DECLARE c text;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'req.guard_log'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%engine%' LOOP
        EXECUTE format('ALTER TABLE req.guard_log DROP CONSTRAINT %I', c);
    END LOOP;
END $$;
ALTER TABLE req.guard_log ADD CONSTRAINT ck_guard_log_engine CHECK (engine IN ('opa','pattern','pii','opa-rego','fencing'));
COMMENT ON COLUMN req.guard_log.engine IS 'opa = OPA sungguhan; pattern = mesin pola lokal; opa-rego/fencing = label lama (sebelum 293, keduanya mesin pola lokal).';
