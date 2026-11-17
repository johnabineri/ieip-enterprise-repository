'use client';
/* Lonceng notifikasi (header) — data NYATA dari GET /api/v1/set/notifications (tabel set.notification; dibuat pemicu DB, hanya milik pengguna). Markup & kelas
   popover mengikuti mockup (#pop-notif: .pop > .card-hd + .list > a.li). Tanda "dibaca" disimpan di server (POST …/read). Disegarkan tiap 45 dtk, saat jendela
   kembali fokus, dan setelah penulisan data (invalidateData). Tanpa notifikasi → keadaan kosong, bukan data contoh. */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import * as api from '@/lib/api';
import { fmtDT } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cx } from '@/lib/utils';
import { useUi } from '@/store/ui';

interface Notif { id: string; kind: string; severity: 'info' | 'warn' | 'err'; title: string; body: string | null; route: string | null; createdAt: string; readAt: string | null }
interface Box { data: Notif[]; unread: number }

const KEY = ['notifications'] as const;
const ICON: Record<string, string> = { approval: '✔', status: '◆', review: '↻', arb: '⚖', connector: '⛔', info: 'ⓘ' };
const SEV: Record<string, string> = { err: 'var(--err)', warn: 'var(--warn)', info: 'var(--info)' };

export function useNotifications() {
  return useQuery({
    queryKey: KEY, queryFn: () => api.get<Box>('/api/v1/set/notifications', { limit: 30 }),
    refetchInterval: 45_000, refetchOnWindowFocus: true, staleTime: 15_000, retry: false,
  });
}

/** Tombol lonceng + lencana jumlah belum dibaca (header). */
export function BellButton() {
  const q = useNotifications();
  const setPop = useUi((s) => s.setPop);
  const n = q.data?.unread ?? 0;
  return (
    <button type="button" className="hdr-btn bell-btn" aria-label={n ? t('Notifikasi — {0} belum dibaca', n) : t('Notifikasi')} title={t('Notifikasi')} onClick={() => setPop('notif')} style={{ position: 'relative' }}>
      <Bell size={17} strokeWidth={1.9} aria-hidden="true" />
      {n > 0 ? <span className="bell-badge" aria-hidden="true">{n > 99 ? '99+' : n}</span> : null}
    </button>
  );
}

/** Popover daftar notifikasi: klik = tandai dibaca + buka halaman terkait. */
export function NotifPop() {
  const router = useRouter();
  const qc = useQueryClient();
  const { pop, closeAll } = useUi();
  const q = useNotifications();
  const ref = React.useRef<HTMLDivElement>(null);
  const open = pop === 'notif';

  // tutup saat klik di luar (selain tombol lonceng) atau Escape
  React.useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const el = e.target as Element; if (!ref.current?.contains(el) && !el.closest('.bell-btn')) closeAll(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, closeAll]);

  const mark = async (ids?: string[]) => {
    try { await api.post('/api/v1/set/notifications/read', ids ? { ids } : {}); } catch { /* galat tidak mengganggu navigasi */ }
    qc.invalidateQueries({ queryKey: KEY });
  };
  const go = (n: Notif) => { if (!n.readAt) void mark([n.id]); closeAll(); if (n.route) router.push(n.route); };
  const list = q.data?.data ?? []; const unread = q.data?.unread ?? 0;

  return (
    <div ref={ref} className={cx('pop', open && 'on')} role="dialog" aria-label={t('Notifikasi')}>
      <div className="card-hd">
        <h2>{t('Notifikasi')}</h2>
        {unread ? <span className="meta">{t('{0} belum dibaca', unread)}</span> : null}
        <button type="button" className="btn sm ghost" disabled={!unread} onClick={() => mark()}>{t('Tandai semua dibaca')}</button>
      </div>
      {q.isError ? <div className="empty">{t('Notifikasi tidak dapat dimuat.')}</div>
        : !q.data ? <div className="empty">{t('Memuat…')}</div>
        : list.length === 0 ? <div className="empty">{t('Belum ada notifikasi.')}</div>
        : (
          <div className="list">
            {list.map((n) => (
              <a key={n.id} className="li" href={n.route || '#'} style={{ cursor: 'pointer', opacity: n.readAt ? 0.65 : 1 }} onClick={(e) => { e.preventDefault(); go(n); }}>
                <span className="ic" style={{ color: SEV[n.severity] }} aria-hidden="true">{ICON[n.kind] ?? 'ⓘ'}</span>
                <div className="bd">
                  <div className="t" style={{ fontWeight: n.readAt ? 500 : 700 }}>{n.title}</div>
                  {n.body ? <div className="d">{n.body}</div> : null}
                  <div className="tiny muted">{fmtDT(n.createdAt)}</div>
                </div>
                {n.readAt ? null : <i className="dom-dot" style={{ background: 'var(--accent)' }} title={t('Belum dibaca')} />}
              </a>
            ))}
          </div>
        )}
    </div>
  );
}
