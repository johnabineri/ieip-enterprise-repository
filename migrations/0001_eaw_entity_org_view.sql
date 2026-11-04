-- ============================================================================
-- MIGRASI 0001 — `eaw.entity_org` menjadi VIEW atas `ref.business_groups`
--
-- Status  : ADR-CMP-003 (cmp/DATABASE-REVIEW.md) — perbatasan EAP vs SEDDI
-- Rumusan : CMP adalah sumber tunggal struktur organisasi (SSOT). EAP tidak
--           menyimpan salinan master `business_groups`; ia membaca replika
--           CDC `ref.business_groups` dan hanya menambahkan ATRIBUT
--           ARSITEKTUR miliknya sendiri (`eaw.entity_org_metadata`).
--
-- Referensi:
--   · cmp/DATABASE-REVIEW.md  ADR-CMP-003 — "jadikan view atas ref.business_groups"
--   · eap/PRD.md §7.3         EAP pemilik registry aplikasi; org structure dari ref
--   · eap/SAF.md §5           `eaw.entity_org` + `eaw.entity_org_metadata`
--   · eap/SRS.md §5.1, §5.3   skema `ref` (replika) dan `eaw`
--   · eap/scripts/cross_check_consumers.sh — gate nama & tipe kolom `ref.*`
--
-- ---------------------------------------------------------------------------
-- KONTRAK YANG DITEGAKKAN
-- ---------------------------------------------------------------------------
-- 1. `eaw.entity_org` adalah READ VIEW  — tidak ada salinan master di EAP.
--    Perubahan di sumber (`ref.business_groups`) langsung terlihat di view.
-- 2. Atribut arsitektur tambahan (kaf_level, ika_level, reference_id, notes,
--    data_classification) tetap milik EAP, di tabel terpisah
--    `eaw.entity_org_metadata` (FK → ref.business_groups.id).
-- 3. Tanpa pembaruan tertulis ke `ref.*` — replika dilindungi trigger
--    `ref.tg_reject_write()` (cmp/database/020_ref.sql) dari platform konsumen.
-- 4. Tanpa FK ke skema milik CMP (tanpa `pg_namespace`); semua FK `entity_id`
--    di skema `eaw` diarahkan ke replika lokal `ref.business_groups`.

-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- [0] Pra-kondisi
-- ---------------------------------------------------------------------------

-- [0.1] Kunci linear: migrasi ini hanya berjalan satu kali per basis data
--       (idempoten; aman diulang)
DO $$
BEGIN
  -- noop; disiapankan untuk kontrol versi di masa depan (tools/versi)
END $$;

-- [0.2] `ref.business_groups` harus sudah tersedia (hasil CDC / publikasi ref)
DO $$
BEGIN
  IF to_regclass('ref.business_groups') IS NULL THEN
    RAISE EXCEPTION
      'ref.business_groups belum ada. Tunggu replika `ref` (CDC dari pub_cmp_ref) terbentuk terlebih dahulu — PRD EAP §7.3.';
  END IF;
END $$;

-- [0.3] ADR-CMP-003 W0/W1: jika tabel otonom `eaw.entity_org` MASIH ADA,
--       migrasi ini BUKAN yang menangani langsung — penyiapan harus manual
DO $$
DECLARE v_kind char;
BEGIN
  SELECT c.relkind INTO v_kind FROM pg_class c WHERE c.oid = to_regclass('eaw.entity_org');
  IF v_kind = 'r' THEN
    RAISE EXCEPTION
      'eaw.entity_org masih berasal dari tabel otonom (bentuk W0/W1). Konversi manual diperlukan: 1) pindahkan kolom `tingkat` ke eaw.entity_org_metadata.kaf_level, 2) cocok kata id dengan mdm.business_groups.id, 3) buang tabelnya, 4) jalankan migrasi ini lagi (ADR-CMP-003 W2).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- [1] Lepas objek lama
--     c) view ad-hoc `eaw.entity_orgs` — dibentuk saat bootstrap sandbox,
--        tidak masuk dokumen; kontrak resmi ADR-CMP-003 = `eaw.entity_org`
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS eaw.entity_orgs;
DROP VIEW IF EXISTS eaw.entity_org;   -- polymorphism guard: never a table (see [0.3])

-- ---------------------------------------------------------------------------
-- [2] VIEW `eaw.entity_org`
--     = replika struktur organisasi (ref) + atribut milik EAW (metadata)
-- ---------------------------------------------------------------------------
-- `g.group_kind` dari CMP ('ecosystem'/'sbu'/'subsidiary'/'business_unit')
-- dipetakan ke istilah arsitektur yang dipakai EAW.
CREATE VIEW eaw.entity_org AS
SELECT
    g.id,
    g.code,
    g.name,
    g.group_kind,
    g.parent_id,
    g.is_active,
    g.row_version,
    g.synced_at,
    COALESCE(m.kaf_level,
              CASE g.group_kind
                   WHEN 'holding'       THEN 'holding'
                   WHEN 'ecosystem'     THEN 'ecosystem'
                   WHEN 'sbu'           THEN 'sbu'
                   WHEN 'subsidiary'    THEN 'sbu'
                   WHEN 'business_unit' THEN 'unit'
              END)::varchar(20)   AS kaf_level,
    (m.id IS NOT NULL)           AS kaf_level_confirmed,
    m.ika_level,
    m.reference_id,
    m.notes,
    m.data_classification
FROM ref.business_groups g
LEFT JOIN eaw.entity_org_metadata m
       ON m.entity_id = g.id
      AND m.deleted_at IS NULL
WHERE g.deleted_at IS NULL;

COMMENT ON VIEW eaw.entity_org IS
  'View read-only: struktur organisasi Kalla Group dari replika ref.business_groups (CDC kalla_cmp.mdm) + atribut arsitektur EAW (eaw.entity_org_metadata). CMP = SSOT (ADR-CMP-003).';

-- ---------------------------------------------------------------------------
-- [3] FK: tidak lagi menunjuk ke `mdm.business_groups` yang milik CMP.
--     Saat replika `ref.business_groups` berbentuk tabel (bentuk produksi),
--     semua FK `entity_id` skema `eaw` diarahkan ke `ref.business_groups`.
--     Saat masih view (bentuk sandbox: ref view atas mdm), FK dibiarkan
--     menunjuk tabel dasarnya — PG tidak menerima FK ke view.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_kind   char;
  v_row    record;
  v_new    text;
  v_n      int := 0;
BEGIN
  v_kind := (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass('ref.business_groups'));

  IF v_kind IS NULL THEN
    RAISE NOTICE '[FK] ref.business_groups tidak ada — FK dibiarkan';
  ELSIF v_kind <> 'r' THEN
    RAISE NOTICE
      '[FK] ref.business_groups masih VIEW — FK tetap menunjuk tabel dasar (base table). Jalankan ulang migrasi ini setelah replika ref berbentuk tabel.';
  ELSE
    FOR v_row IN
      SELECT c.conname,
             c.conrelid::regclass::text          AS src,
             pg_get_constraintdef(c.oid, false)  AS def
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = to_regclass('mdm.business_groups')
    LOOP
      v_new := replace(v_row.def, 'mdm.business_groups', 'ref.business_groups');
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %s', v_row.src, quote_ident(v_row.conname));
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', v_row.src, v_row.conname, v_new);
      v_n := v_n + 1;
    END LOOP;
    RAISE NOTICE '[FK] % constraint di skema eaw dipindah ke ref.business_groups', v_n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- [4] Verifikasi keberhasilan migrasi
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_view_rows bigint;
  v_n_yatim   bigint;
  v_relkind   char;
BEGIN
  SELECT c.relkind INTO v_relkind FROM pg_class c WHERE c.oid = to_regclass('eaw.entity_org');
  IF v_relkind <> 'v' THEN
    RAISE EXCEPTION 'eaw.entity_org bukan view (relkind=%) — migrasi gagal', COALESCE(v_relkind::text, '?');
  END IF;

  EXECUTE 'SELECT count(*) FROM eaw.entity_org' INTO v_view_rows;
  RAISE NOTICE '[verifikasi] eaw.entity_org : % baris', v_view_rows;

  SELECT count(*) INTO v_n_yatim
  FROM eaw.entity_org_metadata m
  WHERE NOT EXISTS (SELECT 1 FROM ref.business_groups g WHERE g.id = m.entity_id);
  IF v_n_yatim > 0 THEN
    RAISE WARNING '[verifikasi] eaw.entity_org_metadata: % baris tidak ada padanannya di ref.business_groups', v_n_yatim;
  ELSE
    RAISE NOTICE '[verifikasi] eaw.entity_org_metadata : 0 baris yatim (semua entity_id ada di ref.business_groups)';
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- [5] Setelah migrasi dijalankan, verifikasi otomatis yang diperintahkan
--     oleh dokumen:
--
--       bash scripts/cross_check_shared.sh     (PRD EAP NFR-18, ADR-CMP-004)
--       bash scripts/cross_check_consumers.sh  (PRD EAP NFR-17, ADR-CMP-005)
--
--     Kedua gate harus LULUS sebelum ADR-CMP-003 dinyatakan ✅.
-- ---------------------------------------------------------------------------
