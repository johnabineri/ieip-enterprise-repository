-- =====================================================================
-- 290_rls_grants.sql : hak role + RLS berbasis cakupan (SAF §6.1) — default-deny
-- Konteks sesi dari API (SET LOCAL): app.user_id, app.eap_perms, app.eap_view_all, app.eap_edit_all, app.eap_view_ids, app.eap_edit_ids
-- (diturunkan dari set.session_claims). Tanpa konteks → tidak ada baris yang terlihat selain objek Dipublikasi.
-- =====================================================================
REVOKE ALL ON SCHEMA set, eaw, shared, ref FROM PUBLIC;
GRANT USAGE ON SCHEMA set, eaw, shared, ref TO eap_app, eap_ro, eap_audit, eap_owner;
GRANT USAGE ON SCHEMA eaw TO eap_cdc;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA set, eaw, shared FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shared TO eap_app, eap_ro, eap_owner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA set, eaw TO eap_app, eap_ro, eap_owner;
REVOKE EXECUTE ON FUNCTION shared.audit_row(), shared.outbox_claim(TEXT, INT, INT), shared.outbox_done(BIGINT, TEXT) FROM PUBLIC, eap_app, eap_ro;

-- aplikasi: DML pada tabel domain; baca replika ref; set.users, eaw.workflow, registry TIDAK boleh ditulis langsung
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA eaw TO eap_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON eaw.workflow, eaw.application_registry FROM eap_app;
GRANT SELECT ON eaw.workflow, eaw.application_registry TO eap_app, eap_ro;
GRANT SELECT, INSERT, UPDATE, DELETE ON set.roles, set.permissions, set.role_permissions, set.user_roles TO eap_app;   -- dijaga trigger admin-only
GRANT SELECT ON set.users TO eap_app, eap_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA ref TO eap_app, eap_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA eaw TO eap_ro;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA eaw TO eap_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA eaw GRANT SELECT ON TABLES TO eap_app, eap_ro;        -- mis. view eaw.entity_org (migrasi 0001)
GRANT SELECT ON ALL TABLES IN SCHEMA set TO eap_ro;
GRANT SELECT ON shared.documents TO eap_app, eap_ro;
GRANT SELECT, INSERT ON shared.audit_logs TO eap_audit;
REVOKE UPDATE, DELETE, TRUNCATE ON shared.audit_logs FROM PUBLIC, eap_app, eap_ro, eap_audit;
GRANT SELECT ON eaw.application_registry TO eap_cdc;

-- ---------- RLS ----------
CREATE PROCEDURE eaw.enable_rls(p_table regclass) LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
    EXECUTE format('CREATE POLICY rls_%s_owner ON %s FOR ALL TO eap_owner USING (true) WITH CHECK (true)', (SELECT relname FROM pg_class WHERE oid = p_table), p_table);
END $$;

-- objek bersatus + entity_id: lihat = Dipublikasi | lihat-semua | entitas dalam cakupan; tulis = cakupan sunting
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['framework','process','data_entity','service','application','infra_asset','control'] LOOP
    CALL eaw.enable_rls(format('eaw.%I', t)::regclass);
    EXECUTE format('CREATE POLICY rls_%1$s_sel ON eaw.%1$I FOR SELECT TO eap_app, eap_ro USING (eaw.can_view(entity_id, status))', t);
    EXECUTE format('CREATE POLICY rls_%1$s_ins ON eaw.%1$I FOR INSERT TO eap_app WITH CHECK (eaw.can_edit(entity_id))', t);
    EXECUTE format('CREATE POLICY rls_%1$s_upd ON eaw.%1$I FOR UPDATE TO eap_app USING (eaw.can_edit(entity_id)) WITH CHECK (eaw.can_edit(entity_id))', t);
    EXECUTE format('CREATE POLICY rls_%1$s_del ON eaw.%1$I FOR DELETE TO eap_app USING (eaw.can_edit(entity_id))', t);
  END LOOP;
END $$;

-- KRA: hanya peran holding-wide menyusun; semua melihat yang Dipublikasi
CALL eaw.enable_rls('eaw.reference'::regclass);
CREATE POLICY rls_reference_sel ON eaw.reference FOR SELECT TO eap_app, eap_ro USING (status = 'Dipublikasi' OR eaw.flag('app.eap_view_all') OR eaw.flag('app.eap_edit_all'));
CREATE POLICY rls_reference_wr  ON eaw.reference FOR ALL TO eap_app USING (eaw.flag('app.eap_edit_all')) WITH CHECK (eaw.flag('app.eap_edit_all'));

CALL eaw.enable_rls('eaw.entity_org_metadata'::regclass);
CREATE POLICY rls_entity_org_metadata_sel ON eaw.entity_org_metadata FOR SELECT TO eap_app, eap_ro USING (true);   -- atribut struktur: internal
CREATE POLICY rls_entity_org_metadata_wr  ON eaw.entity_org_metadata FOR ALL TO eap_app USING (eaw.flag('app.eap_edit_all')) WITH CHECK (eaw.flag('app.eap_edit_all'));

CALL eaw.enable_rls('eaw.relation'::regclass);
-- relasi mengikuti objek SUMBER: terlihat bila sumber terlihat; ditulis bila sumber dalam cakupan susun
CREATE POLICY rls_relation_sel ON eaw.relation FOR SELECT TO eap_app, eap_ro USING (EXISTS (SELECT 1 FROM eaw.object_ref(sumber_type, sumber_id) o WHERE eaw.can_view(o.entity_id, o.status)));
CREATE POLICY rls_relation_ins ON eaw.relation FOR INSERT TO eap_app WITH CHECK (EXISTS (SELECT 1 FROM eaw.object_ref(sumber_type, sumber_id) o WHERE eaw.can_edit(o.entity_id)));
CREATE POLICY rls_relation_upd ON eaw.relation FOR UPDATE TO eap_app USING (EXISTS (SELECT 1 FROM eaw.object_ref(sumber_type, sumber_id) o WHERE eaw.can_edit(o.entity_id))) WITH CHECK (EXISTS (SELECT 1 FROM eaw.object_ref(sumber_type, sumber_id) o WHERE eaw.can_edit(o.entity_id)));
CREATE POLICY rls_relation_del ON eaw.relation FOR DELETE TO eap_app USING (EXISTS (SELECT 1 FROM eaw.object_ref(sumber_type, sumber_id) o WHERE eaw.can_edit(o.entity_id)));

-- ADR: yang sudah diputus terlihat semua; Proposed hanya penyusun/lihat-semua; tulis butuh eaw.adr.write (status: eaw.baseline.approve — trigger)
CALL eaw.enable_rls('eaw.adr'::regclass);
CREATE POLICY rls_adr_sel ON eaw.adr FOR SELECT TO eap_app, eap_ro USING (status <> 'Proposed' OR eaw.flag('app.eap_view_all') OR eaw.flag('app.eap_edit_all') OR created_by = shared.current_user_id());
CREATE POLICY rls_adr_wr  ON eaw.adr FOR ALL TO eap_app USING (set.has_perm('eaw.adr.write') OR set.has_perm('eaw.baseline.approve')) WITH CHECK (set.has_perm('eaw.adr.write') OR set.has_perm('eaw.baseline.approve'));
CALL eaw.enable_rls('eaw.adr_link'::regclass);
CREATE POLICY rls_adr_link_sel ON eaw.adr_link FOR SELECT TO eap_app, eap_ro USING (true);
CREATE POLICY rls_adr_link_wr  ON eaw.adr_link FOR ALL TO eap_app USING (set.has_perm('eaw.adr.write')) WITH CHECK (set.has_perm('eaw.adr.write'));

-- ARB: pengaju melihat tiketnya; peninjau sesuai cakupan; pengaju hanya di entitas yang boleh disusunnya
CALL eaw.enable_rls('eaw.arb_clearance'::regclass);
CREATE POLICY rls_arb_sel ON eaw.arb_clearance FOR SELECT TO eap_app, eap_ro USING (proposed_by = shared.current_user_id() OR eaw.can_view(entity_id, 'x'));
CREATE POLICY rls_arb_ins ON eaw.arb_clearance FOR INSERT TO eap_app WITH CHECK (proposed_by = shared.current_user_id() AND eaw.can_edit(entity_id) AND set.has_perm('gov.arb.write'));
CREATE POLICY rls_arb_upd ON eaw.arb_clearance FOR UPDATE TO eap_app USING (proposed_by = shared.current_user_id()) WITH CHECK (proposed_by = shared.current_user_id());

-- jejak alur: lihat-semua, atau tindakannya sendiri
CALL eaw.enable_rls('eaw.workflow'::regclass);
CREATE POLICY rls_workflow_sel ON eaw.workflow FOR SELECT TO eap_app, eap_ro USING (eaw.flag('app.eap_view_all') OR eaw.flag('app.eap_edit_all') OR pelaku = shared.current_user_id());

-- set.*: akun & penugasan hanya untuk pemegang set.account.read/admin (atau diri sendiri)
CALL eaw.enable_rls('set.users'::regclass);
CREATE POLICY rls_users_sel ON set.users FOR SELECT TO eap_app, eap_ro USING (id = shared.current_user_id() OR set.has_perm('set.account.read') OR set.has_perm('set.account.admin'));
CALL eaw.enable_rls('set.user_roles'::regclass);
CREATE POLICY rls_user_roles_sel ON set.user_roles FOR SELECT TO eap_app, eap_ro USING (user_id = shared.current_user_id() OR set.has_perm('set.account.read') OR set.has_perm('set.account.admin'));
CREATE POLICY rls_user_roles_wr  ON set.user_roles FOR ALL TO eap_app USING (set.has_perm('set.account.admin')) WITH CHECK (set.has_perm('set.account.admin'));
-- roles/permissions/role_permissions: katalog terbaca semua pengguna terautentikasi; tulis dijaga trigger admin-only

-- ---------- GSE (230): hak & RLS berbasis izin (bukan entitas) ----------
GRANT USAGE ON SCHEMA gse TO eap_app, eap_ro, eap_audit, eap_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON gse.template, gse.flow TO eap_app;
GRANT SELECT, INSERT, UPDATE ON gse.project TO eap_app;               -- UPDATE hanya hapus lunak (trigger append-only)
GRANT SELECT, INSERT ON gse.project_file TO eap_app;
GRANT SELECT ON ALL TABLES IN SCHEMA gse TO eap_ro;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gse TO eap_app, eap_ro, eap_owner;
CALL eaw.enable_rls('gse.template'::regclass);
CREATE POLICY rls_gse_template_sel ON gse.template FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_template_wr  ON gse.template FOR ALL TO eap_app USING (set.has_perm('gse.project.run')) WITH CHECK (set.has_perm('gse.project.run'));
CALL eaw.enable_rls('gse.project'::regclass);
CREATE POLICY rls_gse_project_sel ON gse.project FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_project_ins ON gse.project FOR INSERT TO eap_app WITH CHECK (set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_project_upd ON gse.project FOR UPDATE TO eap_app USING (set.has_perm('gse.project.run')) WITH CHECK (set.has_perm('gse.project.run'));
CALL eaw.enable_rls('gse.project_file'::regclass);
CREATE POLICY rls_gse_file_sel ON gse.project_file FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_file_ins ON gse.project_file FOR INSERT TO eap_app WITH CHECK (set.has_perm('gse.project.run'));
CALL eaw.enable_rls('gse.flow'::regclass);
CREATE POLICY rls_gse_flow_sel ON gse.flow FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_flow_wr  ON gse.flow FOR ALL TO eap_app USING (set.has_perm('gse.project.run')) WITH CHECK (set.has_perm('gse.project.run'));

-- ---------- REQ (240): sesi milik pembuatnya; hak berbasis izin req.session.write ----------
GRANT USAGE ON SCHEMA req TO eap_app, eap_ro, eap_audit, eap_owner;
GRANT SELECT, INSERT, UPDATE ON req.session TO eap_app;
GRANT SELECT, INSERT ON req.message TO eap_app;
GRANT SELECT, INSERT, UPDATE ON req.story TO eap_app;
GRANT SELECT, INSERT ON req.guard_log TO eap_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA req TO eap_app;
GRANT SELECT ON ALL TABLES IN SCHEMA req TO eap_ro;
CALL eaw.enable_rls('req.session'::regclass);
CREATE POLICY rls_req_session_sel ON req.session FOR SELECT TO eap_app, eap_ro USING (created_by = shared.current_user_id());
CREATE POLICY rls_req_session_ins ON req.session FOR INSERT TO eap_app WITH CHECK (set.has_perm('req.session.write'));
CREATE POLICY rls_req_session_upd ON req.session FOR UPDATE TO eap_app USING (created_by = shared.current_user_id() AND set.has_perm('req.session.write')) WITH CHECK (created_by = shared.current_user_id());
CALL eaw.enable_rls('req.message'::regclass);
CREATE POLICY rls_req_message_sel ON req.message FOR SELECT TO eap_app, eap_ro USING (EXISTS (SELECT 1 FROM req.session s WHERE s.id = session_id AND s.created_by = shared.current_user_id()));
CREATE POLICY rls_req_message_ins ON req.message FOR INSERT TO eap_app WITH CHECK (set.has_perm('req.session.write') AND EXISTS (SELECT 1 FROM req.session s WHERE s.id = session_id AND s.created_by = shared.current_user_id()));
CALL eaw.enable_rls('req.story'::regclass);
CREATE POLICY rls_req_story_sel ON req.story FOR SELECT TO eap_app, eap_ro USING (EXISTS (SELECT 1 FROM req.session s WHERE s.id = session_id AND s.created_by = shared.current_user_id()));
CREATE POLICY rls_req_story_ins ON req.story FOR INSERT TO eap_app WITH CHECK (set.has_perm('req.session.write') AND EXISTS (SELECT 1 FROM req.session s WHERE s.id = session_id AND s.created_by = shared.current_user_id()));
CREATE POLICY rls_req_story_upd ON req.story FOR UPDATE TO eap_app USING (created_by = shared.current_user_id()) WITH CHECK (created_by = shared.current_user_id());
-- log guardrail: pelaku menulis catatan penolakannya sendiri; hanya pemegang set.audit.read (atau pemilik) membaca
CALL eaw.enable_rls('req.guard_log'::regclass);
CREATE POLICY rls_req_guard_sel ON req.guard_log FOR SELECT TO eap_app, eap_ro USING (user_id = shared.current_user_id() OR set.has_perm('set.audit.read') OR set.has_perm('console.security.admin'));
CREATE POLICY rls_req_guard_ins ON req.guard_log FOR INSERT TO eap_app WITH CHECK (user_id = shared.current_user_id());

-- ---------- CONSOLE (250): hak berbasis izin ----------
GRANT USAGE ON SCHEMA console TO eap_app, eap_ro, eap_audit, eap_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON console.ai_model, console.rag_dataset, console.provider_invoice, console.eio_connector TO eap_app;
GRANT SELECT, INSERT ON console.token_usage TO eap_app;
GRANT SELECT, UPDATE ON console.agent_switch TO eap_app;
GRANT SELECT, INSERT, UPDATE ON console.ika_snapshot TO eap_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA console TO eap_app;
GRANT SELECT ON ALL TABLES IN SCHEMA console TO eap_ro;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA console TO eap_app, eap_ro, eap_owner;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_model','rag_dataset'] LOOP
    CALL eaw.enable_rls(format('console.%I', t)::regclass);
    EXECUTE format('CREATE POLICY rls_%1$s_sel ON console.%1$I FOR SELECT TO eap_app, eap_ro USING (set.has_perm(''console.dashboard.read'') OR set.has_perm(''console.ai.admin''))', t);
    EXECUTE format('CREATE POLICY rls_%1$s_wr ON console.%1$I FOR ALL TO eap_app USING (set.has_perm(''console.ai.admin'')) WITH CHECK (set.has_perm(''console.ai.admin''))', t);
  END LOOP;
END $$;
CALL eaw.enable_rls('console.token_usage'::regclass);
CREATE POLICY rls_token_usage_sel ON console.token_usage FOR SELECT TO eap_app, eap_ro USING (set.has_perm('console.finops.read') OR set.has_perm('console.ai.admin') OR user_id = shared.current_user_id());
CREATE POLICY rls_token_usage_ins ON console.token_usage FOR INSERT TO eap_app WITH CHECK (user_id = shared.current_user_id());
CALL eaw.enable_rls('console.provider_invoice'::regclass);
CREATE POLICY rls_provider_invoice_sel ON console.provider_invoice FOR SELECT TO eap_app, eap_ro USING (set.has_perm('console.finops.read') OR set.has_perm('console.ai.admin'));
CREATE POLICY rls_provider_invoice_wr ON console.provider_invoice FOR ALL TO eap_app USING (set.has_perm('console.ai.admin')) WITH CHECK (set.has_perm('console.ai.admin'));
CALL eaw.enable_rls('console.eio_connector'::regclass);
CREATE POLICY rls_eio_connector_sel ON console.eio_connector FOR SELECT TO eap_app, eap_ro USING (set.has_perm('console.dashboard.read') OR set.has_perm('console.eio.write'));
CREATE POLICY rls_eio_connector_wr ON console.eio_connector FOR ALL TO eap_app USING (set.has_perm('console.eio.write')) WITH CHECK (set.has_perm('console.eio.write'));
CALL eaw.enable_rls('console.agent_switch'::regclass);
CREATE POLICY rls_agent_switch_sel ON console.agent_switch FOR SELECT TO eap_app, eap_ro USING (set.has_perm('console.dashboard.read') OR set.has_perm('console.security.admin'));
CREATE POLICY rls_agent_switch_upd ON console.agent_switch FOR UPDATE TO eap_app USING (set.has_perm('console.security.admin')) WITH CHECK (set.has_perm('console.security.admin'));
CALL eaw.enable_rls('console.ika_snapshot'::regclass);
CREATE POLICY rls_ika_snapshot_sel ON console.ika_snapshot FOR SELECT TO eap_app, eap_ro USING (set.has_perm('console.dashboard.read'));
CREATE POLICY rls_ika_snapshot_wr ON console.ika_snapshot FOR ALL TO eap_app USING (set.has_perm('console.dashboard.write')) WITH CHECK (set.has_perm('console.dashboard.write'));

-- ---------- Diagram & Publikasi (260) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON eaw.diagram TO eap_app;
REVOKE UPDATE, DELETE ON eaw.publication FROM eap_app;   -- append-only (blanket grant di atas mencakup tabel ini)
GRANT SELECT, INSERT ON eaw.publication TO eap_app;
GRANT SELECT ON eaw.diagram, eaw.publication TO eap_ro;
CALL eaw.enable_rls('eaw.diagram'::regclass);
CREATE POLICY rls_diagram_sel ON eaw.diagram FOR SELECT TO eap_app, eap_ro USING (eaw.can_view(entity_id, 'Draf'));
CREATE POLICY rls_diagram_ins ON eaw.diagram FOR INSERT TO eap_app WITH CHECK (eaw.can_edit(entity_id) AND set.has_perm('eaw.model.write'));
CREATE POLICY rls_diagram_upd ON eaw.diagram FOR UPDATE TO eap_app USING (eaw.can_edit(entity_id) AND set.has_perm('eaw.model.write')) WITH CHECK (eaw.can_edit(entity_id));
CREATE POLICY rls_diagram_del ON eaw.diagram FOR DELETE TO eap_app USING (eaw.can_edit(entity_id) AND set.has_perm('eaw.model.write'));
CALL eaw.enable_rls('eaw.publication'::regclass);
CREATE POLICY rls_publication_sel ON eaw.publication FOR SELECT TO eap_app, eap_ro USING (true);   -- dokumen resmi memuat objek baseline; semua pengguna ber-izin membaca
CREATE POLICY rls_publication_ins ON eaw.publication FOR INSERT TO eap_app WITH CHECK (set.has_perm('eaw.document.approve') AND eaw.can_view(entity_id, 'Draf'));

-- ---------- Impor CSV (280) ----------
REVOKE UPDATE, DELETE ON eaw.import_log FROM eap_app;
GRANT SELECT, INSERT ON eaw.import_log TO eap_app;
GRANT SELECT ON eaw.import_log TO eap_ro;
CALL eaw.enable_rls('eaw.import_log'::regclass);
CREATE POLICY rls_import_log_sel ON eaw.import_log FOR SELECT TO eap_app, eap_ro USING (created_by = shared.current_user_id() OR set.has_perm('set.audit.read'));
CREATE POLICY rls_import_log_ins ON eaw.import_log FOR INSERT TO eap_app WITH CHECK (created_by = shared.current_user_id() AND (set.has_perm('eaw.model.write') OR set.has_perm('eaw.catalog.write')));

-- ---------- Konektor Git/CI GSE (285) ----------
REVOKE UPDATE, DELETE ON gse.git_event FROM eap_app;
GRANT SELECT, INSERT ON gse.git_event TO eap_app;
GRANT SELECT ON gse.git_event TO eap_ro;
CALL eaw.enable_rls('gse.git_event'::regclass);
CREATE POLICY rls_gse_git_sel ON gse.git_event FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_git_ins ON gse.git_event FOR INSERT TO eap_app WITH CHECK (set.has_perm('gse.project.run'));
