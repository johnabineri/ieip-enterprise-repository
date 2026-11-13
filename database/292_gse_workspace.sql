-- =====================================================================
-- 292_gse_workspace.sql : GSE-05 — ruang kerja kode proyek scaffold (editor + commit ke feature branch)
--
-- Berkas hasil generate (gse.project_file) TETAP append-only dan tidak pernah diubah. Suntingan manusia disimpan sebagai REVISI
-- (gse.file_revision, append-only): keadaan ruang kerja = revisi TERAKHIR per (proyek, path), atau berkas asli bila belum pernah disunting
-- (view gse.workspace_file). Setiap push/commit ke Git dicatat di gse.workspace_commit (append-only) dengan `revision_upto` = revisi
-- tertinggi yang ikut — perubahan "belum di-commit" = revisi dengan id lebih besar.
-- Penjaga di DB (berlaku walau API dilewati):
--   * AF-06: proyek berstatus `blocked` tidak dapat disunting/di-commit; proyek terhapus lunak juga tidak.
--   * path relatif aman: tanpa `..`, tanpa awalan `/`, tanpa `\`, tanpa segmen kosong, tanpa `.git/`, tanpa karakter kendali; ≤ 300 karakter.
--   * ukuran: ≤ 200 KB per berkas (konten teks).
--   * D-02: ref commit tidak pernah main/master/develop.
-- Konkurensi (dua penyunting pada berkas yang sama) dijaga API: kunci advisory per (proyek, path) + revisi dasar wajib = revisi terakhir.
-- Idempoten agar dapat diterapkan ke basis data yang sudah berjalan.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gse.file_revision (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id UUID         NOT NULL REFERENCES gse.project(id),
    path       VARCHAR(300) NOT NULL,
    op         VARCHAR(6)   NOT NULL CHECK (op IN ('put','delete')),
    content    TEXT,
    bytes      INTEGER      NOT NULL DEFAULT 0 CHECK (bytes >= 0 AND bytes <= 200000),
    sha256     CHAR(64),
    parent_id  BIGINT REFERENCES gse.file_revision(id),       -- revisi dasar yang disunting (NULL = berkas asli / berkas baru)
    author     UUID,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_file_revision_op CHECK ((op = 'put') = (content IS NOT NULL)),
    CONSTRAINT ck_file_revision_path CHECK (
        path !~ '(^|/)\.\.(/|$)' AND path !~ '^/' AND path !~ '\\' AND path !~ '//' AND path !~ '/$'
        AND path !~ '(^|/)\.git(/|$)' AND path !~ '[[:cntrl:]]' AND length(path) BETWEEN 1 AND 300)
);
CREATE INDEX IF NOT EXISTS ix_file_revision_head ON gse.file_revision (project_id, path, id DESC);
COMMENT ON TABLE gse.file_revision IS 'GSE-05: revisi berkas ruang kerja (append-only). Berkas hasil generate di gse.project_file tidak pernah diubah.';

CREATE TABLE IF NOT EXISTS gse.workspace_commit (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id    UUID         NOT NULL REFERENCES gse.project(id),
    kind          VARCHAR(6)   NOT NULL CHECK (kind IN ('push','commit')),   -- push = cabang + PR pertama; commit = commit lanjutan ke cabang yang sama
    provider      VARCHAR(10)  NOT NULL CHECK (provider IN ('gitlab','github')),
    repo_path     VARCHAR(255) NOT NULL,
    ref           VARCHAR(200) NOT NULL,
    commit_sha    VARCHAR(64)  NOT NULL,
    message       TEXT         NOT NULL,
    revision_upto BIGINT       NOT NULL DEFAULT 0,                          -- revisi tertinggi yang termasuk (0 = hanya berkas asli)
    files         JSONB        NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(files) = 'array'),   -- [{path, action: create|update|delete}]
    gates         JSONB        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(gates) = 'object'),
    author        UUID,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_workspace_commit_no_main CHECK (lower(ref) NOT IN ('main','master','develop'))   -- D-02
);
CREATE INDEX IF NOT EXISTS ix_workspace_commit_project ON gse.workspace_commit (project_id, id DESC);

-- append-only + AF-06 + proyek hidup
CREATE OR REPLACE FUNCTION gse.tg_workspace_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, gse AS $$
DECLARE v_status text; v_deleted timestamptz;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION '%.% bersifat append-only', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT status, deleted_at INTO v_status, v_deleted FROM gse.project WHERE id = NEW.project_id;
    IF v_status IS NULL OR v_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'proyek GSE tidak ditemukan atau sudah dihapus' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_status = 'blocked' THEN
        RAISE EXCEPTION 'AF-06: proyek berstatus blocked tidak dapat disunting atau di-commit' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'file_revision' THEN
        NEW.author := COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, NEW.author);
        IF NEW.op = 'put' THEN
            IF NEW.content IS NULL THEN RAISE EXCEPTION 'revisi put wajib berisi konten (%)', NEW.path USING ERRCODE = 'check_violation'; END IF;
            NEW.bytes := octet_length(NEW.content);
            IF NEW.bytes > 200000 THEN RAISE EXCEPTION 'berkas % melebihi 200 KB', NEW.path USING ERRCODE = 'check_violation'; END IF;
            NEW.sha256 := encode(digest(convert_to(NEW.content, 'UTF8'), 'sha256'), 'hex');
        ELSE
            NEW.bytes := 0; NEW.sha256 := NULL;
        END IF;
    ELSE
        NEW.author := COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, NEW.author);
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_file_revision_guard ON gse.file_revision;
CREATE TRIGGER trg_file_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON gse.file_revision FOR EACH ROW EXECUTE FUNCTION gse.tg_workspace_guard();
DROP TRIGGER IF EXISTS trg_workspace_commit_guard ON gse.workspace_commit;
CREATE TRIGGER trg_workspace_commit_guard BEFORE INSERT OR UPDATE OR DELETE ON gse.workspace_commit FOR EACH ROW EXECUTE FUNCTION gse.tg_workspace_guard();

-- keadaan ruang kerja: revisi terakhir per path, atau berkas asli
CREATE OR REPLACE VIEW gse.workspace_file WITH (security_invoker = true) AS
WITH head AS (
    SELECT DISTINCT ON (project_id, path) id, project_id, path, op, content, bytes, sha256, created_at, author
      FROM gse.file_revision ORDER BY project_id, path, id DESC)
SELECT COALESCE(h.project_id, f.project_id) AS project_id,
       COALESCE(h.path, f.path)             AS path,
       CASE WHEN h.id IS NULL THEN f.content WHEN h.op = 'put' THEN h.content END AS content,
       CASE WHEN h.id IS NULL THEN f.bytes ELSE h.bytes END AS bytes,
       CASE WHEN h.id IS NULL THEN f.source ELSE 'edit' END AS source,
       f.source                              AS origin,          -- template | ai | NULL (berkas baru dari editor)
       h.id                                  AS revision_id,     -- NULL = belum pernah disunting
       COALESCE(h.op = 'delete', false)      AS deleted,
       h.created_at                          AS edited_at,
       h.author                              AS edited_by
  FROM gse.project_file f
  FULL JOIN head h ON h.project_id = f.project_id AND h.path = f.path;

-- hak & RLS: sama dengan gse.project_file (baca: read|run; tulis: run)
GRANT SELECT, INSERT ON gse.file_revision, gse.workspace_commit TO eap_app;
GRANT SELECT ON gse.file_revision, gse.workspace_commit, gse.workspace_file TO eap_ro;
GRANT SELECT ON gse.workspace_file TO eap_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA gse TO eap_app;
DROP POLICY IF EXISTS rls_file_revision_owner ON gse.file_revision;          -- enable_rls membuat ulang (berkas idempoten)
DROP POLICY IF EXISTS rls_workspace_commit_owner ON gse.workspace_commit;
CALL eaw.enable_rls('gse.file_revision'::regclass);
CALL eaw.enable_rls('gse.workspace_commit'::regclass);
DROP POLICY IF EXISTS rls_gse_rev_sel ON gse.file_revision;
DROP POLICY IF EXISTS rls_gse_rev_ins ON gse.file_revision;
DROP POLICY IF EXISTS rls_gse_wc_sel ON gse.workspace_commit;
DROP POLICY IF EXISTS rls_gse_wc_ins ON gse.workspace_commit;
CREATE POLICY rls_gse_rev_sel ON gse.file_revision FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_rev_ins ON gse.file_revision FOR INSERT TO eap_app WITH CHECK (set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_wc_sel  ON gse.workspace_commit FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_gse_wc_ins  ON gse.workspace_commit FOR INSERT TO eap_app WITH CHECK (set.has_perm('gse.project.run'));
REVOKE ALL ON FUNCTION gse.tg_workspace_guard() FROM PUBLIC;
