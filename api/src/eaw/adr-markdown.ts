import { createHash } from 'crypto';

/**
 * Render deterministik ADR -> berkas Markdown di repositori (EAW-04). Isi yang sama SELALU menghasilkan byte yang sama (sha256 stabil), sehingga
 * publikasi ulang tanpa perubahan dapat dideteksi. Front matter YAML memakai string berkutip JSON (aman untuk titik dua/kutip di judul).
 */
export interface AdrDoc {
  code: string; title: string; status: string; context: string; decision: string; consequences: string | null;
  createdAt: string | Date; supersededByCode: string | null; links: Array<{ type: string; label: string }>;
}
const TYPE_LABEL: Record<string, string> = { application: 'Aplikasi', reference: 'KRA', framework: 'Kerangka Kerja', process: 'Proses', data_entity: 'Entitas Data', service: 'Layanan', infra_asset: 'Infrastruktur', control: 'Kontrol' };
const q = (s: string) => JSON.stringify(s);
const day = (d: string | Date) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();

export function adrFilePath(dir: string, code: string) { return `${dir.replace(/^\/+|\/+$/g, '')}/${code}.md`; }

export function adrMarkdown(a: AdrDoc): string {
  const links = [...a.links].sort((x, y) => x.type.localeCompare(y.type) || x.label.localeCompare(y.label));
  const lines = [
    '---', `adr: ${q(a.code)}`, `judul: ${q(a.title)}`, `status: ${q(a.status)}`, `tanggal: ${q(day(a.createdAt))}`,
    ...(a.supersededByCode ? [`digantikan_oleh: ${q(a.supersededByCode)}`] : []),
    ...(links.length ? ['tautan_model:', ...links.map((l) => `  - ${q(`${TYPE_LABEL[l.type] ?? l.type}: ${l.label}`)}`)] : []),
    '---', '', `# ${a.code} — ${a.title}`, '',
    `**Status:** ${a.status}${a.supersededByCode ? ` (digantikan oleh ${a.supersededByCode})` : ''}`, '',
    '## Konteks', '', norm(a.context), '',
    '## Keputusan', '', norm(a.decision), '',
    ...(a.consequences && norm(a.consequences) ? ['## Konsekuensi', '', norm(a.consequences), ''] : []),
    ...(links.length ? ['## Elemen model tertaut', '', ...links.map((l) => `- ${TYPE_LABEL[l.type] ?? l.type}: ${l.label}`), ''] : []),
    '---', '_Dihasilkan otomatis oleh SAORAJA EAP dari register ADR (EAW-04). Ubah lewat EAP, bukan langsung di berkas ini._', '',
  ];
  return lines.join('\n');
}
export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
