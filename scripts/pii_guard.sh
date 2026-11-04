#!/usr/bin/env bash
# =============================================================================
# pii_guard.sh — gate CI EAP (D-14, SRS 8.2): GAGAL bila skema milik EAP memuat kolom bernuansa PII.
# Skema `ref` (replika CMP) dikecualikan — isinya dibatasi publikasi pub_cmp_ref di sumbernya.
# Pemakaian:  EAP_DB=kalla_eap ./scripts/pii_guard.sh
# =============================================================================
set -euo pipefail
EAP_DB="${EAP_DB:-kalla_eap}"
PSQL="${PSQL:-psql}"
BAD=$("$PSQL" -X -q -A -t -d "$EAP_DB" -c "
  SELECT table_schema || '.' || table_name || '.' || column_name
    FROM information_schema.columns
   WHERE table_schema IN ('set','eaw','gse','console','shared')
     AND column_name ~* '^(e_?mail|full_?name|nama_lengkap|nik|ktp|phone|telp|telepon|no_?hp|handphone|address|alamat|birth|tgl_lahir|tanggal_lahir|npwp)'
   ORDER BY 1;" | tr -d '\r')
if [ -n "$BAD" ]; then
  echo "GAGAL pii-guard: kolom PII terlarang di database $EAP_DB (D-14):" >&2
  echo "$BAD" | sed 's/^/  - /' >&2
  exit 1
fi
echo "pii-guard OK: tidak ada kolom PII di skema set/eaw/gse/console/shared ($EAP_DB)"
