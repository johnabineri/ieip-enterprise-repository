/** Parser CSV RFC 4180 (kutip ganda, koma/titik koma/tab, baris baru dalam kutip, BOM). Tanpa dependensi. */
export interface Csv { delimiter: string; header: string[]; rows: Array<{ line: number; cells: string[] }> }

export function parseCsv(input: string, maxRows = 5000): Csv {
  const text = input.replace(/^﻿/, '');
  // delimiter: yang terbanyak di baris pertama (di luar kutip)
  const first = (() => { let q = false, out = ''; for (const ch of text) { if (ch === '"') q = !q; if (!q && (ch === '\n' || ch === '\r')) break; if (!q) out += ch; } return out; })();
  const delimiter = [',', ';', '\t'].map((d) => [d, first.split(d).length - 1] as const).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? [',', ';', '\t'].map((d) => [d, first.split(d).length - 1] as const).sort((a, b) => b[1] - a[1])[0][0] : ',';
  const records: Array<{ line: number; cells: string[] }> = [];
  let cell = '', cells: string[] = [], inQ = false, line = 1, start = 1, any = false;
  const endCell = () => { cells.push(cell); cell = ''; };
  const endRow = () => { endCell(); if (any || cells.some((c) => c.trim() !== '')) records.push({ line: start, cells }); cells = []; any = false; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else { cell += ch; if (ch === '\n') line++; }
      continue;
    }
    if (ch === '"' && cell === '') { inQ = true; any = true; }
    else if (ch === delimiter) { endCell(); any = true; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); line++; start = line; }
    else { cell += ch; any = true; }
    if (records.length > maxRows + 1) throw new Error(`CSV melebihi ${maxRows} baris data`);
  }
  if (inQ) throw new Error('CSV tidak valid: tanda kutip tidak ditutup');
  if (cell !== '' || cells.length) endRow();
  if (!records.length) throw new Error('CSV kosong');
  if (records.length - 1 > maxRows) throw new Error(`CSV melebihi ${maxRows} baris data`);
  const header = records[0].cells.map((h) => h.trim());
  return { delimiter, header, rows: records.slice(1) };
}

const esc = (v: string) => (/[",;\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsvLine = (cells: string[]) => cells.map(esc).join(',');
