// Pasca-build (output: 'export'): Next 16 menulis berkas segmen RSC sebagai folder bersarang
//   <rute>/__next.$d$module/$d$menu/__PAGE__.txt
// tetapi prefetch klien memintanya dengan nama datar
//   <rute>/__next.$d$module.$d$menu.__PAGE__.txt
// sehingga server statis (nginx/serve) membalas 404 untuk setiap tautan menu. Skrip ini menyalin tiap berkas
// bersarang ke nama datarnya (salinan bersarang dibiarkan). Idempoten.
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = new URL('../out', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (!existsSync(OUT)) { console.error('flatten-rsc: folder out/ tidak ada — jalankan next build dulu'); process.exit(1); }

let n = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith('__next.')) flatten(dir, p);
    else walk(p);
  }
}
function flatten(routeDir, segDir) {
  const files = [];
  const collect = (d) => readdirSync(d).forEach((x) => { const p = join(d, x); statSync(p).isDirectory() ? collect(p) : files.push(p); });
  collect(segDir);
  for (const f of files) {
    const flat = join(routeDir, relative(routeDir, f).split(sep).join('.'));
    if (!existsSync(flat)) { copyFileSync(f, flat); n++; }
  }
}
walk(OUT);
console.log(`flatten-rsc: ${n} berkas segmen RSC disalin ke nama datar`);
