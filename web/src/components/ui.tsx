'use client';
/* Primitif tampilan bermarkup & kelas MOCKUP (eap.css): .btn, .badge, .tag, .card, .callout, .kpi, .hbar, .progress, .tabs, .field, .dl, .tbl.
   Tidak ada gaya sendiri di sini — semua visual berasal dari eap.css (diturunkan dari web/design/styles.css). */
import * as React from 'react';
import { badgeClass } from '@/lib/badge';
import { cx } from '@/lib/utils';
import { t } from '@/lib/i18n';

/* ---------- tombol ---------- */
type BtnProps = React.ComponentProps<'button'> & { variant?: 'pri' | 'danger' | 'ghost' | 'gold'; sm?: boolean };
export function Btn({ variant, sm, className, type = 'button', ...p }: BtnProps) {
  return <button type={type} className={cx('btn', variant, sm && 'sm', className)} {...p} />;
}
/** Tombol yang sibuk selama onClick async berjalan. */
export function AsyncBtn({ onClick, children, ...p }: Omit<BtnProps, 'onClick'> & { onClick: () => Promise<unknown> | unknown }) {
  const [busy, setBusy] = React.useState(false);
  return <Btn {...p} disabled={busy || p.disabled} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}>{busy ? '…' : null}{children}</Btn>;
}

/* ---------- lencana ---------- */
/** Lencana status; kelas b-* diturunkan dari nilai (AF-05 punya warna khusus). */
export function Badge({ value, cls, children }: { value?: unknown; cls?: string; children?: React.ReactNode }) {
  const label = children ?? (value == null || value === '' ? null : String(value));
  if (label == null) return <span className="faint">—</span>;
  return <span className={cx('badge', cls ?? badgeClass(value ?? children))}>{label}</span>;
}
export const Tag = ({ children, cls }: { children: React.ReactNode; cls?: string }) => <span className={cx('tag', cls)}>{children}</span>;
/** Tag mode workspace (mockup: modeTag). */
export const ModeTag = ({ mode }: { mode?: string | null }) => (mode === 'FEDERATED_REMOTE' ? <Tag cls="mf">MF 2.0</Tag> : mode ? <Tag cls="ir">INTERNAL</Tag> : <span className="faint">—</span>);

/* ---------- kartu, callout, KPI ---------- */
export function Card({ title, meta, acts, flush, className, children }: { title?: React.ReactNode; meta?: React.ReactNode; acts?: React.ReactNode; flush?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section className={cx('card', className)}>
      {title ? <div className="card-hd"><h2>{title}</h2>{meta ? <span className="meta">{meta}</span> : null}{acts}</div> : null}
      <div className={cx('card-bd', flush && 'flush')}>{children}</div>
    </section>
  );
}
export function Callout({ tone = 'info', icon, children, className }: { tone?: 'info' | 'warn' | 'err' | 'ok' | 'gold'; icon?: string; children: React.ReactNode; className?: string }) {
  const ic = icon ?? { info: 'ℹ', warn: '⚠', err: '⛔', ok: '✓', gold: '★' }[tone];
  return <div role={tone === 'err' || tone === 'warn' ? 'alert' : undefined} className={cx('callout', tone, className)}><span className="ic">{ic}</span><div>{children}</div></div>;
}
export function Kpi({ label, value, unit, delta, tgt }: { label: React.ReactNode; value: React.ReactNode; unit?: string; delta?: React.ReactNode; tgt?: React.ReactNode }) {
  return (
    <div className="card kpi"><div className="lbl">{label}</div><div className="val">{value}{unit ? <small>{unit}</small> : null}</div>{delta ? <div className="delta">{delta}</div> : null}{tgt ? <div className="tgt">{tgt}</div> : null}</div>
  );
}
export const PageHd = ({ title, sub, acts }: { title: React.ReactNode; sub?: React.ReactNode; acts?: React.ReactNode }) => (
  <div className="page-hd"><div className="ttl"><h1>{title}</h1>{sub ? <p className="sub">{sub}</p> : null}</div>{acts ? <div className="acts">{acts}</div> : null}</div>
);

/* ---------- siklus status AF-05 (mockup: A.lifecycle) ---------- */
export const AF05 = ['Draf', 'Divalidasi', 'Ditetapkan', 'Dipublikasi', 'Direviu'];
export function Lifecycle({ status }: { status: string }) {
  const i = AF05.indexOf(status);
  return (
    <div className="lifecycle">
      {AF05.map((s, k) => (
        <React.Fragment key={s}>
          {k ? <span className="lc-line" /> : null}
          <span className={cx('lc-step', k < i ? 'done' : k === i ? 'cur' : '')}><span className="c">{k < i ? '✓' : k + 1}</span>{s}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ---------- bar & progres ---------- */
export function Progress({ pct }: { pct: number }) { return <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>; }
/** Bilah horizontal bertumpuk (mockup: .hbar). segments = [{v, color, title}]. */
export function Hbar({ label, segments, total, valueText }: { label: React.ReactNode; segments: { v: number; color: string; title?: string }[]; total: number; valueText?: React.ReactNode }) {
  return (
    <div className="hbar">
      <span>{label}</span>
      <div className="bar" role="img" aria-label={segments.map((s) => s.title).filter(Boolean).join(', ')}>
        <div style={{ display: 'flex', height: '100%' }}>{segments.map((s, i) => (s.v ? <i key={i} title={s.title} style={{ width: `${total ? (s.v / total) * 100 : 0}%`, background: s.color }} /> : null))}</div>
      </div>
      <span className="v">{valueText ?? total}</span>
    </div>
  );
}

/* ---------- tab & formulir ---------- */
export function Tabs<K extends string>({ items, value, onChange }: { items: [K, React.ReactNode][]; value: K; onChange: (k: K) => void }) {
  return <div className="tabs" role="tablist">{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={k === value} className={cx('tab', k === value && 'on')} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Field({ label, req, hint, full, children }: { label: React.ReactNode; req?: boolean; hint?: React.ReactNode; full?: boolean; children: React.ReactNode }) {
  return <div className={cx('field', full && 'full')}><label>{label}{req ? <> <span className="req">*</span></> : null}</label>{children}{hint ? <span className="hint">{hint}</span> : null}</div>;
}
export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function Input({ className, ...p }, ref) { return <input ref={ref} className={cx('input', className)} {...p} />; });
export const Select = ({ className, ...p }: React.ComponentProps<'select'>) => <select className={cx('select', className)} {...p} />;
export const Textarea = ({ className, ...p }: React.ComponentProps<'textarea'>) => <textarea className={cx('textarea', className)} {...p} />;

/* ---------- daftar definisi & tabel kecil ---------- */
export function DL({ pairs, className }: { pairs: (readonly [React.ReactNode, React.ReactNode] | false | null | undefined)[]; className?: string }) {
  return (
    <dl className={cx('dl', className)}>
      {pairs.filter(Boolean).map((p, i) => { const [k, v] = p as [React.ReactNode, React.ReactNode]; return <React.Fragment key={i}><dt>{k}</dt><dd>{v == null || v === '' ? '—' : v}</dd></React.Fragment>; })}
    </dl>
  );
}
export interface MiniCol<T = any> { key?: string; label: React.ReactNode; render?: (r: T) => React.ReactNode; num?: boolean; mono?: boolean }
/** Tabel statis (mockup: table.tbl) di dalam kartu/drawer. */
export function MiniTable<T = any>({ columns, rows, empty = t('Tidak ada data.'), onRow }: { columns: MiniCol<T>[]; rows?: T[] | null; empty?: React.ReactNode; onRow?: (r: T) => void }) {
  if (!rows || !rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{columns.map((c, i) => <th key={i} className={cx(c.num && 'num')}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cx(onRow && 'click')} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c, j) => { const v = c.render ? c.render(r) : (r as any)[c.key!]; return <td key={j} className={cx(c.num && 'num', c.mono && 'mono')}>{v == null || v === '' ? '—' : v}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
/** Judul bagian kecil di dalam drawer (mockup: h3 + garis). */
export function Section({ title, children, actions }: { title: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return <section className="mt"><div className="row" style={{ marginBottom: 8 }}><h3>{title}</h3><span className="right" />{actions}</div>{children}</section>;
}

/* ---------- skeleton ---------- */
export const Skel = ({ w, h = 14, className }: { w?: number | string; h?: number; className?: string }) => <span className={cx('skel', className)} style={{ width: w ?? '100%', height: h }} />;
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label={t('Memuat')}>
      <div className="page-hd"><div className="ttl"><Skel w={260} h={26} /><div style={{ marginTop: 8 }}><Skel w={520} h={12} /></div></div></div>
      <div className="card"><div className="card-bd stack">{Array.from({ length: 9 }).map((_, i) => <Skel key={i} h={16} w={`${60 + ((i * 17) % 40)}%`} />)}</div></div>
    </div>
  );
}
