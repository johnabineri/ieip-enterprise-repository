import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { DbService } from '../db/db.service';
import { ecosystemOf } from './ecosystem';

/**
 * Redundancy & Drift Monitor + KPI Ekosistem (dashboard EAW). SEMUA angka dihitung dari data nyata dan MENGIKUTI RLS pemanggil — tidak ada angka karangan.
 * Batas jujur: (1) redundansi = kemiripan leksikal pg_trgm nama aplikasi (heuristik deterministik, BUKAN model MIND AI); (2) tidak ada pemindai Git/APISIX,
 * jadi "shadow IT" dan "endpoint tanpa kontrak di gateway" TIDAK terdeteksi (dilaporkan di `notCovered`); (3) KPI tanpa sumber data nyata
 * (akurasi deteksi/guardrail butuh data berlabel, akun per karyawan butuh Keycloak, zero local master butuh pemindai skema) dikembalikan
 * `value:null` + `reason`, bukan diisi. Interpretasi rumus KPI adalah milik kami — dokumen PRD §15 tidak ada di workspace ini.
 */
@Controller('api/v1/eaw')
export class EcosystemController {
  constructor(private readonly db: DbService) {}

  @Get('ecosystem') @RequirePermission('eaw.catalog.read')
  ecosystem(@CurrentUser() p: Principal) {
    return this.db.tx(p, (c) => ecosystemOf(c));
  }
}
