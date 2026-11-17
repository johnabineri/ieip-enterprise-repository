'use client';
/* AG Grid Community dengan tema yang MENYAMAI table.tbl mockup (header 11px kapital 700 muted di atas surface-2, sel 13px, garis bawah border,
   hover surface-2, baris terpilih accent-soft). Warna dari token CSS mockup (var(--…)) sehingga terang/gelap ikut tema. klik baris/Enter = Detail (mockup: tr.click). Gaya tambahan (huruf kapital header dsb.) ada di app.css (.gridbox). */
import * as React from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type GridReadyEvent, type RowClickedEvent } from 'ag-grid-community';
import { Skel } from '@/components/ui';
import { t } from '@/lib/i18n';

ModuleRegistry.registerModules([AllCommunityModule]);

export const gridTheme = themeQuartz.withParams({
  fontFamily: 'inherit',
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 700,
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--text)',
  headerBackgroundColor: 'var(--surface-2)',
  headerTextColor: 'var(--muted)',
  borderColor: 'var(--border)',
  rowHoverColor: 'var(--surface-2)',
  selectedRowBackgroundColor: 'var(--accent-soft)',
  accentColor: 'var(--accent)',
  oddRowBackgroundColor: 'transparent',
  rowHeight: 39,
  headerHeight: 36,
  cellHorizontalPadding: 12,
  columnBorder: false,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
});

const LOCALE = {
  noRowsToShow: t('Tidak ada data.'), loadingOoo: t('Memuat…'), page: t('Halaman'), of: t('dari'), to: t('sampai'), selectAll: t('Pilih semua'), selectAllSearchResults: t('Pilih semua hasil'),
  pinColumn: t('Sematkan kolom'), autosizeThisColumn: t('Ukur otomatis kolom ini'), resetColumns: t('Atur ulang kolom'),
  sortAscending: t('Urut naik'), sortDescending: t('Urut turun'), sortUnSort: t('Hapus urutan'), columns: t('Kolom'),
};

export interface DataGridProps<T> {
  rows: T[];
  columns: ColDef<T>[];
  loading?: boolean;
  emptyText?: string;
  quickFilter?: string;
  rowId?: (r: T) => string;
  onSelect?: (r: T | null) => void;
  onSelectMany?: (rows: T[]) => void;
  onOpen?: (r: T) => void;
  /** Dipanggil saat baris terakhir hampir terlihat (muat halaman kursor berikutnya). */
  onNearEnd?: () => void;
  onReady?: (api: GridApi<T>) => void;
  /** Skeleton baris saat pertama kali memuat. */
  skeleton?: boolean;
}

export function GridSkeleton({ cols = 6, rows = 10 }: { cols?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={t('Memuat data')}>
      <div className="row" style={{ height: 36, padding: '0 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap', gap: 16 }}>
        {Array.from({ length: cols }).map((_, i) => <Skel key={i} h={10} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ height: 39, padding: '0 12px', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap', gap: 16 }}>
          {Array.from({ length: cols }).map((_, c) => <Skel key={c} h={11} w={`${55 + ((r * 13 + c * 29) % 45)}%`} />)}
        </div>
      ))}
    </div>
  );
}

export function DataGrid<T>({ rows, columns, loading, emptyText, quickFilter, rowId, onSelect, onSelectMany, onOpen, onNearEnd, onReady, skeleton }: DataGridProps<T>) {
  const apiRef = React.useRef<GridApi<T> | null>(null);
  const nearEnd = React.useRef(onNearEnd); nearEnd.current = onNearEnd;
  const check = React.useCallback(() => {
    const a = apiRef.current; if (!a || a.isDestroyed() || !nearEnd.current) return;
    const n = a.getDisplayedRowCount();
    if (n && a.getLastDisplayedRowIndex() >= n - 15) nearEnd.current();
  }, []);
  React.useEffect(() => { check(); }, [rows, check]);

  if (skeleton) return <GridSkeleton cols={Math.min(columns.length || 5, 7)} />;
  return (
    <AgGridReact<T>
      theme={gridTheme}
      rowData={rows}
      columnDefs={columns}
      defaultColDef={{ sortable: true, resizable: true, minWidth: 70, flex: 1, filter: false, suppressHeaderMenuButton: true }}
      getRowId={rowId ? (p) => rowId(p.data) : (p) => String((p.data as any).id ?? JSON.stringify(p.data))}
      quickFilterText={quickFilter}
      loading={loading}
      overlayNoRowsTemplate={`<span class="muted">${(emptyText || t('Tidak ada data.')).replace(/[<>&]/g, '')}</span>`}
      localeText={LOCALE}
      animateRows={false}
      suppressCellFocus={false}
      enableCellTextSelection
      ensureDomOrder
      onGridReady={(e: GridReadyEvent<T>) => { apiRef.current = e.api; onReady?.(e.api); }}
      onRowClicked={(e: RowClickedEvent<T>) => { if (e.data) { onSelect?.(e.data); onOpen?.(e.data); } }}
      onCellKeyDown={(e) => { const k = (e.event as KeyboardEvent | undefined)?.key; if (k === 'Enter' && e.data) onOpen?.(e.data); }}
      onBodyScrollEnd={check}
      onModelUpdated={check}
    />
  );
}
