/* Kelas lencana mockup (styles.css: .b-draf … .b-gold). AF-05 punya warna sendiri (STATUS_CLS di app.js mockup); status lain diturunkan dari nada. */
import { toneFor, type Tone } from './format';

export const STATUS_CLS: Record<string, string> = { Draf: 'b-draf', Divalidasi: 'b-val', Ditetapkan: 'b-tet', Dipublikasi: 'b-pub', Direviu: 'b-rev' };
const TONE_CLS: Record<Tone, string> = { ok: 'b-ok', warn: 'b-warn', bad: 'b-err', info: 'b-info', neutral: '' };

/** Kelas .b-* untuk sebuah nilai status (AF-05, ARB, ADR, lifecycle, aktif/nonaktif, …). */
export const badgeClass = (v: unknown): string => STATUS_CLS[String(v)] || TONE_CLS[toneFor(v)];
