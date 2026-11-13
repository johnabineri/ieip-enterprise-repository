import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateXML } from 'xmllint-wasm';

/**
 * Validasi XSD Open Group ArchiMate 3.1 Exchange Format (EAW-09) dengan libxml2 versi WebAssembly (xmllint-wasm): tanpa build native,
 * tanpa akses jaringan/berkas di luar sistem berkas memori WASM. Skema = berkas resmi di ./xsd (lihat xsd/NOTICE.md), dimuat sekali.
 * KEAMANAN: dokumen impor HANYA divalidasi setelah lolos parser aman eaw/xml.ts (DOCTYPE/ENTITY ditolak, batas ukuran/kedalaman), jadi
 * libxml2 tidak pernah menerima DTD/entitas; argumen --nonet ditambahkan sebagai lapis kedua. Konkurensi dan waktu dibatasi.
 */
export const XSD_DIR = join(__dirname, 'xsd');
export const XSD_ROOT = 'archimate3_Diagram.xsd';
export const XSD_VERSION = 'ArchiMate 3.1 Exchange Format';
export const XSD_FILES = ['archimate3_Diagram.xsd', 'archimate3_View.xsd', 'archimate3_Model.xsd', 'xml.xsd'] as const;

export interface XsdResult { valid: boolean; schema: string; errors: Array<{ message: string; line?: number }>; truncated?: boolean }

let files: { fileName: string; contents: string }[] | null = null;
const load = () => {
  if (files) return files;
  files = XSD_FILES.map((f) => {
    let contents = readFileSync(join(XSD_DIR, f), 'utf8');
    // impor xml.xsd lewat URL http → salinan lokal (penyesuaian di memori; berkas di disk tetap asli)
    if (f === 'archimate3_Model.xsd') contents = contents.replace('schemaLocation="http://www.w3.org/2001/xml.xsd"', 'schemaLocation="xml.xsd"');
    return { fileName: f, contents };
  });
  return files;
};
/** sha256 berkas skema di disk (dipakai tes untuk memastikan berkas pihak ketiga tidak diubah). */
export const xsdHashes = () => Object.fromEntries(XSD_FILES.map((f) => [f, createHash('sha256').update(readFileSync(join(XSD_DIR, f))).digest('hex')]));

const MAX_ERRORS = 50; const MAX_CONCURRENT = 2; const TIMEOUT_MS = Number(process.env.XSD_TIMEOUT_MS ?? 15000);
let running = 0; const waiters: (() => void)[] = [];
const acquire = async () => { if (running >= MAX_CONCURRENT) await new Promise<void>((ok) => waiters.push(ok)); running++; };
const release = () => { running--; waiters.shift()?.(); };

export class XsdUnavailable extends Error {}

/** Validasi satu dokumen. Melempar XsdUnavailable bila validator gagal berjalan/timeout (bukan berarti dokumen tidak sah). */
export async function validateExchangeXsd(xml: string): Promise<XsdResult> {
  const [root, ...preload] = load();
  await acquire();
  let timer: NodeJS.Timeout | undefined;
  try {
    const run = validateXML({
      xml: { fileName: 'model.xml', contents: xml }, schema: root, preload,
      modifyArguments: (args) => ['--nonet', ...args],
    });
    const out = await Promise.race([run, new Promise<never>((_, no) => { timer = setTimeout(() => no(new XsdUnavailable(`validasi XSD melebihi ${TIMEOUT_MS} ms`)), TIMEOUT_MS); })]);
    const errors = out.errors.slice(0, MAX_ERRORS).map((e) => ({
      // pesan libxml2 memuat nama berkas/elemen bernamespace; ringkas tanpa jalur berkas internal
      message: String(e.message ?? e.rawMessage ?? 'galat XSD').replace(/\{http:\/\/www\.opengroup\.org\/xsd\/archimate\/3\.0\/\}/g, '')
        .replace(/^Schemas (validity|parser) error\s*:\s*/i, '').trim().slice(0, 400),
      line: e.loc?.lineNumber ?? undefined,
    }));
    return { valid: out.valid, schema: `${XSD_VERSION} (${XSD_ROOT})`, errors, ...(out.errors.length > MAX_ERRORS ? { truncated: true } : {}) };
  } catch (e) {
    if (e instanceof XsdUnavailable) throw e;
    throw new XsdUnavailable(`validator XSD gagal: ${(e as Error).message}`.slice(0, 300));
  } finally { if (timer) clearTimeout(timer); release(); }
}
