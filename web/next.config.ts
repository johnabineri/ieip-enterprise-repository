import type { NextConfig } from 'next';

/* SPA: ekspor statis (out/) yang disajikan nginx (infra/docker/next-ui.Dockerfile). Tanpa server Next di produksi:
   semua data diambil di klien dari CMP API; konfigurasi runtime lewat /config.js (window.CMP_CONFIG). */
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
export default config;
