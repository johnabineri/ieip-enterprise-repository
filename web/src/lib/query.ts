'use client';
/* TanStack Query: klien tunggal + lookup ter-cache (dimuat sekali per sesi, [] bila tidak berhak). */
import { QueryClient, useQuery } from '@tanstack/react-query';
import * as api from './api';
import { can } from '@/store/session';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof api.ApiError && e.status >= 400 && e.status < 500) && n < 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

/** Muat ulang semua daftar grid & detail setelah perubahan data (lookup ikut bila `lookups`). */
export function invalidateData(lookups = false) {
  queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' && (lookups || q.queryKey[0] !== 'lookup') });
}

export type LookupMap = Map<string, api.Row> & { rows: api.Row[] };
/** Lookup EAP: entitas (ref.business_groups lewat eaw.entity_org) sebagai peta id → baris. */
const SRC = {
  entities: ['/api/v1/eaw/entity-org', 'eaw.org.read'],
} as const;
export type LookupName = keyof typeof SRC;

const toMap = (rows: api.Row[]): LookupMap => { const m = new Map(rows.map((r) => [r.id, r])) as LookupMap; m.rows = rows; return m; };
const lookupOpts = (name: LookupName) => ({
  queryKey: ['lookup', name],
  queryFn: async () => { const [path, perm] = SRC[name]; return toMap(can(perm) ? await api.all(path).catch(() => []) : []); },
  staleTime: Infinity,
});
/** Imperatif (handler, kolom): const en = await lookup('entities'). */
export const lookup = (name: LookupName) => queryClient.fetchQuery(lookupOpts(name));
export async function lookups<N extends LookupName>(...names: N[]): Promise<Record<N, LookupMap>> {
  const maps = await Promise.all(names.map(lookup));
  return Object.fromEntries(names.map((n, i) => [n, maps[i]])) as Record<N, LookupMap>;
}
/** Hook: peta kosong selama memuat. */
const EMPTY = toMap([]);
export function useLookup(name: LookupName): LookupMap { return useQuery(lookupOpts(name)).data || EMPTY; }

export const codeOf = (map: LookupMap, id?: string | null) => (id ? (map.get(id) || {}).code || String(id).slice(0, 8) : '—');
export const nameOf = (map: LookupMap, id?: string | null) => {
  const r = id ? map.get(id) : undefined;
  return r ? r.name || r.code : id ? String(id).slice(0, 8) : '—';
};
export type Opt = [string, string];
/** Pilihan select dari lookup: [[id, 'KODE · nama']]. */
export const options = (map: LookupMap, { blank, label }: { blank?: string; label?: (r: api.Row) => string } = {}): Opt[] =>
  (blank != null ? [['', blank] as Opt] : []).concat(map.rows.map((r) => [r.id, label ? label(r) : [r.code, r.name].filter(Boolean).join(' · ')] as Opt));
