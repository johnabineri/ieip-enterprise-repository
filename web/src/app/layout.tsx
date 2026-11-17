import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import '../styles/standalone.css';
import '../styles/eap.css';
import '../styles/app.css';

export const metadata: Metadata = {
  title: 'SAORAJA EAP',
  description: 'SAORAJA EAP (Enterprise Architecture Platform) — arsitektur enterprise grup Kalla',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Tema & lipat menu dipasang pada .eap-root segera setelah elemen itu di-parse (sebelum hidrasi) agar tidak berkedip.
const BOOT = `try{var r=document.querySelector('.eap-root');if(r){var t=localStorage.getItem('eap.theme');if(t==='light'||t==='dark')r.setAttribute('data-theme',t);if(localStorage.getItem('eap.nav.collapsed')==='1')r.classList.add('nav-collapsed')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Font mockup (index.html eap/ui). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
        {/* Konfigurasi runtime (window.EAP_CONFIG) — ditimpa kontainer lewat 40-runtime-config.sh; harus dimuat sebelum aplikasi. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/config.js" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </body>
    </html>
  );
}
