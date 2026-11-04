#!/usr/bin/env bash
# =============================================================================
# cross_check_shared.sh — Gate CI EAP
# Kebutuhan: PRD EAP NFR-18 · cmp/DATABASE-REVIEW.md ADR-CMP-004 (checklist #18)
#
# Memverifikasi struktur tabel modul `shared` (audit_logs, documents, outbox)
# IDENTIK antara database EAP dan database CMP — nama tabel, nama kolom, tipe
# data, dan nullability.
#
# Parameter fungsi apply_standard() DIKECUALIKAN dari pengecekan ini karena
# memang berbeda per platform (p_user_table: 'set.users' di EAP, 'iam.users'
# di CMP) — lihat ADR-CMP-004 rekomendasi 1 & 2.
#
# GAGAL (exit 1) bila ada satu pun perbedaan struktur.
#
# Pemakaian:
#   EAP_DB=kalla_eap CMP_DB=kalla_cmp ./scripts/cross_check_shared.sh
#   EAP_DB=kalla_eap_test CMP_DB=kalla_cmp_test ./scripts/cross_check_shared.sh
# =============================================================================
set -euo pipefail

EAP_DB="${EAP_DB:-kalla_eap}"
CMP_DB="${CMP_DB:-kalla_cmp}"
SCHEMA="${SHARED_SCHEMA:-shared}"
PSQL="${PSQL:-psql}"
# Tabel yang dibandingkan (rujukan ADR-CMP-004 rekomendasi 3)
TABLES="${SHARED_TABLES:-audit_logs documents outbox}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Catatan: psql di Windows mengeluarkan CRLF — buang CR agar diff andal.
q() { # q <db> <sql>
  "$PSQL" -X -q -A -F$'\t' -t -v ON_ERROR_STOP=1 -d "$1" -c "$2" | tr -d '\r'
}

dump() { # dump <db> <out>
  q "$1" "
    SELECT c.relname || '.' || a.attname
            || E'\t' || format_type(a.atttypid, a.atttypmod)
            || E'\t' || CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END
    FROM pg_attribute a
    JOIN pg_class     c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = '$SCHEMA'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND c.relkind = 'r'
    ORDER BY 1;" > "$2"
}

echo "=================================================================="
echo " cross_check_shared.sh"
echo "   EAP : $EAP_DB"
echo "   CMP : $CMP_DB"
echo "   modul: $SCHEMA  ($TABLES)"
echo "   catatan: parameter apply_standard() tidak dibandingkan (ADR-CMP-004)"
echo "=================================================================="

for db in "$EAP_DB" "$CMP_DB"; do
  if ! "$PSQL" -X -q -A -t -d "$db" -c "SELECT 1" >/dev/null 2>&1; then
    echo "GAGAL: tidak dapat terhubung ke database '$db'" >&2
    exit 1
  fi
done

dump "$EAP_DB" "$TMP/eap"
dump "$CMP_DB" "$TMP/cmp"

if [ ! -s "$TMP/eap" ]; then
  echo "GAGAL: skema '$SCHEMA' tidak ada di $EAP_DB" >&2
  exit 1
fi
if [ ! -s "$TMP/cmp" ]; then
  echo "GAGAL: skema '$SCHEMA' tidak ada di $CMP_DB" >&2
  exit 1
fi

FAIL=0

# --- 1. Kehadiran tabel ------------------------------------------------------
echo
echo "--- [1] Kehadiran tabel modul shared (harus sama) ---"
for t in $TABLES; do
  IN_EAP=$(grep -c "^$t\." "$TMP/eap" || true)
  IN_CMP=$(grep -c "^$t\." "$TMP/cmp" || true)
  if [ "$IN_EAP" -gt 0 ] && [ "$IN_CMP" -gt 0 ]; then
    echo "  OK     $t"
  elif [ "$IN_EAP" -eq 0 ] && [ "$IN_CMP" -eq 0 ]; then
    echo "  INFO   $t tidak ada di kedua sisi (dilewati)"
  else
    echo "  GAGAL  $t — EAP:$IN_EAP kolom, CMP:$IN_CMP kolom"
    FAIL=1
  fi
done

# --- 2. Perbandingan struktur lengkap ---------------------------------------
echo
echo "--- [2] Perbedaan struktur kolom (nama, tipe, nullability) ---"
if diff -u "$TMP/cmp" "$TMP/eap" > "$TMP/diff" 2>&1; then
  echo "  OK     identik byte-per-byte pada $(wc -l < "$TMP/eap" | tr -d ' ') kolom"
else
  FAIL=1
  # Tampilkan hanya baris +/- (tanpa header diff)
  grep -E '^[+-][^+-]' "$TMP/diff" | sed -e 's/^+/  EAP saja: /' -e 's/^-/  CMP saja: /'
fi

# --- Ringkasan --------------------------------------------------------------
echo
echo "=================================================================="
if [ "$FAIL" -ne 0 ]; then
  echo " HASIL: GAGAL — struktur $SCHEMA.* EAP tidak identik dengan CMP"
  echo " Tindakan: samakan DDL (010_shared.sql adalah sumber kebenaran),"
  echo "           lalu jalankan ulang gate ini (ADR-CMP-004)."
  echo "=================================================================="
  exit 1
fi
echo " HASIL: LULUS — modul $SCHEMA identik di $EAP_DB dan $CMP_DB"
echo "=================================================================="
exit 0
