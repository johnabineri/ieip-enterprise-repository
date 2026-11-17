'use client';
/* MIND Architecture Copilot (CONSOLE) — panel melayang, markup & kelas mockup (.fab/.copilot/.cp-hd/.chat/.msg/.suggest/.chat-in).
   Backend: POST /api/v1/console/mind/chat — alat deterministik atas data EAW nyata (RLS pemanggil); LLM (bila terpasang & saklar aktif) hanya merangkai fakta.
   Setiap jawaban memuat mode (deterministik | llm), maksud, mesin guardrail, sumber (tautan ke halaman asal data) dan catatan batas. Pertanyaan diblokir
   guardrail tampil sebagai pesan sistem. Percakapan disimpan di sessionStorage tab ini saja (tidak di server — D-14). */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { ss } from '@/lib/config';
import { t } from '@/lib/i18n';
import { cx } from '@/lib/utils';
import { can, useSession } from '@/store/session';
import { useUi } from '@/store/ui';

interface Source { label: string; route: string }
interface Msg { role: 'u' | 'a' | 'sys'; text: string; meta?: string; sources?: Source[]; notes?: string[] }
interface Status { llm: { configured: boolean; model: string | null; enabled: boolean; active: boolean }; guard: string; mode: 'llm' | 'deterministik'; suggestions: string[] }
interface Reply {
  blocked: boolean; answer: string | null; reason?: string; category?: string; engine?: string; ms?: number;
  mode?: 'llm' | 'deterministik'; model?: string | null; intent?: string; sources?: Source[]; notes?: string[]; guard?: { engine: string; ms: number }; masked?: string[];
}

const STORE = 'eap.mind.chat';
const load = (): Msg[] => { try { const v = JSON.parse(ss.get(STORE) || '[]'); return Array.isArray(v) ? v.slice(-40) : []; } catch { return []; } };

export function CopilotFab() {
  const me = useSession((s) => s.me);
  const { copilot, setCopilot } = useUi();
  if (!me || !can('eaw.catalog.read')) return null;
  return (
    <button type="button" className="fab" onClick={() => setCopilot(!copilot)} aria-label={t('Buka MIND Copilot')} aria-expanded={copilot}>
      <span className="spark">✦</span><b>MIND Copilot</b>
    </button>
  );
}

export function CopilotPanel() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const { copilot, setCopilot } = useUi();
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const chatRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const allowed = !!me && can('eaw.catalog.read');
  const st = useQuery({ queryKey: ['mind', 'status'], queryFn: () => api.get<Status>('/api/v1/console/mind/status'), enabled: allowed && copilot, staleTime: 60_000, retry: false });

  React.useEffect(() => { setMsgs(load()); }, []);
  React.useEffect(() => { ss.set(STORE, JSON.stringify(msgs.slice(-40))); chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }); }, [msgs, busy]);
  React.useEffect(() => { if (copilot) setTimeout(() => inputRef.current?.focus(), 30); }, [copilot]);
  React.useEffect(() => {
    if (!copilot) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setCopilot(false); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [copilot, setCopilot]);

  const ask = async (q: string) => {
    const message = q.trim(); if (!message || busy) return;
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'u', text: message }]);
    try {
      const r = await api.post<Reply>('/api/v1/console/mind/chat', { message });
      if (r.blocked) setMsgs((m) => [...m, { role: 'sys', text: `⛔ ${t('Diblokir')} — ${r.reason ?? ''}`, meta: `${r.engine ?? ''} · ${r.category ?? ''} · ${r.ms ?? 0} ms` }]);
      else setMsgs((m) => [...m, { role: 'a', text: r.answer ?? '', sources: r.sources, notes: r.notes,
        meta: [r.mode === 'llm' ? `LLM ${r.model ?? ''}` : t('deterministik · bukan model AI'), r.intent, r.guard ? `guardrail ✓ ${r.guard.engine} ${r.guard.ms} ms` : '', r.masked?.length ? t('PII dimasking') : ''].filter(Boolean).join(' · ') }]);
    } catch (e) { setMsgs((m) => [...m, { role: 'sys', text: api.explain(e) }]); }
    finally { setBusy(false); }
  };
  const go = (route: string) => { router.push(route); };

  if (!allowed) return null;
  const tag = st.data ? (st.data.llm.active ? `LLM · ${st.data.llm.model}` : t('Mode deterministik (tanpa LLM)')) : '';
  return (
    <section className={cx('copilot', copilot && 'on')} aria-label={t('MIND Architecture Copilot')}>
      <div className="cp-hd">
        <span className="spark" style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#3DD28A,#0A8F4F)', display: 'grid', placeItems: 'center', color: '#0B3D2A' }}>✦</span>
        <div><b>MIND Architecture Copilot</b><div className="tiny" style={{ opacity: 0.8 }}>{tag || t('Dari data EAW yang terlihat oleh Anda')}</div></div>
        <button type="button" className="x" style={{ marginLeft: 'auto' }} aria-label={t('Tutup')} onClick={() => setCopilot(false)}>×</button>
      </div>
      <div className="chat" ref={chatRef}>
        {msgs.length === 0 ? <div className="msg a">{t('Halo, saya MIND — Architecture Copilot SAORAJA. Tanyakan dampak/dependensi, redundansi, drift, KPI, IKA, atau status gate AF-06. Saya menjawab dari data EAW yang terlihat oleh Anda.')}<span className="meta">{t('Domain-fenced · guardrail fail-closed · PII dimasking')}</span></div> : null}
        {msgs.map((m, i) => (
          <div key={i} className={cx('msg', m.role)}>
            {m.text}
            {m.sources?.length ? <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{m.sources.map((s) => <a key={s.route + s.label} href={s.route} className="tag" onClick={(e) => { e.preventDefault(); go(s.route); }}>{s.label} →</a>)}</div> : null}
            {m.notes?.length ? <div className="tiny" style={{ opacity: 0.75, marginTop: 6 }}>{m.notes.join(' ')}</div> : null}
            {m.meta ? <span className="meta">{m.meta}</span> : null}
          </div>
        ))}
        {busy ? <div className="msg a" aria-live="polite">…</div> : null}
      </div>
      <div className="suggest">
        {(st.data?.suggestions ?? []).slice(0, 4).map((s) => <button key={s} type="button" onClick={() => ask(s)} disabled={busy}>{s.length > 46 ? s.slice(0, 44) + '…' : s}</button>)}
        {msgs.length ? <button type="button" onClick={() => setMsgs([])}>{t('Hapus percakapan')}</button> : null}
      </div>
      <form className="chat-in" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <input ref={inputRef} className="input" value={text} maxLength={1000} placeholder={t('Tanya MIND…')} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn pri" disabled={busy || !text.trim()}>{t('Kirim')}</button>
      </form>
    </section>
  );
}
