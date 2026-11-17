// Pemeriksa kamus i18n: semua teks t('…') di src/ harus punya entri di src/lib/i18n-en.ts (bawaan UI = English); entri tak terpakai dilaporkan.
//   node scripts/i18n-check.mjs            → gagal (exit 1) bila ada kunci tanpa terjemahan
//   node scripts/i18n-check.mjs --seed <i18n-en.ts lain>  → cetak entri kamus lain yang kuncinya dipakai di sini (untuk menyalin terjemahan yang sama)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !p.endsWith('i18n-en.ts') && files.push(p); } })(ROOT);

// t('…') / t("…") / t(`…`) dengan argumen pertama literal string (escape \' \" \\ didukung)
const RE = /\bt\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
const used = new Set();
for (const f of files) { const src = readFileSync(f, 'utf8'); let m; while ((m = RE.exec(src))) used.add(unescape(m[1] ?? m[2] ?? m[3])); }

const parseDict = (path) => {
  const src = readFileSync(path, 'utf8'); const out = new Map();
  const R = /^\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")\s*:\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")\s*,?\s*(?:\/\/.*)?$/gm;
  let m; while ((m = R.exec(src))) out.set(unescape(m[1] ?? m[2]), unescape(m[3] ?? m[4]));
  return out;
};

const seedIdx = process.argv.indexOf('--seed');
if (seedIdx > 0) {
  const other = parseDict(process.argv[seedIdx + 1]); const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  const have = parseDict(join(ROOT, 'lib/i18n-en.ts'));
  const lines = [...used].filter((k) => other.has(k) && !have.has(k)).sort().map((k) => `  ${q(k)}: ${q(other.get(k))},`);
  console.log(lines.join('\n')); console.error(`seed: ${lines.length} entri dari kamus lain`); process.exit(0);
}

const dict = parseDict(join(ROOT, 'lib/i18n-en.ts'));
if (process.argv.includes('--prune')) {   // membuang entri tak terpakai dan mengurutkan ulang berkas kamus
  const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  const keep = [...dict.keys()].filter((k) => used.has(k)).sort((a, b) => a.localeCompare(b));
  const head = readFileSync(join(ROOT, 'lib/i18n-en.ts'), 'utf8').split('export const EN')[0];
  writeFileSync(join(ROOT, 'lib/i18n-en.ts'), `${head}export const EN: Record<string, string> = {\n${keep.map((k) => `  ${q(k)}: ${q(dict.get(k))},`).join('\n')}\n};\n`);
  console.log(`prune: ${dict.size - keep.length} entri dibuang, ${keep.length} tersisa`); process.exit(0);
}
const missing = [...used].filter((k) => !dict.has(k) && /[A-Za-z]/.test(k)).sort();
const unused = [...dict.keys()].filter((k) => !used.has(k)).sort();
console.log(`i18n: ${used.size} teks dipakai, ${dict.size} entri kamus`);
if (unused.length) console.log(`  tak terpakai (${unused.length}): ${unused.slice(0, 5).join(' | ')}${unused.length > 5 ? ' …' : ''}`);
if (missing.length) { console.log(`  TANPA terjemahan (${missing.length}):`); missing.forEach((k) => console.log('   - ' + k)); process.exit(1); }
console.log('  OK');
