-- =====================================================================
-- 289_outbox.sql : EAP sebagai PRODUSEN peristiwa (transactional outbox, ADR-CMP-004)
--
-- Pola sama dengan kalla_cmp 205_outbox.sql: pemicu shared.tg_outbox (010_shared.sql, salinan identik
-- CMP) menulis SATU baris shared.outbox di transaksi yang sama dengan perubahan datanya, SECURITY
-- DEFINER — eap_app tidak punya (dan tidak perlu) hak apa pun pada shared.outbox. Worker
-- infra/services/outbox-relay (OUTBOX_SOURCE=eap, login anggota eap_outbox) mengambilnya lewat
-- shared.outbox_claim()/outbox_done() dan menerbitkannya ke NATS JetStream KEIS_EVENTS dengan subjek
-- keis.eap.<aggregate_type>.<event_type…>.
--
-- KONTRAK event_type: eap.<workspace>.<entitas>_changed (eap.eaw.document_published untuk publikasi).
-- Status AF-05 (Draf→Divalidasi→Ditetapkan→Dipublikasi/Direviu) terlihat di payload.changes.status
-- {from,to}; penghapusan lunak di payload.deleted_at. Konsumen memakai row_version untuk urutan/dedupe.
--
-- ATURAN PAYLOAD (D-14): daftar kolom EKSPLISIT. TIDAK PERNAH ikut: teks bebas (catatan, business_case,
-- context/decision ADR, prompt GSE, isi publikasi), nama orang/jabatan pemilik (owner_bisnis,
-- owner_teknis, steward, pemilik, pemilik_jabatan), pengenal pengguna (proposed_by, decided_by,
-- created_by/updated_by), biaya (estimated_cost), URL/repo. data_classification SELALU ikut agar
-- konsumen dapat menyaring objek berklasifikasi terbatas/rahasia — batas jujur: nama objek tetap ikut
-- di payload, jadi pelanggan stream KEIS_EVENTS harus berhak membaca katalog EAP.
--
-- Hanya INSERT/UPDATE: seluruh penghapusan di EAP adalah soft delete (deleted_at); DELETE fisik tidak
-- diterbitkan (payload DELETE tidak dapat dibedakan dari perubahan biasa).
-- UPDATE yang tidak mengubah kolom payload (mis. updated_at, catatan) tidak menerbitkan peristiwa.
-- Tidak dipasang (sengaja): eaw.relation/diagram/roadmap (volume tinggi/kanvas), set.* (RBAC internal),
-- req.* (percakapan, PII termasking pun tetap teks pengguna), console.* (operasional).
-- Idempoten (DROP TRIGGER IF EXISTS) agar dapat diterapkan ulang pada basis data yang sudah berjalan.
-- =====================================================================

-- Peran worker (juga di 000_init.sql); dibuat di sini juga agar berkas ini cukup untuk DB lama.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eap_outbox') THEN CREATE ROLE eap_outbox NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA shared TO eap_outbox;
GRANT EXECUTE ON FUNCTION shared.outbox_claim(TEXT, INT, INT), shared.outbox_done(BIGINT, TEXT) TO eap_outbox;

-- ---------- EAW: aplikasi (platform/workspace) ----------
DROP TRIGGER IF EXISTS trg_application_outbox ON eaw.application;
CREATE TRIGGER trg_application_outbox
    AFTER INSERT OR UPDATE ON eaw.application
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'application', 'eap.eaw.application_changed',
        '{id,kode,nama,jenis_node,platform,workspace,jenis,lifecycle,kritikalitas,adopsi,arb_clearance_id,referensi_id,entity_id,status,data_classification,deleted_at,row_version}');

-- ---------- EAW: objek 6 domain ----------
DROP TRIGGER IF EXISTS trg_process_outbox ON eaw.process;
CREATE TRIGGER trg_process_outbox
    AFTER INSERT OR UPDATE ON eaw.process
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'process', 'eap.eaw.process_changed',
        '{id,nama,level,parent_id,referensi_id,entity_id,status,data_classification,deleted_at,row_version}');

DROP TRIGGER IF EXISTS trg_data_entity_outbox ON eaw.data_entity;
CREATE TRIGGER trg_data_entity_outbox
    AFTER INSERT OR UPDATE ON eaw.data_entity
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'data_entity', 'eap.eaw.data_entity_changed',
        '{id,nama_kanonikal,klasifikasi,pii,sumber_otoritatif,referensi_id,entity_id,status,data_classification,deleted_at,row_version}');

DROP TRIGGER IF EXISTS trg_service_outbox ON eaw.service;
CREATE TRIGGER trg_service_outbox
    AFTER INSERT OR UPDATE ON eaw.service
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'service', 'eap.eaw.service_changed',
        '{id,nama,tipe,kategori,referensi_id,entity_id,status,data_classification,deleted_at,row_version}');

DROP TRIGGER IF EXISTS trg_infra_asset_outbox ON eaw.infra_asset;
CREATE TRIGGER trg_infra_asset_outbox
    AFTER INSERT OR UPDATE ON eaw.infra_asset
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'infra_asset', 'eap.eaw.infra_asset_changed',
        '{id,nama,tipe,dr_tier,referensi_id,entity_id,status,data_classification,deleted_at,row_version}');

DROP TRIGGER IF EXISTS trg_control_outbox ON eaw.control;
CREATE TRIGGER trg_control_outbox
    AFTER INSERT OR UPDATE ON eaw.control
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'control', 'eap.eaw.control_changed',
        '{id,aspek,standar_rujukan,status_penerapan,referensi_id,entity_id,status,data_classification,deleted_at,row_version}');

-- ---------- EAW: KRA, kerangka, ADR, dokumen terbit ----------
DROP TRIGGER IF EXISTS trg_reference_outbox ON eaw.reference;
CREATE TRIGGER trg_reference_outbox
    AFTER INSERT OR UPDATE ON eaw.reference
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'reference', 'eap.eaw.reference_changed',
        '{id,domain,kode,nama,versi,status,data_classification,deleted_at,row_version}');

DROP TRIGGER IF EXISTS trg_framework_outbox ON eaw.framework;
CREATE TRIGGER trg_framework_outbox
    AFTER INSERT OR UPDATE ON eaw.framework
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'framework', 'eap.eaw.framework_changed',
        '{id,entity_id,layanan_utama,tipe,status,data_classification,deleted_at,row_version}');

DROP TRIGGER IF EXISTS trg_adr_outbox ON eaw.adr;
CREATE TRIGGER trg_adr_outbox
    AFTER INSERT OR UPDATE ON eaw.adr
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'adr', 'eap.eaw.adr_changed',
        '{id,adr_code,title,status,superseded_by,git_ref,data_classification,deleted_at,row_version}');

-- eaw.publication append-only (260): hanya INSERT; isi dokumen TIDAK ikut (ambil lewat API + verifikasi sha256)
DROP TRIGGER IF EXISTS trg_publication_outbox ON eaw.publication;
CREATE TRIGGER trg_publication_outbox
    AFTER INSERT ON eaw.publication
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'publication', 'eap.eaw.document_published',
        '{id,scope_type,scope_key,framework_id,entity_id,format,versi,title,sha256,data_classification,row_version}');

-- ---------- GOV: tiket ARB ----------
DROP TRIGGER IF EXISTS trg_arb_clearance_outbox ON eaw.arb_clearance;
CREATE TRIGGER trg_arb_clearance_outbox
    AFTER INSERT OR UPDATE ON eaw.arb_clearance
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'arb_clearance', 'eap.gov.arb_clearance_changed',
        '{id,ticket_number,entity_id,initiative_name,status,ai_risk_score,decided_at,certificate_id,data_classification,deleted_at,row_version}');

-- ---------- GSE: proyek scaffolding (status generated/blocked/checks-failed/…) ----------
DROP TRIGGER IF EXISTS trg_gse_project_outbox ON gse.project;
CREATE TRIGGER trg_gse_project_outbox
    AFTER INSERT OR UPDATE ON gse.project
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox(
        'gse_project', 'eap.gse.project_changed',
        '{id,application_id,kode,status,branch,base_branch,file_count,data_classification,deleted_at,row_version}');
