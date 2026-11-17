/* Daftar workspace → menu (tab workspace di header + panel menu kiri + rute /<workspace>/<menu>/). Sumber: registri `WS` di eap/ui/assets/app.js
   (diturunkan di struktur_module.md: 5 workspace, 34 layar) — kode, mode, port, nomor layar dan teks sama dengan mockup.
   Visibilitas menurut izin GET /me (UI saja — API/DB tetap memutuskan). Menu yang belum dimigrasi tetap tampil dan membuka halaman pengganti
   (./pages.tsx). generateStaticParams memakai berkas ini, jadi jangan impor komponen halaman di sini. */
import { can, canAny } from '@/store/session';
import { t } from '@/lib/i18n';

export interface MenuDef { id: string; num: string; label: string; group?: string; show?: () => boolean }
export interface ModuleDef { id: string; code: string; mode: string; port: number; title: string; desc: string; hidden?: boolean; menus: MenuDef[] }

const R = (p: string) => () => can(p);
const CONSOLE = () => canAny('console.dashboard.read', 'console.finops.read');

export const MODULES: ModuleDef[] = [
  { id: 'home', code: 'HOME', mode: 'INTERNAL', port: 0, hidden: true, title: t('Ringkasan akun'), desc: t('Peran dan cakupan akses Anda di EAP.'), menus: [{ id: 'overview', num: '0.0', label: t('Ringkasan akun') }] },
  { id: 'eaw', code: 'EAW', mode: 'MF 2.0', port: 5171, title: t('Enterprise Architecture Workbench'), desc: t('Pemodelan 6 domain, APM, KRA, ARB & ADR'), menus: [
    { id: 'dashboard', num: '1.1', label: t('Dashboard Arsitektur'), group: t('Ringkasan'), show: R('eaw.catalog.read') },
    { id: 'repository', num: '1.1b', label: t('Repository'), group: t('Ringkasan'), show: R('eaw.catalog.read') },
    { id: 'proses', num: '1.2', label: t('D1 · Proses Bisnis'), group: t('6 Domain SAORAJA'), show: R('eaw.model.read') },
    { id: 'data', num: '1.3', label: t('D2 · Data & Informasi'), group: t('6 Domain SAORAJA'), show: R('eaw.model.read') },
    { id: 'layanan', num: '1.4', label: t('D3 · Layanan Enterprise'), group: t('6 Domain SAORAJA'), show: R('eaw.model.read') },
    { id: 'aplikasi', num: '1.5', label: t('D4 · Aplikasi & Integrasi'), group: t('6 Domain SAORAJA'), show: R('eaw.catalog.read') },
    { id: 'infra', num: '1.6', label: t('D5 · Infrastruktur'), group: t('6 Domain SAORAJA'), show: R('eaw.model.read') },
    { id: 'keamanan', num: '1.7', label: t('D6 · Keamanan Informasi'), group: t('6 Domain SAORAJA'), show: R('eaw.model.read') },
    { id: 'kanvas', num: 'EAW-01', label: t('Kanvas ArchiMate 3.2'), group: t('Pemodelan'), show: R('eaw.model.read') },
    { id: 'lineage', num: 'EAW-03', label: t('Lineage & Impact'), group: t('Pemodelan'), show: R('eaw.model.read') },
    { id: 'kerangka', num: 'EAW-05', label: t('Framework Builder'), group: t('Pemodelan'), show: R('eaw.model.read') },
    { id: 'kra', num: 'EAW-06', label: t('KRA Manager'), group: t('Pemodelan'), show: R('eaw.reference.read') },
    { id: 'arb', num: '1.8', label: t('ARB Clearance'), group: t('Tata Kelola'), show: R('gov.arb.read') },
    { id: 'roadmap', num: '1.9', label: t('Peta Rencana & Roadmap'), group: t('Tata Kelola'), show: R('eaw.catalog.read') },
    { id: 'adr', num: '1.10', label: t('Architecture Decisions'), group: t('Tata Kelola'), show: R('eaw.adr.read') },
    { id: 'publisher', num: 'EAW-09', label: t('Penerbit Dokumen'), group: t('Tata Kelola'), show: R('eaw.catalog.read') },
  ] },
  { id: 'gse', code: 'GSE', mode: 'MF 2.0', port: 5172, title: t('Generative Software Engineering'), desc: t('Scaffold full-stack → branch + PR (≤ 45 dtk)'), menus: [
    { id: 'proyek', num: '2.1', label: t('Proyek Scaffolding'), group: t('Engine'), show: R('gse.project.read') },
    { id: 'template', num: '2.2', label: t('Template & Blueprint'), group: t('Engine'), show: R('gse.project.read') },
    { id: 'flow', num: '2.3', label: t('Agent & Saga Flow Builder'), group: t('Engine'), show: R('gse.project.read') },
    { id: 'ide', num: '2.4', label: t('Web IDE & Prompt'), group: t('Engine'), show: R('gse.project.read') },
    { id: 'pr', num: '2.5', label: t('Multi-Git PR & Pipeline'), group: t('Engine'), show: R('gse.project.read') },
  ] },
  { id: 'req', code: 'REQ', mode: 'MF 2.0', port: 5173, title: t('Requirement Elicitation Assistant'), desc: t('Elisitasi AI ter-guardrail → User Story + Gherkin'), menus: [
    { id: 'sesi', num: '3.1', label: t('Sesi Elisitasi'), group: t('Asisten'), show: R('req.session.write') },
    { id: 'story', num: '3.2', label: t('User Story & Gherkin'), group: t('Asisten'), show: R('req.session.write') },
    { id: 'ekspor', num: '3.3', label: t('Ekspor Spesifikasi'), group: t('Asisten'), show: R('req.session.write') },
  ] },
  { id: 'console', code: 'CONSOLE', mode: 'MF 2.0', port: 5174, title: t('Enterprise Control Console'), desc: t('IKA, AI register, FinOps, EIO, observability'), menus: [
    { id: 'ika', num: '4.1', label: t('Skor Kematangan IKA'), group: t('Governance'), show: CONSOLE },
    { id: 'ai', num: '4.2', label: t('AI Model & Risk Register'), group: t('Governance'), show: CONSOLE },
    { id: 'finops', num: '4.3', label: t('FinOps Console'), group: t('Governance'), show: R('console.finops.read') },
    { id: 'eio', num: '4.4', label: t('EIO Control Center'), group: t('Operasi'), show: CONSOLE },
    { id: 'obs', num: '4.5', label: t('Observability & SLO'), group: t('Operasi'), show: CONSOLE },
    { id: 'security', num: '4.6', label: t('Security Center'), group: t('Operasi'), show: CONSOLE },
  ] },
  { id: 'set', code: 'SET', mode: 'INTERNAL', port: 5170, title: t('Settings & RBAC'), desc: t('Organisasi, akun (idp_subject), 13 role, audit'), menus: [
    { id: 'org', num: '5.1', label: t('Struktur Organisasi'), group: t('Administrasi'), show: R('eaw.org.read') },
    { id: 'users', num: '5.2', label: t('Akun Pengguna'), group: t('Administrasi'), show: R('set.account.read') },
    { id: 'roles', num: '5.3', label: t('Roles & Permissions'), group: t('Administrasi'), show: R('eaw.org.read') },
    { id: 'api', num: '5.4', label: t('API Client & Secrets'), group: t('Administrasi'), show: R('set.account.read') },
    { id: 'audit', num: '5.5', label: t('Audit Trail'), group: t('Administrasi'), show: R('set.audit.read') },
  ] },
];

export const visibleMenus = (m: ModuleDef) => m.menus.filter((x) => !x.show || x.show());
export const visibleModules = () => MODULES.filter((m) => visibleMenus(m).length);
export const findMenu = (mod: string, menu: string) => {
  const m = MODULES.find((x) => x.id === mod);
  return { module: m, menu: m?.menus.find((x) => x.id === menu) };
};
/** Rute pertama yang boleh dibuka pengguna (akun tanpa peran → Beranda). */
export const firstRoute = () => {
  const m = visibleModules().find((x) => !x.hidden) || visibleModules()[0];
  return m ? `/${m.id}/${visibleMenus(m)[0].id}/` : '/home/overview/';
};
