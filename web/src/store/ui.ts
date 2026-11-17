'use client';
/* Status UI (Zustand): tema, panel menu (lipat di desktop / laci di layar sempit), popover header, palet perintah, konteks entitas,
   tumpukan lapisan (drawer/modal) yang dibuka secara imperatif, dan toast. Kunci penyimpanan `eap.*`. */
import { create } from 'zustand';
import type { ReactNode } from 'react';
import { ls } from '@/lib/config';

export type Theme = 'auto' | 'light' | 'dark';
export type Pop = 'user' | null;
interface Layer { id: number; render: (close: () => void) => ReactNode }
export interface Toast { id: number; title: string; msg?: string; type: 'info' | 'success' | 'warning' | 'error' }

interface UiState {
  theme: Theme;
  collapsed: boolean;          // desktop: panel menu 60px (hanya nomor)
  mobileNav: boolean;          // layar sempit: laci menu
  pop: Pop;
  cmdk: boolean;
  /** Konteks entitas (id ref.business_groups; '' = semua yang boleh dilihat). Dipakai sebagai ?entityId= pada daftar yang mendukungnya. */
  entity: string;
  layers: Layer[];
  toasts: Toast[];
  setTheme: (t: Theme) => void;
  toggleNav: () => void;
  setMobileNav: (v: boolean) => void;
  setPop: (p: Pop) => void;
  setCmdk: (v: boolean) => void;
  setEntity: (id: string) => void;
  push: (render: Layer['render']) => () => void;
  closeAll: () => void;
  toast: (title: string, msg?: string, type?: Toast['type']) => void;
}

let seq = 0;
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width:860px)').matches;

export const useUi = create<UiState>((set, get) => ({
  theme: 'auto',
  collapsed: false,
  mobileNav: false,
  pop: null,
  cmdk: false,
  entity: '',
  layers: [],
  toasts: [],
  setTheme: (theme) => { set({ theme }); ls.set('eap.theme', theme); },
  toggleNav: () => {
    if (narrow()) set({ mobileNav: !get().mobileNav });
    else { const v = !get().collapsed; set({ collapsed: v }); ls.set('eap.nav.collapsed', v ? '1' : '0'); }
  },
  setMobileNav: (mobileNav) => set({ mobileNav }),
  setPop: (pop) => set({ pop: get().pop === pop ? null : pop }),
  setCmdk: (cmdk) => set({ cmdk, pop: null }),
  setEntity: (entity) => { set({ entity }); ls.set('eap.entity', entity); },
  push: (render) => {
    const id = ++seq;
    const close = () => set({ layers: get().layers.filter((l) => l.id !== id) });
    set({ layers: [...get().layers, { id, render }], pop: null });
    return close;
  },
  closeAll: () => set({ layers: [], pop: null, cmdk: false }),
  toast: (title, msg, type = 'info') => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, title, msg, type }] });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== id) }), 4800);
  },
}));

/** Membuka lapisan (drawer/modal) dari luar React. render(close) mengembalikan <Drawer>/<Modal> yang memanggil close saat ditutup. */
export const openLayer = (render: Layer['render']) => useUi.getState().push(render);
export const toast = (title: string, msg?: string, type?: Toast['type']) => useUi.getState().toast(title, msg, type);
