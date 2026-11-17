'use client';
/* Pembuat kolom AG Grid yang konsisten dengan sel table.tbl mockup (lencana .badge, tag .tag, angka rata kanan, mono). valueGetter = nilai teks
   (saring cepat, urut, ekspor CSV); cellRenderer = tampilan React. */
import * as React from 'react';
import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { Badge, ModeTag, Tag } from '@/components/ui';
import { fmtDate, fmtDT, fmtNum } from '@/lib/format';
import { t } from '@/lib/i18n';

type R = Record<string, any>;
type Opts = Partial<ColDef<R>>;
const get = (key: string) => (p: ValueGetterParams<R>) => p.data?.[key];

export const col = {
  text: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({ field: key, headerName, valueFormatter: (p) => (p.value == null || p.value === '' ? '—' : String(p.value)), ...o }),
  mono: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({ field: key, headerName, cellClass: 'mono', maxWidth: 220, ...o }),
  /** Teks tebal (mockup: td.strong); teks panjang dilipat seperti sel tabel mockup. */
  strong: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({ field: key, headerName, minWidth: 200, cellStyle: { fontWeight: 700 }, wrapText: true, autoHeight: true, ...o }),
  /** Nama + baris kecil redup di bawahnya (mockup: `esc(nama)<div class="tiny muted">sub</div>`). */
  twoLine: (key: string, headerName: string, sub: (r: R) => React.ReactNode, o: Opts = {}): ColDef<R> => ({
    field: key, headerName, minWidth: 220, wrapText: true, autoHeight: true,
    cellRenderer: (p: { value: unknown; data?: R }) => <span>{String(p.value ?? '—')}{p.data && sub(p.data) ? <span className="sub">{sub(p.data)}</span> : null}</span>, ...o,
  }),
  /** Lencana status (AF-05 dan lainnya). */
  badge: (key: string, headerName: string, o: Opts & { label?: (r: R) => string } = {}): ColDef<R> => {
    const { label, ...rest } = o;
    return { headerName, valueGetter: label ? (p) => (p.data ? label(p.data) : '') : get(key), maxWidth: 170, cellRenderer: (p: { value: unknown }) => <Badge value={p.value} />, ...rest };
  },
  /** Tag monospace (jenis/kode). */
  tag: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({ field: key, headerName, maxWidth: 190, cellRenderer: (p: { value: unknown }) => (p.value == null || p.value === '' ? '—' : <Tag>{String(p.value)}</Tag>), ...o }),
  /** Mode workspace (MF 2.0 / INTERNAL). */
  mode: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({ field: key, headerName, minWidth: 110, maxWidth: 130, cellRenderer: (p: { value: unknown }) => <ModeTag mode={p.value as string} />, ...o }),
  date: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({ field: key, headerName, maxWidth: 150, valueFormatter: (p) => fmtDate(p.value), ...o }),
  dateTime: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({ field: key, headerName, maxWidth: 190, valueFormatter: (p) => fmtDT(p.value), ...o }),
  num: (key: string, headerName: string, d?: number, o: Opts = {}): ColDef<R> => ({ field: key, headerName, type: 'rightAligned', maxWidth: 150, cellClass: 'num', valueFormatter: (p) => fmtNum(p.value, d), ...o }),
  bool: (key: string, headerName: string, o: Opts = {}): ColDef<R> => ({
    field: key, headerName, maxWidth: 130, valueFormatter: (p) => (p.value ? t('ya') : '—'),
    cellRenderer: (p: { value: unknown }) => (p.value ? <Badge cls="b-ok">{t('ya')}</Badge> : <span className="faint">—</span>), ...o,
  }),
  /** Kolom bebas dengan nilai turunan. */
  calc: (headerName: string, value: (r: R) => unknown, o: Opts = {}): ColDef<R> => ({ headerName, valueGetter: (p) => (p.data ? value(p.data) : ''), ...o }),
};
