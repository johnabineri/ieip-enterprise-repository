import { BadRequestException } from '@nestjs/common';
import { ProblemException } from './problem';

/** ETag = row_version (SRS 7.1 butir 2). */
export const etagOf = (rowVersion: number) => `"${rowVersion}"`;

/** Membaca If-Match; wajib untuk penulisan. */
export function requireIfMatch(header: string | undefined): number {
  if (!header) throw new ProblemException(428, 'precondition-required', 'Header If-Match diperlukan', 'Sertakan ETag dari GET sebagai If-Match.');
  const m = /^"?(\d+)"?$/.exec(header.trim());
  if (!m) throw new BadRequestException('If-Match harus berupa ETag dari API ini');
  return Number(m[1]);
}

export function assertVersion(expected: number, actual: number) {
  if (expected !== actual) {
    throw new ProblemException(412, 'precondition-failed', 'Data sudah berubah', `row_version sekarang ${actual}, If-Match ${expected}.`);
  }
}

/** Kursor buram berbasis kode bisnis (urutan stabil, unik). */
export const encodeCursor = (code: string) => Buffer.from(code, 'utf8').toString('base64url');
export function decodeCursor(c?: string): string | null {
  if (!c) return null;
  try { return Buffer.from(c, 'base64url').toString('utf8'); } catch { throw new BadRequestException('cursor tidak valid'); }
}

export function pageLimit(raw: unknown, max = 100, def = 25): number {
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new BadRequestException('limit harus bilangan bulat positif');
  return Math.min(n, max);
}

export function paged<T extends { code: string }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const data = more ? rows.slice(0, limit) : rows;
  return { data, next_cursor: more ? encodeCursor(data[data.length - 1].code) : null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidOr400(v: string, name = 'id'): string {
  if (!UUID.test(v)) throw new BadRequestException(`${name} bukan UUID`);
  return v;
}

/** Kursor keyset (nilai urut, id) untuk daftar yang diurut bukan menurut kode unik. */
export const encodeKeyset = (a: unknown, b: unknown) => Buffer.from(JSON.stringify([a, b]), 'utf8').toString('base64url');
export function decodeKeyset(c?: string): [string, string] | null {
  if (!c) return null;
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (Array.isArray(v) && v.length === 2) return [String(v[0]), String(v[1])];
  } catch { /* jatuh ke galat di bawah */ }
  throw new BadRequestException('cursor tidak valid');
}
