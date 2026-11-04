import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { ProblemException } from '../common/problem';

/**
 * Render PDF sisi-server dari HTML dokumen terbit memakai Chrome/Edge headless yang SUDAH terpasang (tanpa dependensi npm baru).
 * Lokasi: env PDF_BROWSER, atau deteksi otomatis. Tanpa peramban -> 503 (fail-closed, tidak ada PDF palsu).
 * Keamanan: skrip diblokir oleh CSP dokumen (default-src 'none'; scriptEnabled=false merusak print-to-pdf), DNS dimatikan, profil sementara terpisah, batas waktu, maksimal 2 render bersamaan; HTML sudah di-escape + CSP meta (publisher.ts).
 */
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
export const findBrowser = (): string | null => {
  const env = process.env.PDF_BROWSER;
  if (env) return existsSync(env) ? env : null;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
};

let active = 0;
const MAX = 2;
export async function renderPdf(html: string): Promise<Buffer> {
  const bin = findBrowser();
  if (!bin) throw new ProblemException(503, 'service-unavailable', 'Render PDF tidak tersedia', 'Peramban headless (Chrome/Edge) tidak ditemukan. Atur PDF_BROWSER, atau cetak HTML ke PDF dari peramban.');
  if (active >= MAX) throw new ProblemException(503, 'service-unavailable', 'Render PDF penuh', 'Coba lagi sebentar.');
  active++;
  const dir = await mkdtemp(join(tmpdir(), 'eap-pdf-'));
  try {
    const src = join(dir, 'dok.html'); const out = join(dir, 'dok.pdf');
    await writeFile(src, html, 'utf8');
    await new Promise<void>((resolve, reject) => {
      execFile(bin, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', '--host-resolver-rules=MAP * ~NOTFOUND',
        `--user-data-dir=${join(dir, 'profil')}`, '--no-pdf-header-footer', `--print-to-pdf=${out}`, pathToFileURL(src).href],
        { timeout: Number(process.env.PDF_TIMEOUT_MS || 30000), windowsHide: true }, (err) => (err ? reject(err) : resolve()));
    });
    const pdf = await readFile(out);
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('keluaran bukan PDF');
    return pdf;
  } catch (e: any) {
    if (e instanceof ProblemException) throw e;
    throw new ProblemException(502, 'bad-gateway', 'Render PDF gagal', `${String(e.message || e).slice(0, 200)}`);
  } finally {
    active--;
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
