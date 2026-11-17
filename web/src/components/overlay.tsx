'use client';
/* Lapisan (drawer, modal), toast, dan pembantu aksi — markup & kelas MOCKUP (.overlay, .drawer, .modal, .toasts, .toast).
   Semua dirender di dalam .eap-root (LayerHost dipasang di Providers) sehingga token tema berlaku dan CSS tidak bocor ke Host. */
import * as React from 'react';
import { explain } from '@/lib/api';
import { invalidateData } from '@/lib/query';
import { openLayer, toast, useUi } from '@/store/ui';
import { AsyncBtn, Btn, Callout, Field, Input, Select, Textarea } from '@/components/ui';
import { cx } from '@/lib/utils';
import { t } from '@/lib/i18n';

function useEsc(close: () => void) {
  React.useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [close]);
}
function useOn() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r); }, []);
  return on;
}

export interface DrawerProps { title: React.ReactNode; sub?: React.ReactNode; wide?: boolean; footer?: React.ReactNode; close: () => void; children: React.ReactNode }
/** Drawer kanan (mockup: aside.drawer). */
export function Drawer({ title, sub, wide, footer, close, children }: DrawerProps) {
  const on = useOn(); useEsc(close);
  return (
    <>
      <div className="overlay on" onClick={close} />
      <aside className={cx('drawer', on && 'on')} role="dialog" aria-modal="true" style={wide ? { width: 'min(820px,100vw)' } : undefined}>
        <div className="drawer-hd"><div><h2>{title}</h2>{sub ? <p className="small muted">{sub}</p> : null}</div><button type="button" className="x" aria-label={t('Tutup')} onClick={close}>×</button></div>
        <div className="drawer-bd">{children}</div>
        <div className="drawer-ft">{footer}<Btn onClick={close}>{t('Tutup')}</Btn></div>
      </aside>
    </>
  );
}
export const openDrawer = (render: (close: () => void) => React.ReactNode) => openLayer(render);

/** Modal tengah (mockup: div.modal) dengan hd/bd/ft yang sama seperti drawer. */
export function Modal({ title, sub, footer, close, children, onSubmit }: { title: React.ReactNode; sub?: React.ReactNode; footer?: React.ReactNode; close: () => void; children: React.ReactNode; onSubmit?: (e: React.FormEvent) => void }) {
  useEsc(close);
  const Body = onSubmit ? 'form' : 'div';
  return (
    <>
      <div className="overlay on" onClick={close} />
      <div className="modal on" role="dialog" aria-modal="true">
        <div className="drawer-hd"><div><h2>{title}</h2>{sub ? <p className="small muted">{sub}</p> : null}</div><button type="button" className="x" aria-label={t('Tutup')} onClick={close}>×</button></div>
        <Body className="drawer-bd" {...(onSubmit ? { onSubmit, noValidate: true } : {})}>{children}</Body>
        <div className="drawer-ft">{footer}</div>
      </div>
    </>
  );
}

/* ---------- formulir ---------- */
export interface FormField {
  name: string; label: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox'; req?: boolean; hint?: string; full?: boolean;
  options?: [string, string][]; max?: number; min?: number; placeholder?: string; disabled?: boolean;
}
export type Values = Record<string, any>;
export interface FormSpec {
  title: string; sub?: string; intro?: React.ReactNode; fields: FormField[]; initial?: Values; submit?: string; danger?: boolean;
  onSubmit: (v: Values) => Promise<unknown> | unknown;
}
function FormBody({ spec, close }: { spec: FormSpec; close: () => void }) {
  const [v, setV] = React.useState<Values>(() => Object.fromEntries(spec.fields.map((f) => [f.name, spec.initial?.[f.name] ?? (f.type === 'checkbox' ? false : '')])));
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = (k: string, x: unknown) => setV((s) => ({ ...s, [k]: x }));
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr(null);
    const miss = spec.fields.filter((f) => f.req && (v[f.name] === '' || v[f.name] == null)).map((f) => f.label);
    if (miss.length) return setErr(t('Wajib diisi: {0}', miss.join(', ')));
    setBusy(true);
    try {
      const out: Values = {};
      for (const f of spec.fields) {
        const x = v[f.name];
        if (f.type === 'number') out[f.name] = x === '' ? undefined : Number(x);
        else if (f.type === 'checkbox') out[f.name] = !!x;
        else out[f.name] = x === '' ? undefined : x;
      }
      await spec.onSubmit(out); close();
    } catch (x) { setErr(explain(x)); } finally { setBusy(false); }
  };
  return (
    <Modal title={spec.title} sub={spec.sub} close={close} onSubmit={submit}
      footer={<><span className="right" /><Btn onClick={close}>{t('Batal')}</Btn><Btn variant={spec.danger ? 'danger' : 'pri'} type="submit" disabled={busy} onClick={() => submit()}>{busy ? '…' : spec.submit || t('Simpan')}</Btn></>}>
      {spec.intro}
      <div className="form-grid">
        {spec.fields.map((f) => (
          <Field key={f.name} label={f.label} req={f.req} hint={f.hint} full={f.full || f.type === 'textarea'}>
            {f.type === 'select' ? <Select value={v[f.name]} disabled={f.disabled} onChange={(e) => set(f.name, e.target.value)}>{(f.options || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              : f.type === 'textarea' ? <Textarea value={v[f.name]} maxLength={f.max} disabled={f.disabled} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
              : f.type === 'checkbox' ? <label className="row" style={{ height: 34 }}><input type="checkbox" checked={!!v[f.name]} disabled={f.disabled} onChange={(e) => set(f.name, e.target.checked)} />{f.placeholder || t('ya')}</label>
              : <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={v[f.name]} maxLength={f.max} min={f.min} disabled={f.disabled} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />}
          </Field>
        ))}
      </div>
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
    </Modal>
  );
}
export const formDialog = (spec: FormSpec) => openLayer((close) => <FormBody spec={spec} close={close} />);

/** Konfirmasi (opsional dengan alasan wajib). */
export const confirmDialog = ({ title, text, reason, min = 5, danger, ok = t('Lanjutkan'), onOk }: { title: string; text?: React.ReactNode; reason?: boolean | string; min?: number; danger?: boolean; ok?: string; onOk: (reason?: string) => Promise<unknown> | unknown }) =>
  formDialog({
    title, intro: text ? <p className="mb">{text}</p> : undefined, submit: ok, danger,
    fields: reason ? [{ name: 'reason', label: typeof reason === 'string' ? reason : t('Alasan'), type: 'textarea', req: true, min }] : [],
    onSubmit: (v) => { if (reason && String(v.reason || '').length < min) throw new Error(t('Alasan minimal {0} karakter.', min)); return onOk(v.reason); },
  });

/* ---------- aksi + toast ---------- */
/** Menjalankan aksi dengan toast galat/sukses; memuat ulang data bila sukses. */
export async function act<T>(fn: () => Promise<T>, okMsg?: string | ((r: T) => string), { invalidate = true } = {}): Promise<T | undefined> {
  try {
    const r = await fn();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, undefined, 'success');
    if (invalidate) invalidateData();
    return r;
  } catch (e) { toast(t('Gagal'), explain(e), 'error'); return undefined; }
}
export { AsyncBtn };

/* ---------- host ---------- */
export function LayerHost() {
  const layers = useUi((s) => s.layers);
  const toasts = useUi((s) => s.toasts);
  return (
    <>
      {layers.map((l) => <React.Fragment key={l.id}>{l.render(() => useUi.setState((s) => ({ layers: s.layers.filter((x) => x.id !== l.id) })))}</React.Fragment>)}
      <div className="toasts" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={cx('toast', x.type)} role="status" onClick={() => useUi.setState((s) => ({ toasts: s.toasts.filter((y) => y.id !== x.id) }))}>
            <b>{x.title}</b>{x.msg ? <div className="small muted">{x.msg}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}
