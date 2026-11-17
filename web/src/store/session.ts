'use client';
/* Sesi pengguna (Zustand): hasil GET /api/v1/me. Peran & izin dihitung server dari set.* (peran ditugaskan admin; akun baru TANPA peran).
   UI hanya menyembunyikan yang pasti ditolak — keputusan akhir tetap di API/DB (RLS, eaw.can_edit, maker ≠ checker, eaw.transition). */
import { create } from 'zustand';
import type { Me } from '@/lib/api';

type Status = 'boot' | 'login' | 'ready';
interface SessionState {
  status: Status;
  me: Me | null;
  /** Pesan di layar login. */
  message: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string } | null;
  setMe: (me: Me) => void;
  toLogin: (message?: SessionState['message']) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'boot',
  me: null,
  message: null,
  setMe: (me) => set({ me, status: 'ready', message: null }),
  toLogin: (message = null) => set({ me: null, status: 'login', message }),
}));

/* Pemeriksa izin — dapat dipanggil di luar komponen (handler, kolom grid, meta menu). */
const me = () => useSession.getState().me;
export const can = (perm: string) => !!me()?.permissions?.includes(perm);
export const canAny = (...perms: string[]) => perms.some(can);
export const hasRole = (...roles: string[]) => { const m = me(); return !!(m && (m.roles || []).some((r) => roles.includes(r))); };
/** Boleh menyusun (Draf) pada entitas ber-kode tertentu — cerminan cakupan eaw.can_edit (RLS tetap memutuskan). */
export const canEditEntity = (code?: string | null) => { const s = me()?.scope; return !!s && (s.editAll || (!!code && s.editEntityCodes.includes(code))); };
