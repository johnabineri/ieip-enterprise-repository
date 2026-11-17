'use client';
/* Ikon menu (pengganti nomor layar `span.num` di panel menu — keputusan pengguna). Kunci `<modul>/<menu>`; nomor layar mockup tetap di registri untuk penelusuran
   tetapi tidak ditampilkan. Ikon = lucide-react (versi yang sama dengan BASE). */
import * as React from 'react';
import {
  Activity, AppWindow, Blocks, BookMarked, Building2, Cable, Circle, Code, Cpu, Database, FileCheck, FileDown, Files, Gauge, FolderTree, Gavel, GitBranch, GitFork, GitPullRequest,
  Hammer, House, KeyRound, LayoutDashboard, LayoutTemplate, ListChecks, MessagesSquare, Newspaper, Plug, Route, ScrollText, Server, Shapes, ShieldAlert, ShieldCheck, Users,
  Wallet, Workflow, type LucideIcon,
} from 'lucide-react';

const BY_KEY: Record<string, LucideIcon> = {
  'home/overview': House,
  'eaw/dashboard': LayoutDashboard, 'eaw/repository': FolderTree, 'eaw/proses': Workflow, 'eaw/data': Database, 'eaw/layanan': Blocks, 'eaw/aplikasi': AppWindow, 'eaw/infra': Server, 'eaw/keamanan': ShieldCheck,
  'eaw/kanvas': Shapes, 'eaw/lineage': GitBranch, 'eaw/kerangka': LayoutTemplate, 'eaw/kra': BookMarked, 'eaw/arb': Gavel, 'eaw/roadmap': Route, 'eaw/adr': FileCheck, 'eaw/publisher': Newspaper,
  'gse/proyek': Hammer, 'gse/template': Files, 'gse/flow': GitFork, 'gse/ide': Code, 'gse/pr': GitPullRequest,
  'req/sesi': MessagesSquare, 'req/story': ListChecks, 'req/ekspor': FileDown,
  'console/ika': Gauge, 'console/ai': Cpu, 'console/finops': Wallet, 'console/eio': Cable, 'console/obs': Activity, 'console/security': ShieldAlert,
  'set/org': Building2, 'set/users': Users, 'set/roles': KeyRound, 'set/api': Plug, 'set/audit': ScrollText,
};

export function MenuIcon({ mod, menu }: { mod: string; menu: string }) {
  const I = BY_KEY[`${mod}/${menu}`] || Circle;
  return <I size={16} strokeWidth={1.9} aria-hidden="true" />;
}
