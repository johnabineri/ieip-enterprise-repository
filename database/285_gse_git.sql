-- =====================================================================
-- 285_gse_git.sql : konektor Git/CI GSE (GitLab / GitHub) — jejak push feature-branch + merge request dan hasil pipeline CI. Append-only.
-- Token penyedia Git TIDAK disimpan di DB (env API). gse.project tetap append-only; status CI dibaca dari event terbaru.
-- =====================================================================
CREATE TABLE gse.git_event (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES gse.project(id),
    kind        VARCHAR(10) NOT NULL CHECK (kind IN ('push','ci')),
    provider    VARCHAR(20) NOT NULL DEFAULT 'gitlab' CHECK (provider IN ('gitlab','github')),
    repo_path   VARCHAR(255) NOT NULL,
    ref         VARCHAR(200) NOT NULL,
    commit_sha  VARCHAR(64),
    mr_iid      INTEGER,
    mr_url      VARCHAR(500),
    pipeline_id BIGINT,
    ci_status   VARCHAR(20),                                  -- status mentah GitLab: created|pending|running|success|failed|canceled|skipped|manual ...
    ci_url      VARCHAR(500),
    detail      JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT ck_git_event_no_main CHECK (lower(ref) NOT IN ('main','master','develop')),     -- D-02: tidak pernah push langsung ke cabang utama
    CONSTRAINT ck_git_event_push CHECK (kind <> 'push' OR (commit_sha IS NOT NULL AND mr_iid IS NOT NULL))
);
CALL shared.apply_standard('gse.git_event', 'internal', 'set.users');
CREATE INDEX ix_gse_git_event_proj ON gse.git_event (project_id, created_at DESC);
CREATE FUNCTION gse.tg_git_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'gse.git_event append-only: % ditolak', TG_OP USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER trg_git_event_immutable BEFORE UPDATE OR DELETE ON gse.git_event FOR EACH ROW EXECUTE FUNCTION gse.tg_git_event_immutable();
