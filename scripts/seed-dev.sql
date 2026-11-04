-- Data DEMO untuk pengembangan lokal (BUKAN seed produksi). Menugaskan peran EAP ke pengguna demo Keycloak realm `keis`
-- (ID tetap 5e1d0000-…, lihat cmp/docker/keycloak/realm-keis.json). EAP tetap KOSONG secara arsitektur (Zero Pre-Seed):
-- tidak ada aplikasi/platform di sini, hanya penugasan otorisasi. Hanya peran holding-wide (entity_scope NULL), karena
-- penugasan berlingkup entitas butuh ref.business_groups yang baru ada setelah replikasi CDC dari CMP selesai —
-- tambahkan lewat API: POST /api/v1/set/user-roles {"user_id": …, "role_code": "ROLE_EAP_SBU_ARCHITECT", "entity_scope": "KALLA-ASPAL"}.
-- Pengguna ditautkan ke ref.users (CMP) saat login pertama (set.provision_user). Idempoten.
DO $$
DECLARE r record; v_user uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('5e1d0000-0000-4000-8000-000000000001', 'ROLE_EAP_APP_ARCHITECT'),   -- nurul.aisyah  : Holding EA Office (menyusun & memvalidasi)
    ('5e1d0000-0000-4000-8000-000000000002', 'ROLE_EAP_ARB_CHAIR'),       -- andi.pratama  : Ketua ARB (menetapkan)
    ('5e1d0000-0000-4000-8000-000000000003', 'ROLE_EAP_AUDITOR'),         -- dewi.pdp      : Auditor (baca semua)
    ('5e1d0000-0000-4000-8000-000000000004', 'ROLE_EAP_SYSADMIN'),        -- iam.admin     : administrator set
    ('5e1d0000-0000-4000-8000-000000000005', 'ROLE_EAP_SYSADMIN')         -- cmp.admin
  ) AS t(subject, role_code) LOOP
    INSERT INTO set.users (idp_subject) VALUES (r.subject) ON CONFLICT (idp_subject) WHERE deleted_at IS NULL DO NOTHING;
    SELECT id INTO v_user FROM set.users WHERE idp_subject = r.subject AND deleted_at IS NULL;
    INSERT INTO set.user_roles (user_id, role_id)
      SELECT v_user, ro.id FROM set.roles ro WHERE ro.role_code = r.role_code AND ro.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM set.user_roles x WHERE x.user_id = v_user AND x.role_id = ro.id AND x.entity_scope IS NULL AND x.deleted_at IS NULL);
  END LOOP;
  -- '5e1d…0006' (viewer) sengaja tanpa peran: hanya melihat objek Dipublikasi.
END $$;
