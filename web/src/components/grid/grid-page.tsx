'use client';
/* Halaman daftar standar dalam gaya mockup: .page-hd (judul + aksi utama) + .card berisi .toolbar (pencarian, saringan, hitungan, aksi baris)
   dan AG Grid bertema table.tbl. Kursor keyset (TanStack useInfiniteQuery; halaman berikut dimuat saat menggulir). Aksi tulis diberikan halaman
   (tulis langsung ke EAP API; izin dan cakupan entitas ditegakkan server) — tombol tanpa izin tampil terkunci 🔒 seperti mockup (lockBtn). */
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ColDef, GridApi } from 'ag-grid-community';
import * as api from '@/lib/api';
import { can } from '@/store/session';
import { toast, useUi } from '@/store/ui';
import { Btn, Callout, DL, Input, PageHd, Select } from '@/components/ui';
import { openDrawer, Drawer } from '@/components/overlay';
import { DataGrid } from './data-grid';
import { t } from '@/lib/i18n';

type Row = api.Row;
export interface Filter { name: string; label: string; options?: (string | [string, string])[]; value?: string }
export interface RowAction { label?: string; perm?: string; run: (row: Row) => void }
export interface PageAction { label: string; perm?: string; variant?: 'pri'; run: (ctx: { query: api.Query; reload: () => void }) => void }

export interface GridSpec {
  title: string;
  description?: React.ReactNode;
  notice?: React.ReactNode;
  path?: string;
  query?: api.Query;
  /** Respons berupa array/semua baris sekaligus (tanpa kursor). */
  all?: boolean;
  load?: (cursor: string | null, query: api.Query, signal: AbortSignal) => Promise<api.Page | Row[]>;
  deps?: unknown[];
  columns: ColDef<Row>[];
  filters?: Filter[];
  /** Placeholder pencarian sisi server (parameter q). Tanpa ini, kotak cari = saring cepat atas baris termuat. */
  search?: string;
  /** Saringan sisi klien atas baris termuat (untuk saringan yang tidak didukung API). */
  rowFilter?: (row: Row) => boolean;
  /** Elemen di awal toolbar (mis. chip saringan seperti mockup). */
  toolbarLead?: React.ReactNode;
  /** Terapkan konteks entitas header sebagai ?entityId= (hanya untuk daftar yang mendukungnya). */
  entityParam?: boolean;
  /** Pasangan label → nilai untuk drawer Detail bawaan. */
  detail?: (row: Row) => (readonly [React.ReactNode, React.ReactNode] | false | null | undefined)[];
  DetailExtra?: React.ComponentType<{ row: Row; close: () => void }>;
  /** Dirender di atas daftar definisi (mis. siklus status). */
  DetailTop?: React.ComponentType<{ row: Row; close: () => void }>;
  /** Tombol tambahan di kaki drawer menurut baris (mis. transisi status). run() dipanggil tanpa menutup drawer. */
  rowActions?: (row: Row, close: () => void) => (RowAction & { variant?: 'pri' | 'danger' })[];
  /** Mengganti drawer Detail bawaan. */
  onDetail?: (row: Row) => void;
  titleOf?: (row: Row) => string;
  edit?: RowAction;
  remove?: RowAction;
  /** Aksi utama di kepala halaman (mis. "+ Daftarkan Aplikasi"). */
  create?: PageAction;
  /** Aksi tambahan di kepala halaman. */
  actions?: PageAction[];
  exportName?: string;
  emptyText?: string;
  rowId?: (r: Row) => string;
  limit?: number;
}

/** Tombol bergembok bila peran tidak berizin (mockup: lockBtn → 403 tercatat). */
function Gated({ perm, label, variant, onClick, sm }: { perm?: string; label: string; variant?: 'pri' | 'danger'; onClick: () => void; sm?: boolean }) {
  if (!perm || can(perm)) return <Btn variant={variant} sm={sm} onClick={onClick}>{label}</Btn>;
  return (
    <Btn variant={variant} sm={sm} aria-disabled="true" title={t('Butuh izin {0}', perm)} style={{ opacity: 0.55 }}
      onClick={() => toast(t('403 — Akses ditolak'), t('Peran Anda tidak memiliki izin {0}.', perm), 'error')}><span className="lock">🔒</span>{label}</Btn>
  );
}

export function GridPage(spec: GridSpec) {
  const sp = useSearchParams();
  const entity = useUi((s) => s.entity);
  const [query, setQuery] = React.useState<api.Query>(() => {
    const q: api.Query = { ...(spec.query || {}) };
    (spec.filters || []).forEach((f) => { const v = sp.get(f.name) ?? f.value; if (v) q[f.name] = v; });
    return q;
  });
  const [text, setText] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const gridApi = React.useRef<GridApi<Row> | null>(null);

  React.useEffect(() => { const id = setTimeout(() => setDebounced(text.trim()), 300); return () => clearTimeout(id); }, [text]);
  const effective: api.Query = { ...query, ...(spec.entityParam && entity ? { entityId: entity } : {}), ...(spec.search && debounced ? { q: debounced } : {}) };

  const q = useInfiniteQuery({
    queryKey: ['grid', spec.path || spec.title, effective, ...(spec.deps || [])],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const r = spec.load ? await spec.load(pageParam, effective, signal)
        : spec.all ? await api.get(spec.path!, effective, { signal }) : await api.page(spec.path!, effective, pageParam, spec.limit || 100, signal);
      const p = Array.isArray(r) ? { data: r, next_cursor: null } : { data: r.data || [], next_cursor: r.next_cursor ?? r.nextCursor ?? null };
      return p as { data: Row[]; next_cursor: string | null };
    },
    getNextPageParam: (last) => last.next_cursor || undefined,
  });
  const rows = React.useMemo(() => { const all = q.data?.pages.flatMap((p) => p.data) || []; return spec.rowFilter ? all.filter(spec.rowFilter) : all; }, [q.data, spec.rowFilter]);
  const reload = () => { q.refetch(); };

  const openDetail = (row: Row) => {
    if (spec.onDetail) return spec.onDetail(row);
    const pairs = spec.detail ? spec.detail(row) : spec.columns.filter((c) => c.headerName).map((c) => [c.headerName, displayValue(c, row)] as const);
    const Extra = spec.DetailExtra; const Top = spec.DetailTop;
    openDrawer((close) => (
      <Drawer close={close} title={spec.titleOf ? spec.titleOf(row) : row.nama || row.name || row.title || row.kode || row.code || t('Detail')} sub={row.kode || row.code || row.adrCode}
        footer={<>
          {spec.rowActions ? spec.rowActions(row, close).map((a) => <Gated key={a.label} perm={a.perm} label={a.label || ''} variant={a.variant} onClick={() => a.run(row)} />) : null}
          {spec.edit ? <Gated perm={spec.edit.perm} label={spec.edit.label || t('Ubah')} onClick={() => { close(); spec.edit!.run(row); }} /> : null}
          {spec.remove ? <Gated perm={spec.remove.perm} label={spec.remove.label || t('Hapus')} variant="danger" onClick={() => { close(); spec.remove!.run(row); }} /> : null}
        </>}>
        {Top ? <div className="mb"><Top row={row} close={close} /></div> : null}
        <DL pairs={pairs} />
        {Extra ? <div className="mt"><Extra row={row} close={close} /></div> : null}
      </Drawer>
    ));
  };

  const exportCsv = () => gridApi.current?.exportDataAsCsv({ fileName: `${spec.exportName || 'data'}.csv`, columnSeparator: ';', bom: true, onlySelected: (gridApi.current?.getSelectedRows().length ?? 0) > 0 } as any);
  const acts = (
    <>
      {(spec.actions || []).map((a) => <Gated key={a.label} perm={a.perm} label={a.label} variant={a.variant} onClick={() => a.run({ query, reload })} />)}
      {spec.create ? <Gated perm={spec.create.perm} label={spec.create.label} variant="pri" onClick={() => spec.create!.run({ query, reload })} /> : null}
    </>
  );
  const count = q.isPending ? null : `${rows.length}${q.hasNextPage ? '+' : ''}`;

  return (
    <>
      <PageHd title={spec.title} sub={spec.description} acts={acts} />
      {spec.notice ? <div className="mb"><Callout tone="info">{spec.notice}</Callout></div> : null}
      <section className="card">
        <div className="toolbar">
          {spec.toolbarLead}
          <div className="search"><Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={spec.search || t('Saring baris termuat…')} aria-label={t('Cari')} /></div>
          {(spec.filters || []).map((f) => (
            <Select key={f.name} aria-label={f.label} value={String(query[f.name] ?? '')} onChange={(e) => setQuery((s) => ({ ...s, [f.name]: e.target.value || undefined }))}>
              <option value="">{f.label}</option>
              {(f.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
            </Select>
          ))}
          <span className="count" aria-live="polite">{count == null ? t('Memuat…') : t('{0} entri', count)}{q.isFetching && count != null ? ' ↻' : ''}</span>
          <Btn sm variant="ghost" onClick={reload} aria-label={t('Muat ulang')} title={t('Muat ulang')}>↻</Btn>
          <Btn sm variant="ghost" disabled={!rows.length} onClick={exportCsv} title={t('Ekspor CSV')}>⇩ CSV</Btn>
        </div>
        {q.isError ? (
          <div className="card-bd"><Callout tone="err">{api.explain(q.error)} <Btn sm onClick={reload}>{t('Coba lagi')}</Btn></Callout></div>
        ) : (
          <div className="card-bd flush gridbox">
            <DataGrid<Row>
              skeleton={q.isPending}
              rows={rows} columns={spec.columns} emptyText={spec.emptyText} rowId={spec.rowId}
              quickFilter={spec.search ? undefined : text}
              loading={q.isFetchingNextPage}
              onOpen={openDetail}
              onNearEnd={() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }}
              onReady={(a) => { gridApi.current = a; }}
            />
          </div>
        )}
      </section>
    </>
  );
}

/** Nilai tampilan kolom untuk drawer Detail bawaan (valueGetter/valueFormatter/field). */
function displayValue(c: ColDef<Row>, row: Row): React.ReactNode {
  let v: unknown = typeof c.valueGetter === 'function' ? (c.valueGetter as any)({ data: row }) : c.field ? row[c.field as string] : undefined;
  if (typeof c.valueFormatter === 'function') v = (c.valueFormatter as any)({ value: v, data: row });
  if (typeof c.cellRenderer === 'function') return (c.cellRenderer as any)({ value: v, data: row });
  return v == null || v === '' ? '—' : String(v);
}
