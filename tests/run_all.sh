#!/usr/bin/env bash
# =====================================================================
# run_all.sh : runner pengujian integrasi database EAP (kalla_eap)
# Berurutan:
#   1) membuat database uji bersih (kalla_eap_test; DROP + CREATE!)
#   2) database/*.sql urut nomor (DDL 0xx-2xx, seed 9xx) — seed dijalankan DUA kali (idempotensi)
#   3) migrations/*.sql (mis. view eaw.entity_org, ADR-CMP-003)
#   4) tests/*.test.sql dengan ON_ERROR_STOP=1 (asersi = blok DO yang melempar galat)
#   5) scripts/pii_guard.sh (D-14)
# Pemakaian (butuh PostgreSQL 15+ dan superuser):  PGHOST=localhost PGUSER=postgres ./tests/run_all.sh
# Kode keluar 0 = semua lulus.
# =====================================================================
set -u
DB="${TEST_DB:-kalla_eap_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PSQL="psql -X -v ON_ERROR_STOP=1"
pass=0; fail=0; failed=""

run_sql() { # $1=file $2=label
    if $PSQL -d "$DB" -q -f "$1" 2>&1; then echo "PASS  $2"; pass=$((pass + 1))
    else echo "FAIL  $2"; fail=$((fail + 1)); failed="$failed $2"; fi
}

echo "== siapkan basis data $DB =="
$PSQL -d "${PGDATABASE:-postgres}" -q \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" \
  || { echo "Gagal menyiapkan basis data $DB — periksa PGHOST/PGUSER/PGPASSWORD." >&2; exit 1; }

echo "== DDL =="
for f in $(ls "$ROOT/database" | grep -E '^[0-8][0-9][0-9]_.*\.sql$' | sort); do run_sql "$ROOT/database/$f" "ddl/$f"; done
echo "== seed (dua kali) =="
for n in 1 2; do for f in $(ls "$ROOT/database" | grep -E '^9[0-9][0-9]_.*\.sql$' | sort); do run_sql "$ROOT/database/$f" "seed$n/$f"; done; done
echo "== migrasi =="
for f in $(ls "$ROOT/migrations" | grep -E '\.sql$' | sort); do run_sql "$ROOT/migrations/$f" "migrasi/$f"; done
echo "== asersi =="
for t in "$HERE"/*.test.sql; do run_sql "$t" "$(basename "$t")"; done
echo "== pii-guard =="
if EAP_DB="$DB" bash "$ROOT/scripts/pii_guard.sh"; then echo "PASS  pii_guard.sh"; pass=$((pass + 1)); else echo "FAIL  pii_guard.sh"; fail=$((fail + 1)); failed="$failed pii_guard.sh"; fi

echo; echo "ringkasan: $pass pass, $fail fail"
if [ "$fail" -gt 0 ]; then echo "gagal:$failed" >&2; exit 1; fi
exit 0
