import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { DbService } from '../db/db.service';

/** Urutan 6 domain SAORAJA (D1–D6) → jenis objek EAW. */
const DOMAIN_TYPES = ['process', 'data_entity', 'service', 'application', 'infra_asset', 'control'] as const;
type DomainType = (typeof DOMAIN_TYPES)[number];
interface Item { id: string; label: string; status: string | null; tipe: string }
interface Workspace { id: string; kode: string; nama: string; status: string; mode: string | null; objects: Record<DomainType, Item[]> }

const MAX_RELATIONS = 5000;

/**
 * Repository per platform (fokus satu platform): Platform → Workspace → 6 Domain → objek.
 * Objek sebuah workspace = objek yang BERELASI LANGSUNG dengannya (relasi kanonik sumber = aplikasi, EAW-05); di D4 workspace itu sendiri
 * ikut dicantumkan (tipe 'workspace') beserta integrasi ke aplikasi lain. Objek yang hanya terhubung lewat objek lain (mis. proses → entitas data)
 * tidak ditarik — gunakan Lineage & Impact untuk penelusuran berantai. Mengikuti RLS pemanggil: objek di luar cakupan tidak muncul
 * (label null → dilewati), dan jumlah tidak pernah mencakup yang tidak terlihat. Tanpa data contoh (Zero Pre-Seed).
 */
@Controller('api/v1/eaw')
export class RepositoryController {
  constructor(private readonly db: DbService) {}

  @Get('repository') @RequirePermission('eaw.catalog.read')
  repository(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const apps = (await c.query(
        `SELECT id, kode, nama, status, jenis_node, platform, workspace_mode FROM eaw.application WHERE deleted_at IS NULL ORDER BY kode`)).rows;
      const rels = (await c.query(
        `SELECT r.sumber_id, r.target_type, r.target_id, r.tipe, eaw.object_label(r.target_type, r.target_id) AS label, eaw.object_status(r.target_type, r.target_id) AS status
           FROM eaw.relation r WHERE r.deleted_at IS NULL AND r.sumber_type = 'application' AND r.target_type = ANY($1::text[]) ORDER BY label, r.id LIMIT ${MAX_RELATIONS}`,
        [DOMAIN_TYPES as unknown as string[]])).rows;

      const empty = () => Object.fromEntries(DOMAIN_TYPES.map((t) => [t, [] as Item[]])) as Record<DomainType, Item[]>;
      const ws = new Map<string, Workspace>();
      for (const a of apps) {
        if (a.jenis_node !== 'workspace') continue;
        const w: Workspace = { id: a.id, kode: a.kode, nama: a.nama, status: a.status, mode: a.workspace_mode, objects: empty() };
        w.objects.application.push({ id: a.id, label: `${a.kode} · ${a.nama}`, status: a.status, tipe: 'workspace' });
        ws.set(a.id, w);
      }
      for (const r of rels) {
        const w = ws.get(r.sumber_id);
        if (!w || r.label == null) continue;                                    // sumber bukan workspace / objek target di luar cakupan RLS
        w.objects[r.target_type as DomainType].push({ id: r.target_id, label: r.label, status: r.status, tipe: r.tipe });
      }
      const placed = (kode: string) => [...ws.values()].filter((w) => apps.find((a: any) => a.id === w.id)?.platform === kode);
      const platforms = apps.filter((a: any) => a.jenis_node === 'platform')
        .map((a: any) => ({ id: a.id, kode: a.kode, nama: a.nama, status: a.status, workspaces: placed(a.kode) }));
      const unplaced = [...ws.values()].filter((w) => !apps.find((a: any) => a.id === w.id)?.platform);
      return { domains: DOMAIN_TYPES, platforms, unplaced, truncated: rels.length >= MAX_RELATIONS };
    });
  }
}
