#!/usr/bin/env bash
# =============================================================================
# cross_check_shared.sh — Gate CI EAP
# Kebutuhan: PRD EAP NFR-18 · cmp/DATABASE-REVIEW.md ADR-CMP-004 (checklist #18)
#
# Memverifikasi struktur tabel modul `shared` (audit_logs, documents, outbox)
# IDENTIK antara database EAP dan database CMP — nama tabel, nama kolom, tipe
# data, dan nullability — DAN isi setiap fungsi yang didefinisikan di
# 010_shared.sql (md5 pg_get_functiondef; mis. outbox_claim/tg_outbox). Fungsi
# shared tambahan yang khusus satu platform (mis. CMP is_privileged_role) tidak
# dibandingkan. Tanpa bagian [3], perbaikan fungsi bersama yang hanya diterapkan
# di satu DB tidak akan pernah terdeteksi.
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

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_SQL="${SHARED_SQL:-$HERE/../database/010_shared.sql}"
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

# --- 3. Isi fungsi bersama (010_shared.sql) ---------------------------------
echo
echo "--- [3] Isi fungsi shared dari 010_shared.sql (harus identik) ---"
FUNCS="$(grep -oE 'CREATE (OR REPLACE )?FUNCTION shared\.[a-z_0-9]+' "$SHARED_SQL" | sed 's/.*shared\.//' | sort -u | paste -sd, -)"
if [ -z "$FUNCS" ]; then
  echo "  GAGAL  tidak ada fungsi terbaca dari $SHARED_SQL"; FAIL=1
else
  for side in eap cmp; do
    db="$EAP_DB"; [ "$side" = cmp ] && db="$CMP_DB"
    q "$db" "SELECT p.oid::regprocedure::text || E'	' || md5(pg_get_functiondef(p.oid))
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = '$SCHEMA' AND p.proname = ANY (string_to_array('$FUNCS', ','))
             ORDER BY 1;" > "$TMP/fn_$side"
  done
  NEXP=$(echo "$FUNCS" | tr ',' '
' | wc -l | tr -d ' ')
  if diff -u "$TMP/fn_cmp" "$TMP/fn_eap" > "$TMP/fndiff" 2>&1 && [ "$(cut -f1 "$TMP/fn_eap" | sed 's/(.*//' | sort -u | wc -l | tr -d ' ')" -eq "$NEXP" ]; then
    echo "  OK     $(wc -l < "$TMP/fn_eap" | tr -d ' ') fungsi identik ($NEXP nama dari $(basename "$SHARED_SQL"))"
  else
    FAIL=1
    grep -E '^[+-][^+-]' "$TMP/fndiff" | cut -f1 | sed -e 's/^+/  BEDA (versi EAP): /' -e 's/^-/  BEDA (versi CMP): /'
    for f in $(echo "$FUNCS" | tr ',' ' '); do
      grep -q "^shared\.$f(" "$TMP/fn_eap" || echo "  HILANG di EAP: shared.$f"
      grep -q "^shared\.$f(" "$TMP/fn_cmp" || echo "  HILANG di CMP: shared.$f"
    done
  fi
fi

# --- Ringkasan --------------------------------------------------------------
echo
echo "=================================================================="
if [ "$FAIL" -ne 0 ]; then
  echo " HASIL: GAGAL — struktur/fungsi $SCHEMA.* EAP tidak identik dengan CMP"
  echo " Tindakan: samakan DDL (010_shared.sql adalah sumber kebenaran),"
  echo "           lalu jalankan ulang gate ini (ADR-CMP-004)."
  echo "=================================================================="
  exit 1
fi
echo " HASIL: LULUS — modul $SCHEMA identik di $EAP_DB dan $CMP_DB"
echo "=================================================================="
exit 0
