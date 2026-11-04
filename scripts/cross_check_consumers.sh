#!/usr/bin/env bash
# =============================================================================
# cross_check_consumers.sh — Gate CI EAP
# Kebutuhan: PRD EAP NFR-17 · cmp/DATABASE-REVIEW.md ADR-CMP-005
#
# Membandingkan struktur skema `ref` pada database EAP dengan daftar kolom
# publikasi CDC `pub_cmp_ref` pada database CMP (sumber kebenarannya publikasi).
#
# GAGAL (exit 1) bila:
#   1. Tabel `ref.*` di EAP tidak terdaftar di publikasi  -> tabel yatim
#   2. Kolom terpublikasi hilang dari tabel ref di EAP
#   3. Tipe data kolom berbeda
#   4. Ada kolom tambahan di ref selain yang diizinkan (default: synced_at)
#
# PERINGATAN (tidak menggagalkan): tabel terpublikasi yang belum punya replika
# di EAP. EAP hanya butuh sebagian tabel (ref.users, ref.companies, ref.employees).
#
# Pemakaian:
#   EAP_DB=kalla_eap CMP_DB=kalla_cmp ./scripts/cross_check_consumers.sh
#   EAP_DB=kalla_eap_test CMP_DB=kalla_cmp_test ./scripts/cross_check_consumers.sh
# =============================================================================
set -euo pipefail

EAP_DB="${EAP_DB:-kalla_eap}"
CMP_DB="${CMP_DB:-kalla_cmp}"
PUB="${PUB:-pub_cmp_ref}"
REF_SCHEMA="${REF_SCHEMA:-ref}"
PSQL="${PSQL:-psql}"
# Kolom yang memang diisi sisi pelanggan (bukan dari publikasi)
EXTRA_ALLOWED="${EXTRA_ALLOWED:-synced_at}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Catatan: psql di Windows mengeluarkan CRLF — buang CR agar perbandingan andal.
q() { # q <db> <sql>
  "$PSQL" -X -q -A -F$'\t' -t -v ON_ERROR_STOP=1 -d "$1" -c "$2" | tr -d '\r'
}

echo "=================================================================="
echo " cross_check_consumers.sh"
echo "   EAP : $EAP_DB   (skema $REF_SCHEMA)"
echo "   CMP : $CMP_DB   (publikasi $PUB)"
echo "=================================================================="

# --- 1. Daftar kolom terpublikasi:  tabel kolom <TAB> tipe -------------------
q "$CMP_DB" "
SELECT c.relname || '.' || a.attname || E'\t' || format_type(a.atttypid, a.atttypmod)
FROM pg_publication_rel pr
JOIN pg_publication p ON p.oid = pr.prpubid
JOIN pg_class       c ON c.oid = pr.prrelid
JOIN pg_namespace   n ON n.oid = c.relnamespace
JOIN pg_attribute   a ON a.attrelid = c.oid AND a.attnum = ANY(pr.prattrs)
WHERE p.pubname = '$PUB'
ORDER BY 1;" > "$TMP/pub_cols"

if [ ! -s "$TMP/pub_cols" ]; then
  echo "GAGAL: publikasi '$PUB' tidak ditemukan atau kosong di $CMP_DB" >&2
  exit 1
fi
cut -f1 "$TMP/pub_cols" | cut -d. -f1 | sort -u > "$TMP/pub_tables"

# --- 2. Daftar kolom skema ref di EAP ---------------------------------------
q "$EAP_DB" "
SELECT c.relname || '.' || a.attname || E'\t' || format_type(a.atttypid, a.atttypmod)
FROM pg_attribute a
JOIN pg_class     c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '$REF_SCHEMA' AND a.attnum > 0 AND NOT a.attisdropped
  AND c.relkind IN ('r', 'p')   -- hanya tabel: indeks PK (relkind 'i') bukan tabel yatim
ORDER BY 1;" > "$TMP/ref_cols"

if [ ! -s "$TMP/ref_cols" ]; then
  echo "GAGAL: skema '$REF_SCHEMA' tidak ada atau kosong di $EAP_DB" >&2
  echo "       (jalankan migrasi DDL replika dulu — mdm.generate_ref_ddl())" >&2
  exit 1
fi
cut -f1 "$TMP/ref_cols" | cut -d. -f1 | sort -u > "$TMP/ref_tables"

FAIL=0
WARN=0

# --- 3. Tabel yatim: ada di ref tapi tidak dipublikasikan -------------------
echo
echo "--- [1] Tabel ref tanpa padanan di publikasi (harus kosong) ---"
ORPHANS="$(comm -23 "$TMP/ref_tables" "$TMP/pub_tables")"
if [ -n "$ORPHANS" ]; then
  echo "$ORPHANS" | sed 's/^/  GAGAL  /'
  FAIL=1
else
  echo "  OK     tidak ada tabel yatim"
fi

# --- 4. Kolom & tipe: ref vs publikasi (kecuali synced_at) ------------------
echo
echo "--- [2] Kolom ref yang tidak cocok dengan publikasi (harus kosong) ---"
grep -v "\.${EXTRA_ALLOWED}[[:space:]]" "$TMP/ref_cols" | sort > "$TMP/ref_filtered"
# hanya bandingkan tabel yang memang ada di ref
awk -v t="$TMP/ref_tables" 'BEGIN{while((getline l < t)>0) keep[l]=1} {split($1,a,"."); if(a[1] in keep) print}' "$TMP/pub_cols" | sort > "$TMP/pub_for_ref"

BAD_REF="$(comm -23 "$TMP/ref_filtered" "$TMP/pub_for_ref")"
BAD_PUB="$(comm -13 "$TMP/ref_filtered" "$TMP/pub_for_ref")"

if [ -n "$BAD_REF" ]; then
  echo "$BAD_REF" | sed 's/^/  GAGAL  kolom ref tidak ada di publikasi: /'
  FAIL=1
fi
if [ -n "$BAD_PUB" ]; then
  echo "$BAD_PUB" | sed 's/^/  GAGAL  kolom terpublikasi hilang di ref : /'
  FAIL=1
fi
if [ -z "$BAD_REF" ] && [ -z "$BAD_PUB" ]; then
  echo "  OK     $(wc -l < "$TMP/ref_filtered" | tr -d ' ') kolom cocok (tipe & nama)"
fi

# --- 5. Kolom tambahan di ref selain yang diizinkan -------------------------
echo
echo "--- [3] Kolom tambahan di ref diizinkan hanya: $EXTRA_ALLOWED ---"
EXTRA="$(comm -23 "$TMP/ref_cols" "$TMP/pub_cols" | grep -v "\.${EXTRA_ALLOWED}[[:space:]]" || true)"
if [ -n "$EXTRA" ]; then
  echo "$EXTRA" | sed 's/^/  GAGAL  /'
  FAIL=1
else
  echo "  OK     tidak ada kolom liar"
fi

# --- 6. Tabel terpublikasi tanpa replika di EAP (peringatan) ----------------
echo
echo "--- [4] Tabel terpublikasi belum direplikasi di EAP (peringatan) ---"
MISSING="$(comm -13 "$TMP/ref_tables" "$TMP/pub_tables")"
if [ -n "$MISSING" ]; then
  echo "$MISSING" | sed 's/^/  INFO   /'
  WARN=$(echo "$MISSING" | wc -l | tr -d ' ')
  echo "  ($WARN tabel — wajar bila EAP tidak membutuhkannya)"
else
  echo "  OK     semua tabel terpublikasi sudah direplikasi"
fi

# --- Ringkasan --------------------------------------------------------------
echo
echo "=================================================================="
if [ "$FAIL" -ne 0 ]; then
  echo " HASIL: GAGAL — ref.* di EAP tidak selaras dengan $PUB"
  echo " Tindakan: samakan nama & tipe kolom; jangan ubah publikasi tanpa versi baru"
  echo "            (lihat DATABASE-REVIEW.md ADR-CMP-005)"
  echo "=================================================================="
  exit 1
fi
echo " HASIL: LULUS — $(cut -d. -f1 "$TMP/ref_cols" | sort -u | wc -l | tr -d ' ') tabel, $(wc -l < "$TMP/ref_cols" | tr -d ' ') kolom selaras"
echo "=================================================================="
exit 0
